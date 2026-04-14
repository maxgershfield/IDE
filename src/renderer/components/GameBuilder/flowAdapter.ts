import type { Edge, Node } from '@xyflow/react'
import type { QuestDesignerEdge, QuestDesignerGraph, QuestDesignerNodeData } from './designerTypes'

export type RFQuestData = {
  designer: QuestDesignerNodeData
  paletteLabel: string
}

export function reactFlowToDesignerGraph(
  nodes: Node<RFQuestData>[],
  edges: Edge[]
): QuestDesignerGraph {
  const qNodes = nodes.map(n => ({
    id: n.id,
    position: { x: n.position.x, y: n.position.y },
    data: n.data.designer,
  }))

  const qEdges: QuestDesignerEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: (e.data as { kind?: 'sequence' | 'symbolic_link' } | undefined)?.kind ?? 'sequence',
  }))

  return { nodes: qNodes, edges: qEdges }
}
