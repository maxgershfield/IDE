import React, { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { ElevenLabsVoice, CreatedNPCAgent } from '../../../shared/elevenLabsTypes';
import './NPCVoicePanel.css';

const NPC_STORAGE_KEY = 'oasis-npc-agents';
const PREVIEW_TEXT = "Hello, traveller. What brings you here?";

const NPC_ROLES = [
  'Shop Owner',
  'Gang Leader',
  'Quest Giver',
  'Taxi Driver',
  'Guard',
  'Merchant',
  'Informant',
  'Rebel',
  'Custom',
] as const;

// ─── ApiKeyBanner ─────────────────────────────────────────────────────────────

const ApiKeyBanner: React.FC = () => (
  <div className="npc-banner npc-banner-warn">
    <span className="npc-banner-icon">⚠</span>
    <span>
      <strong>ELEVENLABS_API_KEY</strong> not set. Add it to your{' '}
      <code>.env</code> and restart the IDE to use NPC Voice Studio.
    </span>
  </div>
);

// ─── VoiceCard ────────────────────────────────────────────────────────────────

const VoiceCard: React.FC<{
  voice: ElevenLabsVoice;
  selected: boolean;
  onSelect: () => void;
}> = ({ voice, selected, onSelect }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      const result = await window.electronAPI.elevenlabsTts(voice.voice_id, PREVIEW_TEXT);
      if (!result.ok) { setPlaying(false); return; }
      const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const accent = voice.labels?.accent ?? voice.labels?.['accent'];
  const gender = voice.labels?.gender ?? voice.labels?.['gender'];

  return (
    <div
      className={`npc-voice-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      role="option"
      aria-selected={selected}
    >
      <div className="npc-voice-card-name">{voice.name}</div>
      {(accent || gender) && (
        <div className="npc-voice-card-tags">
          {gender && <span className="npc-voice-tag">{gender}</span>}
          {accent && <span className="npc-voice-tag">{accent}</span>}
        </div>
      )}
      <button
        type="button"
        className={`npc-play-btn${playing ? ' playing' : ''}`}
        onClick={handlePlay}
        title={playing ? 'Stop preview' : 'Play preview'}
      >
        {playing ? '■' : '▶'}
      </button>
    </div>
  );
};

// ─── CreatedAgentRow ──────────────────────────────────────────────────────────

const CreatedAgentRow: React.FC<{
  agent: CreatedNPCAgent;
  onRemove: () => void;
  onLinkToQuest: () => void;
}> = ({ agent, onRemove, onLinkToQuest }) => (
  <div className="npc-agent-row">
    <div className="npc-agent-row-info">
      <strong>{agent.npcName}</strong>
      <span className="npc-agent-row-meta">{agent.role} · {agent.voiceName}</span>
      <span className="npc-agent-id" title="ElevenLabs agent ID">{agent.agentId.slice(0, 16)}…</span>
    </div>
    <div className="npc-agent-row-actions">
      <button type="button" className="npc-btn npc-btn-sm" onClick={onLinkToQuest} title="Link to STAR quest">
        Link Quest
      </button>
      <button type="button" className="npc-btn npc-btn-sm npc-btn-danger" onClick={onRemove} title="Remove NPC">
        ✕
      </button>
    </div>
  </div>
);

// ─── NPCVoicePanel ────────────────────────────────────────────────────────────

export const NPCVoicePanel: React.FC = () => {
  const { workspacePath } = useWorkspace();

  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');

  const [npcName, setNpcName] = useState('');
  const [npcRole, setNpcRole] = useState<string>(NPC_ROLES[0]);
  const [npcCustomRole, setNpcCustomRole] = useState('');
  const [npcPersonality, setNpcPersonality] = useState('');
  const [npcFaction, setNpcFaction] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [agents, setAgents] = useState<CreatedNPCAgent[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(NPC_STORAGE_KEY) ?? '[]');
    } catch { return []; }
  });

  useEffect(() => {
    loadVoices();
  }, []);

  const persistAgents = (list: CreatedNPCAgent[]) => {
    setAgents(list);
    localStorage.setItem(NPC_STORAGE_KEY, JSON.stringify(list));
  };

  const loadVoices = async () => {
    setLoadingVoices(true);
    setVoiceError('');
    const result = await window.electronAPI.elevenlabsListVoices();
    setLoadingVoices(false);
    if (!result.ok) {
      if (result.error.includes('not set')) setApiKeyMissing(true);
      else setVoiceError(result.error);
      return;
    }
    setVoices(result.voices);
    if (result.voices.length > 0) setSelectedVoiceId(result.voices[0].voice_id);
  };

  const handleCreate = async () => {
    if (!npcName.trim()) { setCreateError('NPC name is required.'); return; }
    if (!selectedVoiceId) { setCreateError('Select a voice first.'); return; }
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');

    const role = npcRole === 'Custom' ? (npcCustomRole || 'NPC') : npcRole;

    // Use LLM to expand personality inputs into a proper ElevenLabs system prompt
    let systemPrompt = `You are ${npcName}, a ${role} in a metaverse game world.`;
    try {
      const llmResult = await window.electronAPI.chatComplete([
        {
          role: 'user',
          content: `Write a concise system prompt (max 3 sentences) for an AI voice agent NPC character with these traits:
Name: ${npcName}
Role: ${role}
Faction: ${npcFaction || 'none'}
Personality: ${npcPersonality || 'mysterious and gruff'}

The prompt should define their speaking style, knowledge, and goals. Respond with only the system prompt text, no preamble.`,
        },
      ]);
      if (llmResult && typeof llmResult === 'object' && 'content' in llmResult) {
        systemPrompt = (llmResult as { content: string }).content.trim() || systemPrompt;
      }
    } catch { /* fall back to default */ }

    const firstMessage = `${npcPersonality ? `*${npcPersonality.split(' ').slice(0, 3).join(' ')}* ` : ''}…what do you want?`;

    const agentResult = await window.electronAPI.elevenlabsCreateAgent({
      name: npcName,
      systemPrompt,
      firstMessage,
      voiceId: selectedVoiceId,
    });

    if (!agentResult.ok) {
      setCreateError(agentResult.error);
      setCreating(false);
      return;
    }

    const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId);
    const newAgent: CreatedNPCAgent = {
      npcName,
      agentId: agentResult.agentId,
      voiceId: selectedVoiceId,
      voiceName: selectedVoice?.name ?? selectedVoiceId,
      role,
      createdAt: Date.now(),
    };

    persistAgents([newAgent, ...agents]);

    // Write NPC json to workspace
    if (workspacePath) {
      const npcJson = JSON.stringify(
        { name: npcName, role, faction: npcFaction, personality: npcPersonality, agentId: agentResult.agentId, voiceId: selectedVoiceId },
        null,
        2
      );
      window.electronAPI.writeFile(`${workspacePath}/npcs/${npcName}.json`, npcJson).catch(() => {});
    }

    setCreateSuccess(`NPC "${npcName}" created! Agent ID: ${agentResult.agentId}`);
    setNpcName('');
    setNpcPersonality('');
    setNpcFaction('');
    setCreating(false);
  };

  const handleLinkToQuest = (agent: CreatedNPCAgent) => {
    const prompt = `Attach NPC "${agent.npcName}" (ElevenLabs agent ID: ${agent.agentId}, voice: ${agent.voiceName}) to the active STAR quest. Use mcp_invoke to call star_update_quest with the npc_agent_id field, and save the link in npcs/${agent.npcName}.json.`;
    // Inject into chat via a CustomEvent that ComposerSessionPanel listens for
    window.dispatchEvent(new CustomEvent('oasis:inject-prompt', { detail: { prompt } }));
  };

  return (
    <div className="npc-voice-panel">
      {apiKeyMissing && <ApiKeyBanner />}

      {/* Voice Library */}
      <section className="npc-section">
        <div className="npc-section-header">
          <h3 className="npc-section-title">Voice Library</h3>
          <button type="button" className="npc-btn npc-btn-sm" onClick={loadVoices} disabled={loadingVoices}>
            {loadingVoices ? '…' : '↺'}
          </button>
        </div>
        {voiceError && <p className="npc-error">{voiceError}</p>}
        {loadingVoices && !voices.length && (
          <p className="npc-hint">Loading voices…</p>
        )}
        {!loadingVoices && !voices.length && !apiKeyMissing && (
          <p className="npc-hint">No voices found.</p>
        )}
        {voices.length > 0 && (
          <div className="npc-voice-grid" role="listbox" aria-label="Available voices">
            {voices.slice(0, 20).map((v) => (
              <VoiceCard
                key={v.voice_id}
                voice={v}
                selected={selectedVoiceId === v.voice_id}
                onSelect={() => setSelectedVoiceId(v.voice_id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* NPC Creator Form */}
      <section className="npc-section">
        <h3 className="npc-section-title">Create NPC Agent</h3>
        <div className="npc-form">
          <label className="npc-label">
            Name
            <input
              className="npc-input"
              value={npcName}
              onChange={(e) => setNpcName(e.target.value)}
              placeholder="e.g. Viktor"
            />
          </label>
          <label className="npc-label">
            Role
            <select
              className="npc-select"
              value={npcRole}
              onChange={(e) => setNpcRole(e.target.value)}
            >
              {NPC_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          {npcRole === 'Custom' && (
            <label className="npc-label">
              Custom Role
              <input
                className="npc-input"
                value={npcCustomRole}
                onChange={(e) => setNpcCustomRole(e.target.value)}
                placeholder="e.g. Underworld Fixer"
              />
            </label>
          )}
          <label className="npc-label">
            Faction
            <input
              className="npc-input"
              value={npcFaction}
              onChange={(e) => setNpcFaction(e.target.value)}
              placeholder="e.g. The Iron Syndicate"
            />
          </label>
          <label className="npc-label">
            Personality
            <textarea
              className="npc-textarea"
              rows={3}
              value={npcPersonality}
              onChange={(e) => setNpcPersonality(e.target.value)}
              placeholder="Gruff, suspicious of strangers, loyal to the highest bidder…"
            />
          </label>
          {selectedVoiceId && (
            <p className="npc-selected-voice">
              Voice: <strong>{voices.find((v) => v.voice_id === selectedVoiceId)?.name ?? selectedVoiceId}</strong>
            </p>
          )}
          {createError && <p className="npc-error">{createError}</p>}
          {createSuccess && <p className="npc-success">{createSuccess}</p>}
          <button
            type="button"
            className="npc-btn npc-btn-primary"
            onClick={handleCreate}
            disabled={creating || apiKeyMissing}
          >
            {creating ? 'Creating…' : 'Create NPC Voice Agent'}
          </button>
        </div>
      </section>

      {/* Created Agents */}
      {agents.length > 0 && (
        <section className="npc-section">
          <h3 className="npc-section-title">Created NPCs</h3>
          <div className="npc-agents-list">
            {agents.map((a) => (
              <CreatedAgentRow
                key={a.agentId}
                agent={a}
                onRemove={() => persistAgents(agents.filter((x) => x.agentId !== a.agentId))}
                onLinkToQuest={() => handleLinkToQuest(a)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
