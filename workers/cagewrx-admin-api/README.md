# cagewrx-admin-api

Version-controlled backup of the `cagewrx-admin-api` Cloudflare Worker
(deployed at `https://cagewrx-admin-api.sales-8e3.workers.dev`). Like
`cagewrx-shopify-briefing-sync`, this lives outside `public/` so it isn't
part of the site build, and is backed up here because the Worker itself
has no Git integration - the Cloudflare dashboard's Quick Edit view is
the only live copy of its source otherwise.

## What it does

A thin proxy around Supabase's Admin API, holding the `SUPABASE_SERVICE_KEY`
server-side so the front-end (which only ever ships the public anon key)
can perform privileged user-management actions it otherwise couldn't:

- `create_user` - creates an auth user + profile row, defaults to a temp
  password and `must_change_password: true`
- `reset_password` - sets a user's password (defaults to `cagewrx123!`)
  and marks `must_change_password: true`, so the forced-password-change
  modal (see `public/js/auth.js`) picks it up on their next login
- `delete_user` - removes an auth user
- `update_role` - sets a profile's role
- `get_profile` / `get_all_profiles` / `debug` - read helpers

Called from `public/js/docs.js` (Admin Panel's Users tab) via plain
`fetch()` POSTs with `{ action, ...params }` - no auth header required on
the request itself, since the Worker's own service key is what carries
the actual privilege. Treat this Worker's URL as sensitive: anyone who
can reach it can create/delete/reset users.

## Deploying a change

No `wrangler deploy` pipeline connected - to ship a change:

1. Edit `src/index.js` here.
2. Cloudflare dashboard → the Worker → **Edit code** (Quick Edit).
3. Replace the contents with the updated file and deploy.
4. Copy the deployed version back into this file so the backup stays current.

## Required environment (Cloudflare Worker Settings → Variables and Secrets)

- `SUPABASE_SERVICE_KEY` - the Supabase project's `service_role` key.
  **Never** expose this key client-side or commit it anywhere - it
  bypasses all Row Level Security.
