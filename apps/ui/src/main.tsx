import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type Device = {
  id: string;
  name: string;
  platform: string;
  arch: string | null;
  hostname: string | null;
  created_at: string;
  last_seen: string | null;
  status: "online" | "offline";
  tools: string[];
};

type Pairing = {
  user_code: string;
  device_name: string;
  platform: string;
  arch: string | null;
  hostname: string | null;
  status: string;
  expires_at: string;
};

type AuditEvent = {
  id: string;
  device_id: string | null;
  event_type: string;
  tool_name: string | null;
  success: number;
  created_at: string;
};

type ProductStatus = {
  googleConfigured: boolean;
  mcpEndpoint: string;
  totalDevices: number;
  onlineDevices: number;
  recentActivity: AuditEvent[];
};

const platformLabel = (platform?: string | null) => {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "Unknown";
};

const platformGlyph = (platform?: string | null) => {
  if (platform === "darwin") return "⌘";
  if (platform === "win32") return "⊞";
  return "›_";
};

const returnTo = () =>
  encodeURIComponent(location.pathname + location.search);

const timeAgo = (value?: string | null) => {
  if (!value) return "Never";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + "m ago";
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + "h ago";
  return Math.floor(delta / 86_400_000) + "d ago";
};

const eventLabel = (event: AuditEvent) => {
  if (event.event_type === "device.paired") return "Device paired";
  if (event.event_type === "device.revoked") return "Device revoked";
  if (event.event_type === "device.renamed") return "Device renamed";
  if (event.event_type === "mcp.tool_call") {
    return event.tool_name ? "MCP · " + event.tool_name : "MCP tool call";
  }
  return event.event_type;
};

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <button className="ghostButton" onClick={() => void copy()}>
      {copied ? "Copied" : label}
    </button>
  );
}

function CenteredCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="centerShell">
      <a href="/" className="brand compactBrand">
        <span className="brandMark">RL</span>
        <span>Remote Link</span>
      </a>
      <section className="centerCard">
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </section>
    </main>
  );
}

