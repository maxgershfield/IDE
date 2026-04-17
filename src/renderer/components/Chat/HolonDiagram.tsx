/**
 * HolonDiagram — renders an <oasis_holon_diagram> JSON block emitted by the AI.
 *
 * Schema the model emits:
 * {
 *   "nodes": [{ "id": string, "label": string, "type"?: "oapp"|"template"|"core"|"custom"|"service", "description"?: string }],
 *   "edges": [{ "source": string, "target": string, "label"?: string }]
 * }
 *
 * UX: collapsed chip by default. Click "View diagram" to expand inline. No minimap.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ---------- types ----------

export interface HolonNodeData {
  label: string;
  holonType: string;
  description?: string;
  [key: string]: unknown;
}

export interface HolonDiagramSchema {
  nodes: Array<{ id: string; label: string; type?: string; description?: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
}

// ---------- colour map ----------

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  oapp:     { bg: '#1a2744', border: '#4f7dff', text: '#93b4ff' },
  template: { bg: '#1e2d1a', border: '#4daa6f', text: '#8fe0b0' },
  core:     { bg: '#2d1e2d', border: '#a060c0', text: '#d9a0f0' },
  service:  { bg: '#2d2a1a', border: '#c09040', text: '#f0d090' },
  custom:   { bg: '#1e2830', border: '#40a0c0', text: '#90d0f0' },
};

const DEFAULT_COLOR = { bg: '#1e1e2e', border: '#555577', text: '#ccccdd' };

function colorFor(type: string | undefined) {
  return TYPE_COLORS[type ?? ''] ?? DEFAULT_COLOR;
}

// ---------- custom node ----------

function HolonNode({ data }: NodeProps) {
  const d = data as HolonNodeData;
  const c = colorFor(d.holonType);
  return (
    <div
      style={{
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        borderRadius: 8,
        padding: '8px 14px',
        minWidth: 140,
        maxWidth: 230,
        boxShadow: `0 0 8px ${c.border}33`,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: c.border }} />
      <div style={{ fontSize: 11, color: c.border, fontFamily: 'monospace', marginBottom: 2 }}>
        {d.holonType ?? 'holon'}
      </div>
      <div style={{ fontWeight: 700, color: c.text, fontSize: 13, wordBreak: 'break-word' }}>
        {d.label}
      </div>
      {d.description && (
        <div style={{ color: '#888', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
          {d.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: c.border }} />
    </div>
  );
}

const NODE_TYPES = { holon: HolonNode };

// ---------- auto-layout (simple left-to-right layered) ----------

function autoLayout(
  rawNodes: HolonDiagramSchema['nodes'],
  rawEdges: HolonDiagramSchema['edges']
): { nodes: Node[]; edges: Edge[] } {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of rawNodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of rawEdges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adj.get(e.source)?.push(e.target);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) { queue.push(id); layer.set(id, 0); }
  if (queue.length === 0 && rawNodes.length > 0) { queue.push(rawNodes[0].id); layer.set(rawNodes[0].id, 0); }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLayer = layer.get(cur) ?? 0;
    for (const next of (adj.get(cur) ?? [])) {
      if ((layer.get(next) ?? -1) < curLayer + 1) {
        layer.set(next, curLayer + 1);
        queue.push(next);
      }
    }
  }

  const byLayer = new Map<number, string[]>();
  for (const n of rawNodes) {
    const l = layer.get(n.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n.id);
  }

  const X_GAP = 250;
  const Y_GAP = 120;
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of byLayer) {
    const totalH = ids.length * Y_GAP;
    ids.forEach((id, i) => {
      posMap.set(id, { x: l * X_GAP, y: i * Y_GAP - totalH / 2 });
    });
  }

  const nodes: Node[] = rawNodes.map((n) => ({
    id: n.id,
    type: 'holon',
    position: posMap.get(n.id) ?? { x: 0, y: 0 },
    data: { label: n.label, holonType: n.type ?? 'custom', description: n.description },
  }));

  const edges: Edge[] = rawEdges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: '#4455aa', strokeWidth: 1.5 },
    labelStyle: { fill: '#aaa', fontSize: 11 },
    labelBgStyle: { fill: '#1a1a2e' },
  }));

  return { nodes, edges };
}

// ---------- inner graph ----------

function HolonGraph({ schema }: { schema: HolonDiagramSchema }) {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => autoLayout(schema.nodes, schema.edges),
    [schema]
  );
  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 60);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={onInit}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#2a2a3e" gap={20} />
      <Controls style={{ background: '#1a1a2e', border: '1px solid #333' }} />
    </ReactFlow>
  );
}

// ---------- collapsed chip (default) ----------

interface TypeCounts {
  [type: string]: number;
}

function DiagramChip({
  schema,
  onOpen,
}: {
  schema: HolonDiagramSchema;
  onOpen: () => void;
}) {
  const typeCounts = useMemo<TypeCounts>(() => {
    const counts: TypeCounts = {};
    for (const n of schema.nodes) {
      const t = n.type ?? 'custom';
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [schema]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: '#12121e',
        border: '1px solid #2a2a4a',
        borderRadius: 8,
        padding: '8px 14px',
        margin: '8px 0',
        cursor: 'default',
      }}
    >
      {/* type swatches */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {Object.entries(typeCounts).map(([type, count]) => {
          const c = colorFor(type);
          return (
            <div
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 11,
                color: c.text,
                fontFamily: 'monospace',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: c.border,
                  flexShrink: 0,
                }}
              />
              {count > 1 ? `${count}× ` : ''}{type}
            </div>
          );
        })}
      </div>

      <div style={{ color: '#555', fontSize: 12 }}>
        {schema.nodes.length} nodes · {schema.edges.length} edges
      </div>

      <button
        onClick={onOpen}
        style={{
          background: '#1e2a4a',
          border: '1px solid #4f7dff',
          borderRadius: 5,
          color: '#93b4ff',
          fontSize: 12,
          padding: '4px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        View diagram ↗
      </button>
    </div>
  );
}

// ---------- public component ----------

export interface HolonDiagramProps {
  source: string;
}

export const HolonDiagram: React.FC<HolonDiagramProps> = ({ source }) => {
  const [expanded, setExpanded] = useState(false);

  const schema = useMemo<HolonDiagramSchema | null>(() => {
    try {
      const parsed = typeof source === 'string' ? JSON.parse(source) : source;
      if (!Array.isArray(parsed?.nodes)) return null;
      return parsed as HolonDiagramSchema;
    } catch {
      return null;
    }
  }, [source]);

  if (!schema || schema.nodes.length === 0) {
    return (
      <div style={{ color: '#555', fontSize: 12, padding: '4px 0', fontStyle: 'italic' }}>
        [holon diagram — could not parse schema]
      </div>
    );
  }

  const height = Math.max(260, Math.min(520, schema.nodes.length * 100));

  return (
    <div style={{ margin: '6px 0' }}>
      <DiagramChip schema={schema} onOpen={() => setExpanded((v) => !v)} />

      {expanded && (
        <div
          style={{
            width: '100%',
            height,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid #2a2a4a',
            background: '#11111e',
            marginTop: 6,
            position: 'relative',
          }}
        >
          {/* close button */}
          <button
            onClick={() => setExpanded(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              background: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: 5,
              color: '#888',
              fontSize: 12,
              padding: '3px 9px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close ✕
          </button>

          <ReactFlowProvider>
            <HolonGraph schema={schema} />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
};
