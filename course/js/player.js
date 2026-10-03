/* 資安宣導課程播放器 */
(function () {
  'use strict';
  const C = window.COURSE;
  const M = window.AUDIO_MANIFEST || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NAMES = { L: '講師 Allan', A: '助教 阿拉蕾' };
  const EMOTES = { jump: '❗', shake: '💦', think: '❓', wow: '✨', ok: '👍' };
  const STORE = 'secAwareness.v1';
  // 錄製模式（tools/export_video.js 使用）：index.html?record=章節序號
  const REC = new URLSearchParams(location.search).get('record');
  const RECORD = REC !== null;
  if (RECORD) document.documentElement.classList.add('record');
  window.__log = [];

  /* ---------- 狀態 ---------- */
  const st = { ci: 0, si: 0, li: 0, playing: false, started: false, step: -1, timer: null, rate: 1, cc: true };
  const audio = new Audio();
  audio.preload = 'auto';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { saved = {}; }
  saved.done = saved.done || {};
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch (e) { /* 無痕模式 */ } };

  /* ---------- 時間軸 ---------- */
  const lineDur = (l) => (M[l.key] ? M[l.key].d : Math.max(2.5, (l.say || l.t).length / 4.6));
  const GAP = 0.35;
  C.chapters.forEach((ch) => {
    let t = 0;
    ch.flat = [];
    ch.scenes.forEach((sc, si) => sc.lines.forEach((l, li) => {
      ch.flat.push({ si, li, start: t, dur: lineDur(l) });
      t += lineDur(l) + GAP;
    }));
    ch.total = t;
  });
  const fmt = (s) => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const chapter = () => C.chapters[st.ci];
  const scene = () => chapter().scenes[st.si];
  const line = () => scene().lines[st.li];
  const flatIndex = () => chapter().flat.findIndex((f) => f.si === st.si && f.li === st.li);

  /* ---------- 舞台縮放 ---------- */
  const stage = $('stage'), wrap = $('stageWrap');
  function fit() { stage.style.transform = `scale(${wrap.clientWidth / 1280})`; }
  new ResizeObserver(fit).observe(wrap);
  fit();

  /* ---------- 畫面渲染 ---------- */
  const board = $('board');
  const stepAttr = (n) => ` data-step="${n}"`;

  function renderScene() {
    const sc = scene();
    let h = '';
    if (sc.type === 'cover') {
      h = `<div class="cover"><div class="icon">${sc.icon}</div><div class="kicker">${esc(sc.kicker)}</div>
           <h2>${esc(sc.title)}</h2><p>${esc(sc.sub)}</p>
           ${sc.showContact ? `<div class="contact">📞 ${esc(C.org.contact)}</div>` : ''}
           ${sc.showQuiz && C.org.quizUrl ? `<a class="btn primary quiz-link" href="${esc(C.org.quizUrl)}" target="_blank" rel="noopener">📝 前往課後測驗 ▶</a>` : ''}</div>`;
    } else if (sc.type === 'list') {
      const cls = `grid c${sc.cols || 2}${sc.compact ? ' compact' : ''}`;
      h = `<h3 class="b-title">${esc(sc.title)}</h3>${sc.note ? `<p class="b-note">${esc(sc.note)}</p>` : ''}
           <div class="b-body"><div class="${cls}">${sc.items.map((it, k) =>
             `<div class="card"${stepAttr(sc.reveal ? k + 1 : 0)}><div class="ic">${it.i}</div><div><h4>${esc(it.h)}</h4>${it.d ? `<p>${esc(it.d)}</p>` : ''}</div></div>`).join('')}
           </div></div>`;
    } else if (sc.type === 'case') {
      h = `<div class="case-tag">${esc(sc.tag)}</div><h3 class="b-title">${esc(sc.title)}</h3>
           <div class="story"${stepAttr(0)}>${esc(sc.story)}</div>
           <div class="case-cols">
             <div class="box bad"${stepAttr(2)}><h5>⚠️ 問題在哪裡？</h5><ul>${sc.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
             <div class="box good"${stepAttr(3)}><h5>✅ 管理對策</h5><ul>${sc.actions.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
           </div>`;
      board.classList.add('case');
    } else if (sc.type === 'vs') {
      h = `<h3 class="b-title">${esc(sc.title)}</h3><div class="b-body"><div class="vs">
             <div class="box bad"${stepAttr(1)}><h5>🙅 別這樣做</h5><ul>${sc.bad.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
             <div class="box good"${stepAttr(2)}><h5>🙆 這樣做</h5><ul>${sc.good.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
           </div></div>`;
    } else if (sc.type === 'flow') {
      h = `<h3 class="b-title">${esc(sc.title)}</h3><div class="b-body"><div class="flow">${sc.steps.map((s, k) =>
             `<div class="step"${stepAttr(k + 1)}><div class="ic">${s.i}</div><h4>${esc(s.h)}</h4><p>${esc(s.d)}</p></div>`).join('')}</div></div>`;
    } else if (sc.type === 'email') {
      const m = sc.mail;
      const fl = (at) => ` data-flag="${at}"`;
      h = `<h3 class="b-title">${esc(sc.title)}</h3><div class="b-body">
           <div class="mail"><div class="mail-bar"><i></i><i></i><i></i>&nbsp;收件匣</div>
             <div class="mail-row"${fl('from')}><b>寄件者</b>${esc(m.from)}</div>
             <div class="mail-row"><b>收件者</b>${esc(m.to)}</div>
             <div class="mail-row mail-subject"${fl('subject')}>${esc(m.subject)}</div>
             <div class="mail-body"${fl('body')}>${esc(m.body)}</div>
             <div class="mail-link"${fl('link')}>${esc(m.link)}</div>
           </div>
           <div class="flags">${sc.flags.map((f, k) => `<div class="flag"${stepAttr(k + 1)}><span>${k + 1}</span>${esc(f.text)}</div>`).join('')}</div>
           </div>`;
    } else if (sc.type === 'quiz') {
      const keys = sc.kind === '是非' ? ['O', 'X'] : ['A', 'B', 'C', 'D'];
      h = `<h3 class="b-title">${esc(sc.title)}</h3><div class="b-body">
           <div><span class="qz-kind">${esc(sc.kind)}題</span></div>
           <p class="qz-q">${esc(sc.q)}</p>
           <div class="qz-opts">${sc.opts.map((o, k) => `<div class="qz-opt ${sc.ans.includes(k) ? 'right' : 'wrong'}"><span class="k">${keys[k]}</span>${esc(o)}</div>`).join('')}</div>
           </div>`;
    }
    board.className = 'board' + (sc.type === 'case' ? ' case' : '');
    board.innerHTML = h;
    void board.offsetWidth;
    board.classList.add('enter');
    st.step = -1;
    // 章節標籤與場景進度點
    $('chapterPill').textContent = `${chapter().icon} ${chapter().title}`;
    $('sceneDots').innerHTML = chapter().scenes.map((_, k) => `<i class="${k === st.si ? 'on' : k < st.si ? 'done' : ''}"></i>`).join('');
  }

  function applyStep(n) {
    const sc = scene();
    if (n === st.step) return;
    const prev = st.step;
    st.step = n;
    board.querySelectorAll('[data-step]').forEach((el) => {
      const k = +el.dataset.step;
      el.classList.toggle('hidden', k > n);
      if (k <= n && k > prev && prev >= 0 && k > 0) { el.classList.remove('just'); void el.offsetWidth; el.classList.add('just'); }
    });
    if (sc.type === 'email') {
      sc.flags.forEach((f, k) => { const el = board.querySelector(`[data-flag="${f.at}"]`); if (el) el.classList.toggle('flagged', k + 1 <= n); });
    }
    if (sc.type === 'quiz') board.classList.toggle('reveal', n >= 2);
  }
  // 依目前台詞位置推算應顯示到第幾步（支援任意跳轉）
  function stepFor(si, li) {
    let s = 0;
    C.chapters[st.ci].scenes[si].lines.slice(0, li + 1).forEach((l) => { if (l.st != null) s = l.st; });
    return s;
  }

  /* ---------- 角色 ---------- */
  const chars = { L: $('charL'), A: $('charA') };
  function setSpeaker(s, talking) {
    ['L', 'A'].forEach((k) => {
      const el = chars[k];
      el.classList.toggle('talking', talking && k === s);
      el.classList.toggle('idle', !(talking && k === s));
      el.classList.toggle('dim', talking && k !== s);
    });
  }
  function emote(s, e) {
    if (!e) return;
    const el = chars[s];
    el.classList.remove('e-jump', 'e-shake', 'e-wow', 'e-think', 'e-ok');
    void el.offsetWidth;
    el.classList.add('e-' + e);
    const em = $('emote' + s);
    em.textContent = EMOTES[e] || '';
    em.classList.remove('show'); void em.offsetWidth; em.classList.add('show');
  }

  /* ---------- 播放 ---------- */
  let ttsUtter = null, ttsStart = 0, ttsVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { ttsVoice = pickVoice(); };

  function showLine(withMotion) {
    const l = line();
    const sub = $('subtitle');
    sub.className = 'subtitle ' + l.s + (st.cc ? '' : ' off');
    $('subWho').textContent = NAMES[l.s];
    $('subText').textContent = l.t;
    applyStep(stepFor(st.si, st.li));
    if (withMotion) emote(l.s, l.e);
    saved.pos = { ci: st.ci, si: st.si, li: st.li }; persist();
    updateTime();
  }

  function stopAll() {
    clearTimeout(st.timer);
    audio.pause();
    if (ttsUtter) { speechSynthesis.cancel(); ttsUtter = null; }
  }

  function playCurrent(offset) {
    stopAll();
    const l = line();
    showLine(!offset);
    if (!st.playing) { setSpeaker(l.s, false); return; }
    setSpeaker(l.s, true);
    const m = M[l.key];
    if (RECORD) { // 不出聲，依音檔長度計時；記錄每句開始時間供合成音軌
      window.__log.push({ key: l.key, f: m && m.f, t: Date.now() });
      st.timer = setTimeout(onLineEnd, lineDur(l) * 1000);
      return;
    }
    if (m) {
      audio.src = m.f;
      audio.playbackRate = st.rate;
      const go = () => { if (offset) audio.currentTime = offset; audio.play().catch(() => fallbackTTS(l)); };
      if (offset && audio.readyState < 1) audio.addEventListener('loadedmetadata', go, { once: true }); else go();
      audio.onerror = () => fallbackTTS(l);
    } else {
      fallbackTTS(l);
    }
  }

  // 沒有音檔時，改用瀏覽器內建語音（備援）
  function fallbackTTS(l) {
    audio.onerror = null;
    if (!('speechSynthesis' in window)) { st.timer = setTimeout(onLineEnd, lineDur(l) * 1000 / st.rate); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(l.say || l.t);
    u.lang = 'zh-TW';
    ttsVoice = ttsVoice || pickVoice();
    if (ttsVoice) u.voice = ttsVoice;
    u.rate = st.rate * (l.s === 'A' ? 1.08 : 1);
    u.pitch = l.s === 'A' ? 1.7 : 0.85;
    u.onend = () => { if (ttsUtter === u) { ttsUtter = null; onLineEnd(); } };
    ttsUtter = u; ttsStart = performance.now();
    speechSynthesis.speak(u);
  }

  function onLineEnd() {
    if (!st.playing) return;
    setSpeaker(line().s, false);
    const sc = scene();
    let gap = GAP * 1000;
    if (st.li < sc.lines.length - 1) { st.li++; }
    else if (st.si < chapter().scenes.length - 1) { st.si++; st.li = 0; gap = 900; st.timer = setTimeout(() => { renderScene(); playCurrent(); }, gap); return; }
    else { return chapterEnd(); }
    st.timer = setTimeout(() => playCurrent(), gap / st.rate);
  }
  audio.addEventListener('ended', onLineEnd);

  function chapterEnd() {
    if (RECORD) { setSpeaker(line().s, false); window.__done = Date.now(); return; }
    saved.done[chapter().id] = true; persist();
    renderMenu();
    if (st.ci < C.chapters.length - 1) {
      st.timer = setTimeout(() => goChapter(st.ci + 1, true), 1500);
    } else {
      setPlaying(false);
    }
  }

  function setPlaying(p) {
    st.playing = p;
    $('btnPlay').textContent = p ? '❚❚' : '▶';
    $('btnPlay').setAttribute('aria-label', p ? '暫停' : '播放');
    $('pausedBadge').classList.toggle('show', !p && st.started);
  }
  function togglePlay() {
    if (!st.started) return start(0);
    if (st.playing) {
      setPlaying(false);
      stopAll();
      setSpeaker(line().s, false);
    } else {
      setPlaying(true);
      const off = (audio.src && !audio.ended && audio.currentTime > 0 && audio.currentTime < (audio.duration || 0) - 0.05) ? audio.currentTime : 0;
      playCurrent(off);
    }
  }

  function goChapter(ci, autoplay) {
    stopAll();
    st.ci = ci; st.si = 0; st.li = 0;
    renderScene(); renderMarks(); renderMenu();
    if (autoplay !== undefined) setPlaying(autoplay);
    playCurrent();
  }
  function goLine(delta) {
    const flat = chapter().flat;
    let k = flatIndex() + delta;
    if (k < 0) { if (st.ci > 0) { const pc = C.chapters[st.ci - 1]; goChapter(st.ci - 1); const last = pc.flat[pc.flat.length - 1]; jump(last.si, last.li); } return; }
    if (k >= flat.length) { if (st.ci < C.chapters.length - 1) goChapter(st.ci + 1); return; }
    jump(flat[k].si, flat[k].li);
  }
  function jump(si, li, offset) {
    stopAll();
    const sceneChanged = si !== st.si;
    st.si = si; st.li = li;
    if (sceneChanged) renderScene();
    playCurrent(offset);
  }

  /* ---------- 時間列 ---------- */
  function curTime() {
    const f = chapter().flat[flatIndex()];
    if (!f) return 0;
    let inLine = 0;
    if (ttsUtter) inLine = Math.min(f.dur, (performance.now() - ttsStart) / 1000 * st.rate);
    else if (audio.src && M[line().key] && audio.src.endsWith(M[line().key].f)) inLine = audio.currentTime || 0;
    return f.start + inLine;
  }
  function updateTime() {
    const ch = chapter();
    const t = curTime();
    $('tlFill').style.width = (100 * t / ch.total) + '%';
    $('timeText').textContent = `${fmt(t)} / ${fmt(ch.total)}`;
  }
  function renderMarks() {
    const ch = chapter();
    $('tlMarks').innerHTML = ch.scenes.slice(1).map((_, k) => {
      const f = ch.flat.find((x) => x.si === k + 1);
      return `<i style="left:${100 * f.start / ch.total}%"></i>`;
    }).join('');
  }
  $('timeline').addEventListener('click', (ev) => {
    if (!st.started) start(0);
    const r = ev.currentTarget.getBoundingClientRect();
    const t = (ev.clientX - r.left) / r.width * chapter().total;
    const flat = chapter().flat;
    let f = flat[0];
    flat.forEach((x) => { if (x.start <= t) f = x; });
    jump(f.si, f.li, Math.max(0, Math.min(f.dur - 0.2, t - f.start)) || undefined);
  });
  (function tick() { if (st.started && st.playing) updateTime(); requestAnimationFrame(tick); })();

  /* ---------- 章節選單 ---------- */
  function renderMenu() {
    const n = C.chapters.filter((c) => saved.done[c.id]).length;
    $('progressSum').innerHTML = `已完成 ${n} / ${C.chapters.length} 章
      <div class="bar"><i style="width:${100 * n / C.chapters.length}%"></i></div>`;
    $('chapterList').innerHTML = C.chapters.map((c, k) => `
      <li class="${k === st.ci && st.started ? 'current' : ''}"><button data-ch="${k}">
        <span class="ic">${c.icon}</span>
        <span><div class="t">${esc(c.title)}</div><div class="d">${esc(c.brief)}</div></span>
        <span class="m">${fmt(c.total)}<br>${saved.done[c.id] ? '<span class="ok">✔ 已完成</span>' : ''}</span>
      </button></li>`).join('') +
      (C.org.quizUrl ? `<li class="quiz-entry"><a href="${esc(C.org.quizUrl)}" target="_blank" rel="noopener"><span class="ic">📝</span>
        <span><div class="t">課後測驗</div><div class="d">另開新視窗作答</div></span><span class="m">↗</span></a></li>` : '');
  }
  $('chapterList').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    closeMenu();
    const k = +b.dataset.ch;
    if (!st.started) start(k); else goChapter(k, true);
  });
  const openMenu = () => { renderMenu(); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); };
  const closeMenu = () => { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); };
  $('btnMenu').onclick = openMenu; $('btnChapters').onclick = openMenu; $('drawerClose').onclick = closeMenu;
  $('drawer').addEventListener('click', (ev) => { if (ev.target.id === 'drawer') closeMenu(); });

  /* ---------- 開始 ---------- */
  function start(ci, pos) {
    st.started = true;
    $('splash').classList.add('gone');
    st.ci = ci; st.si = pos ? pos.si : 0; st.li = pos ? pos.li : 0;
    renderScene(); renderMarks(); renderMenu();
    setPlaying(true);
    playCurrent();
  }
  $('btnStart').onclick = () => start(0);
  if (saved.pos && (saved.pos.ci || saved.pos.si || saved.pos.li)) {
    const p = saved.pos;
    if (C.chapters[p.ci] && C.chapters[p.ci].scenes[p.si] && C.chapters[p.ci].scenes[p.si].lines[p.li]) {
      $('btnResume').hidden = false;
      $('btnResume').textContent = `⏯ 繼續上次進度（${C.chapters[p.ci].title.replace(/^.*　/, '')}）`;
      $('btnResume').onclick = () => start(p.ci, p);
    }
  }
  $('totalMin').textContent = Math.round(C.chapters.reduce((a, c) => a + c.total, 0) / 60);

  /* ---------- 控制 ---------- */
  $('btnPlay').onclick = togglePlay;
  $('btnPrev').onclick = () => { if (!st.started) return; goLine(-1); };
  $('btnNext').onclick = () => { if (!st.started) return; goLine(1); };
  $('speed').onchange = (e) => { st.rate = +e.target.value; audio.playbackRate = st.rate; };
  $('btnCC').onclick = () => { st.cc = !st.cc; $('btnCC').classList.toggle('on', st.cc); $('subtitle').classList.toggle('off', !st.cc); };
  $('btnFull').onclick = () => {
    const el = $('app');
    if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen();
  };
  if (C.org.quizUrl) $('btnQuiz').href = C.org.quizUrl; else $('btnQuiz').hidden = true;
  $('btnQuiz').addEventListener('click', () => { if (st.playing) togglePlay(); });
  stage.addEventListener('click', (ev) => { if (st.started && !ev.target.closest('button, a')) togglePlay(); });
  document.addEventListener('keydown', (ev) => {
    if (/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.code === 'Space') { ev.preventDefault(); togglePlay(); }
    else if (ev.key === 'ArrowRight' && st.started) goLine(1);
    else if (ev.key === 'ArrowLeft' && st.started) goLine(-1);
    else if (ev.key === 'm' || ev.key === 'M') openMenu();
    else if (ev.key === 'f' || ev.key === 'F') $('btnFull').click();
    else if (ev.key === 'Escape') closeMenu();
  });

  // 供自動化測試／錄製使用
  window.__player = {
    goto(ci, si, li) { if (!st.started) start(ci); stopAll(); st.ci = ci; renderMarks(); st.si = -1; jump(si, li || 0); },
    state: st
  };

  // 初始畫面：先渲染第一個場景當背景
  if (RECORD) { window.__start = () => start(+REC); }
  renderScene();
  setSpeaker('L', false);
  $('subtitle').classList.add('empty');
})();
