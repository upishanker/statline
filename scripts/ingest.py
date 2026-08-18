"""
Ingest NBA player game logs into data/statline.db.

One LeagueGameLog call per (season, season_type) returns one row per
(player, game). We iterate seasons from 1946-47 to the current season,
sleeping ~1.5s between calls to stay polite with stats.nba.com.

Resumable: a _ingest_state table tracks which (season, season_type) pairs
have been completed. Re-running picks up where it left off.

Usage:
  python scripts/ingest.py                              # full historical
  python scripts/ingest.py --seasons 2023-24 2024-25    # just these
  python scripts/ingest.py --from 2020-21               # this season onward
  python scripts/ingest.py --reset-season 2024-25       # re-pull a season
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

# nba_api is an optional dev dependency; import lazily so --help works without it.
def _import_nba():
    from nba_api.stats.endpoints import leaguegamelog  # type: ignore
    return leaguegamelog


REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "data" / "statline.db"

SEASON_TYPES = ["Regular Season", "Playoffs"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS performances (
  game_id        TEXT NOT NULL,
  player_id      INTEGER NOT NULL,
  player_name    TEXT NOT NULL,
  team_id        INTEGER NOT NULL,
  team_abbr      TEXT NOT NULL,
  opponent_abbr  TEXT,
  home           INTEGER,
  game_date      TEXT NOT NULL,
  season         TEXT NOT NULL,
  season_type    TEXT NOT NULL,
  win            INTEGER,
  min            REAL,
  pts INTEGER, reb INTEGER, ast INTEGER, stl INTEGER, blk INTEGER, tov INTEGER, pf INTEGER,
  fgm INTEGER, fga INTEGER, fg3m INTEGER, fg3a INTEGER, ftm INTEGER, fta INTEGER,
  fg_pct REAL, fg3_pct REAL, ft_pct REAL,
  oreb INTEGER, dreb INTEGER, plus_minus REAL,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pts  ON performances(pts);
CREATE INDEX IF NOT EXISTS idx_reb  ON performances(reb);
CREATE INDEX IF NOT EXISTS idx_ast  ON performances(ast);
CREATE INDEX IF NOT EXISTS idx_date ON performances(game_date);
CREATE INDEX IF NOT EXISTS idx_team ON performances(team_abbr);
CREATE INDEX IF NOT EXISTS idx_season ON performances(season);
CREATE TABLE IF NOT EXISTS _ingest_state (
  season       TEXT NOT NULL,
  season_type  TEXT NOT NULL,
  rows         INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (season, season_type)
);
"""

