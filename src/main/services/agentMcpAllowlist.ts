/**
 * MCP tools the IDE agent may invoke via `mcp_invoke`.
 * Must stay in sync with tools implemented in `MCP/src/tools/*` (names only).
 * Omit destructive / session-rotation tools from the agent surface.
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

export function isAgentMcpToolAllowed(toolName: string): boolean {
  const n = (toolName || '').trim();
  return n.length > 0 && AGENT_MCP_ALLOWLIST.has(n);
}

export function listAgentMcpToolNames(): string[] {
  return Array.from(AGENT_MCP_ALLOWLIST).sort();
}
