/**
 * NPCBuilderPane — enhanced NPC builder with:
 *  1. Archetype picker grid: click an archetype to auto-fill defaults
 *  2. Form fields: refine name, role, faction, personality, voice, behavior
 *  3. Live character card: updates in real time as you fill fields
 *
 * On submit, produces a structured agent message that calls star_create_npc,
 * generates opening dialogue in the character's voice, and writes the holon.
 */
import React, { useState, useCallback } from 'react';
import { useEditorTab } from '../../contexts/EditorTabContext';
import './NPCBuilderPane.css';

// ── Archetype data ────────────────────────────────────────────────
interface Archetype {
  id: string;
  label: string;
  abbr: string;
  color: string;
  bgGradient: string;
  defaultRole: string;
  defaultPersonality: string[];
  defaultVoice: string;
  defaultGame: string;
  defaultAggroRange: number;
  isQuestGiver: boolean;
  isMerchant: boolean;
  isFriendly: boolean;
  agentHints: string;
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'warrior',
    label: 'Warrior',
    abbr: 'WR',
    color: '#ef4444',
    bgGradient: 'linear-gradient(135deg, #1a0a0a 0%, #2d0f0f 100%)',
    defaultRole: 'Frontline fighter',
    defaultPersonality: ['Stoic', 'Brave', 'Protective', 'Blunt'],
    defaultVoice: 'gruff_male',
    defaultGame: 'ODOOM',
    defaultAggroRange: 150,
    isQuestGiver: false, isMerchant: false, isFriendly: false,
    agentHints: 'Short declarative sentences. Combat references. Strict honour code. Never backs down from a fight.',
  },
  {
    id: 'merchant',
    label: 'Merchant',
    abbr: 'MC',
    color: '#f59e0b',
    bgGradient: 'linear-gradient(135deg, #1a1200 0%, #2d2000 100%)',
    defaultRole: 'Travelling trader',
    defaultPersonality: ['Jovial', 'Cunning', 'Greedy', 'Talkative'],
    defaultVoice: 'warm_male',
    defaultGame: 'OurWorld',
    defaultAggroRange: 0,
    isQuestGiver: false, isMerchant: true, isFriendly: true,
    agentHints: 'Always selling. Exaggerates quality of goods. Drops hints about rare items. Warm but calculating.',
  },
  {
    id: 'mystic',
    label: 'Mystic',
    abbr: 'MY',
    color: '#a78bfa',
    bgGradient: 'linear-gradient(135deg, #0d0a1a 0%, #1a1030 100%)',
    defaultRole: 'Keeper of ancient secrets',
    defaultPersonality: ['Cryptic', 'Wise', 'Detached', 'Otherworldly'],
    defaultVoice: 'ethereal_female',
    defaultGame: 'OurWorld',
    defaultAggroRange: 0,
    isQuestGiver: true, isMerchant: false, isFriendly: true,
    agentHints: 'Speaks in riddles and metaphors. References cosmic forces. Never gives direct answers. Hints at hidden truths.',
  },
  {
    id: 'companion',
    label: 'Companion',
    abbr: 'CP',
    color: '#4ade80',
    bgGradient: 'linear-gradient(135deg, #061a0c 0%, #0c2d14 100%)',
    defaultRole: 'Loyal ally',
    defaultPersonality: ['Loyal', 'Cheerful', 'Curious', 'Courageous'],
    defaultVoice: 'bright_young',
    defaultGame: 'OurWorld',
    defaultAggroRange: 80,
    isQuestGiver: false, isMerchant: false, isFriendly: true,
    agentHints: 'Enthusiastic and supportive. Comments on surroundings. Asks questions. Celebrates player victories.',
  },
  {
    id: 'boss',
    label: 'Boss',
    abbr: 'BS',
    color: '#dc2626',
    bgGradient: 'linear-gradient(135deg, #1a0000 0%, #3d0000 100%)',
    defaultRole: 'Apex antagonist',
    defaultPersonality: ['Menacing', 'Arrogant', 'Calculating', 'Ruthless'],
    defaultVoice: 'deep_villain',
    defaultGame: 'ODOOM',
    defaultAggroRange: 300,
    isQuestGiver: false, isMerchant: false, isFriendly: false,
    agentHints: 'Monologues. Threatens. Questions the player\'s worthiness. Dramatic pauses. Never admits weakness.',
  },
  {
    id: 'guard',
    label: 'Guard',
    abbr: 'GD',
    color: '#64748b',
    bgGradient: 'linear-gradient(135deg, #0f1318 0%, #1a2030 100%)',
    defaultRole: 'City or dungeon guard',
    defaultPersonality: ['Vigilant', 'Brusque', 'Dutiful', 'Suspicious'],
    defaultVoice: 'firm_male',
    defaultGame: 'OQUAKE',
    defaultAggroRange: 200,
    isQuestGiver: false, isMerchant: false, isFriendly: false,
    agentHints: 'Official tone. Challenges credentials. Warns intruders. Short clipped sentences. No nonsense.',
  },
  {
    id: 'trickster',
    label: 'Trickster',
    abbr: 'TK',
    color: '#fb923c',
    bgGradient: 'linear-gradient(135deg, #1a0d00 0%, #2d1500 100%)',
    defaultRole: 'Chaotic wildcard',
    defaultPersonality: ['Mischievous', 'Witty', 'Unpredictable', 'Charming'],
    defaultVoice: 'playful_androgynous',
    defaultGame: 'OurWorld',
    defaultAggroRange: 50,
    isQuestGiver: true, isMerchant: false, isFriendly: true,
    agentHints: 'Jokes and riddles. Misdirects. Half-truths. Finds everything amusing. Drops critical hints disguised as jokes.',
  },
  {
    id: 'healer',
    label: 'Healer',
    abbr: 'HL',
    color: '#34d399',
    bgGradient: 'linear-gradient(135deg, #001a12 0%, #00281a 100%)',
    defaultRole: 'Field medic and herbalist',
    defaultPersonality: ['Compassionate', 'Calm', 'Perceptive', 'Weary'],
    defaultVoice: 'soft_female',
    defaultGame: 'OurWorld',
    defaultAggroRange: 0,
    isQuestGiver: false, isMerchant: true, isFriendly: true,
    agentHints: 'Gentle and methodical. Worries about the player\'s wellbeing. References medical knowledge. Occasionally exhausted.',
  },
  {
    id: 'quest_giver',
    label: 'Quest Giver',
    abbr: 'QG',
    color: '#60a5fa',
    bgGradient: 'linear-gradient(135deg, #061018 0%, #0c1f30 100%)',
    defaultRole: 'Mission dispatcher',
    defaultPersonality: ['Urgent', 'Authoritative', 'Secretive', 'Grateful'],
    defaultVoice: 'clear_narrator',
    defaultGame: 'OurWorld',
    defaultAggroRange: 0,
    isQuestGiver: true, isMerchant: false, isFriendly: true,
    agentHints: 'Delivers mission briefings. Creates urgency. Rewards info. Hints at larger conspiracy. Professional but stressed.',
  },
  {
    id: 'villain',
    label: 'Villain',
    abbr: 'VL',
    color: '#c084fc',
    bgGradient: 'linear-gradient(135deg, #0d0020 0%, #1a0035 100%)',
    defaultRole: 'Primary antagonist',
    defaultPersonality: ['Cold', 'Intelligent', 'Nihilistic', 'Theatrical'],
    defaultVoice: 'cold_intellect',
    defaultGame: 'ODOOM',
    defaultAggroRange: 250,
    isQuestGiver: false, isMerchant: false, isFriendly: false,
    agentHints: 'Philosophical. Explains world view. Sees player as beneath them. Elaborate vocabulary. Occasionally shows cracks.',
  },
  {
    id: 'sage',
    label: 'Sage',
    abbr: 'SG',
    color: '#fbbf24',
    bgGradient: 'linear-gradient(135deg, #1a1500 0%, #2d2300 100%)',
    defaultRole: 'Lorekeeper and scholar',
    defaultPersonality: ['Erudite', 'Patient', 'Verbose', 'Enthusiastic'],
    defaultVoice: 'aged_scholar',
    defaultGame: 'OurWorld',
    defaultAggroRange: 0,
    isQuestGiver: true, isMerchant: false, isFriendly: true,
    agentHints: 'Deep knowledge of world lore. Long explanations. Tangents. Excited when player asks interesting questions. Quotes ancient texts.',
  },
  {
    id: 'thief',
    label: 'Thief',
    abbr: 'TH',
    color: '#94a3b8',
    bgGradient: 'linear-gradient(135deg, #0a0f18 0%, #141f30 100%)',
    defaultRole: 'Shadow operative',
    defaultPersonality: ['Paranoid', 'Resourceful', 'Dry humour', 'Distrustful'],
    defaultVoice: 'hushed_neutral',
    defaultGame: 'OQUAKE',
    defaultAggroRange: 60,
    isQuestGiver: false, isMerchant: true, isFriendly: false,
    agentHints: 'Looks over shoulder. Speaks quietly. Double meanings. Refuses to use real names. Information has a price.',
  },
];

