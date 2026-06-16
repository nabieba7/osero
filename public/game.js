/* ═══════════════════════════════════════════
   OSERO — Game Engine + AI + UI + Online
   ═══════════════════════════════════════════ */

const EMPTY = 0, BLACK = 1, WHITE = 2;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const COL_LETTERS = 'ABCDEFGH';
// Game timer
let gameStartTime = null;

const WEIGHT_MATRIX = [
  [100,-30, 10,  5,  5, 10,-30,100],
  [-30,-30, -5, -5, -5, -5,-30,-30],
  [ 10, -5,  5,  1,  1,  5, -5, 10],
  [  5, -5,  1,  1,  1,  1, -5,  5],
  [  5, -5,  1,  1,  1,  1, -5,  5],
  [ 10, -5,  5,  1,  1,  5, -5, 10],
  [-30,-30, -5, -5, -5, -5,-30,-30],
  [100,-30, 10,  5,  5, 10,-30,100]
];

const AI_COMMENTS = {
  aiCorner: [
    "Mwahaha! The corner is MINE. This changes everything.",
    "Corner secured. I'm basically unbeatable now. Basically.",
    "Ah yes, my favorite square. Did you just let me have that?"
  ],
  playerCorner: [
    "...okay. That was a good move. I hate you a little.",
    "You got a corner. Fine. I wasn't going to use it anyway.",
    "Noted. I am recalculating my entire strategy right now."
  ],
  bigFlip: [
    "Boom! Did you see that? I am kind of amazing.",
    "That's called a combo. Look it up.",
    "Mass flip! This is the move they'll talk about."
  ],
  aiLosing: [
    "I'm just letting you feel confident. It's a strategy.",
    "This is all part of my plan. I swear.",
    "Don't celebrate yet. I have depth-5 search on my side."
  ],
  aiWinning: [
    "This is going well. For me. Not for you.",
    "It's not about the destination, it's about crushing victory.",
    "I feel like I should go easy on you. I won't."
  ],
  aiSkip: [
    "I have no moves. This is fine. Everything is fine.",
    "The board has betrayed me. I skip with dignity."
  ],
  playerSkip: [
    "Oh? Nowhere to go? Interesting.",
    "No moves? That must sting. Take your time.",
    "The board speaks, and it says: not your turn."
  ],
  endgame: [
    "Endgame. This is where I shine.",
    "It all comes down to this. Dramatic, right?",
    "Final stretch. No more mistakes. For either of us."
  ],
  aiWin: [
    "I told you corners mattered. I always say that.",
    "Victory. You can rematch. I'll be here, waiting."
  ],
  playerWin: [
    "...well played. I demand a rematch immediately.",
    "You won. I was clearly going easy on you.",
    "Fine. You win. But I'm still smarter than most humans."
  ],
  draw: [
    "A draw? We are equals. Terrible, uncomfortable equals.",
    "Exactly 32-32. Even my loss function is confused."
  ]
};

class BoardState {
  constructor() {
    this.grid = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
    this.grid[3][3] = WHITE; this.grid[3][4] = BLACK;
    this.grid[4][3] = BLACK; this.grid[4][4] = WHITE;
    this.currentPlayer = BLACK;
    this.moveCount = 0;
    this.lastMove = null;
  }

  clone() {
    const s = new BoardState();
    s.grid = this.grid.map(r => [...r]);
    s.currentPlayer = this.currentPlayer;
    s.moveCount = this.moveCount;
    s.lastMove = this.lastMove;
    return s;
  }

  opponent(p) { return p === BLACK ? WHITE : BLACK; }
  inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  getFlips(r, c, player) {
    if (this.grid[r][c] !== EMPTY) return [];
    const opp = this.opponent(player);
    const all = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let nr = r + dr, nc = c + dc;
      while (this.inBounds(nr, nc) && this.grid[nr][nc] === opp) {
        line.push([nr, nc]);
        nr += dr; nc += dc;
      }
      if (line.length > 0 && this.inBounds(nr, nc) && this.grid[nr][nc] === player) {
        all.push(...line);
      }
    }
    return all;
  }

  getLegalMoves(player) {
    const moves = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (this.getFlips(r, c, player).length > 0) moves.push([r, c]);
    return moves;
  }

  makeMove(r, c, player) {
    const flips = this.getFlips(r, c, player);
    if (flips.length === 0) return null;
    this.grid[r][c] = player;
    for (const [fr, fc] of flips) this.grid[fr][fc] = player;
    this.moveCount++;
    this.lastMove = [r, c];
    this.currentPlayer = this.opponent(player);
    return flips;
  }

  count(player) {
    let n = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (this.grid[r][c] === player) n++;
    return n;
  }

  emptyCount() {
    let n = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (this.grid[r][c] === EMPTY) n++;
    return n;
  }

  isCorner(r, c) { return (r === 0 || r === 7) && (c === 0 || c === 7); }
}

