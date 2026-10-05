#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

const AUTH_ORIGIN = "https://auth.openai.com";
const AUTHORIZE_URL = AUTH_ORIGIN + "/api/accounts/authorize";
const TOKEN_URL = AUTH_ORIGIN + "/api/accounts/oauth/token";
const JWKS_URL = AUTH_ORIGIN + "/.well-known/jwks.json";
const RESOURCE = "https://api.openai.com/v1";
const API_ORIGIN = "https://api.openai.com/v1";
const REQUESTED_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "resource.invoke",
  "chatgpt.tokens.use.direct",
].join(" ");
const CONFIG_DIR = path.join(os.homedir(), ".remotearc");
const AI_DIR = path.join(CONFIG_DIR, "ai");
const HOST_PATH = path.join(AI_DIR, "chatgpt-plan-host.json");
const KEYCHAIN_SERVICE = "app.remotearc.chatgpt-plan";
const KEYCHAIN_ACCOUNT = "default";
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

type ChatGptCredentials = {
  clientId: string;
  subject: string;
  email?: string;
  name?: string;
  scope: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessExpiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function randomValue(size = 32) {
  return base64url(randomBytes(size));
}

async function ensureHostId() {
  await fs.mkdir(AI_DIR, { recursive: true, mode: 0o700 });
  try {
    const parsed = JSON.parse(await fs.readFile(HOST_PATH, "utf8")) as { hostId?: string };
    if (parsed.hostId?.startsWith("urn:")) return parsed.hostId;
  } catch {}

  const hostId = "urn:uuid:" + randomUUID();
  await fs.writeFile(HOST_PATH, JSON.stringify({ hostId }, null, 2) + "\n", { mode: 0o600 });
  return hostId;
}

function requireMacKeychain() {
  if (process.platform !== "darwin") {
    throw new Error(
      "This first ChatGPT-plan spike stores OAuth credentials in macOS Keychain. " +
      "Windows/Linux credential backends belong in the provider abstraction before release.",
    );
  }
}

function keychain(args: string[], allowMissing = false) {
  requireMacKeychain();
  const result = spawnSync("security", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && !allowMissing) {
    throw new Error((result.stderr || result.stdout || "macOS Keychain command failed").trim());
  }
  return result;
}

function loadCredentials(): ChatGptCredentials | null {
  const result = keychain(
    ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
    true,
  );
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout.trim()) as ChatGptCredentials;
  } catch {
    throw new Error("Saved ChatGPT-plan credentials are unreadable.");
  }
}

function saveCredentials(credentials: ChatGptCredentials) {
  keychain([
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
    JSON.stringify(credentials),
  ]);
}

function deleteCredentials() {
  keychain(
    ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT],
    true,
  );
}

function openSystemBrowser(url: string) {
  // Never print the authorization URL: returning sign-ins may contain id_token_hint.
  const child = spawn("open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function listenForCallback(expectedState: string) {
  let resolveCallback!: (value: URL) => void;
  let rejectCallback!: (error: Error) => void;
  const callback = new Promise<URL>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404).end("Not found");
        return;
      }
      if (url.searchParams.get("state") !== expectedState) {
        res.writeHead(400).end("Invalid OAuth state");
        rejectCallback(new Error("OAuth state mismatch."));
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        const description = url.searchParams.get("error_description") || error;
        res.writeHead(400).end("Authorization was not completed. You can close this tab.");
        rejectCallback(new Error(description));
        return;
      }
      if (!url.searchParams.get("code")) {
        res.writeHead(400).end("Missing authorization code");
        rejectCallback(new Error("OAuth callback did not include an authorization code."));
        return;
      }
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end("<!doctype html><title>Remote Arc connected</title><h2>Remote Arc connected to ChatGPT.</h2><p>You can close this tab and return to the terminal.</p>");
      resolveCallback(url);
    } catch (error) {
      rejectCallback(error instanceof Error ? error : new Error(String(error)));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not create the OAuth loopback listener.");
  }

  const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
  const wait = Promise.race([
    callback,
    new Promise<URL>((_, reject) =>
      setTimeout(() => reject(new Error("ChatGPT authorization timed out.")), 5 * 60_000),
    ),
  ]).finally(() => server.close());

  return { redirectUri, wait };
}

