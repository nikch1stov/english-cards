// The iPhone app (Capacitor, see native/) reaches native code from here. On the website isNative is false
// and every call does nothing. Capacitor's bridge puts window.Capacitor on the page, so no bundler is needed.
const cap = window.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();

const call = (plugin, method, options = {}) =>
  (isNative ? cap.nativePromise(plugin, method, options).catch(() => {}) : Promise.resolve());

// Real Taptic Engine feedback (native/ios/App/App/Feedback.swift) instead of the website's invisible-switch trick.
// Kinds: light (a control), select (a tab), know, error, success, pay (a lesson done), launch.
export const feel = kind => call('Feedback', 'play', { kind });

// Light text on the dark theme, dark text on the light one.
export const statusBarFor = dark => call('StatusBar', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });

// Sign-in callback: Supabase sends the browser back to englishcards://auth?code=…
export const AUTH_SCHEME = 'englishcards';
export const AUTH_REDIRECT = `${AUTH_SCHEME}://auth`;

// Opens the system sign-in sheet on url and resolves with the callback URL; rejects with code CANCELED when closed.
export async function authSession(url) {
  const res = await cap.nativePromise('AuthSession', 'start', { url, scheme: AUTH_SCHEME });
  return res.url;
}
