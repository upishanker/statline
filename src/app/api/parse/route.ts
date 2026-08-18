import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailableError, parseQuery } from "@/lib/nlQuery";
import { readCache, writeCache } from "@/lib/parseCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ q: z.string().min(1).max(300) }).strict();

// Free tier has a hard daily cap, and the key is shared by everyone hitting the
// site. Both limiters are in-process and reset when the machine sleeps, which is
// fine: they exist to stop one visitor burning the day's quota, not to be exact.
const PER_IP_PER_MINUTE = 8;
// Free tier allows 20 requests/minute for gemini-3.7-flash (measured, not guessed:
// the 429 names `generate_content_free_tier_requests, limit: 20`). Stay under it so
// we shed load ourselves instead of getting a 429 back.
const GLOBAL_PER_MINUTE = 15;
const GLOBAL_PER_DAY = 400;

const ipHits = new Map<string, { count: number; windowStart: number }>();
let minuteCount = 0;
let minuteStart = 0;
let dayCount = 0;
let dayStart = 0;

function ipLimited(ip: string, now: number): boolean {
  const entry = ipHits.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    ipHits.set(ip, { count: 1, windowStart: now });
    if (ipHits.size > 5_000) ipHits.clear(); // crude, but unbounded growth is worse
    return false;
  }
  entry.count += 1;
  return entry.count > PER_IP_PER_MINUTE;
}

function globalExhausted(now: number): boolean {
  if (now - dayStart > 86_400_000) {
    dayStart = now;
    dayCount = 0;
  }
  if (now - minuteStart > 60_000) {
    minuteStart = now;
    minuteCount = 0;
  }
  return dayCount >= GLOBAL_PER_DAY || minuteCount >= GLOBAL_PER_MINUTE;
}

const unavailable = (message: string) =>
  NextResponse.json({ error: message, aiUnavailable: true }, { status: 503 });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "expected { q: string }" }, { status: 400 });
  }
  const { q } = parsedBody.data;

  // Cache first: a hit costs no quota and no rate-limit budget.
  const cached = readCache(q);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const now = Date.now();
  const ip = req.headers.get("fly-client-ip") ?? req.headers.get("x-forwarded-for") ?? "local";
  if (ipLimited(ip, now)) {
    return NextResponse.json(
      { error: "too many searches — give it a moment" },
      { status: 429 },
    );
  }
  if (globalExhausted(now)) {
    return unavailable("AI search has used up today's free quota");
  }

  try {
    dayCount += 1;
    minuteCount += 1;
    const parsed = await parseQuery(q);
    writeCache(q, parsed);
    return NextResponse.json({ ...parsed, cached: false });
  } catch (err) {
    if (err instanceof AiUnavailableError) return unavailable("AI search is unavailable");
    // A malformed or unvalidatable response: better to say so than to guess a filter set.
    return NextResponse.json({ error: "couldn't read that query" }, { status: 422 });
  }
}
