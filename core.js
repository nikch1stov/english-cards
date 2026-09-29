export const LEARNED_IVL = 7;

export function parseWords(md) {
  const lines = md.split(/\r?\n/).map(l => l.trim());
  const cards = [];
  const seen = {};
  let topic = 'Без темы';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) { topic = line.slice(3).trim(); continue; }
    if (line !== '?' || i === 0) continue;

    const front = lines[i - 1];
    if (!front || front.startsWith('#')) continue;

    let translation = '';
    let exEn = '';
    let exRu = '';
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l || l.startsWith('#') || lines[j + 1] === '?') break;
      if (l.startsWith('<!--')) continue;
      if (l.startsWith('Пример:')) {
        const text = l.slice('Пример:'.length).trim();
        const k = text.indexOf(' - ');
        exEn = k === -1 ? text : text.slice(0, k).trim();
        exRu = k === -1 ? '' : text.slice(k + 3).trim();
      } else if (!translation) {
        translation = l;
      }
    }

    const m = front.match(/^(.*?)\s*(\[.*)?$/);
    const word = m[1].trim();
    const ipa = (m[2] || '').trim();
    const base = word.toLowerCase();
    seen[base] = (seen[base] || 0) + 1;
    const id = seen[base] > 1 ? `${base}#${seen[base]}` : base;

    cards.push({ id, word, ipa, translation, exEn, exRu, topic });
  }
  return cards;
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function schedule(prev, known, today) {
  const s = prev ? { ...prev } : { ivl: 0, reps: 0, lapses: 0 };
  if (known) {
    s.ivl = s.ivl < 1 ? 1 : Math.max(s.ivl + 1, Math.round(s.ivl * 2.5));
    s.reps += 1;
    s.due = addDays(today, s.ivl);
  } else {
    s.ivl = 0;
    s.lapses += 1;
    s.due = today;
  }
  return s;
}

export function buildQueue(cards, progress, today, newLeft) {
  const due = [];
  const fresh = [];
  for (const c of cards) {
    const p = progress[c.id];
    if (!p) fresh.push(c);
    else if (p.due <= today) due.push(c);
  }
  due.sort((a, b) => progress[a.id].due.localeCompare(progress[b.id].due));
  return [...due, ...fresh.slice(0, Math.max(0, newLeft))];
}

export function dayHistory(days, dir, today, n) {
  const start = addDays(today, -(n - 1));
  let last = { learned: 0, started: 0 };
  for (const k of Object.keys(days).sort()) {
    if (k >= start) break;
    if (days[k].snap?.[dir]) last = days[k].snap[dir];
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(start, i);
    const d = days[day];
    if (d?.snap?.[dir]) last = d.snap[dir];
    out.push({ day, ...last, known: d?.known?.[dir] || 0, wrong: d?.wrong?.[dir] || 0 });
  }
  return out;
}

const weight = s => (s.reps || 0) + (s.lapses || 0);

function mergeCards(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, y] of Object.entries(b)) {
    const x = out[id];
    if (!x || weight(y) > weight(x) || (weight(y) === weight(x) && (y.due || '') > (x.due || ''))) out[id] = y;
  }
  return out;
}

const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
};

function mergeDay(a, b) {
  if (!a) return b;
  if (!b) return a;
  const snap = { ...a.snap };
  for (const [d, s] of Object.entries(b.snap || {})) {
    const cur = snap[d];
    snap[d] = cur ? { learned: Math.max(cur.learned, s.learned), started: Math.max(cur.started, s.started) } : s;
  }
  return {
    reviewed: Math.max(a.reviewed || 0, b.reviewed || 0),
    new: maxMap(a.new, b.new),
    known: maxMap(a.known, b.known),
    wrong: maxMap(a.wrong, b.wrong),
    snap,
  };
}

// Combines this device's progress with the cloud copy without losing answers from either side.
export function mergeState(local, remote) {
  if (!remote?.progress) return local;
  const localEmpty = !Object.values(local.progress || {}).some(p => Object.keys(p).length);
  const progress = {};
  for (const dir of new Set([...Object.keys(local.progress || {}), ...Object.keys(remote.progress)])) {
    progress[dir] = mergeCards(local.progress?.[dir], remote.progress[dir]);
  }
  const days = {};
  for (const k of new Set([...Object.keys(local.days || {}), ...Object.keys(remote.days || {})])) {
    days[k] = mergeDay(local.days?.[k], remote.days?.[k]);
  }
  return {
    settings: localEmpty ? { ...local.settings, ...remote.settings } : local.settings,
    progress,
    days,
  };
}

export function streak(days, today) {
  let key = days[today]?.reviewed ? today : addDays(today, -1);
  let n = 0;
  while (days[key]?.reviewed) { n++; key = addDays(key, -1); }
  return n;
}
