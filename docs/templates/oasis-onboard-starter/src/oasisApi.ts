import {
  extractOasisData,
  extractOasisErrorMessage,
  extractOasisResult,
  isOasisError
} from "./oasisTransport.js";

const API = "/api";

type SolanaProvider = "SolanaOASIS";

const SOLANA_KEY = "3";

function headersJson(token: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

async function readJson(
  res: Response
): Promise<{ ok: boolean; body: unknown }> {
  const text = await res.text();
  try {
    return { ok: res.ok, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: res.ok, body: { raw: text } };
  }
}

function assertOk(
  data: unknown,
  fallback: string
): void {
  if (isOasisError(data)) {
    throw new Error(extractOasisErrorMessage(data, fallback));
  }
}

export interface AuthResult {
  token: string;
  avatarId: string;
}

/**
 * Parse JWT + avatar id from /api/avatar/authenticate (shape may nest result).
 */
function parseAuth(response: unknown): AuthResult {
  const responseData = extractOasisData(response) as Record<string, unknown>;
  const r1 = toRecord(responseData.result ?? responseData.Result ?? responseData);
  const r2 = toRecord(r1.result ?? r1.Result ?? r1);

  const token = firstNonEmpty(
    r2.jwtToken,
    r2.JwtToken,
    r1.jwtToken,
    r1.JwtToken,
    responseData.jwtToken,
    responseData.JwtToken
  );
  const avatarId = firstNonEmpty(
    r2.avatarId,
    r2.id,
    r1.avatarId,
    r1.id,
    r2.AvatarId,
    r1.AvatarId
  );

  if (!token) {
    throw new Error("No JWT in authenticate response");
  }
  if (!avatarId) {
    throw new Error("No avatar id in authenticate response");
  }
  return { token, avatarId };
}

function toRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return "";
}

export async function authenticateOasis(data: {
  username: string;
  password: string;
}): Promise<AuthResult> {
  const res = await fetch(`${API}/avatar/authenticate`, {
    method: "POST",
    headers: headersJson(null),
    body: JSON.stringify({
      username: data.username,
      password: data.password
    })
  });
  const { ok, body } = await readJson(res);
  if (!ok) {
    throw new Error(
      extractOasisErrorMessage(
        body,
        `HTTP ${res.status}: authenticate failed`
      )
    );
  }
  assertOk(body, "Authenticate failed");
  return parseAuth(body);
}

export async function getSolanaWallet(
  token: string,
  avatarId: string
): Promise<{ walletAddress: string; walletId: string } | null> {
  const res = await fetch(
    `${API}/wallet/avatar/${encodeURIComponent(avatarId)}/wallets/false/false`,
    { headers: headersJson(token) }
  );
  const { ok, body } = await readJson(res);
  if (!ok) {
    return null;
  }
  if (isOasisError(body)) {
    return null;
  }
  const result = extractOasisResult<Record<string, unknown>>(body);
  if (!result || typeof result !== "object") {
    return null;
  }
  return pickSolanaWallet(result);
}

function pickSolanaWallet(
  result: Record<string, unknown>
): { walletAddress: string; walletId: string } | null {
  const list =
    (result.SolanaOASIS as unknown) ??
    (result[3] as unknown) ??
    (result["3"] as unknown) ??
    (result[SOLANA_KEY] as unknown);
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const first = list[0] as Record<string, unknown>;
  const walletAddress = firstNonEmpty(
    first.walletAddress,
    first.WalletAddress
  );
  const walletId = firstNonEmpty(first.walletId, first.WalletId);
  if (!walletAddress) {
    return null;
  }
  return { walletAddress, walletId: walletId || "" };
}

export async function generateSolanaWallet(
  token: string,
  avatarId: string
): Promise<{ walletAddress: string; walletId: string }> {
  const res = await fetch(
    `${API}/keys/generate_keypair_with_wallet_address_and_link_provider_keys_to_avatar_by_id`,
    {
      method: "POST",
      headers: headersJson(token),
      body: JSON.stringify({
        AvatarID: avatarId,
        ProviderType: "SolanaOASIS" as SolanaProvider
      })
    }
  );
  const { ok, body } = await readJson(res);
  if (!ok) {
    throw new Error(
      extractOasisErrorMessage(
        body,
        `HTTP ${res.status}: wallet generation failed`
      )
    );
  }
  assertOk(body, "Wallet generation failed");
  const r = extractOasisResult<Record<string, unknown>>(body);
  const walletAddress = firstNonEmpty(
    r.walletAddress,
    r.WalletAddress
  );
  const walletId = firstNonEmpty(r.walletId, r.WalletId);
  if (!walletAddress) {
    throw new Error("OASIS did not return a wallet address");
  }
  return { walletAddress, walletId: walletId || "" };
}

/** Request body for /api/nft/mint-nft (PascalCase fields per ONODE). */
export function buildMintNftBody(input: {
  title: string;
  symbol: string;
  jsonMetaDataURL: string;
  sendToAvatarAfterMintingId: string;
}): Record<string, unknown> {
  return {
    Title: input.title,
    Symbol: input.symbol,
    JSONMetaDataURL: input.jsonMetaDataURL,
    OnChainProvider: "SolanaOASIS",
    OffChainProvider: "None",
    NFTOffChainMetaType: "ExternalJSONURL",
    NFTStandardType: "SPL",
    NumberToMint: 1,
    SendToAvatarAfterMintingId: input.sendToAvatarAfterMintingId
  };
}

export async function mintNft(
  token: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const MINT_TIMEOUT_MS = 180_000;
  const res = await fetch(`${API}/nft/mint-nft`, {
    method: "POST",
    headers: headersJson(token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS)
  });
  const { ok, body: json } = await readJson(res);
  if (!ok) {
    throw new Error(
      extractOasisErrorMessage(
        json,
        `HTTP ${res.status}: mint failed`
      )
    );
  }
  assertOk(json, "Mint failed");
  return extractOasisResult(json);
}
