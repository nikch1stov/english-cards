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

export function streak(days, today) {
  let key = days[today]?.reviewed ? today : addDays(today, -1);
  let n = 0;
  while (days[key]?.reviewed) { n++; key = addDays(key, -1); }
  return n;
}
