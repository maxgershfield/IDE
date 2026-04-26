import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Hammer, Loader2, Network, Sparkles, X } from 'lucide-react';
import type { StarHolonRecord } from '../../services/starApiService';
import { holonTypeNameFromEnum } from '../../services/holonTypeLabels';
import { suggestHolonsForIdea, type HolonSuggestion } from '../../services/starnetHolonSuggest';
import { matchAppArchetype } from '../../../shared/appArchetypeHints';
import type { HolonCapabilityKind } from '../../../shared/holonCapabilityTypes';
import type { HolonicAppBuildContract } from '../../../shared/holonicAppBuildTypes';
import { useOappBuildPlan } from '../../contexts/OappBuildPlanContext';
import { inferHolonCapability } from '../../utils/holonCapabilityInference';
import type {
  CompositionBuildStep,
  CompositionCapabilityLane,
  CompositionHolonEdge,
  CompositionHolonNode,
  CompositionSurface,
  OappCompositionPlan,
} from '../../../shared/oappCompositionPlanTypes';

export interface StarnetBuildTabProps {
  holonCatalogRows: StarHolonRecord[];
  baseUrl: string;
  holonsLoading: boolean;
  onSubmitBuildRequest: (message: string) => void;
  /** UUIDs recommended by the agent/chat; shown as the current composition workspace. */
  selectedCatalogIds?: string[];
  /** Original user prompt that produced the agent selection; used to expand the workspace locally. */
  selectedQuery?: string;
  onClearSelection?: () => void;
}

