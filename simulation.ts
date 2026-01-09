import * as h3 from "h3-js";
import { cities, highways } from "./data.ts";
import type {
  BoundingBox,
  Cell,
  CellStatistics,
  H3Index,
  RainIntensity,
  RiskHotspot,
  RoadCondition,
  SimulationOptions,
} from "./types.ts";

export class Simulation {
  readonly targetCellCount: number;
  readonly targetHotspotCount: number; // New property
  readonly snapshotIntervalMs: number;
  readonly resolution: number;

  #seed: number;
  #rngState: number;

  // accumulate raw events during the 15-min window
  #rawAgg = new Map<string, {
    sumTemp: number;
    count: number;
    lastTs: number;
    sumConfidence: number;
    sumCounts: number;
    fogVotes: number;
    crossWindVotes: number;
    rainScore: number;
    roadScore: number;
  }>();

  // current 15-min snapshot (replaced atomically at interval)
  #snapshot = new Map<string, Cell>();

  // New storage for generated risk hotspots
  #hotspots = new Map<string, RiskHotspot>();

  // optional long-term statistics store (created on demand)
  #stats = new Map<string, CellStatistics>();

  // timers
  #rawTimerId?: number;
  #snapshotTimerId?: number;

  static #BOUNDS = {
    minLat: 48.55,
    maxLat: 51.06,
    minLng: 12.09,
    maxLng: 18.87,
  };
  #cellLocations: Array<{ lat: number; lng: number; h3: H3Index }> = [];

  constructor(opts?: SimulationOptions) {
    const {
      targetCellCount = 250_000,
      targetHotspotCount = 5_000, // Default hotspot count
      snapshotIntervalMs = 15 * 60 * 1000,
      seed = Math.floor(Math.random() * 2 ** 31),
      resolution = 9,
    } = opts ?? {};
    this.targetCellCount = targetCellCount;
    this.targetHotspotCount = targetHotspotCount;
    this.snapshotIntervalMs = snapshotIntervalMs;
    this.resolution = resolution;
    this.#seed = seed >>> 0;
    this.#rngState = this.#seed;
  }

  /** Create initial baseline: populates cells and hotspots. */
  async generateInitialData() {
    await this.generateInitialCells();
    await this.generateInitialHotspots();
  }

  /** Create initial baseline: populates #cellLocations, initial snapshot and seeds #rawAgg.
   * After this call, live events will only be accumulated in #rawAgg until the first snapshot swap. */
  async generateInitialCells(forceCount?: number) {
    const count = forceCount ?? this.targetCellCount;

    // Helper: sample from normal distribution using Box-Muller on seeded uniform generator r()
    function normal(r: () => number, mean = 0, std = 1) {
      // Box-Muller transform
      const u1 = r() || 1e-9;
      const u2 = r() || 1e-9;
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z0 * std;
    }

    // Helper: pick a city weighted by weight using random r()
    function pickCity(r: () => number) {
      const total = cities.reduce((s, c) => s + c.weight, 0);
      let v = r() * total;
      for (const c of cities) {
        if (v <= c.weight) return c;
        v -= c.weight;
      }
      return cities[0];
    }

    // Helper: pick a point along a polyline (list of [lat,lng]) using r()
    function sampleAlongPolyline(
      poly: Array<[number, number]>,
      r: () => number,
    ) {
      // compute segment lengths (approx euclidean in lat/lng space — sufficient here)
      const segLengths: number[] = [];
      let total = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i], b = poly[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.sqrt(dx * dx + dy * dy);
        segLengths.push(L);
        total += L;
      }
      let t = r() * total;
      for (let i = 0; i < segLengths.length; i++) {
        if (t <= segLengths[i]) {
          const a = poly[i], b = poly[i + 1];
          const frac = t / segLengths[i];
          const lat = a[0] + (b[0] - a[0]) * frac;
          const lng = a[1] + (b[1] - a[1]) * frac;
          // Calculate heading
          const heading =
            (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360;
          return { lat, lng, heading };
        }
        t -= segLengths[i];
      }
      // fallback last point
      const last = poly[poly.length - 1];
      const prev = poly[poly.length - 2];
      const heading =
        (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180 / Math.PI +
          360) % 360;
      return { lat: last[0], lng: last[1], heading };
    }

    // Sampling probabilities (tunable)
    const P_CITY = 0.50; // chance to place near a city
    const P_OUTSKIRTS = 0.75; // chance to place near a city
    const P_HIGHWAY = 0.80; // chance to place along a highway
    const P_ROADS = 0.92; // chance to place along a highway
    // remaining probability places uniform background noise

    this.#cellLocations = new Array(count).fill(null).map((_, i) => {
      const r = this.#seededRand(i ^ this.#seed);
      let lat: number;
      let lng: number;

      const choice = r();
      if (choice < P_CITY) {
        const city = pickCity(r);
        lat = normal(r, city.lat, city.sigma);
        lng = normal(r, city.lng, city.sigma * 2);
      } else if (choice < P_OUTSKIRTS) {
        const city = pickCity(r);
        lat = normal(r, city.lat, city.sigma * 5);
        lng = normal(r, city.lng, city.sigma * 2 * 5);
      } else if (choice < P_HIGHWAY) {
        const hIdx = Math.floor(r() * highways.length);
        const poly = highways[hIdx];
        const base = sampleAlongPolyline(poly, r);
        lat = normal(r, base.lat, 0.01);
        lng = normal(r, base.lng, 0.01);
      } else if (choice < P_ROADS) {
        const hIdx = Math.floor(r() * highways.length);
        const poly = highways[hIdx];
        const base = sampleAlongPolyline(poly, r);
        lat = normal(r, base.lat, 0.05);
        lng = normal(r, base.lng, 0.05);
      } else {
        const city = pickCity(r);
        lat = normal(r, city.lat, city.sigma * 10);
        lng = normal(r, city.lng, city.sigma * 2 * 10);
      }

      const h3Index = this.#h3IndexFromLatLng(lat, lng, this.resolution);
      return { lat, lng, h3: h3Index };
    });

    const now = Date.now();
    for (let i = 0; i < this.#cellLocations.length; i++) {
      const loc = this.#cellLocations[i];
      const env = this.#generateEnvironmentForLocation(
        loc.lat,
        loc.lng,
        now,
        i,
      );
      const cell: Cell = {
        location: { h3_index: loc.h3 },
        timeframe: { last: new Date(now).toISOString() },
        metadata: {
          confidence: Math.floor(70 + this.#randUniform(i) * 30),
          total_count: Math.max(
            1,
            Math.floor(1 + this.#randUniform(i + 1) * 200),
          ),
        },
        environment: env,
      };
      // initial snapshot baseline
      this.#snapshot.set(loc.h3, cell);

      // seed rawAgg as if one event arrived at time now (but subsequent live events will only affect rawAgg)
      this.#rawAgg.set(loc.h3, {
        sumTemp: env.temperature,
        count: 1,
        lastTs: now,
        sumConfidence: cell.metadata.confidence,
        sumCounts: cell.metadata.total_count,
        fogVotes: env.conditions.fog ? 1 : 0,
        crossWindVotes: env.conditions.cross_wind ? 1 : 0,
        rainScore: this.#rainIntensityToScore(env.conditions.rain_intensity),
        roadScore: this.#roadConditionToScore(env.conditions.road_condition),
      });
    }
  }

  /** Generate initial set of road risk hotspots. */
  async generateInitialHotspots(forceCount?: number) {
    const count = forceCount ?? this.targetHotspotCount;
    this.#hotspots.clear();

    function sampleAlongPolyline(
      poly: Array<[number, number]>,
      r: () => number,
    ) {
      const segLengths: number[] = [];
      let total = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i], b = poly[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.sqrt(dx * dx + dy * dy);
        segLengths.push(L);
        total += L;
      }
      let t = r() * total;
      for (let i = 0; i < segLengths.length; i++) {
        if (t <= segLengths[i]) {
          const a = poly[i], b = poly[i + 1];
          const frac = t / segLengths[i];
          const lat = a[0] + (b[0] - a[0]) * frac;
          const lng = a[1] + (b[1] - a[1]) * frac;
          const heading =
            (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360;
          return { lat, lng, heading };
        }
        t -= segLengths[i];
      }
      const last = poly[poly.length - 1];
      const prev = poly[poly.length - 2];
      const heading =
        (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180 / Math.PI +
          360) % 360;
      return { lat: last[0], lng: last[1], heading };
    }

    const RISK_TYPES = ['BDV', 'VA', 'GW', 'HL', 'SR', 'FOG', 'HR', 'EB', 'CW', 'PH', 'BUM'];

    for (let i = 0; i < count; i++) {
      const r = this.#seededRand(i ^ this.#seed ^ 0xABCDEF);

      // Place hotspots primarily along highways
      const hIdx = Math.floor(r() * highways.length);
      const poly = highways[hIdx];
      const base = sampleAlongPolyline(poly, r);

      const lat = base.lat + (r() - 0.5) * 0.001;
      const lng = base.lng + (r() - 0.5) * 0.001;

      const total_count = 5 + Math.floor(r() ** 3 * 500);
      const now = Date.now();
      const lastTs = now - Math.floor(r() * 30 * 24 * 3600 * 1000); // within last 30 days
      const firstTs = lastTs - Math.floor((30 + r() * 300) * 24 * 3600 * 1000); // up to a year ago

      const weather_impact = 1 + Math.floor(r() * 5);
      const time_of_day_impact = 1 + Math.floor(r() * 5);

      // Generate environmental conditions based on weather impact
      const dry_road_count = Math.floor(
        total_count * (weather_impact <= 2 ? 0.8 : 0.3) * r(),
      );
      const wet_road_count = Math.floor(
        total_count * (weather_impact >= 3 ? 0.7 : 0.2) * r(),
      );
      const rain_count = Math.floor(
        wet_road_count * (weather_impact >= 3 ? 0.8 : 0.3) * r(),
      );
      const slippery_road_count = Math.floor(
        total_count * (weather_impact >= 4 ? 0.5 : 0.1) * r(),
      );
      const fog_count = Math.floor(
        total_count * (weather_impact >= 4 ? 0.3 : 0.05) * r(),
      );
      const crosswind_count = Math.floor(total_count * 0.1 * r());

      const hotspot: RiskHotspot = {
        location: {
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          std_dev: 5 + r() * 25,
        },
        metadata: {
					id: crypto.randomUUID(),
          risk: {
            type: RISK_TYPES[Math.floor(r() * RISK_TYPES.length)],
            importance: 1 + Math.floor(r() * 5),
            confidence: 50 + Math.floor(r() * 50),
            residual_confidence: 10 + Math.floor(r() * 80),
          },
          total_count,
          weather_impact,
          time_of_day_impact,
        },
        timeframe: {
          first: new Date(firstTs).toISOString(),
          last: new Date(lastTs).toISOString(),
        },
        vehicle: {
          heading: {
            avg: Math.round(base.heading + (r() - 0.5) * 10),
            std_dev: 2 + r() * 15,
          },
        },
        environment: {
          air_temperature: { avg: -5 + r() * 25, std_dev: 1 + r() * 5 },
          sun_position: { avg: r() * 360, std_dev: 10 + r() * 40 },
          conditions: {
            dry_road: { is_present: dry_road_count > 0, count: dry_road_count },
            wet_road: { is_present: wet_road_count > 0, count: wet_road_count },
            rain: { is_present: rain_count > 0, count: rain_count },
            slippery_road: {
              is_present: slippery_road_count > 0,
              count: slippery_road_count,
            },
            fog: { is_present: fog_count > 0, count: fog_count },
            crosswind: {
              is_present: crosswind_count > 0,
              count: crosswind_count,
            },
          },
        },
        statistics: this.#generateHotspotStatistics(
          r,
          total_count,
          time_of_day_impact,
        ),
      };

      const id = `${hotspot.location.latitude.toFixed(5)}_${
        hotspot.location.longitude.toFixed(5)
      }`;
      this.#hotspots.set(id, hotspot);
    }
  }

  /** Begin producing raw events (accumulation only) and swap snapshot only on interval. */
  start() {
    if (this.#rawTimerId) return;
    // produce random raw events in background (they only touch #rawAgg)
    this.#rawTimerId = setInterval(() => {
      const batchSize = Math.max(
        1,
        Math.floor(Math.sqrt(this.targetCellCount) / 50),
      );
      for (let k = 0; k < batchSize; k++) this.#produceRandomRawEvent();
    }, 200) as unknown as number;

    // snapshot timer replaces the entire snapshot in one pass using current #rawAgg,
    // then clears #rawAgg for the next interval.
    this.#snapshotTimerId = setInterval(() => {
      this.#applyRawAggToSnapshotBatch();
    }, this.snapshotIntervalMs) as unknown as number;
  }

  stop() {
    if (this.#rawTimerId) {
      clearInterval(this.#rawTimerId);
      this.#rawTimerId = undefined;
    }
    if (this.#snapshotTimerId) {
      clearInterval(this.#snapshotTimerId);
      this.#snapshotTimerId = undefined;
    }
  }

  /** Read-only copy of current weather snapshot (safe to return over network). */
  getSnapshot(): Record<string, Cell> {
    const out: Record<string, Cell> = {};
    for (const [k, v] of this.#snapshot.entries()) out[k] = structuredClone(v);
    return out;
  }

  /** Read-only copy of generated hotspots. */
  getHotspots(): Record<string, RiskHotspot> {
    const out: Record<string, RiskHotspot> = {};
    for (const [k, v] of this.#hotspots.entries()) out[k] = structuredClone(v);
    return out;
  }

  getCell(
    h3Index: H3Index,
    opts?: { includeStatistics?: boolean },
  ): (Cell & { statistics?: CellStatistics }) | undefined {
    const cell = this.#snapshot.get(h3Index);
    if (!cell) return undefined;
    if (!opts?.includeStatistics) return { ...structuredClone(cell) };
    let stats = this.#stats.get(h3Index);
    if (!stats) {
      stats = this.#generateInitialStatisticsForCell(cell);
      this.#stats.set(h3Index, stats);
    }
    return { ...structuredClone(cell), statistics: structuredClone(stats) };
  }

  /** External injection: adds raw event to the accumulator (does not touch snapshot). */
  pushRawEvent(
    h3Index: H3Index,
    event: {
      temperature: number;
      confidence?: number;
      count?: number;
      fog?: boolean;
      cross_wind?: boolean;
      rain_intensity?: RainIntensity;
      road_condition?: RoadCondition;
      timestamp?: number;
    },
  ) {
    const ts = event.timestamp ?? Date.now();
    const bucket = this.#rawAgg.get(h3Index) ??
      {
        sumTemp: 0,
        count: 0,
        lastTs: 0,
        sumConfidence: 0,
        sumCounts: 0,
        fogVotes: 0,
        crossWindVotes: 0,
        rainScore: 0,
        roadScore: 0,
      };
    bucket.sumTemp += event.temperature;
    bucket.count += 1;
    bucket.lastTs = Math.max(bucket.lastTs, ts);
    bucket.sumConfidence += event.confidence ?? 80;
    bucket.sumCounts += event.count ?? 1;
    bucket.fogVotes += event.fog ? 1 : 0;
    bucket.crossWindVotes += event.cross_wind ? 1 : 0;
    bucket.rainScore += this.#rainIntensityToScore(
      event.rain_intensity ?? "NONE",
    );
    bucket.roadScore += this.#roadConditionToScore(
      event.road_condition ?? "DRY",
    );
    this.#rawAgg.set(h3Index, bucket);
  }

  addOrMergeStatistics(h3Index: H3Index, stats: Partial<CellStatistics>) {
    const prev = this.#stats.get(h3Index) ??
      this.#generateInitialStatisticsPlaceholder();
    this.#stats.set(h3Index, this.#mergeStatistics(prev, stats));
  }

  /* ========== PRIVATE HELPERS ========== */

  // Apply the entire #rawAgg into a new snapshot in one pass, then clear #rawAgg.
  #applyRawAggToSnapshotBatch() {
    const newSnapshot = new Map<string, Cell>();
    const now = Date.now();

    for (const [h3index, agg] of this.#rawAgg.entries()) {
      const avgTemp = agg.sumTemp / Math.max(1, agg.count);
      const confidence = Math.max(
        0,
        Math.min(100, Math.round(agg.sumConfidence / Math.max(1, agg.count))),
      );
      const total_count = Math.max(1, Math.round(agg.sumCounts));

      const averageRainScore = agg.rainScore / Math.max(1, agg.count);
      let rainIntensity: RainIntensity = "NONE";
      if (averageRainScore >= 3.0) rainIntensity = "HIGH";
      else if (averageRainScore >= 1.2) rainIntensity = "MEDIUM";
      else if (averageRainScore >= 0.6) rainIntensity = "LOW";

      const avgRoad = agg.roadScore / Math.max(1, agg.count);
      let roadCondition: RoadCondition = "DRY";
      if (avgRoad >= 2.5) roadCondition = "SLIPPERY_ICE";
      else if (avgRoad >= 1.8) roadCondition = "SLIPPERY";
      else if (avgRoad >= 0.8) roadCondition = "WET";

      const fog = agg.fogVotes / Math.max(1, agg.count) >= 0.5;
      const crossWind = agg.crossWindVotes / Math.max(1, agg.count) >= 0.2;

      // Build cell from aggregated raw events only (cells with no events won't be in newSnapshot)
      const cell: Cell = {
        location: { h3_index: h3index },
        timeframe: { last: new Date(agg.lastTs || now).toISOString() },
        metadata: { confidence, total_count },
        environment: {
          temperature: Math.round(avgTemp * 10) / 10,
          // keep previous is_night if available, else approximate from current time
          is_night: this.#snapshot.get(h3index)?.environment.is_night ??
            ((new Date().getUTCHours() + 1) % 24 < 6),
          conditions: {
            rain_intensity: rainIntensity,
            road_condition: roadCondition,
            fog,
            cross_wind: crossWind,
          },
        },
      };

      newSnapshot.set(h3index, cell);
    }

    // Atomically replace snapshot
    this.#snapshot = newSnapshot;

    // Clear accumulated events so next interval starts fresh
    this.#rawAgg.clear();
  }

  #seededRand(seed: number) {
    return () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  #randUniform(seedOffset = 0): number {
    this.#rngState = (this.#rngState + 0x9E3779B97F4A7C15) >>> 0;
    let t = Math.imul(this.#rngState ^ seedOffset, 0x85EBCA6B);
    t ^= t >>> 13;
    return ((t >>> 0) % 1000000) / 1000000;
  }

  // real H3 call
  #h3IndexFromLatLng(lat: number, lng: number, res: number) {
    try {
      const idx = h3.latLngToCell(lat, lng, res);
      if (typeof idx === "string") return idx;
      return h3.latLngToCell(lat, lng, res);
    } catch (err) {
      throw new Error(
        "h3.latLngToCell failed. Ensure h3-js is available. " + String(err),
      );
    }
  }

  #generateEnvironmentForLocation(
    lat: number,
    lng: number,
    timestampMs: number,
    rngSeed = 0,
  ) {
    const t = new Date(timestampMs);
    const doy = this.#dayOfYear(t);
    const latFactor = (lat - Simulation.#BOUNDS.minLat) /
      (Simulation.#BOUNDS.maxLat - Simulation.#BOUNDS.minLat);
    const seasonal = Math.sin(2 * Math.PI * (doy / 365)) * 12;
    const baseline = 6 - (latFactor * 3);
    const noise = (this.#randUniform(rngSeed) - 0.5) * 4;
    const temperature = Math.round((baseline + seasonal + noise) * 10) / 10;
    const localHour = (t.getUTCHours() + 1) % 24;
    const isNight = localHour < 6 || localHour >= 21;
    const rainChanceBase = 0.15 + (0.1 * Math.max(0, seasonal / 12));
    const rainRoll = this.#randUniform(rngSeed + 1);
    let rainIntensity: RainIntensity = "NONE";
    if (rainRoll < rainChanceBase * 0.7) rainIntensity = "LOW";
    else if (rainRoll < rainChanceBase * 0.9) rainIntensity = "MEDIUM";
    else if (rainRoll < rainChanceBase * 1.0) rainIntensity = "HIGH";
    let roadCondition: RoadCondition = "DRY";
    if (rainIntensity === "MEDIUM" || rainIntensity === "HIGH") {
      roadCondition = temperature <= 0 ? "SLIPPERY" : "WET";
      if (temperature <= -5) roadCondition = "SLIPPERY_ICE";
      if (rainIntensity === "HIGH" && temperature > 0) {
        roadCondition = "SLIPPERY_WET";
      }
    } else {
      if (temperature <= -8) roadCondition = "SLIPPERY_ICE";
      else roadCondition = "DRY";
    }
    const fog =
      (isNight && temperature < 6 && this.#randUniform(rngSeed + 2) < 0.08) ||
      (this.#randUniform(rngSeed + 3) < 0.01);
    const crossWind = this.#randUniform(rngSeed + 4) < 0.05;
    return {
      temperature,
      is_night: isNight,
      conditions: {
        rain_intensity: rainIntensity,
        road_condition: roadCondition,
        fog,
        cross_wind: crossWind,
      },
    };
  }

  #generateHotspotStatistics(
    r: () => number,
    total_count: number,
    time_impact: number,
  ) {
    const by_week: Record<number, number> = {};
    const by_day: Record<string, number> = {
      Mo: 0,
      Tu: 0,
      We: 0,
      Th: 0,
      Fr: 0,
      Sa: 0,
      Su: 0,
    };
    const by_time: Record<string, number> = {};

    // Time distribution
    for (let i = 0; i < 48; i++) {
      const hour = Math.floor(i / 2);
      const minute = (i % 2) * 30;
      const timeStr = `${String(hour).padStart(2, "0")}:${
        String(minute).padStart(2, "0")
      }`;
      by_time[timeStr] = 0;
    }

    let remaining = total_count;
    while (remaining > 0) {
      // Week
      const week = 1 + Math.floor(r() * 52);
      by_week[week] = (by_week[week] ?? 0) + 1;

      // Day of week (more on weekdays)
      const dayRoll = r();
      const dayIdx = dayRoll < 0.7
        ? Math.floor(r() * 5)
        : 5 + Math.floor(r() * 2);
      const day = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][dayIdx];
      by_day[day]++;

      // Time of day (peaks at rush hour if impactful)
      const timeRoll = r();
      let hour = 0;
      if (time_impact >= 3 && timeRoll < 0.6) { // Rush hour
        hour = r() < 0.5 ? 7 + Math.floor(r() * 2) : 16 + Math.floor(r() * 3);
      } else if (time_impact >= 4 && timeRoll < 0.8) { // Night time
        hour = 22 + Math.floor(r() * 6);
        if (hour >= 24) hour -= 24;
      } else { // random
        hour = Math.floor(r() * 24);
      }
      const minute = r() < 0.5 ? 0 : 30;
      const timeStr = `${String(hour).padStart(2, "0")}:${
        String(minute).padStart(2, "0")
      }`;
      by_time[timeStr]++;

      remaining--;
    }

    return { distribution: { by_week, by_day, by_time } };
  }

  #dayOfYear(d: Date) {
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
    return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  #rainIntensityToScore(r: RainIntensity) {
    switch (r) {
      case "NONE":
        return 0;
      case "LOW":
        return 1;
      case "MEDIUM":
        return 2;
      case "HIGH":
        return 4;
      default:
        return 0;
    }
  }
  #roadConditionToScore(r: RoadCondition) {
    switch (r) {
      case "DRY":
        return 0;
      case "WET":
        return 1;
      case "SLIPPERY":
        return 2;
      case "SLIPPERY_ICE":
        return 3;
      case "SLIPPERY_WET":
        return 2;
      default:
        return 0;
    }
  }

  #produceRandomRawEvent() {
    if (this.#cellLocations.length === 0) return;
    const idx = Math.floor(this.#randUniform() * this.#cellLocations.length);
    const loc = this.#cellLocations[idx];
    const now = Date.now();
    const base = this.#snapshot.get(loc.h3);
    const seed = idx ^ (now % 100000);
    let temp = base
      ? base.environment.temperature
      : (5 + this.#randUniform(seed) * 15);
    temp += (this.#randUniform(seed + 1) - 0.5) * 0.6;
    const fog = this.#randUniform(seed + 2) < 0.01;
    const crossWind = this.#randUniform(seed + 3) < 0.02;
    const heavy = this.#randUniform(seed + 4) < 0.002;
    const rainRoll = this.#randUniform(seed + 5);
    const rain = heavy
      ? (rainRoll < 0.7 ? "HIGH" : "MEDIUM")
      : (rainRoll < 0.02 ? "LOW" : "NONE");
    this.pushRawEvent(loc.h3, {
      temperature: Math.round(temp * 10) / 10,
      confidence: Math.floor(60 + this.#randUniform(seed + 6) * 40),
      count: 1,
      fog,
      cross_wind: crossWind,
      rain_intensity: rain as RainIntensity,
      road_condition: (rain !== "NONE"
        ? (temp <= 0 ? "SLIPPERY" : "WET")
        : (temp <= -8 ? "SLIPPERY_ICE" : "DRY")) as RoadCondition,
      timestamp: now,
    });
  }

  #generateInitialStatisticsPlaceholder(): CellStatistics {
    return {
      temperature: { lowest: null, highest: null },
      day_counts: {
        rain: { low: 0, medium: 0, high: 0 },
        slippery_road: 0,
        fog: 0,
        cross_wind: 0,
      },
    };
  }

  #generateInitialStatisticsForCell(cell: Cell): CellStatistics {
    const t = cell.environment.temperature;
    const lowestVal = Math.round((t - (5 + this.#randUniform() * 15)) * 10) /
      10;
    const highestVal = Math.round((t + (10 + this.#randUniform() * 15)) * 10) /
      10;
    const now = Date.now();
    const lowestTs = new Date(
      now - Math.floor(this.#randUniform() * 365) * 24 * 3600 * 1000,
    );
    const highestTs = new Date(
      now - Math.floor(this.#randUniform() * 200) * 24 * 3600 * 1000,
    );
    const baseDays = Math.max(1, Math.round(cell.metadata.total_count / 10));
    const rainLow = Math.round(
      baseDays * Math.min(1, this.#randUniform() * 0.6),
    );
    const rainMed = Math.round(
      baseDays * Math.min(1, this.#randUniform() * 0.3),
    );
    const rainHigh = Math.round(
      baseDays * Math.min(1, this.#randUniform() * 0.05),
    );
    const slippery = Math.round(
      baseDays * (t <= 0 ? 0.4 : 0.05) * this.#randUniform(),
    );
    const fog = Math.round(
      baseDays * (cell.environment.conditions.fog ? 0.6 : 0.05) *
        this.#randUniform(),
    );
    const crossWind = Math.round(baseDays * 0.1 * this.#randUniform());
    return {
      temperature: {
        lowest: { value: lowestVal, timestamp: lowestTs.toISOString() },
        highest: { value: highestVal, timestamp: highestTs.toISOString() },
      },
      day_counts: {
        rain: { low: rainLow, medium: rainMed, high: rainHigh },
        slippery_road: slippery,
        fog,
        cross_wind: crossWind,
      },
    };
  }

  #mergeStatistics(
    prev: CellStatistics,
    update: Partial<CellStatistics>,
  ): CellStatistics {
    return {
      temperature: {
        lowest: update.temperature?.lowest ?? prev.temperature.lowest,
        highest: update.temperature?.highest ?? prev.temperature.highest,
      },
      day_counts: {
        rain: {
          low: update.day_counts?.rain?.low ?? prev.day_counts.rain.low,
          medium: update.day_counts?.rain?.medium ??
            prev.day_counts.rain.medium,
          high: update.day_counts?.rain?.high ?? prev.day_counts.rain.high,
        },
        slippery_road: update.day_counts?.slippery_road ??
          prev.day_counts.slippery_road,
        fog: update.day_counts?.fog ?? prev.day_counts.fog,
        cross_wind: update.day_counts?.cross_wind ?? prev.day_counts.cross_wind,
      },
    };
  }

  /**
   * NEW: Filters and returns weather cells within a given bounding box.
   * @param bbox - The bounding box as [minLng, minLat, maxLng, maxLat].
   * @returns A record of cells within the bounding box.
   */
  getSnapshotInBbox(bbox: BoundingBox): Record<string, Cell> {
    if (!bbox || bbox.length !== 4) {
      throw new Error(
        "Invalid bounding box provided. Must be an array of [minLng, minLat, maxLng, maxLat].",
      );
    }
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const out: Record<string, Cell> = {};

    for (const [h3Index, cell] of this.#snapshot.entries()) {
      const [lat, lng] = h3.cellToLatLng(h3Index);
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        out[h3Index] = structuredClone(cell);
      }
    }
    return out;
  }

  /**
   * NEW: Filters and returns risk hotspots within a given bounding box.
   * @param bbox - The bounding box as [minLng, minLat, maxLng, maxLat].
   * @returns A record of hotspots within the bounding box.
   */
  getHotspotsInBbox(bbox: BoundingBox): Record<string, RiskHotspot> {
    if (!bbox || bbox.length !== 4) {
      throw new Error(
        "Invalid bounding box provided. Must be an array of [minLng, minLat, maxLng, maxLat].",
      );
    }
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const out: Record<string, RiskHotspot> = {};

    for (const [id, hotspot] of this.#hotspots.entries()) {
      const { latitude: lat, longitude: lng } = hotspot.location;
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        out[id] = structuredClone(hotspot);
      }
    }
    return out;
  }
}
