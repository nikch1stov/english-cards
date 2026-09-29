import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=9';

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
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
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
