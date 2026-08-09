export const STAT_KEYS = [
  "pts", "reb", "ast", "stl", "blk", "tov", "min",
  "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
  "fg_pct", "fg3_pct", "ft_pct", "plus_minus",
  "oreb", "dreb",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  tov: "TOV",
  min: "MIN",
  fgm: "FGM",
  fga: "FGA",
  fg3m: "3PM",
  fg3a: "3PA",
  ftm: "FTM",
  fta: "FTA",
  fg_pct: "FG%",
  fg3_pct: "3P%",
  ft_pct: "FT%",
  plus_minus: "+/-",
  oreb: "OREB",
  dreb: "DREB",
};

export const PRIMARY_STATS: StatKey[] = [
  "pts", "reb", "ast", "stl", "blk",
];

export const EXTRA_STATS: StatKey[] = [
  "tov", "min", "fg_pct", "fg3_pct", "ft_pct", "plus_minus",
  "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb",
];

// All stats that can be used as a sort key (closeness/date are added separately in the UI).
export const SORTABLE_STATS: StatKey[] = [
  "pts", "reb", "ast", "stl", "blk", "tov", "min",
  "fg_pct", "fg3_pct", "ft_pct", "plus_minus",
];

// Stats stored as 0-1 fractions in the DB but entered as percentages in the UI.
export const PERCENT_STATS = new Set<StatKey>(["fg_pct", "fg3_pct", "ft_pct"]);

// Slider bounds in *raw DB units* (percents are 0–1). Chosen to comfortably
// cover historical NBA single-game extremes (e.g. Wilt's 100/55).
export const SLIDER_BOUNDS: Record<StatKey, { min: number; max: number; step: number }> = {
  pts:        { min: 0,   max: 100, step: 1 },
  reb:        { min: 0,   max: 55,  step: 1 },
  ast:        { min: 0,   max: 30,  step: 1 },
  stl:        { min: 0,   max: 15,  step: 1 },
  blk:        { min: 0,   max: 20,  step: 1 },
  tov:        { min: 0,   max: 15,  step: 1 },
  min:        { min: 0,   max: 65,  step: 1 },
  fgm:        { min: 0,   max: 40,  step: 1 },
  fga:        { min: 0,   max: 65,  step: 1 },
  fg3m:       { min: 0,   max: 15,  step: 1 },
  fg3a:       { min: 0,   max: 30,  step: 1 },
  ftm:        { min: 0,   max: 30,  step: 1 },
  fta:        { min: 0,   max: 40,  step: 1 },
  fg_pct:     { min: 0,   max: 1,   step: 0.01 },
  fg3_pct:    { min: 0,   max: 1,   step: 0.01 },
  ft_pct:     { min: 0,   max: 1,   step: 0.01 },
  plus_minus: { min: -60, max: 60,  step: 1 },
  oreb:       { min: 0,   max: 20,  step: 1 },
  dreb:       { min: 0,   max: 25,  step: 1 },
};