function buildDraftMarkdown(idea: string, picks: HolonSuggestion[], baseUrl: string): string {
  const ideaBlock =
    idea.trim() ||
    '_(Add a one-line idea in the Match tab, or type a longer spec in the Composer on the right.)_';
  const lines = [
    '## STARNET — holon match (from Match tab)',
    '',
    ideaBlock,
    '',
    '## Selected holons (verify with `star_get_holon` / `mcp_invoke` before publishing)',
    ''
  ];
  for (const s of picks) {
    const h = s.holon;
    const nm = (h.name || h.id).replace(/\*/g, '');
    const type = holonTypeNameFromEnum(h.holonType);
    const match =
      s.matchedTerms.length > 0 ? ` — matched: ${s.matchedTerms.slice(0, 6).join(', ')}` : '';
    lines.push(`- **${nm}** (\`${h.id}\`) — ${type}${match}`);
  }
  const archetype = matchAppArchetype(idea);
  if (archetype) {
    lines.push('', '## IDE composition read', '');
    lines.push(`Detected app shape: **${archetype.label}**.`);
    lines.push('');
    for (const subsystem of archetype.subsystems) {
      const matched = subsystemMatches(subsystem, picks).slice(0, 3);
      if (matched.length > 0) {
        lines.push(`- **${subsystem}** → ${matched.map((s) => `${s.holon.name || s.holon.id} (\`${s.holon.id}\`)`).join(', ')}`);
      } else {
        lines.push(`- **${subsystem}** → Gap to design or search in STARNET.`);
      }
    }
  }
  lines.push('', `STAR WebAPI (this IDE): \`${baseUrl}\``, '');
  lines.push(
    'Help me turn these selected STARNET rows into an OAPP composition: suggested wiring, gaps, screens, and an `<oasis_holon_diagram>` block if useful.'
  );
  return lines.join('\n');
}

function inferCompositionRole(h: StarHolonRecord): string {
  return roleForCapability(inferHolonCapability(h).kind);
}

function capabilitySummaryForHolon(h: StarHolonRecord): string {
  const capability = inferHolonCapability(h);
  const ports = capability.ports.slice(0, 2).map((port) => port.label).join(', ');
  return `${capability.kind}${ports ? ` · ports: ${ports}` : ''}`;
}

function roleForCapability(kind: HolonCapabilityKind): string {
  switch (kind) {
    case 'catalog': return 'catalog/data';
    case 'order': return 'transaction flow';
    case 'payment': return 'money flow';
    case 'communication': return 'comms';
    case 'location': return 'place/location';
    case 'admin': return 'ops';
    case 'form': return 'form/input';
    case 'content': return 'content';
    case 'workflow': return 'workflow';
    case 'identity':
    case 'logistics':
    case 'trust':
      return kind;
    default:
      return 'component';
  }
}

function selectedRowsToSuggestions(rows: StarHolonRecord[]): HolonSuggestion[] {
  return rows.map((holon) => ({ holon, score: 999, matchedTerms: ['agent-selected'] }));
}

function mergeSuggestions(primary: HolonSuggestion[], secondary: HolonSuggestion[], max: number): HolonSuggestion[] {
  const out: HolonSuggestion[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const id = item.holon.id.toLowerCase();
    const name = (item.holon.name || id).toLowerCase().replace(/\s+\[library\]$/, '');
    if (seenIds.has(id) || seenNames.has(name)) continue;
    seenIds.add(id);
    seenNames.add(name);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function corpusForSuggestion(s: HolonSuggestion): string {
  const h = s.holon;
  const capability = inferHolonCapability(h);
  return [
    h.name,
    h.description,
    holonTypeNameFromEnum(h.holonType),
    roleForCapability(capability.kind),
    capability.kind,
    capability.summary,
    ...capability.schemaHints,
    ...capability.ports.map((port) => `${port.label} ${port.dataShape ?? ''}`),
    ...s.matchedTerms,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function subsystemMatches(subsystem: string, suggestions: HolonSuggestion[]): HolonSuggestion[] {
  const key = subsystem.split(':')[0].toLowerCase();
  const extra: Record<string, string[]> = {
    listings: ['venue', 'restaurant', 'marketplace', 'seller', 'place'],
    menu: ['menu', 'catalog', 'item', 'product'],
    orders: ['order', 'cart', 'checkout', 'delivery'],
    logistics: ['delivery', 'courier', 'rider', 'dispatch', 'zone'],
    trust: ['review', 'rating', 'karma', 'trust'],
    money: ['payment', 'wallet', 'payout', 'billing'],
    comms: ['notification', 'message', 'chat', 'email', 'sms'],
    location: ['location', 'geo', 'map', 'address', 'zone', 'venue'],
    user: ['user', 'profile', 'avatar', 'identity', 'account'],
    admin: ['admin', 'ops', 'support', 'moderation'],
  };
  const terms = [
    ...key.split(/\W+/).filter((w) => w.length >= 3),
    ...(extra[key] ?? []),
  ];
  return suggestions.filter((s) => {
    const corpus = corpusForSuggestion(s);
    return terms.some((t) => corpus.includes(t));
  });
}

function buildReviewSteps(idea: string, picks: HolonSuggestion[]): string[] {
  const roles = new Set(picks.map((s) => roleForCapability(inferHolonCapability(s.holon).kind)));
  const steps = [
    'Validate the selected STARNET catalog rows and fetch full details for each catalog id.',
    'Create the OAPP shell: manifest, routing, shared types, and STAR/OASIS configuration.',
    'Define the domain model from the selected holons and mark any missing custom holons as gaps.',
  ];
  if (roles.has('catalog/data') || /\bmenu|catalog|product|listing|venue|restaurant\b/i.test(idea)) {
    steps.push('Build the listing/catalog surfaces and seed them from the selected catalog/data holons.');
  }
  if (roles.has('transaction flow') || /\border|cart|checkout|delivery\b/i.test(idea)) {
    steps.push('Wire the order lifecycle: cart/selection, order placement, status, and delivery handoff.');
  }
  if (roles.has('money flow')) {
    steps.push('Integrate payment or wallet flows behind an explicit adapter so real rails can be added safely.');
  }
  if (roles.has('identity')) {
    steps.push('Attach user/profile identity flows and persist user-owned app state.');
  }
  steps.push('Generate the initial screens, agent-readable build notes, and a test checklist before Execute mode writes files.');
  return steps.slice(0, 8);
}

function slugifyCompositionId(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function compositionNodeId(h: StarHolonRecord, index: number): string {
  const base = slugifyCompositionId(h.name || h.id, `node-${index + 1}`);
  const suffix = h.id.replace(/-/g, '').slice(-8);
  return `${base}-${suffix}`;
}

function titleCaseIdentifier(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function inferProjectFolderName(idea: string, appType: string): string {
  const source = /\bfood\b/i.test(idea) && /\bdeliver/i.test(idea)
    ? 'FoodDeliveryApp'
    : titleCaseIdentifier(appType.replace(/[^a-zA-Z0-9]+/g, ' '));
  return source || 'HolonicOapp';
}

function inferEdgeRelation(from: CompositionHolonNode, to: CompositionHolonNode): string {
  const targetKind = to.capability?.kind;
  const rule = from.capability?.relationRules.find((r) => targetKind && r.targetKinds.includes(targetKind));
  if (rule) return rule.relation;
  const fromRole = from.role;
  const toRole = to.role;
  if (fromRole === 'catalog/data' && toRole === 'transaction flow') return 'feeds selectable items into';
  if (fromRole === 'transaction flow' && toRole === 'logistics') return 'hands delivery jobs to';
  if (fromRole === 'transaction flow' && toRole === 'money flow') return 'requests checkout from';
  if (fromRole === 'transaction flow' && toRole === 'place/location') return 'uses location context from';
  if (fromRole === 'transaction flow' && toRole === 'comms') return 'publishes status events to';
  if (fromRole === 'identity' && toRole === 'trust') return 'owns review activity in';
  return 'connects to';
}

function buildCompositionNodes(picks: HolonSuggestion[]): CompositionHolonNode[] {
  return picks.map((s, i) => {
    const h = s.holon;
    const name = h.name || h.id;
    const capability = inferHolonCapability(h);
    return {
      id: compositionNodeId(h, i),
      catalogId: h.id,
      name,
      holonType: holonTypeNameFromEnum(h.holonType),
      role: roleForCapability(capability.kind),
      source: s.matchedTerms.includes('agent-selected') ? 'agent' : 'ide',
      confidence: Math.max(0, Math.min(1, s.score / 999)),
      notes: s.matchedTerms.length > 0 ? `Matched: ${s.matchedTerms.slice(0, 6).join(', ')}` : capability.summary,
      capability,
    };
  });
}

function buildCompositionEdges(nodes: CompositionHolonNode[]): CompositionHolonEdge[] {
  const preferredOrder = [
    'identity',
    'place/location',
    'catalog/data',
    'transaction flow',
    'logistics',
    'money flow',
    'trust',
    'comms',
    'ops',
    'component',
  ];
  const ordered = preferredOrder
    .map((role) => nodes.find((node) => node.role === role))
    .filter((node): node is CompositionHolonNode => Boolean(node));
  const edges: CompositionHolonEdge[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    const relation = inferEdgeRelation(from, to);
    edges.push({
      id: `edge-${i + 1}-${from.id}-${to.id}`.slice(0, 96),
      from: from.id,
      to: to.id,
      relation,
      reason: from.capability?.relationRules.find((r) => r.relation === relation)?.reason
        ?? `${from.name} ${relation} ${to.name} in the proposed app flow.`,
      requiredAdapter: from.role === to.role ? 'shared domain adapter' : undefined,
    });
  }
  return edges;
}

function buildCompositionPlan(idea: string, picks: HolonSuggestion[]): OappCompositionPlan {
  const archetype = matchAppArchetype(idea);
  const nodes = buildCompositionNodes(picks);
  const nodeByCatalogId = new Map(nodes.map((n) => [n.catalogId, n]));
  const lanes: CompositionCapabilityLane[] = (archetype?.subsystems ?? ['Core app composition']).map((subsystem, i) => {
    const matches = subsystemMatches(subsystem, picks);
    const matchedNodeIds = matches
      .map((s) => nodeByCatalogId.get(s.holon.id)?.id)
      .filter((id): id is string => Boolean(id));
    return {
      id: slugifyCompositionId(subsystem.split(':')[0], `lane-${i + 1}`),
      label: subsystem,
      matchedNodeIds,
      gap: matchedNodeIds.length === 0 ? 'No selected catalog holon clearly covers this capability yet.' : undefined,
    };
  });
  const roleToNodeIds = (role: string) => nodes.filter((n) => n.role === role).map((n) => n.id);
  const capabilitySurfaces: CompositionSurface[] = nodes.flatMap((node) =>
    (node.capability?.uiSurfaces ?? []).slice(0, 2).map((surface, i) => ({
      id: `${surface.kind}-${slugifyCompositionId(node.id, 'node')}-${i + 1}`,
      kind: surface.kind,
      label: surface.label,
      drivenByNodeIds: [node.id],
      description: surface.description,
    }))
  );
  const surfaces: CompositionSurface[] = [
    {
      id: 'route-home',
      kind: 'route',
      label: 'Home and discovery route',
      drivenByNodeIds: [...roleToNodeIds('catalog/data'), ...roleToNodeIds('place/location')],
      description: 'Entry point where users discover available entities and start the app flow.',
    },
    {
      id: 'service-order-flow',
      kind: 'service',
      label: 'Domain orchestration service',
      drivenByNodeIds: nodes.map((n) => n.id),
      description: 'Coordinates selected holons into a coherent app workflow with explicit adapters.',
    },
    {
      id: 'state-session',
      kind: 'state',
      label: 'User and app state',
      drivenByNodeIds: [...roleToNodeIds('identity'), ...roleToNodeIds('transaction flow')],
      description: 'Persists user-specific state, selected items, and current workflow status.',
    },
    ...capabilitySurfaces,
  ];
  const steps: CompositionBuildStep[] = buildReviewSteps(idea, picks).map((step, i) => ({
    id: `step-${i + 1}`,
    title: step.replace(/\.$/, ''),
    description: step,
    nodeIds: i < 2 ? nodes.map((n) => n.id) : nodes.filter((n) => step.toLowerCase().includes(n.role.split('/')[0])).map((n) => n.id),
    status: 'pending',
  }));
  return {
    version: 1,
    intent: idea.trim() || 'OAPP composition from selected STARNET holons',
    appType: archetype?.label ?? 'General OAPP',
    nodes,
    edges: buildCompositionEdges(nodes),
    capabilityLanes: lanes,
    surfaces,
    gaps: [
      ...lanes
      .filter((lane) => lane.gap)
      .map((lane) => ({
        id: `gap-${lane.id}`,
        label: lane.label,
        reason: lane.gap ?? 'Capability not covered by the selected holons.',
        suggestedResolution: 'Search STARNET for another holon, or create a custom app-specific holon.',
      })),
      ...nodes
        .filter((node) => node.capability?.kind === 'unknown')
        .map((node) => ({
          id: `gap-capability-${node.id}`,
          label: `${node.name} capability needs confirmation`,
          reason: 'The IDE could not infer a specific capability from the current catalog metadata.',
          suggestedResolution: 'Fetch full holon metadata from STAR and define its schema, ports, and adapter before implementation.',
        })),
    ],
    buildSteps: steps,
    verification: [
      {
        id: 'verify-catalog-ids',
        label: 'Verify catalog IDs',
        description: 'Fetch full details for each selected STARNET catalog id before implementation.',
      },
      {
        id: 'verify-app-flow',
        label: 'Verify app flow',
        description: 'Run the generated app and test the primary user journey end to end.',
      },
      {
        id: 'verify-gaps',
        label: 'Verify gaps',
        description: 'Confirm every gap is either resolved by a selected holon or tracked as custom work.',
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function buildHolonicAppBuildContract(
  idea: string,
  plan: OappCompositionPlan
): HolonicAppBuildContract {
  const projectFolder = inferProjectFolderName(idea, plan.appType);
  const requiredFiles = [
    { path: 'package.json', reason: 'Own npm manifest so commands cannot walk up to the workspace root.' },
    { path: 'vite.config.js', reason: 'Vite config with a non-IDE dev port.' },
    { path: 'index.html', reason: 'Browser entry that loads the app module.' },
    { path: 'src/main.jsx', reason: 'Primary Vite React module entry.' },
    { path: 'src/api/starnetApi.js', reason: 'STAR WebAPI adapter.' },
    { path: 'src/api/holonRuntimeAdapter.js', reason: 'Dual fixture/live adapter boundary for write-capable holon operations.' },
    { path: 'src/holons/reusableHolonSpecs.js', reason: 'Reusable holon contracts with ports, dependencies, adapters, fixtures, and verification.' },
    { path: 'src/holons/manifest.js', reason: 'Selected STARNET holons and capability bindings.' },
    { path: 'src/styles.css', reason: 'Initial app shell styles.' },
    { path: 'README.md', reason: 'Run and integration notes.' },
  ];
  const cwd = projectFolder;
  return {
    version: 1,
    projectPath: projectFolder,
    stack: 'vite',
    appName: projectFolder.replace(/App$/, ' App'),
    recipePath: 'OASIS-IDE/docs/recipes/minimal-vite-browser-oapp.md',
    reusableHolonSpecPath: 'src/holons/reusableHolonSpecs.js',
    liveRuntimeAdapterPath: 'src/api/holonRuntimeAdapter.js',
    requiredFiles,
    installCommand: { label: 'Install dependencies', argv: ['npm', 'install'], cwd },
    buildCommand: { label: 'Verify production build', argv: ['npm', 'run', 'build'], cwd },
    devCommand: { label: 'Start Vite preview', argv: ['npm', 'run', 'dev'], cwd },
    capabilityBindings: plan.nodes.map((node) => ({
      nodeId: node.id,
      catalogId: node.catalogId,
      name: node.name,
      role: node.role,
      capability: node.capability,
      adapterPath: `src/holons/${slugifyCompositionId(node.name, node.id)}.js`,
    })),
    acceptanceChecks: [
      {
        id: 'own-package-json',
        label: 'Own package.json',
        description: 'The generated folder contains its own package.json before any npm command runs.',
        status: 'pending',
      },
      {
        id: 'scaffold-validator',
        label: 'Scaffold validator passes',
        description: 'validate_holonic_app_scaffold reports all required files, scripts, entrypoints, reusable holon specs, and holon ids present.',
        status: 'pending',
      },
      {
        id: 'runtime-adapter-boundary',
        label: 'Runtime adapter boundary exists',
        description: 'The app keeps deterministic fixture mode separate from live STAR/OASIS holon writes.',
        status: 'pending',
      },
      {
        id: 'npm-build',
        label: 'npm run build passes',
        description: 'The app builds from its own project folder with exit code 0.',
        status: 'pending',
      },
    ],
  };
}

function buildConfirmedBuildPrompt(baseUrl: string): string {
  return [
    '[IDE Build Review Confirmed]',
    'Proceed from the reviewed STARNET composition plan and holonic app build contract attached by the IDE Build/STARNET UI.',
    `STAR WebAPI for this IDE: \`${baseUrl}\``,
    'Use validate_holonic_app_scaffold with reusableHolonSpecPath before npm install/build/dev. Do not run npm in a folder until that folder has its own package.json.'
  ].join('\n');
}

/**
 * Local holon ranking only (no agent, no chat). Drafts a markdown handoff into the right-panel Composer.
 */
export const StarnetBuildTab: React.FC<StarnetBuildTabProps> = ({
  holonCatalogRows,
  baseUrl,
  holonsLoading,
  onSubmitBuildRequest,
  selectedCatalogIds = [],
  selectedQuery = '',
  onClearSelection
}) => {
  const { applyCompositionPlan, applyBuildContract } = useOappBuildPlan();
  const [idea, setIdea] = useState('');
  const [suggestions, setSuggestions] = useState<HolonSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [buildReviewOpen, setBuildReviewOpen] = useState(false);
  const [buildFeedback, setBuildFeedback] = useState('');

  const externallySelectedRows = useMemo(() => {
    if (selectedCatalogIds.length === 0) return [];
    const selected = new Set(selectedCatalogIds.map((id) => id.toLowerCase()));
    return holonCatalogRows.filter((h) => selected.has(h.id.toLowerCase()));
  }, [holonCatalogRows, selectedCatalogIds]);

  useEffect(() => {
    if (externallySelectedRows.length === 0) return;
    const compositionQuery = selectedQuery.trim() || 'Agent-selected STARNET rows for OAPP composition';
    const archetype = matchAppArchetype(compositionQuery);
    const rankingQuery = [compositionQuery, ...(archetype?.subsystems ?? [])].join('\n');
    const ranked = suggestHolonsForIdea(rankingQuery, holonCatalogRows, { max: 24 }).filter((s) => s.score >= 6);
    const next = mergeSuggestions(selectedRowsToSuggestions(externallySelectedRows), ranked, 10);
    setSuggestions(next);
    setSelectedIds(new Set(next.slice(0, Math.min(8, next.length)).map((s) => s.holon.id)));
    setIdea(compositionQuery);
  }, [externallySelectedRows, holonCatalogRows, selectedQuery]);

  const analyze = useCallback(() => {
    const archetype = matchAppArchetype(idea);
    const rankingQuery = [idea, ...(archetype?.subsystems ?? [])].join('\n');
    const next = mergeSuggestions([], suggestHolonsForIdea(rankingQuery, holonCatalogRows, { max: 24 }).filter((s) => s.score >= 6), 10);
    setSuggestions(next);
    setSelectedIds(new Set(next.slice(0, Math.min(8, next.length)).map((s) => s.holon.id)));
  }, [idea, holonCatalogRows]);

  const setIncluded = useCallback((id: string, included: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (included) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const submitBuildRequest = useCallback((feedback?: string) => {
    const picks = suggestions.filter((s) => selectedIds.has(s.holon.id));
    if (picks.length === 0) return;
    const plan = buildCompositionPlan(idea, picks);
    applyCompositionPlan(plan);
    applyBuildContract(buildHolonicAppBuildContract(idea, plan));
    const note = feedback?.trim()
      ? `${buildConfirmedBuildPrompt(baseUrl)}\n\nUser review feedback:\n${feedback.trim()}`
      : buildConfirmedBuildPrompt(baseUrl);
    onSubmitBuildRequest(note);
  }, [suggestions, selectedIds, idea, baseUrl, onSubmitBuildRequest, applyCompositionPlan, applyBuildContract]);

  const selectedSuggestions = useMemo(
    () => suggestions.filter((s) => selectedIds.has(s.holon.id)),
    [suggestions, selectedIds]
  );
  const appArchetype = useMemo(() => matchAppArchetype(idea), [idea]);
  const reviewSteps = useMemo(
    () => buildReviewSteps(idea, selectedSuggestions),
    [idea, selectedSuggestions]
  );
  const buildContractPreview = useMemo(() => {
    if (selectedSuggestions.length === 0) return null;
    return buildHolonicAppBuildContract(idea, buildCompositionPlan(idea, selectedSuggestions));
  }, [idea, selectedSuggestions]);

  if (holonsLoading && holonCatalogRows.length === 0) {
    return (
      <div className="sn-loading sn-loading--inline sn-build-loading">
        <Loader2 size={14} className="sn-spin" /> Loading holon catalog…
      </div>
    );
  }

  if (holonCatalogRows.length === 0) {
    return (
      <div className="sn-empty sn-empty--sm sn-build-empty">
        <div className="sn-empty-sub">
          No holons loaded yet. Open <strong>Holons</strong> and refresh, or check Settings → STARNET and your
          login — then return here to match templates to a phrase.
        </div>
      </div>
    );
  }

  return (
    <div className="sn-build-panel">
      <div className="sn-build-field-row">
        <label className="sn-build-label" htmlFor="sn-build-idea">
          Phrase to match or selected workspace
        </label>
        <input
          id="sn-build-idea"
          type="text"
          className="sn-build-idea-input"
          placeholder="e.g. geo check-ins, quests, karma"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={400}
          autoComplete="off"
          spellCheck={false}
          aria-label="Short phrase for local holon ranking; not sent until you use the Composer on the right"
        />
      </div>
      <div className="sn-build-actions">
        <button type="button" className="sn-primary-btn" onClick={analyze}>
          <Sparkles size={12} /> Rank holons
        </button>
        {externallySelectedRows.length > 0 && onClearSelection ? (
          <button type="button" className="sn-action-btn sn-action-btn--ghost" onClick={onClearSelection}>
            <X size={12} /> Clear agent selection
          </button>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <>
          <div className="sn-compose-workspace">
            <div className="sn-compose-header">
              <Network size={13} />
              <span>Visual composition workspace</span>
              <span className="sn-compose-count">{selectedIds.size} selected</span>
            </div>
            {appArchetype ? (
              <div className="sn-compose-plan" aria-label="Detected app capability plan">
                <div className="sn-compose-plan-title">
                  Detected app shape: <strong>{appArchetype.label}</strong>
                </div>
                <div className="sn-compose-lanes">
                  {appArchetype.subsystems.map((subsystem) => {
                    const matches = subsystemMatches(subsystem, selectedSuggestions).slice(0, 3);
                    return (
                      <div className="sn-compose-lane" key={subsystem}>
                        <span className="sn-compose-lane-name">{subsystem}</span>
                        {matches.length > 0 ? (
                          <span className="sn-compose-lane-match">
                            {matches.map((s) => s.holon.name || s.holon.id).join(' + ')}
                          </span>
                        ) : (
                          <span className="sn-compose-lane-gap">Gap to design or search</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="sn-compose-canvas" aria-label="Selected STARNET rows for OAPP composition">
              {selectedSuggestions
                .map((s, i, arr) => {
                  const h = s.holon;
                  return (
                    <React.Fragment key={h.id}>
                      <div className="sn-compose-card" title={h.id}>
                        <span className="sn-compose-card-name">{h.name || h.id}</span>
                        <span className="sn-compose-card-type">{holonTypeNameFromEnum(h.holonType)}</span>
                        <span className="sn-compose-card-role">{inferCompositionRole(h)}</span>
                        <span className="sn-compose-card-capability">{capabilitySummaryForHolon(h)}</span>
                      </div>
                      {i < arr.length - 1 ? <span className="sn-compose-edge" aria-hidden>→</span> : null}
                    </React.Fragment>
                  );
                })}
            </div>
            <p className="sn-build-placeholder">
              This is a staging area for the OAPP composition. Use <strong>Build OAPP</strong> to review the proposed
              steps, gaps, and selected catalog IDs before sending anything to the agent.
            </p>
          </div>
          {buildReviewOpen ? (
            <div className="sn-build-review" aria-label="Review OAPP build plan before confirming">
              <div className="sn-build-review-header">
                <div>
                  <div className="sn-build-review-kicker">Review before build</div>
                  <h3>OAPP build plan</h3>
                </div>
                <span className="sn-build-review-count">{selectedSuggestions.length} holons selected</span>
              </div>
              <div className="sn-build-review-grid">
                <section className="sn-build-review-card">
                  <h4>Selected holons</h4>
                  <ul>
                    {selectedSuggestions.slice(0, 10).map((s) => (
                      <li key={s.holon.id}>
                        <strong>{s.holon.name || s.holon.id}</strong>
                        <span>{capabilitySummaryForHolon(s.holon)}</span>
                      </li>
                    ))}
                    {selectedSuggestions.length > 10 ? (
                      <li>
                        <strong>+{selectedSuggestions.length - 10} more</strong>
                        <span>included in the confirmed request</span>
                      </li>
                    ) : null}
                  </ul>
                </section>
                <section className="sn-build-review-card">
                  <h4>Suggested build steps</h4>
                  <ol>
                    {reviewSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              </div>
              {appArchetype ? (
                <section className="sn-build-review-card sn-build-review-card--wide">
                  <h4>Capability coverage</h4>
                  <div className="sn-build-review-coverage">
                    {appArchetype.subsystems.map((subsystem) => {
                      const matches = subsystemMatches(subsystem, selectedSuggestions).slice(0, 2);
                      return (
                        <div className="sn-build-review-coverage-row" key={subsystem}>
                          <span>{subsystem}</span>
                          {matches.length > 0 ? (
                            <strong>{matches.map((s) => s.holon.name || s.holon.id).join(' + ')}</strong>
                          ) : (
                            <em>Gap to confirm</em>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {buildContractPreview ? (
                <section className="sn-build-review-card sn-build-review-card--wide">
                  <h4>Scaffold contract</h4>
                  <div className="sn-build-review-coverage">
                    <div className="sn-build-review-coverage-row">
                      <span>Project folder</span>
                      <strong>{buildContractPreview.projectPath}</strong>
                    </div>
                    <div className="sn-build-review-coverage-row">
                      <span>Required files</span>
                      <strong>{buildContractPreview.requiredFiles.map((file) => file.path).join(' + ')}</strong>
                    </div>
                    <div className="sn-build-review-coverage-row">
                      <span>Before npm</span>
                      <strong>validate_holonic_app_scaffold</strong>
                    </div>
                  </div>
                </section>
              ) : null}
              <section className="sn-build-review-card sn-build-review-card--wide">
                <label className="sn-build-review-feedback-label" htmlFor="sn-build-review-feedback">
                  Optional edits or feedback before approval
                </label>
                <textarea
                  id="sn-build-review-feedback"
                  className="sn-build-review-feedback"
                  value={buildFeedback}
                  onChange={(e) => setBuildFeedback(e.target.value)}
                  placeholder="Example: remove ForumTemplate, add an admin dashboard, treat location as custom work..."
                  rows={3}
                />
                <p className="sn-build-review-feedback-hint">
                  This does not fill the Composer. Approval sends the reviewed action directly to the active agent flow.
                </p>
              </section>
              <div className="sn-build-review-actions">
                <button type="button" className="sn-action-btn sn-action-btn--ghost" onClick={() => setBuildReviewOpen(false)}>
                  Edit selection
                </button>
                {buildFeedback.trim() ? (
                  <button
                    type="button"
                    className="sn-action-btn"
                    disabled={selectedIds.size === 0}
                    onClick={() => submitBuildRequest(buildFeedback)}
                  >
                    Send feedback
                  </button>
                ) : null}
                <button
                  type="button"
                  className="sn-build-gold-btn"
                  disabled={selectedIds.size === 0}
                  onClick={() => submitBuildRequest()}
                >
                  <CheckCircle2 size={13} /> Confirm build request
                </button>
              </div>
            </div>
          ) : null}
          <div className="sn-build-table-wrap">
            <table className="sn-build-table">
              <thead>
                <tr>
                  <th className="sn-build-th sn-build-th--check" scope="col">
                    Use
                  </th>
                  <th className="sn-build-th" scope="col">
                    Holon
                  </th>
                  <th className="sn-build-th" scope="col">
                    Type
                  </th>
                  <th className="sn-build-th sn-build-th--num" scope="col">
                    Score
                  </th>
                  <th className="sn-build-th" scope="col">
                    Matched terms
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const h = s.holon;
                  const id = h.id;
                  const on = selectedIds.has(id);
                  return (
                    <tr key={id} className={on ? 'sn-build-tr--on' : undefined}>
                      <td className="sn-build-td sn-build-td--check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setIncluded(id, e.target.checked)}
                          aria-label={`Include ${h.name || id}`}
                        />
                      </td>
                      <td className="sn-build-td sn-build-td--name" title={id}>
                        {h.name || id}
                      </td>
                      <td className="sn-build-td">{holonTypeNameFromEnum(h.holonType)}</td>
                      <td className="sn-build-td sn-build-td--num">{s.score}</td>
                      <td className="sn-build-td sn-build-td--terms">
                        {s.matchedTerms.length > 0 ? s.matchedTerms.slice(0, 6).join(', ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sn-build-actions sn-build-actions--footer">
            <button
              type="button"
              className="sn-build-gold-btn"
              disabled={selectedIds.size === 0}
              onClick={() => setBuildReviewOpen(true)}
            >
              <Hammer size={13} /> Build OAPP
            </button>
          </div>
        </>
      ) : (
        <p className="sn-build-placeholder">
          Run <strong>Rank holons</strong> to score the catalog against your phrase (all processing stays in this
          tab).
        </p>
      )}
    </div>
  );
};
