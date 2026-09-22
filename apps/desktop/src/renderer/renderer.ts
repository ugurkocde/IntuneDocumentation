interface AuthStatus {
  signedIn: boolean;
  account: string | null;
  expiresOn: string | null;
}

interface SignInResult {
  account: string;
  expiresOn: string | null;
}

interface DeviceCodePrompt {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresInSeconds: number;
}

interface CollectionResult {
  count: number;
  errors: Array<{ source: string; message: string; statusCode?: number }>;
  items: Array<{ id: string; displayName: string; odataType: string }>;
}

interface IntunedocApi {
  authStatus(): Promise<AuthStatus>;
  signInDeviceCode(): Promise<SignInResult>;
  signInInteractive(): Promise<SignInResult>;
  signOut(): Promise<AuthStatus>;
  collectDeviceConfigurations(): Promise<CollectionResult>;
  onDeviceCodePrompt(callback: (prompt: DeviceCodePrompt) => void): () => void;
}

declare global {
  interface Window {
    intunedoc: IntunedocApi;
  }
}

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const messageEl = document.getElementById("message") as HTMLParagraphElement;
const deviceCodeEl = document.getElementById("device-code") as HTMLPreElement;
const resultEl = document.getElementById("result") as HTMLPreElement;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function refreshStatus(): Promise<void> {
  try {
    const status = await window.intunedoc.authStatus();
    statusEl.textContent = status.signedIn
      ? `Signed in as ${status.account ?? "unknown"}`
      : "Not signed in";
  } catch (error) {
    statusEl.textContent = `Status unavailable: ${errorMessage(error)}`;
  }
}

window.intunedoc.onDeviceCodePrompt((prompt) => {
  deviceCodeEl.hidden = false;
  deviceCodeEl.textContent = `${prompt.message}\nCode: ${prompt.userCode}\nURL: ${prompt.verificationUri}`;
});

document.getElementById("sign-in-device")?.addEventListener("click", () => {
  messageEl.textContent = "Requesting a device code...";
  window.intunedoc
    .signInDeviceCode()
    .then((result) => {
      messageEl.textContent = `Signed in as ${result.account}`;
      return refreshStatus();
    })
    .catch((error) => {
      messageEl.textContent = `Sign-in failed: ${errorMessage(error)}`;
    });
});

document.getElementById("sign-in-interactive")?.addEventListener("click", () => {
  messageEl.textContent = "Opening your browser...";
  window.intunedoc
    .signInInteractive()
    .then((result) => {
      messageEl.textContent = `Signed in as ${result.account}`;
      return refreshStatus();
    })
    .catch((error) => {
      messageEl.textContent = `Sign-in failed: ${errorMessage(error)}`;
    });
});

document.getElementById("sign-out")?.addEventListener("click", () => {
  window.intunedoc
    .signOut()
    .then(() => {
      messageEl.textContent = "Signed out";
      resultEl.hidden = true;
      return refreshStatus();
    })
    .catch((error) => {
      messageEl.textContent = `Sign-out failed: ${errorMessage(error)}`;
    });
});

document.getElementById("collect")?.addEventListener("click", () => {
  messageEl.textContent = "Collecting device configurations...";
  window.intunedoc
    .collectDeviceConfigurations()
    .then((result) => {
      messageEl.textContent = `Collected ${result.count} device configurations.${result.errors.length ? ` ${result.errors.length} collection warning(s).` : ""}`;
      resultEl.hidden = false;
      resultEl.textContent = JSON.stringify(result.items.slice(0, 50), null, 2);
    })
    .catch((error) => {
      messageEl.textContent = `Collection failed: ${errorMessage(error)}`;
    });
});

void refreshStatus();

export {};
