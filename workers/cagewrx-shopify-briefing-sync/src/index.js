var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var SHOPIFY_API_VERSION = "2026-07";
var LOW_STOCK_DEFAULT_THRESHOLD = 5;
var LOW_STOCK_MAX_ITEMS = 25;

function fmt(d) {
  return d.toISOString().slice(0, 10);
}
__name(fmt, "fmt");
function dateList(startDate, endDate) {
  const dates = [];
  const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  while (cur <= last) {
    dates.push(fmt(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}
__name(dateList, "dateList");
async function getShopifyAccessToken(env) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET
    }).toString()
  });
  if (!res.ok) {
    throw new Error("Shopify token request failed: " + res.status + " " + await res.text());
  }
  const data = await res.json();
  return data.access_token;
}
__name(getShopifyAccessToken, "getShopifyAccessToken");
async function fetchOrdersForRange(accessToken, env, startDate, endDate, topN) {
  const queryString = `created_at:>=${startDate.toISOString()} AND created_at:<=${endDate.toISOString()}`;
  const graphqlQuery = `
    query($cursor: String, $q: String!) {
      orders(first: 100, after: $cursor, query: $q) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            createdAt
            totalPriceSet { shopMoney { amount } }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  quantity
                  originalTotalSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    }
  `;
  let cursor = null;
  let hasNextPage = true;
  let orderCount = 0;
  let revenue = 0;
  const productRevenue = {};
  const productQuantity = {};
  const dailyRevenue = {};
  const dailyOrders = {};
  while (hasNextPage) {
    const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query: graphqlQuery, variables: { cursor, q: queryString } })
    });
    if (!res.ok) {
      throw new Error("Shopify GraphQL request failed: " + res.status + " " + await res.text());
    }
    const json = await res.json();
    if (json.errors) throw new Error("Shopify GraphQL errors: " + JSON.stringify(json.errors));
    const edges = json.data.orders.edges;
    orderCount += edges.length;
    edges.forEach(({ node }) => {
      const amt = parseFloat(node.totalPriceSet.shopMoney.amount || "0");
      revenue += amt;
      const day = node.createdAt.slice(0, 10);
      dailyRevenue[day] = (dailyRevenue[day] || 0) + amt;
      dailyOrders[day] = (dailyOrders[day] || 0) + 1;
      node.lineItems.edges.forEach(({ node: li }) => {
        const liAmt = parseFloat(li.originalTotalSet.shopMoney.amount || "0");
        productRevenue[li.title] = (productRevenue[li.title] || 0) + liAmt;
        productQuantity[li.title] = (productQuantity[li.title] || 0) + Number(li.quantity || 0);
      });
    });
    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    cursor = json.data.orders.pageInfo.endCursor;
  }
  const days = dateList(startDate, endDate);
  const dailySeries = { revenue: [], orders: [], aov: [] };
  days.forEach((day) => {
    const rev = Math.round((dailyRevenue[day] || 0) * 100) / 100;
    const ord = dailyOrders[day] || 0;
    dailySeries.revenue.push(rev);
    dailySeries.orders.push(ord);
    dailySeries.aov.push(ord ? Math.round(rev / ord * 100) / 100 : 0);
  });
  const topProducts = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, topN || 3).map(([title, rev]) => ({
    title,
    quantity: productQuantity[title] || 0,
    revenue: Math.round(rev * 100) / 100
  }));
  return {
    revenue: Math.round(revenue * 100) / 100,
    orders: orderCount,
    aov: orderCount ? Math.round(revenue / orderCount * 100) / 100 : 0,
    topProducts,
    dailySeries,
    periodStart: startDate.toISOString().slice(0, 10),
    periodEnd: endDate.toISOString().slice(0, 10)
  };
}
__name(fetchOrdersForRange, "fetchOrdersForRange");

// ---- Low stock (Shopify) ----
// Asks Shopify directly for variants at or below the threshold via the
// productVariants search query, same "query string" pattern the orders
// fetch above already uses. Sorted lowest-stock-first, capped so the
// Production page section doesn't get flooded on a large catalog.
async function fetchLowStockVariants(accessToken, env, threshold) {
  // No "query:" search filter here on purpose - Shopify's query-string search
  // (e.g. "inventory_quantity:<=N") runs against a search index that isn't
  // guaranteed to reflect live inventory counts, which was silently hiding
  // real low-stock tracked items while surfacing stale untracked ones.
  // Instead: page through every variant and filter on the actual field
  // values returned, which are always live.
  const graphqlQuery = `
    query($cursor: String) {
      productVariants(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            title
            sku
            inventoryQuantity
            inventoryItem {
              tracked
            }
            product {
              title
              legacyResourceId
              status
            }
          }
        }
      }
    }
  `;
  let cursor = null;
  let hasNextPage = true;
  const items = [];
  while (hasNextPage) {
    const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query: graphqlQuery, variables: { cursor } })
    });
    if (!res.ok) {
      throw new Error("Shopify GraphQL request failed: " + res.status + " " + await res.text());
    }
    const json = await res.json();
    if (json.errors) throw new Error("Shopify GraphQL errors: " + JSON.stringify(json.errors));
    const edges = json.data.productVariants.edges;
    edges.forEach(({ node }) => {
      // Skip variants with inventory tracking turned off - their available
      // count isn't meaningful (often wildly negative) and they shouldn't
      // show up as "low stock".
      if (!node.inventoryItem || !node.inventoryItem.tracked) return;
      // Skip anything not ACTIVE (draft/archived products aren't for sale,
      // so restocking them isn't relevant here).
      if (node.product.status !== "ACTIVE") return;
      // The actual low-stock check, done here against live field data
      // instead of Shopify's search index.
      if (node.inventoryQuantity == null || node.inventoryQuantity > threshold) return;
      items.push({
        title: node.product.title,
        variant: node.title !== "Default Title" ? node.title : null,
        sku: node.sku || null,
        available: node.inventoryQuantity,
        threshold,
        productAdminUrl: `https://${env.SHOPIFY_SHOP}/admin/products/${node.product.legacyResourceId}`
      });
    });
    hasNextPage = json.data.productVariants.pageInfo.hasNextPage;
    cursor = json.data.productVariants.pageInfo.endCursor;
  }
  items.sort((a, b) => a.available - b.available);
  return items.slice(0, LOW_STOCK_MAX_ITEMS);
}
__name(fetchLowStockVariants, "fetchLowStockVariants");

