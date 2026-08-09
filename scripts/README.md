# statline ingest

Two paths, deliberately split:

| | what it does | when |
|---|---|---|
| `scripts/ingest.py` (this file) | walks every season from 1946-47 forward | one-time backfill, or re-pulling old seasons |
| `POST /api/ingest` (`src/lib/ingest.ts`) | current season only, from the last game date it already has | nightly, automatically |

The nightly path is a TypeScript port of the same `leaguegamelog` call, so the
runtime image doesn't need Python or pandas. See "Nightly automation" below.

## Historical backfill

One-shot Python script that pulls NBA player game logs from `stats.nba.com`
(via the [`nba_api`](https://github.com/swar/nba_api) wrapper) and writes them
to `data/statline.db`. The Next.js app reads from that SQLite file at runtime;
no live API calls happen during search.

## Run it

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start small to confirm everything works:
python ingest.py --seasons 2023-24 2024-25

# Then the full historical pull (takes hours due to polite 1.5s sleep):
python ingest.py
```

The script is resumable — it tracks completed `(season, season_type)` pairs in
a `_ingest_state` table and skips them on re-runs. Use `--reset-season 2024-25`
to force re-pulling a season (e.g., when the current season has new games).

## Notes

- Older seasons (pre-1979 for 3PT, pre-1973 for OREB/DREB/STL/BLK, etc.) leave
  those columns as `NULL`. Filtering on a stat that didn't exist yet will
  naturally exclude those games.
- `stats.nba.com` is unofficial and may rate-limit or break without notice.
  The script backs off exponentially up to 60s on errors.

## Nightly automation

`.github/workflows/ingest.yml` runs at 11:00 UTC (≈03:00 PT, after even late
West Coast games are final) and `curl`s `POST /api/ingest` on the Fly app. The
request itself wakes the machine via `auto_start_machines`.

Why an HTTP trigger rather than a cron job or a scheduled machine: the 300MB
SQLite file lives on the `statline_data` Fly volume, a volume mounts to exactly
one machine, and that machine is the app. So the write has to happen inside the
app process. An in-container cron wouldn't fire either — the machine sleeps
(`min_machines_running = 0`).

The route finds `MAX(game_date)` for the current season, re-requests from three
days before that (overlap is free — `INSERT OR REPLACE` on the
`(game_id, player_id)` PK — and absorbs late-posted box scores and stat
corrections), and does the same for both season types. Two API calls, a few
hundred rows, a few seconds. The app's readonly connection keeps serving
throughout; WAL means reader and writer don't block each other.

### Setup

```bash
fly secrets set STATLINE_INGEST_SECRET="$(openssl rand -hex 32)"
```

Put the same value in the repo's GitHub Actions secrets as
`STATLINE_INGEST_SECRET`. If the app isn't at `https://statline.fly.dev`, set
the `STATLINE_INGEST_URL` Actions *variable* too.

### Manual use

```bash
# status: current season + last completed pairs
curl -H "authorization: Bearer $SECRET" https://statline.fly.dev/api/ingest

# normal delta
curl -X POST -H "authorization: Bearer $SECRET" https://statline.fly.dev/api/ingest

# re-pull a whole season (e.g. after a long outage)
curl -X POST -H "authorization: Bearer $SECRET" -H 'content-type: application/json' \
  -d '{"season":"2026-27","full":true}' https://statline.fly.dev/api/ingest
```

`full`, `season`, and `lookbackDays` (0–60) are the only accepted body fields.
The workflow also has a `workflow_dispatch` trigger exposing `season` and `full`.

### If Fly's IP gets blocked

`stats.nba.com` blocks datacenter IP ranges unpredictably, and Fly is a
plausible casualty — the symptom is requests hanging rather than erroring, so
you'd see 502s from the route after its retry budget. The fallback is to keep
fetching where the IP works (your own machine, on a systemd timer) and have
that POST the parsed rows to the app for upsert. That needs a small addition to
the route — a `rows` array branch that skips the fetch — plus a `--push` flag
here. Roughly 200 rows/day, so the payload stays trivial.

### Not covered

Play-in games (`SeasonType=PlayIn`) aren't ingested, matching the Python
script's `SEASON_TYPES`. Add to `SEASON_TYPES` in `src/lib/nbaStats.ts` and
`scripts/ingest.py` together if you want them.
