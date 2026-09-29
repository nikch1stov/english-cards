import { parseWords, dayKey, addDays, schedule, buildQueue, streak, dayHistory, LEARNED_IVL } from './core.js?v=3';

const STORE_KEY = 'english-cards:v1';
const SESSION_KEY = 'english-cards:session';
const SCREEN_KEY = 'english-cards:screen';
const DIRS = { 'en-ru': 'EN → RU', 'ru-en': 'RU → EN' };
const NEW_OPTIONS = [5, 10, 20, 50];
const RANGES = [7, 30, 90];

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

let cards = [];
let byId = new Map();
let topics = [];
let state = loadState();
let screen = 'home';
let session = null;
let range = 30;

function loadState() {
  const fallback = { settings: { dir: 'en-ru', newPerDay: 10 }, progress: { 'en-ru': {}, 'ru-en': {} }, days: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return fallback;
    return {
      settings: { ...fallback.settings, ...saved.settings },
      progress: { ...fallback.progress, ...saved.progress },
      days: saved.days || {},
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

function saveSession() {
  try {
    if (!session) { sessionStorage.removeItem(SESSION_KEY); return; }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, queue: session.queue.map(c => c.id) }));
  } catch {}
}

function restoreSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!s || s.dir !== dir()) return null;
    return { ...s, queue: s.queue.map(id => byId.get(id)).filter(Boolean) };
  } catch {
    return null;
  }
}

const dir = () => state.settings.dir;
const progress = () => state.progress[dir()];
const today = () => dayKey();

function todayStats() {
  return state.days[today()] || { reviewed: 0, new: {} };
}

function newLeft() {
  return state.settings.newPerDay - (todayStats().new?.[dir()] || 0);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  return voices.find(v => /en[-_]US/i.test(v.lang) && v.localService)
    || voices.find(v => /en[-_]US/i.test(v.lang))
    || voices[0];
}

function speak(text, btn) {
  const synth = window.speechSynthesis;
  if (!synth) { toast('Озвучка не поддерживается в этом браузере'); return; }
  // iOS drops an utterance queued right after an unconditional cancel().
  if (synth.speaking || synth.pending) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  btn?.classList.add('playing');
  u.onend = u.onerror = () => btn?.classList.remove('playing');
  synth.resume();
  synth.speak(u);
}

let toastTimer;
function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const speakBtn = (text, cls = '') =>
  `<button type="button" class="speak-btn ${cls}" data-speak="${esc(text)}" aria-label="Произнести">${SPEAKER_SVG}</button>`;

