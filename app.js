import { parseWords, dayKey, addDays, schedule, buildQueue, streak, dayHistory, mergeState, LEARNED_IVL } from './core.js?v=6';
import { mascot, LETTERS } from './mascot.js?v=6';
import { cloudEnabled, getClient, signInWithGoogle, signOut, pullState, pushState, userProfile } from './cloud.js?v=9';

const STORE_KEY = 'english-cards:v1';
const SESSION_KEY = 'english-cards:session';
const SCREEN_KEY = 'english-cards:screen';
const GREET_KEY = 'english-cards:greet';
const GREETED_KEY = 'english-cards:greeted';
const LETTER_KEY = 'english-cards:letter';
const THEMES = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
const THEME_COLORS = { light: '#f5f5fa', dark: '#0a0a0f' };
const SYNC_LABELS = { idle: '', saving: 'Сохраняю…', saved: 'Сохранено в облаке', error: 'Нет связи — сохраню позже' };
const DIRS = { 'en-ru': 'EN → RU', 'ru-en': 'RU → EN' };
const NEW_OPTIONS = [5, 10, 20, 50];
const RANGES = [7, 30, 90];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

let cards = [];
let byId = new Map();
let topics = [];
let state = loadState();
const LETTER = pickLetter();
let screen = 'home';
let session = null;
let range = 30;
let user = null;
let pulled = false;
let syncStatus = 'idle';
let pushTimer;

// ---------- storage ----------

