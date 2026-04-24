/**
 * Compiles a quest designer graph into a Web5QuestDraft for STAR quest create flows.
 * Algorithm: find quest_root → topo-sort ogame_objective + external_handoff nodes via sequence edges
 * → merge geohotspot_anchor + narrative_attachment hints into objectives/quest.
 */

import type {
  CompileResult,
  DesignerNarrative,
  GameRequirementHints,
  QuestDesignerEdge,
  QuestDesignerGraph,
  QuestDesignerNode,
  Web5ObjectiveDraft,
  Web5QuestDraft,
} from './designerTypes'
import { buildIntegrationSnippet } from './integrationSnippet'

function isObjectiveLike(
  n: QuestDesignerNode
): n is QuestDesignerNode & {
  data: { kind: 'ogame_objective' } | { kind: 'external_handoff' }
} {
  return n.data.kind === 'ogame_objective' || n.data.kind === 'external_handoff'
}

/** Topological order of objective-like nodes reachable from roots following only `sequence` edges */
function topoObjectiveOrder(
  nodes: QuestDesignerNode[],
  edges: QuestDesignerEdge[]
): { order: string[]; errors: string[] } {
  const errors: string[] = []
  const seqEdges = edges.filter(e => e.kind === 'sequence')
  const objLike = new Set(nodes.filter(isObjectiveLike).map(n => n.id))

  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  for (const id of objLike) {
    incoming.set(id, 0)
    outgoing.set(id, [])
  }

  for (const e of seqEdges) {
    if (!objLike.has(e.source) || !objLike.has(e.target)) continue
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
    const arr = outgoing.get(e.source) ?? []
    arr.push(e.target)
    outgoing.set(e.source, arr)
  }

  const roots = [...objLike].filter(id => (incoming.get(id) ?? 0) === 0)
  if (roots.length === 0 && objLike.size > 0) {
    errors.push('No objective root found (cycle or missing sequence edges between objectives).')
    return { order: [...objLike], errors }
  }

  const result: string[] = []
  const queue = [...roots]
  const seen = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
    for (const t of outgoing.get(id) ?? []) {
      const inc = (incoming.get(t) ?? 0) - 1
      incoming.set(t, inc)
      if (inc === 0) queue.push(t)
    }
  }

  if (seen.size !== objLike.size) {
    errors.push('Objective graph has a cycle or disconnected objectives; order may be incomplete.')
    for (const id of objLike)
      if (!seen.has(id)) result.push(id)
  }

  return { order: result, errors }
}

function hintsToDictionaries(
  hints: GameRequirementHints
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {}
  const pairs: [keyof GameRequirementHints, string][] = [
    ['needToCollectItems', 'NeedToCollectItems'],
    ['needToCollectKeys', 'NeedToCollectKeys'],
    ['needToKillMonsters', 'NeedToKillMonsters'],
    ['needToCompleteLevel', 'NeedToCompleteLevel'],
    ['needToGoToGeoHotSpots', 'NeedToGoToGeoHotSpots'],
  ]
  for (const [hintKey, apiKey] of pairs) {
    const dict = hints[hintKey]
    if (!dict || Object.keys(dict).length === 0) continue
    out[apiKey] = { ...dict }
  }
  return out
}

/**
 * Main entry: designer graph → Web5QuestDraft.
 */
