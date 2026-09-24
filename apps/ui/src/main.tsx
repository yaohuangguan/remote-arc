import React, { useEffect, useState } from "react";
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

const platformLabel = (platform?: string | null) => {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "Unknown";
};

const returnTo = () =>
  encodeURIComponent(location.pathname + location.search);

function PairDevice({
  user,
  onSignedIn,
}: {
  user: User | null | undefined;
  onSignedIn: () => Promise<void>;
}) {
  const initialCode = new URLSearchParams(location.search)
    .get("code")
    ?.toUpperCase() || "";
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
        body="Authorization complete. Return to your terminal — Remote Link will finish connecting automatically."
      >
        <div className="successMark">✓</div>
        <a className="secondaryLink" href="/">Back to devices</a>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title="Pair a computer"
      body="Confirm that this is the same code and computer shown in your terminal."
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
          <div className="pairMeta">
            <strong>{pairing.device_name}</strong>
            <span>
              {platformLabel(pairing.platform)}
              {pairing.arch ? " · " + pairing.arch : ""}
            </span>
            {pairing.hostname && <span>{pairing.hostname}</span>}
          </div>
          <div className="permissionBox">
            <strong>Developer access</strong>
            <span>Read and edit files, inspect processes, and run development commands.</span>
          </div>
          <button className="approveButton" onClick={() => void approve()} disabled={busy}>
            {busy ? "Authorizing…" : "Authorize device"}
          </button>
        </div>
      )}

      {message && <p className="errorText">{message}</p>}
      <p className="signedInAs">
        Signed in as {user.email}.{" "}
        <button className="textButton" onClick={() => void onSignedIn()}>
          Refresh
        </button>
      </p>
    </CenteredCard>
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