function loadState() {
  const fallback = { settings: { dir: 'en-ru', newPerDay: 10, theme: 'auto', haptics: true }, progress: { 'en-ru': {}, 'ru-en': {} }, days: {} };
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

function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

function saveState() {
  saveLocal();
  schedulePush();
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

// ---------- helpers ----------

const dir = () => state.settings.dir;
const progress = () => state.progress[dir()];
const today = () => dayKey();
const todayStats = () => state.days[today()] || { reviewed: 0, new: {} };
const newLeft = () => state.settings.newPerDay - (todayStats().new?.[dir()] || 0);
const shortDate = key => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const cardsWord = n => plural(n, 'карточка', 'карточки', 'карточек');

function whenLabel(days) {
  if (days <= 1) return 'завтра';
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
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

// ---------- icons ----------

const ICONS = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.5 3-1.5 4.5-3 6.5-1.3 1.7-2 3.3-2 5.2A5 5 0 0 0 12 19.5a5 5 0 0 0 5-5.3c0-2.6-1.4-4.2-2.4-5.4-.2 1.3-.8 2.2-1.7 2.7.4-3.2-.2-6.3-.9-9z" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
};

const speakBtn = (text, cls = '') =>
  `<button type="button" class="speak-btn ${cls}" data-speak="${esc(text)}" aria-label="Произнести">${ICONS.speaker}</button>`;

function ring(pct, size, stroke, cls = '') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `
    <svg class="ring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
}

// ---------- speech ----------

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

// ---------- toast & confetti ----------

let toastTimer;
function toast(text, mood) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.innerHTML = `${mood ? buddy(mood, 26, 'toast-mascot') : ''}<span>${esc(text)}</span>`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function confetti() {
  if (REDUCED_MOTION.matches) return;
  const colors = ['#FFB829', '#FF8A3D', '#FFD66B', '#10b981', '#38bdf8', '#ec4899'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.innerHTML = Array.from({ length: 48 }, (_, i) => {
    const x = (Math.random() * 2 - 1) * 180;
    const up = -(120 + Math.random() * 160);
    const r = Math.round(Math.random() * 720 - 360);
    const d = (Math.random() * 0.25).toFixed(2);
    const w = 6 + Math.round(Math.random() * 5);
    return `<i style="--x:${x}px;--up:${up}px;--r:${r}deg;--d:${d}s;width:${w}px;height:${Math.round(w * 1.6)}px;background:${colors[i % colors.length]}"></i>`;
  }).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

// ---------- letter of the session ----------

// One letter mascot per app launch; the deck guarantees every letter appears before any repeats.
function pickLetter() {
  const letters = Object.keys(LETTERS);
  try {
    const current = sessionStorage.getItem(LETTER_KEY);
    if (current && LETTERS[current]) return current;
  } catch {}
  let deck;
  try { deck = JSON.parse(localStorage.getItem(LETTER_KEY)); } catch {}
  if (!deck?.order || deck.order.length !== letters.length || deck.i >= letters.length) {
    const last = deck?.order?.[deck.order.length - 1];
    const order = [...letters].sort(() => Math.random() - 0.5);
    if (order[0] === last) order.push(order.shift());
    deck = { order, i: 0 };
  }
  const letter = deck.order[deck.i];
  deck.i += 1;
  try {
    localStorage.setItem(LETTER_KEY, JSON.stringify(deck));
    sessionStorage.setItem(LETTER_KEY, letter);
  } catch {}
  return letter;
}

const buddy = (mood, size, cls = '') => mascot(mood, size, cls, LETTER);

// ---------- theme ----------

function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const own = m.media.includes('dark') ? 'dark' : 'light';
    m.content = THEME_COLORS[t === 'light' || t === 'dark' ? t : own];
  });
}

// ---------- haptics ----------

// iPhone Safari has no Vibration API and ignores scripted clicks, but a finger tap that toggles a native
// <input type=checkbox switch> plays the system haptic. So tappable controls carry an invisible switch on top.
const HX = () => (state.settings.haptics ? '<input type="checkbox" switch class="hx" tabindex="-1" aria-hidden="true">' : '');

function haptic(kind = 'light') {
  if (!state.settings.haptics || !navigator.vibrate) return;
  navigator.vibrate({ light: 12, success: [14, 70, 14, 70, 24], error: [30, 60, 30] }[kind]);
}

function updateTabBadge() {
  const badge = document.getElementById('mistakes-badge');
  if (!badge || !cards.length) return;
  const n = hardCards().length;
  badge.textContent = n > 99 ? '99+' : n;
  badge.hidden = !n;
}

function refreshTabHaptics() {
  tabs.querySelectorAll('.hx').forEach(i => i.remove());
  if (state.settings.haptics) tabs.querySelectorAll('[data-go]').forEach(t => t.insertAdjacentHTML('afterbegin', HX()));
}

// ---------- greeting splash ----------

const GREETINGS = [
  ['Hello!', 'Привет!'],
  ['Hi there!', 'Приветик!'],
  ['Welcome back!', 'С возвращением!'],
  ['Good to see you!', 'Рад тебя видеть!'],
  ['Hey, friend!', 'Привет, друг!'],
  ['How’s it going?', 'Как дела?'],
  ['What’s up?', 'Как жизнь?'],
  ['Ready to learn?', 'Готов учиться?'],
  ['Let’s learn some words!', 'Давай выучим пару слов!'],
  ['Nice to see you again!', 'Приятно снова тебя видеть!'],
  ['Look who’s here!', 'Смотрите, кто пришёл!'],
  ['Hey, superstar!', 'Привет, звезда!'],
  ['Howdy, partner!', 'Здорово, напарник!'],
  ['Hiya!', 'Приветики!'],
  ['Great to have you here!', 'Здорово, что ты здесь!'],
  ['Let’s do this!', 'Погнали!'],
  ['Today is a great day to learn!', 'Отличный день, чтобы учиться!'],
  ['You can do it!', 'У тебя всё получится!'],
  ['Hello, word hunter!', 'Привет, охотник за словами!'],
  ['Knock knock! Time to learn!', 'Тук-тук! Пора учиться!'],
  ['Hey hey hey!', 'Хей-хей-хей!'],
  ['Welcome, champion!', 'Добро пожаловать, чемпион!'],
  ['I missed you!', 'Я соскучился!'],
  ['Every word counts!', 'Каждое слово на счету!'],
  ['Small steps, big results!', 'Маленькие шаги — большой результат!'],
  ['Let’s make your brain happy!', 'Порадуем твой мозг!'],
  ['Practice makes perfect!', 'Повторение — мать учения!'],
  ['Ahoy, sailor!', 'Эй, моряк!'],
  ['Greetings, my friend!', 'Приветствую, друг мой!'],
  ['Have a wonderful day!', 'Чудесного тебе дня!'],
  ['Let’s have some fun!', 'Давай повеселимся!'],
  ['Your brain says thank you!', 'Твой мозг говорит спасибо!'],
];

function contextualGreeting() {
  const h = new Date().getHours();
  const s = streak(state.days, today());
  const lastDay = Object.keys(state.days).filter(k => k < today() && state.days[k].reviewed).sort().at(-1);
  const options = [];
  if (s >= 3) options.push([`You’re on fire! ${s} days in a row!`, `Ты в ударе! Уже ${s} ${plural(s, 'день', 'дня', 'дней')} подряд!`]);
  if (lastDay && lastDay < addDays(today(), -3)) options.push(['Long time no see!', 'Давно не виделись!']);
  if (h >= 23 || h < 5) options.push(['Still awake? Let’s learn!', 'Не спится? Давай поучимся!']);
  else if (h < 12) options.push(h < 9 ? ['Rise and shine!', 'Подъём, солнышко!'] : ['Good morning!', 'Доброе утро!']);
  else if (h < 18) options.push(['Good afternoon!', 'Добрый день!']);
  else options.push(['Good evening!', 'Добрый вечер!']);
  return options[Math.floor(Math.random() * options.length)];
}

function shuffled(n, avoidFirst) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a[0] === avoidFirst && n > 1) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

// Walks a shuffled deck so every greeting is shown once before any repeats.
function pickGreeting() {
  let deck;
  try { deck = JSON.parse(localStorage.getItem(GREET_KEY)); } catch {}
  let g;
  if (deck?.ctxDay !== today() && Math.random() < 0.5) {
    g = contextualGreeting();
    deck = { ...deck, ctxDay: today() };
  } else {
    if (!deck?.order || deck.order.length !== GREETINGS.length || deck.i >= GREETINGS.length) {
      deck = { ...deck, order: shuffled(GREETINGS.length, deck?.order?.at(-1)), i: 0 };
    }
    g = GREETINGS[deck.order[deck.i]];
    deck.i += 1;
  }
  try { localStorage.setItem(GREET_KEY, JSON.stringify(deck)); } catch {}
  return g;
}

function showSplash() {
  try {
    if (sessionStorage.getItem(GREETED_KEY)) return;
    sessionStorage.setItem(GREETED_KEY, '1');
  } catch {}
  const [en, ru] = pickGreeting();
  const el = document.createElement('div');
  el.id = 'splash';
  el.innerHTML = `
    ${HX()}
    <div class="splash-inner">
      <div class="splash-bubble">
        <p class="splash-en">${esc(en)}</p>
        <p class="splash-ru">${esc(ru)}</p>
        ${speakBtn(en, 'small')}
      </div>
      ${buddy('wave', 150, 'jump')}
      <p class="splash-name">${LETTER === 'A' ? 'Это Эй — буква A' : `Сегодня с тобой буква ${LETTER} — «${LETTERS[LETTER].name.toLowerCase()}»`}</p>
      <p class="splash-hint">Нажми, чтобы начать</p>
    </div>`;
  document.body.append(el);
  let timer = setTimeout(close, 6000);
  function close() {
    if (el.classList.contains('out')) return;
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }
  // The speaker gets its own listener: iOS only turns a tap into a click on elements it considers clickable.
  const speaker = el.querySelector('[data-speak]');
  speaker.addEventListener('click', e => {
    e.stopPropagation();
    speak(en, speaker);
    clearTimeout(timer);
    timer = setTimeout(close, 6000);
  });
  el.addEventListener('click', () => {
    haptic();
    close();
  });
}

// ---------- cloud sync ----------

function setSync(s) {
  syncStatus = s;
  const el = document.getElementById('sync-status');
  if (el) el.textContent = SYNC_LABELS[s];
}

function schedulePush() {
  if (!user || !pulled) return;
  clearTimeout(pushTimer);
  setSync('saving');
  const uid = user.id;
  pushTimer = setTimeout(() => {
    pushState(uid, state).then(() => setSync('saved'), () => setSync('error'));
  }, 1500);
}

async function syncNow() {
  if (!user) return;
  setSync('saving');
  try {
    const remote = await pullState(user.id);
    state = mergeState(state, remote);
    pulled = true;
    saveLocal();
    applyTheme();
    await pushState(user.id, state);
    setSync('saved');
    if (screen !== 'study') SCREENS[screen]();
  } catch {
    setSync('error');
  }
}

async function initCloud() {
  if (!cloudEnabled) return;
  try {
    const sb = await getClient();
    sb.auth.onAuthStateChange((event, sess) => {
      const next = sess?.user || null;
      if (next?.id === user?.id) { user = next; return; }
      user = next;
      pulled = false;
      if (location.search.includes('code=')) history.replaceState(null, '', location.pathname);
      // Supabase warns against awaiting its own calls inside this callback.
      if (user) {
        setTimeout(syncNow, 0);
        if (event === 'SIGNED_IN') toast(`Привет, ${userProfile(user).name.split(' ')[0]}!`, 'happy');
      } else {
        setSync('idle');
      }
      if (screen === 'settings' || screen === 'home') SCREENS[screen]();
    });
  } catch {
    setSync('error');
  }
}

const GOOGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2a11 11 0 0 0 0 9.8L5.7 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.7 3.4-4.6 6.3-4.6z"/></svg>';

function accountSection() {
  if (!cloudEnabled) {
    return `
      <h2 class="group-title">Аккаунт</h2>
      <section class="card-surface group">
        <div class="group-row"><span>Вход через Google</span><span class="chip">скоро</span></div>
      </section>
      <p class="group-note">Появится после подключения сервера аккаунтов.</p>`;
  }
  if (!user) {
    return `
      <h2 class="group-title">Аккаунт</h2>
      <section class="card-surface pad account-cta">
        <p>Войди, чтобы прогресс сохранялся в облаке и был доступен на любом устройстве.</p>
        <button type="button" class="btn google block" data-action="signin">${GOOGLE_ICON}Войти через Google</button>
      </section>`;
  }
  const p = userProfile(user);
  const avatar = p.avatar
    ? `<img class="avatar" src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar">${esc(p.name[0].toUpperCase())}</span>`;
  return `
    <h2 class="group-title">Аккаунт</h2>
    <section class="card-surface group">
      <div class="group-row account">
        ${avatar}
        <span class="list-main"><span class="list-title">${esc(p.name)}</span><span class="list-sub">${esc(p.email)}</span></span>
      </div>
      <div class="group-row"><span>Синхронизация</span><span id="sync-status" class="muted small">${SYNC_LABELS[syncStatus]}</span></div>
      <button type="button" class="group-row link danger" data-action="signout">Выйти</button>
    </section>`;
}

// ---------- home ----------

function renderHome() {
  const all = topicStats(cards);
  const planNew = Math.min(Math.max(0, newLeft()), all.fresh);
  const s = streak(state.days, today());
  const limit = state.settings.newPerDay;
  const newToday = todayStats().new?.[dir()] || 0;
  const doneToday = todayStats().known?.[dir()] || 0;
  const remaining = all.due + planNew;
  const goal = doneToday + remaining;
  const tomorrow = addDays(today(), 1);
  const p = progress();
  const dueTomorrow = cards.filter(c => p[c.id] && p[c.id].due === tomorrow).length;
  const learning = all.total - all.fresh - all.learned;

  let bubble;
  if (!remaining && doneToday) bubble = 'Всё на сегодня! Слова закреплены — увидимся завтра.';
  else if (!remaining) bubble = 'На сегодня карточек нет. Можно отдохнуть!';
  else if (doneToday) bubble = `Уже ${doneToday}! Осталось ${remaining} — добьём?`;
  else bubble = `Сегодня ${remaining} ${cardsWord(remaining)}. Начнём?`;

  app.innerHTML = `
    <header class="hero-head">
      <div>
        <p class="eyebrow">${greeting()}${user ? `, ${esc(userProfile(user).name.split(' ')[0])}` : ''}</p>
        <h1>Учим английский</h1>
      </div>
      <span class="streak ${s ? 'on' : ''}" aria-label="Серия дней">${ICONS.flame}${s}</span>
    </header>

    <section class="hero card-surface">
      <div class="hero-top">
        <div class="hero-mascot">${buddy(remaining ? 'wave' : 'happy', 84, 'idle')}</div>
        <p class="bubble">${esc(bubble)}</p>
      </div>
      <div class="goal">
        <div class="goal-ring">
          ${ring(goal ? doneToday / goal : 1, 104, 10)}
          <div class="goal-center"><b>${doneToday}</b><span>из ${goal}</span></div>
        </div>
        <ul class="goal-list">
          <li><span class="dot due"></span>Повторить<b>${all.due}</b></li>
          <li><span class="dot new"></span>Новые<b>${newToday}/${limit}</b></li>
          <li><span class="dot soon"></span>Завтра<b>${dueTomorrow}</b></li>
        </ul>
      </div>
      ${remaining
        ? `<label class="btn primary block" role="button" data-study="*">${HX()}${ICONS.play}Начать урок</label>`
        : '<button type="button" class="btn primary block" disabled>На сегодня всё</button>'}
    </section>

    <section class="card-surface pad">
      <div class="row"><h2 class="h3">Мой словарь</h2><span class="muted num">${all.learned} / ${all.total}</span></div>
      <div class="meter">
        <span class="learned" style="width:${(all.learned / all.total) * 100}%"></span><span class="learning" style="width:${(learning / all.total) * 100}%"></span>
      </div>
      <div class="legend">
        <span><i class="dot learned"></i>Выучено ${all.learned}</span>
        <span><i class="dot learning"></i>Изучаю ${learning}</span>
        <span><i class="dot fresh"></i>Впереди ${all.fresh}</span>
      </div>
    </section>

    <h2 class="section-title">Темы</h2>
    <ul class="list card-surface">
      ${topics.map((t, i) => {
        const st = topicStats(t.cards);
        return `
          <li>
            <label class="list-row" role="button" data-study="${i}">${HX()}
              <span class="topic-ring">${ring(st.learned / st.total, 36, 4)}</span>
              <span class="list-main">
                <span class="list-title">${esc(t.name)}</span>
                <span class="list-sub">${st.total} ${plural(st.total, 'слово', 'слова', 'слов')} · выучено ${st.learned}</span>
              </span>
              ${st.due ? `<span class="pill">${st.due}</span>` : ''}
              <span class="chev">${ICONS.chevron}</span>
            </label>
          </li>`;
      }).join('')}
    </ul>`;
}

// ---------- study ----------

const hardCards = () => {
  const p = progress();
  return cards.filter(c => p[c.id]?.lapses > 0).sort((a, b) => p[b.id].lapses - p[a.id].lapses);
};

function startSession(key) {
  if (key === 'mistakes') {
    const queue = hardCards();
    session = { title: 'Работа над ошибками', mode: 'practice', dir: dir(), queue, done: 0, total: queue.length, revealed: false, enter: true, seen: [], firstTry: 0, fresh: 0 };
    show('study');
    return;
  }
  const topic = key === '*' ? null : topics[Number(key)];
  const list = topic ? topic.cards : cards;
  const queue = buildQueue(list, progress(), today(), newLeft());
  session = {
    title: topic ? topic.name : 'Урок дня',
    dir: dir(),
    queue,
    done: 0,
    total: queue.length,
    revealed: false,
    enter: true,
    seen: [],
    firstTry: 0,
    fresh: queue.filter(c => !progress()[c.id]).length,
  };
  show('study');
}

function renderDone() {
  clearTimeout(toastTimer);
  document.getElementById('toast')?.classList.remove('show');
  const had = session.total > 0;
  const acc = had ? Math.round((session.firstTry / session.total) * 100) : 0;
  const s = streak(state.days, today());
  if (session.mode === 'practice') {
    const left = hardCards().length;
    app.innerHTML = `
      <section class="done">
        <div class="done-mascot">${buddy('celebrate', 150, 'jump')}</div>
        <h1>Ошибки проработаны!</h1>
        <p class="muted">${left ? `В списке ошибок осталось ${left} ${plural(left, 'слово', 'слова', 'слов')}. Каждый верный ответ с первого раза убирает одну ошибку.` : 'Список ошибок пуст — все слова отработаны!'}</p>
        <div class="done-stats">
          <div><b>${session.total}</b><span>${plural(session.total, 'слово', 'слова', 'слов')}</span></div>
          <div><b>${acc}%</b><span>с первого раза</span></div>
          <div><b>${left}</b><span>осталось</span></div>
        </div>
        <button type="button" class="btn primary block" data-go="mistakes">Готово</button>
      </section>`;
    if (!session.celebrated) { session.celebrated = true; saveSession(); confetti(); }
    return;
  }
  app.innerHTML = `
    <section class="done">
      <div class="done-mascot">${buddy(had ? 'celebrate' : 'sleep', 150, had ? 'jump' : 'idle')}</div>
      <h1>${had ? 'Урок пройден!' : 'Здесь пока пусто'}</h1>
      <p class="muted">${had
        ? `${LETTER === 'A' ? 'Эй' : `Буква ${LETTER}`} гордится тобой. Слова вернутся, когда их пора будет повторить.`
        : 'Все карточки темы на сегодня пройдены или закончился лимит новых слов. Его можно поменять в профиле.'}</p>
      ${had ? `
        <div class="done-stats">
          <div><b>${session.total}</b><span>${cardsWord(session.total)}</span></div>
          <div><b>${acc}%</b><span>с первого раза</span></div>
          <div><b>${session.fresh}</b><span>новых слов</span></div>
        </div>
        ${s ? `<p class="done-streak">${ICONS.flame}${s} ${plural(s, 'день', 'дня', 'дней')} подряд</p>` : ''}` : ''}
      <button type="button" class="btn primary block" data-go="home">Продолжить</button>
    </section>`;
  if (had && !session.celebrated) {
    session.celebrated = true;
    saveSession();
    confetti();
    haptic('success');
  }
}

function renderStudy() {
  if (!session) { show('home'); return; }
  const card = session.queue[0];
  if (!card) { renderDone(); return; }

  const enFront = dir() === 'en-ru';
  const wordBlock = `
    <div class="word-row">
      <span class="word">${esc(card.word)}</span>
      ${speakBtn(card.word)}
    </div>
    ${card.ipa ? `<div class="ipa">${esc(card.ipa)}</div>` : ''}`;
  const transBlock = `<div class="translation">${esc(card.translation)}</div>`;
  const isNew = !progress()[card.id];
  const pct = session.total ? (session.done / session.total) * 100 : 0;

  app.innerHTML = `
    <header class="study-top">
      <button type="button" class="icon-btn" data-go="home" aria-label="Закрыть урок">${ICONS.close}</button>
      <div class="progress" role="progressbar" aria-valuenow="${session.done}" aria-valuemax="${session.total}"><span style="width:${pct}%"></span></div>
      <span class="muted num small">${session.done}/${session.total}</span>
    </header>

    <section class="flash ${session.revealed ? 'revealed' : ''} ${session.enter ? 'enter' : ''}" data-reveal>
      ${session.revealed ? '' : HX()}
      <div class="flash-meta">
        ${session.mode === 'practice' ? '<span class="chip warn">Ошибка</span>' : isNew ? '<span class="chip accent">Новое слово</span>' : '<span class="chip">Повторение</span>'}
        <span class="muted small ellipsis">${esc(card.topic)}</span>
      </div>
      <div class="flash-body">
        <div class="face">${enFront ? wordBlock : transBlock}</div>
        ${session.revealed ? `
          <div class="answer">
            <div class="divider"></div>
            <div class="face">${enFront ? transBlock : wordBlock}</div>
            ${card.exEn ? `
              <div class="example">
                <div class="example-text"><p>${esc(card.exEn)}</p><p class="muted">${esc(card.exRu)}</p></div>
                ${speakBtn(card.exEn, 'small')}
              </div>` : ''}
          </div>` : ''}
      </div>
      ${session.revealed ? '' : '<p class="tap-hint muted small">Нажми, чтобы перевернуть</p>'}
    </section>

    <footer class="actions">
      ${session.revealed ? `
        <label class="btn no" role="button" data-grade="0">${HX()}Не знаю</label>
        <label class="btn yes" role="button" data-grade="1">${HX()}Знаю</label>
      ` : `<label class="btn primary block" role="button" data-reveal>${HX()}Показать ответ</label>`}
    </footer>`;
  session.enter = false;
}

// Mistakes practice doesn't touch the repetition schedule; a first-try «Знаю» just lowers the word's error count.
function practiceGrade(known) {
  const card = session.queue.shift();
  const t = today();
  const day = state.days[t] || (state.days[t] = { reviewed: 0, new: {} });
  day.reviewed += 1;
  const firstTime = !session.seen.includes(card.id);
  if (firstTime) session.seen.push(card.id);
  haptic(known ? 'light' : 'error');
  if (known) {
    session.done += 1;
    if (firstTime) {
      session.firstTry += 1;
      const s = progress()[card.id];
      s.lapses = Math.max(0, s.lapses - 1);
    }
    if (session.queue.length) toast(firstTime ? 'Отлично! Ошибок у слова стало меньше' : 'Запомнил!');
  } else {
    session.queue.splice(Math.min(3, session.queue.length), 0, card);
    toast('Ничего страшного — покажу ещё раз', 'sad');
  }
  saveState();
  session.revealed = false;
  session.enter = true;
  saveSession();
  renderStudy();
}

function grade(known) {
  if (session.mode === 'practice') { practiceGrade(known); return; }
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

  const firstTime = !session.seen.includes(card.id);
  if (firstTime) session.seen.push(card.id);
  haptic(known ? 'light' : 'error');
  if (known) {
    session.done += 1;
    if (firstTime) session.firstTry += 1;
    if (session.queue.length) toast(`«${card.word}» — повтор ${whenLabel(p[card.id].ivl)}`);
  } else {
    session.queue.splice(Math.min(3, session.queue.length), 0, card);
    toast(session.queue.length > 1 ? 'Ничего страшного — покажу ещё раз' : 'Попробуем ещё раз', 'sad');
  }
  session.revealed = false;
  session.enter = true;
  saveSession();
  renderStudy();
}

// ---------- charts ----------

const W = 320, H = 150, PAD_L = 26, PAD_R = 6, PAD_T = 12, PAD_B = 22;

function niceMax(v) {
  if (v <= 10) return 10;
  const step = v <= 50 ? 10 : v <= 200 ? 50 : 100;
  return Math.ceil(v / step) * step;
}

function axis(data, maxY) {
  const n = data.length;
  const x = i => PAD_L + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R));
  const y = v => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);
  const grid = [0, maxY / 2, maxY].map(v => `
    <line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    <text x="${PAD_L - 6}" y="${y(v) + 3.5}" text-anchor="end" class="axis">${Math.round(v)}</text>`).join('');
  const idx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const labels = idx.map(i => `
    <text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="axis">${shortDate(data[i].day)}</text>`).join('');
  return { x, y, grid, labels };
}

