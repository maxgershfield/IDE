/**
 * MissionArcPane — drag-and-drop mission arc designer.
 * Node types: mission_stage, decision_point, reward_node.
 * Compiles to a structured agent message for star_create_mission.
 */
import React, { useCallback, useRef, useState, memo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useEditorTab } from '../../contexts/EditorTabContext';
import './GameBuilder.css';

// ── Seed type (exported so GameBuilderPane can pass it) ──────────
export interface MissionSeed {
  stages?: Array<{ title: string; description?: string; game?: string }>;
}

// ── Node data types ──────────────────────────────────────────────
type ArcNodeKind = 'stage' | 'decision' | 'reward';

interface StageData extends Record<string, unknown> {
  kind: 'stage';
  title: string;
  description: string;
  objectives: string;
  game: string;
}

interface DecisionData extends Record<string, unknown> {
  kind: 'decision';
  condition: string;
  branchA: string;
  branchB: string;
}

interface RewardData extends Record<string, unknown> {
  kind: 'reward';
  karma: number;
  xp: number;
  item: string;
}

type ArcNodeData = StageData | DecisionData | RewardData;

const ARC_COLORS: Record<ArcNodeKind, { bg: string; border: string; accent: string }> = {
  stage:    { bg: '#0d1a1a', border: '#38bdf8', accent: '#7dd3fc' },
  decision: { bg: '#1a140a', border: '#fb923c', accent: '#fdba74' },
  reward:   { bg: '#0c1a12', border: '#4ade80', accent: '#86efac' },
};

// ── Custom node renderers ────────────────────────────────────────
const ArcNode = memo(({ data, selected }: NodeProps<Node<ArcNodeData>>) => {
  const kind = data.kind as ArcNodeKind;
  const c = ARC_COLORS[kind];

  let title = '';
  let sub = '';
  if (data.kind === 'stage')    { title = data.title || 'Stage'; sub = data.game; }
  if (data.kind === 'decision') { title = 'Decision'; sub = data.condition || 'Condition?'; }
  if (data.kind === 'reward')   { title = 'Reward'; sub = [data.karma && `${data.karma} karma`, data.xp && `${data.xp} XP`, data.item].filter(Boolean).join(' · ') || 'No rewards set'; }

  return (
    <div style={{
      minWidth: 150,
      maxWidth: 200,
      padding: '10px 14px',
      borderRadius: kind === 'decision' ? 4 : 8,
      background: c.bg,
      border: `2px solid ${selected ? '#fff' : c.border}`,
      boxShadow: selected ? `0 0 0 2px ${c.border}` : '0 2px 8px rgba(0,0,0,0.4)',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11,
      color: '#e2e8f0',
      transform: kind === 'decision' ? 'rotate(0deg)' : undefined,
    }}>
      <Handle type="target" position={Position.Top} style={{ background: c.border, width: 10, height: 10 }} />
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.border, marginBottom: 4 }}>
        {kind}
      </div>
      <div style={{ fontWeight: 600, color: c.accent, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{sub}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 10, height: 10 }} />
      {kind === 'decision' && (
        <Handle type="source" id="branch-b" position={Position.Right}
          style={{ background: '#fb923c', width: 10, height: 10, top: '50%' }} />
      )}
    </div>
  );
});
ArcNode.displayName = 'ArcNode';

const nodeTypes: NodeTypes = { arcNode: ArcNode };

// ── Palette ──────────────────────────────────────────────────────
const DRAG_MIME = 'application/oasis-mission-arc';

const PALETTE_ITEMS = [
  { id: 'stage',    label: 'Mission Stage',    sub: 'Task / objective step',    color: '#38bdf8' },
  { id: 'decision', label: 'Decision Point',   sub: 'Branching narrative fork',  color: '#fb923c' },
  { id: 'reward',   label: 'Reward Node',      sub: 'Karma / XP / item grant',  color: '#4ade80' },
];

// ── Default graph + seed builder ─────────────────────────────────
let idCounter = 0;

