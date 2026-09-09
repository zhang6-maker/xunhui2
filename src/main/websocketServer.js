/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: websocketServer.js - WebSocket 服务模块
 * 模块职责: 管理 WebSocket 服务，接收手机端消息并转发给渲染进程
 * 
 * 依赖模块:
 *   - ws: WebSocket 库
 *   - win: 主进程的 BrowserWindow 对象（通过参数传入）
 * 
 * 生命周期:
 *   - createWebSocketServer(win): 创建 WebSocket 服务（端口 8083）
 *   - getWss(): 获取 WebSocket.Server 实例
 * 
 * 注意事项:
 *   - ✅ 只认识主进程的 win 对象
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 消息格式: JSON { type, ... }
 * ═══════════════════════════════════════════════════════════════════════════
 */

const WebSocket = require('ws');

let wss = null;
let expectedToken = '';

function setAccessToken(token) {
    expectedToken = token;
}

function createWebSocketServer(win) {
    // 便携版：监听 0.0.0.0，允许同一 WiFi 下的手机连接（靠 token 鉴权）
    wss = new WebSocket.Server({ port: 8083, host: '0.0.0.0' });
    wss.on('connection', (ws, req) => {
        // 安全增强：验证访问令牌
        const urlParams = new URLSearchParams(req.url.slice(1));
        const token = urlParams.get('token');
        
        if (!token || token !== expectedToken) {
            ws.close(1008, '未授权访问');
            console.warn(`[SECURITY] 拒绝未授权的 WebSocket 连接`);
            return;
        }
        
        console.log('[SECURITY] WebSocket 连接已授权');
        
        ws.on('message', message => {
            try {
                const data = JSON.parse(message);
                // 兼容两种字段名：移动端发 action，内部用 type
                const hasKey = data && (typeof data.type === 'string' || typeof data.action === 'string');
                if (hasKey) {
                    if (win) win.webContents.send('mobile-command', data);
                } else {
                    console.warn(`[SECURITY] 无效的消息格式`);
                }
            } catch (_) {}
        });
    });
    console.log('✅ WebSocket 服务已启动，端口 8083（局域网可访问，需 token）');
}

// 广播消息给所有已连接的遥控端
function broadcast(payload) {
    if (!wss) return 0;
    let sent = 0;
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try { client.send(text); sent++; } catch (_) {}
        }
    });
    return sent;
}

function getWss() {
    return wss;
}

module.exports = { createWebSocketServer, getWss, setAccessToken, broadcast };
