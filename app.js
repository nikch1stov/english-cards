import { parseWords, myCards, MY_TOPIC, dayKey, addDays, schedule, buildQueue, streak, dayHistory, mergeState, stripDir, LEARNED_IVL, ENERGY, energyNow, energyAdd } from './core.js?v=10';
import { mascot, streakMascot, LETTERS } from './mascot.js?v=8';
import { cloudEnabled, getClient, signInWithGoogle, signOut, pullState, pushState, userProfile } from './cloud.js?v=10';

const STORE_KEY = 'english-cards:v1';
const SESSION_KEY = 'english-cards:session';
const SCREEN_KEY = 'english-cards:screen';
const GREET_KEY = 'english-cards:greet';
const GREETED_KEY = 'english-cards:greeted';
const LETTER_KEY = 'english-cards:letter';
const OWNER_KEY = 'english-cards:owner';
const THEMES = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };
const THEME_COLORS = { light: '#FFFCF6', dark: '#13110F' };
const SYNC_LABELS = { idle: '', saving: 'Сохраняю…', saved: 'Сохранено в облаке', error: 'Нет связи — сохраню позже' };
const DIRS = { 'en-ru': 'EN → RU', 'ru-en': 'RU → EN' };
const NEW_OPTIONS = [5, 10, 20, 50];
const RANGES = [7, 30, 90];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

let baseCards = [];
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
  const fallback = { settings: { dir: 'en-ru', newPerDay: 10, theme: 'light', haptics: true }, progress: { 'en-ru': {}, 'ru-en': {} }, days: {}, mine: {}, resets: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return fallback;
    return {
      settings: settleTheme({ ...fallback.settings, ...saved.settings }),
      progress: { ...fallback.progress, ...saved.progress },
      days: saved.days || {},
      mine: saved.mine || {},
      resets: saved.resets || {},
      energy: saved.energy,
      plus: saved.plus,
    };
  } catch {
    return fallback;
  }
}

// Light is the default theme. «Авто» used to be the default, so a stored «Авто» without themeSet was never chosen.
function settleTheme(s) {
  if (!s.themeSet) {
    if (s.theme !== 'dark') s.theme = 'light';
    s.themeSet = true;
  }
  return s;
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

// Own words come first, so the lesson of the day picks them up before the built-in list.
function rebuildCards() {
  const mine = myCards(state.mine);
  cards = [...mine, ...baseCards];
  byId = new Map(cards.map(c => [c.id, c]));
  const byTopic = new Map();
  for (const c of cards) {
    if (!byTopic.has(c.topic)) byTopic.set(c.topic, []);
    byTopic.get(c.topic).push(c);
  }
  topics = [...byTopic].map(([name, list]) => ({ name, cards: list, mine: name === MY_TOPIC }));
}

// The topics picked in onboarding; own words are always part of the plan.
function inPlan(t) {
  const picked = state.settings.topics;
  if (t.mine || !Array.isArray(picked)) return true;
  // If the word list was renamed and nothing picked still exists, fall back to everything.
  if (!topics.some(x => !x.mine && picked.includes(x.name))) return true;
  return picked.includes(t.name);
}
const planCards = () => topics.filter(inPlan).flatMap(t => t.cards);
const hasProgress = () => Object.values(state.progress).some(p => Object.keys(p).length) || Object.keys(state.mine || {}).length > 0;

// ---------- helpers ----------

const dir = () => state.settings.dir;
const progress = () => state.progress[dir()];
const today = () => dayKey();
const todayStats = () => state.days[today()] || { reviewed: 0, new: {} };
const newLeft = () => state.settings.newPerDay - (todayStats().new?.[dir()] || 0);
// The daily number of new words is a goal, not a cap: once it is met, each lesson brings another batch.
const newAllowance = () => (newLeft() > 0 ? newLeft() : state.settings.newPerDay);
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
  // Drawn once in index.html: the dictionary repeats these hundreds of times.
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-speaker"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9L11 3zM18.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-chevron"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.5 3-1.5 4.5-3 6.5-1.3 1.7-2 3.3-2 5.2A5 5 0 0 0 12 19.5a5 5 0 0 0 5-5.3c0-2.6-1.4-4.2-2.4-5.4-.2 1.3-.8 2.2-1.7 2.7.4-3.2-.2-6.3-.9-9z" fill="currentColor"/><path class="flame-core" d="M12.2 10.5c.2 1.6-.8 2.4-1.6 3.4-.6.8-.9 1.5-.9 2.3a2.3 2.3 0 0 0 2.3 2.3 2.3 2.3 0 0 0 2.3-2.4c0-1.2-.6-1.9-1.1-2.5-.1.6-.4 1-.8 1.2.2-1.5-.1-2.9-.2-4.3z"/></svg>',
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
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" style="--from:${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
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

// ---------- alert ----------

// An iOS-style alert. Resolves true when the person picks the action, false on «Отмена».
function ask({ title, message = '', action, destructive = false }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    wrap.innerHTML = `
      <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-text">
        <h2 id="alert-title">${esc(title)}</h2>
        ${message ? `<p id="alert-text">${esc(message)}</p>` : ''}
        <div class="alert-actions">
          <label class="alert-btn" role="button" data-alert="0">${HX()}Отмена</label>
          <label class="alert-btn ${destructive ? 'destructive' : 'default'}" role="button" data-alert="1">${HX()}${esc(action)}</label>
        </div>
      </div>`;
    const done = yes => {
      if (wrap.classList.contains('out')) return;
      wrap.classList.add('out');
      removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 200);
      resolve(yes);
    };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-alert]');
      if (!b) return;
      e.stopPropagation();
      if (!e.target.classList.contains('hx')) e.preventDefault();
      done(b.dataset.alert === '1');
    });
    addEventListener('keydown', onKey);
    document.body.append(wrap);
  });
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

