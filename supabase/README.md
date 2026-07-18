# Supabase Setup

This folder contains database migrations for the KentRadar MVP.

## Apply Migrations

Install the Supabase CLI, then run one of these flows.

For a linked remote Supabase project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For local development:

```bash
supabase init
supabase start
supabase db reset
```

The Stage 2 migration expects Supabase Auth roles and enables PostGIS in the `extensions` schema.
