# Tests

Playwright scripts that drive the app in WebKit with iPhone 14 emulation. Sign-in is faked by `fake-supabase.js`, which replaces the Supabase library and keeps its "cloud" in localStorage.

Setup (once): `cd tests && npm install`.

Start the app from the project root with `python3 -m http.server 8765`, then run a script from `tests/`, e.g. `node gate.mjs`. Screenshots are written next to the scripts and ignored by git.

| Script | Checks |
| --- | --- |
| `gate.mjs` | Sign-in is required; sign-out keeps cloud progress; a second account on the same phone starts clean |
| `offline.mjs` | Behaviour when the sign-in library can't load |
| `mine.mjs` | Own words: add, autofill (needs internet), duplicate alert, lesson, edit, delete, cloud sync |
| `ob.mjs` | Onboarding for new users; returning and legacy users skip it; tab bar and «+» |
| `vis.mjs` | Screenshots of every screen in both themes; answer animation; taps while scrolling are ignored |
| `hig.mjs` | Touch targets under 44 pt and layout with large Dynamic Type |
| `sw2.mjs` | The app still opens from the service-worker cache when the server is down (own server on port 8766) |
| `perf.mjs` | Load time and dictionary redraw cost |

Taps are ignored while the page scrolls, so the scripts scroll each target to the centre and wait before tapping, as a finger would.
