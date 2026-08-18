import { STAT_KEYS, type StatKey } from "@/lib/statKeys";
import type {
  Criteria,
  Filters,
  Outcome,
  SeasonType,
  SortBy,
  Venue,
} from "@/lib/buildSearchQuery";

export type UiState = Criteria & {
  filters: Filters;
  seasonType: SeasonType;
  sort: { by: SortBy; dir: "asc" | "desc" };
  page: number;
};

/** The editable half of UiState: everything except sort and page. */
export type Draft = Criteria & { filters: Filters; seasonType: SeasonType };

export function draftOf(s: UiState): Draft {
  return {
    filters: s.filters,
    seasonType: s.seasonType,
    player: s.player,
    team: s.team,
    opponent: s.opponent,
    outcome: s.outcome,
    venue: s.venue,
    seasonFrom: s.seasonFrom,
    seasonTo: s.seasonTo,
  };
}

export const EMPTY_DRAFT: Draft = {
  filters: {},
  seasonType: "All",
  player: null,
  team: null,
  opponent: null,
  outcome: "All",
  venue: "All",
  seasonFrom: null,
  seasonTo: null,
};

/** Everything a UiState needs beyond the stat ranges, at their defaults. */
export const EMPTY_CRITERIA: Required<Criteria> = {
  player: null,
  team: null,
  opponent: null,
  outcome: "All",
  venue: "All",
  seasonFrom: null,
  seasonTo: null,
};

const ST_TO_PARAM: Record<SeasonType, string> = {
  "Regular Season": "reg",
  Playoffs: "po",
  All: "all",
};
const PARAM_TO_ST: Record<string, SeasonType> = {
  reg: "Regular Season",
  po: "Playoffs",
  all: "All",
};

export function stateToParams(s: UiState): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, range] of Object.entries(s.filters)) {
    if (!range) continue;
    const lo = range.min ?? "";
    const hi = range.max ?? "";
    if (lo === "" && hi === "") continue;
    p.set(k, `${lo}-${hi}`);
  }
  if (s.seasonType !== "All") p.set("st", ST_TO_PARAM[s.seasonType]);
  if (s.player) p.set("player", s.player);
  if (s.team) p.set("tm", s.team);
  if (s.opponent) p.set("opp", s.opponent);
  if (s.outcome && s.outcome !== "All") p.set("res", s.outcome);
  if (s.venue && s.venue !== "All") p.set("venue", s.venue);
  if (s.seasonFrom) p.set("from", s.seasonFrom);
  if (s.seasonTo) p.set("to", s.seasonTo);
  if (!(s.sort.by === "closeness" && s.sort.dir === "asc")) {
    p.set("sort", `${s.sort.by}:${s.sort.dir}`);
  }
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}

export function paramsToState(sp: URLSearchParams): UiState {
  const filters: Filters = {};
  for (const k of STAT_KEYS) {
    const v = sp.get(k);
    if (!v) continue;
    const [loStr, hiStr] = v.split("-");
    const min = loStr === "" || loStr === undefined ? undefined : Number(loStr);
    const max = hiStr === "" || hiStr === undefined ? undefined : Number(hiStr);
    if ((min === undefined || Number.isNaN(min)) && (max === undefined || Number.isNaN(max))) continue;
    filters[k as StatKey] = {
      min: min !== undefined && !Number.isNaN(min) ? min : undefined,
      max: max !== undefined && !Number.isNaN(max) ? max : undefined,
    };
  }
  const stParam = sp.get("st");
  const seasonType: SeasonType = stParam && PARAM_TO_ST[stParam] ? PARAM_TO_ST[stParam] : "All";
  const sortParam = sp.get("sort");
  let sort: { by: SortBy; dir: "asc" | "desc" } = { by: "closeness", dir: "asc" };
  if (sortParam) {
    const [by, dir] = sortParam.split(":");
    if (
      (by === "closeness" || by === "date" || (STAT_KEYS as readonly string[]).includes(by)) &&
      (dir === "asc" || dir === "desc")
    ) {
      sort = { by: by as SortBy, dir };
    }
  }
  const outcomeParam = sp.get("res");
  const outcome: Outcome =
    outcomeParam === "W" || outcomeParam === "L" ? outcomeParam : "All";
  const venueParam = sp.get("venue");
  const venue: Venue =
    venueParam === "home" || venueParam === "away" ? venueParam : "All";
  const seasonRe = /^\d{4}-\d{2}$/;
  const from = sp.get("from");
  const to = sp.get("to");
  const teamParam = sp.get("tm");
  const oppParam = sp.get("opp");
  const abbrRe = /^[A-Za-z]{3}$/;

  const pageNum = Number(sp.get("page") ?? "1");
  return {
    filters,
    seasonType,
    sort,
    player: sp.get("player") || null,
    team: teamParam && abbrRe.test(teamParam) ? teamParam.toUpperCase() : null,
    opponent: oppParam && abbrRe.test(oppParam) ? oppParam.toUpperCase() : null,
    outcome,
    venue,
    seasonFrom: from && seasonRe.test(from) ? from : null,
    seasonTo: to && seasonRe.test(to) ? to : null,
    page: Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1,
  };
}
