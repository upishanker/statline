import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buildSearchQuery, type SearchRequest } from "@/lib/buildSearchQuery";
import { STAT_KEYS } from "@/lib/statKeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rangeSchema = z
  .object({
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
  })
  .strict();

const filtersSchema = z.record(z.enum(STAT_KEYS), rangeSchema);

const sortBySchema = z.union([
  z.literal("closeness"),
  z.literal("date"),
  z.enum(STAT_KEYS),
]);

const seasonSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "season must look like 2015-16")
  .nullable()
  .optional();

const bodySchema = z.object({
  filters: filtersSchema.default({}),
  seasonType: z.enum(["Regular Season", "Playoffs", "All"]).default("All"),
  player: z.string().max(60).nullable().optional(),
  team: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
  opponent: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
  outcome: z.enum(["W", "L", "All"]).default("All"),
  venue: z.enum(["home", "away", "All"]).default("All"),
  seasonFrom: seasonSchema,
  seasonTo: seasonSchema,
  sort: z
    .object({
      by: sortBySchema.default("closeness"),
      dir: z.enum(["asc", "desc"]).default("asc"),
    })
    .default({ by: "closeness", dir: "asc" }),
  page: z.number().int().min(1).max(10_000).default(1),
  perPage: z.number().int().min(1).max(100).default(25),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const reqObj = parsed.data as SearchRequest;
  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database unavailable" },
      { status: 503 },
    );
  }

  const built = buildSearchQuery(reqObj);

  try {
    const rows = db.prepare(built.sql).all(...built.params);
    let total: number | null = null;
    if (built.countSql) {
      const r = db.prepare(built.countSql).get(...built.countParams) as { n: number };
      total = r.n;
    }
    return NextResponse.json({
      rows,
      page: reqObj.page,
      perPage: reqObj.perPage,
      total,
      effectiveSort: built.effectiveSort,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "query failed" },
      { status: 500 },
    );
  }
}
