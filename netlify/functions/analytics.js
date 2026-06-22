// netlify/functions/analytics.js
// Fetches revenue and product analytics from Supabase orders table

const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: 'ok' };

  const now = new Date();
  const params = event.queryStringParameters || {};
  const mode = params.mode || 'mtd'; // 'mtd' | 'last_year'

  // --- Date ranges ---
  // This month to date
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mtdEnd   = now;

  // Last month, same day range
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  // Same month last year, to same day
  const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearEnd   = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  function fmt(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  async function fetchOrders(start, end) {
    const url = SUPABASE_URL + '/rest/v1/orders?select=order_num,item,sku,total_price,order_date' +
      '&order_date=gte.' + fmt(start) +
      '&order_date=lte.' + fmt(end) +
      '&order=order_date.asc';
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });
    return r.json();
  }

  function summarize(orders) {
    orders = Array.isArray(orders) ? orders : [];
    const revenue = orders.reduce(function(sum, o) {
      return sum + (parseFloat(o.total_price) || 0);
    }, 0);
    // Top products by revenue
    const products = {};
    orders.forEach(function(o) {
      var name = (o.item || o.sku || 'Unknown').split(',')[0].trim();
      if (!products[name]) products[name] = { name: name, revenue: 0, count: 0 };
      products[name].revenue += parseFloat(o.total_price) || 0;
      products[name].count++;
    });
    const topProducts = Object.values(products)
      .sort(function(a, b) { return b.revenue - a.revenue; })
      .slice(0, 10);

    // Daily revenue for sparkline
    const daily = {};
    orders.forEach(function(o) {
      var d = (o.order_date || '').slice(0, 10);
      if (!d) return;
      daily[d] = (daily[d] || 0) + (parseFloat(o.total_price) || 0);
    });

    return { revenue: revenue, count: orders.length, topProducts: topProducts, daily: daily };
  }

  try {
    const [current, compare] = await Promise.all([
      fetchOrders(mtdStart, mtdEnd),
      mode === 'last_year'
        ? fetchOrders(lastYearStart, lastYearEnd)
        : fetchOrders(lastMonthStart, lastMonthEnd)
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        mode,
        current:  summarize(current),
        compare:  summarize(compare),
        labels: {
          current: 'Month to Date (' + fmt(mtdStart) + ' – ' + fmt(mtdEnd) + ')',
          compare: mode === 'last_year'
            ? 'Same Period Last Year (' + fmt(lastYearStart) + ' – ' + fmt(lastYearEnd) + ')'
            : 'Last Month (' + fmt(lastMonthStart) + ' – ' + fmt(lastMonthEnd) + ')'
        }
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