function whenLabel(days) {
  if (days <= 1) return 'завтра';
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

function topicStats(list) {
  const p = progress();
  const t = today();
  let learned = 0, due = 0, fresh = 0;
  for (const c of list) {
    const s = p[c.id];
    if (!s) fresh++;
    else {
      if (s.ivl >= LEARNED_IVL) learned++;
      if (s.due <= t) due++;
    }
  }
  return { learned, due, fresh, total: list.length };
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const shortDate = key => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

// ---------- screens ----------

function renderHome() {
  const all = topicStats(cards);
  const planNew = Math.min(Math.max(0, newLeft()), all.fresh);
  const s = streak(state.days, today());
  const limit = state.settings.newPerDay;
  const newToday = todayStats().new?.[dir()] || 0;
  const tomorrow = addDays(today(), 1);
  const p = progress();
  const dueTomorrow = cards.filter(c => p[c.id] && p[c.id].due === tomorrow).length;
  const learning = all.total - all.fresh - all.learned;
  const nothing = all.due + planNew === 0;

  app.innerHTML = `
    <header class="top">
      <h1>Карточки</h1>
      <span class="chip" title="Серия дней">🔥 ${s}</span>
    </header>

    <section class="plan">
      <div class="row"><h3>Сегодня</h3><span class="muted small">${DIRS[dir()]}</span></div>
      <div class="row small"><span>Новые слова</span><b>${Math.min(newToday, limit)} из ${limit}</b></div>
      <div class="bar"><span style="width:${Math.min(100, (newToday / limit) * 100)}%"></span></div>
      <div class="plan-nums">
        <div><b>${all.due}</b><span>повторить сейчас</span></div>
        <div><b>${planNew}</b><span>новых осталось</span></div>
        <div><b>${dueTomorrow}</b><span>вернутся завтра</span></div>
      </div>
      <button type="button" class="btn primary big" data-study="*" ${nothing ? 'disabled' : ''}>
        ${nothing ? 'На сегодня всё 🎉' : 'Учить всё'}
      </button>
    </section>

    <section class="panel">
      <div class="row"><h3>Мой словарь</h3><b>${all.learned} из ${all.total}</b></div>
      <div class="bar split">
        <span style="width:${(all.learned / all.total) * 100}%"></span><span class="learning" style="width:${(learning / all.total) * 100}%"></span>
      </div>
      <div class="legend">
        <span><i class="dot learned"></i>Выучено ${all.learned}</span>
        <span><i class="dot learning"></i>Изучаю ${learning}</span>
        <span><i class="dot fresh"></i>Не начато ${all.fresh}</span>
      </div>
      <p class="muted small">Слово становится выученным примерно после 3 ответов «Знаю» в разные дни: оно возвращается завтра, потом через 3 дня, потом через 8.</p>
    </section>

    <h2 class="section-title">Темы</h2>
    <ul class="topics">
      ${topics.map((t, i) => {
        const st = topicStats(t.cards);
        const pct = Math.round((st.learned / st.total) * 100);
        return `
          <li>
            <button type="button" class="topic" data-study="${i}">
              <span class="topic-name">${esc(t.name)}</span>
              <span class="topic-meta">
                ${st.due ? `<span class="badge">${st.due}</span>` : ''}
                <span class="muted small">${st.learned}/${st.total}</span>
              </span>
              <span class="bar"><span style="width:${pct}%"></span></span>
            </button>
          </li>`;
      }).join('')}
    </ul>`;
}

function startSession(key) {
  const topic = key === '*' ? null : topics[Number(key)];
  const list = topic ? topic.cards : cards;
  const queue = buildQueue(list, progress(), today(), newLeft());
  session = { title: topic ? topic.name : 'Все темы', dir: dir(), queue, done: 0, total: queue.length, revealed: false };
  show('study');
}

function renderStudy() {
  if (!session) { show('home'); return; }
  const card = session.queue[0];

  if (!card) {
    app.innerHTML = `
      <header class="top"><h1>${esc(session.title)}</h1></header>
      <section class="done">
        <div class="done-emoji">${session.total ? '🎉' : '😴'}</div>
        <h2>${session.total ? 'Готово!' : 'Здесь пока нечего учить'}</h2>
        <p class="muted">${session.total ? `Карточек пройдено: ${session.total}` : 'Все карточки темы на сегодня пройдены или закончился лимит новых слов. Лимит можно поменять в настройках.'}</p>
        <button type="button" class="btn primary big" data-go="home">На главную</button>
      </section>`;
    return;
  }

  const enFront = dir() === 'en-ru';
  const wordBlock = `
    <div class="word-row">
      <span class="word">${esc(card.word)}</span>
      ${speakBtn(card.word)}
    </div>
    ${card.ipa ? `<div class="ipa">${esc(card.ipa)}</div>` : ''}`;
  const transBlock = `<div class="translation">${esc(card.translation)}</div>`;
  const isNew = !progress()[card.id];

  app.innerHTML = `
    <header class="top study-top">
      <button type="button" class="icon-btn" data-go="home" aria-label="Назад">←</button>
      <span class="muted">${esc(session.title)}</span>
      <span class="muted small">${session.done} / ${session.total}</span>
    </header>
    <div class="bar thin"><span style="width:${session.total ? (session.done / session.total) * 100 : 0}%"></span></div>

    <section class="card ${session.revealed ? 'revealed' : ''}" data-reveal>
      ${isNew ? '<span class="tag">новое</span>' : ''}
      <span class="tag topic-tag">${esc(card.topic)}</span>
      <div class="face">${enFront ? wordBlock : transBlock}</div>
      ${session.revealed ? `
        <hr>
        <div class="face">${enFront ? transBlock : wordBlock}</div>
        ${card.exEn ? `<div class="example">${speakBtn(card.exEn, 'small')}<div>${esc(card.exEn)}</div><div class="muted">${esc(card.exRu)}</div></div>` : ''}
      ` : '<p class="muted small hint">Нажми, чтобы увидеть ответ</p>'}
    </section>

    <footer class="actions">
      ${session.revealed ? `
        <button type="button" class="btn no" data-grade="0">Не знаю</button>
        <button type="button" class="btn yes" data-grade="1">Знаю</button>
      ` : `<button type="button" class="btn primary" data-reveal>Показать ответ</button>`}
    </footer>`;
}

function grade(known) {
  const card = session.queue.shift();
  const t = today();
  const d = dir();
  const p = progress();
  const day = state.days[t] || (state.days[t] = { reviewed: 0, new: {} });
  day.known ||= {};
  day.wrong ||= {};

  if (!p[card.id]) day.new[d] = (day.new[d] || 0) + 1;
  day.reviewed += 1;
  const bucket = known ? day.known : day.wrong;
  bucket[d] = (bucket[d] || 0) + 1;
  p[card.id] = schedule(p[card.id], known, t);

  const st = topicStats(cards);
  day.snap = { ...day.snap, [d]: { learned: st.learned, started: st.total - st.fresh } };
  saveState();

  if (known) {
    session.done += 1;
    toast(`«${card.word}» — повтор ${whenLabel(p[card.id].ivl)}`);
  } else {
    session.queue.splice(Math.min(3, session.queue.length), 0, card);
    toast(session.queue.length > 1 ? 'Покажу это слово ещё раз через пару карточек' : 'Попробуем ещё раз');
  }
  session.revealed = false;
  saveSession();
  renderStudy();
}

// ---------- charts ----------

const W = 320, H = 150, PAD_L = 28, PAD_R = 8, PAD_T = 10, PAD_B = 22;

function axis(data, maxY) {
  const n = data.length;
  const x = i => PAD_L + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R));
  const y = v => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);
  const ticks = [0, Math.round(maxY / 2), maxY];
  const grid = ticks.map(v => `
    <line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    <text x="${PAD_L - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`).join('');
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const labels = labelIdx.map(i => `
    <text x="${x(i)}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="axis">${shortDate(data[i].day)}</text>`).join('');
  return { x, y, grid, labels };
}

