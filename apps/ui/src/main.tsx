import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useI18n } from "./i18n.js";
import { ThemeProvider, useTheme } from "./theme.js";
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

type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

type ProductStatus = {
  googleConfigured: boolean;
  mcpEndpoint: string;
  totalDevices: number;
  onlineDevices: number;
  recentActivity: AuditEvent[];
  usage: MonthlyUsage;
};

type DashboardTab = "overview" | "devices" | "connect" | "security" | "settings";

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

const timeAgo = (value?: string | null) => {
  if (!value) return "—";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + "m";
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + "h";
  return Math.floor(delta / 86_400_000) + "d";
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className={"brand" + (compact ? " compactBrand" : "")}>
      <img className="brandLogo" src="/logo-mark.svg" alt="" />
      <span className="brandWords">
        <b>Remote</b><b>Arc</b>
      </span>
    </a>
  );
}

function PublicHeader({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <header className="landingNav publicNav">
      <Brand />
      <nav className="publicNavLinks">
        <a href="/#product">{tr("Product", "\u4ea7\u54c1")}</a>
        <a href="/#architecture">{tr("Architecture", "\u67b6\u6784")}</a>
        <a href="/#security">{tr("Security", "\u5b89\u5168")}</a>
        <a href="/pricing">{tr("Pricing", "\u4ef7\u683c")}</a>
        <a href="/resources">{tr("Resources", "\u8d44\u6e90")}</a>
        <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
      </nav>
      <div className="publicNavActions">
        {user ? (
          <a className="navDashboard" href="/dashboard">
            {tr("Dashboard", "\u63a7\u5236\u53f0")} <span>{"\u2197"}</span>
          </a>
        ) : (
          <a className="navLogin" href="/auth/google?return_to=/dashboard">
            {tr("Sign in", "\u767b\u5f55")}
          </a>
        )}
      </div>
    </header>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { tr } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button className="ghostButton" onClick={() => void copy()}>
      {copied ? tr("Copied", "已复制") : label || tr("Copy", "复制")}
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
      <Brand compact />
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
  const { tr } = useI18n();
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
      const response = await fetch("/api/pairing?code=" + encodeURIComponent(targetCode));
      const payload = (await response.json()) as Pairing & { error?: string };
      if (!response.ok) throw new Error(payload.error || tr("Pairing code not found", "未找到配对码"));
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
      if (!response.ok) throw new Error(payload.error || tr("Could not approve device", "设备授权失败"));
      setApproved(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Checking your Remote Arc account.", "正在检查 Remote Arc 账户。")} />;
  }

  if (!user) {
    return (
      <CenteredCard
        title={tr("Sign in to pair this computer", "登录以配对这台电脑")}
        body={initialCode
          ? tr("Sign in with Google to confirm the code shown in your terminal.", "使用 Google 登录，然后确认终端中显示的配对码。")
          : tr("Sign in with Google to approve this computer.", "使用 Google 登录以授权这台电脑。")}
      >
        <a className="primaryButton" href={"/auth/google?return_to=" + encodeURIComponent(location.pathname + location.search)}>
          {tr("Continue with Google", "使用 Google 继续")}
        </a>
      </CenteredCard>
    );
  }

  if (approved) {
    return (
      <CenteredCard
        title={tr("Device connected", "设备已连接")}
        body={tr("Authorization is complete. Return to your terminal — Remote Arc will connect automatically.", "授权完成。返回终端，Remote Arc 会自动完成连接。")}
      >
        <div className="successMark">✓</div>
        <a className="secondaryLink" href="/dashboard">{tr("Back to dashboard", "返回控制台")}</a>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title={tr("Pair a computer", "配对电脑")}
      body={tr("Confirm that the code and computer match what is shown in your terminal.", "确认下面的配对码和设备与终端显示一致。")}
    >
      {!pairing ? (
        <div className="pairLookup">
          <input
            className="codeInput"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            maxLength={9}
          />
          <button onClick={() => void lookup()} disabled={busy || !code}>
            {busy ? tr("Checking…", "检查中…") : tr("Continue", "继续")}
          </button>
        </div>
      ) : (
        <div className="pairDevice">
          <div className="pairCode">{pairing.user_code}</div>
          <div className="pairComputer">
            <div className="deviceIcon large">{platformGlyph(pairing.platform)}</div>
            <div className="pairMeta">
              <strong>{pairing.device_name}</strong>
              <span>{platformLabel(pairing.platform)} · {pairing.arch || "unknown"}</span>
              {pairing.hostname && <span>{pairing.hostname}</span>}
            </div>
          </div>
          <div className="permissionBox">
            <div>
              <strong>{tr("Developer access", "开发者权限")}</strong>
              <span>{tr("Files, processes and development commands", "文件、进程与开发命令")}</span>
            </div>
            <span className="permissionBadge">{tr("Local policy enforced", "本机权限策略生效")}</span>
          </div>
          <button className="approveButton" onClick={() => void approve()} disabled={busy}>
            {busy ? tr("Authorizing…", "授权中…") : tr("Authorize this device", "授权此设备")}
          </button>
        </div>
      )}
      {message && <p className="errorText">{message}</p>}
      <p className="signedInAs">{tr("Signed in as", "当前登录")} {user.email}</p>
    </CenteredCard>
  );
}

function OAuthConsent({ user }: { user: User | null | undefined }) {
  const { tr } = useI18n();
  const params = new URLSearchParams(location.search);
  const scopes = (params.get("scope") || "").split(/\s+/).filter(Boolean);
  const clientId = params.get("client_id") || "MCP client";

  function continueAuthorization(mode: "allow" | "deny") {
    const next = new URLSearchParams(params);
    next.delete("approved");
    next.delete("denied");
    next.set(mode === "allow" ? "approved" : "denied", "1");
    location.assign("/oauth/authorize?" + next.toString());
  }

  if (user === undefined) {
    return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Checking your session.", "正在检查登录状态。")} />;
  }
  if (!user) {
    return (
      <CenteredCard title={tr("Sign in to continue", "登录后继续")} body={tr("Sign in before authorizing this MCP client.", "授权 MCP 客户端前请先登录。")}>
        <a className="primaryButton" href={"/auth/google?return_to=" + encodeURIComponent(location.pathname + location.search)}>
          {tr("Continue with Google", "使用 Google 继续")}
        </a>
      </CenteredCard>
    );
  }

  return (
    <main className="consentShell">
      <Brand compact />
      <section className="consentCard">
        <div className="consentIcon">↗</div>
        <span className="eyebrow">{tr("MCP AUTHORIZATION", "MCP 授权")}</span>
        <h1>{tr("Allow this AI client to access Remote Arc?", "允许此 AI 客户端访问 Remote Arc？")}</h1>
        <p>{tr("This client is requesting access to the computers linked to", "此客户端请求访问绑定到以下账户的设备：")} <strong>{user.email}</strong></p>
        <div className="clientIdBox"><span>Client</span><code>{clientId}</code></div>
        <div className="consentScopes">
          {scopes.map((scope) => (
            <div key={scope}>
              <i>✓</i>
              <span>
                <strong>{scope}</strong>
                <small>
                  {scope === "devices:read"
                    ? tr("See linked computers and online state.", "查看已连接设备及在线状态。")
                    : scope === "computer:read"
                      ? tr("Read files, directories and process metadata.", "读取文件、目录与进程信息。")
                      : tr("Edit files and run commands on devices that allow it.", "在允许的设备上编辑文件并运行命令。")}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="consentNotice">
          {tr("Local permission modes still apply. OAuth cannot enable a tool that the device did not advertise.", "本机权限模式始终生效。OAuth 无法启用设备未开放的工具。")}
        </div>
        <div className="consentActions">
          <button className="ghostButton" onClick={() => continueAuthorization("deny")}>{tr("Deny", "拒绝")}</button>
          <button className="approveButton" onClick={() => continueAuthorization("allow")}>{tr("Allow access", "允许访问")}</button>
        </div>
      </section>
    </main>
  );
}

function PublicLayout({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: User | null;
}) {
  return (
    <main className="landing publicPage">
      <PublicHeader user={user} />
      {children}
      <footer className="publicFooter">
        <Brand compact />
        <span>© 2026 Remote Arc · MIT</span>
        <div className="footerLinks">
          <a href="/docs/mcp">MCP</a>
          <a href="/pricing">Pricing</a>
          <a href="/resources">Resources</a>
          <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
        </div>
      </footer>
    </main>
  );
}

function DashboardAccess() {
  const { tr } = useI18n();
  return (
    <PublicLayout>
      <section className="dashboardAccess">
        <div className="dashboardAccessCopy">
          <span className="eyebrow">{tr("REMOTE ARC DASHBOARD", "REMOTE ARC \u63a7\u5236\u53f0")}</span>
          <h1>{tr(
            "Your devices, connections and access policy in one place.",
            "\u5728\u4e00\u4e2a\u9875\u9762\u7ba1\u7406\u8bbe\u5907\u3001\u8fde\u63a5\u4e0e\u8bbf\u95ee\u7b56\u7565\u3002"
          )}</h1>
          <p>{tr(
            "Sign in to pair computers, inspect online state, review usage and connect your AI clients. The public website always remains available at the root domain.",
            "\u767b\u5f55\u540e\u53ef\u914d\u5bf9\u7535\u8111\u3001\u67e5\u770b\u5728\u7ebf\u72b6\u6001\u3001\u7528\u91cf\u4e0e AI \u5ba2\u6237\u7aef\u8fde\u63a5\u3002\u6839\u57df\u540d\u59cb\u7ec8\u4fdd\u7559\u4e3a\u516c\u5f00\u5b98\u7f51\u3002"
          )}</p>
          <a className="primaryButton" href="/auth/google?return_to=/dashboard">
            {tr("Continue with Google", "\u4f7f\u7528 Google \u7ee7\u7eed")} <span>{"\u2192"}</span>
          </a>
        </div>
        <div className="dashboardAccessPreview" aria-hidden="true">
          <div className="previewTop"><span>Remote Arc</span><i>Dashboard</i></div>
          <div className="previewMetricRow">
            <div><small>ONLINE</small><strong>2</strong><span>devices</span></div>
            <div><small>USAGE</small><strong>1.8k</strong><span>/ 10k calls</span></div>
            <div><small>POLICY</small><strong>Safe</strong><span>default mode</span></div>
          </div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>Sam MacBook</strong><span>macOS · online now</span></div><b>Read + Dev</b></div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>SamPC</strong><span>Windows · online now</span></div><b>Developer</b></div>
          <div className="previewActivity"><span>Recent activity</span><strong>read_file</strong><small>Sam MacBook · 12s ago</small></div>
        </div>
      </section>
    </PublicLayout>
  );
}

function Landing({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const command = "npx remote-arc";
  return (
    <PublicLayout user={user}>
      <section className="landingHero">
        <div className="heroCopy">
          <span className="eyebrow">{tr(
            "OPEN SOURCE · SELF-HOSTABLE · REMOTE MCP",
            "\u5f00\u6e90 · \u53ef\u81ea\u6258\u7ba1 · REMOTE MCP"
          )}</span>
          <h1>{tr(
            "Give your AI a secure path to the computers you already use.",
            "\u8ba9 AI \u5b89\u5168\u5730\u8fde\u63a5\u4f60\u771f\u6b63\u5728\u4f7f\u7528\u7684\u7535\u8111\u3002"
          )}</h1>
          <p>{tr(
            "Remote Arc is an open Remote MCP control plane for Windows, macOS and Linux. Pair a computer with one command, connect an MCP-capable AI client once, and keep the final permission boundary on the device.",
            "Remote Arc \u662f\u9762\u5411 Windows\u3001macOS \u548c Linux \u7684\u5f00\u6e90 Remote MCP \u63a7\u5236\u9762\u3002\u4e00\u6761\u547d\u4ee4\u914d\u5bf9\u8bbe\u5907\uff0c\u4e00\u6b21\u8fde\u63a5 MCP \u5ba2\u6237\u7aef\uff0c\u6700\u7ec8\u6743\u9650\u8fb9\u754c\u59cb\u7ec8\u7559\u5728\u672c\u673a\u3002"
          )}</p>
          <div className="landingActions">
            <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>
              {user ? tr("Open dashboard", "\u6253\u5f00\u63a7\u5236\u53f0") : tr("Start free", "\u514d\u8d39\u5f00\u59cb")} <span>{"\u2192"}</span>
            </a>
            <a className="ghostLink" href="#architecture">{tr("View architecture", "\u67e5\u770b\u67b6\u6784")} {"\u2193"}</a>
          </div>
          <div className="heroBadges">
            <span>{tr("Outbound-only device connection", "\u8bbe\u5907\u4ec5\u4e3b\u52a8\u51fa\u7ad9\u8fde\u63a5")}</span>
            <span>OAuth 2.1 + PKCE</span>
            <span>{tr("Self-hostable control plane", "\u63a7\u5236\u9762\u53ef\u81ea\u6258\u7ba1")}</span>
          </div>
        </div>

        <div className="heroConsole">
          <div className="terminalPreview">
            <div className="terminalBar"><div className="terminalDots"><i/><i/><i/></div><span>Terminal</span></div>
            <code>
              <span>$</span> {command}{"\n"}
              <em>Remote Arc</em>{"\n\n"}
              Pairing code: <strong>J7KD-P2QF</strong>{"\n"}
              Opening browser...{"\n\n"}
              <strong>✓ Device authorized</strong>{"\n"}
              <strong>✓ Connected</strong> as Sam MacBook
            </code>
          </div>
          <div className="heroRouteCard">
            <div><span>AI CLIENT</span><strong>MCP request</strong></div>
            <i>{"\u2193"}</i>
            <div><span>REMOTE ARC</span><strong>OAuth + relay</strong></div>
            <i>{"\u2193"}</i>
            <div><span>YOUR DEVICE</span><strong>Local policy decides</strong></div>
          </div>
        </div>
      </section>

      <section className="protocolStrip" aria-label="Remote Arc technology">
        <span>REMOTE MCP</span><i />
        <span>OAUTH 2.1 + PKCE</span><i />
        <span>OUTBOUND WEBSOCKET</span><i />
        <span>PER-DEVICE CREDENTIALS</span><i />
        <span>OPEN SOURCE</span>
      </section>

      <section className="productSection" id="product">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("THE PRODUCT", "\u4ea7\u54c1")}</span>
            <h2>{tr(
              "Remote computer access designed as infrastructure, not a remote-desktop session.",
              "\u628a AI \u8fdc\u7a0b\u8bbf\u95ee\u505a\u6210\u57fa\u7840\u8bbe\u65bd\uff0c\u800c\u4e0d\u662f\u4e00\u6b21\u8fdc\u7a0b\u684c\u9762\u4f1a\u8bdd\u3002"
            )}</h2>
          </div>
          <p>{tr(
            "The AI sees structured MCP tools. Remote Arc handles identity, device routing and policy. Your local agent performs only the capabilities that machine has explicitly advertised.",
            "AI \u770b\u5230\u7684\u662f\u7ed3\u6784\u5316 MCP \u5de5\u5177\u3002Remote Arc \u8d1f\u8d23\u8eab\u4efd\u3001\u8bbe\u5907\u8def\u7531\u548c\u7b56\u7565\uff0c\u672c\u5730 Agent \u53ea\u6267\u884c\u8be5\u8bbe\u5907\u660e\u786e\u58f0\u660e\u7684\u80fd\u529b\u3002"
          )}</p>
        </div>

        <div className="workflowGrid">
          <article>
            <span className="stepIndex">01</span>
            <div className="stepIcon">〉_</div>
            <h3>{tr("Run one command", "\u8fd0\u884c\u4e00\u6761\u547d\u4ee4")}</h3>
            <code>npx remote-arc</code>
            <p>{tr("No repository clone, inbound port, VPN or token copy-paste.", "\u65e0\u9700 clone \u4ed3\u5e93\u3001\u5f00\u653e\u5165\u7ad9\u7aef\u53e3\u3001VPN \u6216\u590d\u5236 Token\u3002")}</p>
          </article>
          <article>
            <span className="stepIndex">02</span>
            <div className="stepIcon">◇</div>
            <h3>{tr("Pair in the browser", "\u5728\u6d4f\u89c8\u5668\u4e2d\u914d\u5bf9")}</h3>
            <p>{tr("A short code links the local agent to your account. The device receives its own credential and connects outbound.", "\u77ed\u914d\u5bf9\u7801\u5c06\u672c\u5730 Agent \u7ed1\u5b9a\u5230\u8d26\u6237\uff0c\u6bcf\u53f0\u8bbe\u5907\u62e5\u6709\u72ec\u7acb\u51ed\u636e\u5e76\u4e3b\u52a8\u51fa\u7ad9\u8fde\u63a5\u3002")}</p>
          </article>
          <article>
            <span className="stepIndex">03</span>
            <div className="stepIcon">MCP</div>
            <h3>{tr("Connect your AI once", "\u53ea\u9700\u8fde\u63a5 AI \u4e00\u6b21")}</h3>
            <code>https://remote.samyao.me/mcp</code>
            <p>{tr("The same Remote MCP endpoint can route authorized requests to any device linked to the account.", "\u540c\u4e00\u4e2a Remote MCP \u7aef\u70b9\u53ef\u628a\u5df2\u6388\u6743\u8bf7\u6c42\u8def\u7531\u5230\u8d26\u6237\u4e0b\u7684\u4efb\u610f\u8bbe\u5907\u3002")}</p>
          </article>
        </div>
      </section>

      <section className="architectureSection" id="architecture">
        <div className="sectionIntro architectureIntro">
          <span className="eyebrow">{tr("ARCHITECTURE", "\u67b6\u6784")}</span>
          <h2>{tr(
            "A small control plane between the AI and your machines.",
            "\u5728 AI \u548c\u4f60\u7684\u8bbe\u5907\u4e4b\u95f4\uff0c\u53ea\u653e\u4e00\u5c42\u6e05\u6670\u7684\u63a7\u5236\u9762\u3002"
          )}</h2>
          <p>{tr(
            "Cloud identity and routing stay separate from local execution. That separation is the core of the security model and the reason the system is self-hostable end to end.",
            "\u4e91\u7aef\u8eab\u4efd\u4e0e\u8def\u7531\u548c\u672c\u5730\u6267\u884c\u5f7b\u5e95\u5206\u79bb\u3002\u8fd9\u4e2a\u8fb9\u754c\u65e2\u662f\u5b89\u5168\u6a21\u578b\u7684\u6838\u5fc3\uff0c\u4e5f\u662f\u6574\u5957\u7cfb\u7edf\u53ef\u7aef\u5230\u7aef\u81ea\u6258\u7ba1\u7684\u57fa\u7840\u3002"
          )}</p>
        </div>

        <div className="architectureDiagram">
          <div className="architectureLane"><small>CLIENT</small><strong>ChatGPT / MCP client</strong><span>Remote MCP tools</span></div>
          <div className="architectureArrow"><b>HTTPS</b><i>{"\u2192"}</i><small>OAuth 2.1 + PKCE</small></div>
          <div className="architectureLane featuredLane"><small>CONTROL PLANE</small><strong>Remote Arc Relay</strong><span>Identity · routing · quota · audit metadata</span></div>
          <div className="architectureArrow"><b>OUTBOUND</b><i>{"\u2192"}</i><small>WebSocket</small></div>
          <div className="architectureLane"><small>DEVICE</small><strong>Remote Arc Agent</strong><span>Local MCP client · capability policy</span></div>
          <div className="architectureArrow"><b>LOCAL</b><i>{"\u2192"}</i><small>stdio / MCP</small></div>
          <div className="architectureLane"><small>EXECUTION</small><strong>Your computer</strong><span>Files · processes · development tools</span></div>
        </div>

        <div className="architectureNotes">
          <span><b>{tr("No inbound device port", "\u8bbe\u5907\u65e0\u9700\u5165\u7ad9\u7aef\u53e3")}</b><small>{tr("The agent initiates the connection.", "Agent \u4e3b\u52a8\u5efa\u7acb\u8fde\u63a5\u3002")}</small></span>
          <span><b>{tr("Cloud cannot invent tools", "\u4e91\u7aef\u4e0d\u80fd\u51ed\u7a7a\u589e\u52a0\u5de5\u5177")}</b><small>{tr("Only device-advertised capabilities can run.", "\u53ea\u80fd\u6267\u884c\u8bbe\u5907\u5df2\u516c\u5e03\u7684\u80fd\u529b\u3002")}</small></span>
          <span><b>{tr("One account, multiple devices", "\u4e00\u4e2a\u8d26\u6237\u7ba1\u7406\u591a\u53f0\u8bbe\u5907")}</b><small>{tr("Identity and routing stay centralized.", "\u8eab\u4efd\u4e0e\u8def\u7531\u96c6\u4e2d\u7ba1\u7406\u3002")}</small></span>
        </div>
      </section>

      <section className="securitySection" id="security">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("SECURITY MODEL", "\u5b89\u5168\u6a21\u578b")}</span>
            <h2>{tr(
              "Access is layered. Execution still ends at a local decision.",
              "\u8bbf\u95ee\u662f\u5206\u5c42\u7684\uff0c\u6267\u884c\u6700\u7ec8\u4ecd\u7531\u672c\u5730\u51b3\u5b9a\u3002"
            )}</h2>
          </div>
          <p>{tr(
            "Remote Arc deliberately separates account authorization from device capability. A valid cloud token is necessary, but it is not sufficient to execute a capability the local device has not exposed.",
            "Remote Arc \u523b\u610f\u628a\u8d26\u6237\u6388\u6743\u548c\u8bbe\u5907\u80fd\u529b\u5206\u5f00\u3002\u6709\u6548\u7684\u4e91\u7aef Token \u662f\u5fc5\u8981\u6761\u4ef6\uff0c\u4f46\u4e0d\u8db3\u4ee5\u8d8a\u8fc7\u672c\u5730\u6ca1\u6709\u5f00\u653e\u7684\u80fd\u529b\u3002"
          )}</p>
        </div>
        <div className="securityGrid">
          <article><span>01</span><h3>{tr("Outbound by default", "\u9ed8\u8ba4\u53ea\u51fa\u7ad9")}</h3><p>{tr("Devices establish their own authenticated socket to the relay. No public IP or port forwarding is required.", "\u8bbe\u5907\u4e3b\u52a8\u5411 Relay \u5efa\u7acb\u8ba4\u8bc1\u8fde\u63a5\uff0c\u65e0\u9700\u516c\u7f51 IP \u6216\u7aef\u53e3\u6620\u5c04\u3002")}</p></article>
          <article><span>02</span><h3>{tr("Per-device credentials", "\u6bcf\u8bbe\u5907\u72ec\u7acb\u51ed\u636e")}</h3><p>{tr("A paired computer gets its own credential and can be revoked independently from the dashboard.", "\u6bcf\u53f0\u5df2\u914d\u5bf9\u8bbe\u5907\u90fd\u6709\u72ec\u7acb\u51ed\u636e\uff0c\u53ef\u5728\u63a7\u5236\u53f0\u4e2d\u5355\u72ec\u64a4\u9500\u3002")}</p></article>
          <article><span>03</span><h3>{tr("Scoped AI authorization", "\u5206\u8303\u56f4 AI \u6388\u6743")}</h3><p><code>devices:read</code> <code>computer:read</code> <code>computer:write</code></p></article>
          <article><span>04</span><h3>{tr("Minimal audit surface", "\u6700\u5c0f\u5ba1\u8ba1\u9762")}</h3><p>{tr("Hosted audit events record operational metadata such as device, tool and outcome, not file contents or command arguments.", "\u6258\u7ba1\u5ba1\u8ba1\u53ea\u8bb0\u5f55\u8bbe\u5907\u3001\u5de5\u5177\u548c\u7ed3\u679c\u7b49\u8fd0\u884c\u5143\u6570\u636e\uff0c\u4e0d\u8bb0\u5f55\u6587\u4ef6\u5185\u5bb9\u6216\u547d\u4ee4\u53c2\u6570\u3002")}</p></article>
        </div>
      </section>

      <section className="useCasesSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("BUILT FOR REAL WORK", "\u9762\u5411\u771f\u5b9e\u5de5\u4f5c\u6d41")}</span>
          <h2>{tr(
            "One connection layer for the machines where your work already lives.",
            "\u4e00\u5c42\u8fde\u63a5\uff0c\u8986\u76d6\u4f60\u5de5\u4f5c\u771f\u6b63\u6240\u5728\u7684\u8bbe\u5907\u3002"
          )}</h2>
        </div>
        <div className="useCaseGrid">
          <article><div>⌨</div><h3>{tr("Developer workstation", "\u5f00\u53d1\u5de5\u4f5c\u7ad9")}</h3><p>{tr("Inspect repositories, edit files, run builds and work with local development tools.", "\u67e5\u770b\u4ed3\u5e93\u3001\u7f16\u8f91\u6587\u4ef6\u3001\u8fd0\u884c\u6784\u5efa\uff0c\u8c03\u7528\u672c\u5730\u5f00\u53d1\u5de5\u5177\u3002")}</p></article>
          <article><div>□</div><h3>{tr("File workflows", "\u6587\u4ef6\u5de5\u4f5c\u6d41")}</h3><p>{tr("Read project files, inspect directories and move work between AI reasoning and the filesystem.", "\u8bfb\u53d6\u9879\u76ee\u6587\u4ef6\u3001\u67e5\u770b\u76ee\u5f55\uff0c\u5728 AI \u63a8\u7406\u4e0e\u672c\u5730\u6587\u4ef6\u7cfb\u7edf\u4e4b\u95f4\u8854\u63a5\u5de5\u4f5c\u3002")}</p></article>
          <article><div>▷</div><h3>{tr("Remote operations", "\u8fdc\u7a0b\u8fd0\u7ef4")}</h3><p>{tr("Inspect process state and execute development commands without opening a general-purpose remote shell to the internet.", "\u67e5\u770b\u8fdb\u7a0b\u72b6\u6001\u5e76\u6267\u884c\u5f00\u53d1\u547d\u4ee4\uff0c\u65e0\u9700\u628a\u901a\u7528\u8fdc\u7a0b Shell \u66b4\u9732\u5230\u516c\u7f51\u3002")}</p></article>
          <article><div>◎</div><h3>{tr("Multi-device setup", "\u591a\u8bbe\u5907")}</h3><p>{tr("Keep Windows, Mac and Linux machines under one account while each computer keeps its own policy.", "\u5728\u540c\u4e00\u8d26\u6237\u4e0b\u7ba1\u7406 Windows\u3001Mac \u548c Linux\uff0c\u540c\u65f6\u4fdd\u7559\u6bcf\u53f0\u8bbe\u5907\u81ea\u5df1\u7684\u6743\u9650\u7b56\u7565\u3002")}</p></article>
        </div>
      </section>

      <section className="differenceSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("HOSTED OR SELF-HOSTED", "\u6258\u7ba1\u6216\u81ea\u6258\u7ba1")}</span>
          <h2>{tr(
            "Managed convenience without making the hosted service your only exit.",
            "\u4eab\u53d7\u6258\u7ba1\u4fbf\u5229\uff0c\u4f46\u4e0d\u628a\u81ea\u5df1\u9501\u5728\u6258\u7ba1\u5e73\u53f0\u91cc\u3002"
          )}</h2>
          <p>{tr(
            "Use Remote Arc's hosted relay when you want zero ops. Run the control plane in your own Cloudflare account when ownership, policy or scale matters more.",
            "\u60f3\u96f6\u8fd0\u7ef4\u65f6\u7528 Remote Arc \u6258\u7ba1 Relay\uff1b\u66f4\u5728\u610f\u6240\u6709\u6743\u3001\u7b56\u7565\u6216\u89c4\u6a21\u65f6\uff0c\u76f4\u63a5\u5728\u81ea\u5df1\u7684 Cloudflare \u8d26\u6237\u4e2d\u8fd0\u884c\u63a7\u5236\u9762\u3002"
          )}</p>
        </div>
        <div className="comparisonGrid">
          <div className="comparisonHead"><span></span><strong>Remote Arc</strong><strong>{tr("Hosted-only connector", "\u7eaf\u6258\u7ba1\u8fde\u63a5\u5668")}</strong></div>
          {[
            [tr("Control plane", "\u63a7\u5236\u9762"), tr("Hosted or self-hosted", "\u6258\u7ba1\u6216\u81ea\u6258\u7ba1"), tr("Provider-owned", "\u5e73\u53f0\u6301\u6709")],
            [tr("AI clients", "AI \u5ba2\u6237\u7aef"), tr("Standards-based Remote MCP", "\u57fa\u4e8e\u6807\u51c6 Remote MCP"), tr("Often product-specific", "\u901a\u5e38\u7ed1\u5b9a\u7279\u5b9a\u4ea7\u54c1")],
            [tr("Device permissions", "\u8bbe\u5907\u6743\u9650"), tr("Final boundary stays local", "\u6700\u7ec8\u8fb9\u754c\u7559\u5728\u672c\u673a"), tr("Cloud policy first", "\u4e91\u7aef\u7b56\u7565\u4f18\u5148")],
            [tr("Exit path", "\u9000\u51fa\u8def\u5f84"), tr("Fork, deploy, keep running", "Fork\u3001\u90e8\u7f72\u3001\u7ee7\u7eed\u8fd0\u884c"), tr("Migration required", "\u9700\u8981\u8fc1\u79fb")],
            [tr("Free hosted usage", "\u514d\u8d39\u6258\u7ba1\u989d\u5ea6"), tr("10,000 tool calls / month", "\u6bcf\u6708 10,000 \u6b21\u5de5\u5177\u8c03\u7528"), tr("Depends on provider", "\u53d6\u51b3\u4e8e\u5e73\u53f0")],
          ].map(([label, ours, other]) => (
            <div className="comparisonRow" key={label}>
              <span>{label}</span><strong>✓ {ours}</strong><em>{other}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboardShowcase">
        <div className="dashboardShowcaseCopy">
          <span className="eyebrow">{tr("CONTROL WITHOUT THE TERMINAL", "\u4e0d\u7528\u7ec8\u7aef\u4e5f\u80fd\u638c\u63a7")}</span>
          <h2>{tr(
            "A dedicated dashboard for devices, access and usage.",
            "\u72ec\u7acb\u63a7\u5236\u53f0\uff0c\u7ba1\u7406\u8bbe\u5907\u3001\u8bbf\u95ee\u4e0e\u7528\u91cf\u3002"
          )}</h2>
          <p>{tr(
            "The dashboard is intentionally separate from the public website. Return to the root domain any time and the product site remains the product site.",
            "\u63a7\u5236\u53f0\u4e0e\u516c\u5f00\u5b98\u7f51\u660e\u786e\u5206\u79bb\u3002\u4efb\u4f55\u65f6\u5019\u56de\u5230\u6839\u57df\u540d\uff0c\u770b\u5230\u7684\u90fd\u4ecd\u7136\u662f\u4ea7\u54c1\u5b98\u7f51\u3002"
          )}</p>
          <a className="ghostLink" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>
            {user ? tr("Open dashboard", "\u6253\u5f00\u63a7\u5236\u53f0") : tr("Sign in to dashboard", "\u767b\u5f55\u63a7\u5236\u53f0")} {"\u2192"}
          </a>
        </div>
        <div className="dashboardMock" aria-hidden="true">
          <div className="mockSidebar"><Brand compact /><span className="active">Overview</span><span>Devices</span><span>Connect</span><span>Security</span><span>Settings</span></div>
          <div className="mockMain">
            <div className="mockTitle"><div><small>OVERVIEW</small><strong>Your Remote Arc</strong></div><span>2 devices online</span></div>
            <div className="mockMetrics"><article><small>DEVICES</small><strong>3</strong><span>2 online</span></article><article><small>TOOL CALLS</small><strong>1,842</strong><span>of 10,000</span></article><article><small>POLICY</small><strong>Safe</strong><span>default</span></article></div>
            <div className="mockDeviceRow"><i/><div><strong>Sam MacBook</strong><span>macOS · online</span></div><b>Developer</b></div>
            <div className="mockDeviceRow"><i/><div><strong>SamPC</strong><span>Windows · online</span></div><b>Developer</b></div>
          </div>
        </div>
      </section>

      <section className="ctaStrip">
        <div>
          <span className="eyebrow">{tr("HOSTED FREE", "\u6258\u7ba1\u514d\u8d39\u7248")}</span>
          <h2>{tr(
            "Start with 10,000 hosted tool calls each month.",
            "\u6bcf\u6708 10,000 \u6b21\u6258\u7ba1\u5de5\u5177\u8c03\u7528\u8d77\u6b65\u3002"
          )}</h2>
          <p>{tr(
            "Or self-host the same control plane when you want to own the entire path.",
            "\u5f53\u4f60\u5e0c\u671b\u5b8c\u5168\u62e5\u6709\u6574\u6761\u8def\u5f84\u65f6\uff0c\u4e5f\u53ef\u76f4\u63a5\u81ea\u6258\u7ba1\u540c\u4e00\u5957\u63a7\u5236\u9762\u3002"
          )}</p>
        </div>
        <div className="ctaActions">
          <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>
            {user ? tr("Open dashboard", "\u6253\u5f00\u63a7\u5236\u53f0") : tr("Start free", "\u514d\u8d39\u5f00\u59cb")}
          </a>
          <a className="ghostLink" href="/pricing">{tr("View pricing", "\u67e5\u770b\u4ef7\u683c")}</a>
        </div>
      </section>
    </PublicLayout>
  );
}

function PricingPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">{tr("PRICING", "价格")}</span>
        <h1>{tr("Start free. Keep an exit door.", "免费开始，也永远保留退出与自托管的自由。")}</h1>
        <p>{tr("Hosted Remote Arc gives every account 10,000 tool calls per month. The open-source self-hosted edition can run without a Remote Arc usage cap.", "Remote Arc 托管版每个账户每月包含 10,000 次工具调用；开源自托管版本可以不受 Remote Arc 调用额度限制。")}</p>
      </section>
      <section className="pricingGrid">
        <article className="priceCard featured">
          <span className="planTag">{tr("HOSTED FREE", "托管免费版")}</span>
          <h2>$0 <small>/ {tr("month", "月")}</small></h2>
          <p>{tr("For personal use and everyday AI workflows.", "适合个人使用与日常 AI 工作流。")}</p>
          <ul>
            <li>{tr("10,000 tool calls / month", "每月 10,000 次工具调用")}</li>
            <li>{tr("Multiple personal devices", "支持多台个人设备")}</li>
            <li>{tr("Google sign-in and OAuth MCP", "Google 登录与 OAuth MCP")}</li>
            <li>{tr("ChatGPT + compatible MCP clients", "ChatGPT + 兼容 MCP 客户端")}</li>
          </ul>
          <a className="primaryButton goldButton" href="/auth/google?return_to=/dashboard">{tr("Start free", "免费开始")}</a>
        </article>
        <article className="priceCard">
          <span className="planTag">{tr("SELF-HOSTED", "自托管")}</span>
          <h2>$0 <small>{tr("software", "软件")}</small></h2>
          <p>{tr("Run the control plane on your own Cloudflare account and domain.", "把控制面部署到你自己的 Cloudflare 账户与域名。")}</p>
          <ul>
            <li>{tr("No Remote Arc usage cap", "不受 Remote Arc 调用额度限制")}</li>
            <li>{tr("Open-source MIT codebase", "MIT 开源代码")}</li>
            <li>{tr("Own relay, D1 and device routing", "掌握 Relay、D1 与设备路由")}</li>
            <li>{tr("Bring your own infrastructure", "使用你自己的基础设施")}</li>
          </ul>
          <a className="ghostButton priceLink" href="https://github.com/yaohuangguan/remote-arc">{tr("View source", "查看源码")}</a>
        </article>
        <article className="priceCard">
          <span className="planTag">{tr("PRO", "PRO")}</span>
          <h2>{tr("Coming soon", "即将推出")}</h2>
          <p>{tr("For heavier hosted usage and convenience features.", "适合高频托管使用与更多便利功能。")}</p>
          <ul>
            <li>{tr("Higher or unlimited hosted usage", "更高或无限托管额度")}</li>
            <li>{tr("Priority relay and support", "优先 Relay 与支持")}</li>
            <li>{tr("Advanced device policies", "高级设备权限策略")}</li>
            <li>{tr("Team features", "团队功能")}</li>
          </ul>
        </article>
      </section>
    </PublicLayout>
  );
}

function ResourcesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const items = [
    [tr("Quick start", "快速开始"), tr("Pair a computer with one command and connect it to the hosted relay.", "一条命令配对电脑并连接到托管 Relay。"), "/docs/mcp"],
    [tr("Architecture", "架构"), tr("Understand Worker, D1, Durable Objects, device agents and the local execution core.", "了解 Worker、D1、Durable Objects、设备 Agent 与本地执行核心。"), "https://github.com/yaohuangguan/remote-arc"],
    [tr("Security model", "安全模型"), tr("Per-device credentials, local permissions, OAuth scopes and privacy-preserving audit.", "每设备凭证、本机权限、OAuth Scope 与隐私审计。"), "https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md"],
    [tr("Source code", "源代码"), tr("Remote Arc is open source under the MIT license.", "Remote Arc 采用 MIT 许可证开源。"), "https://github.com/yaohuangguan/remote-arc"],
  ];
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">{tr("RESOURCES", "资源")}</span>
        <h1>{tr("Build, inspect and self-host.", "搭建、理解，并自托管。")}</h1>
        <p>{tr("Remote Arc is designed to be understandable infrastructure, not a black box.", "Remote Arc 希望成为你能理解、能修改、能掌控的基础设施，而不是黑盒。")}</p>
      </section>
      <section className="resourceGrid">
        {items.map(([title, body, href]) => (
          <a className="resourceCard" href={href} key={title}>
            <span>↗</span><h2>{title}</h2><p>{body}</p>
          </a>
        ))}
      </section>
    </PublicLayout>
  );
}

function McpPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">REMOTE MCP</span>
        <h1>{tr("One MCP endpoint. All your computers.", "一个 MCP 端点，连接你的所有电脑。")}</h1>
        <p>{tr("Remote Arc exposes a standards-based Remote MCP endpoint protected by OAuth 2.1 + PKCE, then routes each call to the device you choose.", "Remote Arc 提供基于标准的 Remote MCP 端点，通过 OAuth 2.1 + PKCE 保护，并把每次调用路由到你指定的设备。")}</p>
      </section>
      <section className="mcpDocsGrid">
        <article className="docsCard wideDocs">
          <span className="eyebrow">{tr("ENDPOINT", "端点")}</span>
          <code className="heroCode">https://remote.samyao.me/mcp</code>
          <p>{tr("Add this once in ChatGPT Developer Mode. Remote Arc handles OAuth discovery, sign-in and device routing.", "在 ChatGPT Developer Mode 中添加一次即可。Remote Arc 会处理 OAuth 发现、登录与设备路由。")}</p>
        </article>
        <article className="docsCard"><h2>{tr("Scopes", "权限范围")}</h2><code>devices:read</code><code>computer:read</code><code>computer:write</code></article>
        <article className="docsCard"><h2>{tr("Core tools", "核心工具")}</h2><code>list_devices</code><code>read_file</code><code>write_file</code><code>start_process</code></article>
        <article className="docsCard"><h2>{tr("Device install", "设备安装")}</h2><code>npx remote-arc</code><p>{tr("Pair in the browser, then the CLI keeps an outbound connection to the relay.", "浏览器完成配对后，CLI 会保持到 Relay 的出站连接。")}</p></article>
        <article className="docsCard"><h2>{tr("Local control", "本机控制")}</h2><p>{tr("Safe and developer permission modes determine which tools a device advertises.", "Safe 与 Developer 权限模式决定设备实际开放哪些工具。")}</p></article>
      </section>
    </PublicLayout>
  );
}

function Metric({ label, value, detail, good = false }: { label: string; value: React.ReactNode; detail: string; good?: boolean }) {
  return (
    <article className="metricCard">
      <div className="metricTop"><span>{label}</span><i className={"statusDot " + (good ? "good" : "")}/></div>
      <strong>{value}</strong><small>{detail}</small>
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
  const { tr, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const [showAdd, setShowAdd] = useState(false);
  const [active, setActive] = useState<DashboardTab>("overview");
  const command = "npx remote-arc";
  const safeCommand = command + " --safe";
  const mcpEndpoint = location.origin + "/mcp";
  const deviceNameById = useMemo(() => new Map(devices.map((device) => [device.id, device.name])), [devices]);

  const usage = status?.usage;
  const usagePct = usage?.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  async function revoke(deviceId: string) {
    if (!confirm(tr("Revoke this device? It will need to pair again.", "撤销此设备？之后需要重新配对。"))) return;
    await fetch("/api/devices/" + encodeURIComponent(deviceId) + "/revoke", { method: "POST" });
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = prompt(tr("Device name", "设备名称"), device.name)?.trim();
    if (!next || next === device.name) return;
    await fetch("/api/devices/" + encodeURIComponent(device.id) + "/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await refreshAll();
  }

  const eventLabel = (event: AuditEvent) => {
    if (event.event_type === "device.paired") return tr("Device paired", "设备已配对");
    if (event.event_type === "device.revoked") return tr("Device revoked", "设备已撤销");
    if (event.event_type === "device.renamed") return tr("Device renamed", "设备已重命名");
    if (event.event_type === "mcp.tool_call") return "MCP · " + (event.tool_name || "tool");
    return event.event_type;
  };

  const navItems: Array<[DashboardTab, string, string]> = [
    ["overview", "⌂", tr("Overview", "概览")],
    ["devices", "▣", tr("Devices", "设备")],
    ["connect", "↗", tr("Connect AI", "连接 AI")],
    ["security", "◇", tr("Security", "安全")],
    ["settings", "⚙", tr("Settings", "设置")],
  ];

  return (
    <div className="appFrame">
      <aside className="sidebar">
        <Brand />
        <nav className="sideNav">
          {navItems.map(([id, icon, label]) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebarStatus"><div className="livePulse"/><div><strong>{tr("Relay online", "Relay 在线")}</strong><span>remote.samyao.me</span></div></div>
        <div className="sidebarAccount">
          {user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <div className="avatarFallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>}
          <div><strong>{user.name || "Owner"}</strong><span>{user.email}</span></div>
          <button onClick={() => void signOut()} title={tr("Sign out", "退出登录")}>↪</button>
        </div>
      </aside>

      <main className="dashboardMain">
        <header className="mobileTopbar"><Brand/><button className="addButton compact" onClick={() => setShowAdd(true)}>+ {tr("Device", "设备")}</button></header>

        {active === "overview" && (
          <>
            <section className="pageHeader">
              <div><span className="eyebrow">{tr("YOUR AI CONTROL PLANE", "你的 AI 控制面")}</span><h1>{tr("Your machines, ready when AI calls.", "AI 一开口，你的设备就绪。")}</h1><p>{tr("One account, multiple computers, one standards-based Remote MCP endpoint.", "一个账户，多台设备，一个标准 Remote MCP 端点。")}</p></div>
              <button className="addButton goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
            </section>
            <section className="metricsGrid">
              <Metric label={tr("Online now", "当前在线")} value={status?.onlineDevices ?? 0} detail={tr("Ready for MCP calls", "可接受 MCP 调用")} good />
              <Metric label={tr("Linked devices", "已连接设备")} value={status?.totalDevices ?? devices.length} detail="Windows · macOS · Linux" />
              <Metric label={tr("This month", "本月调用")} value={usage?.unlimited ? "∞" : (usage?.used ?? 0).toLocaleString()} detail={usage?.unlimited ? tr("Self-hosted unlimited", "自托管无限制") : tr("of 10,000 hosted calls", "共 10,000 次托管额度")} good />
              <Metric label="Remote MCP" value={tr("Ready", "就绪")} detail="OAuth 2.1 + PKCE" good />
            </section>

            <section className="usagePanel">
              <div><span className="eyebrow">{tr("MONTHLY USAGE", "每月用量")}</span><h2>{usage?.unlimited ? tr("Unlimited", "无限") : `${(usage?.used ?? 0).toLocaleString()} / ${(usage?.limit ?? 10000).toLocaleString()}`}</h2><p>{tr("Each remote MCP tool invocation counts as one tool call.", "每次 Remote MCP 工具调用计为一次调用。")}</p></div>
              {!usage?.unlimited && <div className="usageBar"><i style={{ width: usagePct + "%" }}/></div>}
            </section>

            <section className="contentGrid">
              <div className="panelBlock">
                <div className="blockHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Connected computers", "已连接电脑")}</h2></div><button className="ghostButton" onClick={() => setActive("devices")}>{tr("View all", "查看全部")}</button></div>
                <div className="compactDeviceList">
                  {devices.slice(0,4).map((device) => (
                    <button className="compactDevice" key={device.id} onClick={() => setActive("devices")}>
                      <div className="deviceIcon">{platformGlyph(device.platform)}</div>
                      <div className="compactDeviceText"><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.tools.length} tools</span></div>
                      <span className={"badge " + device.status}><i/>{device.status}</span>
                    </button>
                  ))}
                  {!devices.length && <button className="compactDevice empty" onClick={() => setShowAdd(true)}><div className="deviceIcon">＋</div><div className="compactDeviceText"><strong>{tr("Add your first computer", "添加第一台电脑")}</strong><span>{tr("One command, then approve in your browser", "一条命令，然后在浏览器确认")}</span></div></button>}
                </div>
              </div>

              <div className="panelBlock">
                <div className="blockHeader"><div><span className="eyebrow">{tr("ACTIVITY", "活动")}</span><h2>{tr("Recent activity", "最近活动")}</h2></div><span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span></div>
                <div className="activityList">
                  {(status?.recentActivity || []).map((event) => (
                    <div className="activityItem" key={event.id}><i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i><div><strong>{eventLabel(event)}</strong><span>{event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}</span></div></div>
                  ))}
                  {!status?.recentActivity?.length && <div className="activityEmpty"><strong>{tr("No activity yet", "暂无活动")}</strong><span>{tr("Pair a device or call a tool from your AI client.", "配对设备或从 AI 客户端发起工具调用。")}</span></div>}
                </div>
              </div>
            </section>

            <section className="connectBanner">
              <div className="connectIcon">↗</div><div><span className="eyebrow">CHATGPT</span><h2>{tr("Connect once. Then just talk.", "连接一次，之后直接对话。")}</h2><p>{tr("Add the endpoint in Developer Mode. OAuth handles the rest.", "在 Developer Mode 添加端点，剩下交给 OAuth。")}</p></div>
              <div className="connectBannerActions"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/><button className="ghostButton" onClick={() => setActive("connect")}>{tr("Setup", "设置")}</button></div>
            </section>
          </>
        )}

        {active === "devices" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h1>{tr("Your computers.", "你的电脑。")}</h1><p>{tr("Each device has its own revocable credential and local permission policy.", "每台设备都有独立可撤销凭证与本机权限策略。")}</p></div><button className="addButton goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button></section>
            <div className="deviceGrid rich">
              {devices.map((device) => (
                <article className="deviceCard" key={device.id}>
                  <div className="deviceTop"><div className="deviceIdentity"><div className="deviceIcon large">{platformGlyph(device.platform)}</div><div><h3>{device.name}</h3><span>{platformLabel(device.platform)} · {device.arch || "unknown"}</span></div></div><span className={"badge " + device.status}><i/>{device.status}</span></div>
                  <div className="deviceMetaGrid"><div><span>Hostname</span><strong>{device.hostname || "—"}</strong></div><div><span>Tools</span><strong>{device.tools.length}</strong></div><div><span>{tr("Last seen", "最后在线")}</span><strong>{timeAgo(device.last_seen)}</strong></div><div><span>Device ID</span><strong>{device.id.slice(0,8)}</strong></div></div>
                  <div className="toolPills">{device.tools.slice(0,5).map((tool) => <span key={tool}>{tool}</span>)}{device.tools.length > 5 && <span>+{device.tools.length - 5}</span>}{!device.tools.length && <span>{tr("Offline — capabilities hidden", "离线 — 能力暂不可见")}</span>}</div>
                  <div className="deviceActions"><button className="ghostButton" onClick={() => void rename(device)}>{tr("Rename", "重命名")}</button><CopyButton value={device.id} label={tr("Copy ID", "复制 ID")}/><button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Revoke", "撤销")}</button></div>
                </article>
              ))}
              {!devices.length && <article className="emptyCard wide"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button onClick={() => setShowAdd(true)}>{tr("Add your first device", "添加第一台设备")}</button></article>}
            </div>
          </>
        )}

        {active === "connect" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span><h1>{tr("One endpoint for every machine.", "一个端点，连接所有设备。")}</h1><p>{tr("Remote Arc exposes a standards-based Remote MCP protected by OAuth 2.1 + PKCE.", "Remote Arc 提供由 OAuth 2.1 + PKCE 保护的标准 Remote MCP。")}</p></div></section>
            <section className="setupGrid">
              <article className="setupCard featured"><span className="stepNumber">01</span><div><span className="eyebrow">REMOTE MCP URL</span><h2>{tr("Add Remote Arc to ChatGPT", "把 Remote Arc 添加到 ChatGPT")}</h2><p>{tr("In ChatGPT Developer Mode, create a Remote MCP connection with this endpoint.", "在 ChatGPT Developer Mode 中使用此端点创建 Remote MCP 连接。")}</p><div className="endpointRow large"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/></div></div></article>
              <article className="setupCard"><span className="stepNumber">02</span><div><h2>{tr("Authorize with Google", "使用 Google 授权")}</h2><p>{tr("ChatGPT discovers Remote Arc OAuth and links to the same account.", "ChatGPT 会发现 Remote Arc OAuth，并绑定到同一个账户。")}</p><div className="scopeList"><span>devices:read</span><span>computer:read</span><span>computer:write</span></div></div></article>
              <article className="setupCard"><span className="stepNumber">03</span><div><h2>{tr("Talk naturally", "直接自然语言操作")}</h2><p>{tr("Address a device by name. Remote Arc handles routing.", "直接说设备名称，Remote Arc 会处理路由。")}</p><div className="promptExamples"><code>{tr("“List the projects on my Mac.”", "“看看我 Mac 上有哪些项目。”")}</code><code>{tr("“Run the tests on SamPC.”", "“在 SamPC 上跑测试。”")}</code></div></div></article>
            </section>
          </>
        )}

        {active === "security" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("SECURITY", "安全")}</span><h1>{tr("Control stays local.", "控制权留在本机。")}</h1><p>{tr("The relay routes requests. Your device remains the final execution and permission boundary.", "Relay 负责路由，请求最终是否执行仍由你的设备和本机权限决定。")}</p></div></section>
            <section className="securityGrid">
              {[
                [tr("Per-device credentials", "每设备独立凭证"), tr("Every computer has a unique revocable credential. Only hashes are stored in D1.", "每台电脑拥有独立可撤销凭证，D1 只保存哈希。")],
                [tr("Outbound-only", "仅出站连接"), tr("No inbound port, VPN or public IP is required.", "无需入站端口、VPN 或公网 IP。")],
                ["OAuth 2.1 + PKCE", tr("Short-lived access tokens and explicit scopes protect Remote MCP.", "短期 Access Token 与明确 Scope 保护 Remote MCP。")],
                [tr("Privacy-preserving audit", "隐私审计"), tr("Tool name, device, success and time are logged — never file contents or command arguments.", "仅记录工具名、设备、结果与时间，不记录文件内容或命令参数。")],
                [tr("Local permission modes", "本机权限模式"), tr("Safe and Developer modes define the tools the device actually exposes.", "Safe 与 Developer 模式定义设备实际开放的工具。")],
                [tr("Self-hostable", "可自托管"), tr("Run the relay and identity database in your own Cloudflare account.", "Relay 与身份数据库可以部署在你自己的 Cloudflare 账户。")],
              ].map(([title, body]) => <article className="securityCard" key={title}><span className="securityIcon">◇</span><h2>{title}</h2><p>{body}</p><span className="securityState good">{tr("Enabled", "已启用")}</span></article>)}
            </section>
          </>
        )}

        {active === "settings" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("SETTINGS", "设置")}</span><h1>{tr("Make Remote Arc yours.", "把 Remote Arc 调成你喜欢的样子。")}</h1><p>{tr("Language, plan information and account preferences.", "语言、套餐信息与账户偏好。")}</p></div></section>
            <section className="settingsGrid">
              <article className="settingsCard"><div><h2>{tr("Language", "语言")}</h2><p>{tr("Changes apply immediately and are saved in this browser.", "修改后立即生效，并保存在当前浏览器。")}</p></div><div className="languageSetting"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button><button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Light is the default. You can switch to Dark or follow your system.", "默认使用浅色模式，也可以切换深色或跟随系统。")}</p></div><div className="languageSetting"><button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>{tr("Light", "浅色")}</button><button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>{tr("Dark", "深色")}</button><button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>{tr("System", "跟随系统")}</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Hosted plan", "托管方案")}</h2><p>{tr("Free includes 10,000 Remote MCP tool calls each UTC month.", "免费版每个 UTC 月包含 10,000 次 Remote MCP 工具调用。")}</p></div><div className="planValue">{usage?.unlimited ? "∞" : `${usage?.used ?? 0} / ${usage?.limit ?? 10000}`}</div></article>
              <article className="settingsCard"><div><h2>{tr("Self-hosting", "自托管")}</h2><p>{tr("Set MONTHLY_TOOL_CALL_LIMIT=0 on your own deployment for unlimited calls.", "在自己的部署中设置 MONTHLY_TOOL_CALL_LIMIT=0 即可取消调用额度限制。")}</p></div><a className="ghostButton" href="https://github.com/yaohuangguan/remote-arc">{tr("Open GitHub", "打开 GitHub")}</a></article>
            </section>
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · remote.samyao.me</span><div><a href="/pricing">{tr("Pricing", "价格")}</a><a href="/resources">{tr("Resources", "资源")}</a><a href="/docs/mcp">MCP</a></div></footer>
      </main>

      {showAdd && (
        <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
            <span className="eyebrow">{tr("ADD A DEVICE", "添加设备")}</span>
            <h2>{tr("Connect a computer in one command.", "一条命令连接电脑。")}</h2>
            <p>{tr("No repository clone, environment file, token copy, public IP or router configuration.", "无需 clone 仓库、环境文件、复制 Token、公网 IP 或路由器配置。")}</p>
            <div className="commandLabel">{tr("Developer mode · recommended", "Developer 模式 · 推荐")}</div>
            <div className="commandBox"><code>{command}</code><CopyButton value={command}/></div>
            <div className="commandLabel secondary">{tr("Read-oriented safe mode", "偏只读的 Safe 模式")}</div>
            <div className="commandBox muted"><code>{safeCommand}</code><CopyButton value={safeCommand}/></div>
            <div className="onboardingSteps">
              <div><b>1</b><span><strong>{tr("Run the command", "运行命令")}</strong><small>Terminal / PowerShell · Node.js 20+</small></span></div>
              <div><b>2</b><span><strong>{tr("Match the pairing code", "确认配对码")}</strong><small>{tr("The browser opens automatically", "浏览器会自动打开")}</small></span></div>
              <div><b>3</b><span><strong>{tr("Authorize the computer", "授权电脑")}</strong><small>{tr("It appears here after connecting", "连接后会自动出现在这里")}</small></span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function App() {
  const { tr } = useI18n();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  async function loadMe() {
    const response = await fetch("/api/me");
    if (!response.ok) return setUser(null);
    const payload = (await response.json()) as { user: User };
    setUser(payload.user);
  }

  async function loadAll() {
    const [devicesResponse, statusResponse] = await Promise.all([fetch("/api/devices"), fetch("/api/status")]);
    if (devicesResponse.ok) setDevices((await devicesResponse.json()) as Device[]);
    if (statusResponse.ok) setStatus((await statusResponse.json()) as ProductStatus);
  }

  async function signOut() {
    await fetch("/auth/logout", { method: "POST" });
    setUser(null); setDevices([]); setStatus(null);
  }

  useEffect(() => { void loadMe(); }, []);
  useEffect(() => {
    if (!user) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadAll();
    };
    void loadAll();
    const timer = window.setInterval(refreshIfVisible, 30_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [user?.id]);

  if (location.pathname === "/device") return <PairDevice user={user} onSignedIn={loadMe} />;
  if (location.pathname === "/oauth/consent") return <OAuthConsent user={user} />;
  if (location.pathname === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (location.pathname === "/resources") return <ResourcesPage user={user === undefined ? null : user} />;
  if (location.pathname === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;

  if (location.pathname === "/dashboard") {
    if (user === undefined) {
      return <CenteredCard
        title={tr("Loading…", "\u52a0\u8f7d\u4e2d\u2026")}
        body={tr("Connecting to Remote Arc.", "\u6b63\u5728\u8fde\u63a5 Remote Arc\u3002")}
      />;
    }
    if (!user) return <DashboardAccess />;
    return <Dashboard user={user} devices={devices} status={status} refreshAll={loadAll} signOut={signOut} />;
  }

  return <Landing user={user === undefined ? null : user} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider><App /></I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
