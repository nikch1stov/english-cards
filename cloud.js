import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=9';
import { isNative, AUTH_REDIRECT, authSession } from './native.js?v=2';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client = null;

// The version is pinned so a new library release can't change the app (or its cached copy) without review.
export async function getClient() {
  if (!cloudEnabled) return null;
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export async function signInWithGoogle() {
  const sb = await getClient();
  if (isNative) return signInNative(sb);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

// In the app Google runs in the system sign-in sheet, which returns englishcards://auth?code=…;
// the code is exchanged here (PKCE), and onAuthStateChange takes it from there. Closing the sheet is not an error.
async function signInNative(sb) {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  let back;
  try {
    back = new URL(await authSession(data.url));
  } catch (e) {
    if (e?.code === 'CANCELED') return;
    throw e;
  }
  const params = new URLSearchParams(back.search || back.hash.slice(1));
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
  const { error: exchange } = await sb.auth.exchangeCodeForSession(params.get('code'));
  if (exchange) throw exchange;
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
}

export async function pullState(userId) {
  const sb = await getClient();
  const { data, error } = await sb.from('user_state').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.state || null;
}

export async function pushState(userId, state) {
  const sb = await getClient();
  const { error } = await sb.from('user_state').upsert({ user_id: userId, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function userProfile(user) {
  const m = user?.user_metadata || {};
  return {
    name: m.full_name || m.name || user?.email?.split('@')[0] || 'Ученик',
    email: user?.email || '',
    avatar: m.avatar_url || m.picture || '',
  };
}
