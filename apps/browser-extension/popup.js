const connection = document.querySelector("#connection");
const tab = document.querySelector("#tab");
const status = document.querySelector("#status");

const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

async function render() {
  const state = await send("browser-state");

  connection.innerHTML = state.connected
    ? `<div class="permission"><span>Remote Arc</span><span class="on">Connected</span></div>
       <div class="meta">${escapeHtml(state.deviceName || "Chrome")}</div>
       <button class="secondary" id="disconnect">Disconnect browser</button>`
    : `<div class="permission"><span>Remote Arc</span><span>Not connected</span></div>
       <button class="primary" id="connect">Connect to Remote Arc</button>`;

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await send("disconnect-browser");
    await render();
  });

  document.querySelector("#connect")?.addEventListener("click", async () => {
    status.textContent = "Starting secure pairing...";
    const result = await send("start-pairing");
    status.textContent = result?.error || "Approve the pairing in the Remote Arc tab.";
  });

  const count = state.grants?.length || 0;
  const shared = Boolean(state.activeGrant);

  tab.innerHTML = shared
    ? `<div class="permission"><span>Current tab</span><span class="on">AI access on</span></div>
       <div class="meta">${escapeHtml(state.activeGrant.url)}</div>
       <div class="permission"><span>Shared tabs</span><span>${count}</span></div>
       <div class="permission"><span>Read page</span><span class="on">Allowed</span></div>
       <div class="permission"><span>Fill / click</span><span>Blocked</span></div>
       <button class="secondary" id="revoke">Stop AI access on this tab</button>`
    : `<div class="permission"><span>Current tab</span><span>No access</span></div>
       <div class="permission"><span>Shared tabs</span><span>${count}</span></div>
       <p class="meta">Each tab must be shared explicitly.</p>
       <button class="primary" id="grant" ${state.connected ? "" : "disabled"}>Allow AI on this tab</button>`;

  document.querySelector("#revoke")?.addEventListener("click", async () => {
    await send("revoke-tab");
    status.textContent = "Access revoked for this tab.";
    await render();
  });

  document.querySelector("#grant")?.addEventListener("click", async () => {
    const result = await send("grant-current-tab");
    if (result?.error) {
      status.textContent = result.error;
      return;
    }
    status.textContent = "Read-only access granted.";
    await render();
  });
}

render().catch((error) => {
  status.textContent = error instanceof Error ? error.message : String(error);
});
