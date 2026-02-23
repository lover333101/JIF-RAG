# Jiff — Multi-Database RAG Assistant

A premium, real-time RAG (Retrieval-Augmented Generation) chat interface built with **Next.js 14+**, **Supabase**, and **Tailwind CSS v4**. Jiff connects to a private Python backend for grounded, evidence-backed answers with source citations and reliability tagging.

## Features

- **Real-time SSE streaming** — Token-by-token response rendering with thinking step indicators
- **Dual response modes** — Automatic routing between fast "light" and evidence-grounded "heavy" responses
- **Source citations** — Every factual claim is traced back to its source with `[Source #01]` labels
- **Reliability tagging** — Claims labeled as `[KB]` (evidence-backed) or `[Inference]` (reasoned)
- **Supabase Auth** — Google OAuth + email/password authentication
- **Conversation persistence** — Full chat history saved to Supabase Postgres
- **Daily quota system** — Per-user request limits with atomic quota tracking
- **Recovery on reload** — Interrupted requests are detected and resolved automatically
- **Rate limiting** — Backend-level protection against abuse
- **Premium UI** — Glassmorphism, smooth animations, dark mode, timeline-style thinking indicators

## Architecture

```
Browser ──► Next.js API Routes ──► Python RAG Backend
               │                        │
               ▼                        ▼
         Supabase (Auth,          Ollama + Pinecone
         Postgres, RLS)           (Embed, Retrieve, Generate)
```

- **Next.js** — Authenticated API gateway, SSE stream proxy, Supabase persistence
- **Python Backend** — RAG pipeline (Ollama embeddings, Pinecone retrieval, LLM generation)
- **Supabase** — Auth, conversations, messages, quotas, access control (RLS)

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

Run `supabase/schema.sql` in the Supabase SQL Editor, then apply all migrations in `supabase/migrations/`.

This creates:
- `conversations` / `messages` — Chat persistence with full markdown support
- `chat_generations` — Background task tracking for streaming and polling
- `daily_quota` — Per-user request limits with `consume_daily_quota(...)` (default 10/day)
- `user_index_access` — Per-user database access controls
- `access_requests` — Public access request form (with anon INSERT policy)
- Row Level Security (RLS) on all tables

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/           # POST (SSE stream + polling fallback)
│   │   │   └── status/     # GET (generation status polling)
│   │   ├── conversations/  # CRUD for chat sessions
│   │   └── request-access/ # Public access request form
│   └── (pages)/            # Login, chat, account pages
├── components/             # ChatArea, ChatBubble, Sidebar, etc.
├── lib/
│   ├── api.ts              # Client-side API (SSE consumer + polling)
│   ├── normalize.ts        # Shared data normalization
│   ├── format-answer.ts    # Answer formatting + citation extraction
│   └── server/             # Server-only utilities
│       ├── backend.ts      # Python backend HTTP helpers
│       ├── conversations.ts # Supabase CRUD
│       └── chat-generation-monitor.ts # Polling monitor (exponential backoff)
├── store/
│   └── AppContext.tsx       # Global state + streaming dispatch
└── types/
    └── chat.ts             # TypeScript domain types
```

## Security

- Browser only sees sanitized API responses — no raw backend data exposed
- Backend URL and internal secret stay server-side (never sent to client)
- All Supabase tables use Row Level Security
- Source file names and internal identifiers are never exposed to users
- Rate limiting on all generation endpoints

## License

Private — not for redistribution.
