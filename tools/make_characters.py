#!/usr/bin/env python3
"""從角色設定圖裁切講師 Allan 與助教阿拉蕾的素材。

輸入：source/allan-sheet.jpg、source/arale-sheet.jpg
輸出：course/assets/img/
  allan.webp / arale.webp        半身主圖（去背、白色貼紙描邊）
  allan-<表情>.webp / arale-<表情>.webp   表情頭像（正方形，播放器以圓形顯示）
用法：pip install pillow numpy && python3 tools/make_characters.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'course' / 'assets' / 'img'
OUT.mkdir(parents=True, exist_ok=True)
allan = Image.open(ROOT / 'source' / 'allan-sheet.jpg').convert('RGB')
arale = Image.open(ROOT / 'source' / 'arale-sheet.jpg').convert('RGB')


def cutout(im, border=5):
    """由四周白底 flood fill 去背，並留一圈白色貼紙描邊。"""
    W, H = im.size
    mark = im.copy()
    seeds = [(x, y) for x in range(0, W, 6) for y in (0, H - 1)] + [(x, y) for y in range(0, H, 6) for x in (0, W - 1)]
    for p in seeds:
        r, g, b = mark.getpixel(p)
        if min(r, g, b) > 225 and (r, g, b) != (255, 0, 255):
            ImageDraw.floodfill(mark, p, (255, 0, 255), thresh=28)
    a = np.array(mark)
    fg = ~((a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255))
    m = Image.fromarray((fg * 255).astype('uint8'))
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))   # 補小洞
    sticker = m.filter(ImageFilter.MaxFilter(border * 2 + 1)).filter(ImageFilter.GaussianBlur(1))
    out = Image.composite(im, Image.new('RGB', im.size, 'white'), m).convert('RGBA')
    out.putalpha(sticker)
    return out.crop(out.getbbox())


def save(im, name):
    im.save(OUT / name, quality=88, method=6)
    print(name, im.size)


# ---- 主圖：Allan 正面半身（左右翻轉，讓手勢指向畫面中央的白板；識別證文字再翻回來）
body = allan.crop((70, 80, 772, 905))
ImageDraw.Draw(body).rectangle((650, 600, body.width, body.height), fill='white')  # 去掉右側「表情包」標題字
W = body.width
badge_box = (270, 600, 336, 696)
badge = body.crop(badge_box)
body = ImageOps.mirror(body)
body.paste(badge, (W - badge_box[2], badge_box[1]))
save(cutout(body), 'allan.webp')

# ---- 主圖：阿拉蕾揮手半身
save(cutout(arale.crop((70, 805, 410, 1250))), 'arale.webp')

# ---- 表情頭像（正方形）
def bust(src, cx, top, size, name):
    if name == 'allan-think.webp':
        size = 290
    im = src.crop((cx - size // 2, top, cx + size // 2, top + size)).resize((240, 240), Image.LANCZOS)
    save(im, name)

for cx, top, n in [(895, 795, 'smile'), (1200, 795, 'laugh'), (1500, 800, 'think'), (1805, 795, 'scratch'),
                   (895, 1137, 'wow'), (1190, 1137, 'point'), (1510, 1137, 'wink'), (1830, 1137, 'shock')]:
    bust(allan, cx, top, 326, f'allan-{n}.webp')
for cx, top, n in [(616, 808, 'laugh'), (1002, 808, 'think'), (1388, 808, 'wow'), (1773, 808, 'confused'),
                   (616, 1145, 'talk'), (1002, 1145, 'cry'), (1388, 1145, 'wink'), (1773, 1145, 'cheer')]:
    bust(arale, cx, top, 304, f'arale-{n}.webp')
