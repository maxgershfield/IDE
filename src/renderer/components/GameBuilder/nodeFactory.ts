import type { QuestDesignerNodeData } from './designerTypes'

/** MIME type for palette drag */
export const DRAG_MIME = 'application/oasis-quest-designer'

export type PaletteDragId =
  | 'quest_root'
  | 'ogame_ODOOM'
  | 'ogame_OQUAKE'
  | 'ogame_OurWorld'
  | 'external_handoff'
  | 'geohotspot_anchor'
  | 'narrative_attachment'

export function labelForPalette(id: PaletteDragId): string {
  const m: Record<PaletteDragId, string> = {
    quest_root: 'Quest',
    ogame_ODOOM: 'ODOOM',
    ogame_OQUAKE: 'OQUAKE',
    ogame_OurWorld: 'Our World',
    external_handoff: 'External / OPortal / TG',
    geohotspot_anchor: 'GeoHotSpot',
    narrative_attachment: 'Narrative',
  }
  return m[id]
}

export function createNodeFromPalette(id: PaletteDragId): QuestDesignerNodeData {
  switch (id) {
    case 'quest_root':
      return {
        kind: 'quest_root',
        quest: {
          name: 'Cross-game quest',
          description: 'Author in the canvas; export compiles to WEB5 draft.',
          rewardKarma: 10,
          rewardXP: 50,
        },
      }
    case 'ogame_ODOOM':
      return {
        kind: 'ogame_objective',
        objective: {
          title: 'ODOOM objective',
          description: 'e.g. interact with red door (map / sector in requirements).',
          primaryGame: 'ODOOM',
          requirements: {
            needToCollectKeys: { ODOOM: ['1'] },
          },
          mapId: 'MAP01',
          gameLogic: {
            eventKind: 'use_line_special',
            primaryTargetId: 'red_door_line',
            mapOrLevel: 'MAP01',
            implementerNotes: 'Call star_api when player uses the red door linedef.',
          },
        },
      }
    case 'ogame_OQUAKE':
      return {
        kind: 'ogame_objective',
        objective: {
          title: 'OQUAKE objective',
          description: 'e.g. collect red keycard — set geoId / map in description.',
          primaryGame: 'OQUAKE',
          requirements: {
            needToCollectItems: { OQUAKE: ['red_keycard'] },
          },
          gameLogic: {
            eventKind: 'pickup_item',
            primaryTargetId: 'red_keycard',
            mapOrLevel: 'e1m1',
            implementerNotes: 'Fire when player picks up the red keycard entity.',
          },
        },
      }
    case 'ogame_OurWorld':
      return {
        kind: 'ogame_objective',
        objective: {
          title: 'Our World objective',
          description: 'Real-world or map step — set lat/long below.',
          primaryGame: 'OurWorld',
          requirements: {},
          latitude: 51.5,
          longitude: -0.12,
          gameLogic: {
            eventKind: 'geo_arrive',
            primaryTargetId: 'geohotspot_uuid',
            implementerNotes: 'Complete when GPS / map confirms arrival at LinkedGeoHotSpot.',
          },
        },
      }
    case 'external_handoff':
      return {
        kind: 'external_handoff',
        handoff: {
          title: 'External step',
          description: 'Open link; obtain code; complete objective in API or game.',
          externalHandoffUri: 'https://t.me/your_group',
          completionHint: 'Return with access code.',
        },
      }
    case 'geohotspot_anchor':
      return {
        kind: 'geohotspot_anchor',
        hotspot: {
          draftLat: 51.5,
          draftLong: -0.12,
          draftRadiusMetres: 50,
          draftType: 'Map',
          textContent: 'You arrived — next clue…',
        },
      }
    case 'narrative_attachment':
      return {
        kind: 'narrative_attachment',
        attachment: {
          attachTo: 'quest',
          narrative: {
            trigger: 'quest_complete',
            text: 'Quest complete — show this message.',
            websiteUrl: 'https://oasisweb4.com',
          },
        },
      }
    default:
      return {
        kind: 'ogame_objective',
        objective: {
          title: 'Objective',
          description: '',
          primaryGame: 'ODOOM',
          requirements: {},
        },
      }
  }
}
