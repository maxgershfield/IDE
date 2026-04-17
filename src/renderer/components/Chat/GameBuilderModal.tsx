import React, { useState, useCallback, useRef } from 'react';

// ─── Field & builder registry types ────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'repeatable' | 'imageGenerate';

interface SelectOption {
  value: string;
  label: string;
}

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
  default?: string | number | boolean;
  /** Sub-fields for repeatable rows */
  subFields?: Omit<FieldDef, 'subFields'>[];
  /** Small helper text shown below the field */
  hint?: string;
}

interface BuilderDef {
  id: string;
  title: string;
  /** Which OASIS system is the primary target */
  oasisLayer: string;
  description: string;
  fields: FieldDef[];
  buildMessage: (values: Record<string, unknown>) => string;
}

// ─── Builder definitions ────────────────────────────────────────────────────

const BUILDERS: BuilderDef[] = [
  {
    id: 'quest',
    title: 'New Quest',
    oasisLayer: 'STARNET',
    description:
      'Register a new quest on STARNET with objectives tracked across games. The agent will call star_create_quest and write the result to quests/.',
    fields: [
      { key: 'name', label: 'Quest name', type: 'text', placeholder: 'The Fallen Citadel', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A brief summary of what the player must do and why it matters.', required: true },
      {
        key: 'gameSource', label: 'Game source', type: 'select', required: true,
        options: [
          { value: 'OurWorld', label: 'Our World' },
          { value: 'ODOOM', label: 'ODOOM' },
          { value: 'OQuake', label: 'OQuake' },
          { value: 'Custom', label: 'Custom' }
        ],
        default: 'OurWorld'
      },
      {
        key: 'objectives', label: 'Objectives', type: 'repeatable',
        hint: 'Add at least one objective. The agent will link them in sequence.',
        subFields: [
          { key: 'name', label: 'Objective name', type: 'text', placeholder: 'Defeat the boss', required: true },
          {
            key: 'type', label: 'Type', type: 'select',
            options: [
              { value: 'KillMonsters', label: 'Kill / defeat' },
              { value: 'CollectItems', label: 'Collect items' },
              { value: 'VisitLocation', label: 'Visit location' },
              { value: 'TalkToNPC', label: 'Talk to NPC' },
              { value: 'Custom', label: 'Custom' }
            ],
            default: 'KillMonsters'
          },
          { key: 'targetCount', label: 'Target count', type: 'number', default: '1', placeholder: '1' }
        ]
      }
    ],
    buildMessage: (v) => {
      const objectives = (v.objectives as Array<Record<string, string>> || []);
      const objLines = objectives.map((o, i) =>
        `  ${i + 1}. "${o.name}" — type: ${o.type}, count: ${o.targetCount || 1}`
      ).join('\n');
      return `Create a new quest on STARNET with the following details:

Name: ${v.name}
Description: ${v.description}
Game source: ${v.gameSource}
Objectives:
${objLines || '  (none specified — ask me to add objectives)'}

Steps:
1. Call star_create_quest with the name, description, and game source.
2. For each objective, call star_create_quest_objective (or equivalent) linking it to the quest.
3. Write the quest ID and all objective IDs to quests/${String(v.name).toLowerCase().replace(/\s+/g, '-')}.json.
4. Confirm the quest is live on STARNET.`;
    }
  },

  {
    id: 'npc',
    title: 'New NPC',
    oasisLayer: 'Holon',
    description:
      'Create an NPC as a persistent holon on the OASIS graph. The agent will call star_create_npc and write the record to npcs/.',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Mira Vasquez', required: true },
      {
        key: 'role', label: 'Role', type: 'select', required: true,
        options: [
          { value: 'Quest Giver', label: 'Quest giver' },
          { value: 'Merchant', label: 'Merchant' },
          { value: 'Enemy', label: 'Enemy' },
          { value: 'Companion', label: 'Companion' },
          { value: 'Guard', label: 'Guard' },
          { value: 'Informant', label: 'Informant' },
          { value: 'Custom', label: 'Custom' }
        ],
        default: 'Quest Giver'
      },
      { key: 'faction', label: 'Faction', type: 'text', placeholder: 'The Iron Council', required: true },
      { key: 'personality', label: 'Personality traits', type: 'textarea', placeholder: 'Cynical but loyal. Speaks in short sentences. Distrusts outsiders.', required: true },
      { key: 'backstory', label: 'Backstory (optional)', type: 'textarea', placeholder: 'Former soldier turned spy. Lost their family in the siege of…' },
      { key: 'needsVoice', label: 'Assign ElevenLabs voice agent', type: 'boolean', default: false, hint: 'Requires ELEVENLABS_API_KEY in your environment.' }
    ],
    buildMessage: (v) => {
      const voiceLine = v.needsVoice
        ? `\n\nAfter creating the NPC holon, call elevenlabs_list_voices, pick the most appropriate voice for the personality description, and call elevenlabs_create_agent. Save the returned agent_id inside npcs/${String(v.name).toLowerCase().replace(/\s+/g, '-')}.json.`
        : '';
      return `Create a new NPC character on OASIS with the following details:

Name: ${v.name}
Role: ${v.role}
Faction: ${v.faction}
Personality: ${v.personality}${v.backstory ? `\nBackstory: ${v.backstory}` : ''}

Steps:
1. Call star_create_npc with name, role, faction, and personality.
2. Write the NPC holon ID, name, faction, and personality to npcs/${String(v.name).toLowerCase().replace(/\s+/g, '-')}.json.${voiceLine}
3. Confirm the NPC is registered on STARNET.`;
    }
  },

  {
    id: 'missionArc',
    title: 'Mission Arc',
    oasisLayer: 'STARNET',
    description:
      'Design a multi-mission story arc and register each mission on STARNET. The agent will call star_create_mission for each entry and link them in sequence.',
    fields: [
      { key: 'arcName', label: 'Arc name', type: 'text', placeholder: 'The Shadow War', required: true },
      { key: 'faction', label: 'Faction', type: 'text', placeholder: 'The Iron Council', required: true },
      { key: 'protagonist', label: 'Protagonist', type: 'text', placeholder: 'Player character or named hero', required: true },
      { key: 'antagonist', label: 'Antagonist', type: 'text', placeholder: 'Director Holt', required: true },
      { key: 'finalReward', label: 'Final reward', type: 'text', placeholder: 'Legendary weapon NFT + faction title', required: true },
      { key: 'missionCount', label: 'Number of missions', type: 'number', default: '5', required: true },
      { key: 'tone', label: 'Tone', type: 'select',
        options: [
          { value: 'Gritty', label: 'Gritty' },
          { value: 'Epic', label: 'Epic' },
          { value: 'Comedic', label: 'Comedic' },
          { value: 'Mysterious', label: 'Mysterious' },
          { value: 'Tragic', label: 'Tragic' }
        ],
        default: 'Gritty'
      }
    ],
    buildMessage: (v) =>
      `Design and register a ${v.missionCount}-mission story arc with the following details:

Arc name: ${v.arcName}
Faction: ${v.faction}
Protagonist: ${v.protagonist}
Antagonist: ${v.antagonist}
Final reward: ${v.finalReward}
Tone: ${v.tone}

Steps:
1. Write a brief narrative outline for each of the ${v.missionCount} missions — escalating stakes, culminating in a confrontation with ${v.antagonist}.
2. Call star_create_mission for each mission in sequence.
3. Write all mission IDs and their narrative summaries to missions/${String(v.arcName).toLowerCase().replace(/\s+/g, '-')}-arc.json.
4. The final mission should trigger the reward: ${v.finalReward}.`
  },

  {
    id: 'npcVoice',
    title: 'NPC Voice',
    oasisLayer: 'ElevenLabs',
    description:
      'Assign an ElevenLabs voice agent to an NPC. The agent will call elevenlabs_list_voices, let you pick, then call elevenlabs_create_agent.',
    fields: [
      { key: 'npcName', label: 'NPC name', type: 'text', placeholder: 'Mira Vasquez', required: true },
      { key: 'personality', label: 'Personality description', type: 'textarea', placeholder: 'Cynical, clipped speech, low trust. Sounds like they have seen too much.', required: true },
      {
        key: 'voiceStyle', label: 'Preferred voice style', type: 'select',
        options: [
          { value: 'Professional', label: 'Professional' },
          { value: 'Friendly', label: 'Friendly' },
          { value: 'Mysterious', label: 'Mysterious' },
          { value: 'Gruff', label: 'Gruff' },
          { value: 'Noble', label: 'Noble' },
          { value: 'Young', label: 'Young' },
          { value: 'Elderly', label: 'Elderly' }
        ],
        default: 'Professional'
      },
      { key: 'firstLine', label: 'Sample dialogue line (optional)', type: 'text', placeholder: 'You should not be here. Turn back before it is too late.', hint: 'Used to preview the voice before committing.' }
    ],
    buildMessage: (v) =>
      `Set up an ElevenLabs voice agent for NPC "${v.npcName}":

Personality: ${v.personality}
Preferred style: ${v.voiceStyle}${v.firstLine ? `\nSample line: "${v.firstLine}"` : ''}

Steps:
1. Call elevenlabs_list_voices and find the best match for the personality and style above.
2. If a sample line was provided, call elevenlabs_tts_preview with that line so I can hear it.
3. Call elevenlabs_create_agent with the NPC name and personality description.
4. Save the returned agent_id to npcs/${String(v.npcName).toLowerCase().replace(/\s+/g, '-')}.json alongside any existing NPC data.`
  },

  {
    id: 'mintItem',
    title: 'Mint Item',
    oasisLayer: 'NFT',
    description:
      'Mint a cross-game inventory item as an NFT on OASIS. The agent will call oasis_workflow_mint_nft and save the result.',
    fields: [
      { key: 'name', label: 'Item name', type: 'text', placeholder: 'Serpent Blade', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A blade forged from the scales of the last sea serpent. Deals bonus damage underwater.', required: true },
      {
        key: 'rarity', label: 'Rarity', type: 'select', required: true,
        options: [
          { value: 'Common', label: 'Common' },
          { value: 'Uncommon', label: 'Uncommon' },
          { value: 'Rare', label: 'Rare' },
          { value: 'Epic', label: 'Epic' },
          { value: 'Legendary', label: 'Legendary' }
        ],
        default: 'Rare'
      },
      {
        key: 'chain', label: 'Chain', type: 'select', required: true,
        options: [
          { value: 'solana', label: 'Solana' },
          { value: 'ethereum', label: 'Ethereum' },
          { value: 'base', label: 'Base' }
        ],
        default: 'solana'
      },
      { key: 'imageUrl', label: 'Item Image', type: 'imageGenerate', hint: 'Generate art with AI or paste a URL.' },
      { key: 'game', label: 'Game', type: 'text', placeholder: 'OurWorld', required: true }
    ],
    buildMessage: (v) =>
      `Mint a new cross-game inventory item as an NFT on OASIS:

Item name: ${v.name}
Description: ${v.description}
Rarity: ${v.rarity}
Game: ${v.game}
Chain: ${v.chain}${v.imageUrl ? `\nImage URL: ${v.imageUrl}` : ''}

Steps:
1. Call oasis_workflow_mint_nft with name, description, chain "${v.chain}", and image URL (generate a placeholder if none provided).
2. Write the returned token ID, contract address, and explorer link to items/${String(v.name).toLowerCase().replace(/\s+/g, '-')}.json.
3. Tag the NFT metadata with rarity: ${v.rarity} and game: ${v.game}.`
  },

  {
    id: 'dialogueTree',
    title: 'Dialogue Tree',
    oasisLayer: 'JSON + Holon',
    description:
      'Generate a branching dialogue tree for an NPC and write it to the workspace. The agent will also save a root holon reference.',
    fields: [
      { key: 'npcName', label: 'NPC name', type: 'text', placeholder: 'Mira Vasquez', required: true },
      { key: 'role', label: 'NPC role in story', type: 'text', placeholder: 'Informant who knows where the weapon is hidden', required: true },
      { key: 'topic1', label: 'Topic 1', type: 'text', placeholder: 'The location of the weapon', required: true },
      { key: 'topic2', label: 'Topic 2', type: 'text', placeholder: 'Their history with the faction', required: true },
      { key: 'topic3', label: 'Topic 3', type: 'text', placeholder: 'How to earn their trust', required: true },
      {
        key: 'depth', label: 'Branch depth', type: 'select',
        options: [
          { value: '2', label: 'Shallow (2 levels)' },
          { value: '3', label: 'Medium (3 levels)' },
          { value: '4', label: 'Deep (4 levels)' }
        ],
        default: '3',
        hint: 'Deeper trees have more responses per topic but take longer to generate.'
      }
    ],
    buildMessage: (v) =>
      `Generate a branching dialogue tree for NPC "${v.npcName}":

Role: ${v.role}
Topics:
  1. ${v.topic1}
  2. ${v.topic2}
  3. ${v.topic3}
Branch depth: ${v.depth} levels

Output format: JSON with structure { "greeting": string, "topics": [{ "id", "prompt", "responses": [{ "text", "next": topic_id | "end" }] }] }

Steps:
1. Generate the full branching tree in the format above.
2. Write it to npcs/${String(v.npcName).toLowerCase().replace(/\s+/g, '-')}-dialogue.json.
3. Call oasis_save_holon to persist a reference holon with npcName and the file path.`
  },

  {
    id: 'lore',
    title: 'Generate Lore',
    oasisLayer: 'Workspace',
    description:
      'Write a lore bible for your game world. The agent will produce structured markdown and write it to lore/lore-bible.md.',
    fields: [
      { key: 'worldName', label: 'World name', type: 'text', placeholder: 'The Shattered Reaches', required: true },
      {
        key: 'setting', label: 'Setting', type: 'select', required: true,
        options: [
          { value: 'Modern City', label: 'Modern city' },
          { value: 'Fantasy Kingdom', label: 'Fantasy kingdom' },
          { value: 'Sci-Fi Colony', label: 'Sci-fi colony' },
          { value: 'Post-Apocalyptic', label: 'Post-apocalyptic' },
          { value: 'Cyberpunk', label: 'Cyberpunk' },
          { value: 'Pirate / Maritime', label: 'Pirate / maritime' }
        ],
        default: 'Fantasy Kingdom'
      },
      { key: 'factionCount', label: 'Number of factions', type: 'number', default: '3', required: true },
      {
        key: 'tone', label: 'Tone', type: 'select',
        options: [
          { value: 'Gritty', label: 'Gritty' },
          { value: 'Epic', label: 'Epic' },
          { value: 'Comedic', label: 'Comedic' },
          { value: 'Mysterious', label: 'Mysterious' },
          { value: 'Dark', label: 'Dark' }
        ],
        default: 'Gritty'
      },
      { key: 'existingLore', label: 'Existing lore to build on (optional)', type: 'textarea', placeholder: 'The world was shattered by a war between two gods…' }
    ],
    buildMessage: (v) =>
      `Write a lore bible for my game world:

World name: ${v.worldName}
Setting: ${v.setting}
Tone: ${v.tone}
Factions: ${v.factionCount}${v.existingLore ? `\nExisting lore: ${v.existingLore}` : ''}

Structure the lore bible with these sections:
- World overview (2–3 paragraphs)
- History and key events (timeline with at least 5 entries)
- ${v.factionCount} factions (each with: name, ideology, leadership, home territory, relationship to others)
- Geography (key locations with brief descriptions)
- Tone and writing guide (for future contributors)

Write the completed lore bible to lore/lore-bible.md.`
  },

  {
    id: 'geoHotspot',
    title: 'GeoHotSpot',
    oasisLayer: 'GeoNFT',
    description:
      'Anchor a real-world location to an OASIS quest using a GeoNFT. The agent will call star_place_geonft.',
    fields: [
      { key: 'locationName', label: 'Location name', type: 'text', placeholder: 'The Old Lighthouse', required: true },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A derelict lighthouse on the northern coast. Players who visit in real life unlock the hidden cache quest.', required: true },
      { key: 'lat', label: 'Latitude', type: 'text', placeholder: '51.5074', hint: 'Decimal degrees. Leave blank if you want the agent to look it up from the description.' },
      { key: 'lng', label: 'Longitude', type: 'text', placeholder: '-0.1278' },
      { key: 'linkedQuest', label: 'Linked quest name or ID', type: 'text', placeholder: 'the-fallen-citadel', required: true },
      { key: 'triggerRadius', label: 'Trigger radius (metres)', type: 'number', default: '50', hint: 'Player must be within this distance to activate.' }
    ],
    buildMessage: (v) => {
      const coords = v.lat && v.lng
        ? `Coordinates: ${v.lat}, ${v.lng}`
        : `No coordinates given — look up approximate coordinates for: "${v.description}"`;
      return `Create a GeoHotSpot on OASIS:

Location: ${v.locationName}
Description: ${v.description}
${coords}
Trigger radius: ${v.triggerRadius || 50}m
Linked quest: ${v.linkedQuest}

Steps:
1. If coordinates are missing, determine best-guess lat/long from the description.
2. Call star_place_geonft with location name, coordinates, trigger radius, and linked quest ID.
3. Write the GeoNFT ID and coordinates to geohotspots/${String(v.locationName).toLowerCase().replace(/\s+/g, '-')}.json.`;
    }
  }
];

const BUILDER_MAP: Record<string, BuilderDef> = Object.fromEntries(BUILDERS.map((b) => [b.id, b]));

// ─── Field renderer ─────────────────────────────────────────────────────────

interface RepeatableRow {
  id: string;
  values: Record<string, string>;
}

function RepeatableField({
  field,
  rows,
  onChange
}: {
  field: FieldDef;
  rows: RepeatableRow[];
  onChange: (rows: RepeatableRow[]) => void;
}) {
  const addRow = () =>
    onChange([
      ...rows,
      {
        id: `row-${Date.now()}`,
        values: Object.fromEntries((field.subFields || []).map((sf) => [sf.key, String(sf.default ?? '')]))
      }
    ]);

  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));

  const updateRow = (id: string, key: string, value: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r)));

  return (
    <div className="gb-repeatable">
      {rows.map((row, idx) => (
        <div key={row.id} className="gb-repeatable-row">
          <span className="gb-repeatable-index">{idx + 1}</span>
          <div className="gb-repeatable-fields">
            {(field.subFields || []).map((sf) =>
              sf.type === 'select' ? (
                <select
                  key={sf.key}
                  className="gb-select"
                  value={row.values[sf.key] || String(sf.default || '')}
                  onChange={(e) => updateRow(row.id, sf.key, e.target.value)}
                >
                  {sf.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  key={sf.key}
                  type={sf.type === 'number' ? 'number' : 'text'}
                  className="gb-input"
                  placeholder={sf.placeholder || sf.label}
                  value={row.values[sf.key] || ''}
                  onChange={(e) => updateRow(row.id, sf.key, e.target.value)}
                />
              )
            )}
          </div>
          <button
            type="button"
            className="gb-repeatable-remove"
            onClick={() => removeRow(row.id)}
            aria-label="Remove row"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="gb-repeatable-add" onClick={addRow}>
        + Add {field.label.replace(/s$/, '').toLowerCase()}
      </button>
      {field.hint && <p className="gb-hint">{field.hint}</p>}
    </div>
  );
}

// ─── Image generate field ────────────────────────────────────────────────────

export function ImageGenerateField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [refDataUrl, setRefDataUrl] = useState<string | null>(null);
  const [refFileName, setRefFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    abortRef.current = false;

    const api = (window as any).electronAPI;
    if (!api?.glifGenerateImage) {
      setError('Image generation not available in this environment.');
      setLoading(false);
      return;
    }

    const result = await api.glifGenerateImage(
      prompt.trim(),
      refDataUrl ?? undefined
    ) as { ok: boolean; imageUrl?: string; error?: string };

    if (abortRef.current) return;
    setLoading(false);

    if (!result.ok || !result.imageUrl) {
      setError(result.error ?? 'Generation failed');
      return;
    }

    setGeneratedUrl(result.imageUrl);
    onChange(result.imageUrl);
  };

  const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setRefDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearRef = () => {
    setRefDataUrl(null);
    setRefFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualUrl = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (generatedUrl) setGeneratedUrl(null);
  };

  return (
    <div className="gb-img-gen">

      {/* ── AI Generation section ── */}
      <div className="gb-img-gen-section-label">Generate with AI</div>

      {/* Reference image upload */}
      <div className="gb-img-gen-ref-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="gb-img-gen-file-input"
          id="gb-img-gen-ref-file"
          onChange={handleRefFileChange}
        />
        {refDataUrl ? (
          <div className="gb-img-gen-ref-preview">
            <img src={refDataUrl} alt="Reference" className="gb-img-gen-ref-thumb" />
            <div className="gb-img-gen-ref-info">
              <span className="gb-img-gen-ref-name">{refFileName}</span>
              <button type="button" className="gb-img-gen-ref-clear" onClick={clearRef}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label htmlFor="gb-img-gen-ref-file" className="gb-img-gen-ref-upload-btn">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.75.75 0 0 1 .75.75V7h5.25a.75.75 0 0 1 0 1.5H8.75v5.25a.75.75 0 0 1-1.5 0V8.5H2a.75.75 0 0 1 0-1.5h5.25V1.75A.75.75 0 0 1 8 1Z"/>
            </svg>
            Upload reference image
          </label>
        )}
      </div>

      {/* Prompt + Generate button */}
      <div className="gb-img-gen-prompt-row">
        <input
          type="text"
          className="gb-input gb-img-gen-prompt-input"
          placeholder={refDataUrl ? 'Describe how to use the reference…' : 'Describe the image, e.g. a glowing serpent blade…'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGenerate(); } }}
          disabled={loading}
        />
        <button
          type="button"
          className={`gb-btn gb-img-gen-btn${loading ? ' is-loading' : ''}`}
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
        >
          {loading ? <><span className="gb-img-gen-spinner" /> Generating…</> : '✦ Generate'}
        </button>
      </div>

      {/* Error */}
      {error && <p className="gb-img-gen-error">{error}</p>}

      {/* Generated image preview */}
      {generatedUrl && (
        <div className="gb-img-gen-result">
          <div className="gb-img-gen-result-header">
            <span className="gb-img-gen-result-label">Generated image</span>
            <button
              type="button"
              className="gb-img-gen-regen"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          <img src={generatedUrl} alt="Generated NFT art" className="gb-img-gen-img" />
          <p className="gb-img-gen-result-note">This image will be used as the NFT artwork.</p>
        </div>
      )}

      {/* ── Manual URL fallback ── */}
      <div className="gb-img-gen-divider">
        <span>or</span>
      </div>
      <div className="gb-img-gen-manual-row">
        <span className="gb-img-gen-or">Paste image URL</span>
        <input
          type="text"
          className="gb-input gb-img-gen-url-input"
          placeholder="https://…"
          value={generatedUrl ? '' : value}
          onChange={handleManualUrl}
        />
      </div>

      {hint && <p className="gb-hint">{hint}</p>}
    </div>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

export interface GameBuilderModalProps {
  builderId: string | null;
  onClose: () => void;
  /** Called with the final structured message; the parent should auto-send it. */
  onSubmit: (message: string) => void;
}

export const GameBuilderModal: React.FC<GameBuilderModalProps> = ({
  builderId,
  onClose,
  onSubmit
}) => {
  const builder = builderId ? BUILDER_MAP[builderId] : null;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [repeatableRows, setRepeatableRows] = useState<Record<string, RepeatableRow[]>>({});

  // Reset when builder changes
  const prevBuilderId = React.useRef<string | null>(null);
  if (prevBuilderId.current !== builderId) {
    prevBuilderId.current = builderId;
    // Reset in next tick to avoid render-during-render
  }

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = () => {
    if (!builder) return;
    // Merge regular values + repeatable rows into a single object
    const merged: Record<string, unknown> = { ...values };
    for (const field of builder.fields) {
      if (field.type === 'repeatable') {
        merged[field.key] = (repeatableRows[field.key] || []).map((r) => r.values);
      }
    }
    // Fill defaults for untouched fields
    for (const field of builder.fields) {
      if (field.type !== 'repeatable' && merged[field.key] === undefined && field.default !== undefined) {
        merged[field.key] = field.default;
      }
    }
    onSubmit(builder.buildMessage(merged));
  };

  if (!builder) return null;

  return (
    <div className="gb-overlay" role="dialog" aria-modal aria-label={builder.title}>
      {/* Header */}
      <div className="gb-header">
        <div className="gb-header-left">
          <span className="gb-layer-badge">{builder.oasisLayer}</span>
          <h2 className="gb-title">{builder.title}</h2>
        </div>
        <button type="button" className="gb-close" onClick={onClose} aria-label="Close builder">
          ×
        </button>
      </div>

      <p className="gb-description">{builder.description}</p>

      {/* Fields */}
      <div className="gb-fields">
        {builder.fields.map((field) => (
          <div key={field.key} className="gb-field">
            <label className="gb-label" htmlFor={`gb-${field.key}`}>
              {field.label}
              {field.required && <span className="gb-required">*</span>}
            </label>

            {field.type === 'repeatable' ? (
              <RepeatableField
                field={field}
                rows={repeatableRows[field.key] || []}
                onChange={(rows) => setRepeatableRows((prev) => ({ ...prev, [field.key]: rows }))}
              />
            ) : field.type === 'imageGenerate' ? (
              <ImageGenerateField
                value={String(values[field.key] ?? '')}
                onChange={(url) => setValue(field.key, url)}
                hint={field.hint}
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={`gb-${field.key}`}
                className="gb-textarea"
                placeholder={field.placeholder}
                rows={3}
                value={String(values[field.key] ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                id={`gb-${field.key}`}
                className="gb-select"
                value={String(values[field.key] ?? field.default ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              >
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : field.type === 'boolean' ? (
              <label className="gb-toggle-label">
                <div className="gb-toggle-track">
                  <input
                    type="checkbox"
                    className="gb-toggle-input"
                    checked={Boolean(values[field.key] ?? field.default ?? false)}
                    onChange={(e) => setValue(field.key, e.target.checked)}
                  />
                  <div className={`gb-toggle-thumb${Boolean(values[field.key] ?? field.default) ? ' is-on' : ''}`} />
                </div>
                {field.hint && <span className="gb-toggle-hint">{field.hint}</span>}
              </label>
            ) : (
              <input
                id={`gb-${field.key}`}
                type={field.type === 'number' ? 'number' : 'text'}
                className="gb-input"
                placeholder={field.placeholder}
                value={String(values[field.key] ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}

            {field.type !== 'repeatable' && field.type !== 'imageGenerate' && field.hint && (
              <p className="gb-hint">{field.hint}</p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="gb-footer">
        <button type="button" className="gb-btn gb-btn--cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="gb-btn gb-btn--submit" onClick={handleSubmit}>
          Create with Agent
        </button>
      </div>
    </div>
  );
};

export { BUILDERS };
