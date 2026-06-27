const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { authMiddleware, requireAuth, hashPassword, verifyPassword, generateToken } = require('./auth');
const {
  db, createUser, getUserByUsername, getUserById, updateUserProfile,
 saveGame, getUserStats, getUserRecentGames, getUserGameHistory, getUserGameCount,
 getLeaderboard, getUserRank
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Parse JSON bodies for API routes
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth API ──
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const existing = getUserByUsername.get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  try {
    const hash = hashPassword(password);
    const info = createUser.run(username, hash, displayName || username);
    const user = getUserById.get(info.lastInsertRowid);
    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getUserByUsername.get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken(user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, avatar: user.avatar }
  });
});

app.get('/api/me', authMiddleware, requireAuth, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id, username: user.username, displayName: user.display_name, avatar: user.avatar
  });
});

app.put('/api/me', authMiddleware, requireAuth, (req, res) => {
  const { displayName, avatar } = req.body;
  if (displayName && displayName.length > 30) {
    return res.status(400).json({ error: 'Display name too long' });
  }
  updateUserProfile.run(displayName || req.user.display_name, avatar || req.user.avatar, req.user.id);
  const updated = getUserById.get(req.user.id);
  res.json({
    id: updated.id, username: updated.username, displayName: updated.display_name, avatar: updated.avatar
  });
});

// ── Game API ──
app.post('/api/games', authMiddleware, requireAuth, (req, res) => {
  const { mode, playerColor, result, playerScore, opponentScore, difficulty, opponentName, durationSeconds } = req.body;
  if (!mode || !playerColor || !result) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    saveGame.run(req.user.id, mode, playerColor, result, playerScore, opponentScore, difficulty || null, opponentName || null, durationSeconds || null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save game' });
  }
});

app.get('/api/stats', authMiddleware, requireAuth, (req, res) => {
  const stats = getUserStats.get(req.user.id);
  const recent = getUserRecentGames.all(req.user.id, 20);
  const rankRow = getUserRank.get(req.user.id);
  res.json({ ...stats, rank: rankRow ? rankRow.rank : null, recentGames: recent });
});

// ── Game History API (paginated) ──
app.get('/api/games/history', authMiddleware, requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, parseInt(req.query.perPage) || 20), 50);
  const offset = (page - 1) * perPage;
  const total = getUserGameCount.get(req.user.id).total;
  const games = getUserGameHistory.all(req.user.id, perPage, offset);
  res.json({
    games,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage)
    }
  });
});

