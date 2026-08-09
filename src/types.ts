import type { StatKey } from "./lib/statKeys";

export type Performance = {
  game_id: string;
  player_id: number;
  player_name: string;
  team_id: number;
  team_abbr: string;
  opponent_abbr: string | null;
  home: 0 | 1 | null;
  game_date: string;
  season: string;
  season_type: string;
  win: 0 | 1 | null;
  min: number | null;
} & Partial<Record<StatKey, number | null>>;

export type SearchResponse = {
  rows: Performance[];
  page: number;
  perPage: number;
  total: number | null; // null when unfiltered (count skipped)
  effectiveSort: { by: string; dir: "asc" | "desc" };
};
