import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useMCP } from '../../contexts/MCPContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  mintWorkflowChainLabel,
  type OnChainMintWorkflowChainId,
} from '../../constants/onChainMintWorkflow';
import { McpToolCallCard, type McpInvocationPhase } from './McpToolCallCard';
import './ComposerInlineOnChainWorkflow.css';

export type OnChainWorkflowMode = 'mint' | 'wallet' | 'health';

/** Match Composer paste limits; MCP allows up to 12 MB after base64 decode. */
const MAX_MINT_IMAGE_BYTES = 4 * 1024 * 1024;

const WALLET_PROVIDER_CHOICES: { value: string; label: string }[] = [
  { value: 'SolanaOASIS', label: 'Solana' },
  { value: 'EthereumOASIS', label: 'Ethereum' },
  { value: 'ArbitrumOASIS', label: 'Arbitrum' },
  { value: 'PolygonOASIS', label: 'Polygon' },
  { value: 'BaseOASIS', label: 'Base' },
];

function normalizeMcpToolResult(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'content' in raw) {
    const c = (raw as { content?: Array<{ type?: string; text?: string }> }).content;
    if (Array.isArray(c)) {
      const texts = c.map((x) => x?.text ?? '').filter(Boolean);
      if (texts.length) return texts.join('\n');
    }
  }
  return raw;
}

/** Parsed from `oasis_workflow_mint_nft` MCP JSON result */
export type MintSuccessDetails = {
  userSummary: string;
  explorerTransactionUrl?: string;
  explorerAccountUrl?: string;
  transactionSignature?: string;
  mintAddress?: string;
  chain?: string;
  /** HTTPS or data URL for artwork preview */
  imagePreviewUrl?: string;
};

function parseOasisWorkflowMintResult(
  raw: unknown
):
  | { outcome: 'ok'; details: MintSuccessDetails }
  | { outcome: 'fail'; userSummary?: string }
  | { outcome: 'unparsed' } {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s.startsWith('{')) return { outcome: 'unparsed' };
    try {
      o = JSON.parse(s);
    } catch {
      return { outcome: 'unparsed' };
    }
  }
  if (!o || typeof o !== 'object') return { outcome: 'unparsed' };
  const rec = o as Record<string, unknown>;
  const success = rec.success === true;
  const userSummary = typeof rec.userSummary === 'string' ? rec.userSummary : undefined;
  const details: MintSuccessDetails = {
    userSummary: userSummary || 'Mint finished.',
    explorerTransactionUrl:
      typeof rec.explorerTransactionUrl === 'string' ? rec.explorerTransactionUrl : undefined,
    explorerAccountUrl:
      typeof rec.explorerAccountUrl === 'string' ? rec.explorerAccountUrl : undefined,
    transactionSignature:
      typeof rec.transactionSignature === 'string' ? rec.transactionSignature : undefined,
    mintAddress: typeof rec.mintAddress === 'string' ? rec.mintAddress : undefined,
    chain: typeof rec.chain === 'string' ? rec.chain : undefined,
  };
  if (success) {
    return { outcome: 'ok', details };
  }
  if (rec.success === false) {
    return { outcome: 'fail', userSummary: userSummary || 'Mint did not complete on-chain.' };
  }
  return { outcome: 'unparsed' };
}

type ChatLine = { role: 'assistant' | 'user'; content: string };

