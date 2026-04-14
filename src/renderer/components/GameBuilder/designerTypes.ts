/**
 * Quest visual designer — graph types (David / OGEngine brief).
 * Consumed by compileDesignerGraphToWeb5.ts and future React Flow UI.
 */

/** Palette / dropped node kinds */
export type QuestDesignerNodeKind =
  | 'quest_root'
  | 'ogame_objective'
  | 'external_handoff'
  | 'geohotspot_anchor'
  | 'narrative_attachment'

/** Known OGAME surfaces (extend as products ship) */
export type OgameSurfaceId = 'OurWorld' | 'ODOOM' | 'OQUAKE' | string

export interface QuestDesignerPosition {
  x: number
  y: number
}

/** Per-game requirement hints — values feed STAR dictionary lists (game id → string tallies / keys). */
export interface GameRequirementHints {
  /** e.g. ODOOM → ["RedDoor:MAP01:sector_12"] */
  needToCollectItems?: Record<string, string[]>
  needToCollectKeys?: Record<string, string[]>
  needToKillMonsters?: Record<string, string[]>
  needToCompleteLevel?: Record<string, string[]>
  needToGoToGeoHotSpots?: Record<string, string[]>
}

export type NarrativeTrigger =
  | 'geohotspot_arrive'
  | 'objective_complete'
  | 'quest_complete'

export interface DesignerNarrative {
  trigger: NarrativeTrigger
  videoUrl?: string
  audioUrl?: string
  text?: string
  websiteUrl?: string
}

/**
 * Authoring-time “game logic” — not executable script; tells integrators which in-engine
 * event should call STARAPIClient. Matches strings to requirement dictionaries where possible.
 */
export type InGameEventKind =
  | 'pickup_item'
  | 'pickup_key'
  | 'kill_monster'
  | 'complete_level'
  | 'use_line_special'
  | 'geo_arrive'
  | 'custom'

export interface GameLogicHook {
  eventKind: InGameEventKind
  /** Item name, key id, monster class, level name, linedef tag, etc. */
  primaryTargetId: string
  mapOrLevel?: string
  sectorOrEntityRef?: string
  implementerNotes?: string
}

export interface QuestRootData {
  name: string
  description: string
  linkedGeoHotSpotId?: string
  externalHandoffUri?: string
  rewardKarma?: number
  rewardXP?: number
}

export interface OgameObjectiveData {
  title: string
  description: string
  /** Primary STAR gameSource / client_game_source */
  primaryGame: OgameSurfaceId
  /** Optional secondary games on same step (cross-link in one objective) */
  requirements: GameRequirementHints
  linkedGeoHotSpotId?: string
  externalHandoffUri?: string
  /** Authoring: map id, geoId, lat/long — may be copied into description until first-class meta exists */
  mapId?: string
  geoId?: string
  latitude?: number
  longitude?: number
  narrative?: DesignerNarrative[]
  /** Which in-game event should report to STAR (drives suggested snippets). */
  gameLogic?: GameLogicHook
}

export interface ExternalHandoffData {
  title: string
  description: string
  externalHandoffUri: string
  /** After player completes external task */
  completionHint?: string
}

export interface GeoHotspotAnchorData {
  /** Existing holon */
  linkedGeoHotSpotId?: string
  /** Draft for POST /api/geohotspots — compiler may emit separate “create hotspot” instructions */
  draftLat?: number
  draftLong?: number
  draftRadiusMetres?: number
  draftType?: string
  audioUrl?: string
  videoUrl?: string
  textContent?: string
  websiteUrl?: string
}

export interface NarrativeAttachmentData {
  narrative: DesignerNarrative
  attachTo: 'quest' | 'objective'
  /** Set when attached to objective */
  objectiveNodeId?: string
}

export type QuestDesignerNodeData =
  | { kind: 'quest_root'; quest: QuestRootData }
  | { kind: 'ogame_objective'; objective: OgameObjectiveData }
  | { kind: 'external_handoff'; handoff: ExternalHandoffData }
  | { kind: 'geohotspot_anchor'; hotspot: GeoHotspotAnchorData }
  | { kind: 'narrative_attachment'; attachment: NarrativeAttachmentData }

export interface QuestDesignerNode {
  id: string
  position: QuestDesignerPosition
  data: QuestDesignerNodeData
}

/** Edge: sequence (A before B) or symbolic link for UI only */
export type QuestDesignerEdgeKind = 'sequence' | 'symbolic_link'

export interface QuestDesignerEdge {
  id: string
  source: string
  target: string
  kind: QuestDesignerEdgeKind
}

export interface QuestDesignerGraph {
  nodes: QuestDesignerNode[]
  edges: QuestDesignerEdge[]
}

/** Compiled payload — map to STAR CreateQuest / objectives API (field names per deployed controller). */
export interface Web5ObjectiveDraft {
  order: number
  title: string
  description: string
  gameSource: string
  linkedGeoHotSpotId?: string
  externalHandoffUri?: string
  dictionaries: Record<string, Record<string, string[]>>
  /** Until API supports narrative triggers, clients read this */
  designerNarrative?: DesignerNarrative[]
  gameLogic?: GameLogicHook
  /** Copy-paste hints for engine integrators (not executed by WEB5). */
  suggestedStarIntegration?: string[]
}

export interface Web5QuestDraft {
  name: string
  description: string
  linkedGeoHotSpotId?: string
  externalHandoffUri?: string
  rewardKarma?: number
  rewardXP?: number
  objectives: Web5ObjectiveDraft[]
}

export interface CompileResult {
  ok: boolean
  errors: string[]
  draft?: Web5QuestDraft
}
