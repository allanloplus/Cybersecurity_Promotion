#!/usr/bin/env node
/*
 * 將課程各章節輸出為 MP4（1280x720，含配音與燒入字幕），方便上傳 LMS／內網影音平台。
 *
 * 需求：Node 18+、playwright（含 Chromium）、ffmpeg
 * 用法：node tools/export_video.js            # 全部章節
 *      node tools/export_video.js 1 3        # 只輸出第 1、3 章（0 = 開場）
 * 輸出：video/<序號>-<章節id>.mp4
 *
 * 原理：以 ?record=N 開啟播放器（靜音、依音檔長度計時），用 CDP screencast 擷取畫面，
 *       再依頁面記錄的每句開始時間，用 ffmpeg 把配音對齊混入。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}

const ROOT = path.resolve(__dirname, '..');
const COURSE = path.join(ROOT, 'course');
const OUT = path.join(ROOT, 'video');
const TMP = path.join(OUT, '.tmp');

global.window = {};
require(path.join(COURSE, 'js', 'course-data.js'));
const C = global.window.COURSE;

async function recordChapter(browser, ci) {
  const ch = C.chapters[ci];
  const name = `${String(ci).padStart(2, '0')}-${ch.id}`;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(COURSE, 'index.html') + '?record=' + ci);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(6, '0')}.jpg`);
    frames.push({ file, t: f.metadata.timestamp * 1000 });
    writes.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await page.evaluate(() => window.__start());
  await page.waitForFunction(() => window.__done, null, { timeout: 0, polling: 500 });
  await page.waitForTimeout(2000);
  const tEnd = Date.now();
  const log = await page.evaluate(() => window.__log);
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  await ctx.close();

  // 影格清單（可變影格時間）→ 固定 30fps
  const start = t0;
  const list = [];
  const usable = frames.filter((f) => f.t <= tEnd);
  let first = usable.findIndex((f) => f.t >= start);
  if (first > 0) first -= 1; else first = 0;
  const seq = usable.slice(first);
  seq.forEach((f, k) => {
    const from = Math.max(f.t, start);
    const to = k + 1 < seq.length ? seq[k + 1].t : tEnd;
    if (to <= from) return;
    list.push(`file '${f.file}'`, `duration ${((to - from) / 1000).toFixed(4)}`);
  });
  list.push(`file '${seq[seq.length - 1].file}'`);
  const listFile = path.join(dir, 'frames.txt');
  fs.writeFileSync(listFile, 'ffconcat version 1.0\n' + list.join('\n') + '\n');

  // 配音：每句依開始時間延遲後混音
  const clips = log.filter((l) => l.f);
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
  clips.forEach((c) => args.push('-i', path.join(COURSE, c.f)));
  const filters = clips.map((c, k) => {
    const ms = Math.max(0, Math.round(c.t - start));
    return `[${k + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${k}]`;
  });
  filters.push(clips.map((_, k) => `[a${k}]`).join('') + `amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[aout]`);
  const out = path.join(OUT, name + '.mp4');
  args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]',
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out);
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✔ ${out}  (${((tEnd - start) / 60000).toFixed(1)} 分鐘)`);
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const pick = process.argv.slice(2).map(Number);
  const list = pick.length ? pick : C.chapters.map((_, k) => k);
  const browser = await chromium.launch();
  for (const ci of list) {
    console.log(`錄製 ${ci}：${C.chapters[ci].title} …`);
    await recordChapter(browser, ci);
  }
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
