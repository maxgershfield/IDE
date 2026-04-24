/**
 * QuestGraphPane — drag-and-drop quest designer embedded in the IDE editor tab.
 * Palette on the left, ReactFlow canvas in the centre, PropertiesPanel on the right.
 * On "Create with Agent", compiles the graph via compileDesignerGraphToWeb5 and
 * submits the structured draft message to the active composer session.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import QuestCanvasNode from './QuestCanvasNode';
import { QuestPropertiesPanel } from './QuestPropertiesPanel';
import { DRAG_MIME, PaletteDragId, createNodeFromPalette, labelForPalette } from './nodeFactory';
import type { RFQuestData } from './flowAdapter';
import { reactFlowToDesignerGraph } from './flowAdapter';
import { compileDesignerGraphToWeb5 } from './compileDesignerGraphToWeb5';
import type { Web5QuestDraft } from './designerTypes';
import { useEditorTab } from '../../contexts/EditorTabContext';
import './GameBuilder.css';

const nodeTypes: NodeTypes = { questDesigner: QuestCanvasNode };

let nodeIdCounter = 0;

// ── Seed type (exported so GameBuilderPane can pass it) ──────────
export interface QuestSeed {
  name?: string;
  description?: string;
  gameSource?: string;
  rewardKarma?: number;
  rewardXP?: number;
  /** Objectives from the form — each becomes an Objective node */
  objectives?: Array<{ title: string; game?: string }>;
}

// ── Palette tiles ──────────────────────────────────────────────
const PALETTE_ITEMS: { id: PaletteDragId; label: string; sub: string; color: string }[] = [
  { id: 'quest_root',          label: 'Quest Root',    sub: 'Required: 1 per graph',   color: '#a78bfa' },
  { id: 'ogame_OurWorld',      label: 'Our World',     sub: 'GPS / real-world step',   color: '#4ade80' },
  { id: 'ogame_ODOOM',         label: 'ODOOM',         sub: 'Doom-engine objective',   color: '#4ade80' },
  { id: 'ogame_OQUAKE',        label: 'OQUAKE',        sub: 'Quake-engine objective',  color: '#4ade80' },
  { id: 'external_handoff',    label: 'External',      sub: 'OPortal / Telegram / URL',color: '#fbbf24' },
  { id: 'geohotspot_anchor',   label: 'GeoHotSpot',    sub: 'GPS anchor or holon ref', color: '#22d3d8' },
  { id: 'narrative_attachment',label: 'Narrative',     sub: 'Video / audio / text',    color: '#f472b6' },
];

// ── Graph builder — produces initial nodes + edges from optional seed ─
function makeGraphFromSeed(seed?: QuestSeed): { nodes: Node<RFQuestData>[]; edges: Edge[] } {
  const game = seed?.gameSource || 'OurWorld';
  const nodes: Node<RFQuestData>[] = [
    {
      id: 'n_root',
      type: 'questDesigner',
      position: { x: 180, y: 40 },
      data: {
        designer: {
          kind: 'quest_root',
          quest: {
            name:        seed?.name        || 'New Quest',
            description: seed?.description || 'Describe your quest.',
            rewardKarma: seed?.rewardKarma ?? 10,
            rewardXP:    seed?.rewardXP    ?? 50,
          },
        },
        paletteLabel: 'Quest',
      },
    },
  ];

  const edges: Edge[] = [];
  const seededObjectives = seed?.objectives?.filter((o) => o.title) ?? [];
  const objectiveList = seededObjectives.length > 0
    ? seededObjectives
    : [{ title: 'First Objective', game }];

  objectiveList.forEach((obj, i) => {
    const id = `n_obj${i + 1}`;
    nodes.push({
      id,
      type: 'questDesigner',
      position: { x: 180, y: 200 + i * 160 },
      data: {
        designer: {
          kind: 'ogame_objective',
          objective: {
            title:       obj.title,
            description: '',
            primaryGame: obj.game || game,
            requirements: {},
            gameLogic: { eventKind: 'pickup_item', primaryTargetId: '' },
          },
        },
        paletteLabel: obj.game || game,
      },
    });
    const src = i === 0 ? 'n_root' : `n_obj${i}`;
    edges.push({ id: `e_${src}_${id}`, source: src, target: id, animated: true, style: { stroke: '#4ade80' } });
  });

  return { nodes, edges };
}

// ── Build agent message from compiled draft ─────────────────────
function buildQuestMessage(draft: Web5QuestDraft): string {
  const objLines = draft.objectives
    .map((o, i) => `  ${i + 1}. **${o.title}** (${o.gameSource}): ${o.description}`)
    .join('\n');

  const meta = [
    draft.rewardKarma != null && `Karma reward: ${draft.rewardKarma}`,
    draft.rewardXP    != null && `XP reward: ${draft.rewardXP}`,
    draft.linkedGeoHotSpotId && `Linked GeoHotSpot: ${draft.linkedGeoHotSpotId}`,
  ].filter(Boolean).join('  ·  ');

  const slug = draft.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  return `Create a quest on STARNET using the following compiled WEB5 quest draft.

**Quest:** ${draft.name}
**Description:** ${draft.description}
${meta ? `**Metadata:** ${meta}` : ''}

**Objectives (${draft.objectives.length}, in sequence order):**
${objLines}

Compiled draft JSON:
\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Please:
1. Call \`star_create_quest\` with the data above
2. Write the compiled draft to \`quests/${slug}.json\` in the workspace
3. Return the STARNET quest ID`;
}

