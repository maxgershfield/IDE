import {
  authenticateOasis,
  buildMintNftBody,
  generateSolanaWallet,
  getSolanaWallet,
  mintNft
} from "./oasisApi.js";

const KEY_TOKEN = "oasis_starter_jwt";
const KEY_AVATAR = "oasis_starter_avatar_id";

const loginForm = document.querySelector<HTMLFormElement>("#login-form");
const loginError = document.querySelector<HTMLParagraphElement>("#login-error");
const sessionSection = document.querySelector<HTMLElement>("#session-section");
const loginSection = document.querySelector<HTMLElement>("#login-section");
const walletSection = document.querySelector<HTMLElement>("#wallet-section");
const mintSection = document.querySelector<HTMLElement>("#mint-section");
const avatarIdEl = document.querySelector<HTMLElement>("#avatar-id");
const logoutBtn = document.querySelector<HTMLButtonElement>("#logout-btn");
const walletStatus = document.querySelector<HTMLParagraphElement>("#wallet-status");
const walletAddressEl = document.querySelector<HTMLElement>("#wallet-address");
const ensureWalletBtn =
  document.querySelector<HTMLButtonElement>("#ensure-wallet-btn");
const walletError = document.querySelector<HTMLParagraphElement>("#wallet-error");
const mintForm = document.querySelector<HTMLFormElement>("#mint-form");
const jsonUrlInput = document.querySelector<HTMLInputElement>("#json-url");
const mintOutput = document.querySelector<HTMLPreElement>("#mint-output");
const mintError = document.querySelector<HTMLParagraphElement>("#mint-error");

function showError(el: HTMLParagraphElement | null, text: string | null) {
  if (!el) {
    return;
  }
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

function getToken(): string | null {
  return sessionStorage.getItem(KEY_TOKEN);
}

function getAvatarId(): string | null {
  return sessionStorage.getItem(KEY_AVATAR);
}

function setSession(token: string, avatarId: string) {
  sessionStorage.setItem(KEY_TOKEN, token);
  sessionStorage.setItem(KEY_AVATAR, avatarId);
}

function clearSession() {
  sessionStorage.removeItem(KEY_TOKEN);
  sessionStorage.removeItem(KEY_AVATAR);
}

function defaultMetadataUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol}//${host}/seed-metadata.json`;
}

async function refreshWalletUi() {
  const token = getToken();
  const aid = getAvatarId();
  if (!token || !aid || !walletStatus || !walletAddressEl) {
    return;
  }
  showError(walletError, null);
  walletStatus.textContent = "Loading…";
  try {
    let w = await getSolanaWallet(token, aid);
    if (!w) {
      walletStatus.textContent =
        "No Solana wallet on file. Create one to enable mints.";
    } else {
      walletStatus.textContent = "Solana wallet on file.";
    }
    walletAddressEl.textContent = w?.walletAddress ?? "—";
  } catch (e) {
    showError(
      walletError,
      e instanceof Error ? e.message : "Wallet load failed"
    );
    walletStatus.textContent = "Error";
  }
}

if (jsonUrlInput && !jsonUrlInput.value) {
  jsonUrlInput.value = defaultMetadataUrl();
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(loginError, null);
  const fd = new FormData(loginForm);
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) {
    showError(loginError, "Username and password are required");
    return;
  }
  try {
    const { token, avatarId } = await authenticateOasis({ username, password });
    setSession(token, avatarId);
    if (loginSection) {
      loginSection.hidden = true;
    }
    if (sessionSection) {
      sessionSection.hidden = false;
    }
    if (avatarIdEl) {
      avatarIdEl.textContent = avatarId;
    }
    if (walletSection) {
      walletSection.hidden = false;
    }
    if (mintSection) {
      mintSection.hidden = false;
    }
    await refreshWalletUi();
  } catch (err) {
    showError(
      loginError,
      err instanceof Error ? err.message : "Login failed"
    );
  }
});

logoutBtn?.addEventListener("click", () => {
  clearSession();
  if (loginSection) {
    loginSection.hidden = false;
  }
  if (sessionSection) {
    sessionSection.hidden = true;
  }
  if (walletSection) {
    walletSection.hidden = true;
  }
  if (mintSection) {
    mintSection.hidden = true;
  }
  if (jsonUrlInput) {
    jsonUrlInput.value = defaultMetadataUrl();
  }
});

ensureWalletBtn?.addEventListener("click", async () => {
  const token = getToken();
  const aid = getAvatarId();
  if (!token || !aid) {
    return;
  }
  showError(walletError, null);
  if (walletStatus) {
    walletStatus.textContent = "Creating…";
  }
  try {
    const w = await generateSolanaWallet(token, aid);
    if (walletAddressEl) {
      walletAddressEl.textContent = w.walletAddress;
    }
    if (walletStatus) {
      walletStatus.textContent = "Solana wallet on file.";
    }
  } catch (e) {
    showError(
      walletError,
      e instanceof Error ? e.message : "Wallet create failed"
    );
    if (walletStatus) {
      walletStatus.textContent = "Error";
    }
  }
});

mintForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(mintError, null);
  if (mintOutput) {
    mintOutput.hidden = true;
  }
  const token = getToken();
  const aid = getAvatarId();
  if (!token || !aid) {
    showError(mintError, "Not signed in");
    return;
  }
  const fd = new FormData(mintForm);
  const title = String(fd.get("title") ?? "").trim();
  const symbol = String(fd.get("symbol") ?? "").trim();
  const jsonUrl = String(fd.get("jsonUrl") ?? "").trim();
  if (!jsonUrl) {
    showError(mintError, "Metadata URL is required");
    return;
  }
  try {
    const body = buildMintNftBody({
      title,
      symbol,
      jsonMetaDataURL: jsonUrl,
      sendToAvatarAfterMintingId: aid
    });
    const result = await mintNft(token, body);
    if (mintOutput) {
      mintOutput.textContent = JSON.stringify(result, null, 2);
      mintOutput.hidden = false;
    }
  } catch (err) {
    showError(
      mintError,
      err instanceof Error ? err.message : "Mint failed"
    );
  }
});

const token = getToken();
const aid = getAvatarId();
if (token && aid) {
  if (loginSection) {
    loginSection.hidden = true;
  }
  if (sessionSection) {
    sessionSection.hidden = false;
  }
  if (avatarIdEl) {
    avatarIdEl.textContent = aid;
  }
  if (walletSection) {
    walletSection.hidden = false;
  }
  if (mintSection) {
    mintSection.hidden = false;
  }
  void refreshWalletUi();
}
