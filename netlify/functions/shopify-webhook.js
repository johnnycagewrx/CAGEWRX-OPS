const crypto = require('crypto');

const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SHOPIFY_SECRET = '314d10ecadda5e95dbee50d45ad006e2336448d7cbc1663c65f4fbbaf9d5d454';

function verifyWebhook(body, hmacHeader) {
  const computed = crypto
    .createHmac('sha256', SHOPIFY_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return computed === hmacHeader;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: 'ok' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const hmacHeader = event.headers['x-shopify-hmac-sha256'];
  if (hmacHeader && !verifyWebhook(event.body, hmacHeader)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let order = {};
  try { order = JSON.parse(event.body); }
  catch(e) { order = { order_number: 'TEST', line_items: [{ name: 'Test Item' }], shipping_lines: [] }; }

  const orderNum = String(order.order_number || order.name || 'TEST').replace('#', '');
  const item = (order.line_items || []).map(i => i.name).join(', ') || '';
  const sku = (order.line_items || []).map(i => i.sku).filter(Boolean).join(', ') || '';
  const shipping = (order.shipping_lines || [])[0]?.title || '';
  const orderDate = new Date().toLocaleDateString('en-US');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      tab: 'new',
      order_num: orderNum,
      sku: sku,
      item: item,
      color: '',
      order_date: orderDate,
      shipping: shipping,
      po_num: '',
      eta: '',
      build_date: '',
      sent_to_powder: ''
    })
  });

  const resText = await response.text();
  if (response.status >= 300) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database insert failed', detail: resText }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ success: true, order: orderNum }) };
};
