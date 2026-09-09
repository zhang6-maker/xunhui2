// ==================== 游戏模块 ====================
// 依赖: window.CONFIG, window.UI, window.STORAGE, window.DEPENDENCIES

// ==================== 游戏结果反馈 ====================
window.DEPENDENCIES.ipcRenderer.on('game-result', (event, data) => {
    const { game, result } = data;
    
    let reactionText = '';
    let emotionType = 'neutral';
    const reactions = window.CONFIG.GAME_REACTIONS;
    
    if (result === 'player') {
        const winReactions = reactions.player;
        reactionText = winReactions[Math.floor(Math.random() * winReactions.length)];
        emotionType = 'comfort';
    } else if (result === 'ai') {
        const loseReactions = reactions.ai;
        reactionText = loseReactions[Math.floor(Math.random() * loseReactions.length)];
        emotionType = 'taunt';
    } else if (result === 'draw') {
        reactionText = reactions.draw;
        emotionType = 'neutral';
    }
    
    window.UI.showBubble(reactionText, 4000, emotionType, true);
    window.STORAGE.autoDiary(game, result === 'player' ? '赢' : (result === 'ai' ? '输' : '平'));
});

// 导出游戏模块
window.GAME = {
    // 游戏结果处理已在上面 ipcRenderer.on 中实现
};