export function compileDesignerGraphToWeb5(graph: QuestDesignerGraph): CompileResult {
  const errors: string[] = []
  const root = graph.nodes.find(n => n.data.kind === 'quest_root')
  if (!root || root.data.kind !== 'quest_root') {
    return { ok: false, errors: ['Graph must contain exactly one quest_root node.'] }
  }

  const quest = root.data.quest
  const { order: objOrder, errors: topoErrors } = topoObjectiveOrder(graph.nodes, graph.edges)
  errors.push(...topoErrors)

  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  const questNarratives: DesignerNarrative[] = []
  const hotspotByObjective = new Map<string, string>()
  const narrativeByObjective = new Map<string, DesignerNarrative[]>()

  for (const n of graph.nodes) {
    if (n.data.kind === 'narrative_attachment') {
      const a = n.data.attachment
      if (a.attachTo === 'quest') questNarratives.push(a.narrative)
      else if (a.objectiveNodeId) {
        const list = narrativeByObjective.get(a.objectiveNodeId) ?? []
        list.push(a.narrative)
        narrativeByObjective.set(a.objectiveNodeId, list)
      }
    }
    if (n.data.kind === 'geohotspot_anchor' && n.data.hotspot.linkedGeoHotSpotId) {
      /* Link hotspot to objectives that have a sequence edge from this node — simplified: store on nodes that reference id in edges */
      void n
    }
  }

  // Wire geohotspot_anchor → objective via sequence edge (hotspot -> objective)
  for (const e of graph.edges) {
    if (e.kind !== 'sequence') continue
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (src?.data.kind === 'geohotspot_anchor' && tgt && isObjectiveLike(tgt)) {
      const hid = src.data.hotspot.linkedGeoHotSpotId
      if (hid) hotspotByObjective.set(tgt.id, hid)
    }
  }

  const objectives: Web5ObjectiveDraft[] = []
  let ord = 0
  for (const oid of objOrder) {
    const n = byId.get(oid)
    if (!n || !isObjectiveLike(n)) continue

    if (n.data.kind === 'ogame_objective') {
      const o = n.data.objective
      const extraDescParts: string[] = []
      if (o.mapId) extraDescParts.push(`[map:${o.mapId}]`)
      if (o.geoId) extraDescParts.push(`[geoId:${o.geoId}]`)
      if (o.latitude != null && o.longitude != null)
        extraDescParts.push(`[lat:${o.latitude},lng:${o.longitude}]`)

      const desc =
        extraDescParts.length > 0
          ? `${o.description}\n${extraDescParts.join(' ')}`.trim()
          : o.description

      const linked =
        o.linkedGeoHotSpotId ?? hotspotByObjective.get(n.id)

      const narratives: DesignerNarrative[] = [
        ...(o.narrative ?? []),
        ...(narrativeByObjective.get(n.id) ?? []),
      ]

      objectives.push({
        order: ord++,
        title: o.title,
        description: desc,
        gameSource: o.primaryGame,
        linkedGeoHotSpotId: linked,
        externalHandoffUri: o.externalHandoffUri,
        dictionaries: hintsToDictionaries(o.requirements),
        designerNarrative: narratives.length ? narratives : undefined,
        gameLogic: o.gameLogic,
        suggestedStarIntegration: buildIntegrationSnippet(o.primaryGame, o.gameLogic),
      })
    } else if (n.data.kind === 'external_handoff') {
      const h = n.data.handoff
      objectives.push({
        order: ord++,
        title: h.title,
        description: [h.description, h.completionHint].filter(Boolean).join('\n'),
        gameSource: 'External',
        externalHandoffUri: h.externalHandoffUri,
        dictionaries: {},
        designerNarrative: narrativeByObjective.get(n.id),
        suggestedStarIntegration: [
          `// Open handoff: ${h.externalHandoffUri}`,
          '// When player has code / proof — from OPortal, bot, or manual UI:',
          'star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "External");',
        ],
      })
    }
  }

  const draft: Web5QuestDraft = {
    name: quest.name,
    description: quest.description,
    linkedGeoHotSpotId: quest.linkedGeoHotSpotId,
    externalHandoffUri: quest.externalHandoffUri,
    rewardKarma: quest.rewardKarma,
    rewardXP: quest.rewardXP,
    objectives,
  }

  if (questNarratives.length) {
    /* Attach quest-level narrative for clients — no standard field yet */
    draft.description =
      `${draft.description}\n\n[designer:questNarrative=${JSON.stringify(questNarratives)}]`.trim()
  }

  if (objectives.length === 0)
    errors.push('No objectives compiled — add ogame_objective or external_handoff nodes.')

  return {
    ok: errors.length === 0,
    errors,
    draft,
  }
}
