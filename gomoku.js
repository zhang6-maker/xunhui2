const ipcRenderer = {
    send: (channel, ...args) => window.electronAPI.send(channel, ...args)
};

// 发送游戏结果给主窗口
function sendGameResult(result) {
    ipcRenderer.send('game-result', { game: 'gomoku', result: result });
}

const canvas = document.getElementById('gomokuCanvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');

const boardSize = 15;
const cellSize = 20;
let board = [];
let gameOver = false;
let currentTurn = 'player';

function initBoard() {
    board = Array(boardSize).fill().map(() => Array(boardSize).fill(0));
    gameOver = false;
    currentTurn = 'player';
    statusDiv.innerText = '你的回合';
    drawBoard();
}

function drawBoard() {
    ctx.clearRect(0, 0, 300, 300);
    ctx.strokeStyle = '#000';
    for (let i = 0; i < boardSize; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, 300);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(300, i * cellSize);
        ctx.stroke();
    }
    for (let i = 0; i < boardSize; i++) {
        for (let j = 0; j < boardSize; j++) {
            if (board[i][j] === 1) {
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(i * cellSize, j * cellSize, 8, 0, 2*Math.PI);
                ctx.fill();
            } else if (board[i][j] === 2) {
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(i * cellSize, j * cellSize, 8, 0, 2*Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.stroke();
            }
        }
    }
}

function checkWin(x, y, playerVal) {
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let [dx, dy] of dirs) {
        let count = 1;
        for (let step = 1; step <= 4; step++) {
            const nx = x + dx*step, ny = y + dy*step;
            if (nx<0 || nx>=boardSize || ny<0 || ny>=boardSize) break;
            if (board[nx][ny] === playerVal) count++; else break;
        }
        for (let step = 1; step <= 4; step++) {
            const nx = x - dx*step, ny = y - dy*step;
            if (nx<0 || nx>=boardSize || ny<0 || ny>=boardSize) break;
            if (board[nx][ny] === playerVal) count++; else break;
        }
        if (count >= 5) return true;
    }
    return false;
}

function isFull() {
    for (let i=0; i<boardSize; i++)
        for (let j=0; j<boardSize; j++)
            if (board[i][j] === 0) return false;
    return true;
}

function evaluatePosition(x, y, playerVal) {
    let totalScore = 0;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let [dx, dy] of dirs) {
        let count = 1;
        for (let step=1; step<=4; step++) {
            const nx = x + dx*step, ny = y + dy*step;
            if (nx<0 || nx>=boardSize || ny<0 || ny>=boardSize) break;
            if (board[nx][ny] === playerVal) count++; else break;
        }
        for (let step=1; step<=4; step++) {
            const nx = x - dx*step, ny = y - dy*step;
            if (nx<0 || nx>=boardSize || ny<0 || ny>=boardSize) break;
            if (board[nx][ny] === playerVal) count++; else break;
        }
        if (count >= 5) totalScore += 10000;
        else if (count === 4) totalScore += 1000;
        else if (count === 3) totalScore += 100;
        else if (count === 2) totalScore += 10;
    }
    return totalScore;
}

function aiMove() {
    if (gameOver || currentTurn !== 'ai') return;
    let bestScore = -1, bestMove = null;
    for (let i=0; i<boardSize; i++) {
        for (let j=0; j<boardSize; j++) {
            if (board[i][j] === 0) {
                let score = evaluatePosition(i, j, 2);
                let defendScore = evaluatePosition(i, j, 1);
                let total = score + defendScore * 0.8;
                if (total > bestScore) {
                    bestScore = total;
                    bestMove = [i, j];
                }
            }
        }
    }
    if (bestMove) {
        const [x, y] = bestMove;
        board[x][y] = 2;
        drawBoard();
        if (checkWin(x, y, 2)) {
            gameOver = true;
            statusDiv.innerText = 'AI 赢了！';
            sendGameResult('ai');
            return;
        }
        if (isFull()) {
            gameOver = true;
            statusDiv.innerText = '平局！';
            sendGameResult('draw');
            return;
        }
        currentTurn = 'player';
        statusDiv.innerText = '你的回合';
    }
}

canvas.addEventListener('click', (e) => {
    if (gameOver || currentTurn !== 'player') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const x = Math.round(mouseX / cellSize);
    const y = Math.round(mouseY / cellSize);
    if (x<0 || x>=boardSize || y<0 || y>=boardSize) return;
    if (board[x][y] !== 0) return;

    board[x][y] = 1;
    drawBoard();
    if (checkWin(x, y, 1)) {
        gameOver = true;
        statusDiv.innerText = '你赢了！';
        sendGameResult('player');
        return;
    }
    if (isFull()) {
        gameOver = true;
        statusDiv.innerText = '平局！';
        sendGameResult('draw');
        return;
    }
    currentTurn = 'ai';
    statusDiv.innerText = '寻慧思考中...';
    setTimeout(aiMove, 300);
});

document.getElementById('resetBtn').addEventListener('click', initBoard);
document.getElementById('closeBtn').addEventListener('click', () => {
    ipcRenderer.send('close-gomoku');
});

initBoard();