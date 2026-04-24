import type { GameLogicHook } from './designerTypes'

/**
 * Suggested C / game-integration lines — authors copy into ODOOM / OQUake / Our World.
 * Names align with STAR_Quest_System_Developer_Guide.md §3.3.
 */
export function buildIntegrationSnippet(
  gameSource: string,
  hook: GameLogicHook | undefined
): string[] {
  if (!hook?.eventKind) {
    return [
      '// Add “In-game event” in the properties panel to generate star_api_* suggestions.',
    ]
  }

  const g = gameSource || 'ODOOM'
  const t = hook.primaryTargetId || 'YOUR_ITEM_OR_ENTITY_ID'
  const lines: string[] = [
    `// --- ${g}: ${hook.eventKind} → "${t}" ---`,
    `// Map/level hint: ${hook.mapOrLevel || '(none)'}  ref: ${hook.sectorOrEntityRef || '(none)'}`,
  ]

  switch (hook.eventKind) {
    case 'pickup_item':
      lines.push(
        `// On pickup (increments item tallies for active quest):`,
        `star_api_queue_quest_progress_from_pickup("${t}", "${g}");`,
        `// When this objective alone should complete:`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`
      )
      break
    case 'pickup_key':
      lines.push(
        `star_api_queue_quest_progress_from_pickup(/* key slot or name */ "${t}", "${g}");`,
        `// or complete objective directly when key acquired:`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`
      )
      break
    case 'kill_monster':
      lines.push(
        `// On kill — progress pipeline uses monster name / class id:`,
        `star_api_queue_monster_kill("${t}" /* monster id */, ${1} /* count */, "${g}");`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`
      )
      break
    case 'complete_level':
      lines.push(
        `// Level finished (OQuake-style level time / exit):`,
        `star_api_queue_quest_level_time(<seconds>, "${g}");`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`
      )
      break
    case 'use_line_special':
      lines.push(
        `// Doom line / special — call when player activates linedef:`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`,
        `// Or record custom progress if your build maps specials to item names:`,
        `star_api_queue_quest_progress_from_pickup("${t}", "${g}");`
      )
      break
    case 'geo_arrive':
      lines.push(
        `// Our World / GPS — when player enters hotspot radius:`,
        `// POST progress or complete objective via your app layer + STAR client`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`
      )
      break
    case 'custom':
      lines.push(
        `// Custom — implement in engine, then call when your condition is true:`,
        `star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`,
        hook.implementerNotes ? `// Note: ${hook.implementerNotes}` : ''
      )
      break
    default:
      lines.push(`star_api_complete_quest_objective("<QUEST_ID>", "<OBJECTIVE_ID>", "${g}");`)
  }

  return lines.filter(Boolean)
}
