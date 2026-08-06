# cagewrx-shopify-briefing-sync

This is a version-controlled backup of the `cagewrx-shopify-briefing-sync`
Cloudflare Worker. It is **not** part of the CAGEWRX-OPS site build — this
folder lives outside `public/`, which is the only directory Netlify/Cloudflare
Pages actually publishes (see `netlify.toml` and the root `wrangler.toml`), so
nothing here is deployed automatically.

The Worker itself has no Git integration in Cloudflare (Settings → Build →
Git repository → "Connect" was never set up), which means its dashboard
Quick Edit view is the *only* live copy of its source. This backup exists so
a lost or accidentally-overwritten dashboard edit is recoverable.

## What it does

Runs on a Cloudflare Cron Trigger and:

1. Gets a Shopify Admin API access token via OAuth client-credentials.
2. Pulls current-month-to-date and previous-month-to-date order data, plus a
   trailing-30-day top-sellers list, and writes them to the Supabase table
   `briefing_report_cache` as `shopify_mtd` / `shopify_mtd_prev`. This feeds
   the Morning Briefing's Shopify widgets in the main app
   (`public/js/briefing.js`).
2. Pulls product variants at or below a low-stock threshold and writes them
   to the same table as `shopify_low_stock`. This feeds the "Low Stock
   (Shopify)" section on the Production page
   (`public/js/production.js` → `loadLowStock()`).

## Deploying a change

There's no `wrangler deploy` pipeline connected — to ship a change:

1. Edit `src/index.js` here (or wherever you're making the change).
2. Open the Worker in the Cloudflare dashboard → **Edit code** (Quick Edit).
3. Replace the contents with the updated file and deploy from there.
4. Copy the deployed version back into this file so the backup stays current.

## Required environment (Cloudflare Worker Settings → Variables and Secrets)

- `SHOPIFY_SHOP` — the shop's `*.myshopify.com` domain
- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — Shopify app credentials
  (client-credentials OAuth)
- `SUPABASE_URL` / `SUPABASE_KEY` — same Supabase project the main app uses
- `TEST_KEY` — shared secret for the manual-trigger endpoint
  (`GET /?key=<TEST_KEY>`)
- `LOW_STOCK_THRESHOLD` *(optional)* — inventory quantity at/below which a
  variant is considered low stock. Defaults to `5` if unset.

## Cron

Configured under the Worker's **Triggers** tab in the dashboard (not visible
in this backup since Cron Trigger config isn't part of the script source).