function smoothPath(pts) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const clamp = v => Math.max(lo, Math.min(hi, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function lineChart(data) {
  const maxY = niceMax(Math.max(...data.map(d => d.started)));
  const { x, y, grid, labels } = axis(data, maxY);
  const pts = key => data.map((d, i) => [x(i), y(d[key])]);
  const learned = smoothPath(pts('learned'));
  const last = pts('learned').at(-1);
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Динамика выученных слов">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${learned} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#areaGrad)"/>
      <path d="${smoothPath(pts('started'))}" class="line started"/>
      <path d="${learned}" class="line learned"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4" class="end-dot"/>
      ${labels}
    </svg>`;
}

function barChart(data) {
  const maxY = niceMax(Math.max(...data.map(d => d.known + d.wrong)));
  const { x, y, grid, labels } = axis(data, maxY);
  const step = (W - PAD_L - PAD_R) / Math.max(1, data.length - 1);
  const bw = Math.max(2, Math.min(14, step * 0.6));
  const bars = data.map((d, i) => {
    if (!d.known && !d.wrong) return '';
    const cx = x(i) - bw / 2;
    const yKnown = y(d.known);
    const yTop = y(d.known + d.wrong);
    return `
      <rect x="${cx}" y="${yTop}" width="${bw}" height="${y(0) - yTop}" rx="${Math.min(3, bw / 2)}" class="bar-no"/>
      <rect x="${cx}" y="${yKnown}" width="${bw}" height="${y(0) - yKnown}" rx="${Math.min(3, bw / 2)}" class="bar-yes"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ответы по дням">${grid}${bars}${labels}</svg>`;
}

// ---------- stats ----------

function renderStats() {
  const all = topicStats(cards);
  const p = progress();
  const learning = cards.filter(c => p[c.id] && p[c.id].ivl < LEARNED_IVL).length;
  const s = streak(state.days, today());
  const data = dayHistory(state.days, dir(), today(), range);
  const growth = data.at(-1).learned - data[0].learned;
  const answers = data.reduce((a, d) => a + d.known + d.wrong, 0);
  const correct = answers ? Math.round((data.reduce((a, d) => a + d.known, 0) / answers) * 100) : 0;

  app.innerHTML = `
    <header class="page-head"><h1>Статистика</h1><span class="chip">${DIRS[dir()]}</span></header>

    <section class="tiles">
      <div class="tile card-surface"><span class="tile-icon flame">${ICONS.flame}</span><b class="num">${s}</b><span>${plural(s, 'день', 'дня', 'дней')} подряд</span></div>
      <div class="tile card-surface"><b class="num">${todayStats().reviewed}</b><span>ответов сегодня</span></div>
      <div class="tile card-surface"><b class="num">${all.learned}</b><span>выучено слов</span></div>
      <div class="tile card-surface"><b class="num">${learning}</b><span>в процессе</span></div>
    </section>

    <div class="segmented" role="tablist">
      ${RANGES.map(r => `<button type="button" class="${range === r ? 'on' : ''}" data-range="${r}">${r} дней</button>`).join('')}
    </div>

    <section class="card-surface pad">
      <div class="row"><h2 class="h3">Динамика слов</h2><span class="delta ${growth > 0 ? 'up' : ''}">${growth > 0 ? '+' : ''}${growth}</span></div>
      ${lineChart(data)}
      <div class="legend">
        <span><i class="dot learned"></i>Выучено</span>
        <span><i class="dot dashed"></i>Начато</span>
      </div>
    </section>

    <section class="card-surface pad">
      <div class="row"><h2 class="h3">Ответы по дням</h2><span class="delta">${correct}% верно</span></div>
      ${barChart(data)}
      <div class="legend">
        <span><i class="dot yes"></i>Знаю</span>
        <span><i class="dot no"></i>Не знаю</span>
      </div>
    </section>

    <p class="footnote">«Выучено» — слово, которое ты помнишь с интервалом от ${LEARNED_IVL} дней. «Начато» — все слова, которые ты хоть раз видел.</p>`;
}

// ---------- mistakes ----------

function renderMistakes() {
  const hard = hardCards();
  const p = progress();
  const total = hard.reduce((a, c) => a + p[c.id].lapses, 0);
  app.innerHTML = `
    <header class="page-head"><h1>Ошибки</h1>${hard.length ? `<span class="chip">${hard.length} ${plural(hard.length, 'слово', 'слова', 'слов')}</span>` : ''}</header>
    ${hard.length ? `
      <section class="hero card-surface">
        <div class="hero-top">
          <div class="hero-mascot">${buddy('happy', 72, 'idle')}</div>
          <p class="bubble">Давай проработаем слова, в которых ты ошибался. Всего ошибок: ${total}.</p>
        </div>
        <label class="btn primary block" role="button" data-study="mistakes">${HX()}${ICONS.play}Тренировать ошибки</label>
      </section>
      <p class="footnote">Каждый ответ «Знаю» с первого раза уменьшает счётчик ошибок слова. Когда он дойдёт до нуля, слово уйдёт из списка.</p>
      <ul class="list card-surface">
        ${hard.map(c => `
          <li class="list-row static">
            ${speakBtn(c.word, 'small')}
            <span class="list-main">
              <span class="list-title">${esc(c.word)} <span class="muted">${esc(c.ipa)}</span></span>
              <span class="list-sub">${esc(c.translation)}</span>
            </span>
            <span class="pill no">${p[c.id].lapses}×</span>
          </li>`).join('')}
      </ul>` : `
      <section class="done">
        <div class="done-mascot">${buddy('happy', 130, 'idle')}</div>
        <h2 class="h3">Ошибок нет</h2>
        <p class="muted">Когда ответишь «Не знаю», слово попадёт сюда — и его можно будет потренировать отдельно.</p>
      </section>`}`;
}

// ---------- dictionary ----------

const DICT_FILTERS = { all: 'Все', fresh: 'Новые', learning: 'Изучаю', learned: 'Выучено' };
let dictQuery = '';
let dictFilter = 'all';

function wordStatus(c) {
  const s = progress()[c.id];
  if (!s) return 'fresh';
  return s.ivl >= LEARNED_IVL ? 'learned' : 'learning';
}

function renderDict() {
  app.innerHTML = `
    <header class="page-head"><h1>Словарь</h1><span class="chip">${cards.length} слов</span></header>
    <label class="search card-surface">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="dict-q" type="search" placeholder="Найти слово или перевод" value="${esc(dictQuery)}" autocomplete="off" autocorrect="off" spellcheck="false">
    </label>
    <div class="segmented">
      ${Object.entries(DICT_FILTERS).map(([k, v]) => `<button type="button" class="${dictFilter === k ? 'on' : ''}" data-dict-filter="${k}">${v}</button>`).join('')}
    </div>
    <div id="dict-list" class="dict-list"></div>`;
  renderDictList();
}

function renderDictList() {
  const box = document.getElementById('dict-list');
  if (!box) return;
  const q = dictQuery.trim().toLowerCase();
  const groups = topics
    .map(t => ({
      name: t.name,
      items: t.cards.filter(c =>
        (dictFilter === 'all' || wordStatus(c) === dictFilter)
        && (!q || c.word.toLowerCase().includes(q) || c.translation.toLowerCase().includes(q))),
    }))
    .filter(g => g.items.length);
  if (!groups.length) {
    box.innerHTML = `<div class="empty card-surface">${buddy('sad', 56)}<p class="muted">Ничего не нашлось. Попробуй другое слово.</p></div>`;
    return;
  }
  box.innerHTML = groups.map(g => `
    <h2 class="group-title">${esc(g.name)}</h2>
    <ul class="list card-surface">
      ${g.items.map(c => `
        <li class="list-row static">
          ${speakBtn(c.word, 'small')}
          <span class="list-main">
            <span class="list-title">${esc(c.word)} <span class="muted">${esc(c.ipa)}</span></span>
            <span class="list-sub">${esc(c.translation)}</span>
          </span>
          <i class="dot ${wordStatus(c)}" title="${DICT_FILTERS[wordStatus(c)]}"></i>
        </li>`).join('')}
    </ul>`).join('');
}

document.addEventListener('input', e => {
  if (e.target.id !== 'dict-q') return;
  dictQuery = e.target.value;
  renderDictList();
});

// ---------- settings ----------

function renderSettings() {
  app.innerHTML = `
    <header class="page-head"><h1>Профиль</h1></header>

    ${accountSection()}

    <h2 class="group-title">Оформление</h2>
    <section class="card-surface group">
      <div class="group-row stack">
        <span>Тема</span>
        <div class="segmented">
          ${Object.entries(THEMES).map(([k, v]) => `<button type="button" class="${state.settings.theme === k ? 'on' : ''}" data-set-theme="${k}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="group-row">
        <span>Вибрация</span>
        <label class="switch"><input type="checkbox" data-haptics ${state.settings.haptics ? 'checked' : ''} aria-label="Вибрация"><span></span></label>
      </div>
    </section>
    <p class="group-note">Вибрация на iPhone работает начиная с iOS 18.</p>


    <h2 class="group-title">Обучение</h2>
    <section class="card-surface group">
      <div class="group-row stack">
        <span>Направление карточек</span>
        <div class="segmented">
          ${Object.entries(DIRS).map(([k, v]) => `<button type="button" class="${dir() === k ? 'on' : ''}" data-dir="${k}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="group-row stack">
        <span>Новых слов в день</span>
        <div class="segmented">
          ${NEW_OPTIONS.map(n => `<button type="button" class="${state.settings.newPerDay === n ? 'on' : ''}" data-new="${n}">${n}</button>`).join('')}
        </div>
      </div>
    </section>
    <p class="group-note">Прогресс по каждому направлению считается отдельно.</p>

    <h2 class="group-title">Озвучка</h2>
    <section class="card-surface group">
      <div class="group-row"><span>Проверить звук</span>${speakBtn('Hello! How are you?', 'small')}</div>
    </section>
    <p class="group-note">Если звука нет — выключи беззвучный режим на iPhone и прибавь громкость.</p>

    <h2 class="group-title">Словарь</h2>
    <section class="card-surface group">
      <div class="group-row"><span>Слов</span><span class="muted num">${cards.length}</span></div>
      <div class="group-row"><span>Тем</span><span class="muted num">${topics.length}</span></div>
      <button type="button" class="group-row link" data-action="reload">Обновить слова</button>
    </section>

    <section class="card-surface group">
      <button type="button" class="group-row link danger" data-action="reset">Сбросить прогресс ${DIRS[dir()]}</button>
    </section>

    <div class="about">${mascot('happy', 44)}<span class="muted small">English Cards · маскот Эй</span></div>`;
}

// ---------- navigation ----------

const SCREENS = { home: renderHome, study: renderStudy, stats: renderStats, settings: renderSettings, mistakes: renderMistakes, dict: renderDict };

function show(name) {
  const prev = screen;
  screen = SCREENS[name] ? name : 'home';
  if (screen !== 'study') session = null;
  if (prev === 'study' && screen !== 'study') {
    clearTimeout(toastTimer);
    document.getElementById('toast')?.classList.remove('show');
  }
  saveSession();
  try { sessionStorage.setItem(SCREEN_KEY, screen); } catch {}

  const render = () => {
    tabs.hidden = screen === 'study';
    tabs.querySelectorAll('[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === screen));
    updateTabBadge();
    document.body.dataset.screen = screen;
    SCREENS[screen]();
    window.scrollTo(0, 0);
  };
  if (prev && prev !== screen && document.startViewTransition && !REDUCED_MOTION.matches) document.startViewTransition(render);
  else render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-speak],[data-grade],[data-study],[data-go],[data-dir],[data-new],[data-range],[data-set-theme],[data-haptics],[data-dict-filter],[data-action],[data-reveal]');
  if (!el) return;
  // A tap on the invisible switch must keep its default action — that toggle is what vibrates the iPhone.
  const viaSwitch = e.target.classList?.contains('hx');
  if (!viaSwitch) e.preventDefault();
  if (viaSwitch) setTimeout(() => act(el), 0);
  else act(el);
});

function act(el) {
  const d = el.dataset;

  if (d.speak !== undefined) { speak(d.speak, el); return; }
  if (d.grade !== undefined) { if (session?.queue.length) grade(d.grade === '1'); return; }
  if (d.study !== undefined) { haptic(); startSession(d.study); return; }
  if (d.go) { show(d.go); return; }
  if (d.dir) { state.settings.dir = d.dir; saveState(); renderSettings(); return; }
  if (d.new) { state.settings.newPerDay = Number(d.new); saveState(); renderSettings(); return; }
  if (d.range) { range = Number(d.range); renderStats(); return; }
  if (d.dictFilter) { dictFilter = d.dictFilter; renderDict(); return; }
  if (d.setTheme) { state.settings.theme = d.setTheme; saveState(); applyTheme(); renderSettings(); haptic(); return; }
  if (d.haptics !== undefined) { state.settings.haptics = !state.settings.haptics; saveState(); refreshTabHaptics(); renderSettings(); haptic(); return; }
  if (d.action === 'signin') {
    signInWithGoogle().catch(() => toast('Не получилось открыть вход. Попробуй ещё раз', 'sad'));
    return;
  }
  if (d.action === 'signout') {
    if (confirm('Выйти из аккаунта? Прогресс останется на этом телефоне и в облаке.')) {
      signOut().then(() => toast('Ты вышел из аккаунта'));
    }
    return;
  }
  if (d.action === 'reload') { location.reload(); return; }
  if (d.action === 'reset') {
    if (confirm(`Сбросить весь прогресс по направлению ${DIRS[dir()]}?`)) {
      state.progress[dir()] = {};
      for (const day of Object.values(state.days)) if (day.snap) delete day.snap[dir()];
      saveState();
      renderSettings();
      toast('Прогресс сброшен');
    }
    return;
  }
  if (d.reveal !== undefined && session && !session.revealed) {
    haptic();
    session.revealed = true;
    saveSession();
    renderStudy();
  }
}

async function init() {
  try {
    const res = await fetch('words.md', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    cards = parseWords(await res.text());
  } catch {
    app.innerHTML = `<div class="empty card-surface">${buddy('sad', 72)}<p>Не удалось загрузить словарь. Проверь интернет и обнови страницу.</p></div>`;
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
  screen = '';
  show(session ? 'study' : last === 'study' ? 'home' : last);
  initCloud();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js');
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) syncNow(); });

applyTheme();
refreshTabHaptics();
showSplash();
init();
