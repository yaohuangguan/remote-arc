const API_ORIGIN = "https://mcp.remotearc.app";
const READ_TOOLS = [
  "browser_list_tabs",
  "browser_get_current_tab",
  "browser_read_page",
  "browser_get_selected_text",
  "browser_extract_links",
  "browser_extract_table",
];
const INTERACT_TOOLS = [
  "browser_click",
  "browser_fill",
];
const TOOLS = [...READ_TOOLS, ...INTERACT_TOOLS];

let socket = null;
let heartbeat = null;
let pairingTimer = null;
const grants = new Map();

const storageGet = (keys) => chrome.storage.local.get(keys);
const storageSet = (values) => chrome.storage.local.set(values);

async function credentials() {
  return storageGet(["deviceId", "deviceToken", "relayUrl", "deviceName"]);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function currentState() {
  const creds = await credentials();
  const tab = await activeTab();
  return {
    connected: Boolean(creds.deviceId && creds.deviceToken),
    deviceName: creds.deviceName,
    socketConnected: socket?.readyState === WebSocket.OPEN,
    activeTab: tab?.id ? { id: tab.id, url: tab.url, title: tab.title } : null,
    activeGrant: tab?.id ? grants.get(tab.id) || null : null,
    grants: Array.from(grants.values()),
  };
}

async function connectSocket() {
  const creds = await credentials();
  if (!creds.deviceId || !creds.deviceToken || !creds.relayUrl) return;
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

  const url = new URL("/agent", creds.relayUrl);
  socket = new WebSocket(url.toString(), ["remotearc", "token." + creds.deviceToken]);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      device: {
        id: creds.deviceId,
        name: creds.deviceName || "Remote Arc Browser",
        platform: "browser",
        arch: "chrome",
        hostname: "chrome-extension",
        agentVersion: "browser-0.3.0",
      },
      tools: TOOLS,
      capabilities: ["browser_tab_grant_v2", "browser_multi_tab_v1", "browser_interact_v1"],
    }));

    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping", at: Date.now() }));
      }
    }, 20000);
  });

  socket.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.type !== "call" || !message.id) return;

    try {
      const result = await executeTool(message.tool, message.arguments || {});
      socket.send(JSON.stringify({ type: "result", id: message.id, result }));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "result",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(heartbeat);
    heartbeat = null;
    socket = null;
    setTimeout(() => connectSocket().catch(() => undefined), 3000);
  });
}

async function resolveSharedTab(tabId) {
  let grant = null;

  if (tabId !== undefined && tabId !== null) {
    grant = grants.get(Number(tabId)) || null;
  } else if (grants.size === 1) {
    grant = grants.values().next().value || null;
  } else if (grants.size > 1) {
    throw new Error("Multiple tabs are shared. Call browser_list_tabs and pass tab_id.");
  }

  if (!grant) {
    throw new Error("No matching shared tab. Share the tab in Remote Arc Browser first.");
  }

  const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
  if (!tab?.url) {
    await revokeGrant(grant.tabId);
    throw new Error("The shared tab is no longer available.");
  }

  const origin = new URL(tab.url).origin;
  if (origin !== grant.origin || tab.url !== grant.url) {
    await revokeGrant(grant.tabId);
    throw new Error("Tab access was revoked because the page navigated.");
  }

  return { tab, grant };
}

async function listSharedTabs() {
  const items = [];
  for (const grant of grants.values()) {
    const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
    if (!tab?.url) {
      await revokeGrant(grant.tabId);
      continue;
    }
    items.push({
      tabId: grant.tabId,
      title: tab.title || grant.title || "",
      url: tab.url,
      origin: grant.origin,
      permissions: grant.permissions || ["read"],
    });
  }
  return { tabs: items };
}

async function executeTool(tool, args) {
  if (tool === "browser_list_tabs") return listSharedTabs();

  const { tab, grant } = await resolveSharedTab(args.tab_id);

  if (tool === "browser_get_current_tab") {
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      permissions: grant.permissions || ["read"],
    };
  }

  if (!TOOLS.includes(tool)) throw new Error("Unsupported browser tool: " + tool);
  if (INTERACT_TOOLS.includes(tool) && !grant.permissions?.includes("interact")) {
    throw new Error("Click/fill is not enabled for this tab. Enable Browser Interact in the Remote Arc Browser popup.");
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    source: "remote-arc-browser",
    tool,
    arguments: args,
  });

  if (response?.error) throw new Error(response.error);
  return response;
}

