import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

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
  githubConnected: boolean;
  gitlabConnected: boolean;

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

  // Models
  enabledModels: [
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

  // Integrations
  oasisApiEndpoint: '',
  githubConnected: false,
  gitlabConnected: false,

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

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function mergeWithDefaults(raw: Record<string, unknown>): OASISSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
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
        window.electronAPI.setSettings(patch as Record<string, unknown>).catch((e) =>
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
