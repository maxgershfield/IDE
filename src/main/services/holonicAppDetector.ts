/**
 * holonicAppDetector
 * Maps a freeform user description to a structured set of holons and a visual persona.
 * Used by the branding service to compose the right landing-page sections.
 */

export type AppCategory =
  | 'food-delivery'
  | 'marketplace'
  | 'community'
  | 'creator'
  | 'wellness'
  | 'events'
  | 'ai'
  | 'finance'
  | 'generic';

export type ColorScheme =
  | 'dark-warm'    // dark bg + orange/amber accent
  | 'dark-cool'    // dark bg + blue/violet accent
  | 'dark-purple'  // dark bg + purple gradient
  | 'light-warm'   // white/cream + orange
  | 'light-clean'; // white + slate blue

export type DetectedApp = {
  category: AppCategory;
  scheme: ColorScheme;
  isDark: boolean;
  holons: string[];  // HolonType names to include
  zomes: string[];   // Zome groupings to register
  persona: {
    headline: string;
    sub: string;
    eyebrow: string;
    cta: string;
  };
};

const FOOD_KW = /food|deliver|restaurant|meal|eat|order|kitchen|bite|dish|dining|menu|grocery|takeaway|takeout|catering|supper|lunch|breakfast/i;
const MARKET_KW = /market|shop|ecommerce|e-commerce|sell|buy|product|store|listing|vendor|retail|merch|boutique/i;
const COMMUNITY_KW = /community|forum|social|thread|discussion|post|comment|chat|network|group|tribe|circle/i;
const CREATOR_KW = /course|learn|educat|lesson|teach|portfolio|creator|publish|article|blog|newsletter|class|tutor/i;
const WELLNESS_KW = /health|fitness|workout|habit|wellness|journal|mood|meditat|exercise|run|yoga|nutrition|diet/i;
const EVENTS_KW = /event|ticket|concert|conference|festival|rsvp|venue|attend|show|gig|booking|session/i;
const AI_KW = /\bai\b|agent|prompt|llm|generat|model|chatbot|assistant|automat|copilot/i;
const FINANCE_KW = /finance|budget|invoice|expense|payment|money|bank|invest|split|ledger|accounting/i;
const DARK_KW = /dark|night|noir|midnight|charcoal|black\s*mode|darkmode/i;

function pickPersona(cat: AppCategory, desc: string): DetectedApp['persona'] {
  switch (cat) {
    case 'food-delivery': return {
      eyebrow: 'Delivery · powered by OASIS',
      headline: 'Food you crave, delivered tonight',
      sub: desc.length > 20 ? desc : 'Fresh restaurants, real-time tracking, and Solana-verified reviews.',
      cta: 'Browse restaurants',
    };
    case 'marketplace': return {
      eyebrow: 'Marketplace · powered by OASIS',
      headline: 'Buy, sell, and own — on-chain',
      sub: desc.length > 20 ? desc : 'A decentralised marketplace where every listing is a holon.',
      cta: 'Explore listings',
    };
    case 'community': return {
      eyebrow: 'Community · powered by OASIS',
      headline: 'Where your reputation travels with you',
      sub: desc.length > 20 ? desc : 'Threads, karma, and badges — all synced to your OASIS avatar.',
      cta: 'Join the discussion',
    };
    case 'creator': return {
      eyebrow: 'Creator platform · powered by OASIS',
      headline: 'Publish, teach, and get paid on-chain',
      sub: desc.length > 20 ? desc : 'Courses, articles, and portfolios — backed by holons.',
      cta: 'Start creating',
    };
    case 'wellness': return {
      eyebrow: 'Wellness · powered by OASIS',
      headline: 'Build habits that earn karma',
      sub: desc.length > 20 ? desc : 'Track workouts, habits, and mood — every milestone synced to your avatar.',
      cta: 'Start your journey',
    };
    case 'events': return {
      eyebrow: 'Events · powered by OASIS',
      headline: 'Every ticket is an NFT',
      sub: desc.length > 20 ? desc : 'Create events, mint tickets, and reward attendees with karma.',
      cta: 'Browse events',
    };
    case 'ai': return {
      eyebrow: 'AI agents · powered by OASIS',
      headline: 'Build agents that work for your avatar',
      sub: desc.length > 20 ? desc : 'Prompt library, agent registry, and AI memory — all holonic.',
      cta: 'Explore agents',
    };
    case 'finance': return {
      eyebrow: 'Finance · powered by OASIS',
      headline: 'Every transaction is a holon',
      sub: desc.length > 20 ? desc : 'Invoices, splits, and ledgers — cryptographically signed and karma-earning.',
      cta: 'View ledger',
    };
    default: return {
      eyebrow: 'OASIS app',
      headline: 'Build on OASIS',
      sub: desc.length > 20 ? desc : 'Your new holonic app — powered by OASIS avatars and STARNET.',
      cta: 'Get started',
    };
  }
}