const VOICE_OPTIONS = [
  { value: 'gruff_male',           label: 'Gruff male' },
  { value: 'warm_male',            label: 'Warm male' },
  { value: 'firm_male',            label: 'Firm male' },
  { value: 'deep_villain',         label: 'Deep villain' },
  { value: 'soft_female',          label: 'Soft female' },
  { value: 'ethereal_female',      label: 'Ethereal female' },
  { value: 'bright_young',         label: 'Bright young' },
  { value: 'playful_androgynous',  label: 'Playful androgynous' },
  { value: 'aged_scholar',         label: 'Aged scholar' },
  { value: 'cold_intellect',       label: 'Cold intellect' },
  { value: 'hushed_neutral',       label: 'Hushed neutral' },
  { value: 'clear_narrator',       label: 'Clear narrator' },
];

const GAME_OPTIONS = ['OurWorld', 'ODOOM', 'OQUAKE', 'Custom'];

const PERSONALITY_SUGGESTIONS = [
  'Brave', 'Stoic', 'Cunning', 'Loyal', 'Cryptic', 'Jovial', 'Menacing',
  'Compassionate', 'Arrogant', 'Wise', 'Paranoid', 'Cheerful', 'Ruthless',
  'Mysterious', 'Verbose', 'Detached', 'Vigilant', 'Charming', 'Weary',
];

