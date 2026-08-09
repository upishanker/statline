import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let _db: Database.Database | null = null;
let _writeDb: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.STATLINE_DB_PATH
    ? process.env.STATLINE_DB_PATH
    : path.join(process.cwd(), "data", "statline.db");
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `statline.db not found at ${dbPath}. Run \`python scripts/ingest.py\` first.`,
    );
  }
  _db = new Database(dbPath, { readonly: true, fileMustExist: true });
  // No `journal_mode = WAL` here — that's a write to the DB header and fails
  // on a readonly connection ("attempt to write a readonly database"). The
  // ingest script owns journal mode; the web app only reads.
  return _db;
}

/**
 * Read-write connection, used only by the ingest route. Separate from getDb()
 * so the search path stays readonly. WAL means this writer and the readonly
 * reader above coexist without blocking each other.
 */
export function getWriteDb(): Database.Database {
  if (_writeDb) return _writeDb;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  db.exec(SCHEMA);
  _writeDb = db;
  return _writeDb;
}

// Mirrors the DDL in scripts/ingest.py so a fresh volume can be ingested into
// without running the Python backfill first. Both are CREATE ... IF NOT EXISTS.
const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS _ingest_state (
  season       TEXT NOT NULL,
  season_type  TEXT NOT NULL,
  rows         INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (season, season_type)
);
`;
