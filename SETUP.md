# OASIS IDE Setup Guide

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (https://nodejs.org/)
- **npm** or **yarn**
- **Git**

### Installation

1. **Navigate to project directory:**
   ```bash
   cd OASIS-IDE
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build OASIS MCP Server (only if you use local MCP):** By default the IDE uses **hosted** MCP (`https://mcp.oasisweb4.one/mcp`). For a local stdio server, set `OASIS_MCP_TRANSPORT=stdio`, then:
   ```bash
   cd ../MCP
   npm install
   npm run build
   cd ../OASIS-IDE
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```

This will:
- Start Electron main process (watching for changes)
- Start Vite dev server on http://localhost:3000
- Open OASIS IDE window

## 📁 Project Structure

```
OASIS-IDE/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Main entry point
│   │   ├── preload.ts     # Preload script
│   │   └── services/     # Backend services
│   │       ├── MCPServerManager.ts
│   │       ├── OASISAPIClient.ts
│   │       └── AgentRuntime.ts
│   ├── renderer/          # React frontend
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── styles/       # CSS files
│   │   ├── App.tsx        # Main app component
│   │   └── main.tsx       # React entry point
│   └── shared/            # Shared types/utils (to be added)
├── dist/                  # Build output
└── package.json
```

## 🔧 Development

### Running in Development Mode

```bash
npm run dev
```

- Main process auto-reloads on changes
- Renderer hot-reloads via Vite
- DevTools open automatically

### Building for Production

```bash
npm run build
```

Builds both main and renderer processes to `dist/`.

### Packaging

```bash
# Package for current platform
npm run package

# Package for specific platform
npm run package:mac
npm run package:win
npm run package:linux
```

## 🔗 Integration Points

### OASIS MCP Server

**Default:** connects to **hosted** MCP via Streamable HTTP (`OASIS_MCP_REMOTE_URL`, default `https://mcp.oasisweb4.one/mcp`). After login, your JWT is sent to MCP.

**Local:** set `OASIS_MCP_TRANSPORT=stdio` and ensure the built entry exists (monorepo default: `../MCP/dist/src/index.js`), or set `OASIS_MCP_SERVER_PATH`.

### OASIS API

Default API URL: `http://127.0.0.1:5003`

Set via environment variable:
```bash
export OASIS_API_URL=http://your-oasis-api-url

# Local MCP only (stdio):
# export OASIS_MCP_TRANSPORT=stdio
# export OASIS_MCP_SERVER_PATH=/path/to/MCP/dist/src/index.js
```

**Default IDE Assistant agent:** Chat can use the OASIS IDE Assistant agent (Phase 1 backend). The agent ID defaults to `oasis-ide-assistant`. When the platform registers the agent with a different ID, set:
```bash
export OASIS_IDE_ASSISTANT_AGENT_ID=<your-agent-guid>
```

### STAR CLI (`run_star_cli` agent tool)

The IDE Agent can call STAR CLI commands directly via the `run_star_cli` tool. This requires a built `star` binary accessible at startup.

#### 1. Build the STAR CLI from the monorepo

```bash
# From the repo root
dotnet publish "STAR ODK/NextGenSoftware.OASIS.STAR.CLI" \
  -c Release \
  -r osx-arm64 \
  --self-contained true \
  -o ./dist/star-cli
```

Platform targets: `osx-arm64`, `osx-x64`, `linux-x64`, `win-x64`.

The output folder `dist/star-cli/` contains the `star` binary alongside the required `DNA/` and `DNATemplates/` directories.

#### 2. Make the binary available

**Option A — Add to PATH:**
```bash
export PATH="$PATH:/path/to/OASIS_CLEAN/dist/star-cli"
```

**Option B — Set `STAR_CLI_PATH` (recommended for monorepo dev):**
```bash
export STAR_CLI_PATH=/path/to/OASIS_CLEAN/dist/star-cli/star
```

Add to your shell profile or a `.env` file in `OASIS-IDE/`. The IDE reads `STAR_CLI_PATH` before falling back to `star` on PATH.

#### 3. Verify

Start the IDE — the console will log:
```
[Main] STAR CLI found: /path/to/star (0.0.1)
```

Or call the IPC status handler from the renderer:
```ts
const status = await window.electronAPI.starCliStatus();
// { found: true, path: '/path/to/star', version: '0.0.1' }
```

If `found: false`, the IDE Agent will still start but `run_star_cli` tool calls will return an error.

#### 4. Agent recipes

Documented non-interactive command recipes live in `docs/recipes/`. The IDE Agent uses these to scaffold OAPPs, create holons, run Light generation, and manage quests without hallucinating flags.

### Local LLM (OpenAI-compatible)

Full steps, **what it enables**, and Chat vs Agent notes: **[docs/LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md](./docs/LOCAL_LLM_AND_GOOSE_STYLE_SETUP.md)**.

### Running from an external repo

If the IDE lives in a **separate repo** (e.g. for collaboration), it can still use OASIS:

- **OASIS API**: Set `OASIS_API_URL` to your OASIS API (local `http://127.0.0.1:5003`, staging, or production). All auth, chat, agents, and health go over HTTP.
- **OASIS MCP**: Default is hosted (no path). For stdio, set `OASIS_MCP_TRANSPORT=stdio` and `OASIS_MCP_SERVER_PATH` to `.../MCP/dist/src/index.js`, or install `@oasis-unified/mcp-server` when published and point the path at its entry.

No other monorepo code is required; the IDE has no workspace package dependencies.

## 🐛 Troubleshooting

### MCP Server Not Starting

1. If using **hosted** (default): check network and `OASIS_MCP_REMOTE_URL`; ensure login so JWT is sent if tools require auth.
2. If using **stdio**: confirm the entry file exists (`../MCP/dist/src/index.js` or `OASIS_MCP_SERVER_PATH`) and run `cd ../MCP && npm run build`.
3. Check the main process console for `[MCP]` errors.

### OASIS API Connection Issues

1. Verify OASIS API is running
2. Check API URL in `OASISAPIClient.ts`
3. Test with: `curl http://127.0.0.1:5003/api/health`

### Build Errors

1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear build: `rm -rf dist && npm run build`
3. Check Node.js version: `node --version` (should be 18+)

## 📚 Next Steps

1. **Review Briefs:**
   - Master Brief: `/Docs/OASIS_IDE_MASTER_BRIEF.md`
   - Component Briefs: `/Docs/OASIS_IDE_BRIEF_*.md`

2. **Start Development:**
   - Pick a component from the briefs
   - Implement following the specifications
   - Test and iterate

3. **Integration:**
   - Ensure components work together
   - Test MCP tool execution
   - Test agent invocation

## 🎯 Current Status

✅ **Foundation Complete:**
- Project structure
- Electron setup
- React setup
- Basic layout
- MCP integration skeleton
- Agent system skeleton

🚧 **In Progress:**
- Component implementations
- AI assistant integration
- OASIS development tools

📋 **Planned:**
- Full feature implementation
- Testing
- Documentation
- Packaging

---

*Happy coding! 🚀*