// ── Build agent message ───────────────────────────────────────────
interface NPCData {
  name: string;
  archetype: Archetype | null;
  role: string;
  faction: string;
  personality: string[];
  game: string;
  voice: string;
  aggroRange: number;
  isQuestGiver: boolean;
  isMerchant: boolean;
  notes: string;
}

function buildNPCMessage(data: NPCData): string {
  const { name, archetype, role, faction, personality, game, voice, aggroRange, isQuestGiver, isMerchant, notes } = data;
  const displayName = name || 'Unnamed NPC';
  const slug = displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const traitList = personality.length ? personality.join(', ') : '(no traits defined)';
  const behaviorParts = [
    isQuestGiver && 'Quest giver',
    isMerchant   && 'Merchant / trader',
    aggroRange > 0 && `Aggro range: ${aggroRange} units`,
  ].filter(Boolean).join(' · ') || 'Non-aggressive, no trade inventory';

  return `Create an NPC holon on OASIS with the following character sheet.

**Name:** ${displayName}
**Archetype:** ${archetype?.label ?? 'Custom'}
**Role:** ${role || '(unspecified)'}
**Faction:** ${faction || '(none)'}
**Personality:** ${traitList}
**Game:** ${game}
**Voice category:** ${voice} (map to closest ElevenLabs voice for this category)
**Behavior:** ${behaviorParts}
${notes ? `**Notes:** ${notes}` : ''}

**Dialogue style guidance for agent:**
${archetype?.agentHints ?? 'No specific hints — use personality traits as guide.'}

Please:
1. Call \`star_create_npc\` with the above data
2. Generate 3 opening dialogue lines in this character's voice and personality
3. Generate a short in-game description (2–3 sentences) the player sees when examining the NPC
4. Write the holon to \`npcs/${slug}.json\`
5. Return the OASIS NPC holon ID`;
}

