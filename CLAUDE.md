# English Cards

Flashcard PWA for learning English words on iPhone (Russian UI). Vanilla JS, no build step, hosted on GitHub Pages from `main`: https://nikch1stov.github.io/english-cards/

## Files

- `index.html` — shell, CSP meta, SVG sprite, tab bar. `app.js` — all screens and logic. `core.js` — pure logic (parsing, scheduling, merge). `mascot.js` — letter mascots. `cloud.js` + `config.js` — Supabase auth and sync. `sw.js` — service worker. `style.css` — design system.
- `words.md` — the word list, copied from the Obsidian vault by `./sync-words.sh` (which also commits and pushes). Do not edit it by hand; edit the Obsidian file `Иностранные языки/Словарь/500 английских слов.md` (Spaced Repetition plugin format: `word [IPA]` / `?` / translation / `Пример: EN - RU.`, blank line between cards).
- `supabase/schema.sql` — table `user_state` (one jsonb row per user, RLS own-row only).
- `tests/` — Playwright (WebKit, iPhone 14) scripts; see `tests/README.md`.

## Rules

- **Cache busting:** every code change must bump `?v=N` on the changed file in `index.html` / the importing module, and the `CACHE` name in `sw.js`. The service worker serves `?v=` files cache-first, so an unbumped change never reaches phones.
- **CSP:** any new external host (API, image, font) must be added to the Content-Security-Policy meta in `index.html`, or the browser silently blocks it.
- `supabase-js` is pinned (currently 2.117.2 in `cloud.js`); upgrade deliberately.
- Card ids are the lowercased English word (`#2` for duplicates); renaming a word resets its progress. Own words live in `state.mine` with ids `my:<random>`; deletions are tombstones.
- Never use `window.confirm`; use `ask()` in `app.js` (iOS-style alert with a specific action verb).
- Tappable controls are `<label role="button">` with the invisible `.hx` switch from `HX()` on top — the only way to get haptics on iPhone. The click handler must not `preventDefault` on `.hx` and defers the action with `setTimeout`. In scrolling content `.hx` has `pointer-events: none` (a native switch under the finger swallows the scroll) and the label's own activation toggles it. Where nothing scrolls (tab bar, lesson, alert, splash) the finger lands on the switch directly. Never change what is under the finger during a tap: iOS cancels a tap whose target differs between touch start and end.
- The «новых слов в день» setting is a daily goal, not a cap: after it is met, lessons and topics bring another batch (`newAllowance()`).
- A progress reset is recorded in `state.resets[dir]`, and `mergeState` drops older answers (`at` timestamp) from other devices and the cloud.
- The default theme is light (`settleTheme()`); tabs switch without a view transition.
- Taps are ignored when the finger moved > 8 px or the page scrolled < 100 ms before the touch (`scrollTap`). Tests must scroll a target to the centre and wait before tapping.
- Never commit secrets: only the Supabase publishable key belongs in `config.js`. No `sb_secret`, `service_role`, personal access tokens or Google client secrets.

## Design

Apple Human Interface Guidelines for iOS 26–27:
- floating Liquid Glass tab bar with four sections (Учить · Словарь · Статистика · Профиль) and no actions in it;
- Dynamic Type via `-apple-system-body`, enabled only on iOS (macOS WebKit maps it to 13 px), with sizes in rem from the HIG text-style tokens;
- 44 pt touch targets, capsule controls, grouped lists, sheets with Отменить / Готово.

Palette, flat colours only, no gradients anywhere (UI, mascots, icon):

| Role | Colour | Used for |
| --- | --- | --- |
| `--primary` | `#FFD16B` | Main buttons, progress |
| `--accent` | `#FF6D47` | Selected tab, «+» button, icons |
| `--accent-ink` | `#C8401D` | Small coral text on light backgrounds (contrast) |
| `--cream` | `#FFF2D6` | Soft fills |
| background | `#FFFCF6` | Page background |

«Знаю» / «Не знаю» stay green / red.

## Workflow

Preview on the LAN with `python3 -m http.server 8765` from this folder, check on the iPhone, and publish (commit + push to `main`) only after the owner says «публикуй». `gh` CLI is at `~/.local/bin/gh`.
