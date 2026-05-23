import { z } from "zod";

const constraintsShape = {
  game: z.string().min(1),
  count: z.number().int().min(1).max(20),
  evenMin: z.number().int().min(0),
  evenMax: z.number().int().min(0).max(6),
  sumMin: z.number().int().min(1),
  sumMax: z.number().int().min(1),
  avoidLastN: z.number().int().min(0).max(100),
  includeMas: z.boolean(),
  includeSuperMas: z.boolean(),
  drawDay: z.enum(["auto", "wednesday", "saturday"]),
  target: z.enum(["balanced", "base", "mas", "supermas", "jackpot"]),
  seed: z.string().optional().nullable()
};

const constraintsObjectSchema = z.object(constraintsShape);

export const constraintsSchema = constraintsObjectSchema.refine((data) => data.evenMin <= data.evenMax, {
  message: "evenMin must be <= evenMax",
  path: ["evenMin"]
}).refine((data) => data.sumMin <= data.sumMax, {
  message: "sumMin must be <= sumMax",
  path: ["sumMin"]
}).refine((data) => data.evenMax <= 6, {
  message: "evenMax exceeds 6",
  path: ["evenMax"]
});

export const backtestSchema = z.object({
  constraints: constraintsSchema,
  trainingWindow: z.number().int().min(10).max(500).optional()
});

export const suggestionRequestSchema = constraintsObjectSchema.extend({
  minHistoricalScore: z.number().min(0).max(100).nullable().optional()
}).refine((data) => data.evenMin <= data.evenMax, {
  message: "evenMin must be <= evenMax",
  path: ["evenMin"]
}).refine((data) => data.sumMin <= data.sumMax, {
  message: "sumMin must be <= sumMax",
  path: ["sumMin"]
}).refine((data) => data.evenMax <= 6, {
  message: "evenMax exceeds 6",
  path: ["evenMax"]
});

export const drawSchema = z.object({
  date: z.string().min(1),
  game: z.string().min(1),
  numbers: z.array(z.number().int()).min(1)
});

export const resultsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export const importLeidsaSchema = z.object({
  gameKey: z.string().min(1).optional(),
  gameKeys: z.array(z.string().min(1)).optional(),
  game: z.string().min(1).optional(),
  months: z.number().int().min(1).max(24).optional()
}).refine((data) => data.gameKey || (data.gameKeys && data.gameKeys.length > 0), {
  message: "gameKey or gameKeys is required",
  path: ["gameKey"]
});

export const deleteResultSchema = z.object({
  id: z.string().min(1)
});
