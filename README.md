# AudioList

AudioList is a React app for helping people make confident audio buying decisions without information overload.

- Mission: help anyone buy great-sounding gear through objective measurement-driven guidance.
- Tagline: Audio can be easy.
- Full mission and priorities: see `MISSION.md`.

## Core Product Promise

- Keep the default UX simple and decision-first.
- Show advanced measurement detail only when users ask for it.
- Rank products by objective measurements, not affiliate payouts.
- Answer fast: what to buy, how much to pay, and where to buy.

## Launch Categories

- IEM
- Headphones
- DAC/Amp

## Scoring

- User-facing score uses letter bands from `S+` to `F`.
- Numeric scores remain internal for sorting, filtering, and calculations.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Supabase (PostgreSQL)

## Commands

- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Preview: `npm run preview`

Data/admin scripts:

- Sync products: `npm run sync:products`
- Sync store catalogs: `npm run sync:stores`
- Sync prices: `npm run sync:prices`
- Admin server: `npm run admin`

## Operations (Private Beta)

- Scheduled data pipelines run from `.github/workflows/`.
- Required repo secrets for sync jobs:
  - `SUPABASE_SERVICE_KEY`
  - `BESTBUY_API_KEY`
  - `ALIEXPRESS_APP_KEY`
  - `ALIEXPRESS_APP_SECRET`
  - `ALIEXPRESS_TRACKING_ID`
- CI workflow (`.github/workflows/ci.yml`) enforces `eslint src` + `build` on pushes/PRs to `main` and `dev`.

If workflows fail in a few seconds with no executed steps, check GitHub Actions runner availability and account billing/minutes before debugging code.
