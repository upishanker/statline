import { getDb } from "./db";

let _teams: string[] | null = null;

/**
 * Distinct team abbreviations, including defunct franchises (SEA, NJN, VAN…)
 * since the DB goes back to 1946-47. Memoized — the set only changes when a
 * season's worth of games is ingested, and the process restarts far more often
 * than that.
 */
export function getTeams(): string[] {
  if (_teams) return _teams;
  try {
    const rows = getDb()
      .prepare("SELECT DISTINCT team_abbr FROM performances ORDER BY team_abbr")
      .all() as { team_abbr: string }[];
    _teams = rows.map((r) => r.team_abbr).filter(Boolean);
  } catch {
    // No DB yet (fresh checkout before ingest) — the UI falls back to a text input.
    _teams = [];
  }
  return _teams;
}
