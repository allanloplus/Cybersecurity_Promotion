#!/usr/bin/env python3
"""產生課程配音（Microsoft Edge 神經語音，台灣口音）。

用法：
    pip install edge-tts
    python3 tools/build_audio.py            # 只產生新增／修改過的台詞
    python3 tools/build_audio.py --force    # 全部重新產生

流程：用 Node 讀取 course/js/course-data.js → 逐句以 edge-tts 合成 mp3 →
以 ffprobe 量測長度 → 寫出 course/js/audio-manifest.js。
檔名取自「聲線設定＋台詞」的雜湊值，台詞沒改就不會重新合成。
"""
import asyncio, hashlib, json, os, ssl, subprocess, sys
from pathlib import Path

import edge_tts
import edge_tts.communicate as _comm

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / 'course'
AUDIO = COURSE / 'audio'
MANIFEST = COURSE / 'js' / 'audio-manifest.js'

VOICES = {
    # 講師 Allan：台灣男聲
    'L': dict(voice='zh-TW-YunJheNeural', rate='+6%', pitch='-2Hz'),
    # 助教阿拉蕾：可愛女聲（提高音調、稍快）
    'A': dict(voice='zh-TW-HsiaoYuNeural', rate='+10%', pitch='+28Hz'),
}

# 公司網路若有 TLS 攔截代理，讓 edge-tts 使用系統／代理 CA
_ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if Path('/root/.ccr/ca-bundle.crt').exists() else None)
if _ca:
    _comm._SSL_CTX = ssl.create_default_context(cafile=_ca)
PROXY = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')


def load_lines():
    js = ("global.window={};require(%s);const out=[];"
          "window.COURSE.chapters.forEach(c=>c.scenes.forEach(s=>s.lines.forEach(l=>out.push({key:l.key,s:l.s,say:l.say||l.t}))));"
          "console.log(JSON.stringify(out));") % json.dumps(str(COURSE / 'js' / 'course-data.js'))
    return json.loads(subprocess.check_output(['node', '-e', js]))


def duration(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                   '-of', 'default=nw=1:nk=1', str(path)])
    return round(float(out), 2)


async def synth(text, cfg, path, retries=8):
    for i in range(retries):
        try:
            await edge_tts.Communicate(text, cfg['voice'], rate=cfg['rate'], pitch=cfg['pitch'], proxy=PROXY).save(str(path))
            if path.stat().st_size > 0:
                return
        except Exception as e:  # 網路不穩時重試
            print('  retry', i + 1, e)
        await asyncio.sleep(min(30, 2 ** (i + 1)))
    raise RuntimeError('TTS failed: ' + text)


async def main(force=False):
    AUDIO.mkdir(parents=True, exist_ok=True)
    lines = load_lines()
    manifest, used = {}, set()
    sem = asyncio.Semaphore(2)

    async def work(l):
        cfg = VOICES[l['s']]
        h = hashlib.sha1(json.dumps([cfg, l['say']], ensure_ascii=False).encode()).hexdigest()[:12]
        f = AUDIO / f'{h}.mp3'
        used.add(f.name)
        if force or not f.exists() or f.stat().st_size == 0:
            async with sem:
                print('TTS', l['key'], l['say'][:30])
                await synth(l['say'], cfg, f)
        manifest[l['key']] = {'f': f'audio/{f.name}', 'd': duration(f)}

    await asyncio.gather(*(work(l) for l in lines))
    for old in AUDIO.glob('*.mp3'):  # 清掉不再使用的舊檔
        if old.name not in used:
            old.unlink()
    total = sum(v['d'] for v in manifest.values())
    MANIFEST.write_text('// 由 tools/build_audio.py 自動產生，請勿手動修改\nwindow.AUDIO_MANIFEST = '
                        + json.dumps(dict(sorted(manifest.items())), ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'完成：{len(manifest)} 句，總長 {total/60:.1f} 分鐘 → {MANIFEST.relative_to(ROOT)}')


if __name__ == '__main__':
    asyncio.run(main('--force' in sys.argv))
