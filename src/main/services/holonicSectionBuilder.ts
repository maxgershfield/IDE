/**
 * holonicSectionBuilder
 * Generates self-contained HTML sections for each app category.
 * Sections use CSS classes injected alongside them — no external resources.
 * Mock holon data is baked in so the app looks alive from first load.
 */

import type { AppCategory, ColorScheme } from './holonicAppDetector.js';

// ── Colour token helper ───────────────────────────────────────────────────────

const SCHEME_VARS: Record<ColorScheme, string> = {
  'dark-warm': `
:root {
  --hs-bg: #0b0f14;
  --hs-surface: #141b23;
  --hs-border: rgba(255,255,255,0.09);
  --hs-text: #e8eef5;
  --hs-muted: #7a8898;
  --hs-accent: #f97316;
  --hs-accent-2: #fbbf24;
  --hs-pill-bg: rgba(249,115,22,0.15);
  --hs-pill-text: #fdba74;
  --hs-tag-1: #7c3aed; --hs-tag-2: #0369a1; --hs-tag-3: #15803d; --hs-tag-4: #b45309;
  --hs-stars: #fbbf24;
  --hs-badge-bg: rgba(251,191,36,0.12);
}`,
  'dark-cool': `
:root {
  --hs-bg: #0c111b;
  --hs-surface: #141d2e;
  --hs-border: rgba(255,255,255,0.08);
  --hs-text: #e2eaf5;
  --hs-muted: #6e80a0;
  --hs-accent: #3b82f6;
  --hs-accent-2: #818cf8;
  --hs-pill-bg: rgba(59,130,246,0.14);
  --hs-pill-text: #93c5fd;
  --hs-tag-1: #6366f1; --hs-tag-2: #0284c7; --hs-tag-3: #0d9488; --hs-tag-4: #7c3aed;
  --hs-stars: #fbbf24;
  --hs-badge-bg: rgba(99,102,241,0.14);
}`,
  'dark-purple': `
:root {
  --hs-bg: #0d0b1e;
  --hs-surface: #17122c;
  --hs-border: rgba(255,255,255,0.08);
  --hs-text: #ede8ff;
  --hs-muted: #8478b8;
  --hs-accent: #a855f7;
  --hs-accent-2: #c084fc;
  --hs-pill-bg: rgba(168,85,247,0.16);
  --hs-pill-text: #d8b4fe;
  --hs-tag-1: #7c3aed; --hs-tag-2: #6366f1; --hs-tag-3: #0ea5e9; --hs-tag-4: #ec4899;
  --hs-stars: #fbbf24;
  --hs-badge-bg: rgba(168,85,247,0.14);
}`,
  'light-warm': `
:root {
  --hs-bg: #fff7ed;
  --hs-surface: #ffffff;
  --hs-border: #fed7aa;
  --hs-text: #0f172a;
  --hs-muted: #78350f;
  --hs-accent: #ea580c;
  --hs-accent-2: #f97316;
  --hs-pill-bg: rgba(234,88,12,0.10);
  --hs-pill-text: #c2410c;
  --hs-tag-1: #7c3aed; --hs-tag-2: #0369a1; --hs-tag-3: #15803d; --hs-tag-4: #b45309;
  --hs-stars: #d97706;
  --hs-badge-bg: rgba(234,88,12,0.08);
}`,
  'light-clean': `
:root {
  --hs-bg: #f8fafc;
  --hs-surface: #ffffff;
  --hs-border: #e2e8f0;
  --hs-text: #0f172a;
  --hs-muted: #64748b;
  --hs-accent: #2563eb;
  --hs-accent-2: #6366f1;
  --hs-pill-bg: rgba(37,99,235,0.08);
  --hs-pill-text: #1d4ed8;
  --hs-tag-1: #6366f1; --hs-tag-2: #0369a1; --hs-tag-3: #15803d; --hs-tag-4: #7c3aed;
  --hs-stars: #d97706;
  --hs-badge-bg: rgba(37,99,235,0.08);
}`,
};

