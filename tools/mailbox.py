#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
传话信箱 CLI —— WorkBuddy 与寻慧之间的命令行接口

信箱位置（自动推断，U 盘盘符变了也不用改）：
    <便携包>\UserData\Home\mailbox\
        outbox\   寻慧 -> WorkBuddy
        inbox\    WorkBuddy -> 寻慧
        sent\     已处理归档

用法：
    python mailbox.py list              列出待处理的 outbox 消息
    python mailbox.py read <id>         读取某条消息全文
    python mailbox.py reply "文本"       给寻慧回一条消息
    python mailbox.py done <id>         把消息归档到 sent
    python mailbox.py sent              列出已回复/已归档
"""

import argparse
import json
import os
import shutil
import sys
from datetime import datetime

ROOT_OVERRIDE = None

def mailbox_root():
    # 手动指定的优先级最高（U 盘跑到别的盘符时用 --root 指过去）
    if ROOT_OVERRIDE:
        return ROOT_OVERRIDE
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.dirname(here), 'UserData', 'Home', 'mailbox')

def sub(name):
    return os.path.join(mailbox_root(), name)

def ensure():
    for d in ('outbox', 'inbox', 'sent'):
        os.makedirs(sub(d), exist_ok=True)

def load(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def list_msgs(folder):
    d = sub(folder)
    if not os.path.isdir(d):
        return []
    out = []
    for name in sorted(os.listdir(d)):
        if not name.lower().endswith('.json'):
            continue
        msg = load(os.path.join(d, name))
        if not msg:
            continue
        msg['_file'] = name
        out.append(msg)
    return out

def cmd_list(args):
    msgs = list_msgs(args.folder)
    if not msgs:
        print('(空)')
        return
    for m in msgs:
        text = str(m.get('text', '')).replace('\n', ' ')
        if len(text) > 60:
            text = text[:60] + '...'
        print('%s  [%-8s] %s' % (m.get('id', m['_file']), m.get('kind', '?'), text))

def cmd_read(args):
    for folder in ('outbox', 'inbox', 'sent'):
        for m in list_msgs(folder):
            if m.get('id') == args.msg_id or m['_file'].startswith(args.msg_id):
                print(json.dumps(m, ensure_ascii=False, indent=2))
                return
    print('未找到消息: %s' % args.msg_id, file=sys.stderr)
    sys.exit(1)

def cmd_reply(args):
    ensure()
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    mid = '%s-%s' % (stamp, os.getpid() % 10000)
    msg = {
        'id': mid,
        'from': 'workbuddy',
        'to': 'xunhui',
        'time': datetime.now().isoformat(),
        'kind': args.kind,
        'text': args.text
    }
    path = os.path.join(sub('inbox'), mid + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(msg, f, ensure_ascii=False, indent=2)
    print('已写入 inbox: %s' % path)

def cmd_done(args):
    src = None
    for folder in ('outbox', 'inbox'):
        p = os.path.join(sub(folder), args.msg_id + '.json')
        if os.path.isfile(p):
            src = p
            break
    if not src:
        print('未找到消息: %s' % args.msg_id, file=sys.stderr)
        sys.exit(1)
    ensure()
    dst = os.path.join(sub('sent'), os.path.basename(src))
    shutil.move(src, dst)
    print('已归档: %s' % dst)

def main():
    ap = argparse.ArgumentParser(description='寻慧传话信箱 CLI')
    ap.add_argument('--root', help='手动指定信箱根目录（U 盘盘符变了时用）')
    subp = ap.add_subparsers(dest='cmd')

    p = subp.add_parser('list', help='列出消息')
    p.add_argument('--folder', default='outbox', choices=['outbox', 'inbox', 'sent'])
    p.set_defaults(func=cmd_list)

    p = subp.add_parser('read', help='读取某条消息')
    p.add_argument('msg_id')
    p.set_defaults(func=cmd_read)

    p = subp.add_parser('reply', help='给寻慧回消息')
    p.add_argument('text')
    p.add_argument('--kind', default='reply')
    p.set_defaults(func=cmd_reply)

    p = subp.add_parser('done', help='归档消息到 sent')
    p.add_argument('msg_id')
    p.set_defaults(func=cmd_done)

    args = ap.parse_args()
    global ROOT_OVERRIDE
    if args.root:
        ROOT_OVERRIDE = args.root
    if not getattr(args, 'func', None):
        ap.print_help()
        return
    print('信箱: %s' % mailbox_root())
    args.func(args)

if __name__ == '__main__':
    main()
