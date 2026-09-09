/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  模块墓志铭
 * ═══════════════════════════════════════════════════════════════════════════
 * 模块名称: httpServer.js - HTTP 服务模块
 * 模块职责: 提供 HTTP 服务，返回手机端页面和本机 IP
 * 
 * 依赖模块:
 *   - http: Node.js HTTP 模块
 *   - fs: 文件系统操作
 *   - path: 路径处理
 *   - os: 操作系统信息
 * 
 * 生命周期:
 *   - createHttpServer(dirname): 创建 HTTP 服务（端口 8080）
 * 
 * 注意事项:
 *   - ✅ 不依赖任何自定义模块
 *   - ⚠️ 绝不能操作 DOM，绝不能操作渲染进程逻辑
 *   - ⚠️ 提供两个端点: / (手机页面), /ip (本机IP)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 安全增强：生成随机访问令牌
let accessToken = '';

function generateAccessToken() {
    accessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    console.log(`[SECURITY] 生成新的访问令牌: ${accessToken}`);
    return accessToken;
}

function getAccessToken() {
    return accessToken;
}

function createHttpServer(dirname) {
    const server = http.createServer((req, res) => {
        // 安全增强：检查访问令牌（除了二维码页面）
        if (req.url !== '/qrcode' && req.url !== '/') {
            const token = req.headers['x-access-token'] || req.url.split('token=')[1];
            if (!token || token !== accessToken) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '未授权访问，请先扫描二维码获取令牌' }));
                return;
            }
        }

        if (req.url === '/') {
            fs.readFile(path.join(dirname, 'mobile.html'), (err, data) => {
                if (err) { res.writeHead(404); res.end('Not Found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
        } else if (req.url === '/ip') {
            const interfaces = os.networkInterfaces();
            let ip = '127.0.0.1';
            for (const name in interfaces) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ip, token: accessToken }));
        } else if (req.url === '/qrcode') {
            // 返回二维码数据（包含 IP 和令牌）
            const interfaces = os.networkInterfaces();
            let ip = '127.0.0.1';
            for (const name in interfaces) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break; }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ip, port: 8083, token: accessToken }));
        } else {
            res.writeHead(404); res.end();
        }
    });
    // 默认监听本地，如需远程访问需手动开启
    server.listen(8080, '127.0.0.1', () => console.log('✅ HTTP 服务已启动，端口 8080（仅本地访问）'));
}

module.exports = { createHttpServer, generateAccessToken, getAccessToken };