// ── Main component ────────────────────────────────────────────────
export const NPCBuilderPane: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { submitBuilderMessage } = useEditorTab();

  const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [faction, setFaction] = useState('');
  const [personality, setPersonality] = useState<string[]>([]);
  const [game, setGame] = useState('OurWorld');
  const [voice, setVoice] = useState('warm_male');
  const [aggroRange, setAggroRange] = useState(0);
  const [isQuestGiver, setIsQuestGiver] = useState(false);
  const [isMerchant, setIsMerchant] = useState(false);
  const [notes, setNotes] = useState('');
  const [customTrait, setCustomTrait] = useState('');

  const applyArchetype = useCallback((arch: Archetype) => {
    setSelectedArchetype(arch);
    setRole(arch.defaultRole);
    setPersonality([...arch.defaultPersonality]);
    setGame(arch.defaultGame);
    setVoice(arch.defaultVoice);
    setAggroRange(arch.defaultAggroRange);
    setIsQuestGiver(arch.isQuestGiver);
    setIsMerchant(arch.isMerchant);
  }, []);

  const toggleTrait = useCallback((trait: string) => {
    setPersonality((prev) =>
      prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]
    );
  }, []);

  const addCustomTrait = useCallback(() => {
    const t = customTrait.trim();
    if (t && !personality.includes(t)) {
      setPersonality((prev) => [...prev, t]);
      setCustomTrait('');
    }
  }, [customTrait, personality]);

  const handleSubmit = useCallback(() => {
    submitBuilderMessage(buildNPCMessage({
      name, archetype: selectedArchetype, role, faction,
      personality, game, voice, aggroRange, isQuestGiver, isMerchant, notes,
    }));
  }, [name, selectedArchetype, role, faction, personality, game, voice,
      aggroRange, isQuestGiver, isMerchant, notes, submitBuilderMessage]);

  const arch = selectedArchetype;
  const displayName = name || 'Unnamed NPC';

  return (
    <div className="npc-root">
      {/* ── Archetype picker ── */}
      <div className="npc-picker-row">
        <div className="npc-picker-label">Choose archetype</div>
        <div className="npc-picker-grid">
          {ARCHETYPES.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`npc-arch-card${selectedArchetype?.id === a.id ? ' is-selected' : ''}`}
              style={{
                '--arch-color': a.color,
                background: selectedArchetype?.id === a.id ? a.bgGradient : undefined,
              } as React.CSSProperties}
              onClick={() => applyArchetype(a)}
            >
              <div className="npc-arch-avatar" style={{ background: a.color + '22', border: `2px solid ${a.color}55`, color: a.color }}>
                {a.abbr}
              </div>
              <span className="npc-arch-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area: form + character card ── */}
      <div className="npc-main">
        {/* Form */}
        <div className="npc-form">
          <div className="npc-field">
            <label className="npc-label">NPC Name *</label>
            <input className="npc-input" value={name} placeholder="e.g. Sir Aldric the Betrayed"
              onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="npc-field">
            <label className="npc-label">Role</label>
            <input className="npc-input" value={role} placeholder="e.g. Fallen knight seeking redemption"
              onChange={(e) => setRole(e.target.value)} />
          </div>

          <div className="npc-field">
            <label className="npc-label">Faction</label>
            <input className="npc-input" value={faction} placeholder="e.g. Brotherhood of the Shattered Shield"
              onChange={(e) => setFaction(e.target.value)} />
          </div>

          <div className="npc-field">
            <label className="npc-label">Game</label>
            <select className="npc-select" value={game} onChange={(e) => setGame(e.target.value)}>
              {GAME_OPTIONS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div className="npc-field">
            <label className="npc-label">Voice category</label>
            <select className="npc-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {VOICE_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div className="npc-field-row">
            <div className="npc-field npc-field--half">
              <label className="npc-label">Aggro range (units)</label>
              <input className="npc-input" type="number" value={aggroRange} min={0}
                onChange={(e) => setAggroRange(parseInt(e.target.value) || 0)} />
            </div>
            <div className="npc-field npc-field--half npc-toggle-group">
              <label className="npc-toggle-item">
                <input type="checkbox" checked={isQuestGiver} onChange={(e) => setIsQuestGiver(e.target.checked)} />
                <span>Quest giver</span>
              </label>
              <label className="npc-toggle-item">
                <input type="checkbox" checked={isMerchant} onChange={(e) => setIsMerchant(e.target.checked)} />
                <span>Merchant</span>
              </label>
            </div>
          </div>

          {/* Personality traits */}
          <div className="npc-field">
            <label className="npc-label">Personality traits</label>
            <div className="npc-traits-chips">
              {PERSONALITY_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`npc-trait-chip${personality.includes(t) ? ' is-active' : ''}`}
                  onClick={() => toggleTrait(t)}
                >
                  {t}
                </button>
              ))}
              {/* Custom traits not in the suggestion list */}
              {personality.filter((t) => !PERSONALITY_SUGGESTIONS.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="npc-trait-chip is-active is-custom"
                  onClick={() => toggleTrait(t)}
                >
                  {t} ×
                </button>
              ))}
            </div>
            <div className="npc-trait-add">
              <input
                className="npc-input npc-input--sm"
                value={customTrait}
                placeholder="Add custom trait…"
                onChange={(e) => setCustomTrait(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTrait(); } }}
              />
              <button type="button" className="npc-add-btn" onClick={addCustomTrait}>Add</button>
            </div>
          </div>

          <div className="npc-field">
            <label className="npc-label">Implementer notes</label>
            <textarea className="npc-textarea" rows={2} value={notes}
              placeholder="Spawn location, patrol path, special triggers…"
              onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Character card */}
        <div className="npc-card-col">
          <div
            className="npc-char-card"
            style={{ background: arch?.bgGradient ?? 'linear-gradient(135deg, #0f1318 0%, #1a2030 100%)' }}
          >
            {/* Avatar circle */}
            <div className="npc-card-avatar" style={{
              background: arch ? arch.color + '22' : '#334155',
              border: `3px solid ${arch?.color ?? '#475569'}`,
              color: arch?.color ?? '#94a3b8',
            }}>
              {arch ? arch.abbr : '?'}
            </div>

            {/* Archetype badge */}
            {arch && (
              <div className="npc-card-arch-badge" style={{ color: arch.color, borderColor: arch.color + '55' }}>
                {arch.label}
              </div>
            )}

            {/* Name */}
            <div className="npc-card-name">{displayName}</div>

            {/* Role + faction */}
            {(role || faction) && (
              <div className="npc-card-sub">
                {role && <span>{role}</span>}
                {role && faction && <span className="npc-card-dot">·</span>}
                {faction && <span className="npc-card-faction">{faction}</span>}
              </div>
            )}

            {/* Traits */}
            {personality.length > 0 && (
              <div className="npc-card-traits">
                {personality.slice(0, 5).map((t) => (
                  <span key={t} className="npc-card-trait" style={{ borderColor: arch ? arch.color + '55' : '#334155', color: arch?.color ?? '#94a3b8' }}>
                    {t}
                  </span>
                ))}
                {personality.length > 5 && (
                  <span className="npc-card-trait npc-card-trait--more">+{personality.length - 5}</span>
                )}
              </div>
            )}

            {/* Stats row */}
            <div className="npc-card-stats">
              <div className="npc-card-stat">
                <span className="npc-card-stat-label">Game</span>
                <span className="npc-card-stat-value">{game}</span>
              </div>
              <div className="npc-card-stat">
                <span className="npc-card-stat-label">Voice</span>
                <span className="npc-card-stat-value">
                  {VOICE_OPTIONS.find((v) => v.value === voice)?.label ?? voice}
                </span>
              </div>
              <div className="npc-card-stat">
                <span className="npc-card-stat-label">Aggro</span>
                <span className="npc-card-stat-value">{aggroRange > 0 ? `${aggroRange} u` : 'None'}</span>
              </div>
            </div>

            {/* Behavior badges */}
            <div className="npc-card-badges">
              {isQuestGiver && <span className="npc-card-badge" style={{ background: '#1d4ed8' }}>Quest Giver</span>}
              {isMerchant   && <span className="npc-card-badge" style={{ background: '#92400e' }}>Merchant</span>}
              {aggroRange > 0 && !isQuestGiver && !isMerchant && (
                <span className="npc-card-badge" style={{ background: '#7f1d1d' }}>Hostile</span>
              )}
            </div>

            {/* Agent hints */}
            {arch && (
              <div className="npc-card-hints">
                <span className="npc-card-hints-label">Dialogue style</span>
                <span className="npc-card-hints-text">{arch.agentHints}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="npc-footer">
        <button type="button" className="qgp-btn qgp-btn--cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="qgp-btn qgp-btn--submit" onClick={handleSubmit}>
          Create with Agent
        </button>
      </div>
    </div>
  );
};