INSERT_SQL = """
INSERT OR REPLACE INTO performances (
  game_id, player_id, player_name, team_id, team_abbr, opponent_abbr, home,
  game_date, season, season_type, win, min,
  pts, reb, ast, stl, blk, tov, pf,
  fgm, fga, fg3m, fg3a, ftm, fta,
  fg_pct, fg3_pct, ft_pct,
  oreb, dreb, plus_minus
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def all_seasons(start_year: int = 1946, end_year: int | None = None) -> list[str]:
    """List of "YYYY-YY" strings, e.g. "1946-47" through current."""
    if end_year is None:
        # Pick a reasonable upper bound; calls for not-yet-played seasons just return empty.
        from datetime import date
        today = date.today()
        # NBA season "YYYY-YY" starts in October of YYYY. If we're past Sept, assume new season has started.
        end_year = today.year if today.month >= 10 else today.year - 1
    out = []
    for y in range(start_year, end_year + 1):
        out.append(f"{y}-{str(y + 1)[-2:]}")
    return out


def parse_matchup(matchup: str | None) -> tuple[str | None, int | None]:
    """Return (opponent_abbr, home_flag) parsed from e.g. 'LAL vs. BOS' or 'LAL @ BOS'."""
    if not matchup:
        return None, None
    parts = matchup.split()
    if len(parts) < 3:
        return None, None
    opp = parts[-1]
    is_home = " vs" in matchup or " vs." in matchup
    return opp, 1 if is_home else 0


def safe_int(v):
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def safe_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return f
    except (ValueError, TypeError):
        return None


def row_to_tuple(row: dict, season: str, season_type: str) -> tuple:
    opp, home = parse_matchup(row.get("MATCHUP"))
    wl = row.get("WL")
    win = 1 if wl == "W" else (0 if wl == "L" else None)
    # GAME_DATE comes back as "YYYY-MM-DD" string from the API.
    return (
        str(row.get("GAME_ID")),
        safe_int(row.get("PLAYER_ID")),
        row.get("PLAYER_NAME") or "",
        safe_int(row.get("TEAM_ID")),
        row.get("TEAM_ABBREVIATION") or "",
        opp,
        home,
        row.get("GAME_DATE"),
        season,
        season_type,
        win,
        safe_float(row.get("MIN")),
        safe_int(row.get("PTS")),
        safe_int(row.get("REB")),
        safe_int(row.get("AST")),
        safe_int(row.get("STL")),
        safe_int(row.get("BLK")),
        safe_int(row.get("TOV")),
        safe_int(row.get("PF")),
        safe_int(row.get("FGM")),
        safe_int(row.get("FGA")),
        safe_int(row.get("FG3M")),
        safe_int(row.get("FG3A")),
        safe_int(row.get("FTM")),
        safe_int(row.get("FTA")),
        safe_float(row.get("FG_PCT")),
        safe_float(row.get("FG3_PCT")),
        safe_float(row.get("FT_PCT")),
        safe_int(row.get("OREB")),
        safe_int(row.get("DREB")),
        safe_float(row.get("PLUS_MINUS")),
    )


def fetch_with_backoff(leaguegamelog, season: str, season_type: str, max_attempts: int = 5):
    attempt = 0
    delay = 2.0
    while True:
        attempt += 1
        try:
            ep = leaguegamelog.LeagueGameLog(
                season=season,
                season_type_all_star=season_type,
                player_or_team_abbreviation="P",
                timeout=60,
            )
            df = ep.get_data_frames()[0]
            return df
        except Exception as e:  # noqa: BLE001 — stats.nba.com errors are varied
            if attempt >= max_attempts:
                raise
            print(f"  ! error ({e!r}); backing off {delay:.0f}s and retrying ({attempt}/{max_attempts})", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 60.0)


def ingest(con: sqlite3.Connection, seasons: list[str], sleep_s: float, reset: set[str]) -> None:
    leaguegamelog = _import_nba()
    cur = con.cursor()
    # WAL lets the Next.js app keep reading while we write.
    cur.execute("PRAGMA journal_mode = WAL")
    cur.executescript(SCHEMA)
    con.commit()

    done = {(r[0], r[1]) for r in cur.execute("SELECT season, season_type FROM _ingest_state").fetchall()}

    plan: list[tuple[str, str]] = []
    for s in seasons:
        for st in SEASON_TYPES:
            if s in reset:
                pass  # always re-pull
            elif (s, st) in done:
                continue
            plan.append((s, st))

    print(f"Ingest plan: {len(plan)} (season, type) pairs into {DB_PATH}", flush=True)

    for i, (season, st) in enumerate(plan, 1):
        print(f"[{i}/{len(plan)}] {season} — {st} ...", end="", flush=True)
        df = fetch_with_backoff(leaguegamelog, season, st)
        rows = [row_to_tuple(r, season, st) for r in df.to_dict(orient="records")]
        with con:  # transaction
            con.executemany(INSERT_SQL, rows)
            con.execute(
                "INSERT OR REPLACE INTO _ingest_state(season, season_type, rows, completed_at) "
                "VALUES (?,?,?, datetime('now'))",
                (season, st, len(rows)),
            )
        print(f" {len(rows)} rows", flush=True)
        time.sleep(sleep_s)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seasons", nargs="+", help="Specific seasons, e.g. 2023-24 2024-25")
    ap.add_argument("--from", dest="from_season", help="Starting season YYYY-YY")
    ap.add_argument("--reset-season", action="append", default=[], help="Re-pull these seasons even if already done")
    ap.add_argument("--sleep", type=float, default=1.5, help="Seconds between calls (default 1.5)")
    args = ap.parse_args(argv)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    if args.seasons:
        seasons = args.seasons
    else:
        all_s = all_seasons()
        if args.from_season:
            if args.from_season not in all_s:
                print(f"--from season {args.from_season} not recognized", file=sys.stderr)
                return 2
            seasons = all_s[all_s.index(args.from_season):]
        else:
            seasons = all_s

    con = sqlite3.connect(DB_PATH)
    try:
        ingest(con, seasons, sleep_s=args.sleep, reset=set(args.reset_season))
    finally:
        con.close()
    print("Done.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