const SHARED_CSS = `
/* ── Holonic section base ─────────────────────────────── */
body { background: var(--hs-bg); color: var(--hs-text); }
.app { max-width: 56rem; }
.hs { margin: 0 0 2.25rem; }
.hs-head { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:1rem; }
.hs-title { font-size:1.1rem; font-weight:700; margin:0; }
.hs-badge { font-size:0.68rem; color:var(--hs-muted); letter-spacing:0.05em; padding:2px 8px; border:1px solid var(--hs-border); border-radius:999px; }
.hs-grid { display:grid; gap:12px; }
.hs-grid-3 { grid-template-columns:repeat(3,1fr); }
.hs-grid-2 { grid-template-columns:repeat(2,1fr); }
.hs-pill { display:inline-flex; align-items:center; padding:2px 8px; font-size:0.65rem; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; border-radius:999px; background:var(--hs-pill-bg); color:var(--hs-pill-text); }
.hs-card { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; overflow:hidden; }

/* ── VenueHolon ───────────────────────────────────────── */
.venue-hero { height:80px; display:flex; align-items:flex-end; justify-content:space-between; padding:8px 12px; }
.venue-cuisine { font-size:0.7rem; font-weight:600; color:rgba(255,255,255,0.9); background:rgba(0,0,0,0.3); padding:2px 7px; border-radius:999px; backdrop-filter:blur(4px); }
.venue-stars { font-size:0.72rem; font-weight:700; color:#fbbf24; }
.venue-body { padding:10px 12px 12px; }
.venue-name { font-size:0.93rem; font-weight:700; margin:0 0 3px; }
.venue-meta { font-size:0.72rem; color:var(--hs-muted); margin:0; }
.venue-open { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22c55e; margin-right:4px; vertical-align:middle; }

/* ── MenuItemHolon ────────────────────────────────────── */
.menu-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.menu-card { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; padding:10px; display:flex; flex-direction:column; gap:6px; }
.menu-img { width:100%; height:64px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:1.8rem; }
.menu-name { font-size:0.82rem; font-weight:700; margin:0; }
.menu-price { font-size:0.88rem; font-weight:800; color:var(--hs-accent); margin:0; }
.menu-tags { display:flex; gap:4px; flex-wrap:wrap; }
.menu-tag { font-size:0.6rem; font-weight:600; padding:1px 5px; border-radius:999px; background:var(--hs-pill-bg); color:var(--hs-pill-text); }
.menu-add { margin-top:auto; width:100%; padding:5px; font-size:0.72rem; font-weight:700; background:var(--hs-accent); color:#fff; border:none; border-radius:6px; cursor:pointer; }

/* ── DeliveryOrderHolon ───────────────────────────────── */
.tracker { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; padding:16px 20px; }
.tracker-title { font-size:0.82rem; font-weight:700; color:var(--hs-muted); letter-spacing:0.08em; text-transform:uppercase; margin:0 0 14px; }
.tracker-steps { display:flex; align-items:center; gap:0; }
.tracker-step { flex:1; text-align:center; position:relative; }
.tracker-step:not(:last-child)::after { content:''; position:absolute; top:13px; left:50%; right:-50%; height:2px; background:var(--hs-border); }
.tracker-step.done::after, .tracker-step.active::after { background:var(--hs-accent); }
.tracker-dot { width:26px; height:26px; border-radius:50%; border:2px solid var(--hs-border); background:var(--hs-surface); display:flex; align-items:center; justify-content:center; margin:0 auto 6px; font-size:0.7rem; position:relative; z-index:1; }
.tracker-step.done .tracker-dot { background:var(--hs-accent); border-color:var(--hs-accent); color:#fff; }
.tracker-step.active .tracker-dot { border-color:var(--hs-accent); background:var(--hs-surface); box-shadow:0 0 0 4px var(--hs-pill-bg); }
.tracker-label { font-size:0.67rem; color:var(--hs-muted); }
.tracker-step.done .tracker-label { color:var(--hs-text); }
.tracker-step.active .tracker-label { color:var(--hs-accent); font-weight:700; }

/* ── ThreadHolon ──────────────────────────────────────── */
.thread-list { display:flex; flex-direction:column; gap:2px; }
.thread-row { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:8px; padding:11px 14px; display:flex; align-items:center; gap:12px; }
.thread-avatar { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; color:#fff; flex-shrink:0; }
.thread-body { flex:1; min-width:0; }
.thread-title { font-size:0.88rem; font-weight:600; margin:0 0 2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.thread-meta { font-size:0.7rem; color:var(--hs-muted); margin:0; }
.thread-stats { display:flex; gap:12px; flex-shrink:0; text-align:right; }
.thread-stat { font-size:0.7rem; color:var(--hs-muted); }
.thread-stat strong { display:block; font-size:0.85rem; font-weight:700; color:var(--hs-text); }

/* ── BadgeHolon ───────────────────────────────────────── */
.badge-row { display:flex; gap:10px; flex-wrap:wrap; }
.badge-tile { background:var(--hs-badge-bg); border:1px solid var(--hs-border); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; align-items:center; gap:6px; min-width:90px; }
.badge-icon { font-size:1.5rem; }
.badge-name { font-size:0.7rem; font-weight:700; text-align:center; }
.badge-rarity { font-size:0.6rem; color:var(--hs-muted); text-transform:uppercase; letter-spacing:0.06em; }

/* ── ArticleHolon ─────────────────────────────────────── */
.article-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.article-card { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; overflow:hidden; }
.article-hero { height:72px; display:flex; align-items:flex-end; padding:8px 10px; }
.article-tag { font-size:0.62rem; font-weight:700; padding:2px 8px; border-radius:999px; color:#fff; }
.article-body { padding:10px 12px 12px; }
.article-title { font-size:0.85rem; font-weight:700; margin:0 0 6px; line-height:1.3; }
.article-meta { font-size:0.7rem; color:var(--hs-muted); display:flex; gap:8px; }

/* ── HabitHolon ───────────────────────────────────────── */
.habit-list { display:flex; flex-direction:column; gap:8px; }
.habit-row { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:8px; padding:12px 14px; display:flex; align-items:center; gap:14px; }
.habit-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; }
.habit-body { flex:1; }
.habit-name { font-size:0.88rem; font-weight:700; margin:0 0 4px; }
.habit-dots { display:flex; gap:4px; }
.habit-dot { width:14px; height:14px; border-radius:50%; border:1.5px solid var(--hs-border); }
.habit-dot.done { background:var(--hs-accent); border-color:var(--hs-accent); }
.habit-streak { text-align:right; flex-shrink:0; }
.habit-streak-count { font-size:1.2rem; font-weight:800; color:var(--hs-accent); display:block; line-height:1; }
.habit-streak-label { font-size:0.62rem; color:var(--hs-muted); }

/* ── TicketHolon ──────────────────────────────────────── */
.ticket-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.ticket-card { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; overflow:hidden; }
.ticket-header { padding:14px 14px 10px; border-bottom:1px dashed var(--hs-border); display:flex; justify-content:space-between; align-items:flex-start; }
.ticket-event { font-size:0.88rem; font-weight:700; margin:0 0 3px; }
.ticket-date { font-size:0.7rem; color:var(--hs-muted); margin:0; }
.ticket-tier { font-size:0.62rem; font-weight:800; padding:3px 8px; border-radius:999px; color:#fff; }
.ticket-footer { padding:10px 14px; display:flex; justify-content:space-between; align-items:center; }
.ticket-price { font-size:0.95rem; font-weight:800; }
.ticket-nft { font-size:0.62rem; color:var(--hs-muted); }

/* ── PromptHolon ──────────────────────────────────────── */
.prompt-list { display:flex; flex-direction:column; gap:8px; }
.prompt-row { background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:8px; padding:12px 14px; display:flex; align-items:flex-start; gap:12px; }
.prompt-icon { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0; }
.prompt-body { flex:1; min-width:0; }
.prompt-title { font-size:0.88rem; font-weight:700; margin:0 0 3px; }
.prompt-preview { font-size:0.72rem; color:var(--hs-muted); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:ui-monospace,monospace; }
.prompt-meta { display:flex; gap:8px; flex-shrink:0; align-items:center; }
.prompt-stars { font-size:0.7rem; color:var(--hs-stars); font-weight:700; }
.prompt-model { font-size:0.62rem; padding:2px 7px; border-radius:999px; background:var(--hs-pill-bg); color:var(--hs-pill-text); font-weight:600; }

/* ── Holonic auth bridge ──────────────────────────────── */
.hs-auth-bridge { margin:0 0 1rem; padding:12px 16px; background:var(--hs-surface); border:1px solid var(--hs-border); border-radius:10px; display:flex; align-items:center; gap:10px; }
.hs-auth-bridge-icon { width:28px; height:28px; border-radius:50%; background:var(--hs-accent); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.85rem; font-weight:800; flex-shrink:0; }
.hs-auth-bridge-text { flex:1; font-size:0.82rem; color:var(--hs-muted); }
.hs-auth-bridge-text strong { color:var(--hs-text); }
`;