async function grantCurrentTab() {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) throw new Error("No active browser tab.");

  const url = new URL(tab.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Remote Arc only supports normal web pages.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"],
  });

  const grant = {
    tabId: tab.id,
    title: tab.title || "",
    url: tab.url,
    origin: url.origin,
    grantedAt: new Date().toISOString(),
    permissions: ["read"],
  };

  grants.set(tab.id, grant);
  await chrome.action.setBadgeText({ tabId: tab.id, text: "AI" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#76b900" });
  return grant;
}

async function setTabInteract(tabId, enabled) {
  const id = Number(tabId);
  const grant = grants.get(id);
  if (!grant) throw new Error("Share this tab before enabling Browser Interact.");

  const permissions = new Set(grant.permissions || ["read"]);
  if (enabled) permissions.add("interact");
  else permissions.delete("interact");
  permissions.add("read");

  const updated = { ...grant, permissions: Array.from(permissions) };
  grants.set(id, updated);
  await chrome.action.setBadgeText({ tabId: id, text: enabled ? "AI+" : "AI" }).catch(() => undefined);
  return updated;
}

async function revokeGrant(tabId) {
  const id = Number(tabId);
  if (!grants.has(id)) return;
  await chrome.action.setBadgeText({ tabId: id, text: "" }).catch(() => undefined);
  grants.delete(id);
}

async function revokeAllGrants() {
  for (const tabId of Array.from(grants.keys())) {
    await revokeGrant(tabId);
  }
}

async function startPairing() {
  const deviceName = "Chrome Browser";
  const response = await fetch(API_ORIGIN + "/api/device/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_name: deviceName,
      platform: "browser",
      arch: "chrome",
      hostname: "chrome-extension",
    }),
  });

  if (!response.ok) throw new Error("Could not start Remote Arc pairing.");

  const pair = await response.json();
  await chrome.tabs.create({ url: pair.verification_uri_complete });

  clearInterval(pairingTimer);
  pairingTimer = setInterval(async () => {
    const tokenResponse = await fetch(API_ORIGIN + "/api/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_code: pair.device_code,
        device_secret: pair.device_secret,
      }),
    }).catch(() => null);

    if (!tokenResponse || tokenResponse.status === 428) return;

    if (!tokenResponse.ok) {
      clearInterval(pairingTimer);
      pairingTimer = null;
      return;
    }

    const token = await tokenResponse.json();
    clearInterval(pairingTimer);
    pairingTimer = null;

    await storageSet({
      deviceId: token.device_id,
      deviceToken: token.device_token,
      relayUrl: token.relay_url,
      deviceName,
    });
    await connectSocket();
  }, Math.max(2000, Number(pair.interval || 2) * 1000));

  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "browser-state") return currentState();
    if (message?.type === "start-pairing") return startPairing();
    if (message?.type === "grant-current-tab") return grantCurrentTab();
    if (message?.type === "set-tab-interact") return setTabInteract(message.tabId, Boolean(message.enabled));
    if (message?.type === "revoke-tab-id") {
      await revokeGrant(message.tabId);
      return { ok: true };
    }
    if (message?.type === "revoke-tab") {
      const tab = await activeTab();
      if (tab?.id) await revokeGrant(tab.id);
      return { ok: true };
    }
    if (message?.type === "revoke-all-tabs") {
      await revokeAllGrants();
      return { ok: true };
    }
    if (message?.type === "disconnect-browser") {
      await revokeAllGrants();
      socket?.close();
      socket = null;
      await chrome.storage.local.remove(["deviceId", "deviceToken", "relayUrl", "deviceName"]);
      return { ok: true };
    }
    return { error: "unknown message" };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({
      error: error instanceof Error ? error.message : String(error),
    }));

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (grants.has(tabId) && (changeInfo.status === "loading" || changeInfo.url)) {
    revokeGrant(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (grants.has(tabId)) revokeGrant(tabId);
});

chrome.runtime.onStartup.addListener(() => connectSocket().catch(() => undefined));
chrome.runtime.onInstalled.addListener(() => connectSocket().catch(() => undefined));
connectSocket().catch(() => undefined);
