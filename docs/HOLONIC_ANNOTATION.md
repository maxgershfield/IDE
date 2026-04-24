# Holonic Workspace Annotation

## The problem with file trees

Every AI coding assistant starts a session blind. It knows the language, the frameworks, the conventions — but not *your* project. So before it can do anything useful, it has to explore: list directories, read README files, search for patterns, cross-reference configurations. Each of those steps is a round-trip to a tool. Each round-trip costs time and consumes context window. By the time the model has assembled a working picture of your codebase, it has often already used a third of its available context on discovery overhead.

This is true even in Cursor, even in the best AI editors available today. The model sees a file tree. The file tree has names. Names carry some signal — `quests/`, `nft/`, `avatar/` — but they carry no *meaning*. The model has to infer everything from scratch, every session.

OASIS has something no other platform has: a semantic layer that already knows what every folder is *for*.

---

## What holonic annotation does

The OASIS holonic architecture assigns every component of an application a permanent, typed identity. A quest system is not just a directory called `quests/` — it is a **QuestHolon** with an id, a type, a STARNET publish status, and a semantic role in the application graph. An NFT drop is not just `nft/` — it is a **Web4NFT** holon with install counts, versioning, and cross-project linkage.

Holonic annotation takes those identities — already loaded in the IDE from STARNET, from `.star-workspace.json`, from the catalog snapshot — and *overlays* them onto the workspace file tree before the model ever sees it.

The result is a context pack section that looks like this:

```
## Workspace: MyQuestApp/ (OAPP `3f2a1b…`)
Engine: hyperfy  ·  STARNET network: testnet
Pre-read by IDE — no list_directory needed for the root.

### Selected holons (3 declared in .star-workspace.json)
| id           | name                     | type          | STARNET                  |
|---|---|---|---|
| `abc123…`    | Quest Manager Template   | OAPPTemplate  | ✓ STARNET, 42 installs   |
| `def456…`    | NFT Drop Holon           | Web4NFT       | ✓ STARNET                |
| `ghi789…`    | Social Avatar Holon      | Avatar        | local                    |

### Probable directory → holon mapping
| directory  | implements                               |
|---|---|
| `quests/`  | Quest Manager Template [OAPPTemplate]    |
| `nft/`     | NFT Drop Holon [Web4NFT]                 |
| `avatar/`  | Social Avatar Holon [Avatar]             |

### File tree
src/
  quests/   ← Quest Manager Template [OAPPTemplate]
  nft/      ← NFT Drop Holon [Web4NFT]
  avatar/   ← Social Avatar Holon [Avatar]
  components/
  …
```

Instead of a list of names, the model receives a map of *intentions*.

---

## Why this matters

### 1. Discovery overhead collapses

Without holonic annotation, the Build Plan flow works like this:

1. User says "build me a quest app with NFT rewards"
2. Agent calls `list_directory` on workspace root
3. Agent calls `list_directory` on each subdirectory of interest
4. Agent calls `star_list_holons` to fetch the STARNET catalog
5. Agent calls `star_get_holon` on 3–4 ids to inspect their details
6. Agent cross-references catalog against user intent and writes a plan

That is 6–10 tool calls before a single line of planning has been written. In a 25-round agent loop, this is a meaningful fraction of the available budget.

With holonic annotation, steps 2–5 are already answered in the context pack. The agent reads the block, sees the holon map, and writes the plan directly. Discovery collapses from 6–10 tool calls to 0.

### 2. The model knows the *semantic* structure, not just the physical one

A file called `src/quests/manager.ts` tells the model almost nothing without reading it. A holonic annotation tells the model:

- This file lives inside the **QuestHolon** subtree
- That holon has been downloaded from STARNET 42 times — it is a well-established component
- The holon type is `OAPPTemplate`, meaning it is a reusable building block, not a one-off
- It is published on STARNET, meaning changes here have cross-project implications

This is the difference between syntax and semantics. The file tree tells you *what exists*. The holonic layer tells you *what it means*.

### 3. Gap detection becomes automatic

When the model sees the declared holons alongside the file tree, it can immediately identify mismatches. If `.star-workspace.json` declares three holons but only two directories have annotations, the model flags the gap without being asked. "You declared a `SocialAvatarHolon` but I don't see a directory that implements it — should I scaffold `src/avatar/`?"

This is not a feature that requires extra prompting. It falls out naturally from presenting both the intent (holons) and the reality (file tree) in the same context block.

### 4. Cross-session continuity

File trees change constantly. Files are added, renamed, moved. A model that learned the project layout from a previous session may be working from stale memory.

Holon ids do not change. The `QuestHolon` that was `abc123` on Monday is still `abc123` on Friday, regardless of how the source files were reorganized. The holonic annotation gives the model a stable semantic anchor that persists across workspace changes, refactors, and team contributions.

