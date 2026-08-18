# statline

Search every NBA player-game by stat line.

"Show me 40+ point games with 10+ assists in a loss." "Who else has gone
20/20/10?" statline answers those against a local SQLite copy of every
box score from 1946-47 to today — ~1.48M player-games — with no live API
calls on the search path.

Built with Next.js 15 (App Router), React 19, Tailwind, and
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3). Deployed on
Fly.io.

## How it works

The whole app is one SQLite table, `performances`, with one row per
(game, player). Search is a single parameterized `SELECT` built in
[`src/lib/buildSearchQuery.ts`](src/lib/buildSearchQuery.ts) — min/max
ranges over 19 box-score stats, optional season-type filter, one of
three sort modes.

**Closeness sort** is the default and the interesting one. Given ranges
rather than an exact target, it orders by summed normalized distance from
each range's midpoint:

```
ORDER BY ABS(pts - 40) / 5 + ABS(ast - 10) / 2.5 ...
```

A two-sided range normalizes by its own half-width, so every filter
contributes comparably no matter its units. A one-sided range (`pts ≥ 40`)
has no half-width to use, so it falls back to a per-stat scale in
[`src/lib/statScales.ts`](src/lib/statScales.ts) — roughly one standard
deviation among players who fill the box score. The result: games that
just barely qualify sort above blowout outliers, which is usually what you
were actually looking for.

Alongside the stat ranges you can filter by player, team, opponent, win/loss,
home/away, and season range — all plain predicates on columns the table already
carries.

Everything the UI holds is mirrored into the query string, so any search is
a shareable link and the back button works.

## Ask in plain English

There's a text box above the filters. Type *"40 points and 10 assists in a loss"*
and the sliders move to match.

The model never sees SQL and never touches results. It only fills in the same
filter object the panel produces, which then goes through the usual zod
validation and [`buildSearchQuery`](src/lib/buildSearchQuery.ts) — so column
names still come only from the `STAT_KEYS` allowlist and values are still bound
parameters. A hallucinated stat key fails validation instead of reaching the
database.

That also makes the feature legible: because the parse lands in the filter
panel rather than in a separate results view, you can see how your sentence was
read, fix one number, and re-run. Anything the schema can't express — a date, a
playoff round, a career total — is reported back as *ignored* rather than
silently approximated.

It runs on [Gemini](https://ai.google.dev) via `GEMINI_API_KEY` (see
`.env.example`). Two things worth knowing:

- **On Google's free tier, prompts and responses are used to improve Google's
  products.** Queries you type into that box leave the app. The rest of the
  site never calls out.
- Free tier has a hard daily cap, so translations are cached in SQLite and the
  endpoint is rate-limited. When the quota runs out the box disables itself and
  says so — the manual filters keep working, and nothing is ever guessed.

### Data notes

- Stats that didn't exist yet are `NULL`, not `0` — no 3PT before 1979-80,
  no OREB/DREB/STL/BLK/TOV before 1973-74. Filtering on one of those
  naturally excludes earlier games. Per-stat sorts push `NULL`s last in
  both directions.
- Percentages are stored as 0–1 fractions and entered as percentages in
  the UI.
- Regular season and playoffs only. Play-in games aren't ingested.

## Running locally

```bash
npm install
```

The database isn't in the repo (~300MB). Build it with the historical
backfill script — see [`scripts/README.md`](scripts/README.md) for the
full story:

```bash
cd scripts
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python ingest.py --seasons 2024-25 2025-26   # a few minutes, enough to poke at
python ingest.py                             # everything, hours (polite 1.5s sleep)
```

It's resumable — completed `(season, season_type)` pairs are tracked in an
`_ingest_state` table and skipped on re-runs.

Then:

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
npm run typecheck
```

Copy `.env.example` to `.env.local` and add a `GEMINI_API_KEY` if you want the
plain-English box; everything else works without it.

`STATLINE_DB_PATH` overrides the DB location (default `data/statline.db`).

## API

`POST /api/search`

```jsonc
{
  "filters": { "pts": { "min": 40 }, "ast": { "min": 10, "max": 15 } },
  "seasonType": "All",           // "Regular Season" | "Playoffs" | "All"
  "sort": { "by": "closeness", "dir": "asc" },  // or "date" | any stat key
  "page": 1,
  "perPage": 25
}
```

Returns `{ rows, page, perPage, total, effectiveSort }`. `total` is `null`
on a completely unfiltered request (the count is skipped rather than
scanning the table). Bodies are validated with zod; unknown stat keys are
rejected, which is also what keeps the generated SQL safe — column names
only ever come from the `STAT_KEYS` allowlist, values are always bound
parameters.

`POST /api/parse` takes `{ q: string }` and returns `{ criteria, sort,
unsupported, cached }` — the same shape `/api/search` accepts. It answers `503`
with `aiUnavailable: true` when the key is missing or the quota is gone.

`GET`/`POST /api/ingest` runs the nightly delta and is bearer-token
protected via `STATLINE_INGEST_SECRET`. Details in
[`scripts/README.md`](scripts/README.md).

## Deployment

`fly deploy` builds the [Dockerfile](Dockerfile) (multi-stage; `better-sqlite3`
is compiled in the deps stage, and only Next's standalone output ships in the
runtime image). The DB lives on a Fly volume mounted at `/data`, and the
machine scales to zero between requests.

Keeping it current: a GitHub Actions workflow
([`.github/workflows/ingest.yml`](.github/workflows/ingest.yml)) `curl`s
`POST /api/ingest` nightly, which wakes the machine and pulls the current
season's new games in-process. That's a TypeScript port of the same
`leaguegamelog` call the Python script makes, so the runtime image doesn't
need Python or pandas. Why an HTTP trigger instead of a cron job — a Fly
volume mounts to exactly one machine, so the write has to happen inside the
app process. The full reasoning is in
[`scripts/README.md`](scripts/README.md#nightly-automation).

## Credits

Data from `stats.nba.com` via [`nba_api`](https://github.com/swar/nba_api).
Unofficial, unaffiliated with the NBA, and liable to rate-limit or change
without notice. Player headshots and team logos are hotlinked from
`cdn.nba.com`.
