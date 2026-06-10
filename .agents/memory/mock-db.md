---
name: Mock DB architecture
description: How the localStorage-backed mock database works in web preview mode
---

All data in web mode (no Tauri) flows through `src/services/mockDb.ts`.

**Why:** Previous implementation used static in-memory arrays reset on every load. New groups were never added to the conversations list, messages were lost on reload, and group member changes only updated local React state.

**How to apply:**
- `chatService.ts` is the only file that imports from mockDb
- `dbLoadConversations`, `dbAddConversation`, `dbUpdateConversation` manage the conv list (keyed by uid in localStorage)
- `dbGetMessages`, `dbAddMessage` manage messages (keyed by uid in localStorage, cached in memory within the session)
- `dbAddGroupMember`, `dbRemoveGroupMember`, `dbUpdateGroupMemberRole` manage group participants
- Never import mockDb functions directly from components — always go through chatService
