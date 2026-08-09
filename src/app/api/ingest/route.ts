import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ingestCurrentSeason,
  isIngestRunning,
  readIngestState,
  currentSeason,
} from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    season: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "season must look like 2026-27")
      .optional(),
    lookbackDays: z.number().int().min(0).max(60).optional(),
    full: z.boolean().optional(),
  })
  .strict();

function authorize(req: Request): NextResponse | null {
  const secret = process.env.STATLINE_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STATLINE_INGEST_SECRET is not configured" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, so length is checked separately.
  // It leaks only the secret's length, which is not the secret.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** Status only — what the DB currently holds. Cheap enough to poll. */
export async function GET(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  try {
    return NextResponse.json({
      currentSeason: currentSeason(),
      running: isIngestRunning(),
      state: readIngestState(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "database unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const denied = authorize(req);
  if (denied) return denied;

  // An empty body is the normal nightly case.
  const text = await req.text();
  let parsedBody: unknown = {};
  if (text.trim()) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
  }

  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await ingestCurrentSeason(parsed.data);
    const inserted = result.pairs.reduce((n, p) => n + p.fetched, 0);
    console.log(
      `[ingest] ${result.season}: upserted ${inserted} rows in ${result.durationMs}ms`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    console.error(`[ingest] failed: ${message}`);
    // 502: the usual cause is stats.nba.com refusing or timing out on us.
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
