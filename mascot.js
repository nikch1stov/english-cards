// Letter mascots. «Эй» (A) is the main hero; the others are his friends.
// Moods: happy, wave, celebrate, sad, sleep.
let uid = 0;

const A_BODY = 'M60 8C66 8 70 12 72.5 18.5L106 116C109 125 103 132 94 132H79C74 132 71 129 70 124L66 104C64.5 97 55.5 97 54 104L50 124C49 129 46 132 41 132H26C17 132 11 125 14 116L47.5 18.5C50 12 54 8 60 8Z';

// d: stroke path of the letter; face: [x, y] centre of the face; arms/feet at rest: [x, y, rotation].
// colors: [body, feet, arms] — flat fills, no gradients.
export const LETTERS = {
  A: { name: 'Эй', colors: ['#FFD16B', '#FF6D47', '#FF6D47'] },
  B: {
    name: 'Би', colors: ['#60a5fa', '#1e40af', '#3b82f6'],
    d: 'M24 22V118H64C84 118 98 108 98 92C98 78 88 70 64 70H24M24 22H60C78 22 90 30 90 45C90 60 78 70 60 70',
    face: [52, 23], arms: [[3, 62, 30], [119, 92, -30]], feet: [[32, 136], [74, 136]],
  },
  C: {
    name: 'Си', colors: ['#2dd4bf', '#115e59', '#14b8a6'],
    d: 'M98 38C90 26 76 22 62 22C36 22 18 42 18 70C18 98 36 118 62 118C76 118 90 114 98 102',
    face: [58, 23], arms: [[1, 72, 30], [109, 56, -30]], feet: [[44, 136], [78, 136]],
  },
  D: {
    name: 'Ди', colors: ['#fdba74', '#c2410c', '#fb923c'],
    d: 'M24 22V118H52C84 118 102 98 102 70C102 42 84 22 52 22Z',
    face: [54, 23], arms: [[3, 64, 30], [122, 70, -30]], feet: [[32, 136], [74, 136]],
  },
  E: {
    name: 'И', colors: ['#f9a8d4', '#9d174d', '#f472b6'],
    d: 'M96 22H24V118H96M24 70H84',
    face: [60, 23], arms: [[3, 62, 30], [109, 46, -30]], feet: [[36, 136], [86, 136]],
  },
  F: {
    name: 'Эф', colors: ['#86efac', '#166534', '#22c55e'],
    d: 'M28 118V24H96M28 70H84',
    face: [62, 24], arms: [[7, 62, 30], [109, 46, -30]], feet: [[18, 136], [40, 136]],
  },
  H: {
    name: 'Эйч', colors: ['#7dd3fc', '#075985', '#38bdf8'],
    d: 'M24 22V118M96 22V118M24 72H96',
    face: [60, 72], arms: [[0, 74, 30], [120, 74, -30]], feet: [[24, 136], [96, 136]],
  },
  O: {
    name: 'Оу', colors: ['#fcd34d', '#b45309', '#fbbf24'],
    d: 'M60 22C88 22 102 44 102 70C102 96 88 118 60 118C32 118 18 96 18 70C18 44 32 22 60 22Z',
    face: [60, 25], arms: [[-1, 72, 30], [121, 72, -30]], feet: [[42, 136], [78, 136]],
  },
  P: {
    name: 'Пи', colors: ['#e879f9', '#701a75', '#d946ef'],
    d: 'M26 118V22H62C84 22 98 34 98 52C98 70 84 82 62 82H26',
    face: [56, 23], arms: [[5, 62, 30], [121, 56, -30]], feet: [[16, 136], [38, 136]],
  },
  R: {
    name: 'Ар', colors: ['#fda4af', '#9f1239', '#fb7185'],
    d: 'M26 118V22H62C84 22 98 34 98 52C98 70 84 82 62 82H26M62 82L96 118',
    face: [56, 23], arms: [[5, 62, 30], [121, 56, -30]], feet: [[24, 136], [98, 136]],
  },
  S: {
    name: 'Эс', colors: ['#6ee7b7', '#065f46', '#10b981'],
    d: 'M96 36C88 26 76 22 60 22C38 22 24 32 24 46C24 62 40 66 60 70C80 74 96 80 96 96C96 110 82 118 60 118C44 118 30 114 22 104',
    face: [58, 24], arms: [[2, 58, 30], [111, 46, -30]], feet: [[44, 136], [78, 136]],
  },
  T: {
    name: 'Ти', colors: ['#a5b4fc', '#312e81', '#6366f1'],
    d: 'M20 24H100M60 24V118',
    face: [60, 24], arms: [[24, 52, 20], [96, 52, -20]], raise: 46, feet: [[48, 136], [72, 136]],
  },
  Z: {
    name: 'Зи', colors: ['#fca5a5', '#991b1b', '#f87171'],
    d: 'M22 24H98L22 116H98',
    face: [60, 24], arms: [[8, 46, 30], [112, 46, -30]], feet: [[32, 136], [88, 136]],
  },
};