async function writeLowStockToSupabase(env, items) {
  const today = fmt(/* @__PURE__ */ new Date());
  const row = {
    report_type: "shopify_low_stock",
    period_start: today,
    period_end: today,
    payload: { items, count: items.length }
  };
  const res = await fetch(
    env.SUPABASE_URL + "/rest/v1/briefing_report_cache?on_conflict=report_type,period_start,period_end",
    {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": "Bearer " + env.SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([row])
    }
  );
  if (!res.ok) {
    throw new Error("Supabase write failed (shopify_low_stock): " + res.status + " " + await res.text());
  }
}
__name(writeLowStockToSupabase, "writeLowStockToSupabase");

function getCurrentMonthToDateRange(now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end: now };
}
__name(getCurrentMonthToDateRange, "getCurrentMonthToDateRange");
function getPreviousMonthToDateRange(now) {
  const currentDay = now.getUTCDate();
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  const cappedDay = Math.min(currentDay, prevMonthLastDay);
  const prevMonthEnd = new Date(Date.UTC(
    prevMonthStart.getUTCFullYear(),
    prevMonthStart.getUTCMonth(),
    cappedDay,
    23,
    59,
    59
  ));
  return { start: prevMonthStart, end: prevMonthEnd };
}
__name(getPreviousMonthToDateRange, "getPreviousMonthToDateRange");
async function writeToSupabase(env, reportType, summary) {
  const row = {
    report_type: reportType,
    period_start: summary.periodStart,
    period_end: summary.periodEnd,
    payload: {
      revenue: summary.revenue,
      orders: summary.orders,
      aov: summary.aov,
      topProducts: summary.topProducts,
      dailySeries: summary.dailySeries
    }
  };
  const res = await fetch(
    env.SUPABASE_URL + "/rest/v1/briefing_report_cache?on_conflict=report_type,period_start,period_end",
    {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": "Bearer " + env.SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([row])
    }
  );
  if (!res.ok) {
    throw new Error("Supabase write failed (" + reportType + "): " + res.status + " " + await res.text());
  }
}
__name(writeToSupabase, "writeToSupabase");
function getTrailing30DaysRange(now) {
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
  return { start, end: now };
}
__name(getTrailing30DaysRange, "getTrailing30DaysRange");
async function runShopifySync(env) {
  const accessToken = await getShopifyAccessToken(env);
  const now = /* @__PURE__ */ new Date();
  const current = getCurrentMonthToDateRange(now);
  const currentSummary = await fetchOrdersForRange(accessToken, env, current.start, current.end, 3);
  const trailing30 = getTrailing30DaysRange(now);
  const trailing30Summary = await fetchOrdersForRange(accessToken, env, trailing30.start, trailing30.end, 5);
  currentSummary.topProducts = trailing30Summary.topProducts;
  await writeToSupabase(env, "shopify_mtd", currentSummary);
  const previous = getPreviousMonthToDateRange(now);
  const previousSummary = await fetchOrdersForRange(accessToken, env, previous.start, previous.end, 3);
  await writeToSupabase(env, "shopify_mtd_prev", previousSummary);

  const threshold = env.LOW_STOCK_THRESHOLD ? Number(env.LOW_STOCK_THRESHOLD) : LOW_STOCK_DEFAULT_THRESHOLD;
  const lowStockItems = await fetchLowStockVariants(accessToken, env, threshold);
  await writeLowStockToSupabase(env, lowStockItems);

  return { current: currentSummary, previous: previousSummary, lowStock: lowStockItems };
}
__name(runShopifySync, "runShopifySync");
var index_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runShopifySync(env));
  },
  // Manual trigger for testing: GET /?key=<TEST_KEY>
  // Set a TEST_KEY secret so this endpoint isn't wide open.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("key") !== env.TEST_KEY) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const result = await runShopifySync(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  }
};
export {
  index_default as default
};
