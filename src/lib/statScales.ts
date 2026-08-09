import type { StatKey } from "./statKeys";

// Per-stat normalization scale, used for the closeness sort when a filter
// has only one bound (so there's no half-range to normalize against). Chosen
// to be a "typical interesting delta" for each stat — roughly one standard
// deviation among players who actually fill the box score.
export const STAT_SCALES: Record<StatKey, number> = {
  pts: 10,
  reb: 5,
  ast: 5,
  stl: 2,
  blk: 2,
  tov: 2,
  min: 8,
  fgm: 4,
  fga: 6,
  fg3m: 2,
  fg3a: 3,
  ftm: 3,
  fta: 4,
  fg_pct: 0.1,
  fg3_pct: 0.1,
  ft_pct: 0.1,
  plus_minus: 10,
  oreb: 2,
  dreb: 4,
};