// Digit mascots show the streak on «Урок пройден». Same build as the letters, in the streak's coral.
const DIGIT_COLORS = ['#FF6D47', '#C8401D', '#FFD16B'];
export const DIGITS = {
  0: { d: 'M60 22C86 22 98 44 98 70C98 96 86 118 60 118C34 118 22 96 22 70C22 44 34 22 60 22Z', face: [60, 25], arms: [[0, 72, 30], [120, 72, -30]], feet: [[42, 136], [78, 136]] },
  1: { d: 'M36 42L64 22V118', face: [64, 56], arms: [[42, 80, 30], [90, 80, -30]], raise: 30, feet: [[52, 136], [76, 136]] },
  2: { d: 'M28 44C30 30 42 22 60 22C80 22 92 34 92 50C92 66 80 76 62 88L26 118H96', face: [60, 24], arms: [[6, 52, 30], [116, 50, -30]], feet: [[30, 136], [90, 136]] },
  3: { d: 'M26 32C34 25 46 22 60 22C80 22 92 32 92 46C92 60 80 70 58 70C82 70 96 80 96 96C96 110 82 118 60 118C44 118 32 114 24 106', face: [58, 24], arms: [[4, 50, 30], [118, 62, -30]], feet: [[44, 136], [78, 136]] },
  4: { d: 'M80 118V22L22 88H100', face: [56, 86], arms: [[4, 86, 30], [118, 60, -30]], feet: [[68, 136], [92, 136]] },
  5: { d: 'M92 22H36L32 64C40 60 48 58 60 58C82 58 96 70 96 88C96 106 82 118 60 118C44 118 32 114 24 106', face: [64, 23], arms: [[12, 62, 30], [118, 80, -30]], feet: [[44, 136], [78, 136]] },
  6: { d: 'M88 30C80 24 72 22 62 22C38 22 24 44 24 72C24 100 38 118 60 118C82 118 96 104 96 88C96 72 82 60 62 60C44 60 30 70 24 84', face: [60, 24], arms: [[2, 72, 30], [118, 86, -30]], feet: [[44, 136], [78, 136]] },
  7: { d: 'M24 22H96L50 118', face: [60, 23], arms: [[4, 44, 30], [116, 44, -30]], feet: [[38, 136], [62, 136]] },
  8: { d: 'M60 70C40 70 28 60 28 46C28 32 40 22 60 22C80 22 92 32 92 46C92 60 80 70 60 70ZM60 70C84 70 96 82 96 96C96 110 82 118 60 118C38 118 24 110 24 96C24 82 36 70 60 70Z', face: [60, 24], arms: [[4, 94, 30], [116, 94, -30]], feet: [[44, 136], [78, 136]] },
  9: { d: 'M94 58C88 72 76 80 60 80C40 80 26 68 26 50C26 34 40 22 60 22C82 22 96 38 96 64C96 94 82 118 58 118C46 118 36 114 30 108', face: [60, 24], arms: [[4, 50, 30], [118, 62, -30]], feet: [[46, 136], [76, 136]] },
};
for (const D of Object.values(DIGITS)) D.colors = DIGIT_COLORS;

function eyes(mood) {
  if (mood === 'sleep') {
    return '<path d="M41 58q7 5 14 0M65 58q7 5 14 0" fill="none" stroke="#1e1b4b" stroke-width="3" stroke-linecap="round"/>';
  }
  if (mood === 'celebrate') {
    return '<path d="M41 59q7-8 14 0M65 59q7-8 14 0" fill="none" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round"/>';
  }
  const dy = mood === 'sad' ? 3 : 0;
  return `
    <g class="m-eyes">
      <ellipse cx="48" cy="56" rx="7.5" ry="8.5" fill="#fff"/>
      <ellipse cx="72" cy="56" rx="7.5" ry="8.5" fill="#fff"/>
      <circle cx="49" cy="${57 + dy}" r="4.5" fill="#1e1b4b"/>
      <circle cx="73" cy="${57 + dy}" r="4.5" fill="#1e1b4b"/>
      <circle cx="50.5" cy="${55 + dy}" r="1.6" fill="#fff"/>
      <circle cx="74.5" cy="${55 + dy}" r="1.6" fill="#fff"/>
    </g>
    ${mood === 'sad' ? '<path d="M40 48l12-5M80 48l-12-5" stroke="#1e1b4b" stroke-width="2.5" stroke-linecap="round"/>' : ''}`;
}

function mouth(mood) {
  switch (mood) {
    case 'sad': return '<path d="M53 76q7-6 14 0" fill="none" stroke="#1e1b4b" stroke-width="3" stroke-linecap="round"/>';
    case 'sleep': return '<ellipse cx="60" cy="72" rx="3.5" ry="3" fill="#1e1b4b"/>';
    case 'celebrate': return '<path d="M50 68q10 14 20 0z" fill="#1e1b4b"/><path d="M55 73q5 4 10 0" fill="#fb7185"/>';
    default: return '<path d="M51 69q9 9 18 0" fill="none" stroke="#1e1b4b" stroke-width="3" stroke-linecap="round"/>';
  }
}