function makeDefaults(seed?: MissionSeed): { nodes: Node<ArcNodeData>[]; edges: Edge[] } {
  const seededStages = seed?.stages?.filter((s) => s.title) ?? [];

  if (seededStages.length > 0) {
    // Build a linear chain of stage nodes from the seed
    const nodes: Node<ArcNodeData>[] = seededStages.map((s, i) => ({
      id: `arc_s${i + 1}`,
      type: 'arcNode',
      position: { x: 160, y: 40 + i * 160 },
      data: { kind: 'stage' as const, title: s.title, description: s.description || '', objectives: '', game: s.game || 'OurWorld' },
    }));
    nodes.push({
      id: 'arc_r1', type: 'arcNode', position: { x: 160, y: 40 + seededStages.length * 160 },
      data: { kind: 'reward' as const, karma: 10, xp: 50, item: '' },
    });
    const edges: Edge[] = seededStages.map((_, i) => ({
      id: `ae${i + 1}`,
      source: `arc_s${i + 1}`,
      target: i + 1 < seededStages.length ? `arc_s${i + 2}` : 'arc_r1',
      animated: true,
      style: { stroke: '#38bdf8', strokeWidth: 2 },
    }));
    return { nodes, edges };
  }

  // Fallback demo graph
  return {
    nodes: [
      { id: 'arc_s1', type: 'arcNode', position: { x: 160, y: 40 },
        data: { kind: 'stage', title: 'Act 1 — Discover', description: 'Player learns of the threat.', objectives: 'Find the ancient map', game: 'OurWorld' } },
      { id: 'arc_d1', type: 'arcNode', position: { x: 160, y: 200 },
        data: { kind: 'decision', condition: 'Has red key?', branchA: 'Proceed to citadel', branchB: 'Seek the blacksmith' } },
      { id: 'arc_s2', type: 'arcNode', position: { x: 60, y: 360 },
        data: { kind: 'stage', title: 'Citadel assault', description: 'Storm the citadel gates.', objectives: 'Defeat the gate guardian', game: 'ODOOM' } },
      { id: 'arc_s3', type: 'arcNode', position: { x: 280, y: 360 },
        data: { kind: 'stage', title: 'Find the blacksmith', description: 'Retrieve the forge key.', objectives: 'Collect the forge key', game: 'OQUAKE' } },
      { id: 'arc_r1', type: 'arcNode', position: { x: 160, y: 520 },
        data: { kind: 'reward', karma: 25, xp: 100, item: 'Ancient Sword NFT' } },
    ],
    edges: [
      { id: 'ae1', source: 'arc_s1', target: 'arc_d1', animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 } },
      { id: 'ae2', source: 'arc_d1', target: 'arc_s2', animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 }, label: 'yes' },
      { id: 'ae3', source: 'arc_d1', sourceHandle: 'branch-b', target: 'arc_s3', animated: true, style: { stroke: '#fb923c', strokeWidth: 2 }, label: 'no' },
      { id: 'ae4', source: 'arc_s2', target: 'arc_r1', animated: true, style: { stroke: '#4ade80', strokeWidth: 2 } },
      { id: 'ae5', source: 'arc_s3', target: 'arc_r1', animated: true, style: { stroke: '#4ade80', strokeWidth: 2 } },
    ],
  };
}

