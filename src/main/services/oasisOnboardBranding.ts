/**
 * Holonic "lovable-style" branding for the OASIS onboard Vite template.
 * Runs in the main process right after the template is copied.
 *
 * Detects the app category from the user's description, injects:
 *  - A themed hero section
 *  - Pre-built holonic content sections (VenueHolon, ThreadHolon, etc.)
 *  - A CSS theme that matches the category
 *
 * The OASIS auth cards (login, wallet, mint) are left intact below the fold.
 */
import fs from 'fs/promises';
import path from 'path';
import { detectApp } from './holonicAppDetector.js';
import { buildHolonicSections, buildHolonicCss } from './holonicSectionBuilder.js';

const HTML_MARK = 'oasis-landing-hero';
const CSS_MARK = '/* OASIS_ONBOARD_BRAND */';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHeroHtml(headline: string, sub: string, eyebrow: string, cta: string): string {
  return (
    `      <section class="oasis-landing-hero" id="top" aria-label="Product landing" data-${HTML_MARK}="1">\n` +
    `        <p class="oasis-hero-eyebrow">${escapeHtml(eyebrow)}</p>\n` +
    `        <h1 class="oasis-hero-h1">${escapeHtml(headline)}</h1>\n` +
    `        <p class="oasis-hero-sub">${escapeHtml(sub)}</p>\n` +
    `        <a class="oasis-hero-cta" href="#login-section">${escapeHtml(cta)}</a>\n` +
    `      </section>\n\n`
  );
}

function buildHeroCss(isDark: boolean): string {
  const bg = isDark ? 'var(--hs-bg)' : 'var(--hs-bg)';
  return (
    `/* ── Hero ────────────────────────────────────────────── */\n` +
    `body { background:${bg}; color:var(--hs-text); min-height:100vh; }\n` +
    `.app { max-width:52rem; }\n` +
    `.oasis-landing-hero { text-align:left; padding:2.25rem 0 1.5rem; margin:0 0 1.5rem; border-bottom:1px solid var(--hs-border); }\n` +
    `.oasis-hero-eyebrow { font-size:0.68rem; letter-spacing:0.16em; text-transform:uppercase; color:var(--hs-muted); margin:0 0 0.6rem; font-weight:600; }\n` +
    `.oasis-hero-h1 { font-size:clamp(1.65rem,4.5vw,2.35rem); line-height:1.12; font-weight:800; margin:0 0 0.75rem; ` +
    (isDark
      ? `background:linear-gradient(120deg,#fff 0%,#cbd5e1 45%,var(--hs-accent) 100%);` +
        `-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;`
      : `color:var(--hs-text);`) +
    `}\n` +
    `.oasis-hero-sub { font-size:1rem; line-height:1.55; color:var(--hs-muted); margin:0 0 1.25rem; max-width:40rem; }\n` +
    `.oasis-hero-cta { display:inline-flex; align-items:center; padding:0.7rem 1.35rem; font-weight:700; font-size:0.95rem; ` +
    `color:${isDark ? '#0b0f14' : '#fff'} !important; background:linear-gradient(135deg,var(--hs-accent) 0%,var(--hs-accent-2) 100%); ` +
    `border-radius:999px; text-decoration:none; transition:transform 0.15s; }\n` +
    `.oasis-hero-cta:hover { transform:translateY(-1px); }\n` +
    /* Style the existing OASIS tech cards to match the theme */
    `.card { background:var(--hs-surface); border-color:var(--hs-border); color:var(--hs-text); }\n` +
    `.muted,.hint { color:var(--hs-muted) !important; }\n` +
    `h1,h2 { color:var(--hs-text); }\n` +
    `form input { background:rgba(0,0,0,0.18); border-color:var(--hs-border); color:var(--hs-text); }\n` +
    `form label { color:var(--hs-muted); }\n` +
    `header { color:var(--hs-muted); }\n` +
    `code { color:var(--hs-accent); }\n`
  );
}

/**
 * Injects a holonic hero + themed sections into the copied Vite template.
 * Idempotent: skips if branding markers are already present.
 */
export async function applyOasisOnboardBranding(
  projectPath: string,
  description: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!description.trim()) return { ok: true };

    const norm = path.resolve(projectPath.trim());
    const htmlPath = path.join(norm, 'index.html');
    const cssPath = path.join(norm, 'src', 'style.css');

    let html = await fs.readFile(htmlPath, 'utf8');
    if (html.includes(HTML_MARK)) return { ok: true };

    const app = detectApp(description);
    const { persona, category, scheme, isDark } = app;

    // ── 1. Update <title>
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(persona.headline)} — OASIS</title>`
    );

    // ── 2. Build hero + holonic sections
    const hero = buildHeroHtml(persona.headline, persona.sub, persona.eyebrow, persona.cta);
    const sections = buildHolonicSections(category);

    // ── 3. Inject immediately after <div class="app">
    const appOpen = '<div class="app">';
    const idx = html.indexOf(appOpen);
    if (idx === -1) return { ok: false, error: 'index.html: expected <div class="app"> not found' };
    const ins = idx + appOpen.length;
    html = `${html.slice(0, ins)}\n${hero}${sections}\n${html.slice(ins)}`;

    // ── 4. Relabel the tech header
    const oldHeader =
      '      <header>\n' +
      '        <h1>OASIS onboard</h1>\n' +
      '        <p class="muted">\n' +
      '          Avatar login, Solana wallet, NFT mint. Dev use: Vite proxy to ONODE\n' +
      '          (see README).\n' +
      '        </p>\n' +
      '      </header>';
    const newHeader =
      '      <header style="margin-top:1.5rem">\n' +
      '        <h1 style="font-size:0.95rem;font-weight:600;opacity:0.7">OASIS identity &amp; wallet</h1>\n' +
      '        <p class="muted">Authenticate, connect your Solana wallet, and mint (dev: Vite proxy to ONODE).</p>\n' +
      '      </header>';
    if (html.includes(oldHeader)) html = html.replace(oldHeader, newHeader);

    // ── 5. Build CSS: scheme variables + hero styles + holonic component styles
    let css = await fs.readFile(cssPath, 'utf8');
    if (!css.includes(CSS_MARK)) {
      const brandBlock =
        `${CSS_MARK}\n` +
        buildHolonicCss(scheme) +
        `\n` +
        buildHeroCss(isDark) +
        `\n`;
      css = `${brandBlock}\n${css}`;
      await fs.writeFile(cssPath, css, 'utf8');
    }

    await fs.writeFile(htmlPath, html, 'utf8');
    return { ok: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

// Re-export for use in useOasisOnboardGuide (renderer still imports deriveBrandingFromDescription)
export function deriveBrandingFromDescription(description: string) {
  const app = detectApp(description);
  return {
    pageTitle: `${app.persona.headline} — OASIS`,
    heroHeadline: app.persona.headline,
    heroSub: app.persona.sub,
    isDark: app.isDark,
  };
}
