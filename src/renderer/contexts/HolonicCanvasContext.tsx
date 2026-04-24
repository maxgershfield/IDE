/**
 * HolonicCanvasContext — shared state for the live holonic composition graph.
 *
 * Producer: ComposerSessionPanel (writes on every message with tool-call results)
 * Consumer: HolonicCanvas panel in Editor.tsx (reads to render the live graph)
 *
 * This solves the persistence problem: the canvas stays populated even when you
 * scroll past the <oasis_holon_diagram> chip in the chat thread.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import type { CanvasHolonNode, CanvasEdge } from '../components/HolonicCanvas/HolonicCanvas';

// Re-export for convenience
export type { CanvasHolonNode, CanvasEdge };

interface HolonicCanvasState {
  nodes: CanvasHolonNode[];
  edges: CanvasEdge[];
  lastUpdated: number;
}

interface HolonicCanvasContextValue extends HolonicCanvasState {
  /** Replace the full canvas graph (called from ComposerSessionPanel after each turn) */
  setCanvasGraph: (nodes: CanvasHolonNode[], edges: CanvasEdge[]) => void;
  /** Merge new nodes/edges into the existing graph (additive update) */
  mergeCanvasGraph: (nodes: CanvasHolonNode[], edges: CanvasEdge[]) => void;
  /** Add a single edge (called when holon_connect fires) */
  addCanvasEdge: (source: string, target: string, label: string) => void;
  /** Reset (called when conversation is cleared) */
  clearCanvas: () => void;
  /** Whether the canvas tab should show a badge (new holons since last view) */
  unviewedCount: number;
  markViewed: () => void;
}

const HolonicCanvasContext = createContext<HolonicCanvasContextValue | null>(null);

export function HolonicCanvasProvider({ children }: { children: React.ReactNode }) {
  const [graph, setGraph] = useState<HolonicCanvasState>({ nodes: [], edges: [], lastUpdated: 0 });
  const [lastViewedCount, setLastViewedCount] = useState(0);

  const setCanvasGraph = useCallback((nodes: CanvasHolonNode[], edges: CanvasEdge[]) => {
    setGraph({ nodes, edges, lastUpdated: Date.now() });
  }, []);

  const mergeCanvasGraph = useCallback((newNodes: CanvasHolonNode[], newEdges: CanvasEdge[]) => {
    setGraph((prev) => {
      const nodeMap = new Map(prev.nodes.map((n) => [n.id, n]));
      for (const n of newNodes) nodeMap.set(n.id, n);

      const edgeKey = (e: CanvasEdge) => `${e.source}→${e.target}:${e.label}`;
      const edgeSet = new Set(prev.edges.map(edgeKey));
      const mergedEdges = [...prev.edges];
      for (const e of newEdges) {
        if (!edgeSet.has(edgeKey(e))) mergedEdges.push(e);
      }
      return { nodes: Array.from(nodeMap.values()), edges: mergedEdges, lastUpdated: Date.now() };
    });
  }, []);

  const addCanvasEdge = useCallback((source: string, target: string, label: string) => {
    setGraph((prev) => {
      const already = prev.edges.some((e) => e.source === source && e.target === target && e.label === label);
      if (already) return prev;
      return { ...prev, edges: [...prev.edges, { source, target, label }], lastUpdated: Date.now() };
    });
  }, []);

  const clearCanvas = useCallback(() => {
    setGraph({ nodes: [], edges: [], lastUpdated: Date.now() });
    setLastViewedCount(0);
  }, []);

  const markViewed = useCallback(() => {
    setLastViewedCount(graph.nodes.length);
  }, [graph.nodes.length]);

  const unviewedCount = Math.max(0, graph.nodes.length - lastViewedCount);

  return (
    <HolonicCanvasContext.Provider
      value={{
        ...graph,
        setCanvasGraph,
        mergeCanvasGraph,
        addCanvasEdge,
        clearCanvas,
        unviewedCount,
        markViewed,
      }}
    >
      {children}
    </HolonicCanvasContext.Provider>
  );
}

export function useHolonicCanvas(): HolonicCanvasContextValue {
  const ctx = useContext(HolonicCanvasContext);
  if (!ctx) throw new Error('useHolonicCanvas must be inside HolonicCanvasProvider');
  return ctx;
}
