// Persistent cache of natural-language → filter translations.
//
// Queries repeat heavily ("triple double" will be typed thousands of times), and
// on the free tier every cache hit is a request not spent. The table lives in the
// same SQLite file so it survives the Fly machine scaling to zero.

import { getDb, getWriteDb } from "./db";
import type { ParsedQuery } from "./nlQuery";

/** Collapse whitespace and case so trivially different phrasings share an entry. */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function readCache(q: string): ParsedQuery | null {
  try {
    const row = getDb()
      .prepare("SELECT parsed FROM query_cache WHERE q = ?")
      .get(normalizeQuery(q)) as { parsed: string } | undefined;
    return row ? (JSON.parse(row.parsed) as ParsedQuery) : null;
  } catch {
    // A cache miss and a broken cache should look the same to the caller.
    return null;
  }
}

export function writeCache(q: string, parsed: ParsedQuery): void {
  try {
    getWriteDb()
      .prepare(
        "INSERT OR REPLACE INTO query_cache (q, parsed, created_at) VALUES (?, ?, ?)",
      )
      .run(normalizeQuery(q), JSON.stringify(parsed), new Date().toISOString());
  } catch {
    // Never fail a request because the cache write failed.
  }
}