// ── Section builders ──────────────────────────────────────────────────────────

function foodDeliverySection(isDark: boolean): string {
  const c1 = 'linear-gradient(135deg,#7c3aed,#a855f7)';
  const c2 = 'linear-gradient(135deg,#0369a1,#0ea5e9)';
  const c3 = 'linear-gradient(135deg,#b45309,#f97316)';
  const textMute = isDark ? 'rgba(255,255,255,0.6)' : '#78350f';
  return `
  <!-- VenueHolon: Restaurants -->
  <section class="hs" aria-label="VenueHolon">
    <div class="hs-head">
      <h2 class="hs-title">Restaurants near you</h2>
      <span class="hs-badge">VenueHolon · 3 holons</span>
    </div>
    <div class="hs-grid hs-grid-3">
      <div class="hs-card">
        <div class="venue-hero" style="background:${c1}">
          <span class="venue-cuisine">Italian</span>
          <span class="venue-stars">&#9733; 4.8</span>
        </div>
        <div class="venue-body">
          <p class="venue-name">Pizzeria Napoli</p>
          <p class="venue-meta"><span class="venue-open"></span>20&ndash;30 min &middot; Free delivery</p>
        </div>
      </div>
      <div class="hs-card">
        <div class="venue-hero" style="background:${c2}">
          <span class="venue-cuisine">Japanese</span>
          <span class="venue-stars">&#9733; 4.6</span>
        </div>
        <div class="venue-body">
          <p class="venue-name">Sakura Ramen</p>
          <p class="venue-meta"><span class="venue-open"></span>25&ndash;40 min &middot; $2 delivery</p>
        </div>
      </div>
      <div class="hs-card">
        <div class="venue-hero" style="background:${c3}">
          <span class="venue-cuisine">Mexican</span>
          <span class="venue-stars">&#9733; 4.9</span>
        </div>
        <div class="venue-body">
          <p class="venue-name">Casa Fuego</p>
          <p class="venue-meta"><span class="venue-open"></span>15&ndash;25 min &middot; Free delivery</p>
        </div>
      </div>
    </div>
  </section>

  <!-- MenuItemHolon: Popular dishes -->
  <section class="hs" aria-label="MenuItemHolon">
    <div class="hs-head">
      <h2 class="hs-title">Popular right now</h2>
      <span class="hs-badge">MenuItemHolon &middot; 6 holons</span>
    </div>
    <div class="menu-grid">
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#fde68a,#f97316)">&#127829;</div>
        <p class="menu-name">Margherita Pizza</p>
        <p class="menu-price">$14.90</p>
        <div class="menu-tags"><span class="menu-tag">Vegetarian</span></div>
        <button class="menu-add">+ Add</button>
      </div>
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#bae6fd,#0ea5e9)">&#127836;</div>
        <p class="menu-name">Tonkotsu Ramen</p>
        <p class="menu-price">$16.50</p>
        <div class="menu-tags"><span class="menu-tag">Spicy</span></div>
        <button class="menu-add">+ Add</button>
      </div>
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#bbf7d0,#16a34a)">&#127793;</div>
        <p class="menu-name">Poke Bowl</p>
        <p class="menu-price">$15.00</p>
        <div class="menu-tags"><span class="menu-tag">GF</span><span class="menu-tag">Low cal</span></div>
        <button class="menu-add">+ Add</button>
      </div>
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#fca5a5,#dc2626)">&#127839;</div>
        <p class="menu-name">Beef Tacos ×3</p>
        <p class="menu-price">$13.50</p>
        <div class="menu-tags"><span class="menu-tag">Spicy</span></div>
        <button class="menu-add">+ Add</button>
      </div>
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#e9d5ff,#9333ea)">&#129473;</div>
        <p class="menu-name">Miso Udon</p>
        <p class="menu-price">$14.00</p>
        <div class="menu-tags"><span class="menu-tag">Vegan</span></div>
        <button class="menu-add">+ Add</button>
      </div>
      <div class="menu-card">
        <div class="menu-img" style="background:linear-gradient(135deg,#fef9c3,#ca8a04)">&#127828;</div>
        <p class="menu-name">Garlic Bread</p>
        <p class="menu-price">$5.50</p>
        <div class="menu-tags"><span class="menu-tag">Vegetarian</span></div>
        <button class="menu-add">+ Add</button>
      </div>
    </div>
  </section>

  <!-- DeliveryOrderHolon: Order tracker -->
  <section class="hs" aria-label="DeliveryOrderHolon">
    <div class="hs-head">
      <h2 class="hs-title">Live order tracker</h2>
      <span class="hs-badge">DeliveryOrderHolon</span>
    </div>
    <div class="tracker">
      <p class="tracker-title">Order #A7F2 &mdash; Pizzeria Napoli</p>
      <div class="tracker-steps">
        <div class="tracker-step done">
          <div class="tracker-dot">&#10003;</div>
          <div class="tracker-label">Placed</div>
        </div>
        <div class="tracker-step done">
          <div class="tracker-dot">&#10003;</div>
          <div class="tracker-label">Confirmed</div>
        </div>
        <div class="tracker-step active">
          <div class="tracker-dot">&#11044;</div>
          <div class="tracker-label">En route</div>
        </div>
        <div class="tracker-step">
          <div class="tracker-dot"></div>
          <div class="tracker-label">Delivered</div>
        </div>
      </div>
    </div>
  </section>`;
}

