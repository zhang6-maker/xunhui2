/**
 * mailbox.js - 传话信箱（寻慧 <-> WorkBuddy）
 *
 * 信箱位置：<homedir>/mailbox/（便携模式下就是 U 盘的 UserData\Home\mailbox）
 *   outbox\  寻慧写给 WorkBuddy 的消息（*.json）
 *   inbox\   WorkBuddy 写给寻慧的消息（*.json）
 *   sent\    已处理归档
 *
 * 设计原则：自包含，不依赖其他 renderer 模块，不改任何既有逻辑。
 */
(function () {
  'use strict';

  var API = null;
  var root = null, outboxDir = null, inboxDir = null;
  var seen = {};          // 已显示过的 inbox 消息 id
  var panelEl = null, listEl = null, inputEl = null, badgeEl = null;
  var unread = 0;

  function api() {
    if (!API) API = window.electronAPI || null;
    return API;
  }

  function stamp() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function init() {
    if (!api()) { console.warn('[mailbox] electronAPI 不可用'); return; }
    var home = api().homedir();
    if (!home) { console.warn('[mailbox] 无法获取 homedir'); return; }

    root = api().pathJoin(home, 'mailbox');
    outboxDir = api().pathJoin(root, 'outbox');
    inboxDir = api().pathJoin(root, 'inbox');

    if (api().mailboxEnsure) { api().mailboxEnsure(); }

    buildUI();

    // 只在首次启动打招呼，避免信箱堆积
    var greeted = '';
    try { greeted = window.localStorage.getItem('xh_mailbox_hello') || ''; } catch (e) {}
    if (!greeted) {
      say('寻慧已就绪，随时可以传话给 WorkBuddy。', 'system');
      try { window.localStorage.setItem('xh_mailbox_hello', '1'); } catch (e) {}
    }

    setInterval(pollInbox, 4000);
    pollInbox();
  }

  // ---------- 出站：寻慧 -> WorkBuddy ----------
  function say(text, kind) {
    if (!outboxDir || !text) return;
    var id = stamp() + '-' + Math.random().toString(36).slice(2, 6);
    var msg = {
      id: id,
      from: 'xunhui',
      to: 'workbuddy',
      time: new Date().toISOString(),
      kind: kind || 'user',
      text: text
    };
    try {
      api().fsWriteFileSync(
        api().pathJoin(outboxDir, id + '.json'),
        JSON.stringify(msg, null, 2),
        'utf8'
      );
      appendLocal('我', text);
    } catch (e) {
      console.error('[mailbox] 写入 outbox 失败:', e);
    }
  }

  // ---------- 入站：WorkBuddy -> 寻慧 ----------
  function pollInbox() {
    if (!inboxDir || !api().fsReaddirSync) return;
    var files = [];
    try { files = api().fsReaddirSync(inboxDir) || []; } catch (e) { return; }

    files.sort();
    for (var i = 0; i < files.length; i++) {
      var name = files[i];
      var id = name.replace(/\.json$/i, '');
      if (seen[id]) continue;
      seen[id] = 1;

      var raw = null;
      try { raw = api().fsReadFileSync(api().pathJoin(inboxDir, name), 'utf8'); } catch (e) { continue; }
      if (!raw) continue;

      var msg = null;
      try { msg = JSON.parse(raw); } catch (e) { continue; }
      if (!msg) continue;

      // 已读标记写回文件：换设备或重启后内存里的 seen 会丢失，靠它避免重复弹消息
      if (msg.read) continue;
      msg.read = true;
      try {
        api().fsWriteFileSync(
          api().pathJoin(inboxDir, name),
          JSON.stringify(msg, null, 2),
          'utf8'
        );
      } catch (e) {}

      console.log('[MAILBOX] 收到 inbox 消息:', id, JSON.stringify(msg.text || ''));
      appendLocal(msg.from === 'workbuddy' ? 'WorkBuddy' : (msg.from || '?'), msg.text || '');
      bumpUnread();
      if (typeof window.showBubble === 'function' && msg.text) {
        try { window.showBubble(String(msg.text).slice(0, 60)); } catch (e) {}
      }
    }
  }

  // ---------- UI ----------
  function buildUI() {
    panelEl = document.createElement('div');
    panelEl.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:400px;' +
      'background:#fff;border:1px solid #ddd;border-radius:12px;z-index:10010;display:none;' +
      'flex-direction:column;padding:10px;box-sizing:border-box;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.25);-webkit-app-region:no-drag;' +
      'font-family:"Segoe UI","Noto Sans CJK SC",sans-serif;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
      'font-size:14px;font-weight:500;margin-bottom:6px;color:#333;';
    head.innerHTML = '<span>传话信箱</span>';
    var close = document.createElement('span');
    close.textContent = '×';
    close.style.cssText = 'cursor:pointer;font-size:18px;color:#888;padding:0 4px;';
    close.addEventListener('click', togglePanel);
    head.appendChild(close);
    panelEl.appendChild(head);

    listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;font-size:12px;line-height:1.5;' +
      'border:1px solid #eee;border-radius:8px;padding:6px;margin-bottom:6px;color:#333;' +
      'word-break:break-word;';
    panelEl.appendChild(listEl);

    inputEl = document.createElement('textarea');
    inputEl.placeholder = '想让 WorkBuddy 做什么？回车发送';
    inputEl.style.cssText = 'height:56px;border:1px solid #ddd;border-radius:8px;padding:6px;' +
      'font-size:12px;resize:none;font-family:inherit;outline:none;';
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    panelEl.appendChild(inputEl);

    var sendBtn = document.createElement('button');
    sendBtn.textContent = '发送';
    sendBtn.style.cssText = 'margin-top:6px;height:30px;border:none;border-radius:8px;' +
      'background:#534ab7;color:#fff;font-size:13px;cursor:pointer;';
    sendBtn.addEventListener('click', submit);
    panelEl.appendChild(sendBtn);

    document.body.appendChild(panelEl);
  }

  function togglePanel() {
    if (!panelEl) return;
    panelOpen = !panelOpen;
    panelEl.style.display = panelOpen ? 'flex' : 'none';
    if (panelOpen) {
      unread = 0;
      if (window.XHTools) window.XHTools.clearBadge();
      setTimeout(function () { if (inputEl) inputEl.focus(); }, 30);
    }
  }

  var panelOpen = false;

  function submit() {
    if (!inputEl) return;
    var text = (inputEl.value || '').trim();
    if (!text) return;
    say(text, 'user');
    inputEl.value = '';
  }

  function appendLocal(who, text) {
    if (!listEl) return;
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:6px;';
    row.innerHTML = '<div style="color:#888;font-size:11px;">' + escapeHtml(who) + '</div>' +
      '<div>' + escapeHtml(text) + '</div>';
    listEl.appendChild(row);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bumpUnread() {
    unread++;
    if (!panelOpen && window.XHTools && window.XHTools.setBadge) {
      window.XHTools.setBadge(unread > 99 ? 99 : unread);
    }
  }

  window.XHMailbox = { say: say, poll: pollInbox, toggle: togglePanel };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
