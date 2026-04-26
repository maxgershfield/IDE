/**
 * Lightweight **product** intent → implied capability areas for the OASIS IDE agent.
 * Not NLP — regex + priority order. Drives a consistent "interpret before STARNET mapping" preface
 * in `ideAgentLoop` (`augmentIdeAgentUserMessage`).
 */
export type AppArchetypeId =
  | 'food-delivery'
  | 'e-commerce'
  | 'community-geo'
  | 'fintech-assets'
  | 'game-metaverse'
  | 'generic-oapp';

export interface AppArchetypeMatch {
  id: AppArchetypeId;
  /** Short label for the reply */
  label: string;
  /**
   * Capability *areas* the user likely needs — the model should map these to real STARNET
   * rows (uuid), not to abstract type names alone.
   */
  subsystems: string[];
}

const FOOD: AppArchetypeMatch = {
  id: 'food-delivery',
  label: 'On-demand food / delivery',
  subsystems: [
    'Listings: venues, restaurants, brands, or sellers',
    'Menu / catalog: items, modifiers, pricing, availability',
    'Orders: cart, placement, state machine, scheduling / timelock',
    'Logistics: couriers or riders, assignment, ETAs, delivery zones',
    'Trust & quality: reviews, ratings, disputes, safety',
    'Money: pay-in, payouts, tips, fees (when applicable)',
    'Comms: push, SMS, email, in-app messages',
    'Location: maps, address validation, service areas',
    'User accounts: sign-in, profiles, order history',
    'Admin / ops: moderation, fraud, support tooling'
  ]
};

const ECOMMERCE: AppArchetypeMatch = {
  id: 'e-commerce',
  label: 'E-commerce / marketplace',
  subsystems: [
    'Catalog, search, and discovery',
    'Cart, checkout, and payments',
    'Inventory, SKUs, and stock rules',
    'Sellers, merchants, or offers',
    'Order fulfillment and shipping',
    'Users, wishlists, and loyalty',
    'Trust, reviews, and support'
  ]
};

const COMMUNITY: AppArchetypeMatch = {
  id: 'community-geo',
  label: 'Community, social, or location-aware',
  subsystems: [
    'Users, profiles, and follow / friend graphs',
    'Content: posts, comments, DMs, media',
    'Location: check-ins, geo areas, or map context',
    'Events, groups, or missions',
    'Trust, safety, and moderation',
    'Notifications and engagement'
  ]
};

const FINTECH: AppArchetypeMatch = {
  id: 'fintech-assets',
  label: 'Wallets, on-chain, or fintech',
  subsystems: [
    'Identity and KYC (if applicable)',
    'Wallets, balances, and transfers',
    'On-chain: NFTs, tokens, mint, listings',
    'Compliance, limits, and audit',
    'Integrations with payment rails or chains'
  ]
};

const GAME: AppArchetypeMatch = {
  id: 'game-metaverse',
  label: 'Game, world, or metaverse',
  subsystems: [
    'Worlds, levels, and spatial / scene state',
    'Player / avatar progression',
    'Quests, objectives, and rewards',
    'NPCs, dialogue, and content pipeline',
    'Cosmetics, inventory, and economy (tokens or NFTs as needed)',
    'Session, networking, and persistence'
  ]
};

const GENERIC: AppArchetypeMatch = {
  id: 'generic-oapp',
  label: 'General OAPP / product (vertical not pinned)',
  subsystems: [
    'Core domain data model and business rules',
    'User identity and access (roles, permissions)',
    'External APIs and integrations',
    'Real-time, jobs, and notifications (if needed)',
    'Admin, analytics, and support surfaces',
    'Content safety and compliance where relevant'
  ]
};

const FOOD_PAT =
  /\b(food\s*delivery|delivery\s*app|uber\s*eats|doordash|take-?out|takeaway|restaurant|courier|rider|menu|venue|order\s*from|dispatch)\b/i;
