/**
 * MCP tools the IDE agent may invoke via `mcp_invoke`.
 * `holon_*` is allowed by prefix (see isAgentMcpToolAllowed) — all component-holon tools
 * in `MCP/src/tools/componentHolonTools.ts`. Aliases are resolved in AgentToolExecutor.mcpInvoke.
 * Omit dangerous non-holon server tools from the allow surface separately if added.
 */
const AGENT_MCP_ALLOWLIST = new Set<string>([
  // OASIS (ONODE) — identity, holons, NFTs, GeoNFTs
  'oasis_health_check',
  'oasis_workflow_mint_nft',
  'oasis_workflow_mint_solana_nft',
  'oasis_create_nft',
  'oasis_mint_nft',
  'oasis_get_holon',
  'oasis_save_holon',
  'oasis_update_holon',
  'oasis_search_holons',
  'oasis_load_all_holons',
  'oasis_get_avatar_detail',
  // A2A / ONET agent discovery and messaging
  'oasis_get_agent_card',
  'oasis_get_all_agents',
  'oasis_get_agents_by_service',
  'oasis_register_agent_capabilities',
  'oasis_register_agent_as_serv_service',
  'oasis_discover_agents_via_serv',
  'oasis_send_a2a_jsonrpc_request',
  'oasis_get_pending_a2a_messages',
  'oasis_mark_a2a_message_processed',
  'oasis_register_openserv_agent',
  'oasis_execute_ai_workflow',
  // GeoNFT tools (all live in oasisTools.ts — not star_*; three names below were wrong)
  'oasis_place_geo_nft',
  'oasis_get_geo_nfts',
  'oasis_get_geo_nfts_for_mint_address',
  'oasis_get_all_geo_nfts',
  // STAR WebAPI (via MCP unified server)
  'star_health_check',
  'star_get_status',
  'star_ignite',
  'star_extinguish',
  'star_beam_in',
  'star_list_oapps',
  'star_get_oapp',
  'star_create_oapp',
  'star_update_oapp',
  'star_clone_oapp',
  'star_publish_oapp',
  'star_unpublish_oapp',
  'star_republish_oapp',
  'star_activate_oapp',
  'star_deactivate_oapp',
  'star_search_oapps',
  'star_download_oapp',
  'star_list_zomes',
  'star_get_zome',
  'star_create_zome',
  'star_list_holons',
  'star_get_holon',
  'star_create_holon',
  'star_list_celestial_bodies',
  'star_get_celestial_body',
  // STAR game / app dev tools (quests, missions, NPCs, items)
  'star_list_quests',
  'star_get_quest',
  'star_create_quest',
  'star_update_quest',
  'star_delete_quest',
  'star_list_missions',
  'star_get_mission',
  'star_create_mission',
  'star_update_mission',
  'star_list_npcs',
  'star_get_npc',
  'star_create_npc',
  'star_update_npc',
  'star_list_items',
  'star_get_item',
  'star_create_item',
  'star_update_item',
  // ElevenLabs voice tools (via MCP unified when wired)
  'elevenlabs_list_voices',
  'elevenlabs_tts_preview',
  'elevenlabs_create_agent',
  'elevenlabs_clone_voice',
  // Unity MCP bridge tools
  'unity_create_gameobject',
  'unity_attach_script',
  'unity_run_tests',
  'unity_list_scene_objects',
  'unity_get_component',
  'unity_set_component_property',
  'unity_play_mode_start',
  'unity_play_mode_stop'
]);

/** Map common model hallucinations / old names to real MCP tool ids before allowlist + invoke. */
export const AGENT_MCP_TOOL_ALIASES: Readonly<Record<string, string>> = {
  // Model invents a STAR name; real tool is in component holon graph primitives
  star_connect_holons: 'holon_connect',
  star_get_holon_graph: 'holon_get_graph',
};

export function resolveAgentMcpToolAlias(toolName: string): string {
  const n = (toolName || '').trim();
  return AGENT_MCP_TOOL_ALIASES[n] ?? n;
}

export function isAgentMcpToolAllowed(toolName: string): boolean {
  const n = resolveAgentMcpToolAlias((toolName || '').trim());
  if (n.length === 0) return false;
  if (AGENT_MCP_ALLOWLIST.has(n)) return true;
  if (n.startsWith('holon_')) return true;
  return false;
}

/**
 * MCP tools allowed when the agent runs in plan / plan_gather / plan_present (read-only discovery).
 * Blocks create/publish/mint/save and other mutating paths even if the model requests them.
 */
const AGENT_MCP_PLAN_READONLY = new Set<string>([
  'oasis_health_check',
  'oasis_get_holon',
  'oasis_search_holons',
  'oasis_get_avatar_detail',
  'oasis_get_agent_card',
  'oasis_get_all_agents',
  'oasis_get_agents_by_service',
  'oasis_discover_agents_via_serv',
  'oasis_get_geo_nfts',
  'oasis_get_all_geo_nfts',
  'oasis_get_geo_nfts_for_mint_address',
  'star_health_check',
  'star_get_status',
  'star_list_oapps',
  'star_get_oapp',
  'star_search_oapps',
  'star_list_holons',
  'star_get_holon',
  'star_list_zomes',
  'star_get_zome',
  'star_list_celestial_bodies',
  'star_get_celestial_body',
  'star_list_quests',
  'star_get_quest',
  'star_list_missions',
  'star_get_mission',
  'star_list_npcs',
  'star_get_npc',
  'star_list_items',
  'star_get_item',
  // Read-only graph / session introspection (Plan mode)
  'holon_get_graph',
  'holon_session_graph',
  'holon_search',
  'holon_search_index',
]);

/**
 * In Plan mode, `holon_*` creates/updates are blocked. Allow read-like holons by
 * name suffix; keep holon_get_graph / holon_session_graph in AGENT_MCP_PLAN_READONLY above.
 */
function isHolonToolPlanReadOnlyByName(n: string): boolean {
  if (n === 'holon_search' || n === 'holon_search_index' || n === 'holon_activity_get') {
    return true;
  }
  if (n.endsWith('_get') || n.endsWith('_list') || n.endsWith('_inbox')) return true;
  return false;
}

export function isAgentMcpToolPlanReadOnly(toolName: string): boolean {
  const n = resolveAgentMcpToolAlias((toolName || '').trim());
  if (n.length === 0) return false;
  if (AGENT_MCP_PLAN_READONLY.has(n)) return true;
  if (n.startsWith('holon_')) {
    return isHolonToolPlanReadOnlyByName(n);
  }
  return false;
}

export function listAgentMcpToolNames(): string[] {
  return Array.from(AGENT_MCP_ALLOWLIST).sort();
}