// ── Build agent message ──────────────────────────────────────────
function buildMissionMessage(nodes: Node<ArcNodeData>[], edges: Edge[]): string {
  const stages = nodes.filter(n => n.data.kind === 'stage') as Node<StageData>[];
  const decisions = nodes.filter(n => n.data.kind === 'decision') as Node<DecisionData>[];
  const rewards = nodes.filter(n => n.data.kind === 'reward') as Node<RewardData>[];

  const stageLines = stages.map((n, i) =>
    `  Stage ${i + 1}: "${n.data.title}" (${n.data.game}) — ${n.data.description}. Objectives: ${n.data.objectives}`
  ).join('\n');

  const decisionLines = decisions.map((n) =>
    `  Decision: "${n.data.condition}" → A: "${n.data.branchA}" / B: "${n.data.branchB}"`
  ).join('\n');

  const rewardLines = rewards.map((n) =>
    `  Reward: ${[n.data.karma && `${n.data.karma} karma`, n.data.xp && `${n.data.xp} XP`, n.data.item].filter(Boolean).join(', ')}`
  ).join('\n');

  const arcJson = {
    stages: stages.map(n => n.data),
    decisions: decisions.map(n => n.data),
    rewards: rewards.map(n => n.data),
    edges: edges.map(e => ({ from: e.source, to: e.target, label: e.label })),
  };

  return `Create a mission arc on STARNET using the following narrative graph.

**Stages (${stages.length}):**
${stageLines || '  (no stages)'}

**Decision points (${decisions.length}):**
${decisionLines || '  (none)'}

**Rewards:**
${rewardLines || '  (none)'}

Arc graph JSON:
\`\`\`json
${JSON.stringify(arcJson, null, 2)}
\`\`\`

Please:
1. Call \`star_create_mission\` for each stage in order, linking them in sequence
2. Wire decision branches as conditional mission prerequisites
3. Create reward entries for the terminal reward node(s)
4. Return the STARNET mission arc ID`;
}

