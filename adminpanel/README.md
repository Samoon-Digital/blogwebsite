# Samoon Digital Admin Panel

Cloudflare Workers + D1 based admin panel for the blog system.

## What is already set up

- `wrangler`-based Cloudflare deployment
- D1 table for the first super admin user
- Signed cookie login session
- Login page and dashboard shell

## Initial credentials

- Admin ID: `samoondgital`
- Password: `Samoon@9696`

## Local setup

1. Install dependencies:
   `npm install`
2. Create a local D1 database and apply migrations:
   `npx wrangler d1 create samoondgital_admin`
   `npx wrangler d1 migrations apply ADMIN_DB --local`
3. Update `wrangler.toml` with the real D1 database ID.
4. Start the worker:
   `npm run dev`

## Production notes

- Replace `SESSION_SECRET` in `wrangler.toml` with a real secret before deploy.
- Later we can replace the placeholder dashboard with article CRUD, AI draft generation, and SEO tools.