// Paper confetti with real physics: a burst up and out from the mascot, then gravity, air drag
// and a flutter as each piece turns over, until everything has fallen off the bottom of the screen.
function confetti(from) {
  if (REDUCED_MOTION.matches) return;
  const colors = ['#FFD16B', '#FF6D47', '#FFD16B', '#FF6D47', '#C8401D', '#FFF2D6'];
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = from?.getBoundingClientRect();
  const ox = r ? r.left + r.width / 2 : W / 2;
  const oy = r ? r.top + r.height * 0.4 : H * 0.34;
  const pieces = Array.from({ length: 90 }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 480 + Math.random() * 520;
    return {
      x: ox + (Math.random() - 0.5) * 40, y: oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 7 + Math.random() * 5, h: 10 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 14,
      flip: Math.random() * Math.PI * 2, flipSpeed: 6 + Math.random() * 8,
      sway: Math.random() * Math.PI * 2, delay: Math.random() * 0.12,
      color: colors[i % colors.length],
    };
  });
  const GRAVITY = 1500, DRAG = 2.2, FALL = 190;
  let last = performance.now(), age = 0;
  const frame = now => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    age += dt;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of pieces) {
      if (age < p.delay || p.y > H + 40) continue;
      alive++;
      p.vy += GRAVITY * dt;
      p.vx -= p.vx * DRAG * dt;
      p.vy -= p.vy * DRAG * dt * 0.6;
      if (p.vy > FALL) p.vy = FALL + (p.vy - FALL) * 0.9; // paper reaches terminal speed and flutters down
      p.sway += dt * 3;
      p.x += (p.vx + Math.sin(p.sway) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.flip += p.flipSpeed * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive || age < 0.2) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => canvas.remove(), 9000);
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
  function close() {
    if (el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }
  // The speaker gets its own listener: iOS only turns a tap into a click on elements it considers clickable.
  const speaker = el.querySelector('[data-speak]');
  speaker.addEventListener('click', e => {
    e.stopPropagation();
    speak(en, speaker);
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

const needsLogin = () => cloudEnabled && !user;

// Progress on this device belongs to one account. Pre-login progress (no owner yet) is adopted by the
// first account that signs in; a different account starts from a clean slate instead of inheriting it.
function claimLocalState(uid) {
  let owner = null;
  try { owner = localStorage.getItem(OWNER_KEY); } catch {}
  if (owner && owner !== uid) resetLocalProgress();
  try { localStorage.setItem(OWNER_KEY, uid); } catch {}
}

function resetLocalProgress() {
  // Energy stays with the device: switching accounts must not refill the battery.
  state = { settings: state.settings, progress: { 'en-ru': {}, 'ru-en': {} }, days: {}, mine: {}, resets: {}, energy: state.energy };
  saveLocal();
  rebuildCards();
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

let syncing = null;
function syncNow() {
  if (!user) return Promise.resolve();
  syncing ||= runSync().finally(() => { syncing = null; });
  return syncing;
}

async function runSync() {
  setSync('saving');
  try {
    const remote = await pullState(user.id);
    const before = JSON.stringify(state);
    state = mergeState(state, remote);
    settleTheme(state.settings);
    const changed = JSON.stringify(state) !== before;
    pulled = true;
    if (changed) {
      saveLocal();
      rebuildCards();
      applyTheme();
    }
    await pushState(user.id, state);
    setSync('saved');
    if (screen === 'wait') enterApp();
    // Redraw only when another device changed something, so returning to the app doesn't flash the screen.
    else if (changed && screen && !['study', 'word', 'onboarding'].includes(screen) && !needsLogin()) SCREENS[screen]();
  } catch {
    setSync('error');
    if (screen === 'wait') show('onboarding');
  }
}

// When the Supabase library can't load (offline, first launch cached), trust the session it saved earlier.
function savedSessionUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return JSON.parse(localStorage.getItem(k))?.user || null;
    }
  } catch {}
  return null;
}

function onSignedIn(event) {
  claimLocalState(user.id);
  pulled = false;
  setTimeout(syncNow, 0);
  if (event === 'SIGNED_IN') toast(`Привет, ${userProfile(user).name.split(' ')[0]}!`, 'happy');
}

async function initCloud(clientReady) {
  if (!cloudEnabled) return;
  let sb;
  try {
    sb = await clientReady;
  } catch {
    user = savedSessionUser();
    setSync('error');
    return;
  }
  // Resolves after a Google redirect's ?code= has been exchanged for a session.
  const { data, error } = await sb.auth.getSession();
  user = data?.session?.user || null;
  if (error || /[?&](code|error)=/.test(location.search)) {
    if (!user && /[?&]error/.test(location.search)) setTimeout(() => toast('Вход не удался. Попробуй ещё раз', 'sad'), 300);
    history.replaceState(null, '', location.pathname);
  }
  if (user) onSignedIn('INITIAL');
  sb.auth.onAuthStateChange((event, sess) => {
    const next = sess?.user || null;
    if (next?.id === user?.id) { user = next; return; }
    const wasGated = needsLogin();
    user = next;
    // Supabase warns against awaiting its own calls inside this callback.
    if (user) {
      onSignedIn(event);
      if (wasGated) { try { sessionStorage.removeItem(SCREEN_KEY); } catch {} enterApp(); }
      else if (screen === 'settings' || screen === 'home') SCREENS[screen]();
    } else {
      setSync('idle');
      renderLogin();
    }
  });
}

async function logOut() {
  if (!await ask({ title: 'Выйти из аккаунта?', message: 'Прогресс сохранится в облаке, а с этого телефона будет удалён.', action: 'Выйти', destructive: true })) return;
  clearTimeout(pushTimer);
  try {
    if (!pulled) state = mergeState(state, await pullState(user.id));
    await pushState(user.id, state);
  } catch {
    toast('Нет интернета — не могу сохранить прогресс перед выходом', 'sad');
    return;
  }
  resetLocalProgress();
  try { localStorage.removeItem(OWNER_KEY); } catch {}
  await signOut();
}

function renderLogin() {
  session = null;
  screen = '';
  tabs.hidden = true;
  document.body.dataset.screen = 'login';
  app.innerHTML = `
    <section class="login">
      <div class="login-mascot">${buddy('wave', 150, 'idle')}</div>
      <h1>Добро пожаловать!</h1>
      <p class="muted">Войди через Google, чтобы начать учить английские слова. Прогресс будет храниться в облаке — он не потеряется, даже если сменишь телефон.</p>
      <label class="btn google block" role="button" data-action="signin">${HX()}${GOOGLE_ICON}Войти через Google</label>
      <p class="login-note">Мы получаем только имя, почту и фото профиля.</p>
    </section>`;
  window.scrollTo(0, 0);
}

function enterApp() {
  if (!state.settings.onboarded) {
    if (hasProgress()) { state.settings.onboarded = true; saveState(); }
    // Wait for the cloud copy (a returning user may already have a plan), unless it can't be reached.
    else { screen = ''; show(pulled || !user || syncStatus === 'error' ? 'onboarding' : 'wait'); return; }
  }
  let last = 'home';
  try { last = sessionStorage.getItem(SCREEN_KEY) || 'home'; } catch {}
  session = restoreSession();
  screen = '';
  if (['study', 'wait', 'onboarding'].includes(last)) last = 'home';
  show(session ? 'study' : last === 'word' ? 'dict' : last);
}

const GOOGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2a11 11 0 0 0 0 9.8L5.7 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.7 3.4-4.6 6.3-4.6z"/></svg>';

function accountSection() {
  if (!user) return '';
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
      <button type="button" class="group-row link danger center" data-action="signout">Выйти</button>
    </section>`;
}

// ---------- home ----------

function renderHome() {
  const plan = planCards();
  const all = topicStats(plan);
  const planNew = Math.min(Math.max(0, newLeft()), all.fresh);
  const s = streak(state.days, today());
  const limit = state.settings.newPerDay;
  const newToday = todayStats().new?.[dir()] || 0;
  const doneToday = todayStats().known?.[dir()] || 0;
  const remaining = all.due + planNew;
  const goal = doneToday + remaining;
  const tomorrow = addDays(today(), 1);
  const p = progress();
  const dueTomorrow = plan.filter(c => p[c.id] && p[c.id].due === tomorrow).length;
  const learning = all.total - all.fresh - all.learned;
  const extra = remaining ? 0 : Math.min(limit, all.fresh);

  let bubble;
  if (extra) bubble = 'Цель на сегодня выполнена! Хочешь выучить ещё?';
  else if (!remaining && doneToday) bubble = 'Всё на сегодня! Слова закреплены — увидимся завтра.';
  else if (!remaining) bubble = 'На сегодня карточек нет. Можно отдохнуть!';
  else if (doneToday) bubble = `Уже ${doneToday}! Осталось ${remaining} — добьём?`;
  else bubble = `Сегодня ${remaining} ${cardsWord(remaining)}. Начнём?`;

  app.innerHTML = `
    <header class="hero-head">
      <div class="head-row">
        <p class="eyebrow">${greeting()}${user ? `, ${esc(userProfile(user).name.split(' ')[0])}` : ''}</p>
        <div class="head-actions">
          <span class="streak ${s ? 'on' : ''}" aria-label="Серия: ${s} ${plural(s, 'день', 'дня', 'дней')} подряд">${ICONS.flame}${s}</span>
          ${energyChip()}
          ${ADD_BTN()}
        </div>
      </div>
      <h1>Учим английский</h1>
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
        ? `<label class="btn primary block" role="button" data-study="*">${HX()}${ICONS.play}Начать урок${lessonCost()}</label>`
        : extra
          ? `<label class="btn primary block" role="button" data-study="*">${HX()}${ICONS.play}Ещё ${extra} ${plural(extra, 'слово', 'слова', 'слов')}${lessonCost()}</label>`
          : '<button type="button" class="btn primary block" disabled>На сегодня всё</button>'}
    </section>

    <section class="card-surface pad">
      <div class="row"><h2 class="h3">Мой словарь</h2><span class="muted num">${all.learned} / ${all.total}</span></div>
      <div class="meter">
        <span class="learned" style="width:${(all.learned / (all.total || 1)) * 100}%"></span><span class="learning" style="--w:${(learning / (all.total || 1)) * 100}%"></span>
      </div>
      <div class="legend">
        <span><i class="dot learned"></i>Выучено ${all.learned}</span>
        <span><i class="dot learning"></i>Изучаю ${learning}</span>
        <span><i class="dot fresh"></i>Впереди ${all.fresh}</span>
      </div>
    </section>

    <div class="section-head"><h2 class="section-title">Мои темы</h2><button type="button" class="link-btn" data-ob="restart">Изменить</button></div>
    <ul class="list card-surface">
      ${topics.filter(inPlan).map(t => {
        const st = topicStats(t.cards);
        return `
          <li>
            <label class="list-row" role="button" data-study="${esc(t.name)}">${HX()}
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
      ${topics.some(t => t.mine) ? '' : `
        <li>
          <label class="list-row" role="button" data-edit="">${HX()}
            <span class="my-cta-icon">${ICONS.plus}</span>
            <span class="list-main">
              <span class="list-title">Мои слова</span>
              <span class="list-sub">Добавь свои слова — и учи их вместе с остальными</span>
            </span>
            <span class="chev">${ICONS.chevron}</span>
          </label>
        </li>`}
    </ul>`;
}

// ---------- study ----------

function startSession(key) {
  const topic = key === '*' ? null : topics.find(t => t.name === key);
  const list = topic ? topic.cards : planCards();
  // The user chose to drill words they added themselves, so all of them come at once.
  const queue = buildQueue(list, progress(), today(), topic?.mine ? Infinity : newAllowance());
  if (queue.length && !plusOn()) {
    if (energyState().v < ENERGY.lesson) { openEnergy(key); return; }
    state.energy = energyAdd(state.energy, -ENERGY.lesson, Date.now());
    saveState();
  }
  session = {
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
  // After a lesson the streak itself celebrates: its digits come alive next to the fire.
  app.innerHTML = `
    <section class="done">
      <div class="done-hero">
        <div class="done-mascot">${had && s ? streakMascot(s) : buddy(had ? 'celebrate' : 'sleep', 150, had ? 'jump' : 'idle')}</div>
        <h1>${had ? 'Урок пройден!' : 'Здесь пока пусто'}</h1>
        <p class="muted">${had
          ? `${s ? 'Так держать!' : `${LETTER === 'A' ? 'Эй' : `Буква ${LETTER}`} гордится тобой.`} Слова вернутся, когда их пора будет повторить.`
          : 'Здесь все слова уже в работе, а повторять их пока рано. Загляни позже или выбери другую тему.'}</p>
        ${had && s ? `<p class="done-streak">${ICONS.flame}${s} ${plural(s, 'день', 'дня', 'дней')} подряд</p>` : ''}
      </div>
      <div class="done-foot">
        ${had ? `
          <div class="done-stats">
            <div><b>${session.total}</b><span>${cardsWord(session.total)}</span></div>
            <div><b>${acc}%</b><span>с первого раза</span></div>
            <div><b>${session.fresh}</b><span>новых слов</span></div>
          </div>` : ''}
        <button type="button" class="btn primary block" data-go="home">Продолжить</button>
      </div>
    </section>`;
  if (had && !session.celebrated) {
    session.celebrated = true;
    saveSession();
    confetti(app.querySelector('.done-mascot'));
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
  const fromPct = session.pct ?? pct;
  session.pct = pct;

  app.innerHTML = `
    <header class="study-top">
      <button type="button" class="icon-btn" data-go="home" aria-label="Закрыть урок">${ICONS.close}</button>
      <div class="progress" role="progressbar" aria-valuenow="${session.done}" aria-valuemax="${session.total}"><span style="width:${fromPct}%"></span></div>
      <span class="muted num small">${session.done}/${session.total}</span>
    </header>

    <section class="flash ${session.revealed ? 'revealed' : ''} ${session.enter ? 'enter' : ''}" data-reveal>
      ${session.revealed ? '' : HX()}
      <div class="flash-meta">
        ${isNew ? '<span class="chip accent">Новое слово</span>' : '<span class="chip">Повторение</span>'}
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
  if (fromPct !== pct) requestAnimationFrame(() => requestAnimationFrame(() => { const bar = app.querySelector('.progress > span'); if (bar) bar.style.width = `${pct}%`; }));
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
  // `at` lets a later progress reset on another device tell this answer is older than the reset.
  p[card.id] = { ...schedule(p[card.id], known, t), at: Date.now() };

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

// The chosen button's colour swells out from behind it while the card leaves, then the next card comes in.
let grading = false;
function pressGrade(btn, known) {
  if (grading || !session?.queue.length) return;
  const go = () => { grading = false; if (screen === 'study' && session?.queue.length) grade(known); };
  if (REDUCED_MOTION.matches) { go(); return; }
  grading = true;
  bloom(btn);
  btn.classList.add('hit');
  btn.parentElement.classList.add('chosen');
  app.querySelector('.flash')?.classList.add(known ? 'leave-yes' : 'leave-no');
  setTimeout(go, 240);
}

// Lives outside #app, behind it, so it keeps growing after the lesson screen is redrawn.
function bloom(btn) {
  const r = btn.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'bloom';
  el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:${getComputedStyle(btn).backgroundColor}`;
  document.body.append(el);
  setTimeout(() => el.remove(), 700);
}

// Half a turn away, swap in the back side, then the other half turn in.
function flipCard() {
  const card = app.querySelector('.flash');
  if (!card || REDUCED_MOTION.matches) { renderStudy(); return; }
  card.classList.remove('enter');
  card.classList.add('flip-out');
  setTimeout(() => {
    if (screen !== 'study' || !session?.revealed) return;
    renderStudy();
    app.querySelector('.flash')?.classList.add('flip-in');
  }, 190);
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
      ${grid}
      <path d="${learned} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z" class="area"/>
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
      ${RANGES.map(r => `<button type="button" class="${range === r ? 'on' : ''}" aria-pressed="${range === r}" data-range="${r}">${r} дней</button>`).join('')}
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

// ---------- onboarding ----------

const BASICS = ['Личные местоимения и глаголы-связки', 'Вопросительные слова', 'Артикли', 'Числительные (основные)', 'Вежливость и повседневные фразы', 'Действия (Глаголы базовые)'];
const GOALS = {
  travel: { icon: '✈️', label: 'Путешествия', topics: ['Места', 'Еда и напитки', 'Услуги и покупки', 'Время', 'Числа и количество', 'Природа и погода', 'Предлоги', 'Вежливость и повседневные фразы'] },
  work: { icon: '💼', label: 'Работа', topics: ['Профессии', 'Время', 'Числа и количество', 'Основные глаголы (продолжение)', 'Предлоги', 'Состояние и описание', 'Услуги и покупки'] },
  movies: { icon: '🎬', label: 'Фильмы и сериалы', topics: ['Эмоции и ощущения', 'Семья', 'Состояние и описание', 'Прилагательные (продолжение)', 'Основные глаголы (продолжение)', 'Животные'] },
  talk: { icon: '💬', label: 'Общение', topics: ['Семья', 'Эмоции и ощущения', 'Еда и напитки', 'Дом и мебель', 'Одежда', 'Прилагательные (продолжение)', 'Вежливость и повседневные фразы'] },
  study: { icon: '🎓', label: 'Учёба', topics: ['Школа и образование', 'Время', 'Числа и количество', 'Предлоги', 'Основные глаголы (продолжение)', 'Прилагательные (продолжение)'] },
  self: { icon: '✨', label: 'Для себя', topics: null },
};
const LEVELS = {
  zero: { title: 'Начинаю с нуля', sub: 'Знаю буквы и пару слов', perDay: 5 },
  basic: { title: 'Знаю самые простые слова', sub: 'Hello, cat, I am…', perDay: 10 },
  talk: { title: 'Могу немного поговорить', sub: 'Понимаю простые фразы', perDay: 20 },
};
const PACES = [
  { n: 5, title: 'Спокойно', sub: '5 новых слов · ~5 минут в день' },
  { n: 10, title: 'В своём темпе', sub: '10 новых слов · ~10 минут в день' },
  { n: 20, title: 'Интенсивно', sub: '20 новых слов · ~20 минут в день' },
];
const OB_STEPS = 4;
let ob = null;

function planLabel() {
  const base = topics.filter(t => !t.mine);
  const n = base.filter(inPlan).length;
  return n === base.length ? 'все темы' : `${n} ${plural(n, 'тема', 'темы', 'тем')} из ${base.length}`;
}

function startOnboarding(again) {
  const s = state.settings;
  const picked = Array.isArray(s.topics) ? s.topics : topics.filter(t => !t.mine).map(t => t.name);
  ob = {
    step: 0,
    again,
    goals: new Set(s.goals || []),
    level: s.level || '',
    topics: new Set(picked),
    topicsTouched: again,
    perDay: s.newPerDay,
  };
}

function suggestTopics() {
  const names = topics.filter(t => !t.mine).map(t => t.name);
  if (!ob.goals.size || ob.goals.has('self')) return new Set(names.filter(n => ob.level === 'zero' || !BASICS.includes(n) || ob.level === ''));
  const out = new Set();
  for (const g of ob.goals) for (const n of GOALS[g].topics) out.add(n);
  if (ob.level === 'zero' || ob.level === '') for (const n of BASICS) out.add(n);
  return new Set(names.filter(n => out.has(n)));
}

function renderWait() {
  app.innerHTML = `
    <section class="done">
      <div class="done-mascot">${buddy('wave', 130, 'idle')}</div>
      <p class="muted">Загружаю твой прогресс…</p>
    </section>`;
}

function renderOnboarding() {
  if (!ob) startOnboarding(false);
  const name = user ? userProfile(user).name.split(' ')[0] : '';
  const dots = Array.from({ length: OB_STEPS }, (_, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('');
  const back = ob.step > 0
    ? `<button type="button" class="bar-btn" data-ob="back">${ICONS.back}Назад</button>`
    : ob.again ? '<button type="button" class="bar-btn" data-ob="close">Отменить</button>' : '<span></span>';
  let head, body, next = 'Продолжить';

  if (ob.step === 0) {
    head = { mood: 'wave', title: ob.again ? 'Что для тебя важно?' : `Привет${name ? `, ${esc(name)}` : ''}! Я ${LETTER === 'A' ? 'Эй' : LETTERS[LETTER]?.name || LETTER}`, sub: ob.again ? 'Можно выбрать несколько целей' : 'Подберу слова под тебя. Для чего тебе английский? Можно выбрать несколько.' };
    body = `<div class="ob-grid">${Object.entries(GOALS).map(([k, g]) => `
      <label class="ob-tile ${ob.goals.has(k) ? 'on' : ''}" role="button" aria-pressed="${ob.goals.has(k)}" data-ob="goal:${k}">${HX()}
        <span class="ob-emoji">${g.icon}</span><span>${g.label}</span><span class="ob-check">${ICONS.check}</span>
      </label>`).join('')}</div>`;
  } else if (ob.step === 1) {
    head = { mood: 'happy', title: 'Какой у тебя уровень?', sub: 'От этого зависит, с чего начнём и сколько слов давать в день.' };
    body = `<div class="ob-list">${Object.entries(LEVELS).map(([k, l]) => `
      <label class="ob-option ${ob.level === k ? 'on' : ''}" role="button" aria-pressed="${ob.level === k}" data-ob="level:${k}">${HX()}
        <span class="list-main"><span class="list-title">${l.title}</span><span class="list-sub">${l.sub}</span></span>
        <span class="ob-radio"></span>
      </label>`).join('')}</div>`;
  } else if (ob.step === 2) {
    head = { mood: 'celebrate', title: 'Твои темы', sub: 'Я отметил подходящие под твои цели. Убери лишнее или добавь интересное.' };
    body = `
      <div class="ob-bar"><span id="ob-count" class="muted small">${obCountLabel()}</span><button type="button" class="link-btn" data-ob="all">${obAllPicked() ? 'Снять все' : 'Выбрать все'}</button></div>
      <div class="ob-chips">${topics.filter(t => !t.mine).map(t => `
        <label class="ob-chip ${ob.topics.has(t.name) ? 'on' : ''}" role="button" aria-pressed="${ob.topics.has(t.name)}" data-ob="topic:${esc(t.name)}">${HX()}${esc(t.name)}</label>`).join('')}</div>`;
  } else {
    head = { mood: 'happy', title: 'Сколько времени в день?', sub: 'Новые слова плюс повторение старых. Это можно поменять в любой момент.' };
    body = `<div class="ob-list">${PACES.map(p => `
      <label class="ob-option ${ob.perDay === p.n ? 'on' : ''}" role="button" aria-pressed="${ob.perDay === p.n}" data-ob="pace:${p.n}">${HX()}
        <span class="list-main"><span class="list-title">${p.title}</span><span class="list-sub">${p.sub}</span></span>
        <span class="ob-radio"></span>
      </label>`).join('')}</div>`;
    next = ob.again ? 'Сохранить' : 'Начать учиться';
  }

  app.innerHTML = `
    <section class="ob" data-step="${ob.step}">
      <header class="ob-top">${back}<div class="ob-dots" role="img" aria-label="Шаг ${ob.step + 1} из ${OB_STEPS}">${dots}</div><span></span></header>
      <div class="ob-head">
        <div class="ob-mascot">${buddy(head.mood, 92, 'idle')}</div>
        <h1>${head.title}</h1>
        <p class="muted">${head.sub}</p>
      </div>
      ${body}
      <footer class="actions ob-actions"><label class="btn primary block" role="button" data-ob="next">${HX()}${next}</label></footer>
    </section>`;
  window.scrollTo(0, 0);
}

const obWords = () => topics.filter(t => !t.mine && ob.topics.has(t.name)).reduce((a, t) => a + t.cards.length, 0);
const obAllPicked = () => topics.filter(t => !t.mine).every(t => ob.topics.has(t.name));
function obCountLabel() {
  const n = ob.topics.size, w = obWords();
  return `${n} ${plural(n, 'тема', 'темы', 'тем')} · ${w} ${plural(w, 'слово', 'слова', 'слов')}`;
}

const setOn = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); };

function obAction(a, el) {
  if (!ob) startOnboarding(false);
  const [kind, ...rest] = a.split(':');
  const val = rest.join(':');
  haptic();
  if (kind === 'restart') { startOnboarding(true); screen = ''; show('onboarding'); return; }
  if (kind === 'close') { ob = null; show('home'); return; }
  if (kind === 'back') { ob.step = Math.max(0, ob.step - 1); renderOnboarding(); return; }
  if (kind === 'goal') {
    ob.goals.has(val) ? ob.goals.delete(val) : ob.goals.add(val);
    setOn(el, ob.goals.has(val));
    ob.topicsTouched = false;
    return;
  }
  if (kind === 'level') {
    ob.level = val;
    ob.perDay = LEVELS[val].perDay;
    ob.topicsTouched = false;
    app.querySelectorAll('[data-ob^="level:"]').forEach(x => setOn(x, x === el));
    setTimeout(() => { if (ob?.step === 1) { ob.step = 2; ob.topics = suggestTopics(); renderOnboarding(); } }, 280);
    return;
  }
  if (kind === 'topic') {
    ob.topics.has(val) ? ob.topics.delete(val) : ob.topics.add(val);
    ob.topicsTouched = true;
    setOn(el, ob.topics.has(val));
    obRefreshCount();
    return;
  }
  if (kind === 'all') {
    const all = obAllPicked();
    ob.topics = new Set(all ? [] : topics.filter(t => !t.mine).map(t => t.name));
    ob.topicsTouched = true;
    renderOnboarding();
    return;
  }
  if (kind === 'pace') {
    ob.perDay = Number(val);
    app.querySelectorAll('[data-ob^="pace:"]').forEach(x => setOn(x, x === el));
    return;
  }
  if (kind === 'next') {
    if (ob.step === 0 && !ob.goals.size) { toast('Выбери хотя бы одну цель', 'sad'); return; }
    if (ob.step === 1 && !ob.level) { toast('Выбери свой уровень', 'sad'); return; }
    if (ob.step === 2 && !ob.topics.size) { toast('Выбери хотя бы одну тему', 'sad'); return; }
    if (ob.step === 1 && !ob.topicsTouched) ob.topics = suggestTopics();
    if (ob.step < OB_STEPS - 1) { ob.step++; renderOnboarding(); return; }
    finishOnboarding();
  }
}

function obRefreshCount() {
  const c = document.getElementById('ob-count');
  if (c) c.textContent = obCountLabel();
  const all = app.querySelector('[data-ob="all"]');
  if (all) all.textContent = obAllPicked() ? 'Снять все' : 'Выбрать все';
}

function finishOnboarding() {
  const again = ob.again;
  const s = state.settings;
  s.goals = [...ob.goals];
  s.level = ob.level;
  s.topics = obAllPicked() ? null : [...ob.topics];
  s.newPerDay = ob.perDay;
  s.onboarded = true;
  saveState();
  ob = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  show('home');
  if (again) toast('План обновлён', 'happy');
  else { confetti(); haptic('success'); toast('Готово! Твой план собран', 'happy'); }
}

// ---------- dictionary ----------

const DICT_FILTERS = { all: 'Все', fresh: 'Новые', learning: 'Изучаю', learned: 'Выучено' };
let dictQuery = '';
let dictFilter = 'all';
let dictToken = 0; // bumped on every redraw, so a late chunk of an older list is dropped
let dictFrame = 0;

function wordStatus(c) {
  const s = progress()[c.id];
  if (!s) return 'fresh';
  return s.ivl >= LEARNED_IVL ? 'learned' : 'learning';
}

// ---------- energy ----------

// A lesson costs energy; the battery refills by itself, from an ad, or never runs out with Plus.
// Ads and Plus are test stand-ins for now: both work instantly and for free.
let energyFor = null;
let energyBack = 'home';
const plusOn = () => !!state.plus?.on;
const energyState = () => energyNow(state.energy, Date.now());

function battery(v, cls = '') {
  const frac = Math.max(0, Math.min(1, v / ENERGY.max));
  const low = v < ENERGY.lesson;
  return `<svg class="battery ${low ? 'low' : ''} ${cls}" viewBox="0 0 26 14" aria-hidden="true">
    <rect x="1" y="1" width="21" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <rect x="23.2" y="4.5" width="2" height="5" rx="1" fill="currentColor"/>
    <rect class="battery-fill" x="3.2" y="3.2" width="${(16.6 * frac).toFixed(1)}" height="7.6" rx="1.8"/>
  </svg>`;
}

function bigBattery(v) {
  const frac = plusOn() ? 1 : Math.max(0, Math.min(1, v / ENERGY.max));
  const low = !plusOn() && v < ENERGY.lesson;
  return `<svg class="battery big ${low ? 'low' : ''}" viewBox="0 0 124 68" aria-hidden="true">
    <rect x="3" y="3" width="106" height="62" rx="18" fill="var(--surface)" stroke="currentColor" stroke-width="5"/>
    <rect x="113" y="23" width="8" height="22" rx="4" fill="currentColor"/>
    <rect class="battery-fill" x="12" y="12" width="${(88 * frac).toFixed(1)}" height="44" rx="10"/>
    <path class="battery-bolt" d="M61 15 44 38h12l-4 16 17-24H57z"/>
  </svg>`;
}

function waitLabel(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
}

function energyLine() {
  if (plusOn()) return 'С Плюсом энергия не заканчивается';
  const e = energyState();
  if (!e.next) return 'Батарейка заряжена';
  const full = e.next + (ENERGY.max - e.v - 1) * ENERGY.regen;
  return `+1 через ${waitLabel(e.next)} · полная через ${waitLabel(full)}`;
}

const lessonCost = () => (plusOn() ? '' : `<span class="cost">${battery(ENERGY.max)}${ENERGY.lesson}</span>`);

const energyChip = () => {
  const v = energyState().v;
  return `<label class="chip energy-chip ${plusOn() ? 'plus' : ''}" role="button" data-go="energy" aria-label="Энергия: ${plusOn() ? 'без ограничений' : v}">${HX()}${battery(plusOn() ? ENERGY.max : v)}<b data-energy-v>${plusOn() ? '∞' : v}</b></label>`;
};

function openEnergy(forLesson = null) {
  energyFor = forLesson;
  if (screen !== 'energy') energyBack = TAB_SCREENS.includes(screen) ? screen : 'home';
  show('energy');
}

function renderEnergy() {
  const v = energyState().v;
  const empty = !plusOn() && v < ENERGY.lesson;
  const canStart = energyFor !== null && (plusOn() || !empty);
  app.innerHTML = `
    <div class="sheet energy">
      <header class="sheet-bar">
        <span></span>
        <h1 class="sheet-title">Энергия</h1>
        <button type="button" class="bar-btn strong" data-go="${energyBack}">Готово</button>
      </header>

      <section class="energy-hero">
        ${empty && energyFor !== null ? buddy('sleep', 84, 'idle') : ''}
        ${bigBattery(v)}
        <p class="energy-count"><b data-energy-v>${plusOn() ? '∞' : v}</b>${plusOn() ? '' : ` / ${ENERGY.max}`}</p>
        <h2 class="energy-title">${plusOn() ? 'Плюс активен' : empty ? 'Энергия закончилась' : 'Энергия на уроки'}</h2>
        <p class="muted" data-energy-when>${energyLine()}</p>
      </section>

      ${canStart ? `<label class="btn primary block" role="button" data-study="${esc(energyFor)}">${HX()}${ICONS.play}Начать урок</label>` : ''}

      ${plusOn() ? '' : `
        <section class="card-surface group">
          <label class="group-row energy-row" role="button" data-action="ad">${HX()}
            <span class="energy-icon ad">${ICONS.play}</span>
            <span class="list-main"><span class="list-title">Посмотреть рекламу</span><span class="list-sub">+${ENERGY.ad} энергии сразу</span></span>
          </label>
          <label class="group-row energy-row" role="button" data-action="plus-on">${HX()}
            <span class="energy-icon plus">${battery(ENERGY.max)}</span>
            <span class="list-main"><span class="list-title">Подписка Плюс</span><span class="list-sub">Энергия без ограничений</span></span>
          </label>
        </section>`}
      <p class="group-note">Урок стоит ${ENERGY.lesson} энергии. Батарейка заряжается сама: +1 каждые 30 минут, полная — за сутки.</p>

      ${plusOn() ? '<section class="card-surface group"><button type="button" class="group-row link danger center" data-action="plus-off">Отключить Плюс</button></section>' : ''}
      <p class="group-note">Тестовый режим: реклама и подписка пока бесплатны.</p>
    </div>`;
}

// The countdown ticks without redrawing, so nothing under a finger changes.
setInterval(() => {
  if (!['home', 'energy'].includes(screen)) return;
  const v = plusOn() ? '∞' : String(energyState().v);
  const shown = app.querySelector('[data-energy-v]');
  if (shown && shown.textContent !== v) { SCREENS[screen](); return; }
  const when = app.querySelector('[data-energy-when]');
  if (when) when.textContent = energyLine();
}, 20000);

const ADD_BTN = () => `<label class="icon-btn tinted" role="button" data-go="word" aria-label="Добавить слово">${HX()}${ICONS.plus}</label>`;
const statusDot = c => { const st = wordStatus(c); return `<i class="dot ${st}" title="${DICT_FILTERS[st]}"></i>`; };

function renderDict() {
  app.innerHTML = `
    <header class="page-head">
      <h1>Словарь</h1>
      ${ADD_BTN()}
    </header>
    ${topics.some(t => t.mine) ? '' : `
      <label class="my-cta card-surface" role="button" data-edit="">${HX()}
        <span class="my-cta-icon">${ICONS.plus}</span>
        <span class="list-main">
          <span class="list-title">Собери свой банк слов</span>
          <span class="list-sub">Добавь слова из фильмов, книг и работы — они попадут в урок первыми</span>
        </span>
      </label>`}
    <label class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="dict-q" type="search" placeholder="Поиск" aria-label="Поиск по словарю" value="${esc(dictQuery)}" autocomplete="off" autocorrect="off" spellcheck="false">
    </label>
    <div class="segmented">
      ${Object.entries(DICT_FILTERS).map(([k, v]) => `<button type="button" class="${dictFilter === k ? 'on' : ''}" aria-pressed="${dictFilter === k}" data-dict-filter="${k}">${v}</button>`).join('')}
    </div>
    <div id="dict-list" class="dict-list"></div>`;
  renderDictList();
}

function renderDictList() {
  const box = document.getElementById('dict-list');
  if (!box) return;
  const token = ++dictToken;
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
  const html = groups.map(g => `
    <h2 class="group-title">${esc(g.name)}</h2>
    <ul class="list card-surface">
      ${g.items.map(c => c.mine ? `
        <li>
          <label class="list-row" role="button" data-edit="${esc(c.id)}">${HX()}
            ${speakBtn(c.word, 'small')}
            <span class="list-main">
              <span class="list-title">${esc(c.word)} <span class="muted">${esc(c.ipa)}</span></span>
              <span class="list-sub">${esc(c.translation)}</span>
            </span>
            ${statusDot(c)}
            <span class="chev">${ICONS.chevron}</span>
          </label>
        </li>` : `
        <li class="list-row static">
          ${speakBtn(c.word, 'small')}
          <span class="list-main">
            <span class="list-title">${esc(c.word)} <span class="muted">${esc(c.ipa)}</span></span>
            <span class="list-sub">${esc(c.translation)}</span>
          </span>
          ${statusDot(c)}
        </li>`).join('')}
    </ul>`);
  // The first screenful shows at once; the rest of the 500 words is added right after that frame is painted,
  // so the tab opens without a pause.
  let first = 0;
  for (let rows = 0; first < groups.length && rows < 30; first++) rows += groups[first].items.length;
  box.innerHTML = html.slice(0, first).join('');
  if (first < html.length) {
    requestAnimationFrame(() => setTimeout(() => {
      if (token === dictToken && box.isConnected) box.insertAdjacentHTML('beforeend', html.slice(first).join(''));
    }, 0));
  }
}

// ---------- own words ----------

const WORD_FIELDS = ['word', 'translation', 'ipa', 'exEn', 'exRu'];
let editingId = null;
let wordBack = 'dict';

function renderWord() {
  const w = editingId ? state.mine[editingId] : null;
  const v = k => esc(w?.[k] || '');
  const field = (k, label, ph, attrs = '') => `
    <label class="field">
      <span class="field-label">${label}</span>
      <input id="f-${k}" value="${v(k)}" placeholder="${ph}" autocomplete="off" spellcheck="false" ${attrs}>
    </label>`;
  app.innerHTML = `
    <div class="sheet">
      <header class="sheet-bar">
        <button type="button" class="bar-btn" data-go="${wordBack}">Отменить</button>
        <h1 class="sheet-title">${w ? 'Изменить слово' : 'Новое слово'}</h1>
        <label class="bar-btn strong" role="button" data-action="save-word">${HX()}${w ? 'Готово' : 'Добавить'}</label>
      </header>

      <section class="card-surface form">
        ${field('word', 'Слово на английском', 'например, sunshine', 'autocapitalize="off" autocorrect="off" lang="en"')}
        ${field('translation', 'Перевод', 'например, солнечный свет', 'lang="ru"')}
      </section>
      <section class="card-surface group">
        <label class="group-row link" role="button" data-action="autofill">${HX()}${ICONS.sparkle}<span>Подсказать перевод и пример</span></label>
      </section>
      <p class="group-note">Подсказка работает через интернет — проверь её, прежде чем сохранить.</p>

      <h2 class="group-title">Необязательно</h2>
      <section class="card-surface form">
        ${field('ipa', 'Транскрипция', '[ˈsʌnʃaɪn]', 'autocapitalize="off" autocorrect="off"')}
        ${field('exEn', 'Пример', 'The sunshine is warm today.', 'autocapitalize="sentences" lang="en"')}
        ${field('exRu', 'Перевод примера', 'Сегодня тёплое солнце.', 'lang="ru"')}
      </section>

      ${w ? '<section class="card-surface group"><button type="button" class="group-row link danger center" data-action="delete-word">Удалить слово</button></section>' : ''}
    </div>`;
  if (!w) setTimeout(() => document.getElementById('f-word')?.focus(), 350);
}

function openWord(id) {
  editingId = id && state.mine[id] ? id : null;
  if (screen && screen !== 'word') wordBack = screen;
  show('word');
}

const readForm = () => Object.fromEntries(WORD_FIELDS.map(k => [k, (document.getElementById(`f-${k}`)?.value || '').trim()]));

async function saveWord() {
  const f = readForm();
  if (!f.word || !f.translation) {
    haptic('error');
    toast(!f.word ? 'Впиши слово на английском' : 'Впиши перевод', 'sad');
    document.getElementById(!f.word ? 'f-word' : 'f-translation')?.focus();
    return;
  }
  if (f.ipa && !/^[[/]/.test(f.ipa)) f.ipa = `[${f.ipa}]`;
  const key = f.word.toLowerCase();
  const twin = cards.find(c => c.word.toLowerCase() === key && c.id !== editingId);
  if (twin && !await ask({ title: `«${twin.word}» уже есть в словаре`, message: `${twin.topic}: ${twin.translation}`, action: 'Добавить' })) return;

  const now = Date.now();
  const id = editingId || `my:${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  state.mine[id] = { ...f, created: state.mine[id]?.created || now, updated: now };
  saveState();
  rebuildCards();
  haptic('success');
  toast(editingId ? 'Сохранено' : `«${f.word}» в твоём словаре`, 'happy');
  editingId = null;
  dictQuery = '';
  dictFilter = 'all';
  show('dict');
}

async function deleteWord() {
  const w = state.mine[editingId];
  if (!w || !await ask({ title: `Удалить «${w.word}»?`, message: 'Слово и прогресс по нему удалятся.', action: 'Удалить', destructive: true })) return;
  state.mine[editingId] = { deleted: true, updated: Date.now() };
  for (const d of Object.keys(state.progress)) delete state.progress[d][editingId];
  saveState();
  rebuildCards();
  editingId = null;
  toast('Слово удалено');
  show('dict');
}

// Free public services: Wiktionary for transcription and examples, MyMemory for translation.
async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function translate(text, pair) {
  const data = await getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
  const out = String(data?.responseData?.translatedText || '').trim();
  if (!out || /MYMEMORY|QUERY LENGTH|INVALID/i.test(out) || out.toLowerCase() === text.toLowerCase()) return '';
  // MyMemory sometimes shouts single words in capitals.
  return out === out.toUpperCase() && text !== text.toUpperCase() ? out.toLowerCase() : out;
}

const cleanWiki = t => t.split('|')[0].replace(/'''?|\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\s+/g, ' ').trim();

async function lookupEnglish(word) {
  const title = encodeURIComponent(word.toLowerCase());
  const data = await getJSON(`https://en.wiktionary.org/w/api.php?action=query&titles=${title}&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*`);
  const text = data?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content || '';
  const en = text.match(/==English==([\s\S]*?)(?:\n==[^=]|$)/)?.[1] || '';
  const ipa = en.match(/\{\{IPA\|en\|\/([^/|}]+)\//)?.[1] || '';
  const examples = [...en.matchAll(/\{\{(?:ux|uxi|usex)\|en\|([^{}]*)\}\}/g)].map(m => cleanWiki(m[1]));
  const example = examples.find(x => x.length >= 8 && x.length <= 70) || '';
  return { ipa: ipa && `[${ipa}]`, example };
}

let autofilling = false;
async function autofill(btn) {
  if (autofilling) return;
  const f = readForm();
  const set = (k, v) => {
    const el = document.getElementById(`f-${k}`);
    if (el && v && !el.value.trim()) { el.value = v; el.classList.add('filled'); }
  };
  if (!f.word && !f.translation) {
    toast('Сначала впиши слово — на английском или на русском', 'sad');
    document.getElementById('f-word')?.focus();
    return;
  }
  autofilling = true;
  btn.classList.add('loading');
  const label = btn.querySelector('span');
  label.textContent = 'Ищу…';
  let found = 0;
  try {
    let word = f.word;
    if (!word) {
      word = await translate(f.translation, 'ru|en');
      set('word', word);
      if (word) found++;
    }
    if (word) {
      const [ru, info] = await Promise.all([
        f.translation ? '' : translate(word, 'en|ru').catch(() => ''),
        lookupEnglish(word).catch(() => ({})),
      ]);
      set('translation', ru);
      set('ipa', info.ipa);
      const exEn = document.getElementById('f-exEn')?.value.trim() ? '' : info.example;
      set('exEn', exEn);
      if (exEn) set('exRu', await translate(exEn, 'en|ru').catch(() => ''));
      found += [ru, info.ipa, exEn].filter(Boolean).length;
    }
  } catch {}
  autofilling = false;
  if (!btn.isConnected) return;
  btn.classList.remove('loading');
  label.textContent = 'Подсказать перевод и пример';
  if (found) { haptic('success'); toast('Готово! Проверь и поправь, если нужно', 'happy'); }
  else toast(navigator.onLine ? 'Ничего не нашлось — впиши вручную' : 'Нет интернета — впиши вручную', 'sad');
}

document.addEventListener('input', e => {
  if (e.target.classList?.contains('filled')) e.target.classList.remove('filled');
  if (e.target.id !== 'dict-q') return;
  dictQuery = e.target.value;
  cancelAnimationFrame(dictFrame);
  dictFrame = requestAnimationFrame(renderDictList);
});

// ---------- settings ----------

function renderSettings() {
  app.innerHTML = `
    <header class="page-head"><h1>Профиль</h1></header>

    ${accountSection()}

    <h2 class="group-title">Энергия</h2>
    <section class="card-surface group">
      <button type="button" class="group-row nav" data-go="energy"><span>${plusOn() ? 'Подписка Плюс' : 'Батарейка'}</span><span class="row-value">${plusOn() ? 'Активна' : `${energyState().v} / ${ENERGY.max}`}<span class="chev">${ICONS.chevron}</span></span></button>
    </section>

    <h2 class="group-title">Оформление</h2>
    <section class="card-surface group">
      <div class="group-row stack">
        <span>Тема</span>
        <div class="segmented">
          ${Object.entries(THEMES).map(([k, v]) => `<button type="button" class="${state.settings.theme === k ? 'on' : ''}" aria-pressed="${state.settings.theme === k}" data-set-theme="${k}">${v}</button>`).join('')}
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
      <button type="button" class="group-row nav" data-ob="restart"><span>Цели и темы</span><span class="row-value">${planLabel()}<span class="chev">${ICONS.chevron}</span></span></button>
      <div class="group-row stack">
        <span>Направление карточек</span>
        <div class="segmented">
          ${Object.entries(DIRS).map(([k, v]) => `<button type="button" class="${dir() === k ? 'on' : ''}" aria-pressed="${dir() === k}" data-dir="${k}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="group-row stack">
        <span>Цель: новых слов в день</span>
        <div class="segmented">
          ${NEW_OPTIONS.map(n => `<button type="button" class="${state.settings.newPerDay === n ? 'on' : ''}" aria-pressed="${state.settings.newPerDay === n}" data-new="${n}">${n}</button>`).join('')}
        </div>
      </div>
    </section>
    <p class="group-note">Это цель, а не лимит: выполнив её, можно учить дальше. Прогресс по каждому направлению считается отдельно.</p>

    <h2 class="group-title">Озвучка</h2>
    <section class="card-surface group">
      <div class="group-row"><span>Проверить звук</span>${speakBtn('Hello! How are you?', 'small')}</div>
    </section>
    <p class="group-note">Если звука нет — выключи беззвучный режим на iPhone и прибавь громкость.</p>

    <h2 class="group-title">Словарь</h2>
    <section class="card-surface group">
      <div class="group-row"><span>Слов</span><span class="muted num">${cards.length}</span></div>
      <div class="group-row"><span>Из них моих</span><span class="muted num">${cards.length - baseCards.length}</span></div>
      <div class="group-row"><span>Тем</span><span class="muted num">${topics.length}</span></div>
      <button type="button" class="group-row link" data-action="reload">Обновить слова</button>
    </section>

    <section class="card-surface group">
      <button type="button" class="group-row link danger center" data-action="reset">Сбросить прогресс ${DIRS[dir()]}</button>
    </section>

    <div class="about">${mascot('happy', 44)}<span class="muted small">English Cards · маскот Эй</span></div>`;
}

async function resetProgress() {
  if (!await ask({ title: `Сбросить прогресс ${DIRS[dir()]}?`, message: 'Все ответы по этому направлению удалятся. Это нельзя отменить.', action: 'Сбросить', destructive: true })) return;
  const d = dir();
  state.progress[d] = {};
  state.resets = { ...state.resets, [d]: Date.now() };
  // Today's counters go too, otherwise the used-up daily goal would still show on the home screen.
  for (const k of Object.keys(state.days)) state.days[k] = stripDir(state.days[k], d);
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  saveState();
  renderSettings();
  toast('Прогресс сброшен — можно начинать заново');
}

// ---------- navigation ----------

const TAB_SCREENS = ['home', 'dict', 'stats', 'settings'];
const SCREENS = { energy: renderEnergy, onboarding: renderOnboarding, wait: renderWait, home: renderHome, study: renderStudy, stats: renderStats, settings: renderSettings, dict: renderDict, word: renderWord };

function show(name) {
  if (needsLogin()) { renderLogin(); return; }
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
    tabs.hidden = ['study', 'word', 'energy', 'onboarding', 'wait'].includes(screen);
    tabs.querySelectorAll('[data-go]').forEach(b => {
      const on = b.dataset.go === screen;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.body.dataset.screen = screen;
    SCREENS[screen]();
    window.scrollTo(0, 0);
  };
  // Tabs switch instantly, as in iOS; the cross-fade is kept for opening a lesson or a word.
  const tabSwitch = TAB_SCREENS.includes(prev) && TAB_SCREENS.includes(screen);
  if (prev && prev !== screen && !tabSwitch && document.startViewTransition && !REDUCED_MOTION.matches) document.startViewTransition(render);
  else render();
}

// A finger that lands on the page while it is still gliding (or drags before lifting) is scrolling, not pressing.
// The tab bar doesn't scroll, so it answers every tap, like a native tab bar.
// The touchstart listener also lets iPhone show the :active pressed state.
let touch = null;
let lastScroll = -Infinity;
addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });
addEventListener('touchstart', e => {
  const t = e.touches[0];
  const now = performance.now();
  const inTabs = !!e.target.closest?.('#tabs');
  touch = { x: t.clientX, y: t.clientY, at: now, moved: false, inTabs, gliding: !inTabs && now - lastScroll < 100 };
}, { capture: true, passive: true });
addEventListener('touchmove', e => {
  const t = e.touches[0];
  if (touch && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 8) touch.moved = true;
}, { capture: true, passive: true });
const scrollTap = () => !!touch && !touch.inTabs && performance.now() - touch.at < 1500 && (touch.moved || touch.gliding);
const hapticSwitch = el => (el.tagName === 'LABEL' ? el.querySelector(':scope > .hx') : null);

// Haptics come from the invisible switch (.hx) toggling. Where the page doesn't scroll (tab bar, lesson, alert,
// splash) the finger lands on the switch itself. In scrolling content the switch lets touches through, because
// a native switch under the finger swallows the scroll; there the tap lands on the label, and the label's
// own activation toggles the switch. What's under the finger never changes mid-tap: iOS drops such taps.
let labelTap = null;
document.addEventListener('click', e => {
  if (scrollTap()) {
    // Keep the label from toggling its switch, so an ignored tap doesn't vibrate.
    const row = e.target.closest?.('label');
    if (row && hapticSwitch(row)) e.preventDefault();
    return;
  }
  const el = e.target.closest('[data-speak],[data-grade],[data-study],[data-go],[data-dir],[data-new],[data-range],[data-set-theme],[data-haptics],[data-dict-filter],[data-edit],[data-ob],[data-action],[data-reveal]');
  if (!el) return;
  // The switch toggled — keep its default action, that toggle is what vibrates the iPhone.
  if (e.target.classList?.contains('hx')) {
    labelTap = null;
    setTimeout(() => act(el), 0);
    return;
  }
  // A tap on the label: let it pass to the switch, which calls back above; act here only if that didn't happen.
  if (el === e.target.closest('label') && hapticSwitch(el)) {
    labelTap = el;
    setTimeout(() => { if (labelTap === el) { labelTap = null; act(el); } }, 0);
    return;
  }
  e.preventDefault();
  act(el);
});

function act(el) {
  const d = el.dataset;

  if (d.speak !== undefined) { speak(d.speak, el); return; }
  if (d.grade !== undefined) { pressGrade(el, d.grade === '1'); return; }
  if (d.study !== undefined) { haptic(); startSession(d.study); return; }
  if (d.ob) { obAction(d.ob, el); return; }
  if (d.go === 'word') { haptic(); openWord(''); return; }
  if (d.go === 'energy') { haptic(); openEnergy(); return; }
  if (d.go) { show(d.go); return; }
  if (d.edit !== undefined) { haptic(); openWord(d.edit); return; }
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
  if (d.action === 'signout') { logOut(); return; }
  if (d.action === 'save-word') { saveWord(); return; }
  if (d.action === 'delete-word') { deleteWord(); return; }
  if (d.action === 'autofill') { autofill(el); return; }
  if (d.action === 'reload') { reloadWords(el); return; }
  if (d.action === 'reset') { resetProgress(); return; }
  if (d.action === 'ad') {
    state.energy = energyAdd(state.energy, ENERGY.ad, Date.now());
    saveState(); renderEnergy(); haptic('success');
    toast(`+${ENERGY.ad} энергии`, 'happy');
    return;
  }
  if (d.action === 'plus-on' || d.action === 'plus-off') {
    state.plus = { on: d.action === 'plus-on', t: Date.now() };
    saveState(); renderEnergy(); haptic(d.action === 'plus-on' ? 'success' : 'light');
    if (plusOn()) toast('Плюс включён — энергия без ограничений', 'celebrate');
    return;
  }
  if (d.reveal !== undefined && session && !session.revealed && !grading) {
    haptic();
    session.revealed = true;
    saveSession();
    flipCard();
  }
}

async function loadWords() {
  const res = await fetch('words.md', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  baseCards = parseWords(await res.text());
}

async function reloadWords(btn) {
  if (btn.disabled) return;
  const before = new Set(baseCards.map(c => c.id));
  btn.disabled = true;
  btn.textContent = 'Обновляю…';
  try {
    await loadWords();
  } catch {
    toast('Нет связи — не получилось обновить словарь', 'sad');
    renderSettings();
    return;
  }
  rebuildCards();
  if (screen === 'settings') renderSettings();
  const added = baseCards.filter(c => !before.has(c.id)).length;
  haptic('success');
  toast(added ? `Добавлено ${added} ${plural(added, 'новое слово', 'новых слова', 'новых слов')}` : 'Словарь уже свежий — новых слов нет', 'happy');
}

async function init() {
  const clientReady = cloudEnabled ? getClient() : null;
  clientReady?.catch(() => {});
  try {
    await loadWords();
  } catch {
    app.innerHTML = `<div class="empty card-surface">${buddy('sad', 72)}<p>Не удалось загрузить словарь. Проверь интернет и обнови страницу.</p></div>`;
    return;
  }
  rebuildCards();

  if (location.hash) history.replaceState(null, '', location.pathname);
  await initCloud(clientReady);
  if (needsLogin()) renderLogin();
  else enterApp();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js');
}
if ('speechSynthesis' in window) speechSynthesis.getVoices();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
addEventListener('online', () => syncNow());

applyTheme();
refreshTabHaptics();
showSplash();
init();
