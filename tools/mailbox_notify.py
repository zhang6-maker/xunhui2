#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
寻慧信箱提醒 —— 纯本地版（零积分）

用 Windows 任务计划程序定时跑这个脚本：
  - 扫描所有盘符找信箱（U 盘盘符变到哪都能找到）
  - outbox 有新消息就弹一个系统对话框提醒你
  - 已经提醒过的不再重复弹

它只负责"通知你有信"，不调用任何 AI，所以不消耗积分。
看到提醒后，你来找 WorkBuddy 处理即可。

用法：
    python mailbox_notify.py           正常跑（有新消息就弹窗）
    python mailbox_notify.py --dry-run 只打印不弹窗（测试用）
    python mailbox_notify.py --reset   清空已提醒记录
"""

import ctypes
import glob
import json
import os
import string
import sys

STATE_DIR = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'XunHuiMailbox')
STATE_FILE = os.path.join(STATE_DIR, 'notified.json')
MB_OK = 0x00000000
MB_TOPMOST = 0x00040000
MB_SETFOREGROUND = 0x00010000


LAST_FILE = os.path.join(STATE_DIR, 'last_mailbox.txt')


def find_mailbox():
    """定位信箱：优先用上次记住的路径，否则扫描各盘符（U 盘盘符变到哪都能找到）"""
    try:
        with open(LAST_FILE, 'r', encoding='utf-8') as f:
            last = f.read().strip()
        if last and os.path.isdir(last):
            return last
    except Exception:
        pass

    # 先找 GirlPet-Portable 目录（最多深入 3 层），再往下拼固定结构
    for d in string.ascii_uppercase:
        root = d + ':' + os.sep
        if not os.path.isdir(root):
            continue
        max_depth = 1 if d == 'C' else 3
        for dirpath, dirnames, _files in os.walk(root):
            if dirpath[len(root):].count(os.sep) >= max_depth:
                dirnames[:] = []
                continue
            if os.path.basename(dirpath) == 'GirlPet-Portable':
                # 只要 UserData\Home 在就算命中（mailbox 目录可能还没被创建）
                if os.path.isdir(os.path.join(dirpath, 'UserData', 'Home')):
                    cand = os.path.join(dirpath, 'UserData', 'Home', 'mailbox')
                    try:
                        os.makedirs(STATE_DIR, exist_ok=True)
                        with open(LAST_FILE, 'w', encoding='utf-8') as f:
                            f.write(cand)
                    except Exception:
                        pass
                    return cand

    tail = os.path.join('UserData', 'Home', 'mailbox')
    for pat in (os.path.join('C:' + os.sep, 'GirlPet-Portable', tail),
                os.path.join('C:' + os.sep, '*', 'GirlPet-Portable', tail)):
        for hit in sorted(glob.glob(pat)):
            if os.path.isdir(hit):
                return hit
    return None


def load_state():
    try:
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return set(json.load(f))
    except Exception:
        return set()


def save_state(ids):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(sorted(ids), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('[警告] 无法写入状态文件:', e)


def pending_messages(mailbox, notified):
    out = []
    outbox = os.path.join(mailbox, 'outbox')
    if not os.path.isdir(outbox):
        return out
    for name in sorted(os.listdir(outbox)):
        if not name.lower().endswith('.json'):
            continue
        path = os.path.join(outbox, name)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                msg = json.load(f)
        except Exception:
            continue
        mid = msg.get('id') or name
        if mid in notified or msg.get('kind') == 'system' and msg.get('text', '').startswith('寻慧已就绪'):
            continue
        msg['_id'] = mid
        out.append(msg)
    return out


def popup(title, text):
    try:
        ctypes.windll.user32.MessageBoxW(0, text, title, MB_OK | MB_TOPMOST | MB_SETFOREGROUND)
    except Exception as e:
        print('[警告] 弹窗失败:', e)


def main():
    dry = '--dry-run' in sys.argv
    reset = '--reset' in sys.argv

    if reset:
        try:
            os.remove(STATE_FILE)
            print('已清空提醒记录')
        except Exception:
            print('没有可清空的记录')
        return

    mailbox = find_mailbox()
    if not mailbox:
        if not dry:
            pass
        print('未找到信箱（U 盘可能没插）')
        return

    notified = load_state()
    msgs = pending_messages(mailbox, notified)

    print('信箱:', mailbox)
    if not msgs:
        print('没有新消息')
        return

    print('发现 %d 条新消息:' % len(msgs))
    lines = []
    for m in msgs:
        when = (m.get('time') or '')[:16].replace('T', ' ')
        text = str(m.get('text', '')).replace('\n', ' ')
        print('  [%s] %s' % (when, text[:60]))
        lines.append('%s\n%s' % (when, text[:200]))
        notified.add(m['_id'])

    if dry:
        print('(dry-run，未弹窗)')
        return

    body = '\n\n'.join(lines)
    if len(msgs) > 1:
        body = '寻慧有 %d 条新消息：\n\n' % len(msgs) + body
    body += '\n\n—— 需要我处理的话，来找 WorkBuddy 说一声。'
    popup('寻慧来信', body)
    save_state(notified)
    print('已弹窗提醒')


if __name__ == '__main__':
    main()