const face = mood => `
  <ellipse cx="39" cy="70" rx="6" ry="3.5" fill="#f9a8d4" opacity=".7"/>
  <ellipse cx="81" cy="70" rx="6" ry="3.5" fill="#f9a8d4" opacity=".7"/>
  ${eyes(mood)}
  ${mouth(mood)}`;

function arm([x, y, rot], raised, fill, cls, lift = 22) {
  const [ax, ay, ar] = raised ? [x + (rot > 0 ? -2 : 2), y - lift, rot > 0 ? -25 : 25] : [x, y, rot];
  return `
    <g class="${cls}" style="transform-origin:${x + (rot > 0 ? 6 : -6)}px ${y - 6}px">
      <ellipse cx="${ax}" cy="${ay}" rx="6" ry="11" fill="${fill}" transform="rotate(${ar} ${ax} ${ay})"/>
    </g>`;
}

function bodyA(mood, id, [body, feet, arms]) {
  const rest = [[20, 84, 35], [100, 84, -35]];
  return `
    <ellipse cx="32" cy="134" rx="14" ry="6.5" fill="${feet}"/>
    <ellipse cx="88" cy="134" rx="14" ry="6.5" fill="${feet}"/>
    ${arm(rest[0], mood === 'celebrate', arms, 'm-arm-l')}
    ${arm(rest[1], mood === 'wave' || mood === 'celebrate', arms, 'm-arm-r')}
    <path d="${A_BODY}" fill="${body}"/>
    <g clip-path="url(#${id}c)">
      <rect x="0" y="84" width="120" height="11" fill="#FFF2D6"/>
      <path d="M38 18c8-8 20-10 28-4" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round" fill="none"/>
    </g>
    ${face(mood)}`;
}

function bodyLetter(mood, id, L) {
  const [body, feet, arms] = L.colors;
  const [fx, fy] = L.face;
  return `
    ${L.feet.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="6" fill="${feet}"/>`).join('')}
    ${arm(L.arms[0], mood === 'celebrate', arms, 'm-arm-l', L.raise)}
    ${arm(L.arms[1], mood === 'wave' || mood === 'celebrate', arms, 'm-arm-r', L.raise)}
    <path d="${L.d}" fill="none" stroke="${body}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(${fx} ${fy}) scale(.78) translate(-60 -62)">${face(mood)}</g>`;
}

export function mascot(mood = 'happy', size = 120, cls = '', letter = 'A') {
  const L = LETTERS[letter] || DIGITS[letter] || LETTERS.A;
  const id = `m${++uid}`;
  return `
  <svg class="mascot mood-${mood} ${cls}" viewBox="0 0 120 150" width="${size}" height="${(size * 150) / 120}" aria-hidden="true">
    <defs>
      ${L.d ? '' : `<clipPath id="${id}c"><path d="${A_BODY}"/></clipPath>`}
    </defs>
    <ellipse class="m-shadow" cx="60" cy="144" rx="42" ry="5" fill="currentColor" opacity=".12"/>
    <g class="m-body">${L.d ? bodyLetter(mood, id, L) : bodyA(mood, id, L.colors)}</g>
    ${mood === 'sleep' ? '<g class="m-z" fill="currentColor" font-weight="700" font-family="-apple-system, sans-serif"><text x="92" y="30" font-size="14">z</text><text x="102" y="18" font-size="10">z</text></g>' : ''}
  </svg>`;
}

const FLAME = `
  <svg class="streak-flame" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5c.5 3-1.5 4.5-3 6.5-1.3 1.7-2 3.3-2 5.2A5 5 0 0 0 12 19.5a5 5 0 0 0 5-5.3c0-2.6-1.4-4.2-2.4-5.4-.2 1.3-.8 2.2-1.7 2.7.4-3.2-.2-6.3-.9-9z" fill="#FF6D47"/>
    <path d="M12.2 10.5c.2 1.6-.8 2.4-1.6 3.4-.6.8-.9 1.5-.9 2.3a2.3 2.3 0 0 0 2.3 2.3 2.3 2.3 0 0 0 2.3-2.4c0-1.2-.6-1.9-1.1-2.5-.1.6-.4 1-.8 1.2.2-1.5-.1-2.9-.2-4.3z" fill="#FFD16B"/>
  </svg>`;

// The streak as digit mascots with a flame: 3 days → a «3» cheering next to the fire.
export function streakMascot(days, cls = '') {
  const digits = String(Math.max(0, days)).split('');
  const size = [150, 118, 94, 78][Math.min(digits.length, 4) - 1];
  return `
  <div class="streak-hero ${cls}" style="--digit:${size}px" aria-hidden="true">
    ${digits.map(d => mascot('celebrate', size, 'jump', d)).join('')}
    ${FLAME}
  </div>`;
}