### 5. STARNET publish status as a guardrail

The annotation includes whether each holon is published on STARNET. This is actionable context:

- A **published holon** means the agent should treat the interface as stable and avoid breaking changes without an explicit version bump
- An **unpublished holon** means the code is local and the agent has full freedom to restructure
- A holon with **high install counts** signals that changes ripple across the ecosystem — extra caution is warranted

Without holonic annotation, the model has no way to know any of this without calling `star_get_holon` explicitly.

---

## How it works technically

The annotation is built entirely from data that is already loaded in the IDE at the time the user sends their first message. There are three sources:

**Source 1 — `.star-workspace.json`**
The project config file declares `selectedStarnetHolonIds`: the list of STARNET holons this project uses. It also carries the OAPP id, project name, game engine, and STARNET network environment.

**Source 2 — STARNET catalog snapshot**
When the user opens the STARNET panel or logs in, the IDE fetches the full catalog of holons and OAPPs for their avatar. This snapshot is held in `StarnetCatalogContext`. It includes names, types, STARNET visibility flags, and install counts for every holon.

**Source 3 — WorkspaceContext file tree**
The OS file tree is already loaded into `WorkspaceContext.tree` the moment a folder is opened in the IDE.

The `buildHolonAnnotatedWorkspaceNote` utility cross-references all three:

1. For each id in `selectedStarnetHolonIds`, look it up in the catalog to resolve name, type, and status.
2. Build a keyword map: strip common suffixes (`Holon`, `Template`, `Manager`) from holon names and types, producing normalized keywords like `quest`, `nft`, `avatar`.
3. Walk the file tree. For each directory whose name matches a keyword, attach a holonic annotation inline.
4. Emit the structured markdown block.

**Zero API calls are made.** The entire operation is a pure in-memory cross-reference that executes in microseconds on each Composer send.

---

## The deeper principle

What holonic annotation demonstrates is a general principle about AI-assisted development: **the value of an AI agent is proportional to the semantic richness of the context it starts with**.

Most AI editors give agents a file tree. A file tree is a syntax. It says what files exist and how they are organized, but it says nothing about why. The agent must reconstruct the semantics from the syntax — reading files, following imports, inferring purpose from naming conventions.

OASIS inverts this. The holonic architecture is a semantic layer that exists independently of the file system. Every component has an identity, a type, a place in the application graph, and a status in the distributed STARNET registry. The file system is an *implementation detail* of the holon graph, not the other way around.

When an IDE understands this, it can present the agent with meaning rather than structure. And an agent that starts with meaning does not need to spend its context budget on discovery. It can spend that budget on building.

---

## Current implementation scope

The current implementation covers the most valuable cases with zero additional latency:

| Feature | Implemented |
|---|---|
| OAPP identity header (name, id, project id) | ✓ |
| Project metadata (engine, type, network) | ✓ |
| Selected holon table (id, name, type, STARNET status) | ✓ |
| OAPP identity cross-reference (publish status, installs) | ✓ |
| Directory → holon heuristic mapping table | ✓ |
| Inline file tree annotations | ✓ |
| Graceful fallback when no config or catalog | ✓ |
| Re-evaluation on catalog refresh or workspace switch | ✓ |

### Possible future extensions

- **Per-file holon mapping**: If holons declare their source paths (e.g. via `metaData.sourcePath`), individual files could carry holon annotations, not just directories.
- **Child holon tree**: OAPPs expose zomes, and zomes contain nested holons. Rendering the holon subtree alongside the file subtree would give the agent a full semantic graph, not just a flat list.
- **Gap detection as a first-class signal**: Surface undeclared holons and unimplemented declarations as explicit warnings in the context pack, making gap detection automatic for every agent turn.
- **Versioned holon diff**: When `selectedStarnetHolonIds` changes (user adds a holon), inject a diff note into the context pack so the agent knows what changed since the last session.
- **Multi-parent holon graph**: The OASIS holonic model supports multiple parent holons (`ParentHolonIds`). Rendering cross-project dependencies as a visible graph in the annotation would allow the agent to reason about ecosystem-wide impact before making changes.

---

## Summary

| Without holonic annotation | With holonic annotation |
|---|---|
| Agent sees a list of filenames | Agent sees semantic intentions |
| 6–10 tool calls to discover project structure | 0 tool calls for discovery |
| Model infers purpose from naming conventions | Model reads explicit type + status |
| No awareness of STARNET publish implications | Publish status visible before first edit |
| Gap detection requires explicit prompting | Gaps are visible from context alone |
| Context budget spent on exploration | Context budget spent on building |

The file tree tells you where things are. The holonic layer tells you what they are for. Combining them gives the agent the fastest possible start — and that speed compounds across every session, every user, every project built on OASIS.