export function detectApp(description: string): DetectedApp {
  const desc = description.trim();
  const isDark = DARK_KW.test(desc);

  let category: AppCategory = 'generic';
  if (FOOD_KW.test(desc)) category = 'food-delivery';
  else if (EVENTS_KW.test(desc)) category = 'events';
  else if (CREATOR_KW.test(desc)) category = 'creator';
  else if (WELLNESS_KW.test(desc)) category = 'wellness';
  else if (COMMUNITY_KW.test(desc)) category = 'community';
  else if (MARKET_KW.test(desc)) category = 'marketplace';
  else if (AI_KW.test(desc)) category = 'ai';
  else if (FINANCE_KW.test(desc)) category = 'finance';

  const schemeMap: Record<AppCategory, { dark: ColorScheme; light: ColorScheme }> = {
    'food-delivery': { dark: 'dark-warm', light: 'light-warm' },
    'marketplace':   { dark: 'dark-cool', light: 'light-clean' },
    'community':     { dark: 'dark-cool', light: 'light-clean' },
    'creator':       { dark: 'dark-purple', light: 'light-clean' },
    'wellness':      { dark: 'dark-cool', light: 'light-warm' },
    'events':        { dark: 'dark-purple', light: 'light-warm' },
    'ai':            { dark: 'dark-cool', light: 'light-clean' },
    'finance':       { dark: 'dark-cool', light: 'light-clean' },
    'generic':       { dark: 'dark-cool', light: 'light-clean' },
  };

  const holonMap: Record<AppCategory, string[]> = {
    'food-delivery': ['VenueHolon', 'MenuItemHolon', 'CartHolon', 'DeliveryOrderHolon', 'CourierHolon', 'ReviewHolon'],
    'marketplace':   ['MarketplaceListing', 'MarketplaceOffer', 'Product', 'Review', 'Auction'],
    'community':     ['ThreadHolon', 'ReactionHolon', 'BadgeHolon', 'EndorsementHolon', 'Post', 'Comment'],
    'creator':       ['ArticleHolon', 'CourseHolon', 'LessonHolon', 'PortfolioHolon', 'Subscription'],
    'wellness':      ['HabitHolon', 'WorkoutHolon', 'JournalEntryHolon', 'Achievement'],
    'events':        ['TicketHolon', 'RSVPHolon', 'VenueHolonLive', 'Event'],
    'ai':            ['PromptHolon', 'AgentHolon', 'InsightHolon', 'AIMemory'],
    'finance':       ['Payment', 'Order', 'Subscription', 'LiquidityPool'],
    'generic':       ['UserProfile', 'Post', 'KarmaEvent'],
  };

  const zomeMap: Record<AppCategory, string[]> = {
    'food-delivery': ['PlacesZome', 'CatalogZome', 'OrderZome', 'LogisticsZome'],
    'marketplace':   ['CatalogZome', 'LedgerZome', 'ReputationZome'],
    'community':     ['ContentZome', 'TrustZome', 'MessagingZome'],
    'creator':       ['ContentZome', 'LearningZome', 'CreatorZome'],
    'wellness':      ['WellnessZome', 'IdentityZome'],
    'events':        ['EventsZome', 'LedgerZome', 'IdentityZome'],
    'ai':            ['AIZome', 'IdentityZome'],
    'finance':       ['LedgerZome', 'IdentityZome'],
    'generic':       ['IdentityZome', 'ContentZome'],
  };

  return {
    category,
    scheme: isDark ? schemeMap[category].dark : schemeMap[category].light,
    isDark,
    holons: holonMap[category],
    zomes: zomeMap[category],
    persona: pickPersona(category, desc),
  };
}
