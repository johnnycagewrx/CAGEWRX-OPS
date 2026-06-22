// netlify/functions/analytics.js
const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: 'ok' };

  const params = event.queryStringParameters || {};
  const mode = params.mode || 'mtd';

  const now = new Date();

  // Date range boundaries as JS dates
  const mtdStart      = new Date(now.getFullYear(), now.getMonth(), 1);
  const mtdEnd        = now;
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const lastYearStart  = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lastYearEnd    = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  function fmtISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function fmtLabel(d) {
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  }

  // Parse either MM/DD/YYYY or YYYY-MM-DD into a JS Date
  function parseOrderDate(str) {
    if (!str) return null;
    str = str.trim();
    if (str.indexOf('/') !== -1) {
      var p = str.split('/');
      if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    }
    if (str.indexOf('-') !== -1) {
      var d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // Fetch ALL orders with a price > 0 and filter by date in JS
  // This avoids the date format mismatch issue with Supabase string comparison
  async function fetchAllOrders() {
    var allRows = [];
    var limit = 1000;
    var offset = 0;
    while (true) {
      var url = SUPABASE_URL + '/rest/v1/orders?select=order_num,item,sku,total_price,order_date' +
        '&total_price=gt.0' +
        '&order=order_date.asc' +
        '&limit=' + limit + '&offset=' + offset;
      var r = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      allRows = allRows.concat(batch);
      if (batch.length < limit) break;
      offset += limit;
    }
    return allRows;
  }

  function filterByRange(orders, start, end) {
    start = new Date(start); start.setHours(0,0,0,0);
    end   = new Date(end);   end.setHours(23,59,59,999);
    return orders.filter(function(o) {
      var d = parseOrderDate(o.order_date);
      return d && d >= start && d <= end;
    });
  }

  function summarize(orders) {
    var revenue = orders.reduce(function(s, o) { return s + (parseFloat(o.total_price) || 0); }, 0);
    var products = {};
    orders.forEach(function(o) {
      var name = (o.item || o.sku || 'Unknown').split(',')[0].trim();
      if (!products[name]) products[name] = { name: name, revenue: 0, count: 0 };
      products[name].revenue += parseFloat(o.total_price) || 0;
      products[name].count++;
    });
    var topProducts = Object.values(products).sort(function(a,b){ return b.revenue - a.revenue; }).slice(0, 10);
    var daily = {};
    orders.forEach(function(o) {
      var d = parseOrderDate(o.order_date);
      if (!d) return;
      var key = fmtISO(d);
      daily[key] = (daily[key] || 0) + (parseFloat(o.total_price) || 0);
    });
    return { revenue: revenue, count: orders.length, topProducts: topProducts, daily: daily };
  }

  try {
    var allOrders = await fetchAllOrders();

    var currentOrders = filterByRange(allOrders, mtdStart, mtdEnd);
    var compareOrders = mode === 'last_year'
      ? filterByRange(allOrders, lastYearStart, lastYearEnd)
      : filterByRange(allOrders, lastMonthStart, lastMonthEnd);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        mode,
        debug: { totalOrdersWithPrice: allOrders.length, currentCount: currentOrders.length, compareCount: compareOrders.length },
        current: summarize(currentOrders),
        compare: summarize(compareOrders),
        labels: {
          current: 'Month to Date (' + fmtLabel(mtdStart) + ' – ' + fmtLabel(mtdEnd) + ')',
          compare: mode === 'last_year'
            ? 'Same Period Last Year (' + fmtLabel(lastYearStart) + ' – ' + fmtLabel(lastYearEnd) + ')'
            : 'Last Month (' + fmtLabel(lastMonthStart) + ' – ' + fmtLabel(lastMonthEnd) + ')'
        }
      })
    };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};