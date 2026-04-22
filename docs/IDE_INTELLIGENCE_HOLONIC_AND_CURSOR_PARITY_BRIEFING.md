# OASIS IDE: intelligence, Cursor parity, and holonic leverage (briefing)

**Date:** April 22, 2026  
**Audience:** IDE + ONODE + platform engineers  
**Purpose:** Single briefing that merges (1) Cursor-style “smarter IDE” gaps, (2) high-impact product/engineering actions, and (3) how OASIS holonic architecture can differentiate context, memory, and planning beyond generic RAG.

---

## 1. Executive summary

Modern AI IDEs feel “smart” mainly because they combine **reliable tool loops**, **retrieval over the repo**, **persistent instructions** (rules, `AGENTS.md`), and **session context** that is assembled with intent, not because the base model is different.

OASIS IDE already ships a strong **domain context pack** (`src/shared/agentContextPack.ts`), **Agent mode** with a multi-turn tool protocol, **project memory**, **workspace rules**, STARNET catalog injection, and optional **semantic search** over files. Gaps versus Cursor-class products are concentrated in **rule surface area**, **automatic instruction loading**, **retrieval UX**, **streaming/cancel polish**, and **structured long-term memory** (including holon-backed options).

Holonic architecture adds a **native** way to model IDE context as a **graph** (workspace → session → decisions → verified tool outcomes) with stable GUIDs and multi-runtime access, instead of one flat markdown blob.

---

## 2. What “memory” and “intelligence” mean here

| Layer | Meaning | Cursor (reference) | OASIS IDE (baseline) |
|--------|---------|--------------------|----------------------|
| **Prompt memory** | Text injected every turn | Project + user + team rules; `AGENTS.md` | `agentContextPack` + `.oasiside` / `.OASIS_IDE` rules + project memory |
| **Retrieval memory** | Chunks selected per task | Codebase index + grep hybrid | `workspace_grep`, `codebase_search`, optional `semantic_search` (embeddings + cache) |
| **Thread memory** | Prior turns + tool outputs | Long context + compaction | `buildAgentPriorMessagesFromThread` with clamps; holon thread sync (partial) |
| **Durable / org memory** | Across sessions and clients | Memories (cloud), team rules | Project memory text + conversation holon; holon graph not yet first-class for every turn |

Models do not retain chat across sessions. **Persistence must be explicit** (files, holons, indexed summaries).

---

## 3. Cursor parity themes (from product research)