function communitySection(): string {
  const avatarColors = ['#7c3aed', '#0369a1', '#15803d', '#b45309', '#dc2626', '#0d9488'];
  const initials = ['AK', 'MJ', 'SR', 'TW'];
  const threads = [
    { title: 'How do holons compare to traditional database records?', replies: 42, votes: 187 },
    { title: 'First OASIS app went live — lessons learned from holonising', replies: 28, votes: 134 },
    { title: 'STARNET karma system: best practices for multi-zome apps', replies: 15, votes: 89 },
  ];
  const badges = [
    { icon: '&#127775;', name: 'Founder', rarity: 'Legendary' },
    { icon: '&#128736;', name: 'Builder', rarity: 'Rare' },
    { icon: '&#128218;', name: 'Scholar', rarity: 'Common' },
    { icon: '&#129351;', name: 'Top 10', rarity: 'Rare' },
    { icon: '&#128293;', name: 'Streak 30', rarity: 'Common' },
  ];
  return `
  <!-- ThreadHolon: Discussions -->
  <section class="hs" aria-label="ThreadHolon">
    <div class="hs-head">
      <h2 class="hs-title">Recent discussions</h2>
      <span class="hs-badge">ThreadHolon &middot; ${threads.length} holons</span>
    </div>
    <div class="thread-list">
      ${threads.map((t, i) => `
      <div class="thread-row">
        <div class="thread-avatar" style="background:${avatarColors[i % avatarColors.length]}">${initials[i]}</div>
        <div class="thread-body">
          <p class="thread-title">${t.title}</p>
          <p class="thread-meta">Posted 2h ago &middot; 12 karma earned</p>
        </div>
        <div class="thread-stats">
          <div class="thread-stat"><strong>${t.votes}</strong> votes</div>
          <div class="thread-stat"><strong>${t.replies}</strong> replies</div>
        </div>
      </div>`).join('')}
    </div>
  </section>

  <!-- BadgeHolon: Achievements -->
  <section class="hs" aria-label="BadgeHolon">
    <div class="hs-head">
      <h2 class="hs-title">Achievements</h2>
      <span class="hs-badge">BadgeHolon &middot; ${badges.length} holons</span>
    </div>
    <div class="badge-row">
      ${badges.map(b => `
      <div class="badge-tile">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-rarity">${b.rarity}</div>
      </div>`).join('')}
    </div>
  </section>`;
}

