// Cloudflare Worker - Admin API
// Deploy at: Workers & Pages → Create Worker → paste this code
// Environment variable needed: SUPABASE_SERVICE_KEY

const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

    let body = {};
    try { body = await request.json(); }
    catch(e) { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }); }

    const { action, user_id, email, password, full_name, role } = body;
    const KEY = env.SUPABASE_SERVICE_KEY;
    const sbHeaders = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

    if (action === 'debug') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*`, { headers: sbHeaders });
      const data = await res.json();
      return new Response(JSON.stringify({ queryStatus: res.status, profiles: data }), { headers });
    }

    if (action === 'get_profile') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=*`, { headers: sbHeaders });
      const data = await res.json();
      const profile = Array.isArray(data) && data.length ? data[0] : { role: 'user' };
      return new Response(JSON.stringify({ profile, status: res.status }), { headers });
    }

    if (action === 'get_all_profiles') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`, { headers: sbHeaders });
      const data = await res.json();
      return new Response(JSON.stringify({ profiles: Array.isArray(data) ? data : [], status: res.status }), { headers });
    }

    if (action === 'update_role') {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role })
      });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'create_user') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ email, password: password || 'CageWrx2024!', email_confirm: true, user_metadata: { full_name: full_name || '' } })
      });
      const data = await res.json();
      if (data.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ role: role || 'user', full_name: full_name || '', must_change_password: true })
        });
        return new Response(JSON.stringify({ success: true, id: data.id }), { headers });
      }
      return new Response(JSON.stringify({ error: data.message || data.error || 'Could not create user' }), { status: 400, headers });
    }

    if (action === 'reset_password') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
        method: 'PUT',
        headers: sbHeaders,
        body: JSON.stringify({ password: password || 'cagewrx123!' })
      });
      const data = await res.json();
      if (res.status >= 300) {
        return new Response(JSON.stringify({ error: data.msg || data.message || data.error || 'Could not reset password' }), { status: 400, headers });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ must_change_password: true })
      });
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'delete_user') {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
        method: 'DELETE', headers: sbHeaders
      });
      return new Response(JSON.stringify({ success: res.status < 300 }), { status: res.status < 300 ? 200 : 400, headers });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
  }
};
