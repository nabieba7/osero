const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
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
    lastMove: null
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

  socket.on('create-room', (nickname) => {
    const roomId = generateRoomCode();
    rooms[roomId] = {
      board: createBoard(),
      players: { [socket.id]: { color: BLACK, nickname: nickname || 'Player 1' } },
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
    room.players[socket.id] = { color, nickname: nickname || 'Player 2' };
    room.nicknames.white = nickname || 'Player 2';
    socket.join(roomId.toUpperCase());

    // Notify both players
    socket.emit('room-joined', { roomId: roomId.toUpperCase(), color, nickname: nickname || 'Player 2' });
    io.to(roomId.toUpperCase()).emit('game-start', {
      black: room.nicknames.black,
      white: room.nicknames.white
    });

    // Send current board state to joining player
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

    // Validate: it's this player's turn
    if (room.board.currentPlayer !== color) return;

    // Validate: legal move
    const flips = getFlips(room.board.grid, row, col, color);
    if (flips.length === 0) return;

    // Apply move
    room.board.grid[row][col] = color;
    for (const [fr, fc] of flips) {
      room.board.grid[fr][fc] = color;
    }
    room.board.moveCount++;
    room.board.lastMove = [row, col];
    room.board.currentPlayer = opponent(color);

    // Check next state
    const nextMoves = getLegalMoves(room.board.grid, room.board.currentPlayer);
    const otherMoves = getLegalMoves(room.board.grid, opponent(room.board.currentPlayer));
    let skipped = false;

    if (nextMoves.length === 0 && otherMoves.length > 0) {
      // Skip
      skipped = true;
      const skippedColor = room.board.currentPlayer;
      room.board.currentPlayer = opponent(room.board.currentPlayer);
      const skipName = skippedColor === BLACK ? room.nicknames.black : room.nicknames.white;
      const nextName = room.board.currentPlayer === BLACK ? room.nicknames.black : room.nicknames.white;
      
      // Double check after skip
      const afterSkipMoves = getLegalMoves(room.board.grid, room.board.currentPlayer);
      if (afterSkipMoves.length === 0) {
        // Neither player can move
        const bc = countDiscs(room.board.grid, BLACK);
        const wc = countDiscs(room.board.grid, WHITE);
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
      // Game over
      const bc = countDiscs(room.board.grid, BLACK);
      const wc = countDiscs(room.board.grid, WHITE);
      io.to(roomId).emit('move-made', {
        row, col, color, flips,
        currentPlayer: room.board.currentPlayer,
        lastMove: [row, col],
        skipped: false
      });
      io.to(roomId).emit('game-over', { black: bc, white: wc });
      return;
    }

    // Normal move
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
    // Swap colors
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
    // Find and notify rooms
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        const nickname = room.players[socket.id].nickname;
        delete room.players[socket.id];
        io.to(roomId).emit('opponent-disconnected', nickname);
        // Clean up room after a delay
        setTimeout(() => {
          const remaining = Object.keys(room.players).length;
          if (remaining === 0) cleanupRoom(roomId);
        }, 60000);
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Osero server running on http://localhost:${PORT}`);
});