1. **Rules breadth:** Multiple files, globs, “always” vs “intelligent” vs manual `@rule`, nested `AGENTS.md` with nearer-wins semantics ([Cursor rules docs](https://cursor.com/docs/context/memories)).
2. **Codebase index:** Always-on embedding index with refresh semantics ([codebase indexing](https://cursor.com/docs/context/codebase-indexing)).
3. **Agent as default path:** Chat is fine for Q&A; repo work expects tools + retrieval.
4. **Streaming and cancel:** Expected polish for multi-step agent UX.
5. **Memories:** Dynamic recall across sessions (often distinct from static rules; deployment and privacy are product decisions).

---

## 4. Holonic architecture: leverage for a smarter IDE

**Holon** (OASIS): identity-first unit, typed, nested under parents, metadata-rich, multi-provider. See `STAR_Templates/docs/HOLONS_OVERVIEW.md`, `Docs/holons/HOLONIC_ARCHITECTURE_OVERVIEW.md`, and `Docs/holons/CHAT_MEMORY_HOLONIC_INTEROPERABILITY.md`.

**Why it matters for the IDE**

- **Scoped graphs:** Context can be assembled from a **subtree** (workspace → feature → build plan) instead of dumping the whole repo or one giant note.
- **Stable references:** Decisions, invariants, and “last verified build” can point to holon ids and versions, improving trust and handoff to SERV / A2A agents (`Docs/holons/AGENT_INTEROPERABILITY_HOLONIC_ARCHITECTURE.md`).
- **Interoperability:** Same conversation or memory parent can be loaded from ONODE, another client, or automation: same id, same shape.
- **Composition:** STARNET **component holons** are already the intended unit for “what to build” (`docs/COMPONENT_HOLONS_BRIEF.md`, build plan + diagram flows).

**Caveat:** Avoid holon-per-keystroke. Prefer **summaries**, **batch writes**, and **bounded** graph walks for latency.

---

## 5. Task backlog (merged and prioritized)

### Tier A: IDE-local, high leverage (shipped or partially shipped in this repo)

| ID | Task | Rationale | Status |
|----|------|-----------|--------|
| **A1** | Default **Agent** when a workspace is open; persist mode in `localStorage` | Reduces “Chat has no tools” confusion | **Existing:** default is `agent` when no stored mode (`ComposerSessionPanel.tsx`). |
| **A2** | When **Chat** + folder open, show a **short dismissible hint** | Guides users without forcing mode | **Shipped:** `ComposerSessionPanel.tsx` + `ChatInterface.css` (`oasis-ide-dismiss-chat-workspace-hint`) |
| **A3** | Auto-load **root + nested `AGENTS.md`** along the path from workspace root to the **active editor file**; inject into `contextPack` with “nearer wins” note | Cursor parity for project instructions | **Shipped:** `src/renderer/utils/ideAgentInstructions.ts` |
| **A4** | Auto-load **`.cursor/rules/**/*.md` and `.mdc`** (bounded size; strip simple YAML frontmatter on `.mdc`) | Teams migrating from Cursor keep working instructions | **Shipped:** same module |
| **A5** | Document this briefing + link from parity roadmap | Single source of truth | **Shipped:** this file + `OASIS_IDE_PARITY_ROADMAP.md` |

### Tier B: ONODE / API / larger scope

| ID | Task | Rationale |
|----|------|-----------|
| **B1** | SSE (or WebSocket) streaming for assistant tokens | Perceived latency and trust |
| **B2** | Harden **cancel / abort** for every in-flight turn | Agent polish |
| **B3** | Anthropic / Gemini **tool adapters** in `IdeAgentController` | Model choice without losing tools |
| **B4** | Background **semantic index** job + “index ready” UX | Near-Cursor retrieval defaults |

### Tier C: Holon-native intelligence (platform)

| ID | Task | Rationale |
|----|------|-----------|
| **C1** | **Conversation + message (or turn-summary) holons** as parent/child | Cross-client chat, less truncation pain (`Docs/holons/CHAT_MEMORY_HOLONIC_INTEROPERABILITY.md`) |
| **C2** | **Workspace IDE context holon** (rules hashes, build plan id, pinned catalog ids) | Auditable, scoped context assembly |
| **C3** | **Memory event** children under avatar or workspace (verified facts from tools) | Shared with SERV agents |
| **C4** | Retrieve context by **graph walk + embeddings on holon summaries** | OASIS-specific “smarter than grep” |

### Tier D: Thread budget and “memories lite”

| ID | Task | Rationale |
|----|------|-----------|
| **D1** | Rolling **summary holon** or project-memory append when thread exceeds budget | Fewer silent truncations |
| **D2** | Optional **vector store of memory bullets** per workspace (local-first) | Cursor Memories–like recall without cloud |

---

## 6. Implementation notes (A3–A4)

- **Bounds:** Total auto-loaded instruction block capped (order of tens of thousands of characters) so ONODE `MaxContextPackChars` is respected alongside `agentContextPack`.
- **Ordering:** Emit `AGENTS.md` sections **root → subdirectory → nearest to active file**; instruction line: *if sections conflict, the path closest to the active editor file wins.*
- **`.cursor/rules`:** Best-effort; missing folder is non-fatal. Large monorepos: cap file count and bytes per file.
- **Privacy:** Loading is local disk via Electron; only what gets into `contextPack` is sent to the user’s configured model path (ONODE or local).

---

## 7. References (in-repo)

- Parity phases: `docs/OASIS_IDE_PARITY_ROADMAP.md`
- Agent pack: `src/shared/agentContextPack.ts`
- Agent loop + prior messages: `src/renderer/services/ideAgentLoop.ts`
- Composer: `src/renderer/components/Chat/ComposerSessionPanel.tsx`
- Holons overview: `STAR_Templates/docs/HOLONS_OVERVIEW.md`
- Chat memory holonic analysis: `Docs/holons/CHAT_MEMORY_HOLONIC_INTEROPERABILITY.md`
- Component holons brief: `docs/COMPONENT_HOLONS_BRIEF.md`

---

*This document supersedes ad-hoc notes for “Cursor parity + holonic IDE” planning until explicitly replaced.*
