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

// All color-related property names used in CAGEwrx Shopify products
const COLOR_FIELDS = [
  'cage color',
  'roof color',
  'bumper color',
  'skid plate color',
  'windshield frame color',
  'grille frame color',
  'grille mesh color',
  'roof rack frame color',
  'roof rack bezel color',
  'enclosure color',
  // generic fallbacks
  'color', 'colour', 'powder color', 'powder colour', 'finish'
];

/**
 * Extract all color properties from all line items in an order.
 * Returns a formatted string like:
 *   "Cage: Gloss Black, Roof: Raw, Bumper: Gloss Black"
 * If only one unique color is used across everything, returns just that color.
 */
function extractColors(lineItems) {
  const colorMap = {};   // field label -> value
  const seen = new Set();

  for (const lineItem of lineItems) {
    const props = lineItem.properties || [];
    for (const p of props) {
      const fieldName = (p.name || '').toLowerCase().trim();
      if (COLOR_FIELDS.includes(fieldName) && p.value) {
        const label = toTitleCase(p.name.trim());
        const val   = String(p.value).trim();
        if (!colorMap[label]) {
          colorMap[label] = val;
          seen.add(val.toLowerCase());
        }
      }
    }
  }

  const entries = Object.entries(colorMap);
  if (entries.length === 0) return '';

  // If all colors are the same, just return that one color
  if (seen.size === 1) return [...seen][0];

  // Otherwise return "Label: Value, Label: Value"
  return entries.map(([k, v]) => k.replace(/ Color$/i, '') + ': ' + v).join(', ');
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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

  const lineItems = order.line_items || [];

  const orderNum  = String(order.order_number || order.name || 'TEST').replace('#', '');
  const item      = lineItems.map(i => i.name).join(', ') || '';
  const sku       = lineItems.map(i => i.sku).filter(Boolean).join(', ') || '';
  const shipping  = (order.shipping_lines || [])[0]?.title || '';
  const orderDate = new Date().toLocaleDateString('en-US');

  // Extract all color properties across all line items
  const color = extractColors(lineItems);

  // Capture customer name from shipping address or billing address
  const shippingAddr = order.shipping_address || order.billing_address || {};
  const firstName = shippingAddr.first_name || (order.customer && order.customer.first_name) || '';
  const lastName  = shippingAddr.last_name  || (order.customer && order.customer.last_name)  || '';
  const customerName = [firstName, lastName].filter(Boolean).join(' ');

  // Capture order notes
  const notes = order.note || '';

  const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      tab:           'new',
      order_num:     orderNum,
      sku:           sku,
      item:          item,
      color:         color,
      order_date:    orderDate,
      shipping:      shipping,
      customer_name: customerName,
      first_name:    firstName,
      last_name:     lastName,
      notes:         notes,
      total_price:   parseFloat(order.total_price || 0),
      po_num:        '',
      eta:           '',
      build_date:    '',
      sent_to_powder: ''
    })
  });

  const resText = await response.text();
  if (response.status >= 300) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database insert failed', detail: resText }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ success: true, order: orderNum, color: color, total_price: order.total_price }) };
};