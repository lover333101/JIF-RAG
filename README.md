# JIF RAG (Next.js Frontend)

This app uses:
- Supabase Auth (Google OAuth + email/password)
- Supabase Postgres for conversations/messages/quota
- Next.js API routes as the authenticated gateway
- Separate Python RAG server behind `BACKEND_API_URL`

## Environment

Copy `.env.example` to `.env.local` and set values:

```bash
BACKEND_API_URL=http://localhost:8000
BACKEND_INTERNAL_SECRET=match-python-server-secret
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Database Setup

Run `supabase/schema.sql` in Supabase SQL Editor.

That creates:
- conversations/messages persistence
- per-user DB access controls (RLS)
- daily quota tables
- atomic `consume_daily_quota(...)` function (default 10/day)

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Security Note

Browser only sees sanitized API responses from this app.
Real backend URL and internal secret stay server-side.