// ── Admin API ──
const ADMIN_KEY = process.env.ADMIN_KEY || 'osero-admin-2026';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  next();
}

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM games) as total_games,
      (SELECT COUNT(*) FROM games WHERE played_at >= datetime('now', '-1 day')) as games_today,
      (SELECT COUNT(*) FROM games WHERE played_at >= datetime('now', '-7 days')) as games_this_week,
      (SELECT COUNT(DISTINCT user_id) FROM games WHERE played_at >= datetime('now', '-1 day')) as active_users_today
  `).get();
  res.json(stats);
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const users = db.prepare(`
    SELECT
      u.id, u.username, u.display_name, u.avatar, u.created_at,
      COUNT(g.id) as total_games,
      SUM(CASE WHEN g.result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN g.result = 'loss' THEN 1 ELSE 0 END) as losses,
      MAX(g.played_at) as last_active
    FROM users u
    LEFT JOIN games g ON g.user_id = u.id
    GROUP BY u.id
    ORDER BY total_games DESC
    LIMIT ?
  `).all(limit);
  res.json(users);
});

app.get('/api/admin/games', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const games = db.prepare(`
    SELECT
      g.id, u.username, g.mode, g.player_color, g.result,
      g.player_score, g.opponent_score, g.difficulty, g.opponent_name,
      g.duration_seconds, g.played_at
    FROM games g
    JOIN users u ON g.user_id = u.id
    ORDER BY g.played_at DESC
    LIMIT ?
  `).all(limit);
  res.json(games);
});

// ── Leaderboard API ──
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const rows = getLeaderboard.all(limit);
  res.json(rows);
});

app.get('/api/leaderboard/me', authMiddleware, (req, res) => {
  if (!req.user) return res.json(null);
  const rankRow = getUserRank.get(req.user.id);
  const stats = getUserStats.get(req.user.id);
  res.json({ ...stats, rank: rankRow ? rankRow.rank : null });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Game State (server-authoritative) ──
const EMPTY = 0, BLACK = 1, WHITE = 2;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

const rooms = {};

function createBoard() {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  grid[3][3] = WHITE; grid[3][4] = BLACK;
  grid[4][3] = BLACK; grid[4][4] = WHITE;
  return {
    grid,
    currentPlayer: BLACK,
    moveCount: 0,
    lastMove: null,
    startedAt: Date.now()
  };
}

function opponent(p) { return p === BLACK ? WHITE : BLACK; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getFlips(grid, r, c, player) {
  if (grid[r][c] !== EMPTY) return [];
  const opp = opponent(player);
  const all = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && grid[nr][nc] === opp) {
      line.push([nr, nc]);
      nr += dr; nc += dc;
    }
    if (line.length > 0 && inBounds(nr, nc) && grid[nr][nc] === player) {
      all.push(...line);
    }
  }
  return all;
}

function getLegalMoves(grid, player) {
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (getFlips(grid, r, c, player).length > 0) moves.push([r, c]);
  return moves;
}

function countDiscs(grid, player) {
  let n = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (grid[r][c] === player) n++;
  return n;
}

function generateRoomCode() {
  const words = 'FROG BEAR LION WOLF DEER HAWK FOX OWL PUMA SEAL CRAB SWAN DOVE LYNX GOAT MOTH';
  const parts = words.split(' ');
  return parts[Math.floor(Math.random() * parts.length)] + Math.floor(Math.random() * 10);
}

function cleanupRoom(roomId) {
  if (rooms[roomId]) {
    delete rooms[roomId];
    console.log(`Room ${roomId} deleted`);
  }
}

// ── Socket Events ──
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // Auth on socket — client sends token after connect
  socket.on('auth', (token) => {
    const { verifyToken } = require('./auth');
    const payload = verifyToken(token);
    if (payload) {
      const user = getUserById.get(payload.userId);
      if (user) {
        socket.userId = user.id;
        socket.username = user.username;
        socket.displayName = user.display_name;
      }
    }
  });

  socket.on('create-room', (nickname) => {
    const roomId = generateRoomCode();
    rooms[roomId] = {
      board: createBoard(),
      players: { [socket.id]: { color: BLACK, nickname: nickname || 'Player 1', userId: socket.userId || null } },
      nicknames: { black: nickname || 'Player 1' },
      moves: []
    };
    socket.join(roomId);
    socket.emit('room-created', { roomId, color: BLACK, nickname: nickname || 'Player 1' });
    console.log(`Room ${roomId} created by ${nickname}`);
  });

  socket.on('join-room', ({ roomId, nickname }) => {
    const room = rooms[roomId.toUpperCase()];
    if (!room) {
      socket.emit('room-error', 'Room not found. Check the code and try again.');
      return;
    }
    const playerCount = Object.keys(room.players).length;
    if (playerCount >= 2) {
      socket.emit('room-error', 'Room is full. Try another one.');
      return;
    }

    const color = WHITE;
    room.players[socket.id] = { color, nickname: nickname || 'Player 2', userId: socket.userId || null };
    room.nicknames.white = nickname || 'Player 2';
    socket.join(roomId.toUpperCase());

    socket.emit('room-joined', { roomId: roomId.toUpperCase(), color, nickname: nickname || 'Player 2' });
    io.to(roomId.toUpperCase()).emit('game-start', {
      black: room.nicknames.black,
      white: room.nicknames.white
    });

    socket.emit('board-state', {
      grid: room.board.grid,
      currentPlayer: room.board.currentPlayer,
      lastMove: room.board.lastMove
    });

    console.log(`${nickname} joined room ${roomId}`);
  });

  socket.on('make-move', ({ roomId, row, col }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player) return;

    const color = player.color;
    if (room.board.currentPlayer !== color) return;

    const flips = getFlips(room.board.grid, row, col, color);
    if (flips.length === 0) return;

    room.board.grid[row][col] = color;
    for (const [fr, fc] of flips) {
      room.board.grid[fr][fc] = color;
    }
    room.board.moveCount++;
    room.board.lastMove = [row, col];
    room.board.currentPlayer = opponent(color);

    const nextMoves = getLegalMoves(room.board.grid, room.board.currentPlayer);
    const otherMoves = getLegalMoves(room.board.grid, opponent(room.board.currentPlayer));
    let skipped = false;

    if (nextMoves.length === 0 && otherMoves.length > 0) {
      skipped = true;
      const skippedColor = room.board.currentPlayer;
      room.board.currentPlayer = opponent(room.board.currentPlayer);
      const skipName = skippedColor === BLACK ? room.nicknames.black : room.nicknames.white;
      const nextName = room.board.currentPlayer === BLACK ? room.nicknames.black : room.nicknames.white;

      const afterSkipMoves = getLegalMoves(room.board.grid, room.board.currentPlayer);
      if (afterSkipMoves.length === 0) {
        const bc = countDiscs(room.board.grid, BLACK);
        const wc = countDiscs(room.board.grid, WHITE);
        _saveOnlineGameResult(room, bc, wc);
        io.to(roomId).emit('game-over', { black: bc, white: wc, skipBeforeEnd: true });
        return;
      }

      io.to(roomId).emit('move-made', {
        row, col, color, flips,
        currentPlayer: room.board.currentPlayer,
        lastMove: [row, col],
        skipped,
        skippedColor,
        skipMessage: `${skipName} has no moves — ${nextName} plays again`
      });
      return;
    }

    if (nextMoves.length === 0 && otherMoves.length === 0) {
      io.to(roomId).emit('move-made', {
        row, col, color, flips,
        currentPlayer: room.board.currentPlayer,
        lastMove: [row, col],
        skipped: false
      });
      const bc = countDiscs(room.board.grid, BLACK);
      const wc = countDiscs(room.board.grid, WHITE);
      _saveOnlineGameResult(room, bc, wc);
      io.to(roomId).emit('game-over', { black: bc, white: wc });
      return;
    }

    io.to(roomId).emit('move-made', {
      row, col, color, flips,
      currentPlayer: room.board.currentPlayer,
      lastMove: [row, col],
      skipped: false
    });
  });

  socket.on('restart-request', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    const otherId = Object.keys(room.players).find(id => id !== socket.id);
    if (otherId) {
      io.to(otherId).emit('restart-requested', room.nicknames[room.players[socket.id].color === BLACK ? 'black' : 'white']);
    }
  });

  socket.on('restart-accept', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    room.board = createBoard();
    for (const id of Object.keys(room.players)) {
      room.players[id].color = opponent(room.players[id].color);
    }
    const tempName = room.nicknames.black;
    room.nicknames.black = room.nicknames.white;
    room.nicknames.white = tempName;

    io.to(roomId).emit('game-restarted', {
      black: room.nicknames.black,
      white: room.nicknames.white,
      players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.color]))
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;
    io.to(roomId).emit('chat-message', {
      nickname: player.nickname,
      message,
      color: player.color
    });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        const nickname = room.players[socket.id].nickname;
        delete room.players[socket.id];
        io.to(roomId).emit('opponent-disconnected', nickname);
        setTimeout(() => {
          const remaining = Object.keys(room.players).length;
          if (remaining === 0) cleanupRoom(roomId);
        }, 60000);
        break;
      }
    }
  });
});

// ── Save online game results for both players ──
function _saveOnlineGameResult(room, blackCount, whiteCount) {
  const duration = Math.round((Date.now() - room.board.startedAt) / 1000);
  for (const [socketId, player] of Object.entries(room.players)) {
    if (!player.userId) continue;
    const isBlack = player.color === BLACK;
    const myScore = isBlack ? blackCount : whiteCount;
    const oppScore = isBlack ? whiteCount : blackCount;
    let result;
    if (myScore > oppScore) result = 'win';
    else if (myScore < oppScore) result = 'loss';
    else result = 'draw';

    const oppName = isBlack ? room.nicknames.white : room.nicknames.black;
    try {
      saveGame.run(player.userId, 'online', isBlack ? 'black' : 'white', result, myScore, oppScore, null, oppName, duration);
    } catch (err) {
      console.error('Failed to save online game result:', err);
    }
  }
}

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`Osero server running on http://localhost:${PORT}`);
});