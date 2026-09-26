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
  available_tools?: string[];
  allowed_tools?: string[] | null;
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

const MARKETING_ORIGIN = "https://remotearc.app";
const APP_ORIGIN = "https://mcp.remotearc.app";
const MCP_ENDPOINT = APP_ORIGIN + "/mcp";
const DASHBOARD_PATHS: Record<DashboardTab, string> = {
  overview: "/overview",
  devices: "/devices",
  connect: "/connect",
  security: "/security",
  settings: "/settings",
};
const dashboardTabFromPath = (pathname: string): DashboardTab =>
  (Object.entries(DASHBOARD_PATHS).find(([, path]) => path === pathname)?.[0] as DashboardTab | undefined) || "overview";

const DEVICE_TOOL_CATALOG = [
  "read_file",
  "write_file",
  "list_directory",
  "get_file_info",
  "edit_block",
  "start_process",
  "list_processes",
] as const;

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

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={className}
      src="/remote-arc.svg"
      alt="Remote Arc"
      width="64"
      height="64"
    />
  );
}
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className={"brand" + (compact ? " compactBrand" : "")}>
      <LogoMark className="brandLogo" />
      <span className="brandWords">
        <b>Remote</b><b>Arc</b>
      </span>
    </a>
  );
}

function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (!compact) {
    return (
      <div className="languageSetting themeSetting">
        <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>{tr("Light", "浅色")}</button>
        <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>{tr("Dark", "深色")}</button>
        <button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>{tr("System", "跟随系统")}</button>
      </div>
    );
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      className="themeSwitch compact"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={resolvedTheme === "dark" ? tr("Switch to light mode", "切换到浅色模式") : tr("Switch to dark mode", "切换到深色模式")}
      title={resolvedTheme === "dark" ? tr("Light mode", "浅色模式") : tr("Dark mode", "深色模式")}
    >
      <span aria-hidden="true">{resolvedTheme === "dark" ? "☼" : "◐"}</span>
    </button>
  );
}
function PublicHeader({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <header className="landingNav publicNav">
      <Brand />
      <nav className="publicNavLinks">
        <a href="/#how-it-works">{tr("How it works", "如何使用")}</a>
        <a href={MARKETING_ORIGIN + "/docs/mcp"}>{tr("MCP", "MCP")}</a>
        <a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a>
        <a href={MARKETING_ORIGIN + "/resources"}>{tr("Resources", "资源")}</a>
        <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
      </nav>
      <div className="publicNavActions">
        <ThemeSwitcher compact />
        {user ? (
          <a className="navDashboard" href={APP_ORIGIN + "/overview"}>{tr("Dashboard", "控制台")} <span>↗</span></a>
        ) : (
          <a className="navLogin" href={APP_ORIGIN + "/auth/google?return_to=/overview"}>{tr("Sign in", "登录")}</a>
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
        <a className="secondaryLink" href="/">{tr("Back to dashboard", "返回控制台")}</a>
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
        <span>© 2026 Remote Arc · Proprietary</span>
        <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
      </footer>
    </main>
  );
}

const aiClients = [
  { name: "ChatGPT", icon: "/ai-openai.svg" },
  { name: "Claude", icon: "/ai-anthropic.svg" },
] as const;

function AiClientBadge({ name, icon, note }: { name: string; icon: string; note: string }) {
  return (
    <div className="aiClientBadge">
      <img src={icon} alt="" />
      <span><strong>{name}</strong><small>{note}</small></span>
    </div>
  );
}

function DashboardAccess() {
  const { tr } = useI18n();
  return (
    <PublicLayout>
      <section className="dashboardAccess">
        <div className="dashboardAccessCopy">
          <span className="eyebrow">{tr("REMOTE ARC DASHBOARD", "REMOTE ARC 控制台")}</span>
          <h1>{tr(
            "Your devices, connections and access policy in one place.",
            "在一个页面管理设备、连接与访问策略。"
          )}</h1>
          <p>{tr(
            "Sign in to pair computers, inspect online state, review usage and connect your AI clients. The public website always remains available at the root domain.",
            "登录后可配对电脑、查看在线状态、用量与 AI 客户端连接。根域名始终保留为公开官网。"
          )}</p>
          <a className="primaryButton" href={APP_ORIGIN + "/auth/google?return_to=/overview"}>
            {tr("Continue with Google", "使用 Google 继续")} <span>→</span>
          </a>
        </div>
        <div className="dashboardAccessPreview" aria-hidden="true">
          <div className="previewTop"><span>Remote Arc</span><i>Dashboard</i></div>
          <div className="previewMetricRow">
            <div><small>ONLINE</small><strong>2</strong><span>devices</span></div>
            <div><small>USAGE</small><strong>1.8k</strong><span>/ 10k calls</span></div>
            <div><small>POLICY</small><strong>Safe</strong><span>default mode</span></div>
          </div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>Personal Mac</strong><span>macOS · online now</span></div><b>Read + Dev</b></div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>Desktop PC</strong><span>Windows · online now</span></div><b>Developer</b></div>
          <div className="previewActivity"><span>Recent activity</span><strong>read_file</strong><small>Personal Mac · 12s ago</small></div>
        </div>
      </section>
    </PublicLayout>
  );
}

function Landing({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const command = "npx remotelink";
  return (
    <PublicLayout>
      <section className="landingHero">
        <div className="heroCopy">
          <span className="eyebrow">{tr("THE REMOTE CONTROL PLANE FOR AI", "面向 AI 的远程控制层")}</span>
          <h1>{tr("Your computer. Within reach of AI.", "让 AI 真正触达你的电脑。")}</h1>
          <p>{tr(
            "Give ChatGPT, Claude and compatible MCP clients secure access to your real Windows, macOS and Linux machines — without public IPs, VPNs or surrendering control.",
            "让 ChatGPT、Claude 与兼容 MCP 的 AI 安全访问你的真实 Windows、macOS 和 Linux 设备。无需公网 IP，无需 VPN，控制权始终在你手里。"
          )}</p>
          <div className="landingActions">
            <a className="primaryButton goldButton" href={user ? APP_ORIGIN + "/overview" : APP_ORIGIN + "/auth/google?return_to=/overview"}>{user ? tr("Open dashboard", "打开控制台") : tr("Connect a computer", "连接一台电脑")}</a>
            <a className="ghostLink" href="#how-it-works">{tr("See how it works →", "看看如何使用 →")}</a>
          </div>
          <div className="heroBadges">
            <span>{tr("10,000 hosted calls / month", "每月 10,000 次托管调用")}</span>
            <span>{tr("Free hosted tier + paid usage", "免费托管额度 + 付费扩容")}</span>
            <span>{tr("Outbound connection only", "仅需出站连接")}</span>
          </div>
        </div>
        <div className="heroTopology" aria-label={tr("Remote Arc connection flow", "Remote Arc 连接链路")}>
          <svg className="topologyLines" viewBox="0 0 600 280" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="flowStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#234c63" />
                <stop offset="52%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#234c63" />
              </linearGradient>
            </defs>
            <path d="M100 66 C100 84 210 84 300 100" />
            <path d="M300 66 L300 100" />
            <path d="M500 66 C500 84 390 84 300 100" />
            <path d="M300 204 C300 214 190 214 100 227" />
            <path d="M300 204 L300 227" />
            <path d="M300 204 C300 214 410 214 500 227" />

          </svg>

          <div className="topologyNode topologyAgent nodeAgentLeft">
            <img src={aiClients[0].icon} alt="" />
            <div><strong>{aiClients[0].name}</strong><small>MCP</small></div>
          </div>

          <div className="topologyNode topologyAgent nodeAgentCenter">
            <img src={aiClients[1].icon} alt="" />
            <div><strong>{aiClients[1].name}</strong><small>MCP</small></div>
          </div>

          <div className="topologyNode topologyAgent nodeAgentRight">
            <span className="protocolMark">M</span>
            <div><strong>{tr("Any MCP client", "任意 MCP 客户端")}</strong><small>MCP</small></div>
          </div>

          <div className="topologyHub">
            <LogoMark />
            <div><strong>Remote Arc</strong><small>OAuth · Routing · Presence</small></div>
            <b>{tr("Connected", "已连接")}</b>
          </div>

          <div className="topologyDevice nodeDeviceLeft">
            <span>⊞</span><div><strong>{tr("Desktop", "桌面电脑")}</strong><small>Windows</small></div><i className="onlineDot" />
          </div>
          <div className="topologyDevice nodeDeviceCenter">
            <span>⌘</span><div><strong>Mac</strong><small>macOS</small></div><i className="onlineDot" />
          </div>
          <div className="topologyDevice nodeDeviceRight">
            <span>›_</span><div><strong>{tr("Linux host", "Linux 主机")}</strong><small>Linux</small></div><i className="onlineDot" />
          </div>
        </div>
      </section>

      <section className="trustRail" aria-label={tr("Supported AI clients", "支持的 AI 客户端")}>
        <span>{tr("Built for the AI tools you already use", "连接你已经在用的 AI")}</span>
        {aiClients.map((client) => <div key={client.name}><img src={client.icon} alt="" /><strong>{client.name}</strong></div>)}
        <div><span className="miniMcp">M</span><strong>Remote MCP</strong></div>
        <small>{tr("One endpoint. No client lock-in.", "一个端点，不绑定任何 AI。")}</small>
      </section>

      <section className="howSection" id="how-it-works">
        <div className="sectionIntro splitIntro">
          <div><span className="eyebrow">{tr("FROM ZERO TO CONNECTED", "从零到连通")}</span><h2>{tr("Three steps. Then just talk.", "三步连接，之后直接开口。")}</h2></div>
          <p>{tr("Remote Arc turns a multi-layer remote MCP stack into a browser-approved setup flow. Pair the machine once, connect your AI once, and reuse both securely.", "Remote Arc 把复杂的远程 MCP 架构收进一次浏览器授权流程：设备配对一次，AI 连接一次，之后长期安全复用。")}</p>
        </div>
        <div className="journeyGrid">
          <article><span className="stepNumber">01</span><div className="journeyIcon">›_</div><h3>{tr("Run one command", "运行一条命令")}</h3><p>{tr("The CLI opens a pairing page automatically. No clone, token copy, VPN or router setup.", "CLI 自动打开配对页面，无需 clone、复制 Token、VPN 或路由器配置。")}</p><code>{command}</code></article>
          <article><span className="stepNumber">02</span><div className="journeyLogos">{aiClients.map((client) => <img key={client.name} src={client.icon} alt="" />)}</div><h3>{tr("Install Remote Arc in your AI", "在你的 AI 中安装 Remote Arc")}</h3><p>{tr("After public launch, find Remote Arc in Plugins and install it. OAuth connects your Remote Arc account; no MCP setup is required for normal users.", "公开上架后，在 Plugins 中搜索并安装 Remote Arc。通过 OAuth 连接你的 Remote Arc 账户，普通用户无需自己配置 MCP。")}</p><code>{tr("Plugins → Remote Arc → Install", "Plugins → Remote Arc → 安装")}</code></article>
          <article><span className="stepNumber">03</span><div className="journeyIcon">✦</div><h3>{tr("Ask in natural language", "直接自然语言操作")}</h3><p>{tr("Say which computer you mean. Remote Arc finds it, checks its local capability policy and routes the tool call.", "只需说出设备名称。Remote Arc 会找到它、检查本机权限，再把工具调用路由过去。")}</p><blockquote>{tr("“Run the tests on my desktop.”", "“在我的桌面电脑上跑一下测试。”")}</blockquote></article>
        </div>
        <div className="clientSetupNote">
          <div><img src={aiClients[0].icon} alt="" /><p><strong>{tr("For normal ChatGPT users", "普通 ChatGPT 用户")}</strong><span>{tr("Once Remote Arc is public, install it from Plugins, connect your account with OAuth, and start using it. No Create-MCP flow.", "Remote Arc 公开上架后，直接在 Plugins 中安装，通过 OAuth 连接账户即可使用，不需要自己 Create MCP。")}</span></p></div>
          <div><span className="miniMcp">M</span><p><strong>{tr("Early access / manual MCP setup", "Early access / 手动 MCP")}</strong><span>{tr("Until the public listing is live, developers and early testers can add the production MCP endpoint manually in a client that supports remote MCP.", "在公开插件正式上线前，开发者和 Early Access 测试者可以在支持远程 MCP 的客户端中手动添加生产 MCP 地址。")}</span></p></div>
        </div>
      </section>

      <section className="demoSection" id="demos">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("SEE IT IN ACTION", "看看实际效果")}</span>
            <h2>{tr("See setup and device management in motion.", "看看安装与设备管理的真实流程。")}</h2>
          </div>
          <p>{tr(
            "Two short walkthroughs show the current product: manage a paired device from the mobile dashboard, and use the manual MCP setup path for early access before the public plugin listing is live.",
            "两段短演示展示当前真实产品流程：在手机端 Dashboard 管理已配对设备，以及在公开插件上架前用于 Early Access 的手动 MCP 接入流程。"
          )}</p>
        </div>
        <div className="demoGrid">
          <article className="demoCard">
            <div className="demoMedia">
              <img src="/demos/mobile-typing.webp" alt={tr("Remote Arc mobile natural language command demo", "Remote Arc 手机自然语言操作演示")} loading="lazy" />
              <span className="demoBadge">{tr("MOBILE", "手机")}</span>
            </div>
            <div className="demoCopy">
              <span className="eyebrow">{tr("MOBILE DASHBOARD", "移动端控制台")}</span>
              <h3>{tr("Manage your paired devices from iPhone.", "在 iPhone 上管理已配对设备。")}</h3>
              <p>{tr(
                "The Remote Arc dashboard is responsive on mobile, so you can review status, rename devices and manage access from Safari.",
                "Remote Arc Dashboard 已适配手机端，可直接在 Safari 查看在线状态、重命名设备并管理访问。"
              )}</p>
            </div>
          </article>
          <article className="demoCard">
            <div className="demoMedia">
              <img src="/demos/add-mcp-app.webp" alt={tr("Adding Remote Arc as an MCP app demo", "把 Remote Arc 添加为 MCP 应用的演示")} loading="lazy" />
              <span className="demoBadge">MCP</span>
            </div>
            <div className="demoCopy">
              <span className="eyebrow">{tr("EARLY ACCESS", "EARLY ACCESS")}</span>
              <h3>{tr("Manual MCP setup for developers and testers.", "开发者与测试用户的手动 MCP 接入。")}</h3>
              <p>{tr(
                "Before the public listing is live, use ChatGPT Settings → Apps → Create, paste the production MCP endpoint, Scan Tools, complete OAuth, then create the app.",
                "公开插件正式上线前，可在 ChatGPT 的 Settings → Apps → Create 中填写生产 MCP 地址，Scan Tools，完成 OAuth 后创建应用。"
              )}</p>
              <code className="demoEndpoint">{MCP_ENDPOINT}</code>
            </div>
          </article>
        </div>
      </section>

      <section className="valueSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("WHY REMOTE ARC", "为什么选择 REMOTE ARC")}</span>
          <h2>{tr("The convenience of a service. The leverage of open infrastructure.", "托管服务的省心，开放基础设施的掌控力。")}</h2>
        </div>
        <div className="landingFeatures">
          <article><span>01</span><h2>{tr("One endpoint, every machine", "一个端点，所有设备")}</h2><p>{tr("Name the computer in your prompt. Remote Arc handles identity, presence and routing behind the scenes.", "在提示词里说出电脑名称，身份、在线状态与路由都由 Remote Arc 处理。")}</p></article>
          <article><span>02</span><h2>{tr("Local-first permissions", "权限最终由本机决定")}</h2><p>{tr("Safe mode is read-only. Developer mode adds write and shell tools. The relay cannot expand what a device exposes.", "Safe 模式只读；Developer 模式开放写入与命令。Relay 无法扩大设备本机声明的权限。")}</p></article>
          <article><span>03</span><h2>{tr("Hosted, ready to scale", "托管运行，按需扩容")}</h2><p>{tr("Start on the free hosted tier, then add paid usage when you need more capacity — without changing your endpoint or devices.", "从免费托管额度开始，需要更多容量时直接充值扩容，无需更换端点或重新配置设备。")}</p></article>
          <article><span>04</span><h2>{tr("No inbound attack surface", "无需暴露入站端口")}</h2><p>{tr("Each machine creates an outbound encrypted connection. No public IP, port forwarding or always-on VPN.", "每台设备主动建立加密出站连接，无需公网 IP、端口映射或常驻 VPN。")}</p></article>
          <article><span>05</span><h2>{tr("Real OAuth, not copied secrets", "标准 OAuth，不复制密钥")}</h2><p>{tr("OAuth 2.1, PKCE, short-lived codes and rotating refresh tokens replace shared URLs and pasted credentials.", "OAuth 2.1、PKCE、短期授权码与轮换 Refresh Token，替代共享链接和手动粘贴凭证。")}</p></article>
          <article><span>06</span><h2>{tr("Private, useful audit", "隐私友好的可用审计")}</h2><p>{tr("See the device, tool, result and time without storing file contents or command arguments.", "记录设备、工具、结果与时间，但不保存文件内容或命令参数。")}</p></article>
        </div>
      </section>

      <section className="differenceSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("THE DIFFERENCE", "我们的差异")}</span>
          <h2>{tr("More than a tunnel. A complete AI control plane.", "不只是隧道，而是一套完整的 AI 控制面。")}</h2>
          <p>{tr(
            "Remote Arc combines device presence, account identity, OAuth, per-device credentials, capability discovery and auditable routing in one open system.",
            "Remote Arc 把设备在线状态、账户身份、OAuth、每设备凭证、能力发现与可审计路由整合进同一套开放系统。"
          )}</p>
        </div>
        <div className="comparisonGrid">
          <div className="comparisonHead"><span></span><strong>Remote Arc</strong><strong>{tr("Hosted-only connector", "纯托管连接器")}</strong></div>
          {[
            [tr("Control plane", "控制面"), tr("Managed Remote Arc service", "Remote Arc 托管服务"), tr("Provider-owned", "平台持有")],
            [tr("AI clients", "AI 客户端"), tr("ChatGPT, Claude + Remote MCP", "ChatGPT、Claude + Remote MCP"), tr("Often product-specific", "通常绑定单一产品")],
            [tr("Onboarding", "上手方式"), tr("One command + browser approval", "一条命令 + 浏览器授权"), tr("Tokens and manual config", "Token 与手动配置")],
            [tr("Device permissions", "设备权限"), tr("Final boundary stays local", "最终边界留在本机"), tr("Cloud policy first", "云端策略优先")],
            [tr("Network exposure", "网络暴露"), tr("Outbound connection only", "仅需出站连接"), tr("VPN, tunnel or open port", "VPN、隧道或开放端口")],
            [tr("Scaling", "扩容方式"), tr("Free tier + paid usage", "免费额度 + 付费扩容"), tr("Depends on provider", "取决于平台")],
            [tr("Hosted usage", "托管额度"), tr("10,000 free calls / month", "每月 10,000 次免费调用"), tr("Depends on provider", "取决于平台")],
          ].map(([label, ours, other]) => (
            <div className="comparisonRow" key={label}>
              <span>{label}</span><strong>✓ {ours}</strong><em>{other}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="installSection" id="install">
        <div className="sectionIntro splitIntro">
          <div><span className="eyebrow">{tr("INSTALL", "安装")}</span><h2>{tr("One command on your computer.", "电脑上只需要一条命令。")}</h2></div>
          <p>{tr("Remote Arc runs as a lightweight local agent. It opens a browser pairing flow, then keeps an outbound encrypted connection to your account.", "Remote Arc 以轻量本地 Agent 运行。执行后会打开浏览器完成配对，并保持到你账户的加密出站连接。")}</p>
        </div>
        <div className="installGrid">
          <article><span className="stepNumber">01</span><h3>Windows · macOS · Linux</h3><p>{tr("Requires Node.js 20 or newer.", "需要 Node.js 20 或更高版本。")}</p><div className="commandBox"><code>npx remotelink</code><CopyButton value="npx remotelink"/></div></article>
          <article><span className="stepNumber">02</span><h3>{tr("Approve in your browser", "浏览器确认配对")}</h3><p>{tr("Match the short pairing code and approve the computer. No token copying, public IP or port forwarding.", "核对短配对码并授权电脑，无需复制 Token、公网 IP 或端口映射。")}</p></article>
          <article><span className="stepNumber">03</span><h3>{tr("Connect your AI", "连接你的 AI")}</h3><p>{tr("Add the Remote MCP endpoint and complete OAuth once.", "添加 Remote MCP 地址并完成一次 OAuth 授权。")}</p><div className="endpointRow"><code>{MCP_ENDPOINT}</code><CopyButton value={MCP_ENDPOINT}/></div></article>
        </div>
      </section>

      <section className="faqSection" id="faq">
        <div className="sectionIntro"><span className="eyebrow">{tr("Q&A", "常见问题")}</span><h2>{tr("Before you connect.", "连接前你可能想知道。")}</h2></div>
        <div className="faqList">
          {[
            [tr("Does Remote Arc expose my computer to the internet?", "Remote Arc 会把我的电脑暴露到公网吗？"), tr("No inbound port is required. Your computer initiates the connection outward to the relay.", "不需要开放入站端口。电脑主动向 Relay 建立出站连接。")],
            [tr("What is the MCP URL?", "MCP 地址是什么？"), MCP_ENDPOINT],
            [tr("Do I need to copy API keys or device tokens?", "需要复制 API Key 或设备 Token 吗？"), tr("No. Device pairing is browser-approved, and compatible AI clients use OAuth.", "不需要。设备通过浏览器配对，兼容的 AI 客户端通过 OAuth 授权。")],
            [tr("Can I control which tools a computer exposes?", "可以限制每台电脑开放哪些工具吗？"), tr("Yes. Tool access can be managed per device from the dashboard, while the local agent remains the final permission boundary.", "可以。看板里可以按设备管理工具权限，同时本地 Agent 仍是最终权限边界。")],
            [tr("Where is the dashboard?", "控制台在哪里？"), APP_ORIGIN],
          ].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="ctaStrip">
        <div>
          <span className="eyebrow">{tr("FREE HOSTED PLAN", "免费托管方案")}</span>
          <h2>{tr("Connect one machine in minutes.", "几分钟内，让第一台电脑上线。")}</h2>
          <p>{tr("Start with 10,000 hosted tool calls each month, then add paid usage when you need more.", "每月先用 10,000 次免费托管调用，需要更多时直接充值扩容。")}</p>
        </div>
        <a className="primaryButton goldButton" href={user ? APP_ORIGIN + "/overview" : APP_ORIGIN + "/auth/google?return_to=/overview"}>{user ? tr("Open dashboard", "打开控制台") : tr("Start with Remote Arc", "开始使用 Remote Arc")}</a>
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
        <h1>{tr("Start free. Add usage when you need it.", "免费开始，需要更多时再扩容。")}</h1>
        <p>{tr("Remote Arc includes 10,000 hosted tool calls each month. When you need more, add paid usage without changing your setup.", "Remote Arc 每月包含 10,000 次托管工具调用；需要更多时可直接付费扩容，无需修改现有配置。")}</p>
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
          <a className="primaryButton goldButton" href={user ? APP_ORIGIN + "/overview" : APP_ORIGIN + "/auth/google?return_to=/overview"}>{user ? tr("Open dashboard", "打开控制台") : tr("Start free", "免费开始")}</a>
        </article>
        <article className="priceCard">
          <span className="planTag">{tr("PAID USAGE", "付费额度")}</span>
          <h2>{tr("Top up", "按需充值")}</h2>
          <p>{tr("Keep the same account, devices and MCP endpoint. Add hosted usage only when the free allowance is not enough.", "账户、设备和 MCP 地址都不用变；免费额度不够时，只需按需充值托管调用额度。")}</p>
          <ul>
            <li>{tr("Usage added to your hosted account", "额度直接加入当前托管账户")}</li>
            <li>{tr("No infrastructure to operate", "无需维护任何基础设施")}</li>
            <li>{tr("Same OAuth and device permissions", "继续使用同一套 OAuth 与设备权限")}</li>
            <li>{tr("Designed for heavier personal usage", "适合更高频的个人使用")}</li>
          </ul>
          <a className="ghostButton priceLink" href={user ? APP_ORIGIN + "/settings" : APP_ORIGIN + "/auth/google?return_to=/settings"}>{tr("Manage usage", "管理额度")}</a>
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
    [tr("Source code", "源代码"), tr("Remote Arc is source-available under the Remote Arc Proprietary Source License.", "Remote Arc 当前版本采用 Remote Arc Proprietary Source License，源码公开可审查但并非第三方开源软件。"), "https://github.com/yaohuangguan/remote-arc"],
  ];
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">{tr("RESOURCES", "资源")}</span>
        <h1>{tr("Understand the system behind Remote Arc.", "了解 Remote Arc 背后的系统。")}</h1>
        <p>{tr("Explore the architecture, MCP protocol and product documentation behind the managed Remote Arc service.", "了解 Remote Arc 托管服务背后的架构、MCP 协议与产品文档。")}</p>
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
  const endpoint = MCP_ENDPOINT;
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero mcpHero">
        <span className="eyebrow">REMOTE MCP</span>
        <h1>{tr("Connect your AI once. Reach every machine.", "连接一次 AI，访问你的所有电脑。")}</h1>
        <p>{tr("Remote Arc gives ChatGPT, Claude and compatible clients one OAuth-protected endpoint, then securely routes each tool call to the computer you name.", "Remote Arc 为 ChatGPT、Claude 与兼容客户端提供一个受 OAuth 保护的端点，再把每次工具调用安全路由到你指定的电脑。")}</p>
        <div className="mcpHeroClients">
          {aiClients.map((client) => <div key={client.name}><img src={client.icon} alt="" /><span>{client.name}</span></div>)}
          <small>+ {tr("compatible Remote MCP clients", "兼容 Remote MCP 的客户端")}</small>
        </div>
      </section>

      <section className="endpointHero">
        <div><span className="eyebrow">{tr("YOUR REMOTE MCP URL", "你的 REMOTE MCP 地址")}</span><h2>{tr("One URL is the entire connection.", "一个 URL，就是全部连接。")}</h2><p>{tr("OAuth discovery, Google sign-in, scopes, refresh tokens and device routing are handled automatically.", "OAuth 发现、Google 登录、权限范围、Token 刷新与设备路由都会自动处理。")}</p></div>
        <div className="endpointCopy"><code>{endpoint}</code><CopyButton value={endpoint} /></div>
      </section>

      <section className="clientGuideSection">
        <div className="sectionIntro"><span className="eyebrow">{tr("CHOOSE YOUR CLIENT", "选择你的 AI 客户端")}</span><h2>{tr("The setup is different. The endpoint is the same.", "入口不同，但端点完全相同。")}</h2></div>
        <div className="clientGuideGrid">
          <article className="clientGuideCard">
            <header><img src={aiClients[0].icon} alt="" /><div><h3>ChatGPT</h3><span>{tr("Developer Mode required today", "目前需要 Developer Mode")}</span></div></header>
            <ol>
              <li><b>1</b><span>{tr("Open Settings → Apps → Advanced Settings and enable Developer Mode.", "打开 Settings → Apps → Advanced Settings，开启 Developer Mode。")}</span></li>
              <li><b>2</b><span>{tr("Create a custom app and paste the Remote Arc MCP URL.", "创建 Custom App，并粘贴 Remote Arc MCP 地址。")}</span></li>
              <li><b>3</b><span>{tr("Scan tools, complete Google OAuth, then select Remote Arc in chat.", "扫描工具、完成 Google OAuth，然后在对话中选择 Remote Arc。")}</span></li>
            </ol>
            <p className="clientReality"><strong>{tr("Do I need your plugin?", "还需要安装你的 Plugin 吗？")}</strong>{tr(" No. The MCP connection is enough. A reviewed Remote Arc app/plugin would make discovery and installation one-click later.", " 不需要，MCP 连接本身已经足够。未来通过审核的 Remote Arc App/Plugin 可以把发现与安装进一步变成一键操作。")}</p>
            <a href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt">{tr("OpenAI setup guide ↗", "查看 OpenAI 官方指南 ↗")}</a>
          </article>
          <article className="clientGuideCard">
            <header><img src={aiClients[1].icon} alt="" /><div><h3>Claude</h3><span>{tr("No developer mode required", "无需 Developer Mode")}</span></div></header>
            <ol>
              <li><b>1</b><span>{tr("Open Settings → Connectors.", "打开 Settings → Connectors。")}</span></li>
              <li><b>2</b><span>{tr("Choose Add custom connector and paste the Remote Arc MCP URL.", "选择 Add custom connector，并粘贴 Remote Arc MCP 地址。")}</span></li>
              <li><b>3</b><span>{tr("Click Connect, complete OAuth, then enable the tools you want to use.", "点击 Connect、完成 OAuth，再启用需要的工具。")}</span></li>
            </ol>
            <p className="clientReality"><strong>{tr("Desktop plugin required?", "需要桌面插件吗？")}</strong>{tr(" No. Claude and Claude Desktop both connect to remote servers from Settings → Connectors.", " 不需要。Claude 网页版与 Claude Desktop 都通过 Settings → Connectors 连接远程服务器。")}</p>
            <a href="https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp">{tr("Anthropic setup guide ↗", "查看 Anthropic 官方指南 ↗")}</a>
          </article>
        </div>
      </section>

      <section className="mcpSystemGrid">
        <article><span className="eyebrow">{tr("1 · PAIR THE DEVICE", "1 · 配对设备")}</span><h3>{tr("Install the device agent", "安装设备 Agent")}</h3><code>npx remotelink</code><p>{tr("The browser confirms the pairing code and stores a unique revocable credential on that machine.", "浏览器确认配对码，并在这台设备上保存一份独立、可撤销的凭证。")}</p></article>
        <article><span className="eyebrow">{tr("2 · GRANT SCOPES", "2 · 授予权限")}</span><h3>{tr("OAuth stays explicit", "OAuth 权限清晰可见")}</h3><div className="scopeChips"><code>devices:read</code><code>computer:read</code><code>computer:write</code></div><p>{tr("AI access can be revoked without re-pairing the computer.", "可以单独撤销 AI 的访问权限，而不需要重新配对电脑。")}</p></article>
        <article><span className="eyebrow">{tr("3 · CHOOSE LOCAL POWER", "3 · 选择本机能力")}</span><h3>{tr("Safe or Developer device mode", "Safe 或 Developer 设备模式")}</h3><div className="modeRows"><span><b>Safe</b>{tr("Read files and inspect processes", "读取文件与查看进程")}</span><span><b>Developer</b>{tr("Write files and run commands", "写入文件与运行命令")}</span></div><p>{tr("This local Developer mode is separate from ChatGPT Developer Mode. The device always has the final say.", "这里的本机 Developer 模式与 ChatGPT Developer Mode 是两回事；最终权限始终由设备决定。")}</p></article>
      </section>

      <section className="pluginPath">
        <div><span className="eyebrow">{tr("THE SILKY-SMOOTH PATH", "真正丝滑的路径")}</span><h2>{tr("MCP works now. A published app makes it one click.", "MCP 现在就能用；发布 App 后，安装可以只点一下。")}</h2></div>
        <p>{tr("The current universal path is a standards-based Remote MCP URL plus OAuth. For the same discoverability as Remote Desktop Commander, publish a branded Remote Arc app/plugin that preconfigures the endpoint and explains its permissions. Keep the MCP server as the shared backend so ChatGPT, Claude and future clients all use the same secure core.", "当前最通用的路径是标准 Remote MCP URL + OAuth。要做到像 Remote Desktop Commander 一样容易发现和安装，建议再发布一个带品牌的 Remote Arc App/Plugin，预置端点并解释权限；底层仍共用同一套 MCP 服务，这样 ChatGPT、Claude 与未来客户端都会使用同一个安全核心。")}</p>
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
  const [showAdd, setShowAdd] = useState(false);
  const [active, setActive] = useState<DashboardTab>(dashboardTabFromPath(location.pathname));
  useEffect(() => {
    const syncRoute = () => setActive(dashboardTabFromPath(location.pathname));
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
  const command = "npx remotelink";
  const safeCommand = command + " --safe";
  const mcpEndpoint = MCP_ENDPOINT;
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

  async function updateDeviceTools(device: Device, tool: string, enabled: boolean) {
    const advertised = device.available_tools || device.tools;
    const baseline = device.status === "online"
      ? advertised
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertised]));
    const current = device.allowed_tools == null ? baseline : device.allowed_tools;
    const next = enabled ? Array.from(new Set([...current, tool])) : current.filter((item) => item !== tool);
    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/tools", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allowed_tools: next }),
    });
    if (!response.ok) return alert(tr("Could not update tool access.", "无法更新工具权限。"));
    await refreshAll();
  }

  function navigateTab(tab: DashboardTab) {
    const path = DASHBOARD_PATHS[tab];
    if (location.pathname !== path) history.pushState({}, "", path);
    setActive(tab);
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
            <button key={id} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebarStatus"><div className="livePulse"/><div><strong>{tr("Relay online", "Relay 在线")}</strong><span>mcp.remotearc.app</span></div></div>
        <div className="sidebarAccount">
          {user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <div className="avatarFallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>}
          <div><strong>{user.name || "Owner"}</strong><span>{user.email}</span></div>
          <button onClick={() => void signOut()} title={tr("Sign out", "退出登录")}>↪</button>
        </div>
      </aside>

      <main className="dashboardMain">
        <header className="mobileTopbar"><Brand/><div className="mobileActions"><ThemeSwitcher compact/><button className="addButton compact" onClick={() => setShowAdd(true)}>+ {tr("Device", "设备")}</button></div></header>

        {active === "overview" && (
          <>
            <section className="pageHeader">
              <div><span className="eyebrow">{tr("YOUR AI CONTROL PLANE", "你的 AI 控制面")}</span><h1>{tr("Your machines, ready when AI calls.", "AI 一开口，你的设备就绪。")}</h1><p>{tr("One account, multiple computers, one standards-based Remote MCP endpoint.", "一个账户，多台设备，一个标准 Remote MCP 端点。")}</p></div>
              <button className="addButton goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
            </section>
            <section className="metricsGrid">
              <Metric label={tr("Online now", "当前在线")} value={status?.onlineDevices ?? 0} detail={tr("Ready for MCP calls", "可接受 MCP 调用")} good />
              <Metric label={tr("Linked devices", "已连接设备")} value={status?.totalDevices ?? devices.length} detail="Windows · macOS · Linux" />
              <Metric label={tr("This month", "本月调用")} value={(usage?.used ?? 0).toLocaleString()} detail={tr("of your hosted allowance", "当前托管额度内")} good />
              <Metric label="Remote MCP" value={tr("Ready", "就绪")} detail="OAuth 2.1 + PKCE" good />
            </section>

            <section className="usagePanel">
              <div><span className="eyebrow">{tr("MONTHLY USAGE", "每月用量")}</span><h2>{usage?.unlimited ? tr("Unlimited", "无限") : `${(usage?.used ?? 0).toLocaleString()} / ${(usage?.limit ?? 10000).toLocaleString()}`}</h2><p>{tr("Each remote MCP tool invocation counts as one tool call.", "每次 Remote MCP 工具调用计为一次调用。")}</p></div>
              {!usage?.unlimited && <div className="usageBar"><i style={{ width: usagePct + "%" }}/></div>}
            </section>

            <section className="contentGrid">
              <div className="panelBlock">
                <div className="blockHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Connected computers", "已连接电脑")}</h2></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("View all", "查看全部")}</button></div>
                <div className="compactDeviceList">
                  {devices.slice(0,4).map((device) => (
                    <button className="compactDevice" key={device.id} onClick={() => navigateTab("devices")}>
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
              <div className="connectIcon">↗</div><div><span className="eyebrow">CHATGPT · CLAUDE · REMOTE MCP</span><h2>{tr("Connect once. Then just talk.", "连接一次，之后直接对话。")}</h2><p>{tr("Use one OAuth-protected endpoint across compatible AI clients.", "同一个受 OAuth 保护的端点，连接所有兼容 AI 客户端。")}</p></div>
              <div className="connectBannerActions"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Setup", "设置")}</button></div>
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
                  <div className="toolPermissions"><div className="toolPermissionsHeader"><strong>{tr("MCP tool access", "MCP 工具权限")}</strong><span>{tr("Disabled tools are blocked by the relay before they reach this computer.", "关闭后 Relay 会在请求到达电脑前直接拦截该工具。")}</span></div><div className="toolToggleGrid">{Array.from(new Set([...DEVICE_TOOL_CATALOG, ...(device.available_tools || []), ...(device.allowed_tools || [])])).map((tool) => { const enabled = device.allowed_tools == null ? (device.status === "online" ? (device.available_tools || device.tools).includes(tool) : true) : device.allowed_tools.includes(tool); const advertised = device.status === "online" ? (device.available_tools || device.tools).includes(tool) : true; return <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}><input type="checkbox" checked={enabled} disabled={!advertised} onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)} /><span>{tool}</span></label>; })}</div>{device.status === "offline" && <span className="offlineTools">{tr("Offline: changes are saved now and enforced the next time this device connects.", "设备离线：修改会立即保存，并在设备下次连接时生效。")}</span>}</div>
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
            <section className="setupGrid aiSetupGrid">
              <article className="setupCard featured clientSetupCard"><span className="stepNumber"><img src={aiClients[0].icon} alt="" /></span><div><span className="eyebrow">CHATGPT</span><h2>{tr("Create a custom MCP app", "创建自定义 MCP 应用")}</h2><p>{tr("Enable ChatGPT Developer Mode, create an app, paste this endpoint and complete OAuth.", "开启 ChatGPT Developer Mode，创建 App，粘贴此端点并完成 OAuth。")}</p><div className="endpointRow large"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/></div></div></article>
              <article className="setupCard featured clientSetupCard"><span className="stepNumber"><img src={aiClients[1].icon} alt="" /></span><div><span className="eyebrow">CLAUDE</span><h2>{tr("Add a custom connector", "添加自定义连接器")}</h2><p>{tr("Open Settings → Connectors, add the same endpoint and click Connect. No Developer Mode required.", "打开 Settings → Connectors，添加同一个端点并点击 Connect，无需 Developer Mode。")}</p><div className="endpointRow large"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/></div></div></article>
              <article className="setupCard fullSetupCard"><span className="stepNumber">03</span><div><h2>{tr("Authorize once, then talk naturally", "授权一次，之后直接自然语言操作")}</h2><p>{tr("Address a device by name. Remote Arc checks its local Safe or Developer policy and handles routing.", "直接说设备名称；Remote Arc 会检查它的本机 Safe 或 Developer 权限并完成路由。")}</p><div className="promptExamples"><code>{tr("“List the projects on my Mac.”", "“看看我 Mac 上有哪些项目。”")}</code><code>{tr("“Run the tests on my desktop.”", "“在我的桌面电脑上跑测试。”")}</code></div></div></article>
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
                [tr("Managed hosted service", "托管服务"), tr("Remote Arc operates the relay, identity layer and routing so you do not need to maintain infrastructure.", "Relay、身份系统与路由均由 Remote Arc 托管，无需自行维护基础设施。")],
              ].map(([title, body]) => <article className="securityCard" key={title}><span className="securityIcon">◇</span><h2>{title}</h2><p>{body}</p><span className="securityState good">{tr("Enabled", "已启用")}</span></article>)}
            </section>
          </>
        )}

        {active === "settings" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("SETTINGS", "设置")}</span><h1>{tr("Make Remote Arc yours.", "把 Remote Arc 调成你喜欢的样子。")}</h1><p>{tr("Language, plan information and account preferences.", "语言、套餐信息与账户偏好。")}</p></div></section>
            <section className="settingsGrid">
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Choose Light, Dark or System. Your preference is saved in this browser.", "选择浅色、深色或跟随系统；偏好会保存在当前浏览器。")}</p></div><ThemeSwitcher /></article>
              <article className="settingsCard"><div><h2>{tr("Language", "语言")}</h2><p>{tr("Changes apply immediately and are saved in this browser.", "修改后立即生效，并保存在当前浏览器。")}</p></div><div className="languageSetting"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button><button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Account & profile", "账号与个人信息")}</h2><p>{user.name || tr("Remote Arc user", "Remote Arc 用户")} · {user.email}</p></div><button className="ghostButton" onClick={() => void signOut()}>{tr("Sign out", "退出登录")}</button></article><article className="settingsCard"><div><h2>{tr("MCP connection", "MCP 连接")}</h2><p>{tr("Manage per-device tool access from Devices. Disabled tools are enforced by the relay.", "在设备页管理每台电脑的工具权限；关闭的工具会由 Relay 强制拦截。")}</p><code>{mcpEndpoint}</code></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button></article><article className="settingsCard"><div><h2>{tr("Billing & payments", "账单与支付")}</h2><p>{tr("Your account starts on the free hosted tier. Paid usage is added through top-ups when you need more capacity.", "账户默认使用免费托管额度；需要更多容量时通过充值增加付费调用额度。")}</p></div><div className="planValue">{`${usage?.used ?? 0} / ${usage?.limit ?? 10000}`}</div></article>
              <article className="settingsCard"><div><h2>{tr("Usage & top-ups", "额度与充值")}</h2><p>{tr("Your hosted account includes a free monthly allowance. Add paid usage when you need more capacity.", "托管账户每月包含免费额度；需要更多容量时可按需充值。")}</p></div><a className="ghostButton" href={MARKETING_ORIGIN + "/pricing"}>{tr("View pricing", "查看价格")}</a></article>
            </section>
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · mcp.remotearc.app</span><div><a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a><a href={MARKETING_ORIGIN + "/resources"}>{tr("Resources", "资源")}</a><a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a><a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a><a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a><a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a></div></footer>
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


function LegalPage({
  kind,
  user,
}: {
  kind: "privacy" | "terms" | "support";
  user?: User | null;
}) {
  const { tr } = useI18n();
  const content = {
    privacy: {
      eyebrow: "PRIVACY",
      title: tr("Privacy Policy", "隐私政策"),
      intro: tr(
        "Remote Arc is designed to route authorized requests to computers you explicitly connect. This page explains the data used to operate the hosted service.",
        "Remote Arc 只把已授权请求路由到你明确连接的电脑。这里说明托管服务运行过程中会处理哪些数据。",
      ),
      sections: [
        [tr("Account data", "账户数据"), tr("We use your Google account identity to create and secure your Remote Arc account. We store identifiers, display name, email address, session records and authorization metadata needed to operate the service.", "我们使用你的 Google 账户身份来创建并保护 Remote Arc 账户，并保存服务运行所需的标识符、显示名称、邮箱、会话记录和授权元数据。")],
        [tr("Device data", "设备数据"), tr("For paired computers we store device identifiers, device names, platform metadata, credential hashes and connection timestamps. Raw device credentials are not stored in the hosted database.", "对于已配对电脑，我们保存设备标识、设备名称、平台信息、凭证哈希和连接时间。托管数据库不会保存原始设备凭证。")],
        [tr("Remote actions and tool results", "远程操作与工具结果"), tr("Remote Arc relays authorized MCP tool requests between your selected AI client and your connected device. Requested file contents, directory listings, process output and command results may pass through the hosted relay and be returned to the AI client to fulfill your request. Remote Arc audit records are designed to retain only operational metadata such as tool name, device, success state and time, not file contents, command arguments, OAuth tokens or device credentials.", "Remote Arc 会在你选择的 AI 客户端与已连接设备之间转发已授权的 MCP 工具请求。为完成你的请求，被读取的文件内容、目录列表、进程输出和命令结果可能经过托管 Relay 并返回给 AI 客户端。Remote Arc 的审计记录仅设计为保存工具名称、设备、成功状态和时间等运行元数据，不保存文件内容、命令参数、OAuth Token 或设备凭证。")],
        [tr("AI platforms", "AI 平台"), tr("When you connect Remote Arc to ChatGPT, Codex or another compatible MCP client, tool requests and results are also processed by that provider under the account, product settings, terms and privacy policy you use with that provider.", "当你将 Remote Arc 连接到 ChatGPT、Codex 或其他兼容 MCP 客户端时，工具请求与结果也会由该服务商按照你所使用账户和产品的设置、条款及隐私政策进行处理。")],
        [tr("Infrastructure", "基础设施"), tr("The hosted service uses Cloudflare infrastructure and Google OAuth. Their processing is governed by their respective terms and privacy policies.", "托管服务使用 Cloudflare 基础设施和 Google OAuth；相关处理同时受这些服务各自的条款和隐私政策约束。")],
        [tr("Control and deletion", "控制与删除"), tr("You can revoke individual devices from the Remote Arc dashboard. For account or hosted-data deletion requests, use the support contact below.", "你可以在 Remote Arc 控制台撤销单台设备。如需删除账户或托管数据，请通过下方支持渠道联系。")],
      ],
    },
    terms: {
      eyebrow: "TERMS",
      title: tr("Terms of Service", "服务条款"),
      intro: tr(
        "Remote Arc provides remote computer access tooling. By using the hosted service, you agree to use it only with computers and accounts you are authorized to control.",
        "Remote Arc 提供远程电脑访问工具。使用托管服务即表示你同意只操作你有权控制的电脑和账户。",
      ),
      sections: [
        [tr("Authorized use", "授权使用"), tr("You must have permission to access every computer, file, account and service you control through Remote Arc. Do not use Remote Arc to bypass access controls or interfere with systems you do not own or administer.", "你必须有权访问通过 Remote Arc 控制的每台电脑、文件、账户和服务。不得使用 Remote Arc 绕过访问控制或干扰你无权管理的系统。")],
        [tr("Your responsibility", "你的责任"), tr("Remote computer control can read or modify files, execute commands, affect running software and, when commands access network services, cause changes outside the local computer. You are responsible for reviewing device permissions, AI prompts and consequential actions before approving or enabling high-impact access.", "远程电脑控制可能读取或修改文件、执行命令、影响运行中的软件；当命令访问网络服务时，也可能对本机之外的系统产生影响。你有责任在批准或启用高影响访问前检查设备权限、AI 提示与相关操作。")],
        [tr("Service availability", "服务可用性"), tr("The hosted service is provided without a guarantee of uninterrupted availability. Features, quotas and supported integrations may change as Remote Arc develops.", "托管服务不保证持续无中断可用。随着 Remote Arc 的发展，功能、额度和支持的集成可能发生变化。")],
        [tr("Third-party software", "第三方软件"), tr("Third-party components used by Remote Arc are governed by their respective licenses and terms. The Remote Arc product is provided as a managed hosted service.", "Remote Arc 使用的第三方组件受各自许可证与条款约束；Remote Arc 产品以托管服务方式提供。")],
        [tr("Suspension", "暂停服务"), tr("Access may be limited or suspended for abuse, security risks, legal requirements or material violations of these terms.", "如存在滥用、安全风险、法律要求或重大违反本条款的情况，访问可能会被限制或暂停。")],
      ],
    },
    support: {
      eyebrow: "SUPPORT",
      title: tr("Remote Arc Support", "Remote Arc 支持"),
      intro: tr(
        "For setup help, bug reports, security issues or account and data requests, use the channels below.",
        "如需安装帮助、Bug 反馈、安全问题或账户与数据请求，可使用以下渠道。",
      ),
      sections: [
        [tr("Documentation", "文档"), tr("Start with the MCP setup guide and product documentation for pairing, permissions and AI-client connection instructions.", "可先查看 MCP 接入指南和产品文档，了解配对、权限与 AI 客户端连接说明。")],
        [tr("Bug reports", "Bug 反馈"), tr("Use the GitHub repository for reproducible product and developer issues. Do not include device credentials, OAuth tokens or private file contents.", "可通过 GitHub 仓库提交可复现的产品与开发问题。请勿附带设备凭证、OAuth Token 或私人文件内容。")],
        [tr("Security", "安全问题"), tr("Review SECURITY.md before reporting a vulnerability and avoid publishing sensitive exploit details in a public issue.", "报告漏洞前请阅读 SECURITY.md，不要在公开 Issue 中发布敏感漏洞利用细节。")],
        [tr("Account and data requests", "账户与数据请求"), tr("For account deletion or hosted-data requests, contact the project maintainer through the support channel published on the Remote Arc website or repository.", "如需删除账户或请求托管数据，请通过 Remote Arc 官网或仓库公开的支持渠道联系项目维护者。")],
      ],
    },
  }[kind];

  return (
    <div className="publicPageShell">
      <PublicHeader user={user} />
      <main className="legalPage">
        <span className="eyebrow">{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <p className="legalIntro">{content.intro}</p>
        <div className="legalGrid">
          {content.sections.map(([title, body]) => (
            <section className="legalCard" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <div className="legalLinks">
          <a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a>
          <a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a>
          <a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a>
          <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
        </div>
      </main>
    </div>
  );
}

function App() {
  const { tr } = useI18n();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  async function loadMe() {
    try {
      const response = await fetch("/api/me", { headers: { accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        setUser(null);
        return;
      }
      const payload = (await response.json()) as { user: User };
      setUser(payload.user);
    } catch {
      setUser(null);
    }
  }

  async function loadAll() {
    try {
      const [devicesResponse, statusResponse] = await Promise.all([fetch("/api/devices"), fetch("/api/status")]);
      if (devicesResponse.ok) setDevices((await devicesResponse.json()) as Device[]);
      if (statusResponse.ok) setStatus((await statusResponse.json()) as ProductStatus);
    } catch {
      // Keep the last known dashboard state during a temporary network interruption.
    }
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

  const isAppHost = location.hostname === "mcp.remotearc.app";
  if (isAppHost && location.pathname === "/") {
    history.replaceState({}, "", "/overview");
  }

  if (location.pathname === "/device") return <PairDevice user={user} onSignedIn={loadMe} />;
  if (location.pathname === "/oauth/consent") return <OAuthConsent user={user} />;
  if (location.pathname === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (location.pathname === "/resources") return <ResourcesPage user={user === undefined ? null : user} />;
  if (location.pathname === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;
  if (location.pathname === "/privacy") return <LegalPage kind="privacy" user={user === undefined ? null : user} />;
  if (location.pathname === "/terms") return <LegalPage kind="terms" user={user === undefined ? null : user} />;
  if (location.pathname === "/support") return <LegalPage kind="support" user={user === undefined ? null : user} />;

  if (isAppHost && (location.pathname === "/dashboard" || Object.values(DASHBOARD_PATHS).includes(location.pathname))) {
    if (user === undefined) {
      return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Connecting to Remote Arc.", "正在连接 Remote Arc。")} />;
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
