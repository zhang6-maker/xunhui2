/**
 * toolsLauncher.js - 工具箱入口（传话信箱 + 手机遥控）
 *
 * 设计：把原来常驻右下角的两个浮窗按钮（✉ / 📱）收进「对寻慧说」输入框的
 * 头部，做成点击才展开的弹出菜单。平时不占桌面空间，点输入框里的 🧰 才出现。
 *
 * - mountHeaderLauncher(container): 在输入框头部挂一个 🧰 触发按钮
 * - setBadge(n) / clearBadge(): 信箱未读红点（挂在 🧰 上）
 * 点击 ✉ / 📱 分别调用 window.XHMailbox.toggle() / window.XHRemote.toggle()
 */
(function () {
  'use strict';

  var popover = null;
  var headerBtn = null;
  var badgeEl = null;

  function btnCss() {
    return 'display:flex;align-items:center;justify-content:center;gap:6px;width:160px;' +
      'height:38px;border:none;border-radius:10px;background:#534ab7;color:#fff;' +
      'font-size:14px;cursor:pointer;';
  }

  function ensurePopover() {
    if (popover) return popover;
    popover = document.createElement('div');
    popover.id = 'xhToolsPopover';
    popover.style.cssText = 'position:fixed;display:none;flex-direction:column;gap:8px;' +
      'background:rgba(30,30,40,0.95);border:2px solid #ff99cc;border-radius:14px;padding:10px;' +
      'box-shadow:0 6px 22px rgba(0,0,0,0.35);z-index:10011;' +
      'font-family:system-ui,"Segoe UI","Noto Sans CJK SC",sans-serif;';

    var m = document.createElement('button');
    m.textContent = '✉ 传话信箱';
    m.style.cssText = btnCss();
    m.addEventListener('click', function () {
      hide();
      if (window.XHMailbox && window.XHMailbox.toggle) window.XHMailbox.toggle();
    });

    var r = document.createElement('button');
    r.textContent = '📱 手机遥控';
    r.style.cssText = btnCss();
    r.addEventListener('click', function () {
      hide();
      if (window.XHRemote && window.XHRemote.toggle) window.XHRemote.toggle();
    });

    popover.appendChild(m);
    popover.appendChild(r);
    document.body.appendChild(popover);
    return popover;
  }

  function hide() {
    if (popover) popover.style.display = 'none';
    if (headerBtn) {
      headerBtn.textContent = '🧰';
    }
  }

  function togglePopover(anchor) {
    ensurePopover();
    if (popover.style.display === 'flex') { hide(); return; }
    popover.style.display = 'flex';
    var ph = popover.offsetHeight || 90;
    var pw = popover.offsetWidth || 180;
    var rect = anchor.getBoundingClientRect();
    var top = rect.bottom + 8;
    if (top + ph > window.innerHeight) top = rect.top - ph - 8;
    if (top < 6) top = 6;
    var left = rect.left;
    if (left + pw > window.innerWidth) left = window.innerWidth - pw - 6;
    if (left < 6) left = 6;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    headerBtn.textContent = '✕';
  }

  window.XHTools = {
    mountHeaderLauncher: function (container) {
      if (!container || headerBtn) return;
      var b = document.createElement('span');
      b.id = 'xhToolsLauncher';
      b.textContent = '🧰';
      b.title = '工具箱：传话信箱 / 手机遥控';
      b.style.cssText = 'cursor:pointer;font-size:18px;position:relative;';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePopover(b);
      });
      container.appendChild(b);
      headerBtn = b;
    },
    setBadge: function (n) {
      if (!headerBtn) return;
      if (!badgeEl) {
        badgeEl = document.createElement('span');
        badgeEl.style.cssText = 'position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;' +
          'background:#e24b4a;color:#fff;border-radius:8px;font-size:11px;line-height:16px;' +
          'text-align:center;padding:0 4px;';
        headerBtn.appendChild(badgeEl);
      }
      badgeEl.style.display = 'block';
      badgeEl.textContent = (n > 99) ? '99+' : String(n);
    },
    clearBadge: function () {
      if (badgeEl) badgeEl.style.display = 'none';
    }
  };
})();