export interface ComposerInlineOnChainWorkflowProps {
  mode: OnChainWorkflowMode;
  onDismiss: () => void;
  /** Composer message list scroll container; kept in view as the workflow updates */
  scrollParentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * On-chain assistant + MCP cards embedded in the Composer thread (same column as the agent chat).
 */
export const ComposerInlineOnChainWorkflow: React.FC<ComposerInlineOnChainWorkflowProps> = ({
  mode,
  onDismiss,
  scrollParentRef,
}) => {
  const { settings } = useSettings();
  const { loggedIn, username: authUsername, avatarId } = useAuth();
  const { executeTool, tools: mcpTools } = useMCP();

  const chain = settings.onChainDefaultChain;
  const cluster = settings.onChainSolanaCluster;
  const chainLabel = mintWorkflowChainLabel(chain as OnChainMintWorkflowChainId);

  const [lines, setLines] = useState<ChatLine[]>([]);

  const [mintStep, setMintStep] = useState<
    'symbol' | 'title' | 'description' | 'image' | 'creds' | 'review' | 'success'
  >('symbol');
  const [symbol, setSymbol] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  /** Raw base64 (no data: prefix) when user picks a local image file */
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  /** Full data URL for preview only when user uploads a file */
  const [imageUploadPreviewUrl, setImageUploadPreviewUrl] = useState<string | null>(null);
  const [imageFileLabel, setImageFileLabel] = useState<string | null>(null);
  const [imageFileError, setImageFileError] = useState<string | null>(null);
  /** Visual feedback when a file is dragged over the mint image drop zone */
  const [mintImageDragOver, setMintImageDragOver] = useState(false);
  const mintImageDragDepthRef = useRef(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [numberToMintStr, setNumberToMintStr] = useState('1');
  const [sendToAddressAfterMinting, setSendToAddressAfterMinting] = useState('');
  const [metadataJson, setMetadataJson] = useState('');
  /** Validation for optional review fields (metadata JSON, quantity) */
  const [mintReviewError, setMintReviewError] = useState<string | null>(null);
  const [mintSuccessDetails, setMintSuccessDetails] = useState<MintSuccessDetails | null>(null);

  const [walletProvider, setWalletProvider] = useState(WALLET_PROVIDER_CHOICES[0].value);
  const [manualAvatarId, setManualAvatarId] = useState('');

  const [mcpPhase, setMcpPhase] = useState<McpInvocationPhase>('idle');
  const [mcpToolName, setMcpToolName] = useState('');
  const [mcpArgs, setMcpArgs] = useState<Record<string, unknown> | undefined>();
  const [mcpResult, setMcpResult] = useState<unknown>();
  const [mcpError, setMcpError] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines, mcpPhase, mode, mintStep, mintSuccessDetails, scrollParentRef]);

  useEffect(() => {
    if (authUsername) setUsername(authUsername);
  }, [authUsername]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  useEffect(() => {
    if (mode !== 'mint') return;
    setLines([
      {
        role: 'assistant',
        content:
          `I'll walk you through minting an NFT with **oasis_workflow_mint_nft** on **${chainLabel}**` +
          (chain === 'solana' ? ` using cluster **${cluster}**` : '') +
          '. Answer each step below. You can use an **HTTPS image URL** or **upload an image** for artwork. Your password is only sent to the MCP tool for this session and is not stored by the IDE.',
      },
    ]);
    setMintStep('symbol');
    setSymbol('');
    setTitle('');
    setDescription('');
    setImageUrl('');
    setImageBase64(null);
    setImageUploadPreviewUrl(null);
    setImageFileLabel(null);
    setImageFileError(null);
    setPassword('');
    setNumberToMintStr('1');
    setSendToAddressAfterMinting('');
    setMetadataJson('');
    setMintReviewError(null);
    setMintSuccessDetails(null);
    setMcpPhase('idle');
    setMcpResult(undefined);
    setMcpError(null);
  }, [mode, chain, cluster, chainLabel]);

  const resetMintFlow = useCallback(() => {
    setMintStep('symbol');
    setMintSuccessDetails(null);
    setSymbol('');
    setTitle('');
    setDescription('');
    setImageUrl('');
    setImageBase64(null);
    setImageUploadPreviewUrl(null);
    setImageFileLabel(null);
    setImageFileError(null);
    setPassword('');
    setNumberToMintStr('1');
    setSendToAddressAfterMinting('');
    setMetadataJson('');
    setMintReviewError(null);
    setMcpPhase('idle');
    setMcpToolName('');
    setMcpArgs(undefined);
    setMcpResult(undefined);
    setMcpError(null);
    setLines([
      {
        role: 'assistant',
        content:
          `I'll walk you through minting an NFT with **oasis_workflow_mint_nft** on **${chainLabel}**` +
          (chain === 'solana' ? ` using cluster **${cluster}**` : '') +
          '. Answer each step below. You can use an **HTTPS image URL** or **upload an image** for artwork. Your password is only sent to the MCP tool for this session and is not stored by the IDE.',
      },
    ]);
    if (authUsername) setUsername(authUsername);
    else setUsername('');
  }, [authUsername, chain, chainLabel, cluster]);

  useEffect(() => {
    if (mintStep !== 'image') {
      mintImageDragDepthRef.current = 0;
      setMintImageDragOver(false);
    }
  }, [mintStep]);

  useEffect(() => {
    if (mode !== 'wallet') return;
    setLines([
      {
        role: 'assistant',
        content:
          'Create a wallet linked to your OASIS avatar using **oasis_create_wallet_full**. Choose the provider, then run the tool.',
      },
    ]);
    setMcpPhase('idle');
    setMcpResult(undefined);
    setMcpError(null);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'health') return;
    setLines([
      {
        role: 'assistant',
        content:
          'Run **oasis_health_check** against your configured OASIS API to confirm ONODE is reachable.',
      },
    ]);
    setMcpPhase('idle');
    setMcpResult(undefined);
    setMcpError(null);
  }, [mode]);

