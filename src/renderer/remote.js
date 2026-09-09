/**
 * remote.js - 手机遥控入口（桌面端扫码连接）
 *
 * - 右下角 📱 按钮（与 ✉ 信箱按钮并排）
 * - 点击弹面板：实时算出局域网连接地址，渲染成二维码
 * - 手机相机/扫一扫扫一下即可进遥控页，免去查 IP、手敲地址
 * - 纯本地、数据不出电脑，与 ✉ 按钮同一安全级别
 *
 * 依赖：libs/qrcode-generator.min.js（全局 window.qrcode）
 *       主进程 get-remote-url 通道（复用 getLanIp 实时算 LAN IP）
 */
(function () {
  'use strict';

  var API = null;
  var panelEl = null, imgEl = null, urlEl = null, toastEl = null;
  var panelOpen = false;

  function api() {
    if (!API) API = window.electronAPI || null;
    return API;
  }

  function init() {
    buildUI();
  }

  function buildUI() {
    // ---- 面板 ----
    panelEl = document.createElement('div');
    panelEl.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:240px;background:#fff;border:1px solid #ddd;border-radius:14px;z-index:10010;' +
      'display:none;flex-direction:column;align-items:center;padding:14px;box-sizing:border-box;' +
      'box-shadow:0 6px 22px rgba(0,0,0,0.3);-webkit-app-region:no-drag;' +
      'font-family:"Segoe UI","Noto Sans CJK SC",sans-serif;color:#333;';

    var head = document.createElement('div');
    head.style.cssText = 'width:100%;display:flex;justify-content:space-between;' +
      'align-items:center;font-size:14px;font-weight:600;margin-bottom:8px;';
    head.innerHTML = '<span>手机遥控 · 扫码连接</span>';
    var close = document.createElement('span');
    close.textContent = '×';
    close.style.cssText = 'cursor:pointer;font-size:20px;color:#888;padding:0 4px;line-height:1;';
    close.addEventListener('click', togglePanel);
    head.appendChild(close);
    panelEl.appendChild(head);

    imgEl = document.createElement('img');
    imgEl.id = 'xhQrImg';
    imgEl.style.cssText = 'width:180px;height:180px;background:#fff;border:1px solid #eee;' +
      'border-radius:8px;display:none;';
    panelEl.appendChild(imgEl);

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#999;margin:8px 0 2px;text-align:center;';
    hint.textContent = '手机相机/扫一扫扫上方二维码';
    panelEl.appendChild(hint);

    urlEl = document.createElement('div');
    urlEl.id = 'xhRemoteUrl';
    urlEl.style.cssText = 'font-size:11px;color:#555;word-break:break-all;text-align:center;' +
      'background:#f5f5f5;border-radius:6px;padding:5px 7px;max-width:212px;' +
      'user-select:text;-webkit-user-select:text;';
    urlEl.textContent = '正在获取地址…';
    panelEl.appendChild(urlEl);

    var copyBtn = document.createElement('button');
    copyBtn.textContent = '复制链接';
    copyBtn.style.cssText = 'margin-top:10px;height:32px;width:100%;border:none;border-radius:8px;' +
      'background:#534ab7;color:#fff;font-size:13px;cursor:pointer;';
    copyBtn.addEventListener('click', function () {
      copyText((urlEl.textContent || '').trim());
    });
    panelEl.appendChild(copyBtn);

    var tip = document.createElement('div');
    tip.style.cssText = 'font-size:10px;color:#bbb;margin-top:8px;text-align:center;line-height:1.4;';
    tip.textContent = '如手机连不上：电脑需放行防火墙 8080/8083 端口（见使用说明第九节）';
    panelEl.appendChild(tip);

    // ---- 轻提示 ----
    toastEl = document.createElement('div');
    toastEl.style.cssText = 'position:fixed;left:50%;bottom:60px;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.78);color:#fff;font-size:12px;padding:6px 12px;border-radius:16px;' +
      'z-index:10012;display:none;pointer-events:none;-webkit-app-region:no-drag;';

    document.body.appendChild(panelEl);
    document.body.appendChild(toastEl);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    panelEl.style.display = panelOpen ? 'flex' : 'none';
    if (panelOpen) {
      imgEl.style.display = 'none';
      urlEl.textContent = '正在获取地址…';
      refresh();
    }
  }

  function refresh() {
    var a = api();
    var done = function (url) {
      urlEl.textContent = url || '(无法获取局域网地址)';
      if (url) renderQR(url);
    };
    if (!a || typeof a.invoke !== 'function') {
      done(null);
      return;
    }
    a.invoke('get-remote-url').then(done).catch(function () { done(null); });
  }

  function renderQR(url) {
    try {
      if (typeof window.qrcode !== 'function') { imgEl.style.display = 'none'; return; }
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      imgEl.src = qr.createDataURL(6, 8); // GIF data URL
      imgEl.style.display = 'block';
    } catch (e) {
      console.error('[remote] 二维码生成失败:', e);
      imgEl.style.display = 'none';
    }
  }

  function copyText(text) {
    text = (text || '').trim();
    if (!text) { flash('没有可复制的链接'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { flash('已复制到剪贴板'); })
        .catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flash('已复制到剪贴板');
    } catch (e) {
      flash('复制失败，请手动长按链接');
    }
  }

  var toastTimer = null;
  function flash(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.display = 'none'; }, 1600);
  }

  window.XHRemote = { toggle: togglePanel };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
