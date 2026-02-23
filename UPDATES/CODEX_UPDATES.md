# Codex Updates Log

Last updated: 2026-02-23

## 1) Async Generation + Reload Recovery
- Added async chat generation flow so responses can complete even if user refreshes.
- Added server monitor to poll backend task status and persist final assistant response.
- Added client polling to wait for generation completion and recover pending responses.
- Added chat status API endpoint used by frontend for generation state.

Files:
- `src/app/api/chat/route.ts`
- `src/app/api/chat/status/route.ts`
- `src/lib/server/chat-generation-monitor.ts`
- `src/lib/server/conversations.ts`
- `src/lib/api.ts`
- `src/components/ChatArea.tsx`
- `src/lib/message-mappers.ts`

## 2) DB / Schema Work
- Added `chat_generations` model integration for `processing/completed/failed/expired` lifecycle.
- Added message persistence linkage to generation (`generation_id`) for idempotent completion.
- Added support for storing `matches` on messages.
- Updated Supabase SQL/migrations used by app-side generation tracking and hardening.

Files:
- `supabase/schema.sql`
- `supabase/migrations/20260223_004_chat_generations.sql`
- `supabase/migrations/20260222_002_strict_rls_policies.sql`
- `supabase/migrations/20260222_003_server_only_hardening.sql`

## 3) Heavy/Light Response Modes
- Implemented mode routing (`auto`, `light`, `heavy`) end-to-end.
- Added user mode selector in composer.
- Wired server and backend standalone routing decisions.
- Tuned light mode for faster responses via environment/config path already integrated.

Files:
- `src/components/Composer.tsx`
- `src/store/AppContext.tsx`
- `src/types/chat.ts`
- `src/app/api/chat/route.ts`
- `JIF RAG Server Standalone/api.py`
- `JIF RAG Server Standalone/ragbot/router.py`
- `JIF RAG Server Standalone/ragbot/chatbot.py`

## 4) Index Exposure Hardening (DevTools)
- Removed frontend index selection path from runtime behavior.
- Removed browser-facing index state/actions.
- Stopped exposing real index names via `/api/indexes`.
- Kept index control server-side only.

Files:
- `src/app/api/indexes/route.ts`
- `src/components/JiffWorkspace.tsx`
- `src/store/AppContext.tsx`
- `src/lib/api.ts`
- `src/types/chat.ts`

## 5) UI Control Simplification
- Removed `top_k` and `temperature` from user UI.
- Removed frontend state/actions for those controls.
- Frontend now sends only `question`, `session_id`, and `response_mode`.

Files:
- `src/components/Composer.tsx`
- `src/store/AppContext.tsx`
- `src/types/chat.ts`

## 6) Heavy Mode Thinking UX
- Heavy mode loading label now shows `Jiff is thinking` (instead of `Jiff is typing`).
- Added thinking animation variant for heavy mode.
- Added “View thinking model” panel with live reasoning stages.
- Thinking stages are streamed from backend task status and displayed during generation.

Files:
- `src/components/ChatBubble.tsx`
- `src/components/ChatArea.tsx`
- `src/lib/api.ts`
- `src/store/AppContext.tsx`
- `src/types/chat.ts`
- `src/app/api/chat/status/route.ts`
- `JIF RAG Server Standalone/api.py`
- `JIF RAG Server Standalone/ragbot/chatbot.py`

## 7) Fix for `Task not found` Errors
- Root cause: completed tasks were deleted on first `/chat/status/{task_id}` read, causing race between pollers.
- Fix: do not delete completed task immediately in backend standalone status endpoint.

File:
- `JIF RAG Server Standalone/api.py`

## 8) Build/Quality Checks Executed
- Frontend lint/build passed after each major batch of changes.
- Python compile check passed for updated standalone backend files.