// ── AI ──
class OthelloAI {
  constructor(baseDepth = 4) {
    this.baseDepth = baseDepth;
  }

  getSearchDepth(empty) {
    if (empty <= 14) return Math.min(8, empty);
    if (empty <= 20) return 6;
    return this.baseDepth;
  }

  evaluate(state, player) {
    const opp = state.opponent(player);
    const empty = state.emptyCount();
    const gamePhase = empty / 60;

    let posScore = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (state.grid[r][c] === player) posScore += WEIGHT_MATRIX[r][c];
        else if (state.grid[r][c] === opp) posScore -= WEIGHT_MATRIX[r][c];
      }

    const myMoves = state.getLegalMoves(player).length;
    const oppMoves = state.getLegalMoves(opp).length;
    let mobScore = 0;
    if (myMoves + oppMoves > 0)
      mobScore = 100 * (myMoves - oppMoves) / (myMoves + oppMoves);

    const myCount = state.count(player);
    const oppCount = state.count(opp);
    let parityScore = 0;
    if (myCount + oppCount > 0)
      parityScore = 100 * (myCount - oppCount) / (myCount + oppCount);

    const corners = [[0,0],[0,7],[7,0],[7,7]];
    let cornerScore = 0;
    for (const [cr, cc] of corners) {
      if (state.grid[cr][cc] === player) cornerScore += 25;
      else if (state.grid[cr][cc] === opp) cornerScore -= 25;
    }

    let stabilityScore = 0;
    for (const [cr, cc] of corners) {
      if (state.grid[cr][cc] === player)
        stabilityScore += this._stableFromCorner(state, cr, cc, player);
      else if (state.grid[cr][cc] === opp)
        stabilityScore -= this._stableFromCorner(state, cr, cc, opp);
    }

    const wPos = 1.0;
    const wMob = gamePhase > 0.4 ? 2.0 : 1.0;
    const wParity = gamePhase > 0.4 ? 0.5 : 3.0;
    const wCorner = 3.0;
    const wStab = 2.5;

