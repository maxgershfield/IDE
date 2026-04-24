import React from 'react';
import type { Node } from '@xyflow/react';
import type { GameLogicHook, InGameEventKind, QuestDesignerNodeData } from './designerTypes';
import type { RFQuestData } from './flowAdapter';

const EVENT_OPTIONS: { value: InGameEventKind; label: string }[] = [
  { value: 'pickup_item',    label: 'Pickup item' },
  { value: 'pickup_key',     label: 'Pickup key' },
  { value: 'kill_monster',   label: 'Kill monster' },
  { value: 'complete_level', label: 'Complete level' },
  { value: 'use_line_special', label: 'Use line / special (Doom)' },
  { value: 'geo_arrive',     label: 'Arrive at geo / hotspot' },
  { value: 'custom',         label: 'Custom (notes only)' },
];

const GAME_OPTIONS = ['OurWorld', 'ODOOM', 'OQUAKE', 'External'] as const;

interface Props {
  node: Node<RFQuestData> | null;
  onPatch: (updater: (prev: QuestDesignerNodeData) => QuestDesignerNodeData) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="qpp-field">
      <label className="qpp-label">{label}</label>
      {children}
    </div>
  );
}

export function QuestPropertiesPanel({ node, onPatch }: Props) {
  if (!node) {
    return (
      <div className="qpp-empty">
        Click a node to edit its data and in-game event hooks.
      </div>
    );
  }

  const d = node.data.designer;

  if (d.kind === 'quest_root') {
    const q = d.quest;
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#a78bfa' }}>QUEST ROOT</div>
        <Field label="Name">
          <input className="qpp-input" value={q.name}
            onChange={e => onPatch(prev => prev.kind === 'quest_root'
              ? { ...prev, quest: { ...prev.quest, name: e.target.value } } : prev)} />
        </Field>
        <Field label="Description">
          <textarea className="qpp-textarea" rows={4} value={q.description}
            onChange={e => onPatch(prev => prev.kind === 'quest_root'
              ? { ...prev, quest: { ...prev.quest, description: e.target.value } } : prev)} />
        </Field>
        <Field label="Karma reward">
          <input className="qpp-input" type="number" value={q.rewardKarma ?? ''}
            placeholder="10"
            onChange={e => onPatch(prev => prev.kind === 'quest_root'
              ? { ...prev, quest: { ...prev.quest, rewardKarma: parseInt(e.target.value) || undefined } } : prev)} />
        </Field>
        <Field label="XP reward">
          <input className="qpp-input" type="number" value={q.rewardXP ?? ''}
            placeholder="50"
            onChange={e => onPatch(prev => prev.kind === 'quest_root'
              ? { ...prev, quest: { ...prev.quest, rewardXP: parseInt(e.target.value) || undefined } } : prev)} />
        </Field>
        <Field label="Linked GeoHotSpot ID">
          <input className="qpp-input" value={q.linkedGeoHotSpotId ?? ''} placeholder="UUID (optional)"
            onChange={e => onPatch(prev => prev.kind === 'quest_root'
              ? { ...prev, quest: { ...prev.quest, linkedGeoHotSpotId: e.target.value || undefined } } : prev)} />
        </Field>
      </div>
    );
  }

  if (d.kind === 'ogame_objective') {
    const o = d.objective;
    const gl: GameLogicHook = o.gameLogic ?? { eventKind: 'pickup_item', primaryTargetId: '' };
    const setGL = (patch: Partial<GameLogicHook>) =>
      onPatch(prev => prev.kind === 'ogame_objective'
        ? { ...prev, objective: { ...prev.objective, gameLogic: { ...gl, ...patch } } } : prev);

    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#4ade80' }}>OBJECTIVE</div>
        <Field label="Title">
          <input className="qpp-input" value={o.title}
            onChange={e => onPatch(prev => prev.kind === 'ogame_objective'
              ? { ...prev, objective: { ...prev.objective, title: e.target.value } } : prev)} />
        </Field>
        <Field label="Description">
          <textarea className="qpp-textarea" rows={3} value={o.description}
            onChange={e => onPatch(prev => prev.kind === 'ogame_objective'
              ? { ...prev, objective: { ...prev.objective, description: e.target.value } } : prev)} />
        </Field>
        <Field label="Game source">
          <select className="qpp-select" value={o.primaryGame}
            onChange={e => onPatch(prev => prev.kind === 'ogame_objective'
              ? { ...prev, objective: { ...prev.objective, primaryGame: e.target.value } } : prev)}>
            {GAME_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="Custom">Custom</option>
          </select>
        </Field>

        <div className="qpp-section-divider">In-game event → STAR</div>
        <Field label="Event type">
          <select className="qpp-select" value={gl.eventKind}
            onChange={e => setGL({ eventKind: e.target.value as InGameEventKind })}>
            {EVENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </Field>
        <Field label="Primary target ID">
          <input className="qpp-input" value={gl.primaryTargetId} placeholder="item / key / monster / tag"
            onChange={e => setGL({ primaryTargetId: e.target.value })} />
        </Field>
        <Field label="Map / level">
          <input className="qpp-input" value={gl.mapOrLevel ?? ''}
            onChange={e => setGL({ mapOrLevel: e.target.value || undefined })} />
        </Field>
        <Field label="Implementer notes">
          <textarea className="qpp-textarea" rows={2} value={gl.implementerNotes ?? ''}
            onChange={e => setGL({ implementerNotes: e.target.value || undefined })} />
        </Field>
      </div>
    );
  }

  if (d.kind === 'external_handoff') {
    const h = d.handoff;
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#fbbf24' }}>EXTERNAL HANDOFF</div>
        <Field label="Title">
          <input className="qpp-input" value={h.title}
            onChange={e => onPatch(prev => prev.kind === 'external_handoff'
              ? { ...prev, handoff: { ...prev.handoff, title: e.target.value } } : prev)} />
        </Field>
        <Field label="Handoff URI">
          <input className="qpp-input" value={h.externalHandoffUri} placeholder="https://t.me/..."
            onChange={e => onPatch(prev => prev.kind === 'external_handoff'
              ? { ...prev, handoff: { ...prev.handoff, externalHandoffUri: e.target.value } } : prev)} />
        </Field>
        <Field label="Completion hint">
          <textarea className="qpp-textarea" rows={2} value={h.completionHint ?? ''}
            onChange={e => onPatch(prev => prev.kind === 'external_handoff'
              ? { ...prev, handoff: { ...prev.handoff, completionHint: e.target.value || undefined } } : prev)} />
        </Field>
      </div>
    );
  }

  if (d.kind === 'geohotspot_anchor') {
    const h = d.hotspot;
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#22d3d8' }}>GEOHOTSPOT</div>
        <Field label="Linked holon ID">
          <input className="qpp-input" value={h.linkedGeoHotSpotId ?? ''} placeholder="UUID"
            onChange={e => onPatch(prev => prev.kind === 'geohotspot_anchor'
              ? { ...prev, hotspot: { ...prev.hotspot, linkedGeoHotSpotId: e.target.value || undefined } } : prev)} />
        </Field>
        <Field label="Draft latitude">
          <input className="qpp-input" type="number" step="any" value={h.draftLat ?? ''}
            onChange={e => onPatch(prev => prev.kind === 'geohotspot_anchor'
              ? { ...prev, hotspot: { ...prev.hotspot, draftLat: parseFloat(e.target.value) || undefined } } : prev)} />
        </Field>
        <Field label="Draft longitude">
          <input className="qpp-input" type="number" step="any" value={h.draftLong ?? ''}
            onChange={e => onPatch(prev => prev.kind === 'geohotspot_anchor'
              ? { ...prev, hotspot: { ...prev.hotspot, draftLong: parseFloat(e.target.value) || undefined } } : prev)} />
        </Field>
        <Field label="Radius (metres)">
          <input className="qpp-input" type="number" value={h.draftRadiusMetres ?? ''} placeholder="50"
            onChange={e => onPatch(prev => prev.kind === 'geohotspot_anchor'
              ? { ...prev, hotspot: { ...prev.hotspot, draftRadiusMetres: parseFloat(e.target.value) || undefined } } : prev)} />
        </Field>
        <Field label="Text content">
          <textarea className="qpp-textarea" rows={2} value={h.textContent ?? ''}
            onChange={e => onPatch(prev => prev.kind === 'geohotspot_anchor'
              ? { ...prev, hotspot: { ...prev.hotspot, textContent: e.target.value || undefined } } : prev)} />
        </Field>
      </div>
    );
  }

  return (
    <div className="qpp-empty">
      Narrative node — use the JSON export for advanced editing.
    </div>
  );
}
