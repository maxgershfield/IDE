import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  isMintWorkflowChainId,
  isSolanaClusterId,
  type OnChainMintWorkflowChainId,
  type OnChainSolanaClusterId,
} from '../constants/onChainMintWorkflow';
import { invalidateStarnetListCache } from '../services/starApiService';

// ---------------------------------------------------------------------------
// Settings shape
// ---------------------------------------------------------------------------

export interface FilePathRule {
  glob: string;
  content: string;
}

export interface OASISSettings {
  // General
  theme: 'dark' | 'light' | 'oasis';
  showTitleBar: boolean;
  showStatusBar: boolean;
  reviewControlLocation: 'breadcrumb' | 'floating';
  autoHideEditorWhenEmpty: boolean;
  fontSize: number;
  fontFamily: string;

  // Agents
  textSize: 'default' | 'large';
  autoClearChat: boolean;
  submitWithCmdEnter: boolean;
  maxTabCount: number;
  queueMessages: 'immediate' | 'after-current';
  usageSummaryDisplay: 'auto' | 'always' | 'never';
  agentAutocomplete: boolean;
  startAgentReviewOnCommit: boolean;
  /**
   * **full** (default) — full STARNET table in context when the IDE has loaded it; best for “which holons to use?”.
   * **searchFirst** — smaller system pack; STARNET table may be pointer-only; higher risk of the model using slow MCP list tools.
   */
  agentContextPacking: 'searchFirst' | 'full';
  /**
   * **normal** — default thread/pack sizes for the agent.
   * **low** — shorter history, smaller tool result snippets, tighter autoload/pack caps (reduces OpenAI tokens per request).
   */
  agentInputBudget: 'normal' | 'low';

  // Models
  enabledModels: string[];
  apiKeys: {
    openai: string;
    anthropic: string;
    google: string;
    xai: string;
    elevenlabs: string;
  };

  // Integrations
  oasisApiEndpoint: string;
  /**
   * OASIS Web Portal (browser). Used for "Open in portal" and deep links. Should end with / for path joins.
   * @example https://oasisweb4.one/portal/
   */
  portalBaseUrl: string;
  /**
   * Poll OASIS A2A inbox and STAR NFT list; show an in-IDE banner when counts increase (portal parity).
   */
  portalActivityNotify: boolean;
  /** Seconds between background polls when portal activity notify is on. */
  portalActivityPollSec: number;
  githubConnected: boolean;
  gitlabConnected: boolean;

  /** First-run welcome ribbon dismissed */
  welcomeOnboardingDismissed: boolean;

  // Rules & Skills
  alwaysAppliedRules: string[];
  filePathRules: FilePathRule[];

  // Tools & MCPs
  browserAutomation: 'browser-tab' | 'external';
  showLocalhostLinks: boolean;

  // OASIS Avatar
  avatarSyncEnabled: boolean;

  // STARNET
  starnetNamespace: string;
  starnetPublishVisibility: 'public' | 'private' | 'friends';
  starnetAutoPublish: boolean;
  starnetAllowForks: boolean;
  starnetEndpointOverride: string;

  // AI Routing / BRAID
  routingTier: 'fast' | 'balanced' | 'frontier' | 'specialist';
  showModelInChat: boolean;
  braidGraphReuse: boolean;
  costBudgetPerSession: number;
  costBudgetPerMonth: number;
  maxRoutingTier: 'fast' | 'balanced' | 'frontier' | 'specialist' | 'none';
  deniedProviders: string[];

  // Game Dev Mode
  gameDevMode: boolean;
  gameDevPromptPreset: 'fivem' | 'metaverse' | 'custom';
  gameDevCustomPrompt: string;
  gameToolPalette: {
    quest: boolean;
    npc: boolean;
    lore: boolean;
    voice: boolean;
    item: boolean;
    mission: boolean;
  };

  // Data Providers
  primaryProvider: 'mongodb' | 'holochain' | 'ipfs' | 'solana' | 'sqlite';
  fallbackProviders: string[];
  autoReplicateHolons: boolean;

  /** Default chain for MCP mint workflow and agent prompts (Tier A list). */
  onChainDefaultChain: OnChainMintWorkflowChainId;
  /** Solana RPC cluster when `onChainDefaultChain` is solana. */
  onChainSolanaCluster: OnChainSolanaClusterId;
}

