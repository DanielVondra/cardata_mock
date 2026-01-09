import * as v from "@valibot/valibot";
import { BoundingBox } from "./types.ts";

// Helper: comma- (or custom-) separated string → array
const stringListSchema = (delimiter = ",") =>
  v.pipe(
    v.string(),
    v.transform<string, Array<string>>((value) =>
      value
        .split(delimiter)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),
  );

// bbox must contain 4 numeric values
const bboxSchema = v.pipe(
  stringListSchema(","),
  v.transform<Array<string>, Array<number>>((arr) => arr.map(Number)),
  v.tuple(
    [v.number(), v.number(), v.number(), v.number()],
    "bbox must contain exactly 4 coordinates",
  ),
  v.check<[number, number, number, number], string>(
    (arr) => arr.every((n) => !isNaN(n)),
    "bbox must contain only valid numbers",
  ),
);

// ---------------------------------------------
// GET /api/v1/road-safety/hotspots
// ---------------------------------------------
export const roadSafetyHotspotsSearchParams = v.object({
  bbox: bboxSchema, // required
  min_confidence: v.optional(
    v.pipe(
      v.string(),
      v.transform<string, number>((val) => Number(val)),
      v.check<number, string>(
        (n) => Number.isInteger(n) && n >= 0 && n <= 100,
        "min_confidence must be an integer between 0 and 100",
      ),
    ),
    "0", // <--- Change the default value to the string '0'
  ),
  type: v.optional(stringListSchema(",")), // e.g. "VA,EB"
});

export type RoadSafetyHotspotsSearchParams = v.InferOutput<
  typeof roadSafetyHotspotsSearchParams
>;

// ---------------------------------------------
// GET /api/v1/weather/cells
// ---------------------------------------------
export const weatherCellsSearchParams = v.pipe(
  v.object({
    bbox: v.optional(bboxSchema),
    h3_indexes: v.optional(stringListSchema(",")),
  }),
  v.check<{ bbox?: BoundingBox; h3_indexes?: Array<string> }, string>(
    (obj) => obj.bbox !== undefined || obj.h3_indexes !== undefined,
    "You must provide either bbox or h3_indexes.",
  ),
);
export type WeatherCellsSearchParams = v.InferOutput<
  typeof weatherCellsSearchParams
>;
