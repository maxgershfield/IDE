/**
 * Test script for buildHolonAnnotatedWorkspaceNote
 *
 * Run with:
 *   npx tsx scripts/test-holon-annotation.ts
 *
 * No IDE or browser required — exercises the pure function directly.
 * Prints what the agent would receive in its context pack for each scenario.
 */

import { buildHolonAnnotatedWorkspaceNote } from '../src/renderer/utils/holonWorkspaceAnnotation';
import type { TreeNode } from '../src/renderer/contexts/WorkspaceContext';
import type { StarHolonRecord, OAPPRecord } from '../src/renderer/services/starApiService';
import type { StarWorkspaceConfig } from '../src/shared/starWorkspaceTypes';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const DIVIDER = '\n' + '─'.repeat(72) + '\n';

function hr(label: string): void {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${label}`);
  console.log('═'.repeat(72) + '\n');
}

function makeDir(name: string, children?: TreeNode[]): TreeNode {
  return { name, path: `/${name}`, isDirectory: true, children: children ?? [] };
}

function makeFile(name: string): TreeNode {
  return { name, path: `/${name}`, isDirectory: false };
}

/* ─── Shared catalog data (simulates logged-in STARNET snapshot) ─────────── */

const CATALOG_HOLONS: StarHolonRecord[] = [
  { id: 'holon-quest-001', name: 'Quest Manager Template', holonType: 8, isActive: true },
  { id: 'holon-nft-001',   name: 'Web4 NFT Drop Holon',    holonType: 62, isActive: true },
  { id: 'holon-avatar-001',name: 'Social Avatar Holon',     holonType: 3, isActive: true },
  { id: 'holon-wallet-001',name: 'Wallet Holon',            holonType: 147, isActive: true },
  { id: 'holon-dao-001',   name: 'DAO Governance Holon',    holonType: 164, isActive: true },
];

const CATALOG_OAPPS: OAPPRecord[] = [
  {
    id: 'oapp-quest-starter',
    name: 'Quest App Starter',
    oappType: 5,
    sourcePublishedOnSTARNET: true,
    totalSourceInstalls: 42,
    totalSelfContainedInstalls: 12,
    totalSelfContainedFullInstalls: 6,
    version: '1.2.0',
  },
  {
    id: 'oapp-nft-drop',
    name: 'NFT Drop Template',
    oappType: 5,
    sourcePublishedOnSTARNET: true,
    totalSourceInstalls: 17,
    totalSelfContainedInstalls: 3,
    totalSelfContainedFullInstalls: 1,
  },
];

/* ─── Scenario 1: Brand new user, no STARNET, no config ─────────────────── */

hr('SCENARIO 1 — Brand new user: no STARNET login, no .star-workspace.json');
console.log('Tree: a React app with a mix of domain and utility directories\n');

const newUserTree: TreeNode[] = [
  makeDir('src', [
    makeDir('auth'),
    makeDir('billing'),
    makeDir('dashboard'),
    makeDir('notifications'),
    makeDir('utils'),
    makeDir('types'),
    makeDir('api'),
    makeFile('App.tsx'),
    makeFile('main.tsx'),
  ]),
  makeDir('public'),
  makeDir('node_modules'),
  makeDir('dist'),
  makeFile('package.json'),
  makeFile('README.md'),
  makeFile('tsconfig.json'),
];

const scenario1 = buildHolonAnnotatedWorkspaceNote({
  tree: newUserTree,
  workspacePath: '/Users/dev/my-react-app',
  starWorkspaceConfig: null,
  holonCatalogRows: [],
  oapps: [],
  scanResult: null,
});

console.log(scenario1 ?? '(null — no workspace)');

/* ─── Scenario 2: Tier 2 kicks in — content scan detected framework ──────── */

hr('SCENARIO 2 — Same app, but tier-2 background scan has now completed');
console.log('Scan result: detected React + TypeScript, OASIS import found in auth/\n');

const scenario2 = buildHolonAnnotatedWorkspaceNote({
  tree: newUserTree,
  workspacePath: '/Users/dev/my-react-app',
  starWorkspaceConfig: null,
  holonCatalogRows: [],
  oapps: [],
  scanResult: {
    workspacePath: '/Users/dev/my-react-app',
    scannedAt: Date.now(),
    projectLanguage: 'TypeScript/JavaScript',
    projectFramework: 'React',
    usesOasisApi: true,
    projectDescription: 'A decentralised social app built on the OASIS API.',
    dirSignals: {
      auth:          ['oasis-import', 'iholon-impl', 'framework-react'],
      billing:       ['framework-react'],
      dashboard:     ['framework-react'],
      notifications: ['oasis-import', 'framework-react'],
    },
  },
});

console.log(scenario2 ?? '(null)');

/* ─── Scenario 3: Logged-in user with STARNET catalog (tier 3) ───────────── */

hr('SCENARIO 3 — User is logged in, STARNET catalog loaded, no .star-workspace.json yet');
console.log('The annotation should cross-reference dirs against the catalog\n');

const starnetTree: TreeNode[] = [
  makeDir('quests'),
  makeDir('nft'),
  makeDir('avatar'),
  makeDir('wallet'),
  makeDir('dao'),
  makeDir('utils'),
  makeDir('shared'),
  makeDir('node_modules'),
  makeFile('package.json'),
  makeFile('.gitignore'),
];

const scenario3 = buildHolonAnnotatedWorkspaceNote({
  tree: starnetTree,
  workspacePath: '/Users/dev/my-oasis-app',
  starWorkspaceConfig: null,
  holonCatalogRows: CATALOG_HOLONS,
  oapps: CATALOG_OAPPS,
  scanResult: {
    workspacePath: '/Users/dev/my-oasis-app',
    scannedAt: Date.now(),
    projectLanguage: 'TypeScript/JavaScript',
    projectFramework: 'Hyperfy',
    usesOasisApi: true,
    projectDescription: 'Metaverse quest game with NFT rewards.',
    dirSignals: {
      quests: ['oasis-import', 'iholon-impl'],
      nft:    ['oasis-import'],
      avatar: ['oasis-import', 'iholon-impl'],
      wallet: ['framework-react'],
      dao:    ['holon-field-shape'],
    },
  },
});

console.log(scenario3 ?? '(null)');

/* ─── Scenario 4: Fully configured project with .star-workspace.json ─────── */

hr('SCENARIO 4 — Fully configured: .star-workspace.json + catalog + scan');
console.log('This is what a returning developer sees after project setup\n');

const starConfig: StarWorkspaceConfig = {
  name: 'MyQuestWorld',
  description: 'An open-world quest game with on-chain NFT loot and DAO governance.',
  gameEngine: 'hyperfy',
  oappId: 'oapp-quest-starter',
  oasisProjectId: 'proj-abc-123',
  selectedStarnetHolonIds: ['holon-quest-001', 'holon-nft-001', 'holon-avatar-001'],
  starnetNetwork: 'testnet',
};

const scenario4 = buildHolonAnnotatedWorkspaceNote({
  tree: starnetTree,
  workspacePath: '/Users/dev/quest-world',
  starWorkspaceConfig: starConfig,
  holonCatalogRows: CATALOG_HOLONS,
  oapps: CATALOG_OAPPS,
  scanResult: {
    workspacePath: '/Users/dev/quest-world',
    scannedAt: Date.now(),
    projectLanguage: 'TypeScript/JavaScript',
    projectFramework: 'Hyperfy',
    usesOasisApi: true,
    projectDescription: 'Open-world quest game.',
    dirSignals: {
      quests: ['oasis-import', 'iholon-impl'],
      nft:    ['oasis-import'],
      avatar: ['oasis-import'],
    },
  },
});

console.log(scenario4 ?? '(null)');

/* ─── Scenario 5: Non-OASIS domain codebase (healthcare app) ────────────── */

hr('SCENARIO 5 — Completely custom domain: a healthcare app with no OASIS imports');
console.log('All holons are custom / inferred — none match the enum\n');

const healthTree: TreeNode[] = [
  makeDir('patients'),
  makeDir('prescriptions'),
  makeDir('appointments'),
  makeDir('billing'),
  makeDir('lab-results'),
  makeDir('staff'),
  makeDir('utils'),
  makeDir('config'),
  makeDir('node_modules'),
  makeFile('package.json'),
];

const scenario5 = buildHolonAnnotatedWorkspaceNote({
  tree: healthTree,
  workspacePath: '/Users/dev/clinic-app',
  starWorkspaceConfig: null,
  holonCatalogRows: CATALOG_HOLONS,
  oapps: CATALOG_OAPPS,
  scanResult: {
    workspacePath: '/Users/dev/clinic-app',
    scannedAt: Date.now(),
    projectLanguage: 'TypeScript/JavaScript',
    projectFramework: 'React',
    usesOasisApi: false,
    projectDescription: 'Patient management system for GP clinics.',
    dirSignals: {},
  },
});

console.log(scenario5 ?? '(null)');

console.log(DIVIDER);
console.log('All scenarios printed above. Compare:');
console.log('  Scenario 1 — No data at all: tier 1 inference only');
console.log('  Scenario 2 — Framework detected: tier 2 upgrades some to "inferred"');
console.log('  Scenario 3 — STARNET catalog: tier 3 adds match counts');
console.log('  Scenario 4 — Full config: declared holons + OAPP identity shown');
console.log('  Scenario 5 — Custom domain: all holons are "custom" + publish candidates');
console.log(DIVIDER);
