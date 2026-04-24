/**
 * Injected into the Composer from the Build plan panel so the user does not have to
 * invent the STARNET mapping prompt. The planning document is already in the context pack.
 */
export const BUILD_PLAN_MATCH_HOLONS_COMPOSER_PROMPT = `The IDE **Build plan** tab already attached my planning document in this request's context pack (the **Planning document (IDE — user-set)** section). Do not ask me to paste that document again; use it as the product index (read order and linked paths).

**What I need from you now**
1. **Map this plan to STARNET** using the **## STARNET catalog (IDE — auto-attached …)** table in the same context pack when it has rows. Use **exact** holon/OAPP names and **catalog ids** from that table. If you need fields beyond the table, use **mcp_invoke** with \`star_get_holon\` / \`star_get_oapp\` on those ids (Agent mode only).
2. Recommend **one** primary app shell (for example **Expo** vs **Vite**) with a concrete in-repo recipe path under \`OASIS-IDE/docs/recipes/\` when it fits.
3. Give a **holon map** markdown table: **Feature / job** | **Holon or template name** | **Catalog id (uuid)** | **Role in the app** (decisive wording for catalog rows).
4. Append **exactly one** fenced block \`\`\`oasis-build-plan ... \`\`\` with valid JSON as defined in the IDE context pack: \`templateRecommendation\` (label, framework, templatePathOrId, rationale) plus \`holonFeatures\` (each row: id, catalogHolonName, catalogId, feature, roleInApp, selected). Use stable **id** slugs. The IDE will show these rows as toggles in **Build plan**.

**Constraints:** Do not run \`npm\`, \`write_file\`, \`run_star_cli\`, or STARNET **create** tools until I explicitly ask you to execute in **Execute** mode. If I am in **Plan** mode, stay read-only for repo and STARNET discovery.`;