const ECOM_PAT = /\b(e-?commerce|ecommerce|marketplace|webshop|web\s*store|shopify|cart\s*checkout|sku|inventory|merchant|seller|buy(ing|ers)?\s+from|sell(ing)?\s+on)\b/i;
const FINT_PAT = /\b(fintech|defi|wallet|on-?chain|kyc|stripe|payouts?|mint\s*nft|nft|solana|ethereum|eth\b|svm\b|escrow|invoice|billing|subscription)\b/i;
const GAME_PAT =
  /\b(game|gamer|unity|unreal|ue5|level\s*design|open\s*world|multiplayer|player\s*progress|npc|quest(s)?\b|fivem|roblox|hyperfy|lore|chapter)\b/i;
const COM_PAT =
  /\b(community|social(\s*network)?|messenger|check-?in|geolocation|location-?based|at\s*the\s*park|outdoor|meetup|fandom)\b/i;

const BUILD_PAT = /\b(build|create|make|scaffold|develop|design|start|new)\b.*\b(app|oapp|application|project|product|platform|start-?up)\b/i;
const BUILD_PAT2 = /\b(i\s*want\s*to|we('?re| need| should)|help\s*me|plan(ning)?\s*(a|an|the)?)\b.*\b(app|oapp|application|project|product)\b/i;

/**
 * If the user text looks like a **new product** question, return a matched archetype.
 * Returns `null` for short, purely technical, or off-topic lines to avoid false positives.
 */
export function matchAppArchetype(userText: string): AppArchetypeMatch | null {
  const t = userText.trim();
  if (t.length < 12) return null;

  const looksBuild =
    BUILD_PAT.test(t) || BUILD_PAT2.test(t) || /\b(oapp|starnet|holon)\b/i.test(t) || FOOD_PAT.test(t) || ECOM_PAT.test(t) || FINT_PAT.test(t) || GAME_PAT.test(t) || COM_PAT.test(t);
  if (!looksBuild) return null;

  const strongTechSupport =
    /\b(typescript|error\s*ts|stack\s*trace|line\s+\d+|\berror:\s|ENOENT|cannot find module|unit test|failing|debugger)\b/i.test(
      t
    ) && !/\b(build|holon|starnet|oapp|app\s+for|new\s+app|delivery|food|game)\b/i.test(t);
  if (strongTechSupport) return null;

  if (FOOD_PAT.test(t) || (/\b(food|restaurant|meal|menu|hungry)\b/i.test(t) && /\b(delivery|order|app)\b/i.test(t)))
    return FOOD;
  if (GAME_PAT.test(t) && !FOOD_PAT.test(t) && !/\bfood\s*delivery\b/i.test(t)) return GAME;
  if (FINT_PAT.test(t)) return FINTECH;
  if (ECOM_PAT.test(t) && !FOOD_PAT.test(t)) return ECOMMERCE;
  if (COM_PAT.test(t) && !FOOD_PAT.test(t)) return COMMUNITY;
  if (BUILD_PAT.test(t) || BUILD_PAT2.test(t) || /\b(oapp|starnet)\b/i.test(t)) return GENERIC;
  return null;
}

/**
 * IDE-injected user appendix: lets the model **rest**ate archetype and cross-check subsystems
 * before mapping to `## STARNET catalog` rows.
 */
export function buildAppArchetypeIdeUserAppendix(userText: string): string | null {
  const m = matchAppArchetype(userText);
  if (!m) return null;
  const lines = m.subsystems.map((s) => `  - ${s}`).join('\n');
  return (
    `[IDE: App archetype — implied capability areas (heuristic, use with \`## STARNET catalog\`)]\n` +
    `**Detected product shape:** **${m.label}** (id: \`${m.id}\`). This is a **planning guide**, not a list of real holon ids.\n` +
    `**Implied subsystems to cross-check** against the STARNET table in this request (for each, prefer a real **uuid** from the catalog, or use **Proposed (not in attached catalog)** in a separate subsection if nothing fits):\n` +
    `${lines}\n` +
    `**What to do in your reply:** (1) In one or two sentences, **interpret** the user’s product in your own words (archetype + one concrete scenario). (2) Walk these subsystems in order: for each, name **a matching STARNET row** (id + name) when possible, or mark a gap. (3) Do **not** only name abstract holon *types*—tie each point to a **row** in the table when one exists, or be explicit that you are **proposing** a custom piece.`
  );
}
