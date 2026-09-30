const listeners = [];
let session = JSON.parse(localStorage.getItem('fake-session') || 'null');
const rows = () => JSON.parse(localStorage.getItem('fake-db') || '{}');
const nextUser = () => JSON.parse(localStorage.getItem('fake-next-user') || '{"id":"u1","email":"nik@example.com","user_metadata":{"full_name":"Nik Test"}}');
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: cb => { listeners.push(cb); setTimeout(() => cb('INITIAL_SESSION', session)); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithOAuth: async () => {
        session = { user: nextUser() };
        localStorage.setItem('fake-session', JSON.stringify(session));
        setTimeout(() => listeners.forEach(l => l('SIGNED_IN', session)));
        return { error: null };
      },
      signOut: async () => { session = null; localStorage.removeItem('fake-session'); listeners.forEach(l => l('SIGNED_OUT', null)); },
    },
    from: () => ({
      select: () => ({ eq: (_, uid) => ({ maybeSingle: async () => ({ data: rows()[uid] ? { state: rows()[uid] } : null, error: null }) }) }),
      upsert: async row => { const r = rows(); r[row.user_id] = row.state; localStorage.setItem('fake-db', JSON.stringify(r)); return { error: null }; },
    }),
  };
}
