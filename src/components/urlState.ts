import { STAT_KEYS, type StatKey } from "@/lib/statKeys";
import type { Filters, SeasonType, SortBy } from "@/lib/buildSearchQuery";

export type UiState = {
  filters: Filters;
  seasonType: SeasonType;
  sort: { by: SortBy; dir: "asc" | "desc" };
  page: number;
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
  const pageNum = Number(sp.get("page") ?? "1");
  return {
    filters,
    seasonType,
    sort,
    page: Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1,
  };
}
