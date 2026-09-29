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
  const L = LETTERS[letter] || LETTERS.A;
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
