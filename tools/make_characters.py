"""從 source/hosts.webp 裁切出講師與助教的「貼紙風」去背圖。

用法：pip install pillow numpy && python3 tools/make_characters.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
src=Image.open(ROOT/'source'/'hosts.webp').convert('RGB')
def cut(box, keep_poly, barriers, out, border=7):
    im=src.crop(box).copy(); W,H=im.size
    keep=Image.new('L',(W,H),0); ImageDraw.Draw(keep).polygon(keep_poly,fill=255)
    g=np.array(im.convert('L'))
    ink=Image.fromarray(np.where(g<200,255,0).astype('uint8'))
    ink=ImageChops.multiply(ink,keep)
    d=ImageDraw.Draw(ink)
    for seg in barriers: d.line(seg,fill=255,width=3)
    dil=ink.filter(ImageFilter.MaxFilter(15))
    # fill holes: flood from border on padded image
    pad=Image.new('L',(W+2,H+2),0); pad.paste(dil,(1,1))
    ImageDraw.floodfill(pad,(0,0),128)
    p=np.array(pad)[1:-1,1:-1]
    sil=Image.fromarray(np.where(p==128,0,255).astype('uint8'))
    sil=sil.filter(ImageFilter.MinFilter(7))
    sil=ImageChops.multiply(sil,keep).filter(ImageFilter.GaussianBlur(1))
    white=Image.new('RGB',(W,H),(255,255,255))
    # outside keep polygon -> white (sticker border)
    im=Image.composite(im,white,keep)
    im.putalpha(sil)
    im=im.crop(im.getbbox())
    dst=ROOT/'course'/'assets'/'img'/out.replace('.png','.webp')
    im.save(dst,quality=90); print(dst,im.size)
# 阿拉蕾（左）
cut((40,280,560,960),[(0,0),(405,0),(436,45),(436,292),(392,318),(392,498),(348,503),(348,532),(402,540),(410,680),(0,680)],
    [[(436,45),(436,292),(392,318),(392,498)]],'arale.png')
cut((400,0,1024,1010),[(55,0),(624,0),(624,1010),(80,1010),(80,880),(10,880),(10,590)]+[(106, 590), (96, 520), (88, 500), (78, 460), (70, 410), (72, 360), (66, 340), (58, 280)]+[(55,0)],
    [[(106, 590), (96, 520), (88, 500), (78, 460), (70, 410), (72, 360), (66, 340), (58, 280)]],'allan.png')
