// Database access. Production uses Postgres via DATABASE_URL (e.g. Neon from the
// Vercel marketplace). Local dev without DATABASE_URL uses PGlite, an embedded
// Postgres persisted under .data/, so the same SQL runs everywhere.

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = connect().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export function hasDatabaseConfig(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL) || process.env.NODE_ENV !== 'production';
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let db: Db;
  if (url) {
    const pg = await import('pg');
    const Pool = (pg.default ?? pg).Pool;
    const pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    db = {
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return r.rows;
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const inner: Db = {
            query: async (sql, params) => (await client.query(sql, params as unknown[])).rows,
            tx: (f) => f(inner),
          };
          const out = await fn(inner);
          await client.query('COMMIT');
          return out;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is not configured');
    const modName = '@electric-sql/pglite';
    const { PGlite } = await import(/* @vite-ignore */ modName);
    const dir = process.env.PGLITE_DIR ?? './.data/pglite';
    const lite = new PGlite(dir === 'memory' ? undefined : dir);
    let chain: Promise<unknown> = Promise.resolve();
    // PGlite is single-connection; serialize transactions.
    const run = <T,>(fn: () => Promise<T>): Promise<T> => {
      const next = chain.then(fn, fn);
      chain = next.catch(() => {});
      return next;
    };
    const q = async (sql: string, params?: unknown[]) => (await lite.query(sql, params ?? [])).rows as never[];
    db = {
      query: (sql, params) => run(() => q(sql, params)),
      tx: (fn) =>
        run(async () => {
          await lite.query('BEGIN');
          try {
            const inner: Db = { query: (sql, params) => q(sql, params), tx: (f) => f(inner) };
            const out = await fn(inner);
            await lite.query('COMMIT');
            return out;
          } catch (e) {
            await lite.query('ROLLBACK').catch(() => {});
            throw e;
          }
        }),
    };
  }
  await migrate(db);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL UNIQUE,
  short TEXT NOT NULL,
  colors JSONB NOT NULL,
  badge JSONB NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  founder_user_id TEXT,
  join_mode TEXT NOT NULL DEFAULT 'open',
  invite_code TEXT NOT NULL,
  formation TEXT NOT NULL DEFAULT '4-3-3',
  tactics JSONB NOT NULL DEFAULT '{}',
  lineup JSONB NOT NULL DEFAULT '{}',
  bench_size INT NOT NULL DEFAULT 7,
  level INT NOT NULL DEFAULT 46,
  active BOOLEAN NOT NULL DEFAULT true,
  last_friendly_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  club_role TEXT NOT NULL DEFAULT 'player',
  is_bot BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  shirt INT NOT NULL DEFAULT 0,
  appearance JSONB NOT NULL DEFAULT '{}',
  attrs JSONB NOT NULL,
  xp JSONB NOT NULL DEFAULT '{}',
  coins INT NOT NULL DEFAULT 0,
  last_train_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_club ON players(club_id);
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS season_clubs (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  final_pos INT,
  PRIMARY KEY (season_id, club_id)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'league',
  round INT,
  home_id TEXT NOT NULL REFERENCES clubs(id),
  away_id TEXT NOT NULL REFERENCES clubs(id),
  kickoff_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  seed INT NOT NULL,
  home_goals INT,
  away_goals INT,
  ends_at TIMESTAMPTZ,
  lineups JSONB,
  result JSONB
);
CREATE INDEX IF NOT EXISTS matches_due ON matches(status, kickoff_at);
CREATE INDEX IF NOT EXISTS matches_home ON matches(home_id);
CREATE INDEX IF NOT EXISTS matches_away ON matches(away_id);
CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  season_id TEXT,
  kind TEXT NOT NULL,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  shots INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  tackles INT NOT NULL DEFAULT 0,
  clean_sheet BOOLEAN NOT NULL DEFAULT false,
  rating REAL NOT NULL DEFAULT 6,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS pms_player ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS pms_season ON player_match_stats(season_id);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_player ON notifications(player_id, created_at DESC);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
ALTER TABLE players ADD COLUMN IF NOT EXISTS equipped JSONB NOT NULL DEFAULT '{}';
ALTER TABLE players ADD COLUMN IF NOT EXISTS motto TEXT NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN IF NOT EXISTS train_count INT NOT NULL DEFAULT 0;
ALTER TABLE player_match_stats ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE player_match_stats ADD COLUMN IF NOT EXISTS motm BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS inventory (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'shop',
  price INT NOT NULL DEFAULT 0,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE IF NOT EXISTS player_achievements (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ach_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, ach_id)
);
CREATE TABLE IF NOT EXISTS trophies (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  season_number INT NOT NULL,
  kind TEXT NOT NULL,
  club_id TEXT,
  player_id TEXT,
  value REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trophies_player ON trophies(player_id);
CREATE INDEX IF NOT EXISTS trophies_club ON trophies(club_id);
CREATE TABLE IF NOT EXISTS club_invites (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  from_player_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invites_player ON club_invites(player_id, status);
CREATE INDEX IF NOT EXISTS invites_club ON club_invites(club_id, status);
CREATE TABLE IF NOT EXISTS club_messages (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id TEXT,
  kind TEXT NOT NULL DEFAULT 'msg',
  text TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_messages_recent ON club_messages(club_id, created_at DESC);
`;

async function migrate(db: Db) {
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}
