// Incremental ingest of the current season, run in-process from /api/ingest.
//
// Historical backfills still belong to scripts/ingest.py — it's the one that
// walks 1946-47 forward. This module only ever touches the current season, and
// only from the last game date it already has, so a nightly run is ~2 API calls.

import { getWriteDb } from "./db";
import {
  fetchLeagueGameLog,
  SEASON_TYPES,
  type GameLogRow,
  type SeasonType,
} from "./nbaStats";

const INSERT_SQL = `
INSERT OR REPLACE INTO performances (
  game_id, player_id, player_name, team_id, team_abbr, opponent_abbr, home,
  game_date, season, season_type, win, min,
  pts, reb, ast, stl, blk, tov, pf,
  fgm, fga, fg3m, fg3a, ftm, fta,
  fg_pct, fg3_pct, ft_pct,
  oreb, dreb, plus_minus
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`;

/**
 * NBA seasons are "YYYY-YY" and start in October, so before October we're
 * still in (or just past) the season that began the previous calendar year.
 * Same rule as all_seasons() in scripts/ingest.py.
 */
export function currentSeason(now: Date = new Date()): string {
  const startYear = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function safeInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The API has returned both "2026-04-12" and "2026-04-12T00:00:00" here over time. */
function normalizeGameDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const iso = v.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const us = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  return null;
}

/** Parse e.g. "LAL vs. BOS" or "LAL @ BOS" into [opponent, homeFlag]. */
function parseMatchup(matchup: unknown): [string | null, 0 | 1 | null] {
  if (typeof matchup !== "string" || !matchup) return [null, null];
  const parts = matchup.split(/\s+/);
  if (parts.length < 3) return [null, null];
  return [parts[parts.length - 1], matchup.includes(" vs") ? 1 : 0];
}

function rowToTuple(row: GameLogRow, season: string, seasonType: string): unknown[] | null {
  const gameDate = normalizeGameDate(row.GAME_DATE);
  const gameId = row.GAME_ID;
  const playerId = safeInt(row.PLAYER_ID);
  // PK columns are NOT NULL; a row missing any of them is unusable.
  if (!gameDate || gameId === null || gameId === undefined || playerId === null) return null;

  const [opp, home] = parseMatchup(row.MATCHUP);
  const wl = row.WL;
  const win = wl === "W" ? 1 : wl === "L" ? 0 : null;

  return [
    String(gameId),
    playerId,
    row.PLAYER_NAME ?? "",
    safeInt(row.TEAM_ID),
    row.TEAM_ABBREVIATION ?? "",
    opp,
    home,
    gameDate,
    season,
    seasonType,
    win,
    safeFloat(row.MIN),
    safeInt(row.PTS),
    safeInt(row.REB),
    safeInt(row.AST),
    safeInt(row.STL),
    safeInt(row.BLK),
    safeInt(row.TOV),
    safeInt(row.PF),
    safeInt(row.FGM),
    safeInt(row.FGA),
    safeInt(row.FG3M),
    safeInt(row.FG3A),
    safeInt(row.FTM),
    safeInt(row.FTA),
    safeFloat(row.FG_PCT),
    safeFloat(row.FG3_PCT),
    safeFloat(row.FT_PCT),
    safeInt(row.OREB),
    safeInt(row.DREB),
    safeFloat(row.PLUS_MINUS),
  ];
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PairResult = {
  season: string;
  seasonType: SeasonType;
  /** null means we pulled the whole season (nothing stored for this pair yet). */
  dateFrom: string | null;
  fetched: number;
  /** Rows now in the DB for this pair, after the upsert. */
  total: number;
};

export type IngestResult = {
  season: string;
  lookbackDays: number;
  pairs: PairResult[];
  durationMs: number;
};

export type IngestOptions = {
  season?: string;
  /**
   * How far before the newest stored game to re-request. The overlap is free
   * (INSERT OR REPLACE on the (game_id, player_id) PK) and absorbs late-posted
   * box scores and stat corrections.
   */
  lookbackDays?: number;
  /** Ignore stored state and re-pull the season in full. */
  full?: boolean;
};

async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const started = Date.now();
  const season = opts.season ?? currentSeason();
  const lookbackDays = opts.lookbackDays ?? 3;
  const db = getWriteDb();

  const maxDateStmt = db.prepare<[string, string], { d: string | null }>(
    "SELECT MAX(game_date) AS d FROM performances WHERE season = ? AND season_type = ?",
  );
  const countStmt = db.prepare<[string, string], { n: number }>(
    "SELECT COUNT(*) AS n FROM performances WHERE season = ? AND season_type = ?",
  );
  const insert = db.prepare(INSERT_SQL);
  const markState = db.prepare(
    "INSERT OR REPLACE INTO _ingest_state(season, season_type, rows, completed_at) " +
      "VALUES (?,?,?, datetime('now'))",
  );

  const pairs: PairResult[] = [];
  for (const seasonType of SEASON_TYPES) {
    const maxDate = opts.full ? null : (maxDateStmt.get(season, seasonType)?.d ?? null);
    const dateFrom = maxDate ? shiftDays(maxDate, -lookbackDays) : null;

    const raw = await fetchLeagueGameLog({ season, seasonType, dateFrom: dateFrom ?? undefined });
    const tuples = raw
      .map((r) => rowToTuple(r, season, seasonType))
      .filter((t): t is unknown[] => t !== null);

    // One transaction per pair: either the whole pull lands or none of it does.
    db.transaction(() => {
      for (const t of tuples) insert.run(...t);
      // _ingest_state.rows is the pair's full row count (what the Python
      // backfill records), not just this delta.
      markState.run(season, seasonType, countStmt.get(season, seasonType)?.n ?? 0);
    })();

    pairs.push({
      season,
      seasonType,
      dateFrom,
      fetched: tuples.length,
      total: countStmt.get(season, seasonType)?.n ?? 0,
    });
  }

  return { season, lookbackDays, pairs, durationMs: Date.now() - started };
}

// A single Fly machine serves this app, so an in-process guard is enough to
// keep an overlapping trigger (retry, double-fired cron) from stampeding
// stats.nba.com. Concurrent callers await the run already in flight.
let inFlight: Promise<IngestResult> | null = null;

export function isIngestRunning(): boolean {
  return inFlight !== null;
}

export function ingestCurrentSeason(opts: IngestOptions = {}): Promise<IngestResult> {
  if (inFlight) return inFlight;
  inFlight = runIngest(opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function readIngestState(): Array<{
  season: string;
  season_type: string;
  rows: number;
  completed_at: string;
}> {
  return getWriteDb()
    .prepare(
      "SELECT season, season_type, rows, completed_at FROM _ingest_state " +
        "ORDER BY season DESC, season_type LIMIT 10",
    )
    .all() as Array<{ season: string; season_type: string; rows: number; completed_at: string }>;
}