function creatorSection(): string {
  const articles = [
    { tag: 'Tutorial', color: '#7c3aed', title: 'Building your first OAPP with STAR MCP', author: 'Alice K', read: '8 min' },
    { tag: 'Case study', color: '#0369a1', title: 'How holons replaced our MongoDB schema', author: 'Ben M', read: '6 min' },
    { tag: 'Opinion', color: '#15803d', title: 'Why karma is the best reputation model', author: 'Sara R', read: '4 min' },
  ];
  return `
  <!-- ArticleHolon: Content -->
  <section class="hs" aria-label="ArticleHolon">
    <div class="hs-head">
      <h2 class="hs-title">Latest articles</h2>
      <span class="hs-badge">ArticleHolon &middot; 3 holons</span>
    </div>
    <div class="article-grid">
      ${articles.map(a => `
      <div class="article-card">
        <div class="article-hero" style="background:linear-gradient(135deg,${a.color}cc,${a.color})">
          <span class="article-tag" style="background:rgba(0,0,0,0.3)">${a.tag}</span>
        </div>
        <div class="article-body">
          <p class="article-title">${a.title}</p>
          <div class="article-meta">
            <span>${a.author}</span>
            <span>${a.read} read</span>
          </div>
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

function wellnessSection(): string {
  const habits = [
    { icon: '&#127939;', name: 'Morning run', bg: '#fde68a', streak: 14, done: [1,1,1,1,1,0,1] },
    { icon: '&#129486;', name: 'Meditation', bg: '#bae6fd', streak: 7, done: [1,1,0,1,1,1,1] },
    { icon: '&#128214;', name: 'Read 20 pages', bg: '#bbf7d0', streak: 21, done: [1,1,1,1,1,1,0] },
  ];
  return `
  <!-- HabitHolon: Habits -->
  <section class="hs" aria-label="HabitHolon">
    <div class="hs-head">
      <h2 class="hs-title">Your habits</h2>
      <span class="hs-badge">HabitHolon &middot; ${habits.length} holons</span>
    </div>
    <div class="habit-list">
      ${habits.map(h => `
      <div class="habit-row">
        <div class="habit-icon" style="background:${h.bg}">${h.icon}</div>
        <div class="habit-body">
          <p class="habit-name">${h.name}</p>
          <div class="habit-dots">
            ${h.done.map((d: number) => `<div class="habit-dot${d ? ' done' : ''}"></div>`).join('')}
          </div>
        </div>
        <div class="habit-streak">
          <span class="habit-streak-count">${h.streak}</span>
          <span class="habit-streak-label">day streak</span>
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

function eventsSection(): string {
  const events = [
    { name: 'OASIS Summit 2026', date: 'May 12 &middot; London', tier: 'VIP', tierBg: '#a855f7', price: '0.5 SOL' },
    { name: 'Holonic Hackathon', date: 'Jun 3 &middot; Online', tier: 'General', tierBg: '#0369a1', price: 'Free' },
    { name: 'STAR Builders Night', date: 'Jun 21 &middot; NYC', tier: 'VVIP', tierBg: '#b45309', price: '1.2 SOL' },
  ];
  return `
  <!-- TicketHolon: Events -->
  <section class="hs" aria-label="TicketHolon">
    <div class="hs-head">
      <h2 class="hs-title">Upcoming events</h2>
      <span class="hs-badge">TicketHolon &middot; ${events.length} holons</span>
    </div>
    <div class="ticket-grid">
      ${events.map(e => `
      <div class="ticket-card">
        <div class="ticket-header">
          <div>
            <p class="ticket-event">${e.name}</p>
            <p class="ticket-date">${e.date}</p>
          </div>
          <span class="ticket-tier" style="background:${e.tierBg}">${e.tier}</span>
        </div>
        <div class="ticket-footer">
          <span class="ticket-price">${e.price}</span>
          <span class="ticket-nft">NFT-backed ticket</span>
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

function aiSection(): string {
  const prompts = [
    { icon: '&#128640;', bg: '#ede9fe', title: 'OAPP scaffold generator', model: 'GPT-4o', preview: 'You are a STAR OAPP architect. Given a user description...', stars: 142 },
    { icon: '&#129504;', bg: '#dbeafe', title: 'Holon field designer', model: 'Claude 3.7', preview: 'Design a holon schema with zomes for the following app...', stars: 89 },
    { icon: '&#128202;', bg: '#d1fae5', title: 'Karma rule advisor', model: 'GPT-4o', preview: 'Suggest karma rates for each action in this OAPP...', stars: 67 },
  ];
  return `
  <!-- PromptHolon: Prompt library -->
  <section class="hs" aria-label="PromptHolon">
    <div class="hs-head">
      <h2 class="hs-title">Prompt library</h2>
      <span class="hs-badge">PromptHolon &middot; ${prompts.length} holons</span>
    </div>
    <div class="prompt-list">
      ${prompts.map(p => `
      <div class="prompt-row">
        <div class="prompt-icon" style="background:${p.bg}">${p.icon}</div>
        <div class="prompt-body">
          <p class="prompt-title">${p.title}</p>
          <p class="prompt-preview">${p.preview}</p>
        </div>
        <div class="prompt-meta">
          <span class="prompt-stars">&#9733; ${p.stars}</span>
          <span class="prompt-model">${p.model}</span>
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

// ── Auth bridge (connects holonic landing to OASIS auth cards) ─────────────

function authBridge(): string {
  return `
  <div class="hs-auth-bridge">
    <div class="hs-auth-bridge-icon">O</div>
    <div class="hs-auth-bridge-text">
      <strong>Authenticate with your OASIS avatar</strong> to place orders, earn karma, and sync your holons.
    </div>
  </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildHolonicSections(category: AppCategory): string {
  switch (category) {
    case 'food-delivery': return foodDeliverySection(true) + authBridge();
    case 'community':     return communitySection() + authBridge();
    case 'creator':       return creatorSection() + authBridge();
    case 'wellness':      return wellnessSection() + authBridge();
    case 'events':        return eventsSection() + authBridge();
    case 'ai':            return aiSection() + authBridge();
    default:              return authBridge();
  }
}

export function buildHolonicCss(scheme: ColorScheme): string {
  return SCHEME_VARS[scheme] + SHARED_CSS;
}
