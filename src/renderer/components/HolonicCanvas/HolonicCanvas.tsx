/**
 * HolonicCanvas — persistent always-on panel showing the live holon composition graph
 * for the current session.
 *
 * Lives alongside the Build plan / Editor panels. Auto-updates when the agent creates
 * or connects holons (session graph data is extracted from message tool-call results
 * in ComposerSessionPanel and passed down as props).
 *
 * Interactions:
 *  - Click a node      → side drawer with full metaData + STARNET status
 *  - Drag a new edge   → fires onConnect(parentId, childId) so caller can call holon_connect
 *  - "Verify" button   → fires onVerify(rootId) so caller can call holon_get_graph
 *  - "Export" button   → fires onExportDiagram(diagramJSON) to insert into chat
 *  - "Refresh" button  → fires onRefresh() to re-fetch session graph from MCP
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanvasHolonNode {
  id: string;
  label: string;
  holonType: string;
  description?: string;
  metaData?: Record<string, unknown>;
}

export interface CanvasEdge {
  source: string;
  target: string;
  label: string;
}

export interface HolonicCanvasProps {
  /** Holon nodes extracted from session tool-call results */
  nodes: CanvasHolonNode[];
  /** Edges between holons (parent-child or typed FK) */
  edges: CanvasEdge[];
  /** Total holon count including any not in this window */
  totalCount?: number;
  /** Called when user drags a new edge between nodes — trigger holon_connect */
  onConnect?: (parentId: string, childId: string) => void;
  /** Called when user clicks "Verify on STARNET" — trigger holon_get_graph(rootId) */
  onVerify?: (rootHolonId: string) => void;
  /** Called when user clicks "Export" — inserts diagram JSON into chat */
  onExportDiagram?: (diagramJson: string) => void;
  /** Called when user clicks "Refresh" — re-fetch holon_session_graph */
  onRefresh?: () => void;
  /** Whether the canvas is in a loading state (refresh in flight) */
  loading?: boolean;
}

// ─── Color palette (matches HolonDiagram.tsx) ────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  oapp:     { bg: '#1a2744', border: '#4f7dff', text: '#93b4ff' },
  template: { bg: '#1e2d1a', border: '#4daa6f', text: '#8fe0b0' },
  core:     { bg: '#2d1e2d', border: '#a060c0', text: '#d9a0f0' },
  service:  { bg: '#2d2a1a', border: '#c09040', text: '#f0d090' },
  custom:   { bg: '#1e2830', border: '#40a0c0', text: '#90d0f0' },
};

const HOLON_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  VenueHolon:         { bg: '#1e2830', border: '#40a0c0', text: '#90d0f0' },
  MenuItemHolon:      { bg: '#1a2744', border: '#4f7dff', text: '#93b4ff' },
  CartHolon:          { bg: '#2d2a1a', border: '#c09040', text: '#f0d090' },
  DeliveryOrderHolon: { bg: '#2d1e1a', border: '#c04040', text: '#f09090' },
  UserProfileHolon:   { bg: '#2d1e2d', border: '#a060c0', text: '#d9a0f0' },
  CourseHolon:        { bg: '#1e2d1a', border: '#4daa6f', text: '#8fe0b0' },
  LessonHolon:        { bg: '#1e2d20', border: '#3dca6f', text: '#7fe0a0' },
  AgentHolon:         { bg: '#1a1a2d', border: '#6060c0', text: '#b0b0f0' },
};

const DEFAULT_COLOR = { bg: '#1e1e2e', border: '#555577', text: '#ccccdd' };

function colorFor(holonType: string) {
  return HOLON_COLORS[holonType] ?? TYPE_COLORS[holonType] ?? DEFAULT_COLOR;
}

// ─── Canvas holon node ────────────────────────────────────────────────────────