    return wPos * posScore + wMob * mobScore + wParity * parityScore +
           wCorner * cornerScore + wStab * stabilityScore;
  }

  _stableFromCorner(state, cr, cc, player) {
    let count = 0;
    const rd = cr === 0 ? 1 : -1;
    const cd = cc === 0 ? 1 : -1;
    for (let r = cr; r >= 0 && r < 8; r += rd) {
      if (state.grid[r][cc] !== player) break;
      count++;
    }
    for (let c = cc + cd; c >= 0 && c < 8; c += cd) {
      if (state.grid[cr][c] !== player) break;
      count++;
    }
    return count;
  }

  minimax(state, depth, alpha, beta, maximizing, player) {
    const opp = state.opponent(player);

    if (depth === 0 || state.emptyCount() === 0) {
      return { score: this.evaluate(state, player), move: null };
    }

    const currentColor = maximizing ? player : opp;
    let moves = state.getLegalMoves(currentColor);
    const otherMoves = state.getLegalMoves(state.opponent(currentColor));

    if (moves.length === 0) {
      if (otherMoves.length === 0) {
        const mc = state.count(player), oc = state.count(opp);
        return { score: (mc - oc) * 1000, move: null };
      }
      return this.minimax(state, depth, alpha, beta, !maximizing, player);
    }

    moves.sort((a, b) => WEIGHT_MATRIX[b[0]][b[1]] - WEIGHT_MATRIX[a[0]][a[1]]);

    let bestMove = moves[0];

    if (maximizing) {
      let maxEval = -Infinity;
      for (const [mr, mc] of moves) {
        const child = state.clone();
        child.makeMove(mr, mc, currentColor);
        const { score } = this.minimax(child, depth - 1, alpha, beta, false, player);
        if (score > maxEval) { maxEval = score; bestMove = [mr, mc]; }
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;
      for (const [mr, mc] of moves) {
        const child = state.clone();
        child.makeMove(mr, mc, currentColor);
        const { score } = this.minimax(child, depth - 1, alpha, beta, true, player);
        if (score < minEval) { minEval = score; bestMove = [mr, mc]; }
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove };
    }
  }

  getBestMove(state, aiPlayer) {
    const depth = this.getSearchDepth(state.emptyCount());
    const result = this.minimax(state, depth, -Infinity, Infinity, true, aiPlayer);
    return result.move;
  }
}
// ── UI ──
const UI = {
  showHints: true,
  moveLogVisible: false,
  commentTimeout: null,

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },

  renderBoard(state) {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const legal = state.getLegalMoves(state.currentPlayer);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        if (state.lastMove && state.lastMove[0] === r && state.lastMove[1] === c) {
          cell.classList.add('last-move');
        }

        if (state.grid[r][c] !== EMPTY) {
          const disc = document.createElement('div');
          disc.className = `disc ${state.grid[r][c] === BLACK ? 'black' : 'white'}`;
          disc.id = `disc-${r}-${c}`;
          cell.appendChild(disc);
        } else if (this.showHints && !Game.aiThinking) {
          const isLegal = legal.some(([mr, mc]) => mr === r && mc === c);
          if (isLegal) {
            const hint = document.createElement('div');
            hint.className = `hint-dot ${state.currentPlayer === BLACK ? 'black-hint' : 'white-hint'}`;
            cell.appendChild(hint);
          }
        }

        cell.addEventListener('click', () => Game.onCellClick(r, c));
        boardEl.appendChild(cell);
      }
    }
  },

  updateScore(state) {
    document.getElementById('black-count').textContent = state.count(BLACK);
    document.getElementById('white-count').textContent = state.count(WHITE);
  },

  updateTurn(state) {
    const disc = document.querySelector('.turn-disc');
    const text = document.getElementById('turn-text');
    const isBlack = state.currentPlayer === BLACK;
    disc.className = `turn-disc ${isBlack ? 'black-disc-small' : 'white-disc-small'}`;
    text.textContent = `${isBlack ? "Black" : "White"}'s turn`;
  },

  animateFlips(flips, toColor, callback) {
    const delay = 60;
    flips.forEach(([r, c], i) => {
      setTimeout(() => {
        const disc = document.getElementById(`disc-${r}-${c}`);
        if (!disc) return;
        disc.classList.add('flipping');
        setTimeout(() => {
          disc.className = `disc ${toColor === BLACK ? 'black' : 'white'} flipping`;
          disc.id = `disc-${r}-${c}`;
          disc.addEventListener('animationend', () => disc.classList.remove('flipping'), { once: true });
        }, 250);
      }, i * delay);
    });
    setTimeout(callback, flips.length * delay + 500);
  },

  animatePlacement(r, c, color) {
    const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (!cell) return;
    const disc = document.createElement('div');
    disc.className = `disc ${color === BLACK ? 'black' : 'white'} placing`;
    disc.id = `disc-${r}-${c}`;
    cell.appendChild(disc);
    disc.addEventListener('animationend', () => disc.classList.remove('placing'), { once: true });
  },

  showComment(text) {
    const el = document.getElementById('ai-comment');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(this.commentTimeout);
    this.commentTimeout = setTimeout(() => el.classList.remove('visible'), 3500);
  },

  pickComment(category) {
    const options = AI_COMMENTS[category];
    if (!options) return '';
    return options[Math.floor(Math.random() * options.length)];
  },

  showSkipAnnounce(text) {
    const el = document.createElement('div');
    el.className = 'skip-announce';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  showGameOver(blackCount, whiteCount, result) {
    document.getElementById('final-score').textContent = `${blackCount} — ${whiteCount}`;
    document.getElementById('game-result').textContent = result;
    const title = document.getElementById('game-over-title');
    if (result.includes('Draw')) title.textContent = "🤝 Draw!";
    else if (result.includes('Black')) title.textContent = "⚫ Black Wins!";
    else title.textContent = "⚪ White Wins!";
    document.getElementById('game-over-overlay').classList.add('active');
  },

  hideGameOver() {
    document.getElementById('game-over-overlay').classList.remove('active');
  },

  showRules() {
    document.getElementById('rules-overlay').classList.add('active');
  },

  hideRules() {
    document.getElementById('rules-overlay').classList.remove('active');
  },

  toggleHints() {
    this.showHints = !this.showHints;
    const btn = document.getElementById('hints-btn');
    btn.classList.toggle('hints-active', this.showHints);
    btn.textContent = this.showHints ? '👁' : '👁‍🗨';
    if (Game.state) this.renderBoard(Game.state);
  },

  toggleMoveLog() {
    this.moveLogVisible = !this.moveLogVisible;
    const log = document.getElementById('move-log');
    log.style.display = this.moveLogVisible ? 'block' : 'none';
  },

  addMoveLog(player, r, c) {
    const log = document.getElementById('move-log');
    const label = player === BLACK ? 'B' : 'W';
    const coord = `${COL_LETTERS[c]}${r + 1}`;
    const span = document.createElement('span');
    span.textContent = `${label}→${coord}  `;
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
  },

  clearMoveLog() {
    document.getElementById('move-log').innerHTML = '';
  },

  toggleTheme() {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isLight ? 'dark' : 'light');
    localStorage.setItem('osero-theme', isLight ? 'dark' : 'light');
    const label = isLight ? '🌙' : '☀️';
    const btn = document.getElementById('theme-btn');
    const menuBtn = document.querySelector('.theme-toggle-menu');
    if (btn) btn.textContent = label;
    if (menuBtn) menuBtn.textContent = label + ' Theme';
  },

  loadTheme() {
    const saved = localStorage.getItem('osero-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const label = saved === 'light' ? '☀️' : '🌙';
    const btn = document.getElementById('theme-btn');
    const menuBtn = document.querySelector('.theme-toggle-menu');
    if (btn) btn.textContent = label;
    if (menuBtn) menuBtn.textContent = label + ' Theme';
  },

 showOnlineMenu() {
    document.getElementById('online-error').textContent = '';
    const nickInput = document.getElementById('online-nickname');
    if (Auth.isLoggedIn()) {
      nickInput.value = Auth.user.displayName || Auth.user.username;
      nickInput.readOnly = true;
      nickInput.style.opacity = '0.6';
    } else {
      nickInput.value = '';
      nickInput.readOnly = false;
      nickInput.style.opacity = '1';
    }
    document.getElementById('online-menu-overlay').classList.add('active');
  },

  hideOnlineMenu() {
    document.getElementById('online-menu-overlay').classList.remove('active');
  }
,
  showLogin() {
    document.getElementById('login-overlay').classList.add('active');
    document.getElementById('login-error').textContent = '';
  },
  hideLogin() {
    document.getElementById('login-overlay').classList.remove('active');
  },
  showRegister() {
    document.getElementById('register-overlay').classList.add('active');
    document.getElementById('register-error').textContent = '';
  },
  hideRegister() {
    document.getElementById('register-overlay').classList.remove('active');
  },

  async showLeaderboard() {
    this.showScreen('leaderboard-screen');
    const container = document.getElementById('leaderboard-table');
    container.innerHTML = '<div class="lb-loading">Loading...</div>';

    try {
      const res = await fetch('/api/leaderboard?limit=50');
      const data = await res.json();
      if (data.length === 0) {
        container.innerHTML = '<div class="lb-empty">No players ranked yet. Play 5+ games to appear!</div>';
        return;
      }

      let html = '<div class="lb-header"><span>#</span><span>Player</span><span>Rating</span><span>W/L/D</span><span>Win%</span></div>';
      data.forEach((row, i) => {
        const isMe = Auth.user && Auth.user.id === row.id;
        html += `<div class="lb-row${isMe ? ' lb-me' : ''}${i < 3 ? ' lb-top' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${row.avatar} ${row.display_name}</span>
          <span class="lb-rating">${row.rating}</span>
          <span class="lb-record">${row.wins}/${row.losses}/${row.draws}</span>
          <span class="lb-winrate">${row.win_rate}%</span>
        </div>`;
      });
      container.innerHTML = html;
    } catch {
      container.innerHTML = '<div class="lb-error">Failed to load leaderboard</div>';
    }
  },

  async showProfile() {
    if (!Auth.isLoggedIn()) {
      this.showLogin();
      return;
    }
    this.showScreen('profile-screen');

    document.getElementById('profile-avatar-large').textContent = Auth.user.avatar || '⚪';
    document.getElementById('profile-display-name').textContent = Auth.user.displayName || Auth.user.username;
    document.getElementById('profile-username').textContent = '@' + Auth.user.username;

    try {
      const res = await fetch('/api/stats', {
        headers: { 'Authorization': `Bearer ${Auth.token}` }
      });
      const stats = await res.json();

      document.getElementById('stat-total').textContent = stats.total_games || 0;
      document.getElementById('stat-wins').textContent = stats.wins || 0;
      document.getElementById('stat-losses').textContent = stats.losses || 0;
      document.getElementById('stat-draws').textContent = stats.draws || 0;

      if (stats.rank) {
        document.getElementById('profile-rank-section').style.display = 'flex';
        document.getElementById('stat-rank').textContent = '#' + stats.rank;
        document.getElementById('stat-winrate').textContent = stats.win_rate + '%';
      } else {
        document.getElementById('profile-rank-section').style.display = 'none';
      }

      const recentEl = document.getElementById('profile-recent-list');
      if (stats.recentGames && stats.recentGames.length > 0) {
        recentEl.innerHTML = stats.recentGames.map(g => {
          const icon = g.result === 'win' ? '🟢' : (g.result === 'loss' ? '🔴' : '🟡');
          const modeLabel = g.mode === 'ai' ? `AI (${g.difficulty})` : g.mode;
          return `<div class="recent-game">${icon} vs ${modeLabel} — ${g.player_score}:${g.opponent_score} <span class="recent-time">${new Date(g.played_at).toLocaleDateString()}</span></div>`;
        }).join('');
      } else {
        recentEl.innerHTML = 'No games yet';
      }
    } catch {
      document.getElementById('profile-recent-list').innerHTML = 'Failed to load stats';
    }
  }
};
const Game = {
  state: null,
  mode: null,
  playerColor: null,
  ai: null,
  aiThinking: false,
  difficulty: 4,
  endgameCommentShown: false,

  setDifficulty(btn) {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.difficulty = parseInt(btn.dataset.depth);
  },

  start(mode, playerColor) {
    this.mode = mode;
    this.playerColor = playerColor === 'black' ? BLACK : WHITE;
    this.ai = new OthelloAI(this.difficulty);
    this.aiThinking = false;
    this.endgameCommentShown = false;
    this.state = new BoardState();
    gameStartTime = Date.now();

    UI.clearMoveLog();
    UI.hideGameOver();
    UI.showScreen('game-screen');
    UI.renderBoard(this.state);
    UI.updateScore(this.state);
    UI.updateTurn(this.state);

    if (mode === 'ai' && this.playerColor === WHITE) {
      this.scheduleAI();
    }
  },

  startOnline(blackName, whiteName) {
    this.mode = 'online';
    this.playerColor = OnlineGame.myColor;
    this.aiThinking = false;
    this.endgameCommentShown = false;
    this.state = new BoardState();
    gameStartTime = Date.now();

    UI.clearMoveLog();
    UI.hideGameOver();
    UI.showScreen('game-screen');
    UI.renderBoard(this.state);
    UI.updateScore(this.state);
    UI.updateTurn(this.state);
    OnlineGame.showChat();
  },

  restart() {
    if (this.mode === 'online') {
      OnlineGame.requestRestart();
      return;
    }
    if (this.mode === 'ai') {
      this.start('ai', this.playerColor === BLACK ? 'black' : 'white');
    } else {
      this.start('pvp');
    }
  },

  backToMenu() {
    UI.hideGameOver();
    UI.showScreen('menu-screen');
    this.state = null;
    this.aiThinking = false;
    if (this.mode === 'online') {
      OnlineGame.disconnect();
    }
  },

  onCellClick(r, c) {
    if (this.aiThinking || !this.state) return;
    if (this.state.grid[r][c] !== EMPTY) return;
    if (this.mode === 'ai' && this.state.currentPlayer !== this.playerColor) return;
    if (this.mode === 'online' && this.state.currentPlayer !== OnlineGame.myColor) return;

    const flips = this.state.getFlips(r, c, this.state.currentPlayer);
    if (flips.length === 0) return;

    if (this.mode === 'online') {
      OnlineGame.sendMove(r, c);
    } else {
      this.executeMove(r, c);
    }
  },

  executeMove(r, c) {
    const player = this.state.currentPlayer;
    const flips = this.state.makeMove(r, c, player);

    UI.addMoveLog(player, r, c);
    UI.animatePlacement(r, c, player);

    UI.animateFlips(flips, player, () => {
      UI.updateScore(this.state);
      UI.updateTurn(this.state);
      UI.renderBoard(this.state);

      if (this.mode === 'ai') this.checkComments(player, r, c, flips);

      if (this.state.emptyCount() <= 10 && !this.endgameCommentShown) {
        this.endgameCommentShown = true;
        if (this.mode === 'ai') UI.showComment(UI.pickComment('endgame'));
      }

      this.advanceTurn();
    });
  },

  checkComments(player, r, c, flips) {
    if (this.mode !== 'ai') return;
    const aiColor = this.playerColor === BLACK ? WHITE : BLACK;
    const isAI = player === aiColor;

    if (this.state.isCorner(r, c)) {
      UI.showComment(UI.pickComment(isAI ? 'aiCorner' : 'playerCorner'));
      return;
    }

    if (flips.length >= 5 && isAI) {
      UI.showComment(UI.pickComment('bigFlip'));
      return;
    }

    const bc = this.state.count(BLACK);
    const wc = this.state.count(WHITE);
    const aiCount = aiColor === BLACK ? bc : wc;
    const playerCount = aiColor === BLACK ? wc : bc;
    const diff = aiCount - playerCount;

    if (diff <= -10) {
      UI.showComment(UI.pickComment('aiLosing'));
    } else if (diff >= 10) {
      UI.showComment(UI.pickComment('aiWinning'));
    } else if (isAI && Math.random() < 0.5) {
      const quips = [
        "Hmm, interesting position.",
        "I've calculated 47 moves ahead. Maybe 48.",
        "That was a solid move. For me.",
        "You're making this too easy. Or too hard. Depends.",
        "My neural pathways are tingling.",
        "Classic strategy. Can't go wrong with classics.",
        "I see what you did there. I just don't care.",
        "This is fine.",
        "Calculated.",
        "Trust the process."
      ];
      UI.showComment(quips[Math.floor(Math.random() * quips.length)]);
    } else if (!isAI && Math.random() < 0.3) {
      const quips = [
        "Not bad, not bad at all.",
        "I've seen worse. Barely.",
        "Okay, I'll give you that one.",
        "Hmm. Interesting choice.",
        "Was that deliberate? Impressive if so."
      ];
      UI.showComment(quips[Math.floor(Math.random() * quips.length)]);
    }
  },

  advanceTurn() {
    const current = this.state.currentPlayer;
    const opponent = this.state.opponent(current);
    const currentMoves = this.state.getLegalMoves(current);
    const opponentMoves = this.state.getLegalMoves(opponent);

    if (this.state.emptyCount() === 0) {
      this.endGame();
      return;
    }

    if (currentMoves.length > 0) {
      if (this.mode === 'ai' && current === (this.playerColor === BLACK ? WHITE : BLACK)) {
        this.scheduleAI();
      }
      return;
    }

    if (opponentMoves.length > 0) {
      const skippedName = current === BLACK ? 'Black' : 'White';
      const nextName = opponent === BLACK ? 'Black' : 'White';
      UI.showSkipAnnounce(`${skippedName} has no moves — ${nextName} plays again`);

      if (this.mode === 'ai' && current === (this.playerColor === BLACK ? WHITE : BLACK)) {
        UI.showComment(UI.pickComment('aiSkip'));
      } else if (this.mode === 'ai' && current === this.playerColor) {
        UI.showComment(UI.pickComment('playerSkip'));
      }

      this.state.currentPlayer = opponent;
      UI.updateTurn(this.state);
      UI.renderBoard(this.state);

      if (this.mode === 'ai' && opponent === (this.playerColor === BLACK ? WHITE : BLACK)) {
        this.scheduleAI();
      }
      return;
    }

    this.endGame();
  },

  scheduleAI() {
    this.aiThinking = true;
    UI.updateTurn(this.state);
    UI.renderBoard(this.state);

    const thinkTime = 300 + Math.random() * 300;

    setTimeout(() => {
      const aiColor = this.playerColor === BLACK ? WHITE : BLACK;
      const move = this.ai.getBestMove(this.state, aiColor);
      this.aiThinking = false;

      if (move) {
        this.executeMove(move[0], move[1]);
      } else {
        this.advanceTurn();
      }
    }, thinkTime);
    },

  endGame() {
    const bc = this.state.count(BLACK);
    const wc = this.state.count(WHITE);
    let result;
    const duration = Math.round((Date.now() - gameStartTime) / 1000);

    if (bc > wc) result = 'Black wins!';
    else if (wc > bc) result = 'White wins!';
    else result = "It's a draw!";

    // Save game result
    if (this.mode === 'ai' || this.mode === 'pvp') {
      const playerColor = this.mode === 'ai' ? this.playerColor : null;
      if (this.mode === 'ai' && Auth.isLoggedIn()) {
        const isBlack = this.playerColor === BLACK;
        const myScore = isBlack ? bc : wc;
        const oppScore = isBlack ? wc : bc;
        let saveResult;
        if (myScore > oppScore) saveResult = 'win';
        else if (myScore < oppScore) saveResult = 'loss';
        else saveResult = 'draw';

        Auth.saveGameResult(
          'ai',
          isBlack ? 'black' : 'white',
          saveResult,
          myScore,
          oppScore,
          this.difficulty,
          'AI',
          duration
        );
      } else if (this.mode === 'pvp' && Auth.isLoggedIn()) {
        // For local PvP, save as draw-like or just record it
        Auth.saveGameResult('pvp', 'black', bc > wc ? 'win' : (wc > bc ? 'loss' : 'draw'), bc, wc, null, 'Player 2', duration);
      }

      // Show save hint if not logged in
      if (!Auth.isLoggedIn()) {
        document.getElementById('save-hint').style.display = 'block';
      } else {
        document.getElementById('save-hint').style.display = 'none';
      }
    }

    if (this.mode === 'ai') {
      const aiColor = this.playerColor === BLACK ? WHITE : BLACK;
      const aiCount = aiColor === BLACK ? bc : wc;
      const playerCount = aiColor === BLACK ? wc : bc;

      if (aiCount > playerCount) UI.showComment(UI.pickComment('aiWin'));
      else if (playerCount > aiCount) UI.showComment(UI.pickComment('playerWin'));
      else UI.showComment(UI.pickComment('draw'));
    }

    UI.showGameOver(bc, wc, result);
  },
};
const OnlineGame = {
  socket: null,
  roomId: null,
  myColor: null,
  myNickname: '',
  connected: false,

  init() {
    if (this.socket) return;
    this.socket = io();

    this.socket.on('room-created', ({ roomId, color, nickname }) => {
      this.roomId = roomId;
      this.myColor = color;
      this.myNickname = nickname;
      document.getElementById('room-code-display').textContent = roomId;
      document.getElementById('waiting-subtitle').textContent = `You are ${color === BLACK ? '⚫ Black' : '⚪ White'}`;
      UI.hideOnlineMenu();
      document.getElementById('waiting-overlay').classList.add('active');
    });

    this.socket.on('room-error', (msg) => {
      document.getElementById('online-error').textContent = msg;
    });

    this.socket.on('room-joined', ({ roomId, color, nickname }) => {
      this.roomId = roomId;
      this.myColor = color;
      this.myNickname = nickname;
      this.connected = true;
      UI.hideOnlineMenu();
    });

    this.socket.on('game-start', ({ black, white }) => {
      document.getElementById('waiting-overlay').classList.remove('active');
      this.connected = true;
      Game.startOnline(black, white);
    });

    this.socket.on('board-state', (data) => {
      if (Game.state) {
        Game.state.grid = data.grid;
        Game.state.currentPlayer = data.currentPlayer;
        Game.state.lastMove = data.lastMove;
        UI.renderBoard(Game.state);
        UI.updateScore(Game.state);
        UI.updateTurn(Game.state);
      }
    });

    this.socket.on('move-made', (data) => {
      if (!Game.state) return;
      const { row, col, color, flips, currentPlayer, lastMove, skipped, skipMessage } = data;

      Game.state.grid[row][col] = color;
      for (const [fr, fc] of flips) {
        Game.state.grid[fr][fc] = color;
      }
      Game.state.currentPlayer = currentPlayer;
      Game.state.lastMove = lastMove;
      Game.state.moveCount++;

      UI.animatePlacement(row, col, color);
      UI.animateFlips(flips, color, () => {
        UI.updateScore(Game.state);
        UI.updateTurn(Game.state);
        UI.renderBoard(Game.state);
        if (skipped && skipMessage) {
          UI.showSkipAnnounce(skipMessage);
        }
      });

      UI.addMoveLog(color, row, col);
    });

    this.socket.on('game-over', ({ black, white }) => {
      if (!Game.state) return;
      Game.endGameOnline(black, white);
    });

    this.socket.on('opponent-disconnected', (nickname) => {
      const bar = document.createElement('div');
      bar.className = 'disconnect-bar';
      bar.textContent = `${nickname} disconnected. You can go back to menu.`;
      document.body.appendChild(bar);
      this.connected = false;
      setTimeout(() => bar.remove(), 10000);
    });

    this.socket.on('restart-requested', (nickname) => {
      const accepted = confirm(`${nickname} wants to play again. Accept?`);
      if (accepted) {
        this.socket.emit('restart-accept', this.roomId);
      }
    });

    this.socket.on('game-restarted', ({ black, white, players }) => {
      this.myColor = players[this.socket.id];
      Game.state = new BoardState();
      UI.clearMoveLog();
      UI.hideGameOver();
      UI.renderBoard(Game.state);
      UI.updateScore(Game.state);
      UI.updateTurn(Game.state);
      document.querySelectorAll('.disconnect-bar').forEach(el => el.remove());
      this.connected = true;
    });

    this.socket.on('chat-message', ({ nickname, message, color }) => {
      const panel = document.getElementById('chat-messages');
      const p = document.createElement('p');
      p.className = color === BLACK ? 'chat-black' : 'chat-white';
      p.innerHTML = `<strong>${nickname}:</strong> ${message}`;
      panel.appendChild(p);
      panel.scrollTop = panel.scrollHeight;
    });
  },

  createRoom() {
    this.init();
    const nickname = document.getElementById('online-nickname').value.trim() || 'Player 1';
    document.getElementById('online-error').textContent = '';
    this.socket.emit('create-room', nickname);
  },

  joinRoom() {
    this.init();
    const nickname = document.getElementById('online-nickname').value.trim() || 'Player 2';
    const code = document.getElementById('join-room-code').value.trim().toUpperCase();
    if (!code) {
      document.getElementById('online-error').textContent = 'Enter a room code';
      return;
    }
    document.getElementById('online-error').textContent = '';
    this.socket.emit('join-room', { roomId: code, nickname });
  },

  cancelRoom() {
    if (this.socket && this.roomId) {
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
      this.connected = false;
    }
    document.getElementById('waiting-overlay').classList.remove('active');
  },

  sendMove(row, col) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('make-move', { roomId: this.roomId, row, col });
  },

  requestRestart() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('restart-request', this.roomId);
  },

  sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || !this.socket || !this.roomId) return;
    this.socket.emit('chat-message', { roomId: this.roomId, message: msg });
    input.value = '';
  },

  showChat() {
    document.getElementById('chat-panel').style.display = 'flex';
  },

  hideChat() {
    document.getElementById('chat-panel').style.display = 'none';
  },

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomId = null;
    this.connected = false;
    this.hideChat();
    document.getElementById('chat-messages').innerHTML = '';
    document.querySelectorAll('.disconnect-bar').forEach(el => el.remove());
  }
};

// ── Init ──
UI.loadTheme();
Auth.init();
