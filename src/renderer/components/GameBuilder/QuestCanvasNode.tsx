import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { RFQuestData } from './flowAdapter';

const COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  quest_root:          { bg: '#1a1030', border: '#a78bfa', accent: '#c4b5fd' },
  ogame_objective:     { bg: '#0c1a12', border: '#4ade80', accent: '#86efac' },
  external_handoff:    { bg: '#1a1508', border: '#fbbf24', accent: '#fde68a' },
  geohotspot_anchor:   { bg: '#081a1a', border: '#22d3d8', accent: '#67e8f9' },
  narrative_attachment:{ bg: '#1a0c18', border: '#f472b6', accent: '#fbcfe8' },
};

const KIND_LABEL: Record<string, string> = {
  quest_root:           'QUEST ROOT',
  ogame_objective:      'OBJECTIVE',
  external_handoff:     'EXTERNAL',
  geohotspot_anchor:    'GEOHOTSPOT',
  narrative_attachment: 'NARRATIVE',
};

function getSubLabel(data: RFQuestData): string {
  const d = data.designer;
  switch (d.kind) {
    case 'quest_root':           return d.quest.name || 'Untitled';
    case 'ogame_objective':      return `${d.objective.primaryGame} · ${d.objective.title || 'Objective'}`;
    case 'external_handoff':     return d.handoff.title || 'External step';
    case 'geohotspot_anchor':    return d.hotspot.linkedGeoHotSpotId ? `ID: ${d.hotspot.linkedGeoHotSpotId.slice(0, 8)}…` : `${d.hotspot.draftLat ?? ''}°, ${d.hotspot.draftLong ?? ''}°`;
    case 'narrative_attachment': return d.attachment.narrative.trigger.replace(/_/g, ' ');
    default: return '';
  }
}

function QuestCanvasNode({ data, selected }: NodeProps<Node<RFQuestData>>) {
  const kind = data.designer.kind;
  const c = COLORS[kind] ?? COLORS.ogame_objective;
  const isRoot = kind === 'quest_root';

  return (
    <div
      style={{
        minWidth: 148,
        maxWidth: 200,
        padding: '10px 12px',
        borderRadius: 8,
        background: c.bg,
        border: `2px solid ${selected ? '#fff' : c.border}`,
        boxShadow: selected
          ? `0 0 0 2px ${c.border}, 0 4px 20px rgba(0,0,0,0.6)`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
        fontSize: 11,
        color: '#e2e8f0',
        transition: 'box-shadow 0.12s',
        cursor: 'pointer',
      }}
    >
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: c.border, width: 10, height: 10, border: `2px solid ${c.bg}` }}
        />
      )}

      <div style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: c.border,
        marginBottom: 5,
      }}>
        {KIND_LABEL[kind]}
      </div>

      <div style={{ fontWeight: 600, fontSize: 11, color: c.accent, lineHeight: 1.3, wordBreak: 'break-word' }}>
        {getSubLabel(data)}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: c.border, width: 10, height: 10, border: `2px solid ${c.bg}` }}
      />
    </div>
  );
}

export default memo(QuestCanvasNode);
