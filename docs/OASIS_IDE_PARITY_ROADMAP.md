# OASIS IDE — feature parity roadmap (reference IDE UX)

This document defines what **full parity with a modern AI-first IDE** means for **OASIS IDE** (Electron) + **ONODE** (API), and the phased plan to get there. It is the single source of truth for agent/tool work in this folder.

---

## What parity means

| Area | Reference IDE behavior (OASIS_IDE target) | Status in OASIS IDE |
|------|----------------------|---------------------|
| **Agent loop** | Model emits **tool calls** → client **executes** → **tool results** → model continues until stop or max rounds | **Planned** — see Phase 1. Today: one-shot LLM text via `/api/ide/chat`. |
| **Tools** | `read_file`, `list_dir`, `grep`, `run_terminal_cmd`, edits/diffs, optional web | **Started** — `AgentToolExecutor` (`read_file`, `list_directory`, `workspace_grep` / ripgrep); terminal/edits next. |
| **Context** | Workspace root, selections, `@` / folder attach, optional index | **Partial** — workspace + referenced paths from Explorer. |
| **Streaming** | Token stream + tool-call chunks | **Not started** |
| **Edit UX** | Preview diff, Keep / Undo | **Placeholder** in Composer UI |

Parity is achieved by a **reliable multi-turn tool protocol**, not by longer system prompts alone.

---

## Architecture (invariant)

```
Composer (renderer)
    ↔ POST /api/ide/agent/turn (ONODE) — LLM + tool schema; returns message OR tool_calls
    ↔ IPC agent:execute-tool (Electron main) — disk / shell / MCP; **never** arbitrary remote execution of user workspace on the server
```

**Rule:** Workspace-affecting tools run **only in the IDE** (or an explicitly trusted local agent). ONODE holds API keys and may proxy the **LLM**; it must not pretend to read local disk unless that is an explicit remote workspace feature.

---

## Phases

### Phase 1 — Tool-use protocol (highest value)

**Goal:** Replace single completion with a **state machine**:

1. Client sends `messages`, `workspaceRoot`, `referencedPaths`, `model`, `toolDefinitionsVersion`.
2. API returns `{ finishReason, content? }` OR `{ toolCalls: [{ id, name, arguments }] }`.
3. Renderer calls `agent:execute-tool` per call (or batch where safe).
4. Append `tool` results to history; call API again.
5. Stop on `stop` or **max rounds** (e.g. 15–25).

**ONODE:** New endpoint e.g. `POST /api/ide/agent/turn` using OpenAI/Anthropic/Gemini **native tools** APIs; map responses to a single internal DTO (`AgentTurnResponse` — see `src/shared/agentTurnTypes.ts`).

**IDE:** `ChatInterface` (or `useAgentLoop`) implements the loop; no special-case “preview” required once `ide_preview_static` is a registered tool (current preview shortcut can remain as UX sugar).

**Deliverables:**

- [x] `IdeAgentController` + `POST /api/ide/agent/turn` (OpenAI + Grok tools API; Claude/Gemini return 501)
- [x] `OASISAPIClient.agentTurn()` + IPC `chat:agent-turn` + preload `agentTurn`
- [x] Renderer: `runIdeAgentLoop` + Composer **Chat | Agent** mode (tools: `read_file`, `list_directory` via `AgentToolExecutor`)
- [ ] Cancellation / abort in-flight turn
- [ ] Provider adapters for Anthropic/Gemini tool formats (same DTO)

---

### Phase 2 — Tool catalog (core reference set)

Implement in `AgentToolExecutor` (main process), with **path guard** (all paths under `workspaceRoot`):

| Tool | Purpose |
|------|---------|
| `read_file` | Path + optional line range; size cap | **Done** (`AgentToolExecutor`) |
| `list_directory` | Shallow listing | **Done** (`AgentToolExecutor`) |
| `grep` / `rg` | `workspace_grep` spawns `rg` under a scoped path | **Done** (`workspace_grep` in `AgentToolExecutor` + ONODE tool schema) |
| `run_terminal_cmd` | One-shot `exec` with timeout + cwd (not interactive PTY) | [ ] |
| `write_file` / `apply_patch` | Controlled writes + UI preview | [ ] |
| `ide_preview_static` | Wrap existing `StaticPreviewService` | [ ] |
| `mcp_invoke` | Delegate to MCP with allowlist | [ ] |

**Security:** Normalize paths; reject `..` escape; optional confirmation for destructive shell patterns.

---

### Phase 3 — Context engine

- [ ] Editor selection + active file path in composer payload
- [ ] Optional `.oasiside/rules.md` or `.OASIS_IDE/rules.md` injected into system prompt (bounded size; see Composer loader)
- [ ] Optional lightweight index or `codebase_search` tool built on `rg` + `read_file`

---

### Phase 4 — Streaming

- [ ] SSE (or WebSocket) from ONODE for assistant tokens
- [ ] IDE renders stream; tool calls typically appear as a final block per step

---

### Phase 5 — Product polish

- [ ] Composer mode: **Chat** (no tools) vs **Agent** (tool loop)
- [ ] Retry / cancel step
- [ ] Telemetry hooks (optional, privacy-preserving)

---

## Code map (this repo)

| Location | Role |
|----------|------|
| `src/shared/agentTurnTypes.ts` | Shared DTOs for turns and tool results |
| `src/main/services/AgentToolExecutor.ts` | Executes tool names against workspace (expand here) |
| `src/main/index.ts` | IPC `agent:execute-tool`, `ide:preview-static`, … |
| `src/main/services/OASISAPIClient.ts` | Add `agentTurn` when ONODE ships |
| `src/renderer/components/Chat/ChatInterface.tsx` | Wire multi-turn loop |
| `ONODE/.../IdeChatController.cs` | Evolve or add `IdeAgentController` for tool-capable completions |

---

## Next implementation order (recommended)

1. **ONODE** `POST /api/ide/agent/turn` with OpenAI first (tools API), single internal response shape.
2. **IDE** `OASISAPIClient.agentTurn` + replace one-shot `chatWithAgent` in Agent mode only.
3. **Expand `AgentToolExecutor`:** `grep`, then one-shot terminal, then writes behind confirmation.
4. **Streaming** after the loop is stable.
5. **Remove ad-hoc preview heuristic** from Composer once `ide_preview_static` is a tool (optional).

---

## References

- Workspace policy for agents: repo root `AGENTS.md` (root cause, no fake fallbacks)
- Session handoff: `Docs/Devs/STAR_CLI_SessionHandoff.md` (if touching STAR/CLI)

---

*Last updated: 2026-04-17 — Renamed from legacy parity doc; Agent turn API + Composer Agent mode + tool loop; see `IdeAgentController.cs`, `ideAgentLoop.ts`, `ChatInterface.tsx`.*
