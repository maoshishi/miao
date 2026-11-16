# -*- coding: utf-8 -*-
"""
咪了个喵 · 卡面 / 素材批量处理

把 picture/ 里的原图统一处理成游戏用的素材：
  picture/cards/01.png ... 17.png   卡面（奶油底 400x400）
  picture/bg.jpg                    牌桌背景
  picture/nest.png                  猫窝木框（去白底 + 透明 PNG）

用法：
    python tools/prepare-cards.py
    python tools/prepare-cards.py --check     只检查，不写文件

想加新卡牌：在 CARDS 里加一行，然后把图片丢进 picture/。
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIC = os.path.join(ROOT, 'picture')
OUT = os.path.join(PIC, 'cards')

CREAM = (255, 249, 237)      # 卡面底色，必须和 css 里 --cream 一致
CARD_SIZE = 400              # 卡面输出尺寸
CANVAS_FILL = 0.90           # 内容最多占画布的 90%

# 编号, 原文件名, 名字, 是否带底部中文名
CARDS = [
    (1,  '微信图片_20261115002735_155_2.jpg', '橘猫',     True),
    (2,  '微信图片_20261115002736_156_2.jpg', '三花猫',   True),
    (3,  '微信图片_20261115002737_157_2.jpg', '狸花猫',   True),
    (4,  '微信图片_20261115002738_158_2.jpg', '奶牛猫',   True),
    (5,  '微信图片_20261115002739_159_2.jpg', '黑猫',     True),
    (6,  '微信图片_20261115002740_160_2.jpg', '白猫',     True),
    (7,  '微信图片_20261115002741_161_2.jpg', '英短蓝猫', True),
    (8,  '布偶猫.jpg',                        '布偶猫',   True),
    (9,  '暹罗猫.jpg',                        '暹罗猫',   True),
    (10, '银渐层.jpg',                        '银渐层',   True),
    (11, '玄猫.jpg',                          '玄猫',     True),
    (12, '猫包.png',                          '猫包',     False),
    (13, '猫砂铲.png',                        '猫砂铲',   False),
    (14, '猫粮.png',                          '猫粮',     False),
    (15, '玩具鼠.png',                        '玩具鼠',   False),
    (16, '逗猫棒.png',                        '逗猫棒',   False),
    (17, '鱼骨头.png',                        '鱼骨头',   False),
]

# 右上角有红色印章的图，先把印章那块涂成底色
STAMP_CARDS = {9, 11}

BG_SRC = '牌桌背景2.jpg'
NEST_SRC = '猫窝边框.jpg'


# ---------------------------------------------------------------- 工具函数
def to_arr(im):
    return np.asarray(im).astype(np.int16)


def corner_color(a):
    """取四角的中位色当背景色"""
    h, w = a.shape[:2]
    k = max(2, min(h, w) // 40)
    pts = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    pts += [a[k, k], a[k, w - 1 - k], a[h - 1 - k, k], a[h - 1 - k, w - 1 - k]]
    return np.median(np.array(pts), axis=0)


def bg_color(a):
    """整张图里出现最多的颜色 = 背景（比看四角更稳，有的图边缘带阴影）"""
    small = a[::4, ::4].reshape(-1, 3)
    q = (small // 8).astype(np.int32)
    key = q[:, 0] * 4096 + q[:, 1] * 64 + q[:, 2]
    vals, counts = np.unique(key, return_counts=True)
    best = vals[int(np.argmax(counts))]
    sel = key == best
    return np.median(small[sel], axis=0)


def trim_margin(a, frac=0.025):
    """先切掉最外圈，很多原图边缘有压暗的阴影"""
    h, w = a.shape[:2]
    m = max(2, int(round(min(h, w) * frac)))
    return a[m:h - m, m:w - m], m


def near_bg_mask(a, bg, tol=42):
    return np.abs(a - bg).sum(axis=2) < tol


def border_reach(near, downsample=4):
    """从四条边出发，找出「和边框连通」的背景区域（返回 bool 掩码）"""
    h, w = near.shape
    sw, sh = max(4, w // downsample), max(4, h // downsample)
    small = Image.fromarray((near * 255).astype(np.uint8))
    small = small.resize((sw, sh), Image.NEAREST)
    px = small.load()
    seen = np.zeros((sh, sw), dtype=bool)
    q = deque()
    for x in range(sw):
        for y in (0, sh - 1):
            if px[x, y] > 128 and not seen[y, x]:
                seen[y, x] = True
                q.append((x, y))
    for y in range(sh):
        for x in (0, sw - 1):
            if px[x, y] > 128 and not seen[y, x]:
                seen[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < sw and 0 <= ny < sh and not seen[ny, nx] and px[nx, ny] > 128:
                seen[ny, nx] = True
                q.append((nx, ny))
    up = Image.fromarray((seen * 255).astype(np.uint8)).resize((w, h), Image.NEAREST)
    return np.asarray(up) > 128


def row_has_content(mask, min_px=6):
    return mask.sum(axis=1) >= min_px


def find_caption_cut(rowhas, h):
    """找出底部那条「中文名字」的上沿，返回裁切线（没有名字就返回 h）"""
    idx = np.where(rowhas)[0]
    if len(idx) == 0:
        return h
    b_bot = int(idx[-1])
    band_top = b_bot
    blank = 0
    for y in range(b_bot, -1, -1):
        if rowhas[y]:
            band_top = y
            blank = 0
        else:
            blank += 1
            if blank > 5:
                break
    band_h = b_bot - band_top + 1
    # 名字条：高度占 2%~20%，且在最下面 40% 的区域内
    if 0.02 * h <= band_h <= 0.20 * h and band_top > 0.55 * h:
        return max(1, band_top - 3)
    return h


def content_bbox(mask, cut_y=None, min_px=6):
    """返回 (left, top, right, bottom) 内容外框，闭区间"""
    h, w = mask.shape
    if cut_y is not None:
        mask = mask[:cut_y]
    rowhas = mask.sum(axis=1) >= min_px
    if not rowhas.any():
        return 0, 0, w - 1, h - 1
    top = int(np.argmax(rowhas))
    bottom = len(rowhas) - 1 - int(np.argmax(rowhas[::-1]))
    colhas = mask[top:bottom + 1].sum(axis=0) >= min_px
    left = int(np.argmax(colhas))
    right = len(colhas) - 1 - int(np.argmax(colhas[::-1]))
    return left, top, right, bottom


# ---------------------------------------------------------------- 卡面
def prep_card(src, dst, drop_text, size=CARD_SIZE, stamp=False):
    im = Image.open(src).convert('RGB')
    a0 = to_arr(im)
    h0, w0 = a0.shape[:2]

    a, m = trim_margin(a0)
    h, w = a.shape[:2]
    if m:
        im = im.crop((m, m, w0 - m, h0 - m))

    if stamp:
        # 右上角的红色印章直接涂成底色
        arr = np.array(im)
        arr[0:int(h * 0.34), int(w * 0.74):w] = CREAM
        im = Image.fromarray(arr)
        a = to_arr(im)

    bg = bg_color(a)
    near = near_bg_mask(a, bg)
    reach = border_reach(near)          # 只有和边框连通的背景才算背景

    # 把“背景”统一刷成奶油色：白底玩具图放到奶油卡面上就不会有一块白
    arr = np.array(im)
    arr[reach] = CREAM
    im2 = Image.fromarray(arr)

    mask = ~reach                       # 真正的内容
    cut = find_caption_cut(row_has_content(mask), h) if drop_text else h
    l, t, r, b = content_bbox(mask, cut)
    cw, ch = r - l + 1, b - t + 1
    if cw < 8 or ch < 8:
        raise RuntimeError('内容太小，可能整张图都是背景')

    side = int(max(cw, ch) / CANVAS_FILL)
    canvas = Image.new('RGB', (size, size), CREAM)
    scale = size / side
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    crop = im2.crop((l, t, r + 1, b + 1)).resize((nw, nh), Image.LANCZOS)
    canvas.paste(crop, ((size - nw) // 2, (size - nh) // 2))
    canvas.save(dst, 'PNG', optimize=True)
    return '%dx%d bg=%s 裁文字y<%s 内容(%d,%d,%d,%d) %dx%d' % (
        w0, h0, tuple(int(v) for v in bg), cut if drop_text else '-', l, t, r, b, cw, ch)


# ---------------------------------------------------------------- 背景
def prep_bg(src, dst, max_w=900, quality=84):
    im = Image.open(src).convert('RGB')
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=quality, optimize=True, progressive=True)
    return '%dx%d' % im.size


# ---------------------------------------------------------------- 猫窝木框
def prep_nest(src, dst, out_w=760):
    im = Image.open(src).convert('RGB')
    a0 = to_arr(im)
    h0, w0 = a0.shape[:2]
    a, m = trim_margin(a0, 0.02)
    if m:
        im = im.crop((m, m, w0 - m, h0 - m))
        a0 = a
    bg = bg_color(a)
    near = near_bg_mask(a, bg, tol=36)
    reach = border_reach(near)          # 木框外面的白底

    rgba = np.array(im.convert('RGBA'))
    rgba[reach, 3] = 0                  # 挖成透明

    l, t, r, b = content_bbox(~reach, min_px=2)
    rgba = rgba[t:b + 1, l:r + 1]
    out = Image.fromarray(rgba)
    if out.width > out_w:
        out = out.resize((out_w, round(out.height * out_w / out.width)), Image.LANCZOS)
    out.save(dst, 'PNG', optimize=True)
    return '%dx%d bg=%s -> %dx%d' % (h0, w0, tuple(int(v) for v in bg), out.width, out.height)


# ---------------------------------------------------------------- main
def main():
    check = '--check' in sys.argv
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    if not os.path.isdir(PIC):
        print('找不到 picture 文件夹：', PIC)
        return 1

    ok = 0
    print('=== 卡面 ===')
    for num, fname, name, drop in CARDS:
        src = os.path.join(PIC, fname)
        if not os.path.exists(src):
            print('  [缺] %02d %s  <- %s 不存在' % (num, name, fname))
            continue
        dst = os.path.join(OUT, '%02d.png' % num)
        try:
            if check:
                info = '（只检查）'
            else:
                info = prep_card(src, dst, drop, stamp=(num in STAMP_CARDS))
            ok += 1
            print('  ✓ %02d %-5s %-42s %s' % (num, name, fname[:40], info))
        except Exception as e:
            print('  ✗ %02d %-5s %s' % (num, name, e))

    print('=== 其它素材 ===')
    for src_name, out_name, fn in (
        (BG_SRC, 'bg.jpg', prep_bg),
        (NEST_SRC, 'nest.png', prep_nest),
    ):
        src = os.path.join(PIC, src_name)
        dst = os.path.join(PIC, out_name)
        if not os.path.exists(src):
            print('  [缺] %s' % src_name)
            continue
        if check:
            print('  ✓ %-14s （只检查）' % out_name)
        else:
            print('  ✓ %-14s %s' % (out_name, fn(src, dst)))

    print('\n完成：%d 张卡面 -> picture/cards' % ok)
    return 0


if __name__ == '__main__':
    sys.exit(main())