// ── Properties panel (inline) ────────────────────────────────────
function ArcPropertiesPanel({
  node,
  onPatch,
}: {
  node: Node<ArcNodeData> | null;
  onPatch: (updater: (prev: ArcNodeData) => ArcNodeData) => void;
}) {
  if (!node) return <div className="qpp-empty">Click a node to edit it.</div>;
  const d = node.data;

  if (d.kind === 'stage') {
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#38bdf8' }}>MISSION STAGE</div>
        <div className="qpp-field"><label className="qpp-label">Title</label>
          <input className="qpp-input" value={d.title}
            onChange={e => onPatch(p => p.kind === 'stage' ? { ...p, title: e.target.value } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Description</label>
          <textarea className="qpp-textarea" rows={3} value={d.description}
            onChange={e => onPatch(p => p.kind === 'stage' ? { ...p, description: e.target.value } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Objectives (brief)</label>
          <input className="qpp-input" value={d.objectives}
            onChange={e => onPatch(p => p.kind === 'stage' ? { ...p, objectives: e.target.value } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Game</label>
          <select className="qpp-select" value={d.game}
            onChange={e => onPatch(p => p.kind === 'stage' ? { ...p, game: e.target.value } : p)}>
            {['OurWorld', 'ODOOM', 'OQUAKE', 'Custom'].map(g => <option key={g}>{g}</option>)}
          </select></div>
      </div>
    );
  }

  if (d.kind === 'decision') {
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#fb923c' }}>DECISION POINT</div>
        <div className="qpp-field"><label className="qpp-label">Condition</label>
          <input className="qpp-input" value={d.condition}
            onChange={e => onPatch(p => p.kind === 'decision' ? { ...p, condition: e.target.value } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Branch A (bottom)</label>
          <input className="qpp-input" value={d.branchA}
            onChange={e => onPatch(p => p.kind === 'decision' ? { ...p, branchA: e.target.value } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Branch B (right)</label>
          <input className="qpp-input" value={d.branchB}
            onChange={e => onPatch(p => p.kind === 'decision' ? { ...p, branchB: e.target.value } : p)} /></div>
      </div>
    );
  }

  if (d.kind === 'reward') {
    return (
      <div className="qpp-scroll">
        <div className="qpp-kind-badge" style={{ color: '#4ade80' }}>REWARD NODE</div>
        <div className="qpp-field"><label className="qpp-label">Karma</label>
          <input className="qpp-input" type="number" value={d.karma}
            onChange={e => onPatch(p => p.kind === 'reward' ? { ...p, karma: parseInt(e.target.value) || 0 } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">XP</label>
          <input className="qpp-input" type="number" value={d.xp}
            onChange={e => onPatch(p => p.kind === 'reward' ? { ...p, xp: parseInt(e.target.value) || 0 } : p)} /></div>
        <div className="qpp-field"><label className="qpp-label">Item / NFT name</label>
          <input className="qpp-input" value={d.item}
            onChange={e => onPatch(p => p.kind === 'reward' ? { ...p, item: e.target.value } : p)} /></div>
      </div>
    );
  }

  return null;
}

// ── Inner canvas ─────────────────────────────────────────────────
function MissionArcCanvas({ onClose, seed }: { onClose: () => void; seed?: MissionSeed }) {
  const defaults = makeDefaults(seed);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ArcNodeData>>(defaults.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaults.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const { screenToFlowPosition } = useReactFlow();
  const { submitBuilderMessage } = useEditorTab();

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: '#38bdf8', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData(DRAG_MIME) as ArcNodeKind;
    if (!kind) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = `arc_${++idCounter}`;
    let data: ArcNodeData;
    if (kind === 'stage')    data = { kind, title: 'New Stage', description: '', objectives: '', game: 'OurWorld' };
    else if (kind === 'decision') data = { kind, condition: 'Condition?', branchA: 'Yes', branchB: 'No' };
    else                     data = { kind: 'reward', karma: 10, xp: 50, item: '' };
    const newNode: Node<ArcNodeData> = { id, type: 'arcNode', position: { x: position.x - 75, y: position.y - 24 }, data };
    setNodes(nds => [...nds, newNode]);
    setSelectedNodeId(id);
  }, [screenToFlowPosition, setNodes]);

  const handlePatch = useCallback((updater: (prev: ArcNodeData) => ArcNodeData) => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.map(n => n.id === selectedNodeId ? { ...n, data: updater(n.data) } : n));
  }, [selectedNodeId, setNodes]);

  const handleSend = useCallback(() => {
    submitBuilderMessage(buildMissionMessage(nodes, edges));
    setSent(true);
  }, [nodes, edges, submitBuilderMessage]);

  const handleReset = useCallback(() => {
    const d = makeDefaults(seed);
    setNodes(d.nodes);
    setEdges(d.edges);
    setSelectedNodeId(null);
    setSent(false);
  }, [setNodes, setEdges]);

  return (
    <div className="qgp-root">
      {/* Palette */}
      <div className="qgp-palette">
        <div className="qgp-palette-heading">Drag to canvas</div>
        {PALETTE_ITEMS.map(item => (
          <div key={item.id} className="qgp-palette-tile"
            draggable
            onDragStart={e => { e.dataTransfer.setData(DRAG_MIME, item.id); e.dataTransfer.effectAllowed = 'copy'; }}
            style={{ '--tile-color': item.color } as React.CSSProperties}>
            <span className="qgp-tile-label">{item.label}</span>
            <span className="qgp-tile-sub">{item.sub}</span>
          </div>
        ))}
        <div className="qgp-palette-hint">Decision node has two source handles (bottom + right).</div>
      </div>

      {/* Canvas */}
      <div className="qgp-canvas-wrap" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: '#111318' }}
        >
          <Background color="#2a2d38" gap={20} size={1} />
          <Controls style={{ background: '#1e2028', border: '1px solid #2a2d38' }} />
        </ReactFlow>
      </div>

      {/* Properties */}
      <div className="qgp-props">
        <ArcPropertiesPanel node={selectedNode} onPatch={handlePatch} />
      </div>

      {/* Footer */}
      <div className="qgp-footer">
        <button type="button" className="qgp-btn qgp-btn--ghost" onClick={handleReset}>Reset</button>
        <div className="qgp-footer-spacer" />
        {sent && <span className="qgp-compiled-badge">Sent to agent</span>}
        <button type="button" className="qgp-btn qgp-btn--cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="qgp-btn qgp-btn--submit" onClick={handleSend}>
          Create with Agent
        </button>
      </div>
    </div>
  );
}

// ── Public export ────────────────────────────────────────────────
export const MissionArcPane: React.FC<{ onClose: () => void; seed?: MissionSeed }> = ({ onClose, seed }) => (
  <ReactFlowProvider>
    <MissionArcCanvas onClose={onClose} seed={seed} />
  </ReactFlowProvider>
);
