export type BoundingBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
export type H3Index = string;
export type RainIntensity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNRECOGNIZED";
export type RoadCondition =
  | "DRY"
  | "WET"
  | "SLIPPERY"
  | "SLIPPERY_ICE"
  | "SLIPPERY_WET"
  | "UNRECOGNIZED";

export type Cell = {
  location: { h3_index: H3Index };
  timeframe: { last: string };
  metadata: { confidence: number; total_count: number };
  environment: {
    temperature: number;
    is_night: boolean;
    conditions: {
      rain_intensity: RainIntensity;
      road_condition: RoadCondition;
      fog: boolean;
      cross_wind: boolean;
    };
  };
  statistics?: CellStatistics;
};

export type CellStatistics = {
  temperature: {
    lowest: { value: number; timestamp: string } | null;
    highest: { value: number; timestamp: string } | null;
  };
  day_counts: {
    rain: { low: number; medium: number; high: number };
    slippery_road: number;
    fog: number;
    cross_wind: number;
  };
};

export type RiskHotspot = {
  location: {
    latitude: number;
    longitude: number;
    std_dev: number;
  };
  metadata: {
    risk: {
      type: string;
      importance: number;
      confidence: number;
      residual_confidence: number;
    };
    total_count: number;
    weather_impact: number;
    time_of_day_impact: number;
  };
  timeframe: {
    first: string;
    last: string;
  };
  vehicle: {
    heading: {
      avg: number;
      std_dev: number;
    };
  };
  environment: {
    air_temperature: {
      avg: number;
      std_dev: number;
    };
    sun_position: {
      avg: number;
      std_dev: number;
    };
    conditions: {
      dry_road: {
        is_present: boolean;
        count: number;
      };
      wet_road: {
        is_present: boolean;
        count: number;
      };
      rain: {
        is_present: boolean;
        count: number;
      };
      slippery_road: {
        is_present: boolean;
        count: number;
      };
      fog: {
        is_present: boolean;
        count: number;
      };
      crosswind: {
        is_present: boolean;
        count: number;
      };
    };
  };
  statistics: {
    distribution: {
      by_week: Record<number, number>;
      by_day: Record<string, number>;
      by_time: Record<string, number>;
    };
  };
};

export type SimulationOptions = {
  targetCellCount?: number;
  targetHotspotCount?: number; // New option for hotspots
  snapshotIntervalMs?: number;
  seed?: number;
  resolution?: number;
};
