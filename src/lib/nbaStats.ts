// Minimal client for the one stats.nba.com endpoint we need.
//
// `nba_api` (used by scripts/ingest.py for historical backfills) is a thin
// wrapper over these same HTTP calls. Porting just the leaguegamelog call
// keeps Python and pandas out of the runtime image for the nightly delta.

const ENDPOINT = "https://stats.nba.com/stats/leaguegamelog";

// stats.nba.com hangs (rather than erroring) if these look unlike a browser.
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Connection: "keep-alive",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

export type GameLogRow = Record<string, string | number | null>;

export type SeasonType = "Regular Season" | "Playoffs";

export const SEASON_TYPES: SeasonType[] = ["Regular Season", "Playoffs"];

type ResultSet = {
  name: string;
  headers: string[];
  rowSet: (string | number | null)[][];
};

/** stats.nba.com wants MM/DD/YYYY; we store and pass around YYYY-MM-DD. */
export function toApiDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchLeagueGameLog(opts: {
  season: string;
  seasonType: SeasonType;
  /** YYYY-MM-DD, inclusive. Omit for the whole season. */
  dateFrom?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}): Promise<GameLogRow[]> {
  // Budget matters: this runs inside a request, so worst case (all attempts
  // time out, plus 2s+4s backoff) must stay under the caller's timeout.
  // 3 x 45s + 6s ≈ 141s per season type.
  const { season, seasonType, dateFrom, timeoutMs = 45_000, maxAttempts = 3 } = opts;

  const params = new URLSearchParams({
    Counter: "1000",
    DateFrom: dateFrom ? toApiDate(dateFrom) : "",
    DateTo: "",
    Direction: "ASC",
    LeagueID: "00",
    PlayerOrTeam: "P",
    Season: season,
    SeasonType: seasonType,
    Sorter: "DATE",
  });
  const url = `${ENDPOINT}?${params.toString()}`;

  let delay = 2_000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`stats.nba.com returned ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as { resultSets?: ResultSet[] };
      const set = json.resultSets?.[0];
      if (!set) throw new Error("stats.nba.com response had no resultSets");
      return set.rowSet.map((row) => {
        const obj: GameLogRow = {};
        set.headers.forEach((h, i) => {
          obj[h] = row[i] ?? null;
        });
        return obj;
      });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
  }
}
