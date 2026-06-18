const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: 'ok' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body = {};
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, user_id, email, password, full_name, role } = body;

  // DEBUG: return key info
  if (action === 'debug') {
    const keyLen = (SUPABASE_KEY || '').length;
    const keyStart = (SUPABASE_KEY || '').slice(0, 20);
    const keyEnd = (SUPABASE_KEY || '').slice(-6);
    // Try a direct query
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ 
      keyLen, keyStart, keyEnd, 
      queryStatus: res.status,
      profiles: data
    })};
  }

  if (action === 'get_profile') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    const profile = Array.isArray(data) && data.length ? data[0] : { role: 'user' };
    return { statusCode: 200, headers, body: JSON.stringify({ profile, raw: data, status: res.status }) };
  }

  if (action === 'get_all_profiles') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ profiles: Array.isArray(data) ? data : [], raw: data, status: res.status }) };
  }

  if (action === 'update_role') {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role })
    });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  if (action === 'create_user') {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: password || 'CageWrx2024!', email_confirm: true, user_metadata: { full_name: full_name || '' } })
    });
    const data = await res.json();
    if (data.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ role: role || 'user', full_name: full_name || '' })
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: data.id }) };
    }
    return { statusCode: 400, headers, body: JSON.stringify({ error: data.message || data.error || 'Could not create user' }) };
  }

  if (action === 'delete_user') {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    return { statusCode: res.status < 300 ? 200 : 400, headers, body: JSON.stringify({ success: res.status < 300 }) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
};