async function exchangeToken(params: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    throw new Error(
      payload.error_description || payload.error || `Token exchange failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

async function signIn() {
  requireMacKeychain();
  const hostId = await ensureHostId();
  const previous = loadCredentials();
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { redirectUri, wait } = await listenForCallback(state);

  const params = new URLSearchParams({
    client_id: previous?.clientId || "dynamic_agent_client",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUESTED_SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: challenge,
    ext_agent_host_id: hostId,
  });
  if (previous?.clientId) {
    params.set("id_token_hint", previous.idToken);
    if (previous.email) params.set("login_hint", previous.email);
  } else {
    params.set("agent_name_hint", "Remote Arc");
  }

  console.log("Opening Continue with ChatGPT in the system browser…");
  openSystemBrowser(AUTHORIZE_URL + "?" + params.toString());
  const callback = await wait;

  const callbackClientId = callback.searchParams.get("client_id");
  const clientId = previous?.clientId || callbackClientId;
  if (!clientId || clientId === "dynamic_agent_client") {
    throw new Error("OpenAI did not return the issued client_id for this registration.");
  }
  if (previous?.clientId && callbackClientId && callbackClientId !== previous.clientId) {
    throw new Error("The callback returned a different ChatGPT client registration.");
  }

  const token = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource: RESOURCE,
    }),
  );

  if (!token.id_token || !token.access_token || !token.refresh_token) {
    throw new Error("OpenAI token response did not include the required OAuth credentials.");
  }

  const verified = await jwtVerify(token.id_token, jwks, {
    issuer: AUTH_ORIGIN,
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (verified.payload.nonce !== nonce) {
    throw new Error("The OpenAI ID-token nonce did not match this authorization attempt.");
  }
  if (typeof verified.payload.sub !== "string" || !verified.payload.sub) {
    throw new Error("The OpenAI ID token did not include a subject.");
  }
  if (previous && verified.payload.sub !== previous.subject) {
    throw new Error("The returning ChatGPT account did not match the saved Remote Arc account.");
  }

  const scope = token.scope || "";
  if (!scope.split(/\s+/).includes("chatgpt.tokens.use.direct")) {
    throw new Error("ChatGPT plan usage was not granted. Reconnect and enable plan usage.");
  }

  let accessExpiresAt = Date.now() + Math.max(60, token.expires_in || 3600) * 1000;
  try {
    const exp = decodeJwt(token.access_token).exp;
    if (exp) accessExpiresAt = exp * 1000;
  } catch {}

  const credentials: ChatGptCredentials = {
    clientId,
    subject: verified.payload.sub,
    email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
    name: typeof verified.payload.name === "string" ? verified.payload.name : undefined,
    scope,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token,
    accessExpiresAt,
  };
  saveCredentials(credentials);

  console.log(
    `Connected ChatGPT plan${credentials.email ? " · " + credentials.email : ""} · client ${clientId.slice(0, 12)}…`,
  );
  return credentials;
}

async function refresh(credentials: ChatGptCredentials) {
  if (credentials.accessExpiresAt - Date.now() > 2 * 60_000) return credentials;
  const token = await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      refresh_token: credentials.refreshToken,
      resource: RESOURCE,
    }),
  );
  if (!token.access_token) throw new Error("Token refresh did not return an access token.");

  let accessExpiresAt = Date.now() + Math.max(60, token.expires_in || 3600) * 1000;
  try {
    const exp = decodeJwt(token.access_token).exp;
    if (exp) accessExpiresAt = exp * 1000;
  } catch {}

  const next: ChatGptCredentials = {
    ...credentials,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || credentials.refreshToken,
    idToken: token.id_token || credentials.idToken,
    scope: token.scope || credentials.scope,
    accessExpiresAt,
  };
  if (!next.scope.split(/\s+/).includes("chatgpt.tokens.use.direct")) {
    throw new Error("The refreshed session no longer grants ChatGPT plan usage.");
  }
  saveCredentials(next);
  return next;
}

async function requireCredentials() {
  const credentials = loadCredentials();
  if (!credentials) {
    throw new Error("ChatGPT plan is not connected. Run: pnpm --filter remotelink ai:connect");
  }
  return refresh(credentials);
}

async function listModels(credentials: ChatGptCredentials) {
  const response = await fetch(API_ORIGIN + "/models", {
    headers: { Authorization: "Bearer " + credentials.accessToken },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    models?: Array<{ slug?: string; display_name?: string; visibility?: string }>;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(payload.detail || `Model discovery failed with HTTP ${response.status}`);
  }
  return (payload.models || []).filter((model) => model.visibility === "list" && model.slug);
}

async function streamResponse(
  credentials: ChatGptCredentials,
  model: string,
  input: string,
) {
  const response = await fetch(API_ORIGIN + "/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + credentials.accessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: input }],
      store: false,
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`Responses request failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const handleFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as {
      type?: string;
      delta?: string;
      response?: { error?: { code?: string; message?: string } };
    };
    if (event.type === "response.output_text.delta" && event.delta) {
      process.stdout.write(event.delta);
    } else if (event.type === "response.failed") {
      throw new Error(
        event.response?.error?.message ||
          event.response?.error?.code ||
          "ChatGPT-plan inference failed.",
      );
    } else if (event.type === "response.completed") {
      completed = true;
    }
  };

  while (true) {
    const next = await reader.read();
    buffer += decoder.decode(next.value || new Uint8Array(), { stream: !next.done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) handleFrame(frame);
    if (next.done) break;
  }
  if (buffer.trim()) handleFrame(buffer);
  if (!completed) throw new Error("Responses stream ended without response.completed.");
  process.stdout.write("\n");
}

async function status() {
  requireMacKeychain();
  const credentials = loadCredentials();
  if (!credentials) {
    console.log("ChatGPT plan: not connected");
    return;
  }
  const expiresIn = Math.max(0, Math.round((credentials.accessExpiresAt - Date.now()) / 1000));
  console.log(
    `ChatGPT plan: connected${credentials.email ? " · " + credentials.email : ""} · access token expires in ${expiresIn}s`,
  );
}

async function testInference() {
  const credentials = await requireCredentials();
  const models = await listModels(credentials);
  const preferred = models.find((model) => model.slug === "gpt-6.1-sol") || models[0];
  if (!preferred?.slug) throw new Error("No ChatGPT-plan models are available for this account.");
  console.log(`Model: ${preferred.display_name || preferred.slug} (${preferred.slug})`);
  await streamResponse(
    credentials,
    preferred.slug,
    "Reply with exactly one short sentence confirming that Remote Arc can invoke this model through my ChatGPT plan. Do not mention APIs or keys.",
  );
}

async function main() {
  const command = process.argv[2] || "help";
  if (command === "connect") {
    await signIn();
    return;
  }
  if (command === "status") {
    await status();
    return;
  }
  if (command === "models") {
    const credentials = await requireCredentials();
    const models = await listModels(credentials);
    for (const model of models) console.log(`${model.slug}\t${model.display_name || ""}`);
    return;
  }
  if (command === "test") {
    await testInference();
    return;
  }
  if (command === "disconnect") {
    deleteCredentials();
    console.log("Removed local ChatGPT-plan credentials from macOS Keychain.");
    return;
  }

  console.log([
    "Remote Arc · ChatGPT-plan controller spike",
    "",
    "Commands:",
    "  connect     Continue with ChatGPT and grant local plan usage",
    "  status      Show local connection status (never prints tokens)",
    "  models      List models available to the connected ChatGPT account",
    "  test        Run one Responses inference through the ChatGPT plan",
    "  disconnect  Remove the local credential set from macOS Keychain",
    "",
    "This spike is intentionally local-only. Tokens never go to Remote Arc Cloud.",
  ].join("\n"));
}

main().catch((error) => {
  console.error("chatgpt-plan:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