function niceMax(v) {
  if (v <= 10) return 10;
  const step = v <= 50 ? 10 : v <= 200 ? 50 : 100;
  return Math.ceil(v / step) * step;
}

function lineChart(data) {
  const maxY = niceMax(Math.max(...data.map(d => d.started)));
  const { x, y, grid, labels } = axis(data, maxY);
  const pts = key => data.map((d, i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = `${x(0)},${y(0)} ${pts('learned')} ${x(data.length - 1)},${y(0)}`;
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Динамика выученных слов">
      ${grid}
      <polygon points="${area}" class="area"/>
      <polyline points="${pts('started')}" class="line started"/>
      <polyline points="${pts('learned')}" class="line learned"/>
      ${labels}
    </svg>`;
}

function barChart(data) {
  const maxY = niceMax(Math.max(...data.map(d => d.known + d.wrong)));
  const { x, y, grid, labels } = axis(data, maxY);
  const step = (W - PAD_L - PAD_R) / Math.max(1, data.length - 1);
  const bw = Math.max(2, Math.min(18, step * 0.7));
  const bars = data.map((d, i) => {
    if (!d.known && !d.wrong) return '';
    const cx = x(i) - bw / 2;
    const yKnown = y(d.known);
    const yTop = y(d.known + d.wrong);
    return `
      <rect x="${cx}" y="${yKnown}" width="${bw}" height="${y(0) - yKnown}" class="bar-yes" rx="1.5"/>
      <rect x="${cx}" y="${yTop}" width="${bw}" height="${yKnown - yTop}" class="bar-no" rx="1.5"/>`;
  }).join('');
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ответы по дням">
      ${grid}${bars}${labels}
    </svg>`;
}

// ---------- stats & settings ----------

function renderStats() {
  const all = topicStats(cards);
  const p = progress();
  const inProgress = cards.filter(c => p[c.id] && p[c.id].ivl < LEARNED_IVL).length;
  const hard = cards
    .filter(c => p[c.id]?.lapses > 0)
    .sort((a, b) => p[b.id].lapses - p[a.id].lapses)
    .slice(0, 20);
  const s = streak(state.days, today());
  const todayDone = todayStats().reviewed;
  const pct = Math.round((all.learned / all.total) * 100);

  const data = dayHistory(state.days, dir(), today(), range);
  const growth = data[data.length - 1].learned - data[0].learned;
  const answers = data.reduce((a, d) => a + d.known + d.wrong, 0);
  const correct = answers ? Math.round((data.reduce((a, d) => a + d.known, 0) / answers) * 100) : 0;

  app.innerHTML = `
    <header class="top"><h1>Статистика</h1><span class="muted small">${DIRS[dir()]}</span></header>

    <section class="stat-grid">
      <div class="stat"><b>🔥 ${s}</b><span>${plural(s, 'день', 'дня', 'дней')} подряд</span></div>
      <div class="stat"><b>${todayDone}</b><span>ответов сегодня</span></div>
      <div class="stat"><b>${all.due}</b><span>к повторению</span></div>
      <div class="stat"><b>${Math.min(Math.max(0, newLeft()), all.fresh)}</b><span>новых осталось</span></div>
    </section>

    <section class="panel">
      <div class="row"><span>Выучено</span><b>${all.learned} из ${all.total}</b></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="row muted small"><span>В процессе: ${inProgress}</span><span>Не начато: ${all.fresh}</span></div>
    </section>

    <div class="segmented range">
      ${RANGES.map(r => `<button type="button" class="${range === r ? 'on' : ''}" data-range="${r}">${r} дней</button>`).join('')}
    </div>

    <section class="panel">
      <div class="row"><h3>Динамика слов</h3><b class="${growth > 0 ? 'up' : 'muted'}">${growth > 0 ? '+' : ''}${growth} выучено</b></div>
      ${lineChart(data)}
      <div class="legend">
        <span><i class="dot learned"></i>Выучено</span>
        <span><i class="dot started"></i>Начато</span>
      </div>
    </section>

    <section class="panel">
      <div class="row"><h3>Ответы по дням</h3><b class="muted">${correct}% верно</b></div>
      ${barChart(data)}
      <div class="legend">
        <span><i class="dot yes"></i>Знаю</span>
        <span><i class="dot no"></i>Не знаю</span>
      </div>
    </section>

    <p class="muted small note">«Выучено» — слово, которое ты вспоминаешь уже с интервалом от ${LEARNED_IVL} дней. «Начато» — все слова, которые ты хоть раз видел.</p>

    <h2 class="section-title">Сложные слова</h2>
    ${hard.length ? `<ul class="hard">
      ${hard.map(c => `
        <li>
          ${speakBtn(c.word)}
          <div><b>${esc(c.word)}</b> <span class="muted">${esc(c.ipa)}</span><div class="muted small">${esc(c.translation)}</div></div>
          <span class="badge no">${p[c.id].lapses}×</span>
        </li>`).join('')}
    </ul>` : '<p class="muted panel">Пока нет — ошибки будут появляться здесь.</p>'}`;
}

function renderSettings() {
  app.innerHTML = `
    <header class="top"><h1>Настройки</h1></header>

    <section class="panel">
      <h3>Направление карточек</h3>
      <div class="segmented">
        ${Object.entries(DIRS).map(([k, v]) => `<button type="button" class="${dir() === k ? 'on' : ''}" data-dir="${k}">${v}</button>`).join('')}
      </div>
      <p class="muted small">Прогресс по каждому направлению считается отдельно.</p>
    </section>

    <section class="panel">
      <h3>Новых слов в день</h3>
      <div class="segmented">
        ${NEW_OPTIONS.map(n => `<button type="button" class="${state.settings.newPerDay === n ? 'on' : ''}" data-new="${n}">${n}</button>`).join('')}
      </div>
    </section>

    <section class="panel">
      <h3>Озвучка</h3>
      <div class="row">
        <span class="small">Проверить звук</span>
        ${speakBtn('Hello! How are you?')}
      </div>
      <p class="muted small">Если звука нет, выключи беззвучный режим (переключатель или кнопка действия сбоку на iPhone) и прибавь громкость — голос iPhone не играет в беззвучном режиме.</p>
    </section>

    <section class="panel">
      <h3>Словарь</h3>
      <p class="muted small">Слов в словаре: ${cards.length}. Тем: ${topics.length}.</p>
      <button type="button" class="btn" data-action="reload">Обновить слова</button>
    </section>

    <section class="panel">
      <h3>Сброс</h3>
      <p class="muted small">Удалит весь прогресс по направлению ${DIRS[dir()]}.</p>
      <button type="button" class="btn no" data-action="reset">Сбросить прогресс</button>
    </section>`;
}

// ---------- navigation & events ----------

const SCREENS = { home: renderHome, study: renderStudy, stats: renderStats, settings: renderSettings };

function show(name) {
  screen = SCREENS[name] ? name : 'home';
  if (screen !== 'study') session = null;
  saveSession();
  try { sessionStorage.setItem(SCREEN_KEY, screen); } catch {}
  tabs.hidden = screen === 'study';
  tabs.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === screen));
  SCREENS[screen]();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-speak],[data-grade],[data-study],[data-go],[data-dir],[data-new],[data-range],[data-action],[data-reveal]');
  if (!el) return;
  e.preventDefault();
  const d = el.dataset;

  if (d.speak !== undefined) { speak(d.speak, el); return; }
  if (d.grade !== undefined) { if (session?.queue.length) grade(d.grade === '1'); return; }
  if (d.study !== undefined) { startSession(d.study); return; }
  if (d.go) { show(d.go); return; }
  if (d.dir) { state.settings.dir = d.dir; saveState(); renderSettings(); return; }
  if (d.new) { state.settings.newPerDay = Number(d.new); saveState(); renderSettings(); return; }
  if (d.range) { range = Number(d.range); renderStats(); return; }
  if (d.action === 'reload') { location.reload(); return; }
  if (d.action === 'reset') {
    if (confirm(`Сбросить весь прогресс по направлению ${DIRS[dir()]}?`)) {
      state.progress[dir()] = {};
      for (const day of Object.values(state.days)) if (day.snap) delete day.snap[dir()];
      saveState();
      renderSettings();
    }
    return;
  }
  if (d.reveal !== undefined && session && !session.revealed) {
    session.revealed = true;
    saveSession();
    renderStudy();
  }
});

async function init() {
  try {
    const res = await fetch('words.md', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    cards = parseWords(await res.text());
  } catch {
    app.innerHTML = '<p class="panel">Не удалось загрузить словарь. Проверь интернет и обнови страницу.</p>';
    return;
  }
  byId = new Map(cards.map(c => [c.id, c]));
  const byTopic = new Map();
  for (const c of cards) {
    if (!byTopic.has(c.topic)) byTopic.set(c.topic, []);
    byTopic.get(c.topic).push(c);
  }
  topics = [...byTopic].map(([name, list]) => ({ name, cards: list }));

  if (location.hash) history.replaceState(null, '', location.pathname);
  session = restoreSession();
  let last = 'home';
  try { last = sessionStorage.getItem(SCREEN_KEY) || 'home'; } catch {}
  show(session ? 'study' : last === 'study' ? 'home' : last);
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js');
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();

init();