interface CanvasNodeData {
  label: string;
  holonType: string;
  description?: string;
  metaData?: Record<string, unknown>;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function CanvasHolonNodeComponent({ id, data }: NodeProps) {
  const d = data as CanvasNodeData;
  const c = colorFor(d.holonType);
  return (
    <div
      onClick={() => d.onSelect(id)}
      style={{
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        borderRadius: 10,
        padding: '10px 16px',
        minWidth: 150,
        maxWidth: 240,
        boxShadow: `0 0 10px ${c.border}44`,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: c.border, width: 10, height: 10 }} />
      <div style={{ fontSize: 10, color: c.border, fontFamily: 'monospace', marginBottom: 3, letterSpacing: 0.5 }}>
        {d.holonType}
      </div>
      <div style={{ fontWeight: 700, color: c.text, fontSize: 13, wordBreak: 'break-word', lineHeight: 1.3 }}>
        {d.label}
      </div>
      {d.description && (
        <div style={{ color: '#888', fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
          {d.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: c.border, width: 10, height: 10 }} />
    </div>
  );
}

const NODE_TYPES = { holonCanvas: CanvasHolonNodeComponent };

// ─── Auto-layout (left-to-right layered) ─────────────────────────────────────

function autoLayout(
  rawNodes: CanvasHolonNode[],
  rawEdges: CanvasEdge[]
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

  const X_GAP = 270;
  const Y_GAP = 130;
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of byLayer) {
    const totalH = ids.length * Y_GAP;
    ids.forEach((id, i) => {
      posMap.set(id, { x: l * X_GAP, y: i * Y_GAP - totalH / 2 });
    });
  }

  return {
    nodes: rawNodes.map((n) => ({
      id: n.id,
      type: 'holonCanvas',
      position: posMap.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        holonType: n.holonType,
        description: n.description,
        metaData: n.metaData,
        onSelect: () => {},
      },
    })),
    edges: rawEdges.map((e, i) => ({
      id: `e${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: true,
      style: { stroke: '#4455aa', strokeWidth: 2 },
      labelStyle: { fill: '#aaa', fontSize: 11 },
      labelBgStyle: { fill: '#1a1a2e' },
    })),
  };
}

// ─── Node detail drawer ───────────────────────────────────────────────────────

function NodeDetailDrawer({
  node,
  onClose,
  onVerify,
}: {
  node: CanvasHolonNode;
  onClose: () => void;
  onVerify?: (id: string) => void;
}) {
  const c = colorFor(node.holonType);
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: '#13131f',
        borderLeft: `1px solid ${c.border}`,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px #00000066',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${c.border}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: c.border, fontFamily: 'monospace', marginBottom: 2 }}>
            {node.holonType}
          </div>
          <div style={{ color: c.text, fontWeight: 700, fontSize: 13 }}>{node.label}</div>
          <div style={{ color: '#666', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
            {node.id}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* MetaData */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <div style={{ color: '#888', fontSize: 10, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          metaData
        </div>
        {node.metaData ? (
          <pre
            style={{
              fontSize: 11,
              color: '#aaa',
              background: '#0d0d1a',
              borderRadius: 6,
              padding: 10,
              overflow: 'auto',
              margin: 0,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(node.metaData, null, 2)}
          </pre>
        ) : (
          <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>No metaData available</div>
        )}
      </div>

      {/* Actions */}
      {onVerify && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e1e2e' }}>
          <button
            onClick={() => onVerify(node.id)}
            style={{
              width: '100%',
              background: '#1a2744',
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              color: c.text,
              fontSize: 12,
              padding: '7px 0',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Verify on STARNET ↗
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main canvas graph ────────────────────────────────────────────────────────

function CanvasGraph({
  rawNodes,
  rawEdges,
  onConnectEdge,
  onSelectNode,
}: {
  rawNodes: CanvasHolonNode[];
  rawEdges: CanvasEdge[];
  onConnectEdge: (parentId: string, childId: string) => void;
  onSelectNode: (id: string) => void;
}) {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => autoLayout(rawNodes, rawEdges),
    [rawNodes, rawEdges]
  );

  const nodesWithCallback = useMemo(
    () => initNodes.map((n) => ({
      ...n,
      data: { ...n.data, onSelect: onSelectNode },
    })),
    [initNodes, onSelectNode]
  );

  const [nodes, , onNodesChange] = useNodesState(nodesWithCallback);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onConnectEdge(connection.source, connection.target);
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              animated: true,
              label: 'connect',
              style: { stroke: '#4daa6f', strokeWidth: 2 },
            },
            eds
          )
        );
      }
    },
    [onConnectEdge, setEdges]
  );

  const onInit = useCallback((instance: { fitView: () => void }) => {
    setTimeout(() => instance.fitView(), 80);
  }, []);

  // Re-sync when upstream data changes
  const prevNodesRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(rawNodes.map((n) => n.id));
    if (key !== prevNodesRef.current) {
      prevNodesRef.current = key;
    }
  }, [rawNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onInit={onInit}
      fitView
      minZoom={0.15}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      connectOnClick={false}
    >
      <Background color="#1a1a2e" gap={22} />
      <Controls style={{ background: '#13131f', border: '1px solid #2a2a3e' }} />
      <MiniMap
        style={{ background: '#0d0d1a', border: '1px solid #2a2a3e' }}
        nodeColor={(n) => colorFor((n.data as CanvasNodeData).holonType).border}
        maskColor="#00000066"
      />
    </ReactFlow>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export const HolonicCanvas: React.FC<HolonicCanvasProps> = ({
  nodes: rawNodes,
  edges: rawEdges,
  totalCount,
  onConnect,
  onVerify,
  onExportDiagram,
  onRefresh,
  loading = false,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => rawNodes.find((n) => n.id === selectedNodeId) ?? null,
    [rawNodes, selectedNodeId]
  );

  const handleConnect = useCallback(
    (parentId: string, childId: string) => {
      onConnect?.(parentId, childId);
    },
    [onConnect]
  );

  const handleExport = useCallback(() => {
    const diagram = {
      nodes: rawNodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: 'custom',
        description: n.description ?? n.holonType,
      })),
      edges: rawEdges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
    };
    onExportDiagram?.(JSON.stringify(diagram, null, 2));
  }, [rawNodes, rawEdges, onExportDiagram]);

  const hasNodes = rawNodes.length > 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0d0d1a',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 40,
          background: '#111120',
          borderBottom: '1px solid #1e1e2e',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#6060a0', fontSize: 11, fontFamily: 'monospace', marginRight: 4 }}>
          ◈ Holonic Canvas
        </span>
        <span style={{ color: '#555', fontSize: 11 }}>
          {hasNodes
            ? `${rawNodes.length} holons${totalCount && totalCount > rawNodes.length ? ` of ${totalCount}` : ''} · ${rawEdges.length} edges`
            : 'No holons yet'}
        </span>
        <div style={{ flex: 1 }} />
        {hasNodes && onExportDiagram && (
          <ToolbarButton onClick={handleExport} title="Insert as diagram into chat">
            Export ↗
          </ToolbarButton>
        )}
        {hasNodes && onVerify && selectedNodeId && (
          <ToolbarButton onClick={() => onVerify(selectedNodeId)} title="Verify selected holon's graph on STARNET">
            Verify STARNET
          </ToolbarButton>
        )}
        {onRefresh && (
          <ToolbarButton onClick={onRefresh} loading={loading} title="Re-fetch session graph from MCP">
            {loading ? '…' : '⟳ Refresh'}
          </ToolbarButton>
        )}
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!hasNodes ? (
          <EmptyState />
        ) : (
          <ReactFlowProvider>
            <CanvasGraph
              rawNodes={rawNodes}
              rawEdges={rawEdges}
              onConnectEdge={handleConnect}
              onSelectNode={(id) => setSelectedNodeId((prev) => (prev === id ? null : id))}
            />
            {/* Panel hint */}
            <Panel position="top-left">
              <div
                style={{
                  background: '#111120cc',
                  border: '1px solid #2a2a3e',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 10,
                  color: '#555',
                  fontFamily: 'monospace',
                }}
              >
                Click node to inspect · Drag handle to connect
              </div>
            </Panel>
          </ReactFlowProvider>
        )}

        {/* Node detail drawer */}
        {selectedNode && (
          <NodeDetailDrawer
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onVerify={onVerify}
          />
        )}
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  children,
  title,
  loading,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={loading}
      style={{
        background: '#1a1a2d',
        border: '1px solid #2a2a4a',
        borderRadius: 5,
        color: loading ? '#444' : '#9090c0',
        fontSize: 11,
        padding: '3px 10px',
        cursor: loading ? 'default' : 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: '#444',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 36, opacity: 0.4 }}>◈</div>
      <div style={{ fontSize: 13, color: '#555', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
        Holonic Canvas
      </div>
      <div style={{ fontSize: 11, color: '#3a3a5a', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
        Holons created during this session will appear here automatically.
        Ask the agent to build something with holons to get started.
      </div>
    </div>
  );
}
