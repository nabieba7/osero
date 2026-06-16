# ⚫ Osero ⚪

A web-based Othello (Reversi) game with AI, local multiplayer, and online play.

## Features

- **vs AI** — 3 difficulty levels (Easy, Medium, Hard) with minimax + alpha-beta pruning
- **Local 2-Player** — pass-and-play on the same device
- **Online Multiplayer** — create/join rooms with a code, real-time moves via Socket.IO
- **User Accounts** — sign up to save your game history
- **Leaderboard** — rankings based on wins (minimum 5 games to appear)
- **Profile & Stats** — wins, losses, draws, win rate, rank, recent games
- **AI Trash Talk** — the AI comments on your moves
- **Dark/Light Theme** — toggle anytime
- **Move Hints** — shows legal moves on the board
- **Move Log** — track all moves in algebraic notation
- **Mobile Friendly** — responsive layout works on phones

## Setup

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Play Online with a Friend

1. Both open the site
2. One player clicks **Play Online → Create Room**
3. Share the room code (e.g. `FROG3`)
4. Other player clicks **Play Online → Join Room** and enters the code

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Backend:** Node.js, Express, Socket.IO
- **Database:** SQLite (via better-sqlite3)
- **Auth:** bcryptjs + JWT

## License

MIT
