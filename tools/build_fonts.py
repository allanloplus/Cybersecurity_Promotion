#!/usr/bin/env python3
"""下載 Noto Sans TC 與 LXGW WenKai TC，只保留課程用到的字，輸出為自架 woff2。

好處：不依賴 Google Fonts（內網、離線也能正常顯示），且檔案很小。
修改台詞或畫面文字後請重新執行：
    pip install fonttools brotli
    python3 tools/build_fonts.py
"""
import re, subprocess, urllib.request
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / 'course'
OUT = COURSE / 'assets' / 'fonts'
CACHE = ROOT / '.font-cache'
FONTS = {
    'noto-sans-tc-400': 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
    'noto-sans-tc-500': 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz75Ky_Co.ttf',
    'noto-sans-tc-700': 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf',
    'noto-sans-tc-900': 'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz7wm1_Co.ttf',
    'lxgw-wenkai-tc-400': 'https://fonts.gstatic.com/s/lxgwwenkaitc/v11/w8gDH20td8wNsI3f40DmtXZb48uK.ttf',
    'lxgw-wenkai-tc-700': 'https://fonts.gstatic.com/s/lxgwwenkaitc/v11/w8gAH20td8wNsI3f40DmtXZb4_M2Avkp.ttf',
}


def course_text():
    text = ''.join(p.read_text(encoding='utf-8') for p in [COURSE / 'index.html', COURSE / 'js' / 'player.js'])
    text += subprocess.check_output(['node', '-e', "global.window={};require(%r);console.log(JSON.stringify(window.COURSE))"
                                     % str(COURSE / 'js' / 'course-data.js')]).decode()
    text += ''.join(chr(c) for c in range(0x20, 0x7f))           # ASCII
    text += '，。、；：？！「」『』（）《》〈〉…—～・｜％＋／０１２３４５６７８９'
    return ''.join(sorted(set(ch for ch in text if ch >= ' ')))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    chars = course_text()
    for name, url in FONTS.items():
        src = CACHE / (name + '.ttf')
        if not src.exists():
            print('下載', name)
            urllib.request.urlretrieve(url, src)
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        f = subset.load_font(str(src), opts)
        s = subset.Subsetter(opts)
        s.populate(text=chars)
        s.subset(f)
        dst = OUT / (name + '.woff2')
        subset.save_font(f, str(dst), opts)
        print(f'{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024} KB')
    print(f'共 {len(chars)} 個字元')


if __name__ == '__main__':
    main()