function PairDevice({
  user,
  onSignedIn,
}: {
  user: User | null | undefined;
  onSignedIn: () => Promise<void>;
}) {
  const initialCode =
    new URLSearchParams(location.search).get("code")?.toUpperCase() || "";
  const [code, setCode] = useState(initialCode);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lookup(targetCode = code) {
    if (!targetCode || !user) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        "/api/pairing?code=" + encodeURIComponent(targetCode),
      );
      const payload = (await response.json()) as Pairing & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Pairing code not found");
      setPairing(payload);
    } catch (error) {
      setPairing(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && initialCode) void lookup(initialCode);
  }, [user?.id]);

  async function approve() {
    if (!pairing) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: pairing.user_code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not approve device");
      setApproved(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return <CenteredCard title="Loading…" body="Checking your Remote Link account." />;
  }

  if (!user) {
    return (
      <CenteredCard
        title="Sign in to pair this computer"
        body={
          initialCode
            ? "The code from your terminal is " + initialCode + ". Sign in with Google to continue."
            : "Sign in with Google to approve this computer."
        }
      >
        <a className="primaryButton" href={"/auth/google?return_to=" + returnTo()}>
          Continue with Google
        </a>
      </CenteredCard>
    );
  }

  if (approved) {
    return (
      <CenteredCard
        title="Device connected"
        body="Authorization is complete. Return to your terminal — the Remote Link agent will connect automatically."
      >
        <div className="successMark">✓</div>
        <div className="successDetails">
          <strong>Encrypted device credential created</strong>
          <span>Only a hash is stored on the server.</span>
        </div>
        <a className="secondaryLink" href="/">Back to dashboard</a>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title="Pair a computer"
      body="Confirm the code and device below match what is shown in your terminal."
    >
      {!pairing && (
        <div className="pairLookup">
          <input
            className="codeInput"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            maxLength={9}
          />
          <button onClick={() => void lookup()} disabled={busy || !code}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </div>
      )}

      {pairing && (
        <div className="pairDevice">
          <div className="pairCode">{pairing.user_code}</div>
          <div className="pairComputer">
            <div className="deviceIcon large">{platformGlyph(pairing.platform)}</div>
            <div className="pairMeta">
              <strong>{pairing.device_name}</strong>
              <span>
                {platformLabel(pairing.platform)}
                {pairing.arch ? " · " + pairing.arch : ""}
              </span>
              {pairing.hostname && <span>{pairing.hostname}</span>}
            </div>
          </div>
          <div className="permissionBox">
            <div>
              <strong>Developer access</strong>
              <span>Files, processes, and development commands</span>
            </div>
            <span className="permissionBadge">Local policy enforced</span>
          </div>
          <button className="approveButton" onClick={() => void approve()} disabled={busy}>
            {busy ? "Authorizing…" : "Authorize this device"}
          </button>
        </div>
      )}

      {message && <p className="errorText">{message}</p>}
      <p className="signedInAs">
        Signed in as {user.email}.{" "}
        <button className="textButton" onClick={() => void onSignedIn()}>
          Refresh session
        </button>
      </p>
    </CenteredCard>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "good" | "neutral";
}) {
  return (
    <article className="metricCard">
      <div className="metricTop">
        <span>{label}</span>
        <i className={"statusDot " + (tone === "good" ? "good" : "")} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Dashboard({
  user,
  devices,
  status,
  refreshAll,
  signOut,
}: {
  user: User;
  devices: Device[];
  status: ProductStatus | null;
  refreshAll: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [active, setActive] = useState<"overview" | "devices" | "connect" | "security">("overview");
  const command = "npx remotelink@latest";
  const safeCommand = "npx remotelink@latest --safe";
  const mcpEndpoint = location.origin + "/mcp";

  const deviceNameById = useMemo(
    () => new Map(devices.map((device) => [device.id, device.name])),
    [devices],
  );

  async function revoke(deviceId: string) {
    if (!confirm("Revoke this device? It will need to pair again.")) return;
    await fetch("/api/devices/" + encodeURIComponent(deviceId) + "/revoke", {
      method: "POST",
    });
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = prompt("Device name", device.name)?.trim();
    if (!next || next === device.name) return;
    const response = await fetch(
      "/api/devices/" + encodeURIComponent(device.id) + "/rename",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      },
    );
    if (!response.ok) {
      alert("Could not rename this device.");
      return;
    }
    await refreshAll();
  }

  return (
    <div className="appFrame">
      <aside className="sidebar">
        <a href="/" className="brand sidebarBrand">
          <span className="brandMark">RL</span>
          <span>Remote Link</span>
        </a>

        <nav className="sideNav">
          <button className={active === "overview" ? "active" : ""} onClick={() => setActive("overview")}>
            <span>⌂</span> Overview
          </button>
          <button className={active === "devices" ? "active" : ""} onClick={() => setActive("devices")}>
            <span>▣</span> Devices
          </button>
          <button className={active === "connect" ? "active" : ""} onClick={() => setActive("connect")}>
            <span>↗</span> Connect AI
          </button>
          <button className={active === "security" ? "active" : ""} onClick={() => setActive("security")}>
            <span>◇</span> Security
          </button>
        </nav>

        <div className="sidebarStatus">
          <div className="livePulse" />
          <div>
            <strong>Relay online</strong>
            <span>remote.samyao.me</span>
          </div>
        </div>

        <div className="sidebarAccount">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" />
          ) : (
            <div className="avatarFallback">{(user.name || user.email).slice(0, 1).toUpperCase()}</div>
          )}
          <div>
            <strong>{user.name || "Owner"}</strong>
            <span>{user.email}</span>
          </div>
          <button onClick={() => void signOut()} title="Sign out">↪</button>
        </div>
      </aside>

      <main className="dashboardMain">
        <header className="mobileTopbar">
          <a href="/" className="brand">
            <span className="brandMark">RL</span>
            <span>Remote Link</span>
          </a>
          <button className="addButton compact" onClick={() => setShowAdd(true)}>+ Device</button>
        </header>

        {active === "overview" && (
          <>
            <section className="pageHeader">
              <div>
                <span className="eyebrow">PRIVATE REMOTE MCP</span>
                <h1>Good to see you, {user.name?.split(" ")[0] || "Sam"}.</h1>
                <p>Your computers are one secure MCP hop away from ChatGPT.</p>
              </div>
              <button className="addButton" onClick={() => setShowAdd(true)}>+ Add device</button>
            </section>

            <section className="metricsGrid">
              <Metric
                label="Online now"
                value={status?.onlineDevices ?? devices.filter((d) => d.status === "online").length}
                detail="Ready for MCP calls"
                tone="good"
              />
              <Metric
                label="Linked devices"
                value={status?.totalDevices ?? devices.length}
                detail="Windows · macOS · Linux"
              />
              <Metric
                label="Remote MCP"
                value="Ready"
                detail="/mcp · OAuth 2.1 + PKCE"
                tone="good"
              />
              <Metric
                label="Account mode"
                value="Private"
                detail="First account owns this instance"
                tone="good"
              />
            </section>

            <section className="contentGrid">
              <div className="panelBlock">
                <div className="blockHeader">
                  <div>
                    <span className="eyebrow">DEVICES</span>
                    <h2>Connected computers</h2>
                  </div>
                  <button className="ghostButton" onClick={() => setActive("devices")}>View all</button>
                </div>
                <div className="compactDeviceList">
                  {devices.slice(0, 4).map((device) => (
                    <button className="compactDevice" key={device.id} onClick={() => setActive("devices")}>
                      <div className="deviceIcon">{platformGlyph(device.platform)}</div>
                      <div className="compactDeviceText">
                        <strong>{device.name}</strong>
                        <span>{platformLabel(device.platform)} · {device.tools.length} tools</span>
                      </div>
                      <span className={"badge " + device.status}>
                        <i />{device.status}
                      </span>
                    </button>
                  ))}
                  {!devices.length && (
                    <button className="compactDevice empty" onClick={() => setShowAdd(true)}>
                      <div className="deviceIcon">＋</div>
                      <div className="compactDeviceText">
                        <strong>Add your first computer</strong>
                        <span>One npx command, then approve in the browser</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div className="panelBlock">
                <div className="blockHeader">
                  <div>
                    <span className="eyebrow">ACTIVITY</span>
                    <h2>Recent activity</h2>
                  </div>
                  <span className="privacyPill">Arguments not logged</span>
                </div>
                <div className="activityList">
                  {(status?.recentActivity || []).map((event) => (
                    <div className="activityItem" key={event.id}>
                      <i className={event.success ? "eventIcon success" : "eventIcon failed"}>
                        {event.success ? "✓" : "!"}
                      </i>
                      <div>
                        <strong>{eventLabel(event)}</strong>
                        <span>
                          {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0, 8) : "Account"}
                          {" · "}{timeAgo(event.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!status?.recentActivity?.length && (
                    <div className="activityEmpty">
                      <strong>No activity yet</strong>
                      <span>Pair a device or call a tool from ChatGPT.</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="connectBanner">
              <div className="connectIcon">↗</div>
              <div>
                <span className="eyebrow">CHATGPT</span>
                <h2>Connect once. Then just talk.</h2>
                <p>Add the Remote MCP endpoint in Developer Mode. OAuth links ChatGPT to this account.</p>
              </div>
              <div className="connectBannerActions">
                <code>{mcpEndpoint}</code>
                <CopyButton value={mcpEndpoint} />
                <button className="ghostButton" onClick={() => setActive("connect")}>Setup</button>
              </div>
            </section>
          </>
        )}

        {active === "devices" && (
          <>
            <section className="pageHeader">
              <div>
                <span className="eyebrow">DEVICES</span>
                <h1>Your computers.</h1>
                <p>Each computer has its own revocable credential and local capability policy.</p>
              </div>
              <button className="addButton" onClick={() => setShowAdd(true)}>+ Add device</button>
            </section>

            <div className="deviceGrid rich">
              {devices.map((device) => (
                <article className="deviceCard" key={device.id}>
                  <div className="deviceTop">
                    <div className="deviceIdentity">
                      <div className="deviceIcon large">{platformGlyph(device.platform)}</div>
                      <div>
                        <h3>{device.name}</h3>
                        <span>{platformLabel(device.platform)} · {device.arch || "unknown"}</span>
                      </div>
                    </div>
                    <span className={"badge " + device.status}><i />{device.status}</span>
                  </div>

                  <div className="deviceMetaGrid">
                    <div><span>Hostname</span><strong>{device.hostname || "—"}</strong></div>
                    <div><span>Tools</span><strong>{device.tools.length}</strong></div>
                    <div><span>Last seen</span><strong>{timeAgo(device.last_seen)}</strong></div>
                    <div><span>Device ID</span><strong>{device.id.slice(0, 8)}</strong></div>
                  </div>

                  <div className="toolPills">
                    {device.tools.slice(0, 5).map((tool) => <span key={tool}>{tool}</span>)}
                    {device.tools.length > 5 && <span>+{device.tools.length - 5}</span>}
                    {!device.tools.length && <span>Offline — capabilities hidden</span>}
                  </div>

                  <div className="deviceActions">
                    <button className="ghostButton" onClick={() => void rename(device)}>Rename</button>
                    <CopyButton value={device.id} label="Copy ID" />
                    <button className="dangerButton" onClick={() => void revoke(device.id)}>Revoke</button>
                  </div>
                </article>
              ))}

              {!devices.length && (
                <article className="emptyCard wide">
                  <div className="emptyIcon">⌁</div>
                  <h3>No paired computers</h3>
                  <p>Windows, macOS, and Linux are supported. No public IP or port forwarding required.</p>
                  <button onClick={() => setShowAdd(true)}>Add your first device</button>
                </article>
              )}
            </div>
          </>
        )}

        {active === "connect" && (
          <>
            <section className="pageHeader">
              <div>
                <span className="eyebrow">CONNECT AI</span>
                <h1>One endpoint for your computers.</h1>
                <p>Remote Link exposes a standards-based Remote MCP protected by OAuth 2.1 + PKCE.</p>
              </div>
            </section>

            <section className="setupGrid">
              <article className="setupCard featured">
                <span className="stepNumber">01</span>
                <div>
                  <span className="eyebrow">REMOTE MCP URL</span>
                  <h2>Add Remote Link to ChatGPT</h2>
                  <p>In ChatGPT Developer Mode, create a Remote MCP connection using this endpoint.</p>
                  <div className="endpointRow large">
                    <code>{mcpEndpoint}</code>
                    <CopyButton value={mcpEndpoint} />
                  </div>
                </div>
              </article>

              <article className="setupCard">
                <span className="stepNumber">02</span>
                <div>
                  <h2>Authorize with Google</h2>
                  <p>ChatGPT discovers Remote Link OAuth metadata, opens this site, and links to the same owner account.</p>
                  <div className="scopeList">
                    <span>devices:read</span>
                    <span>computer:read</span>
                    <span>computer:write</span>
                  </div>
                </div>
              </article>

              <article className="setupCard">
                <span className="stepNumber">03</span>
                <div>
                  <h2>Talk naturally</h2>
                  <p>Once connected, address a device by name and Remote Link handles routing.</p>
                  <div className="promptExamples">
                    <code>“List the projects on my Mac.”</code>
                    <code>“Run the tests on SamPC.”</code>
                    <code>“Read package.json from my MacBook.”</code>
                  </div>
                </div>
              </article>
            </section>

            <section className="protocolCard">
              <div>
                <span className="eyebrow">DISCOVERY</span>
                <h2>OAuth discovery is live</h2>
                <p>Remote Link publishes protected-resource metadata, authorization-server metadata, DCR, PKCE, refresh tokens, and per-user device routing.</p>
              </div>
              <div className="protocolEndpoints">
                <code>/.well-known/oauth-protected-resource</code>
                <code>/.well-known/oauth-authorization-server</code>
                <code>/oauth/register · /oauth/authorize · /oauth/token</code>
              </div>
            </section>
          </>
        )}

        {active === "security" && (
          <>
            <section className="pageHeader">
              <div>
                <span className="eyebrow">SECURITY</span>
                <h1>Control stays local.</h1>
                <p>The relay routes requests. Your computer remains the final execution and permission boundary.</p>
              </div>
            </section>

            <section className="securityGrid">
              <article className="securityCard">
                <span className="securityIcon">◇</span>
                <h2>Private owner mode</h2>
                <p>The first Google account becomes the instance owner. New account registration is disabled by default.</p>
                <span className="securityState good">Enabled</span>
              </article>
              <article className="securityCard">
                <span className="securityIcon">⌁</span>
                <h2>Per-device credentials</h2>
                <p>Every computer gets a unique credential. Only SHA-256 hashes are persisted in D1.</p>
                <span className="securityState good">Enabled</span>
              </article>
              <article className="securityCard">
                <span className="securityIcon">↗</span>
                <h2>Outbound-only connection</h2>
                <p>Your computer opens the WebSocket to Cloudflare. No inbound port, VPN, or public IP is required.</p>
                <span className="securityState good">Enabled</span>
              </article>
              <article className="securityCard">
                <span className="securityIcon">◎</span>
                <h2>OAuth 2.1 + PKCE</h2>
                <p>MCP clients receive short-lived access tokens with rotating refresh tokens and explicit scopes.</p>
                <span className="securityState good">Enabled</span>
              </article>
              <article className="securityCard">
                <span className="securityIcon">▦</span>
                <h2>Privacy-preserving audit</h2>
                <p>Remote Link records tool name, device, success, and time — never command arguments or file contents.</p>
                <span className="securityState good">Enabled</span>
              </article>
              <article className="securityCard">
                <span className="securityIcon">⊞</span>
                <h2>Local permission modes</h2>
                <p>Use developer mode for editing and commands, or safe mode for a read-oriented tool surface.</p>
                <span className="securityState">Per device</span>
              </article>
            </section>
          </>
        )}

        <footer className="dashboardFooter">
          <span>Remote Link · self-hosted on samyao.me</span>
          <div>
            <a href="https://github.com/yaohuangguan/remote-link">GitHub</a>
            <a href="/health">Health</a>
          </div>
        </footer>
      </main>

      {showAdd && (
        <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
            <span className="eyebrow">ADD A DEVICE</span>
            <h2>Connect a computer in one command.</h2>
            <p>No repository clone, environment file, token copy, public IP, or router configuration.</p>

            <div className="commandLabel">Developer mode · recommended</div>
            <div className="commandBox">
              <code>{command}</code>
              <CopyButton value={command} />
            </div>

            <div className="commandLabel secondary">Read-oriented safe mode</div>
            <div className="commandBox muted">
              <code>{safeCommand}</code>
              <CopyButton value={safeCommand} />
            </div>

            <div className="onboardingSteps">
              <div><b>1</b><span><strong>Run the command</strong><small>Terminal or PowerShell · Node.js 20+</small></span></div>
              <div><b>2</b><span><strong>Match the pairing code</strong><small>Your browser opens automatically</small></span></div>
              <div><b>3</b><span><strong>Authorize the computer</strong><small>It appears here as soon as the agent connects</small></span></div>
            </div>
            <div className="supportLine">Windows · macOS · Linux</div>
          </section>
        </div>
      )}
    </div>
  );
}

function Landing() {
  return (
    <main className="landing">
      <header className="landingNav">
        <div className="brand">
          <span className="brandMark">RL</span>
          <span>Remote Link</span>
        </div>
        <div className="landingLinks">
          <a href="https://github.com/yaohuangguan/remote-link">GitHub</a>
          <a className="navLogin" href="/auth/google?return_to=/">Sign in</a>
        </div>
      </header>

      <section className="landingHero">
        <span className="eyebrow">SELF-HOSTED REMOTE MCP</span>
        <h1>Your computer,<br />one AI call away.</h1>
        <p>
          Connect Windows, macOS, and Linux to ChatGPT through your own
          Remote MCP infrastructure. Pair once, then just talk.
        </p>
        <div className="landingActions">
          <a className="primaryButton" href="/auth/google?return_to=/">Continue with Google</a>
          <a className="ghostLink" href="https://github.com/yaohuangguan/remote-link">View source ↗</a>
        </div>

        <div className="terminalPreview">
          <div className="terminalBar">
            <div className="terminalDots"><i /><i /><i /></div>
            <span>Terminal</span>
          </div>
          <code>
            <span>$</span> npx remotelink@latest{"\n"}
            <em>Remote Link</em>{"\n\n"}
            Pairing code: <strong>J7KD-P2QF</strong>{"\n"}
            Opening browser...{"\n\n"}
            <strong>✓ Device authorized</strong>{"\n"}
            <strong>✓ Connected</strong> as Sam MacBook
          </code>
        </div>
      </section>

      <section className="landingFeatures">
        <article><span>01</span><h2>One command</h2><p>No clone, config file, token copy, or port forwarding.</p></article>
        <article><span>02</span><h2>Your infrastructure</h2><p>Cloudflare Worker, Durable Objects, D1, and your own domain.</p></article>
        <article><span>03</span><h2>Open MCP</h2><p>OAuth-protected Remote MCP for ChatGPT and compatible AI clients.</p></article>
        <article><span>04</span><h2>Local control</h2><p>The computer enforces its own allowed tool surface before execution.</p></article>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  async function loadMe() {
    const response = await fetch("/api/me");
    if (!response.ok) {
      setUser(null);
      return;
    }
    const payload = (await response.json()) as { user: User };
    setUser(payload.user);
  }

  async function loadAll() {
    const [devicesResponse, statusResponse] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/status"),
    ]);
    if (devicesResponse.ok) {
      setDevices((await devicesResponse.json()) as Device[]);
    }
    if (statusResponse.ok) {
      setStatus((await statusResponse.json()) as ProductStatus);
    }
  }

  async function signOut() {
    await fetch("/auth/logout", { method: "POST" });
    setUser(null);
    setDevices([]);
    setStatus(null);
  }

  useEffect(() => {
    void loadMe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadAll();
    const timer = window.setInterval(() => void loadAll(), 5000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  if (location.pathname === "/device") {
    return <PairDevice user={user} onSignedIn={loadMe} />;
  }

  if (user === undefined) {
    return <CenteredCard title="Loading…" body="Connecting to Remote Link." />;
  }

  if (!user) return <Landing />;

  return (
    <Dashboard
      user={user}
      devices={devices}
      status={status}
      refreshAll={loadAll}
      signOut={signOut}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
