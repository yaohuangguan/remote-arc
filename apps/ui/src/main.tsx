import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Device = {
  id: string;
  name?: string;
  platform?: string;
  arch?: string;
  hostname?: string;
  agentVersion?: string;
  tools?: string[];
  status?: string;
};

const platformLabel = (platform?: string) => {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "Unknown";
};

function App() {
  const [key, setKey] = useState(
    () => localStorage.getItem("remote-link-key") || "",
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState("Enter your access key to connect.");
  const [busy, setBusy] = useState(false);

  const mcpUrl = useMemo(
    () => (key ? location.origin + "/mcp/" + encodeURIComponent(key) : ""),
    [key],
  );

  async function refresh() {
    if (!key) {
      setDevices([]);
      setStatus("Enter your access key to connect.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        "/api/devices?key=" + encodeURIComponent(key),
      );
      if (!response.ok) throw new Error("Access key rejected");
      const payload = (await response.json()) as Device[];
      setDevices(payload);
      localStorage.setItem("remote-link-key", key);
      setStatus(
        payload.length
          ? payload.length + " device" + (payload.length === 1 ? "" : "s") + " online"
          : "No devices online",
      );
    } catch (error) {
      setDevices([]);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!key) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const agentCommand = [
    "pnpm install",
    "REMOTE_LINK_DEVICE_ID=sam-pc \\",
    "REMOTE_LINK_DEVICE_NAME=SamPC \\",
    "REMOTE_LINK_RELAY_URL=wss://remote.samyao.me \\",
    "REMOTE_LINK_AGENT_TOKEN=*** \\",
    "REMOTE_LINK_MODE=safe \\",
    "pnpm dev:agent",
  ].join("\n");

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand">
          <span className="brandMark">RL</span>
          <span>Remote Link</span>
        </div>
        <div className="eyebrow">Your computers, available to your AI.</div>
        <h1>Remote computer access through MCP.</h1>
        <p className="lede">
          Connect Windows, macOS, and Linux devices with one lightweight
          agent. Remote Link routes AI tool calls back to the computer you choose.
        </p>
      </header>

      <section className="panel authPanel">
        <div>
          <h2>Private access</h2>
          <p>Your access key stays in this browser's local storage.</p>
        </div>
        <div className="keyRow">
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            type="password"
            placeholder="Remote Link access key"
            spellCheck={false}
          />
          <button onClick={() => void refresh()} disabled={busy || !key}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
        <div className="statusLine">
          <span className={devices.length ? "dot online" : "dot"} />
          {status}
        </div>
      </section>

      {mcpUrl && (
        <section className="panel">
          <div className="sectionHead">
            <div>
              <h2>ChatGPT MCP endpoint</h2>
              <p>Add this URL as your Remote MCP endpoint.</p>
            </div>
          </div>
          <div className="endpoint">
            <code>{mcpUrl}</code>
            <button
              className="secondary"
              onClick={() => void navigator.clipboard.writeText(mcpUrl)}
            >
              Copy
            </button>
          </div>
        </section>
      )}

      <section className="devicesSection">
        <div className="sectionHead">
          <div>
            <h2>Devices</h2>
            <p>Agents refresh automatically every five seconds.</p>
          </div>
          <button
            className="secondary"
            onClick={() => void refresh()}
            disabled={busy || !key}
          >
            Refresh
          </button>
        </div>

        <div className="deviceGrid">
          {devices.map((device) => (
            <article className="deviceCard" key={device.id}>
              <div className="deviceTop">
                <div>
                  <h3>{device.name || device.id}</h3>
                  <span>{device.id}</span>
                </div>
                <span className="badge">Online</span>
              </div>
              <dl>
                <div>
                  <dt>Platform</dt>
                  <dd>{platformLabel(device.platform)}</dd>
                </div>
                <div>
                  <dt>Architecture</dt>
                  <dd>{device.arch || "—"}</dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>v{device.agentVersion || "0.1.0"}</dd>
                </div>
                <div>
                  <dt>Tools</dt>
                  <dd>{device.tools?.length || 0}</dd>
                </div>
              </dl>
            </article>
          ))}

          {!devices.length && (
            <article className="emptyCard">
              <span className="emptyIcon">⌁</span>
              <h3>No connected computers yet</h3>
              <p>
                Start the Remote Link agent on a computer and it will appear
                here automatically.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className="panel setup">
        <h2>Local agent</h2>
        <p>
          For now the agent runs from this monorepo. A one-command installer comes next.
        </p>
        <pre>{agentCommand}</pre>
      </section>

      <footer>
        <span>Remote Link · self-hosted on samyao.me</span>
        <a href="https://github.com/yaohuangguan/remote-link">GitHub</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