function Dashboard({
  user,
  devices,
  refreshDevices,
  signOut,
}: {
  user: User;
  devices: Device[];
  refreshDevices: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const command = "npx remotelink@latest";
  const mcpEndpoint = location.origin + "/mcp";

  async function revoke(deviceId: string) {
    if (!confirm("Revoke this device? It will need to pair again.")) return;
    await fetch("/api/devices/" + encodeURIComponent(deviceId) + "/revoke", {
      method: "POST",
    });
    await refreshDevices();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brandMark">RL</span>
          <span>Remote Link</span>
        </a>
        <div className="account">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
          <div>
            <strong>{user.name || user.email}</strong>
            <span>{user.email}</span>
          </div>
          <button className="ghostButton" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="dashboardHero">
        <div>
          <span className="eyebrow">REMOTE MCP</span>
          <h1>Your computers.<br />Available to your AI.</h1>
          <p>
            Pair a computer once. Remote Link keeps an outbound encrypted connection
            ready for ChatGPT and other MCP clients.
          </p>
        </div>
        <button className="addButton" onClick={() => setShowAdd(true)}>
          + Add device
        </button>
      </section>

      <section className="section">
        <div className="sectionHead">
          <div>
            <h2>Devices</h2>
            <p>{devices.length} linked computer{devices.length === 1 ? "" : "s"}</p>
          </div>
          <button className="ghostButton" onClick={() => void refreshDevices()}>
            Refresh
          </button>
        </div>

        <div className="deviceGrid">
          {devices.map((device) => (
            <article className="deviceCard" key={device.id}>
              <div className="deviceTop">
                <div className="deviceIdentity">
                  <div className="deviceIcon">
                    {device.platform === "darwin" ? "⌘" : device.platform === "win32" ? "⊞" : "›_"}
                  </div>
                  <div>
                    <h3>{device.name}</h3>
                    <span>{platformLabel(device.platform)} · {device.arch || "unknown"}</span>
                  </div>
                </div>
                <span className={"badge " + device.status}>
                  <i />
                  {device.status === "online" ? "Online" : "Offline"}
                </span>
              </div>

              <dl>
                <div>
                  <dt>Tools</dt>
                  <dd>{device.tools.length}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{device.last_seen ? new Date(device.last_seen).toLocaleString() : "Never"}</dd>
                </div>
              </dl>

              <div className="cardActions">
                <code>{device.id.slice(0, 8)}</code>
                <button className="dangerLink" onClick={() => void revoke(device.id)}>
                  Revoke
                </button>
              </div>
            </article>
          ))}

          {!devices.length && (
            <article className="emptyCard">
              <div className="emptyIcon">⌁</div>
              <h3>No computers yet</h3>
              <p>Add your first Windows, macOS, or Linux computer with one command.</p>
              <button onClick={() => setShowAdd(true)}>Add a device</button>
            </article>
          )}
        </div>
      </section>

      <section className="connectCard">
        <div>
          <span className="eyebrow">CHATGPT</span>
          <h2>Connect Remote Link to ChatGPT</h2>
          <p>
            Add the Remote MCP endpoint once in Developer Mode. ChatGPT will open
            this site and ask you to sign in with Google.
          </p>
        </div>
        <div className="endpointRow">
          <code>{mcpEndpoint}</code>
          <button
            className="ghostButton"
            onClick={() => void navigator.clipboard.writeText(mcpEndpoint)}
          >
            Copy
          </button>
        </div>
      </section>

      <footer>
        <span>Remote Link · self-hosted on samyao.me</span>
        <a href="https://github.com/yaohuangguan/remote-link">GitHub</a>
      </footer>

      {showAdd && (
        <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
            <span className="eyebrow">ADD A DEVICE</span>
            <h2>One command. That's it.</h2>
            <p>
              Run this on the computer you want to connect. A browser window will
              open with a pairing code for you to confirm.
            </p>
            <div className="commandBox">
              <code>{command}</code>
              <button onClick={() => void navigator.clipboard.writeText(command)}>
                Copy
              </button>
            </div>
            <ol>
              <li>Run the command in Terminal or PowerShell.</li>
              <li>Confirm the matching code in your browser.</li>
              <li>The computer appears here automatically.</li>
            </ol>
            <div className="supportLine">Windows · macOS · Linux · Node.js 20+</div>
          </section>
        </div>
      )}
    </main>
  );
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);

  async function loadMe() {
    const response = await fetch("/api/me");
    if (!response.ok) {
      setUser(null);
      return;
    }
    const payload = (await response.json()) as { user: User };
    setUser(payload.user);
  }

  async function loadDevices() {
    const response = await fetch("/api/devices");
    if (!response.ok) return;
    setDevices((await response.json()) as Device[]);
  }

  async function signOut() {
    await fetch("/auth/logout", { method: "POST" });
    setUser(null);
    setDevices([]);
  }

  useEffect(() => {
    void loadMe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadDevices();
    const timer = window.setInterval(() => void loadDevices(), 5000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  if (location.pathname === "/device") {
    return <PairDevice user={user} onSignedIn={loadMe} />;
  }

  if (user === undefined) {
    return <CenteredCard title="Loading…" body="Connecting to Remote Link." />;
  }

  if (!user) {
    return (
      <main className="landing">
        <header className="landingNav">
          <div className="brand">
            <span className="brandMark">RL</span>
            <span>Remote Link</span>
          </div>
          <a className="navLogin" href="/auth/google?return_to=/">
            Sign in
          </a>
        </header>
        <section className="landingHero">
          <span className="eyebrow">SELF-HOSTED REMOTE MCP</span>
          <h1>Your computer,<br />one AI call away.</h1>
          <p>
            Connect Windows, macOS, and Linux to ChatGPT through your own
            Remote MCP infrastructure. Pair once, then just talk.
          </p>
          <a className="primaryButton" href="/auth/google?return_to=/">
            Continue with Google
          </a>
          <div className="terminalPreview">
            <div className="terminalDots"><i /><i /><i /></div>
            <code>
              <span>$</span> npx remotelink@latest{"\n"}
              <em>Remote Link</em>{"\n\n"}
              Pairing code: <strong>J7KD-P2QF</strong>{"\n"}
              Opening browser...
            </code>
          </div>
        </section>
      </main>
    );
  }

  return (
    <Dashboard
      user={user}
      devices={devices}
      refreshDevices={loadDevices}
      signOut={signOut}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
