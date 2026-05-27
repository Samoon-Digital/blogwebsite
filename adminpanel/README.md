# Samoon Digital Admin Panel

Cloudflare Workers + D1 based admin panel for the blog system.

## What is already set up

- `wrangler`-based Cloudflare deployment
- D1 table for the first super admin user
- Signed cookie login session
- Login page and dashboard shell

## Initial credentials

- Admin ID: `samoondigital`
- Password: `Samoon@9696`

## Local setup

1. Install dependencies:
   `npm install`
2. Create a local D1 database and apply migrations:
   `npx wrangler d1 create samoondgital_admin`
   `npx wrangler d1 migrations apply ADMIN_DB --local`
3. Add local secrets in `.dev.vars`:
   `OPENAI_API_KEY`, `OPENAI_TRACKING_ID`, `OPENAI_TEXT_MODEL=gpt-5.5`, `OPENAI_IMAGE_MODEL=gpt-image-2`
4. Update `wrangler.toml` with the real D1 database ID.
5. Start the worker:
   `npm run dev`

## Production notes

- Replace `SESSION_SECRET` in `wrangler.toml` with a real secret before deploy.
- Set `OPENAI_API_KEY` and `OPENAI_TRACKING_ID` as Cloudflare Worker secrets before deploy.
- Article generation, website scanning, GPT-5.5 blog writing, and GPT Image featured images are wired in.