export const DEFAULT_SETTINGS: OASISSettings = {
  // General
  theme: 'dark',
  showTitleBar: true,
  showStatusBar: true,
  reviewControlLocation: 'breadcrumb',
  autoHideEditorWhenEmpty: false,
  fontSize: 14,
  fontFamily: 'default',

  // Agents
  textSize: 'default',
  autoClearChat: true,
  submitWithCmdEnter: false,
  maxTabCount: 5,
  queueMessages: 'after-current',
  usageSummaryDisplay: 'auto',
  agentAutocomplete: true,
  startAgentReviewOnCommit: false,
  /** `full` attaches the full STARNET table when the IDE has it (reliable for holon pick questions). */
  agentContextPacking: 'full',
  agentInputBudget: 'normal',

  // Models
  enabledModels: [
    'gpt-5.5',
    'gpt-5.5-pro',
    'gpt-4o',
    'gpt-4o-mini',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'gemini-2.0-flash',
    'grok-3',
  ],
  apiKeys: {
    openai: '',
    anthropic: '',
    google: '',
    xai: '',
    elevenlabs: '',
  },

  // Integrations — `settings:get` (main) fills the real default: local ONODE in dev, public API when packaged.
  oasisApiEndpoint: '',
  portalBaseUrl: 'https://oasisweb4.one/portal/',
  portalActivityNotify: false,
  portalActivityPollSec: 120,
  githubConnected: false,
  gitlabConnected: false,
  welcomeOnboardingDismissed: false,

  // Rules & Skills
  alwaysAppliedRules: [],
  filePathRules: [],

  // Tools & MCPs
  browserAutomation: 'browser-tab',
  showLocalhostLinks: true,

  // OASIS Avatar
  avatarSyncEnabled: true,

  // STARNET
  starnetNamespace: '',
  starnetPublishVisibility: 'public',
  starnetAutoPublish: false,
  starnetAllowForks: true,
  starnetEndpointOverride: '',

  // AI Routing / BRAID
  routingTier: 'balanced',
  showModelInChat: true,
  braidGraphReuse: true,
  costBudgetPerSession: 0,
  costBudgetPerMonth: 0,
  maxRoutingTier: 'none',
  deniedProviders: [],

  // Game Dev Mode
  gameDevMode: false,
  gameDevPromptPreset: 'fivem',
  gameDevCustomPrompt: '',
  gameToolPalette: {
    quest: true,
    npc: true,
    lore: true,
    voice: true,
    item: true,
    mission: true,
  },

  // Data Providers
  primaryProvider: 'mongodb',
  fallbackProviders: [],
  autoReplicateHolons: true,

  onChainDefaultChain: 'solana',
  onChainSolanaCluster: 'devnet',
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SettingsContextType {
  settings: OASISSettings;
  updateSettings: (patch: Partial<OASISSettings>) => void;
  isSettingsOpen: boolean;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  activeSection: string;
  setActiveSection: (s: string) => void;
}

const SETTINGS_CONTEXT_KEY = '__OASIS_IDE_SETTINGS_CONTEXT__';

type SettingsContextGlobal = typeof globalThis & {
  [SETTINGS_CONTEXT_KEY]?: React.Context<SettingsContextType | undefined>;
};

// Vite HMR can briefly load provider and consumer from different module instances.
// Keep the context identity stable so existing consumers remain under the provider.
const settingsContextGlobal = globalThis as SettingsContextGlobal;
const SettingsContext =
  settingsContextGlobal[SETTINGS_CONTEXT_KEY] ??
  (settingsContextGlobal[SETTINGS_CONTEXT_KEY] = createContext<SettingsContextType | undefined>(undefined));

function mergeWithDefaults(raw: Record<string, unknown>): OASISSettings {
  const onChainDefaultChain = isMintWorkflowChainId(raw.onChainDefaultChain)
    ? raw.onChainDefaultChain
    : DEFAULT_SETTINGS.onChainDefaultChain;
  const onChainSolanaCluster = isSolanaClusterId(raw.onChainSolanaCluster)
    ? raw.onChainSolanaCluster
    : DEFAULT_SETTINGS.onChainSolanaCluster;

  const portalActivityPollSec =
    typeof raw.portalActivityPollSec === 'number' && !Number.isNaN(raw.portalActivityPollSec)
      ? Math.min(3600, Math.max(30, Math.floor(raw.portalActivityPollSec)))
      : typeof raw.portalActivityPollSec === 'string'
        ? Math.min(3600, Math.max(30, Math.floor(Number(raw.portalActivityPollSec) || DEFAULT_SETTINGS.portalActivityPollSec)))
        : DEFAULT_SETTINGS.portalActivityPollSec;

  const agentContextPacking =
    raw.agentContextPacking === 'full' || raw.agentContextPacking === 'searchFirst'
      ? raw.agentContextPacking
      : DEFAULT_SETTINGS.agentContextPacking;
  const agentInputBudget =
    raw.agentInputBudget === 'low' || raw.agentInputBudget === 'normal'
      ? raw.agentInputBudget
      : DEFAULT_SETTINGS.agentInputBudget;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    agentContextPacking,
    agentInputBudget,
    portalActivityPollSec,
    onChainDefaultChain,
    onChainSolanaCluster,
    apiKeys: {
      ...DEFAULT_SETTINGS.apiKeys,
      ...((raw.apiKeys as object | undefined) ?? {}),
    },
    gameToolPalette: {
      ...DEFAULT_SETTINGS.gameToolPalette,
      ...((raw.gameToolPalette as object | undefined) ?? {}),
    },
  } as OASISSettings;
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<OASISSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI?.getSettings) {
          const raw = await window.electronAPI.getSettings();
          setSettings(mergeWithDefaults(raw));
        }
      } catch (e) {
        console.warn('[Settings] Failed to load from disk, using defaults', e);
      }
    };
    load();
  }, []);

  const updateSettings = useCallback((patch: Partial<OASISSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch } as OASISSettings;
      if (window.electronAPI?.setSettings) {
        void window.electronAPI.setSettings(patch as Record<string, unknown>).then(() => {
          if ('starnetEndpointOverride' in patch) {
            invalidateStarnetListCache();
          }
        }).catch((e) =>
          console.error('[Settings] Failed to persist settings:', e)
        );
      }
      return next;
    });
  }, []);

  const openSettings = useCallback((section = 'general') => {
    setActiveSection(section);
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        isSettingsOpen,
        openSettings,
        closeSettings,
        activeSection,
        setActiveSection,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
