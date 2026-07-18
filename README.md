# KentRadar

Crowdsourced road issue map MVP. The first implementation stage sets up a Next.js, TypeScript, Tailwind CSS, and Supabase foundation.

## Recommended Stack

- Next.js App Router
- TypeScript with strict mode
- React
- Tailwind CSS
- Supabase Auth, PostgreSQL, and PostGIS-ready schema in later stages
- OpenStreetMap with Leaflet in the map stage

## Stage 1 Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Run the development server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Stage 1 Scope

This stage includes only the application foundation:

- Project configuration
- Tailwind design tokens
- Turkish UI labels for road issue categories, statuses, and severity
- Supabase client helpers
- Basic layout and home shell

Database migrations, map rendering, issue creation, duplicate detection, proximity verification, stats, and trust scoring are intentionally left for later stages.
