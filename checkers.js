const ipcRenderer = {
    send: (channel, ...args) => window.electronAPI.send(channel, ...args)
};

// 发送游戏结果给主窗口
function sendGameResult(result) {
    ipcRenderer.send('game-result', { game: 'checkers', result: result });
}

const canvas = document.getElementById('checkersCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

const CHECKERS_SIZE = 8;
let board = [];
let gameOver = false;
let currentTurn = 'player';
let selectedRow = -1, selectedCol = -1;

function initBoard() {
    board = Array(CHECKERS_SIZE).fill().map(() => Array(CHECKERS_SIZE).fill(0));
    for (let row = 0; row < 3; row++)
        for (let col = 0; col < CHECKERS_SIZE; col++)
            if ((row + col) % 2 === 1) board[row][col] = 1;
    for (let row = CHECKERS_SIZE - 3; row < CHECKERS_SIZE; row++)
        for (let col = 0; col < CHECKERS_SIZE; col++)
            if ((row + col) % 2 === 1) board[row][col] = 2;
    gameOver = false;
    currentTurn = 'player';
    selectedRow = selectedCol = -1;
    statusDiv.innerText = '你的回合';
    drawBoard();
}

function drawBoard() {
    const size = 360 / CHECKERS_SIZE;
    ctx.clearRect(0, 0, 360, 360);
    for (let row = 0; row < CHECKERS_SIZE; row++) {
        for (let col = 0; col < CHECKERS_SIZE; col++) {
            const x = col * size, y = row * size;
            ctx.fillStyle = (row + col) % 2 === 0 ? '#F0D9B5' : '#B58863';
            ctx.fillRect(x, y, size, size);
            const val = board[row][col];
            if (val !== 0) {
                const cx = x + size / 2, cy = y + size / 2, r = size * 0.4;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                ctx.fillStyle = val === 1 ? '#333' : '#FFF';
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.stroke();
                if (selectedRow === row && selectedCol === col) {
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r + 2, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.lineWidth = 1;
                }
            }
        }
    }
}

function isValidMove(row, col, newRow, newCol, playerVal) {
    if (newRow < 0 || newRow >= CHECKERS_SIZE || newCol < 0 || newCol >= CHECKERS_SIZE) return false;
    if (board[newRow][newCol] !== 0) return false;
    const rowDiff = newRow - row, colDiff = Math.abs(newCol - col);
    if (colDiff !== 1) return false;
    if (playerVal === 1 && rowDiff !== 1) return false;
    if (playerVal === 2 && rowDiff !== -1) return false;
    return true;
}

function isValidJump(row, col, newRow, newCol, playerVal) {
    const midRow = (row + newRow) / 2, midCol = (col + newCol) / 2;
    if (midRow % 1 !== 0 || midCol % 1 !== 0) return false;
    const rowDiff = newRow - row, colDiff = Math.abs(newCol - col);
    if (Math.abs(rowDiff) !== 2 || colDiff !== 2) return false;
    const midVal = board[midRow][midCol];
    if (midVal === 0 || midVal === playerVal) return false;
    if (board[newRow][newCol] !== 0) return false;
    if (playerVal === 1 && rowDiff < 0) return false;
    if (playerVal === 2 && rowDiff > 0) return false;
    return true;
}

function getAllValidMoves(playerVal) {
    let moves = [];
    for (let row = 0; row < CHECKERS_SIZE; row++) {
        for (let col = 0; col < CHECKERS_SIZE; col++) {
            if (board[row][col] === playerVal) {
                for (let dr of [-2, 2]) {
                    for (let dc of [-2, 2]) {
                        const nr = row + dr, nc = col + dc;
                        if (isValidJump(row, col, nr, nc, playerVal))
                            moves.push({ row, col, newRow: nr, newCol: nc, isJump: true });
                    }
                }
                if (moves.length === 0) {
                    const dr = (playerVal === 1) ? 1 : -1;
                    for (let dc of [-1, 1]) {
                        const nr = row + dr, nc = col + dc;
                        if (isValidMove(row, col, nr, nc, playerVal))
                            moves.push({ row, col, newRow: nr, newCol: nc, isJump: false });
                    }
                }
            }
        }
    }
    return moves;
}

function applyMove(move) {
    const { row, col, newRow, newCol, isJump } = move;
    const playerVal = board[row][col];
    board[newRow][newCol] = playerVal;
    board[row][col] = 0;
    if (isJump) {
        const midRow = (row + newRow) / 2, midCol = (col + newCol) / 2;
        board[midRow][midCol] = 0;
    }
    drawBoard();
}

function checkWin() {
    let hasPlayer = false, hasAI = false;
    for (let row = 0; row < CHECKERS_SIZE; row++) {
        for (let col = 0; col < CHECKERS_SIZE; col++) {
            if (board[row][col] === 1) hasPlayer = true;
            if (board[row][col] === 2) hasAI = true;
        }
    }
    if (!hasPlayer) return 'ai';
    if (!hasAI) return 'player';
    return null;
}

function aiMove() {
    if (gameOver || currentTurn !== 'ai') return;
    let moves = getAllValidMoves(2);
    if (moves.length === 0) {
        gameOver = true;
        statusDiv.innerText = '你赢了！';
        sendGameResult('player');
        return;
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    applyMove(move);
    const winner = checkWin();
    if (winner) {
        gameOver = true;
        if (winner === 'ai') {
            statusDiv.innerText = 'AI 赢了！';
            sendGameResult('ai');
        } else {
            statusDiv.innerText = '你赢了！';
            sendGameResult('player');
        }
        return;
    }
    currentTurn = 'player';
    statusDiv.innerText = '你的回合';
}

canvas.addEventListener('click', (e) => {
    if (gameOver || currentTurn !== 'player') return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scale;
    const mouseY = (e.clientY - rect.top) * scale;
    const cellSize = 360 / CHECKERS_SIZE;
    const col = Math.floor(mouseX / cellSize);
    const row = Math.floor(mouseY / cellSize);
    if (row < 0 || row >= CHECKERS_SIZE || col < 0 || col >= CHECKERS_SIZE) return;

    if (selectedRow === -1) {
        if (board[row][col] === 1) {
            selectedRow = row;
            selectedCol = col;
            drawBoard();
        }
    } else {
        const fromRow = selectedRow, fromCol = selectedCol;
        let valid = false, move = null;
        if (isValidJump(fromRow, fromCol, row, col, 1)) {
            valid = true;
            move = { row: fromRow, col: fromCol, newRow: row, newCol: col, isJump: true };
        } else if (isValidMove(fromRow, fromCol, row, col, 1)) {
            valid = true;
            move = { row: fromRow, col: fromCol, newRow: row, newCol: col, isJump: false };
        }
        if (valid) {
            applyMove(move);
            selectedRow = selectedCol = -1;
            const winner = checkWin();
            if (winner) {
                gameOver = true;
                if (winner === 'player') {
                    statusDiv.innerText = '你赢了！';
                    sendGameResult('player');
                } else {
                    statusDiv.innerText = '寻慧赢了！';
                    sendGameResult('ai');
                }
                return;
            }
            currentTurn = 'ai';
            statusDiv.innerText = 'AI 思考中...';
            setTimeout(aiMove, 500);
        } else {
            selectedRow = selectedCol = -1;
            drawBoard();
            statusDiv.innerText = '无效走法，重试';
        }
    }
});

document.getElementById('resetBtn').addEventListener('click', initBoard);
document.getElementById('closeBtn').addEventListener('click', () => {
    ipcRenderer.send('close-checkers');
});

initBoard();