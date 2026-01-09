import * as v from "@valibot/valibot";
import { Application, Router } from "@oak/oak";
import {
  roadSafetyHotspotsSearchParams,
  weatherCellsSearchParams,
} from "./validation.ts";
import { Simulation } from "./simulation.ts";

const app = new Application();
const router = new Router();
const simulation = new Simulation({
  targetCellCount: 50_000,
  snapshotIntervalMs: 900_000,
  seed: Date.now(),
  resolution: 11,
  targetHotspotCount: 50,
});
console.time("generateInitialData");
await simulation.generateInitialData();
console.timeEnd("generateInitialData");
simulation.start();

router.get("/mock/v1/road-safety/hotspots", (ctx) => {
  try {
    const searchParams = v.parse(
      roadSafetyHotspotsSearchParams,
      Object.fromEntries(ctx.request.url.searchParams),
    );

    return ctx.response.with(
      Response.json(
        Object.values(simulation.getHotspotsInBbox(searchParams.bbox)).filter(
          (hotspot) =>
            hotspot.metadata.risk.confidence > searchParams.min_confidence &&
            (searchParams.type
              ? searchParams.type.includes(hotspot.metadata.risk.type)
              : true),
        ),
      ),
    );
  } catch (error) {
    return ctx.response.with(Response.json(error));
  }
});

router.get("/mock/v1/road-safety/snapshot", (ctx) => {
  try {
    return ctx.response.with(
      Response.json(
        Object.values(simulation.getHotspots())
      ),
    );
  } catch (error) {
    return ctx.response.with(Response.json(error));
  }
});

router.get("/mock/v1/weather/snapshot", (ctx) => {
  console.time("getSnapshot");
  const snapshot = Object.values(simulation.getSnapshot());
  console.timeEnd("getSnapshot");
  console.log("length:", snapshot.length);
  return ctx.response.with(Response.json(snapshot));
});

router.get("/mock/v1/weather/cells", (ctx) => {
  try {
    const searchParams = v.parse(
      weatherCellsSearchParams,
      Object.fromEntries(ctx.request.url.searchParams),
    );

    if (searchParams.h3_indexes) {
      const cells = searchParams.h3_indexes.map((h3Index: string) =>
        simulation.getCell(h3Index, { includeStatistics: true })
      ).filter(Boolean);
      return ctx.response.with(Response.json(cells));
    }

    if (searchParams.bbox) {
      return ctx.response.with(
        Response.json(simulation.getSnapshotInBbox(searchParams.bbox)),
      );
    }

    throw { error: "must include either bbox or h3_indexes" };
  } catch (error) {
    return ctx.response.with(Response.json(error));
  }
});

router.get("/(.*)", (ctx) => {
  try {
    return ctx.response.with(Response.json({
      online: true,
      routes: [...router].map((route) => route.path),
    }));
  } catch (error) {
    return ctx.response.with(Response.json(error));
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const handleGracefulExit = () => {
  console.log("handle graceful exit");
  simulation.stop();
};
Deno.addSignalListener("SIGINT", handleGracefulExit);
Deno.addSignalListener("SIGBREAK", handleGracefulExit);

app.addEventListener("listen", (ctx) => {
  const { addr } = ctx.listener;
  const port = addr.port;
  const hostname = addr.hostname === "0.0.0.0" ? "localhost" : addr.hostname;
  const protocol = ctx.secure ? "https" : "http";
  console.log(`listening on: ${protocol}://${hostname}:${port}`);
  // console.log({ ...ctx });
});

await app.listen({ port: 3000 });
