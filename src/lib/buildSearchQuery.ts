import { STAT_KEYS, type StatKey } from "./statKeys";
import { STAT_SCALES } from "./statScales";

export type Range = { min?: number | null; max?: number | null };
export type Filters = Partial<Record<StatKey, Range>>;
export type SeasonType = "Regular Season" | "Playoffs" | "All";
export type SortBy = "closeness" | "date" | StatKey;
export type Outcome = "W" | "L" | "All";
export type Venue = "home" | "away" | "All";

/**
 * Non-stat filters. Separate from `filters` because these are equality/range
 * predicates on descriptive columns rather than box-score ranges — the closeness
 * sort ignores them entirely.
 */
export type Criteria = {
  player?: string | null;
  team?: string | null;
  opponent?: string | null;
  outcome?: Outcome;
  venue?: Venue;
  seasonFrom?: string | null;
  seasonTo?: string | null;
};

export type SearchRequest = Criteria & {
  filters: Filters;
  seasonType: SeasonType;
  sort: { by: SortBy; dir: "asc" | "desc" };
  page: number;
  perPage: number;
};

export type BuiltQuery = {
  sql: string;
  countSql: string | null; // null when we skip the count (unfiltered queries)
  params: (string | number)[];
  countParams: (string | number)[];
  effectiveSort: { by: SortBy; dir: "asc" | "desc" };
};

const SELECT_COLS = [
  "game_id", "player_id", "player_name", "team_id", "team_abbr", "opponent_abbr",
  "home", "game_date", "season", "season_type", "win", "min",
  "pts", "reb", "ast", "stl", "blk", "tov", "pf",
  "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
  "fg_pct", "fg3_pct", "ft_pct",
  "oreb", "dreb", "plus_minus",
].join(", ");

function isStatKey(k: string): k is StatKey {
  return (STAT_KEYS as readonly string[]).includes(k);
}

/** Escape LIKE wildcards so a name containing % or _ matches literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function cleanStr(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function buildSearchQuery(req: SearchRequest): BuiltQuery {
  const where: string[] = [];
  const whereParams: (string | number)[] = [];
  const filteredStats: { key: StatKey; range: Range }[] = [];

  for (const [k, range] of Object.entries(req.filters)) {
    if (!isStatKey(k) || !range) continue;
    const hasMin = range.min !== undefined && range.min !== null && !Number.isNaN(range.min);
    const hasMax = range.max !== undefined && range.max !== null && !Number.isNaN(range.max);
    if (!hasMin && !hasMax) continue;
    if (hasMin && hasMax) {
      where.push(`${k} BETWEEN ? AND ?`);
      whereParams.push(range.min as number, range.max as number);
    } else if (hasMin) {
      where.push(`${k} >= ?`);
      whereParams.push(range.min as number);
    } else if (hasMax) {
      where.push(`${k} <= ?`);
      whereParams.push(range.max as number);
    }
    filteredStats.push({ key: k, range });
  }

  if (req.seasonType !== "All") {
    where.push("season_type = ?");
    whereParams.push(req.seasonType);
  }

  // Non-stat predicates. Each is skipped when absent, so an unset field costs nothing.
  const player = cleanStr(req.player);
  if (player) {
    where.push("player_name LIKE ? ESCAPE '\\'");
    whereParams.push(`%${escapeLike(player)}%`);
  }

  const team = cleanStr(req.team);
  if (team) {
    where.push("team_abbr = ?");
    whereParams.push(team.toUpperCase());
  }

  const opponent = cleanStr(req.opponent);
  if (opponent) {
    where.push("opponent_abbr = ?");
    whereParams.push(opponent.toUpperCase());
  }

  if (req.outcome === "W" || req.outcome === "L") {
    where.push("win = ?");
    whereParams.push(req.outcome === "W" ? 1 : 0);
  }

  if (req.venue === "home" || req.venue === "away") {
    where.push("home = ?");
    whereParams.push(req.venue === "home" ? 1 : 0);
  }

  // Seasons are "YYYY-YY", so lexicographic compare is chronological
  // ("1999-00" < "2000-01") — no parsing needed.
  const seasonFrom = cleanStr(req.seasonFrom);
  if (seasonFrom) {
    where.push("season >= ?");
    whereParams.push(seasonFrom);
  }
  const seasonTo = cleanStr(req.seasonTo);
  if (seasonTo) {
    where.push("season <= ?");
    whereParams.push(seasonTo);
  }

  // Any predicate at all means the COUNT is worth running; only a completely
  // unfiltered query skips it (counting all 1.5M rows tells the user nothing).
  const hasAnyFilter = where.length > 0;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Choose sort. Closeness only works if at least one stat range is given.
  let effective: { by: SortBy; dir: "asc" | "desc" } = req.sort;
  let orderSql: string;
  const orderParams: (string | number)[] = [];

  if (effective.by === "closeness" && filteredStats.length === 0) {
    effective = { by: "date", dir: "desc" };
  }

  if (effective.by === "closeness") {
    const terms: string[] = [];
    for (const { key, range } of filteredStats) {
      const hasMin = range.min !== undefined && range.min !== null;
      const hasMax = range.max !== undefined && range.max !== null;
      let midpoint: number;
      let scale: number;
      if (hasMin && hasMax) {
        midpoint = ((range.min as number) + (range.max as number)) / 2;
        scale = Math.max(((range.max as number) - (range.min as number)) / 2, 1e-9);
      } else if (hasMin) {
        midpoint = range.min as number;
        scale = STAT_SCALES[key];
      } else {
        midpoint = range.max as number;
        scale = STAT_SCALES[key];
      }
      terms.push(`ABS(${key} - ?) / ?`);
      orderParams.push(midpoint, scale);
    }
    const dir = effective.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";
    orderSql = `ORDER BY (${terms.join(" + ")}) ${dir}, game_date DESC, game_id`;
  } else if (effective.by === "date") {
    const dir = effective.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";
    orderSql = `ORDER BY game_date ${dir}, game_id`;
  } else {
    // Per-stat sort. effective.by is a StatKey here.
    const col = effective.by;
    const dir = effective.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";
    // Put NULLs last regardless of direction.
    orderSql = `ORDER BY (${col} IS NULL), ${col} ${dir}, game_date DESC, game_id`;
  }

  const offset = Math.max(0, (req.page - 1) * req.perPage);
  const sql =
    `SELECT ${SELECT_COLS} FROM performances ${whereSql} ${orderSql} LIMIT ? OFFSET ?`.trim();
  const params = [...whereParams, ...orderParams, req.perPage, offset];

  const countSql = hasAnyFilter
    ? `SELECT COUNT(*) AS n FROM performances ${whereSql}`
    : null;
  const countParams = hasAnyFilter ? [...whereParams] : [];

  return { sql, countSql, params, countParams, effectiveSort: effective };
}