// ── Inner canvas (must be inside ReactFlowProvider) ─────────────
function QuestGraphCanvas({ onClose, seed }: { onClose: () => void; seed?: QuestSeed }) {
  const { nodes: initialNodes, edges: initialEdges } = makeGraphFromSeed(seed);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RFQuestData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('n_root');
  const [compileErrors, setCompileErrors] = useState<string[]>([]);
  const [compiled, setCompiled] = useState(false);

  const { screenToFlowPosition } = useReactFlow();
  const { submitBuilderMessage } = useEditorTab();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: '#4ade80' } }, eds)
      ),
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData(DRAG_MIME) as PaletteDragId;
      if (!raw) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const designer = createNodeFromPalette(raw);
      const id = `n_${++nodeIdCounter}`;
      const newNode: Node<RFQuestData> = {
        id,
        type: 'questDesigner',
        position: { x: position.x - 74, y: position.y - 24 },
        data: { designer, paletteLabel: labelForPalette(raw) },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
    },
    [screenToFlowPosition, setNodes]
  );

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handlePatch = useCallback(
    (updater: (prev: RFQuestData['designer']) => RFQuestData['designer']) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, designer: updater(n.data.designer) } }
            : n
        )
      );
    },
    [selectedNodeId, setNodes]
  );

  const handleCompileAndSend = useCallback(() => {
    const graph = reactFlowToDesignerGraph(nodes, edges);
    const result = compileDesignerGraphToWeb5(graph);
    setCompileErrors(result.errors);
    if (!result.draft) return;
    setCompiled(true);
    submitBuilderMessage(buildQuestMessage(result.draft));
  }, [nodes, edges, submitBuilderMessage]);

  const handleLoadDemo = useCallback(() => {
    const { nodes: n, edges: e } = makeGraphFromSeed();
    setNodes(n);
    setEdges(e);
    setSelectedNodeId('n_root');
    setCompileErrors([]);
    setCompiled(false);
  }, [setNodes, setEdges]);

  return (
    <div className="qgp-root">
      {/* Left palette */}
      <div className="qgp-palette">
        <div className="qgp-palette-heading">Drag to canvas</div>
        {PALETTE_ITEMS.map((item) => (
          <div
            key={item.id}
            className="qgp-palette-tile"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            style={{ '--tile-color': item.color } as React.CSSProperties}
          >
            <span className="qgp-tile-label">{item.label}</span>
            <span className="qgp-tile-sub">{item.sub}</span>
          </div>
        ))}
        <div className="qgp-palette-hint">
          Connect nodes top-to-bottom for sequence order.
        </div>
      </div>

      {/* Canvas */}
      <div className="qgp-canvas-wrap" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#4ade80', strokeWidth: 2 } }}
          style={{ background: '#111318' }}
        >
          <Background color="#2a2d38" gap={20} size={1} />
          <Controls style={{ background: '#1e2028', border: '1px solid #2a2d38', color: '#94a3b8' }} />
          <MiniMap
            style={{ background: '#1e2028', border: '1px solid #2a2d38' }}
            nodeColor={(n) => {
              const kind = (n.data as RFQuestData).designer.kind;
              const c: Record<string, string> = {
                quest_root: '#a78bfa', ogame_objective: '#4ade80',
                external_handoff: '#fbbf24', geohotspot_anchor: '#22d3d8',
                narrative_attachment: '#f472b6',
              };
              return c[kind] ?? '#4ade80';
            }}
          />
        </ReactFlow>

        {/* Compile errors badge */}
        {compileErrors.length > 0 && (
          <div className="qgp-errors">
            {compileErrors.map((e, i) => <div key={i} className="qgp-error-row">{e}</div>)}
          </div>
        )}
      </div>

      {/* Right properties panel */}
      <div className="qgp-props">
        <QuestPropertiesPanel node={selectedNode} onPatch={handlePatch} />
      </div>

      {/* Bottom bar */}
      <div className="qgp-footer">
        <button type="button" className="qgp-btn qgp-btn--ghost" onClick={handleLoadDemo}>
          Reset
        </button>
        <div className="qgp-footer-spacer" />
        {compiled && <span className="qgp-compiled-badge">Sent to agent</span>}
        <button type="button" className="qgp-btn qgp-btn--cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="qgp-btn qgp-btn--submit" onClick={handleCompileAndSend}>
          Compile + Create with Agent
        </button>
      </div>
    </div>
  );
}

// ── Public export (wraps with ReactFlowProvider) ─────────────────
export const QuestGraphPane: React.FC<{ onClose: () => void; seed?: QuestSeed }> = ({ onClose, seed }) => (
  <ReactFlowProvider>
    <QuestGraphCanvas onClose={onClose} seed={seed} />
  </ReactFlowProvider>
);