  const pushUser = (content: string) => {
    setLines((prev) => [...prev, { role: 'user', content }]);
  };
  const pushAssistant = (content: string) => {
    setLines((prev) => [...prev, { role: 'assistant', content }]);
  };

  const clearMintImageUpload = () => {
    setImageBase64(null);
    setImageUploadPreviewUrl(null);
    setImageFileLabel(null);
    setImageFileError(null);
  };

  const applyMintImageFromFile = useCallback((file: File, displayName?: string) => {
    if (!file.type.startsWith('image/')) {
      setImageFileError('Use an image (PNG, JPEG, WebP, …).');
      return;
    }
    if (file.size > MAX_MINT_IMAGE_BYTES) {
      setImageFileError(`Image must be ${MAX_MINT_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`);
      return;
    }
    setImageFileError(null);
    setImageUrl('');
    const label = displayName?.trim() || file.name || 'image';
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageUploadPreviewUrl(dataUrl);
      const comma = dataUrl.indexOf(',');
      const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      setImageBase64(b64);
      setImageFileLabel(label);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleMintImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    applyMintImageFromFile(file);
  };

  const tryApplyImageFromClipboard = useCallback(
    (data: DataTransfer | null): boolean => {
      const items = data?.items;
      if (!items?.length) return false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            applyMintImageFromFile(f, f.name || 'pasted-image.png');
            return true;
          }
        }
      }
      return false;
    },
    [applyMintImageFromFile]
  );

  const handleMintImagePaste = (e: React.ClipboardEvent) => {
    if (tryApplyImageFromClipboard(e.clipboardData)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMintImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleMintImageDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    mintImageDragDepthRef.current += 1;
    setMintImageDragOver(true);
  };

  const handleMintImageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mintImageDragDepthRef.current -= 1;
    if (mintImageDragDepthRef.current <= 0) {
      mintImageDragDepthRef.current = 0;
      setMintImageDragOver(false);
    }
  };

  const handleMintImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mintImageDragDepthRef.current = 0;
    setMintImageDragOver(false);
    let file: File | null = e.dataTransfer.files?.[0] ?? null;
    if (!file && e.dataTransfer.items?.length) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && f.type.startsWith('image/')) {
            file = f;
            break;
          }
        }
      }
    }
    if (file) applyMintImageFromFile(file);
    else setImageFileError('Drop an image file.');
  };

  const runMcp = async (toolName: string, args: Record<string, unknown>) => {
    setMcpToolName(toolName);
    const argsForUi: Record<string, unknown> = { ...args };
    if (typeof argsForUi.imageBase64 === 'string' && argsForUi.imageBase64.length > 64) {
      argsForUi.imageBase64 = `[${argsForUi.imageBase64.length} chars base64 omitted]`;
    }
    setMcpArgs(argsForUi);
    if (mcpTools.length === 0) {
      setMcpError('MCP server is not connected. Set OASIS_MCP_SERVER_PATH and restart the IDE.');
      setMcpPhase('error');
      return;
    }
    setMcpPhase('running');
    setMcpError(null);
    setMcpResult(undefined);
    setMintSuccessDetails(null);
    try {
      const raw = await executeTool(toolName, args);
      const normalized = normalizeMcpToolResult(raw);
      setMcpResult(normalized);

      if (toolName === 'oasis_workflow_mint_nft') {
        const parsed = parseOasisWorkflowMintResult(normalized);
        const preview =
          imageUploadPreviewUrl ||
          (imageUrl.trim().startsWith('http') ? imageUrl.trim() : undefined);
        if (parsed.outcome === 'ok') {
          setMintSuccessDetails({ ...parsed.details, imagePreviewUrl: preview });
          setMintStep('success');
          setMcpPhase('success');
        } else if (parsed.outcome === 'fail') {
          setMcpPhase('error');
          setMcpError(parsed.userSummary || 'Mint did not complete on-chain.');
        } else {
          setMcpPhase('success');
        }
      } else {
        setMcpPhase('success');
      }
    } catch (e: unknown) {
      setMcpError(e instanceof Error ? e.message : String(e));
      setMcpPhase('error');
    }
  };

  const handleMintSubmitSymbol = () => {
    const s = symbol.trim();
    if (!s) return;
    pushUser(`Symbol: ${s}`);
    pushAssistant('Optional: what **title** should appear for this NFT? (You can skip.)');
    setMintStep('title');
  };

  const handleMintTitle = (skipped: boolean) => {
    if (skipped) {
      pushUser('(skip title)');
      pushAssistant('Optional: short **description**? (You can skip.)');
      setMintStep('description');
      return;
    }
    pushUser(`Title: ${title.trim() || '(empty)'}`);
    pushAssistant(
      'Optional: **HTTPS image URL** or **upload an image file** from your machine. You can skip.'
    );
    setMintStep('image');
  };

  const handleMintDescription = (skipped: boolean) => {
    if (skipped) {
      pushUser('(skip description)');
      pushAssistant(
        'Optional: **HTTPS image URL** or **upload an image file** from your machine. You can skip.'
      );
      setMintStep('image');
      return;
    }
    pushUser(`Description: ${description.trim() || '(empty)'}`);
    pushAssistant(
      'Optional: **HTTPS image URL** or **upload an image file** from your machine. You can skip.'
    );
    setMintStep('image');
  };

  const handleMintImage = (skipped: boolean) => {
    if (skipped) {
      pushUser('(skip image)');
    } else if (imageFileLabel && imageBase64) {
      pushUser(`Image: uploaded file "${imageFileLabel}"`);
    } else {
      pushUser(`Image URL: ${imageUrl.trim() || '(empty)'}`);
    }
    pushAssistant(
      'Enter your **OASIS avatar** username and **password** for this mint. The IDE does not save your password.'
    );
    setMintStep('creds');
  };

  const handleMintCreds = () => {
    const u = username.trim();
    const p = password;
    if (!u || !p) return;
    pushUser(`Username: ${u}`);
    pushAssistant(
      'Review the summary below. When you are ready, click **Run mint** to call the MCP workflow.'
    );
    setMintStep('review');
  };

  const handleMintRun = () => {
    setMintReviewError(null);
    let metaData: Record<string, unknown> | undefined;
    if (metadataJson.trim()) {
      try {
        const p = JSON.parse(metadataJson.trim()) as unknown;
        if (p === null || typeof p !== 'object' || Array.isArray(p)) {
          setMintReviewError('Metadata must be a JSON object, for example {"rarity":"legendary"}.');
          return;
        }
        metaData = p as Record<string, unknown>;
      } catch {
        setMintReviewError('Metadata is not valid JSON.');
        return;
      }
    }

    const n = Number.parseInt(numberToMintStr.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 1000) {
      setMintReviewError('Number to mint must be between 1 and 1000.');
      return;
    }

    const args: Record<string, unknown> = {
      chain,
      username: username.trim(),
      password,
      symbol: symbol.trim(),
      numberToMint: n,
    };
    if (title.trim()) args.title = title.trim();
    if (description.trim()) args.description = description.trim();
    if (imageBase64) {
      args.imageBase64 = imageBase64;
      if (imageFileLabel) args.imageFileName = imageFileLabel;
    } else if (imageUrl.trim()) {
      args.imageUrl = imageUrl.trim();
    }
    if (chain === 'solana') args.cluster = cluster;
    if (sendToAddressAfterMinting.trim()) {
      args.sendToAddressAfterMinting = sendToAddressAfterMinting.trim();
    }
    if (metaData) args.metaData = metaData;
    pushAssistant('Calling the mint workflow. MCP status appears below.');
    void runMcp('oasis_workflow_mint_nft', args);
  };

  const handleWalletRun = () => {
    const id = avatarId ?? manualAvatarId.trim();
    if (!id) {
      setMcpToolName('oasis_create_wallet_full');
      setMcpArgs({
        WalletProviderType: walletProvider,
        GenerateKeyPair: true,
      });
      setMcpError('Avatar ID is required. Log in or paste your avatar UUID.');
      setMcpPhase('error');
      return;
    }
    void runMcp('oasis_create_wallet_full', {
      avatarId: id,
      WalletProviderType: walletProvider,
      GenerateKeyPair: true,
    });
  };

  const handleHealthRun = () => {
    void runMcp('oasis_health_check', {});
  };

  const titleText =
    mode === 'mint' ? 'Mint NFT' : mode === 'wallet' ? 'Create wallet' : 'Health check';

  return (
    <div
      className="composer-inline-onchain"
      role="region"
      aria-label={`On-chain workflow: ${titleText}`}
    >
      <header className="composer-inline-onchain-header">
        <div>
          <h2 className="composer-inline-onchain-title">{titleText}</h2>
          <p className="composer-inline-onchain-sub">In Composer · MCP (same session as your agent chat)</p>
        </div>
        <button type="button" className="composer-inline-onchain-close" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      </header>

      <div className="composer-inline-onchain-body">
        <div className="composer-inline-onchain-thread">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`composer-inline-onchain-bubble composer-inline-onchain-bubble--${line.role}`}
            >
              {line.role === 'assistant' ? (
                <span className="composer-inline-onchain-bubble-label">Assistant</span>
              ) : (
                <span className="composer-inline-onchain-bubble-label">You</span>
              )}
              <div className="composer-inline-onchain-bubble-text">{line.content}</div>
            </div>
          ))}

          {mode === 'mint' && mintStep === 'review' && (
            <div className="composer-inline-onchain-summary">
              <div className="composer-inline-onchain-summary-title">Summary</div>
              <ul>
                <li>
                  <strong>Chain</strong>: {chainLabel}
                  {chain === 'solana' ? ` (${cluster})` : ''}
                </li>
                <li>
                  <strong>Symbol</strong>: {symbol.trim()}
                </li>
                {title.trim() ? (
                  <li>
                    <strong>Title</strong>: {title.trim()}
                  </li>
                ) : null}
                {description.trim() ? (
                  <li>
                    <strong>Description</strong>: {description.trim()}
                  </li>
                ) : null}
                {imageFileLabel && imageBase64 ? (
                  <li>
                    <strong>Image</strong>: upload ({imageFileLabel})
                  </li>
                ) : imageUrl.trim() ? (
                  <li>
                    <strong>Image</strong>: {imageUrl.trim()}
                  </li>
                ) : null}
                <li>
                  <strong>Quantity</strong>: {numberToMintStr.trim() || '1'}
                </li>
                {sendToAddressAfterMinting.trim() ? (
                  <li>
                    <strong>Send to after mint</strong>: {sendToAddressAfterMinting.trim()}
                  </li>
                ) : null}
                {metadataJson.trim() ? (
                  <li>
                    <strong>Extra metadata</strong>: JSON ({metadataJson.trim().slice(0, 80)}
                    {metadataJson.trim().length > 80 ? '…' : ''})
                  </li>
                ) : null}
                <li>
                  <strong>Username</strong>: {username.trim()}
                </li>
              </ul>
            </div>
          )}

          {mode === 'mint' && mintStep === 'success' && mintSuccessDetails ? (
            <div className="composer-inline-onchain-success" role="status" aria-live="polite">
              <div className="composer-inline-onchain-success-title">Mint complete</div>
              <p className="composer-inline-onchain-success-lead">
                Your NFT mint finished on-chain
                {mintSuccessDetails.chain ? ` (${mintSuccessDetails.chain})` : ''}. It should appear in the wallet
                that received it (your OASIS-linked wallet or the address you chose for send-after-mint).
              </p>
              {mintSuccessDetails.imagePreviewUrl ? (
                <div className="composer-inline-onchain-success-preview-wrap">
                  <img
                    src={mintSuccessDetails.imagePreviewUrl}
                    alt="NFT artwork"
                    className="composer-inline-onchain-success-preview"
                  />
                </div>
              ) : null}
              <ul className="composer-inline-onchain-success-links">
                {mintSuccessDetails.explorerTransactionUrl ? (
                  <li>
                    <a
                      href={mintSuccessDetails.explorerTransactionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="composer-inline-onchain-success-link"
                    >
                      View transaction on explorer
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                ) : null}
                {mintSuccessDetails.explorerAccountUrl ? (
                  <li>
                    <a
                      href={mintSuccessDetails.explorerAccountUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="composer-inline-onchain-success-link"
                    >
                      View token on explorer
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                ) : null}
                {mintSuccessDetails.transactionSignature ? (
                  <li className="composer-inline-onchain-success-meta">
                    <strong>Signature</strong>:{' '}
                    <code className="composer-inline-onchain-success-code">
                      {mintSuccessDetails.transactionSignature}
                    </code>
                  </li>
                ) : null}
                {mintSuccessDetails.mintAddress ? (
                  <li className="composer-inline-onchain-success-meta">
                    <strong>Token / mint</strong>:{' '}
                    <code className="composer-inline-onchain-success-code">
                      {mintSuccessDetails.mintAddress}
                    </code>
                  </li>
                ) : null}
              </ul>
              <p className="composer-inline-onchain-success-summary">{mintSuccessDetails.userSummary}</p>
            </div>
          ) : null}

          {mcpPhase !== 'idle' && mcpToolName ? (
            <McpToolCallCard
              toolName={mcpToolName}
              phase={mcpPhase}
              args={mcpArgs}
              result={mcpResult}
              errorMessage={mcpError ?? undefined}
            />
          ) : null}
        </div>
      </div>

      <footer className="composer-inline-onchain-footer">
        {mode === 'mint' && mintStep === 'symbol' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (symbol.trim()) handleMintSubmitSymbol();
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>Symbol / ticker</span>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. MYNFT"
                autoFocus
              />
            </label>
            <button
              type="submit"
              className="composer-inline-onchain-primary"
              disabled={!symbol.trim()}
            >
              Continue
            </button>
          </form>
        )}

        {mode === 'mint' && mintStep === 'title' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleMintTitle(false);
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>Title (optional)</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Display name"
              />
            </label>
            <div className="composer-inline-onchain-form-row">
              <button type="button" className="composer-inline-onchain-secondary" onClick={() => handleMintTitle(true)}>
                Skip
              </button>
              <button type="submit" className="composer-inline-onchain-primary">
                Continue
              </button>
            </div>
          </form>
        )}

        {mode === 'mint' && mintStep === 'description' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleMintDescription(false);
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleMintDescription(false);
                  }
                }}
              />
            </label>
            <div className="composer-inline-onchain-form-row">
              <button
                type="button"
                className="composer-inline-onchain-secondary"
                onClick={() => handleMintDescription(true)}
              >
                Skip
              </button>
              <button type="submit" className="composer-inline-onchain-primary">
                Continue
              </button>
            </div>
          </form>
        )}

        {mode === 'mint' && mintStep === 'image' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleMintImage(false);
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>Image URL (optional)</span>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setImageUrl(v);
                  if (v.trim()) clearMintImageUpload();
                }}
                onPaste={(e) => {
                  if (tryApplyImageFromClipboard(e.clipboardData)) e.preventDefault();
                }}
                placeholder="https://…"
              />
            </label>
            <p className="composer-inline-onchain-or" role="presentation">
              or
            </p>
            <div className="composer-inline-onchain-field">
              <span>Upload image (optional)</span>
              <div
                className={`composer-inline-onchain-dropzone${
                  mintImageDragOver ? ' composer-inline-onchain-dropzone--active' : ''
                }`}
                tabIndex={0}
                role="group"
                aria-label="Image: drop, paste, or choose file"
                onDragEnter={handleMintImageDragEnter}
                onDragOver={handleMintImageDragOver}
                onDragLeave={handleMintImageDragLeave}
                onDrop={handleMintImageDrop}
                onPaste={handleMintImagePaste}
              >
                <p className="composer-inline-onchain-dropzone-hint">
                  Drag and drop here, paste into this box (click first) or into the URL field above, or use Choose file.
                </p>
                <div className="composer-inline-onchain-file-row">
                  <label className="composer-inline-onchain-file-pick">
                    <input
                      type="file"
                      accept="image/*"
                      className="composer-inline-onchain-file-input"
                      onChange={handleMintImageFileChange}
                    />
                    <span className="composer-inline-onchain-file-btn">Choose file…</span>
                  </label>
                  {imageFileLabel ? (
                    <button
                      type="button"
                      className="composer-inline-onchain-secondary"
                      onClick={clearMintImageUpload}
                    >
                      Remove file
                    </button>
                  ) : null}
                </div>
                {imageFileError ? <p className="composer-inline-onchain-field-error">{imageFileError}</p> : null}
                {imageUploadPreviewUrl ? (
                  <img
                    src={imageUploadPreviewUrl}
                    alt=""
                    className="composer-inline-onchain-image-preview"
                  />
                ) : null}
              </div>
            </div>
            <p className="composer-inline-onchain-hint">
              Enter a URL or add a local image (not both). Paste a copied image from the URL field or after focusing the dashed area. Uploads are sent to MCP as base64; the server uploads to IPFS after you authenticate, then mints.
            </p>
            <div className="composer-inline-onchain-form-row">
              <button type="button" className="composer-inline-onchain-secondary" onClick={() => handleMintImage(true)}>
                Skip
              </button>
              <button type="submit" className="composer-inline-onchain-primary">
                Continue
              </button>
            </div>
          </form>
        )}

        {mode === 'mint' && mintStep === 'creds' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim() && password) handleMintCreds();
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>OASIS username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="composer-inline-onchain-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button
              type="submit"
              className="composer-inline-onchain-primary"
              disabled={!username.trim() || !password}
            >
              Continue
            </button>
          </form>
        )}

        {mode === 'mint' && mintStep === 'review' && mcpPhase === 'idle' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleMintRun();
            }}
          >
            <label className="composer-inline-onchain-field">
              <span>Number to mint</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={numberToMintStr}
                onChange={(e) => {
                  setNumberToMintStr(e.target.value);
                  setMintReviewError(null);
                }}
              />
            </label>
            <label className="composer-inline-onchain-field">
              <span>Send to address after minting (optional)</span>
              <input
                type="text"
                value={sendToAddressAfterMinting}
                onChange={(e) => setSendToAddressAfterMinting(e.target.value)}
                placeholder={chain === 'solana' ? 'Solana address (base58)' : '0x… or chain address'}
                autoComplete="off"
              />
            </label>
            <label className="composer-inline-onchain-field">
              <span>Additional metadata JSON (optional)</span>
              <textarea
                value={metadataJson}
                onChange={(e) => {
                  setMetadataJson(e.target.value);
                  setMintReviewError(null);
                }}
                placeholder='{"rarity":"legendary","source":"OASIS IDE"}'
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </label>
            {mintReviewError ? (
              <p className="composer-inline-onchain-field-error">{mintReviewError}</p>
            ) : null}
            <button type="submit" className="composer-inline-onchain-primary composer-inline-onchain-primary--full">
              Run mint (MCP)
            </button>
          </form>
        )}

        {mode === 'mint' && mintStep === 'success' && (
          <div className="composer-inline-onchain-form composer-inline-onchain-success-actions">
            <button type="button" className="composer-inline-onchain-primary" onClick={resetMintFlow}>
              Mint another NFT
            </button>
            <button type="button" className="composer-inline-onchain-secondary" onClick={onDismiss}>
              Close
            </button>
          </div>
        )}

        {mode === 'wallet' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleWalletRun();
            }}
          >
            {!loggedIn || !avatarId ? (
              <label className="composer-inline-onchain-field">
                <span>Avatar ID (UUID)</span>
                <input
                  type="text"
                  value={manualAvatarId}
                  onChange={(e) => setManualAvatarId(e.target.value)}
                  placeholder="Required if not logged in"
                />
              </label>
            ) : (
              <p className="composer-inline-onchain-hint">Using logged-in avatar: {avatarId.slice(0, 8)}…</p>
            )}
            <label className="composer-inline-onchain-field">
              <span>Provider</span>
              <select value={walletProvider} onChange={(e) => setWalletProvider(e.target.value)}>
                {WALLET_PROVIDER_CHOICES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="composer-inline-onchain-primary"
              disabled={mcpPhase === 'running' || !(avatarId ?? manualAvatarId.trim())}
            >
              Create wallet (MCP)
            </button>
          </form>
        )}

        {mode === 'health' && (
          <form
            className="composer-inline-onchain-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (mcpPhase !== 'running') handleHealthRun();
            }}
          >
            <button type="submit" className="composer-inline-onchain-primary" disabled={mcpPhase === 'running'}>
              Run health check (MCP)
            </button>
          </form>
        )}
      </footer>
    </div>
  );
};
