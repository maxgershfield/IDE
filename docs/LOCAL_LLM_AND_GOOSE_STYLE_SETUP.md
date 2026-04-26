# Local LLM in OASIS IDE (OpenAI-compatible / “goose-style”)

This guide is the **canonical place** to return to for wiring a **local** large language model (e.g. [Ollama](https://ollama.com), LM Studio, vLLM) into OASIS IDE. It matches the industry pattern Block described for [codename goose](https://block.xyz/inside/block-open-source-introduces-codename-goose): **MCP** connects the agent to tools and data; the **LLM is pluggable**—cloud API or a server on your machine.

---

## What this will allow

| Capability | What you get |
|------------|----------------|
| **Privacy & control** | Prompts for the configured path can stay on **your machine** (or your LAN), instead of always going to a hosted frontier API. Policy and retention are yours to define for that hop. |
| **Cost & availability** | No per-token bill from OpenAI for that workload; works when you are **offline** from commercial APIs (subject to your local stack and any ONODE/OASIS calls you still make). |
| **Same IDE surfaces** | **Composer Chat** and, when the model is capable enough, **Composer Agent** (tool loop) can use the same UI—only the **inference backend** changes. |
| **OASIS MCP unchanged** | OASIS tools still come from the **MCP server** the IDE starts; you are not replacing MCP with goose. You are only swapping **who answers the LLM role** (local OpenAI-compatible server vs OpenAI/xAI/etc.). |
| **Experimentation** | Try different model weights/tags without changing IDE code—only DNA/env and, if needed, one line in the model catalog. |

**Limits to expect**

- **Agent mode** sends OpenAI-style **`tools`** to the model. Many **small** local models handle tool calling **poorly** compared to GPT-4-class models. If tools misfire, use **Chat** mode locally or a cloud model for Agent until you find a local model that behaves well enough.
- **ONODE** must be running if you route through `OASIS_API_URL`; local LLM does not remove the need for OASIS APIs you still call (auth, agents, health, etc.).
- **Quality & speed** depend entirely on your hardware and model choice.

---

## Prerequisites

- A running **OpenAI-compatible** HTTP API (most often **`POST …/v1/chat/completions`**). Examples: Ollama with OpenAI compatibility enabled, LM Studio local server, vLLM with OpenAI adapter.
- OASIS IDE configured to talk to **ONODE** (typical: `OASIS_API_URL`, see [SETUP.md](../SETUP.md)).

---

## Path A — ONODE + `OASIS_DNA.json` (recommended when using the full API)

Use this when chat/agent requests go through ONODE (`/api/ide/chat`, `/api/ide/agent/turn`).

**Hosted `https://api.oasisweb4.one`:** the ONODE that serves that URL must have an OpenAI key (or a compatible `BaseUrl`) in **its** environment or DNA. The IDE does not send your key to the server. Operators: set `OASIS_ONODE_OPENAI_API_KEY` or `OPENAI_API_KEY` in ECS (prefer Secrets Manager) as described in **`docker/DEPLOYMENT_UPDATE.md`** (section *OASIS IDE: OpenAI*), then redeploy the `oasis-api-service` task.

### Steps

1. **Start your local LLM server**  
   Example (Ollama): install Ollama, run `ollama serve`, and `ollama pull <model>` (e.g. `llama3.2`). Ollama exposes an OpenAI-compatible base URL such as `http://127.0.0.1:11434/v1`.

2. **Point ONODE at that base URL**  
   In `OASIS_DNA.json`, set:
   - **`OASIS.AI.OpenAI.BaseUrl`** = your server root, e.g. `http://127.0.0.1:11434/v1`  
   - **`OASIS.AI.OpenAI.ApiKey`** = optional for local: if `BaseUrl` is **not** `https://api.openai.com/v1`, ONODE will use an internal placeholder for the `Authorization` header when the key is omitted. For **real OpenAI**, you must set a valid API key.

3. **Set the model id**  
   - **`OASIS.AI.OpenAI.Model`** = the model name your server expects (e.g. `llama3.2`), **or**  
   - Pick the same id in the IDE model dropdown if it appears there.

4. **Restart ONODE** so DNA changes load.

5. **IDE model dropdown**  
   The list is defined in `src/renderer/constants/ideChatModels.ts`. If your local tag is not listed, add an entry, for example:

   ```ts
   { id: 'llama3.2', label: 'Ollama — llama3.2', provider: 'openai' },
   ```

   Use `provider: 'openai'` so routing uses the OpenAI-compatible chat path.

6. **Verify**  
   Open Composer, send a short message, confirm the status line shows ONODE / agent routing as expected and you get a reply from the local server.

---

## Path B — Electron main only (`ChatService`, fallback “Local LLM”)

Use this when ONODE chat is unavailable but the IDE still has **main-process** keys set.

### Steps

1. Before `npm run dev`, export (or put in your shell profile / `.env` loader if you use one):

   ```bash
   export OPENAI_BASE_URL=http://127.0.0.1:11434/v1
   export OPENAI_API_KEY=ollama
   ```

   `OPENAI_API_KEY` can be any **non-empty** placeholder for many local servers; the important part is `OPENAI_BASE_URL` pointing at your OpenAI-compatible root.

2. Optionally set **`OPENAI_CHAT_MODEL`** to default model id.

3. Start the IDE. Chat fallback may show as **Local LLM** in the Composer toolbar when routing uses this path.

---

## Composer Chat vs Composer Agent

| Mode | Backend (typical) | Local LLM note |
|------|-------------------|----------------|
| **Chat** | Text completion; simpler | Usually **fine** with local models for Q&A and editing suggestions (within model quality). |
| **Agent** | `POST /api/ide/agent/turn` with **tools** (`read_file`, `list_directory`, …) | Requires a model that **reliably** emits `tool_calls`. Test locally; fall back to cloud for Agent if needed. |

---

## Reference

- Block announcement (agent framework + MCP + pluggable LLM): [Block Open Source introduces “codename goose”](https://block.xyz/inside/block-open-source-introduces-codename-goose)
- ONODE implementation detail: `OpenAiCompatibleDnaHelper.cs`, `IdeChatController.cs`, `IdeAgentController.cs` under `ONODE/.../Controllers/`
- General IDE setup: [SETUP.md](../SETUP.md)

---

*Last aligned with repo behaviour as of April 2026. If ONODE or IDE routing changes, update this file in the same PR.*
