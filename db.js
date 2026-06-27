const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DATA_DIR, 'osero.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar TEXT DEFAULT '⚪',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('ai', 'pvp', 'online')),
    player_color TEXT NOT NULL CHECK(player_color IN ('black', 'white')),
    result TEXT NOT NULL CHECK(result IN ('win', 'loss', 'draw')),
    player_score INTEGER NOT NULL,
    opponent_score INTEGER NOT NULL,
    difficulty INTEGER DEFAULT NULL,
    opponent_name TEXT DEFAULT NULL,
    duration_seconds INTEGER DEFAULT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_games_user ON games(user_id);
  CREATE INDEX IF NOT EXISTS idx_games_played ON games(played_at DESC);
`);

const createUser = db.prepare(`
  INSERT INTO users (username, password_hash, display_name)
  VALUES (?, ?, ?)
`);

const getUserByUsername = db.prepare(`
  SELECT * FROM users WHERE username = ?
`);

const getUserById = db.prepare(`
  SELECT id, username, display_name, avatar, created_at FROM users WHERE id = ?
`);

const updateUserProfile = db.prepare(`
  UPDATE users SET display_name = ?, avatar = ? WHERE id = ?
`);

const saveGame = db.prepare(`
  INSERT INTO games (user_id, mode, player_color, result, player_score, opponent_score, difficulty, opponent_name, duration_seconds)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getUserStats = db.prepare(`
  SELECT
    COUNT(*) as total_games,
    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as draws,
    COALESCE(ROUND(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1), 0) as win_rate
  FROM games
  WHERE user_id = ?
`);

const getUserRecentGames = db.prepare(`
  SELECT mode, player_color, result, player_score, opponent_score, difficulty, opponent_name, played_at, duration_seconds
  FROM games
  WHERE user_id = ?
  ORDER BY played_at DESC
  LIMIT ?
`);

const getUserGameHistory = db.prepare(`
  SELECT id, mode, player_color, result, player_score, opponent_score, difficulty, opponent_name, duration_seconds, played_at
  FROM games
  WHERE user_id = ?
  ORDER BY played_at DESC
  LIMIT ? OFFSET ?
`);

const getUserGameCount = db.prepare(`
  SELECT COUNT(*) as total FROM games WHERE user_id = ?
`);

const getLeaderboard = db.prepare(`
  SELECT
    u.id,
    u.username,
    u.display_name,
    u.avatar,
    COUNT(g.id) as total_games,
    SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN g.result = 'draw' THEN 1 ELSE 0 END) as draws,
    COALESCE(ROUND(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(g.id), 0), 1), 0) as win_rate,
    CASE WHEN COUNT(g.id) >= 5 THEN SUM(CASE WHEN g.result = 'win' THEN 3 WHEN g.result = 'draw' THEN 1 ELSE 0 END) ELSE 0 END as rating
  FROM users u
  LEFT JOIN games g ON g.user_id = u.id
  GROUP BY u.id
  HAVING total_games >= 5
  ORDER BY rating DESC, win_rate DESC, wins DESC
  LIMIT ?
`);

const getUserRank = db.prepare(`
  SELECT rank FROM (
    SELECT u.id, RANK() OVER (ORDER BY
      CASE WHEN COUNT(g.id) >= 5 THEN SUM(CASE WHEN g.result = 'win' THEN 3 WHEN g.result = 'draw' THEN 1 ELSE 0 END) ELSE 0 END DESC,
      COALESCE(ROUND(SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(g.id), 0), 1), 0) DESC
    ) as rank
    FROM users u
    LEFT JOIN games g ON g.user_id = u.id
    GROUP BY u.id
    HAVING COUNT(g.id) >= 5
  )
  WHERE id = ?
`);

module.exports = {
  db,
  createUser,
  getUserByUsername,
  getUserById,
  updateUserProfile,
  saveGame,
  getUserStats,
  getUserRecentGames,
  getUserGameHistory,
  getUserGameCount,
  getLeaderboard,
  getUserRank
};
