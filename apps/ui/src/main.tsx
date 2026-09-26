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

type SecurityGrant = {
  clientId: string;
  clientName: string;
  scopes: string[];
  authorizedAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string | null;
};

type SecurityState = {
  mcpPaused: boolean;
  grants: SecurityGrant[];
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
    <PublicLayout user={user}>
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
        <div className="heroArchitecture" aria-label={tr("How Remote Arc connects AI clients to your devices", "Remote Arc 如何连接 AI 客户端与设备")}>
          <div className="architectureLabel">{tr("YOUR AI", "你的 AI")}</div>
          <div className="architectureClients">
            <div><img src={aiClients[0].icon} alt="" /><strong>{aiClients[0].name}</strong></div>
            <div><img src={aiClients[1].icon} alt="" /><strong>{aiClients[1].name}</strong></div>
            <div><span className="protocolMark">M</span><strong>{tr("Any MCP client", "任意 MCP 客户端")}</strong></div>
          </div>

          <div className="architectureArrow">
            <span>↓</span>
            <small>{tr("Plugin / Remote MCP + OAuth", "Plugin / Remote MCP + OAuth")}</small>
          </div>

          <div className="architectureCore">
            <LogoMark />
            <div>
              <strong>Remote Arc</strong>
              <small>{tr("Secure routing · device presence · permissions", "安全路由 · 设备在线状态 · 权限控制")}</small>
            </div>
          </div>

          <div className="architectureArrow">
            <span>↓</span>
            <small>{tr("Encrypted outbound device connection", "设备安全出站连接")}</small>
          </div>

          <div className="architectureLabel">{tr("YOUR DEVICES", "你的设备")}</div>
          <div className="architectureDevices">
            <div><span>⊞</span><strong>Windows</strong></div>
            <div><span>⌘</span><strong>macOS</strong></div>
            <div><span>›_</span><strong>Linux</strong></div>
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

      <section className="platformSection">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("PLATFORM SECURITY & RELIABILITY", "平台安全与可靠性")}</span>
            <h2>{tr("Built to stay controllable when AI gets powerful.", "AI 越强，控制边界越要清楚。")}</h2>
          </div>
          <p>{tr(
            "Remote Arc now combines account-level emergency controls, revocable OAuth grants, Cloudflare edge protection and persistent device heartbeat into the hosted control plane.",
            "Remote Arc 现在把账户级紧急控制、可撤销 OAuth 授权、Cloudflare 边缘保护与持续设备心跳整合进托管控制面。"
          )}</p>
        </div>
        <div className="platformCapabilityGrid">
          <article>
            <span className="platformCapabilityIcon">Ⅱ</span>
            <div><strong>{tr("Emergency MCP pause", "紧急暂停 MCP")}</strong><p>{tr("Pause every authenticated Remote MCP call for your account with one control, then resume when you are ready.", "一个开关即可暂停账户下所有已认证 Remote MCP 调用，需要时再恢复。")}</p></div>
            <small>{tr("Server enforced", "服务端强制执行")}</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">↺</span>
            <div><strong>{tr("Revocable AI access", "可撤销 AI 授权")}</strong><p>{tr("See active OAuth clients and scopes, then revoke access and refresh tokens per AI client.", "查看活跃 OAuth 客户端与 Scope，并可按 AI 客户端撤销访问权限和 Refresh Token。")}</p></div>
            <small>OAuth 2.1 + PKCE</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">⌁</span>
            <div><strong>{tr("Cloudflare edge rate limits", "Cloudflare 边缘限流")}</strong><p>{tr("Authenticated MCP traffic and sensitive auth/pairing endpoints are protected by separate edge limits before application execution.", "已认证 MCP 流量与敏感认证/配对入口使用独立边缘限流，在应用执行前先拦截异常流量。")}</p></div>
            <small>120/min MCP · 30/min auth</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">♥</span>
            <div><strong>{tr("Persistent device heartbeat", "持续设备心跳")}</strong><p>{tr("The local agent periodically refreshes last-seen state so presence and device history stay useful after disconnects.", "本地 Agent 会周期性刷新 last-seen，让设备断开后仍能准确看到最近在线时间。")}</p></div>
            <small>60s heartbeat</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">◇</span>
            <div><strong>{tr("Per-device policy", "每设备权限策略")}</strong><p>{tr("Tool access is enforced by the relay and constrained again by what each local agent actually exposes.", "工具权限先由 Relay 强制执行，再受每台本机 Agent 实际开放能力约束。")}</p></div>
            <small>{tr("Defense in depth", "纵深防御")}</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">≡</span>
            <div><strong>{tr("Privacy-preserving audit", "隐私友好审计")}</strong><p>{tr("Track device, tool, result and time without intentionally storing file contents, command arguments or credentials in the audit feed.", "记录设备、工具、结果与时间，同时不会有意在审计记录中保存文件内容、命令参数或凭证。")}</p></div>
            <small>{tr("Operational metadata only", "仅运行元数据")}</small>
          </article>
        </div>
        <div className="platformFootnote">
          <code>edge → oauth → relay policy → local agent</code>
          <a href="/resources#security-control-plane">{tr("Read the security architecture →", "阅读安全架构 →")}</a>
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
    [tr("Quick start", "快速开始"), tr("Pair a computer with one command and connect it to the hosted relay.", "一条命令配对电脑并连接到托管 Relay。"), "/docs/mcp", "START"],
    [tr("Control-plane architecture", "控制面架构"), tr("How Worker, D1, Durable Objects and the device agent cooperate to route Remote MCP calls.", "了解 Worker、D1、Durable Objects 与设备 Agent 如何协同路由 Remote MCP 调用。"), "#control-plane-architecture", "ARCH"],
    [tr("Security control plane", "安全控制面"), tr("Emergency pause, revocable OAuth grants, per-device policy and layered enforcement.", "紧急暂停、可撤销 OAuth 授权、每设备策略与多层权限执行。"), "#security-control-plane", "SEC"],
    [tr("Cloudflare edge protection", "Cloudflare 边缘保护"), tr("Why Remote Arc rate-limits MCP traffic separately from auth and pairing endpoints.", "为什么 Remote Arc 会分别对 MCP 流量与认证、配对入口做独立限流。"), "#edge-protection", "EDGE"],
    [tr("Presence & heartbeat", "在线状态与心跳"), tr("How WebSocket presence and persistent heartbeat combine to produce useful online and last-seen state.", "WebSocket 在线状态与持久心跳如何共同提供可靠的在线与最近在线信息。"), "#presence-heartbeat", "LIVE"],
    [tr("OAuth 2.1 for Remote MCP", "Remote MCP 的 OAuth 2.1"), tr("PKCE, scopes, access tokens, refresh tokens and per-client revocation in a remote-control product.", "PKCE、Scope、Access Token、Refresh Token 与按客户端撤销如何应用到远程控制产品。"), "#oauth-remote-mcp", "AUTH"],
    [tr("Per-device permissions", "每设备权限"), tr("Why tool access is enforced twice: once at the relay and again by the local agent.", "为什么工具权限要执行两次：Relay 一次，本地 Agent 再一次。"), "#per-device-permissions", "POLICY"],
    [tr("Privacy-preserving audit", "隐私友好审计"), tr("Operational visibility without intentionally persisting file contents, command arguments or credentials.", "在不主动持久化文件内容、命令参数与凭证的前提下获得运行可观测性。"), "#privacy-audit", "AUDIT"],
    [tr("Security policy", "安全策略"), tr("Read the public security policy and vulnerability-reporting guidance.", "查看公开安全策略与漏洞报告指引。"), "https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md", "POLICY"],
    [tr("Source code", "源代码"), tr("Inspect the implementation and follow Remote Arc development on GitHub.", "在 GitHub 查看实现并跟踪 Remote Arc 开发。"), "https://github.com/yaohuangguan/remote-arc", "CODE"],
  ];
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">{tr("RESOURCES", "资源")}</span>
        <h1>{tr("Understand the system behind Remote Arc.", "了解 Remote Arc 背后的系统。")}</h1>
        <p>{tr("Explore the architecture, MCP protocol and product documentation behind the managed Remote Arc service.", "了解 Remote Arc 托管服务背后的架构、MCP 协议与产品文档。")}</p>
      </section>
      <section className="resourceGrid techResourceGrid">
        {items.map(([title, body, href, tag]) => (
          <a className="resourceCard techResourceCard" href={href} key={title}>
            <div className="resourceMeta"><span>{tag}</span><em>↗</em></div>
            <h2>{title}</h2><p>{body}</p>
          </a>
        ))}
      </section>

      <section className="resourceArticles">
        <article id="control-plane-architecture">
          <span className="resourceArticleTag">ARCHITECTURE / 01</span>
          <h2>{tr("Control-plane architecture", "控制面架构")}</h2>
          <p>{tr("Remote Arc splits responsibility across the hosted control plane and the local device agent. Cloudflare Workers handle HTTP, OAuth and API entry points; D1 stores durable identity, device and audit metadata; Durable Objects maintain live device presence and WebSocket routing; the local agent is the final execution boundary.", "Remote Arc 将职责拆分到托管控制面与本地设备 Agent。Cloudflare Workers 负责 HTTP、OAuth 与 API 入口；D1 保存持久身份、设备与审计元数据；Durable Objects 维护实时在线状态与 WebSocket 路由；本地 Agent 则是最终执行边界。")}</p>
          <div className="resourceCodeRail"><code>AI client</code><span>→</span><code>Worker</code><span>→</span><code>Durable Object</code><span>→</span><code>Device Agent</code></div>
        </article>

        <article id="security-control-plane">
          <span className="resourceArticleTag">SECURITY / 02</span>
          <h2>{tr("Security control plane", "安全控制面")}</h2>
          <p>{tr("Security is enforced at multiple layers instead of relying on one permission check. OAuth scopes constrain the AI client, the hosted relay applies account and per-device policy, and the local agent only executes tools it actually exposes. The account-level MCP pause can stop all authenticated calls immediately.", "安全不是依赖单一权限判断，而是多层执行。OAuth Scope 限制 AI 客户端，托管 Relay 执行账户级与设备级策略，本地 Agent 只执行自己实际开放的工具。账户级 MCP Pause 可以立即停止全部已认证调用。")}</p>
          <div className="resourceCodeRail"><code>OAuth scope</code><span>→</span><code>Relay policy</code><span>→</span><code>Device policy</code><span>→</span><code>Execution</code></div>
        </article>

        <article id="edge-protection">
          <span className="resourceArticleTag">CLOUDFLARE / 03</span>
          <h2>{tr("Edge protection", "边缘保护")}</h2>
          <p>{tr("Remote Arc uses Cloudflare Workers Rate Limiting before application execution. Authenticated MCP traffic is keyed by user and OAuth client, while OAuth, pairing and token endpoints use a separate, tighter limiter. This reduces runaway-agent loops, credential abuse and accidental quota burn.", "Remote Arc 使用 Cloudflare Workers Rate Limiting 在应用执行前进行拦截。已认证 MCP 流量按用户与 OAuth 客户端组合限流，而 OAuth、配对与 Token 入口使用独立、更严格的限制，从而降低 Agent 死循环、凭证滥用和意外耗尽额度的风险。")}</p>
          <div className="resourceMetricRow"><div><strong>120/min</strong><span>MCP traffic</span></div><div><strong>30/min</strong><span>Auth & pairing</span></div><div><strong>429</strong><span>Retry-After</span></div></div>
        </article>

        <article id="presence-heartbeat">
          <span className="resourceArticleTag">PRESENCE / 04</span>
          <h2>{tr("Presence and heartbeat", "在线状态与心跳")}</h2>
          <p>{tr("Live presence and durable history solve different problems. WebSocket presence answers whether a device is reachable right now. The local agent also sends a periodic authenticated heartbeat so D1 keeps an accurate last-seen timestamp after the socket disconnects.", "实时在线状态与持久历史解决的是不同问题。WebSocket Presence 用来判断设备此刻是否可达；本地 Agent 还会周期性发送经过认证的 heartbeat，让 D1 在连接断开后仍保留准确的 last-seen 时间。")}</p>
          <div className="resourceMetricRow"><div><strong>WebSocket</strong><span>{tr("live presence", "实时在线")}</span></div><div><strong>60s</strong><span>{tr("heartbeat", "心跳间隔")}</span></div><div><strong>D1</strong><span>last_seen</span></div></div>
        </article>

        <article id="oauth-remote-mcp">
          <span className="resourceArticleTag">AUTH / 05</span>
          <h2>{tr("OAuth 2.1 for Remote MCP", "Remote MCP 的 OAuth 2.1")}</h2>
          <p>{tr("Remote Arc avoids copied long-lived secrets between AI clients and the control plane. OAuth 2.1 with PKCE provides explicit scopes, short-lived access tokens and refresh tokens. Active grants are visible in the Security Center and can be revoked per client.", "Remote Arc 避免在 AI 客户端与控制面之间复制长期密钥。OAuth 2.1 + PKCE 提供明确 Scope、短期 Access Token 与 Refresh Token。活跃授权可在 Security Center 中查看，并可按客户端单独撤销。")}</p>
          <div className="resourceCodeRail"><code>authorize</code><span>→</span><code>PKCE</code><span>→</span><code>access token</code><span>→</span><code>refresh / revoke</code></div>
        </article>

        <article id="per-device-permissions">
          <span className="resourceArticleTag">POLICY / 06</span>
          <h2>{tr("Per-device permissions", "每设备权限")}</h2>
          <p>{tr("A laptop used for development does not need the same exposure as a home server. Remote Arc stores per-device tool policy in the control plane, blocks disabled tools before routing, and still respects the local agent's advertised capability set.", "开发用笔记本与家庭服务器不应暴露同样的能力。Remote Arc 在控制面保存每设备工具策略，在路由前拦截被关闭的工具，同时仍严格受本地 Agent 实际声明的能力集合约束。")}</p>
          <div className="resourceCodeRail"><code>read_file</code><span>✓</span><code>start_process</code><span>?</span><code>write_file</code><span>×</span></div>
        </article>

        <article id="privacy-audit">
          <span className="resourceArticleTag">AUDIT / 07</span>
          <h2>{tr("Privacy-preserving audit", "隐私友好审计")}</h2>
          <p>{tr("The activity feed is designed for operational visibility rather than content retention. Remote Arc records metadata such as tool name, device, result and time, while file contents, command arguments, OAuth tokens and raw device credentials are not intentionally stored in audit records.", "活动记录用于运行可观测性，而不是内容留存。Remote Arc 记录工具名称、设备、结果与时间等元数据，而不会有意在审计记录中保存文件内容、命令参数、OAuth Token 或原始设备凭证。")}</p>
          <div className="resourceAuditMatrix"><span>✓ tool</span><span>✓ device</span><span>✓ result</span><span>✓ time</span><span>× file contents</span><span>× command args</span><span>× credentials</span></div>
        </article>
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
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
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
  const filteredDevices = useMemo(() => {
    const query = deviceQuery.trim().toLowerCase();
    return devices
      .filter((device) => deviceFilter === "all" || device.status === deviceFilter)
      .filter((device) => !query || [device.name, device.hostname, device.platform, device.arch, device.id].some((value) => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
  }, [devices, deviceFilter, deviceQuery]);

  const usage = status?.usage;
  const usagePct = usage?.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  async function refreshSecurity() {
    const response = await fetch("/api/security");
    if (!response.ok) return;
    setSecurityState(await response.json() as SecurityState);
  }

  useEffect(() => {
    if (active === "security") void refreshSecurity();
  }, [active]);

  async function setMcpPaused(paused: boolean) {
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!response.ok) {
        alert(tr("Could not update Remote MCP access.", "无法更新 Remote MCP 访问状态。"));
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeGrant(grant: SecurityGrant) {
    if (!confirm(tr(
      "Revoke " + grant.clientName + "? This AI client will need to authorize Remote Arc again.",
      "撤销 " + grant.clientName + "？该 AI 客户端之后需要重新授权 Remote Arc。",
    ))) return;

    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/grants/" + encodeURIComponent(grant.clientId) + "/revoke", { method: "POST" });
      if (!response.ok) {
        alert(tr("Could not revoke this AI connection.", "无法撤销这个 AI 连接。"));
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

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
    if (event.event_type === "security.mcp_paused") return tr("Remote MCP paused", "Remote MCP 已暂停");
    if (event.event_type === "security.mcp_resumed") return tr("Remote MCP resumed", "Remote MCP 已恢复");
    if (event.event_type === "security.oauth_grant_revoked") return tr("AI access revoked", "AI 访问已撤销");
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
            <section className="overviewTopbar">
              <div>
                <span className="eyebrow">{tr("OVERVIEW", "概览")}</span>
                <h1>{tr("Control plane", "控制面")}</h1>
                <p>{tr("Live status for your devices, MCP access and hosted usage.", "查看设备、MCP 接入与托管额度的实时状态。")}</p>
              </div>
              <div className="overviewActions">
                <button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button>
                <button className="addButton goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
              </div>
            </section>
            <section className="overviewStatusGrid">
              <article className="overviewStatusCard primary"><div className="statusCardHead"><span>{tr("System status", "系统状态")}</span><i className="healthDot good" /></div><strong>{tr("Operational", "运行正常")}</strong><small>Remote MCP · OAuth 2.1 + PKCE</small></article>
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Devices online", "在线设备")}</span><i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} /></div><strong>{status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Monthly usage", "本月用量")}</span><span>{Math.round(usagePct)}%</span></div><strong>{(usage?.used ?? 0).toLocaleString()}</strong><div className="miniUsageBar"><i style={{ width: usagePct + "%" }} /></div><small>{tr("of", "共")} {(usage?.limit ?? 10000).toLocaleString()} {tr("hosted calls", "次托管调用")}</small></article>
              <article className="overviewStatusCard endpoint"><div className="statusCardHead"><span>Remote MCP</span><span className="privacyPill">{tr("Secure", "安全")}</span></div><code>{mcpEndpoint}</code><div className="statusCardActions"><CopyButton value={mcpEndpoint} label={tr("Copy", "复制")} /><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Manage", "管理")}</button></div></article>
            </section>

            <section className="overviewQuickGrid">
              <article className="overviewQuickCard">
                <span className="eyebrow">{tr("QUICK ACTIONS", "快捷操作")}</span>
                <div className="quickActionList">
                  <button onClick={() => setShowAdd(true)}><span>＋</span><div><strong>{tr("Pair a computer", "配对电脑")}</strong><small>{tr("Add Windows, macOS or Linux", "添加 Windows、macOS 或 Linux")}</small></div></button>
                  <button onClick={() => navigateTab("connect")}><span>↗</span><div><strong>{tr("Connect an AI client", "连接 AI 客户端")}</strong><small>ChatGPT · Claude · Remote MCP</small></div></button>
                  <button onClick={() => navigateTab("security")}><span>◇</span><div><strong>{tr("Review security", "检查安全设置")}</strong><small>{tr("Sessions, scopes and device policies", "会话、Scope 与设备权限")}</small></div></button>
                  <button onClick={() => navigateTab("settings")}><span>⚙</span><div><strong>{tr("Usage & settings", "额度与设置")}</strong><small>{tr("Hosted allowance and preferences", "托管额度与偏好设置")}</small></div></button>
                </div>
              </article>
              <article className="overviewAttentionCard">
                <span className="eyebrow">{tr("ATTENTION", "需要关注")}</span>
                <div className="attentionList">
                  {!devices.length && <button onClick={() => setShowAdd(true)}><i className="attentionIcon warn">!</i><div><strong>{tr("No computer paired", "还没有配对电脑")}</strong><small>{tr("Pair your first device to start using Remote Arc.", "先配对第一台设备即可开始使用 Remote Arc。")}</small></div></button>}
                  {!!devices.length && devices.some((device) => device.status === "offline") && <button onClick={() => navigateTab("devices")}><i className="attentionIcon idle">•</i><div><strong>{tr("Some devices are offline", "部分设备离线")}</strong><small>{devices.filter((device) => device.status === "offline").length} {tr("device(s) unavailable for MCP calls", "台设备当前无法接受 MCP 调用")}</small></div></button>}
                  {usagePct >= 80 && <button onClick={() => navigateTab("settings")}><i className="attentionIcon warn">!</i><div><strong>{tr("Usage is getting high", "本月额度使用较高")}</strong><small>{Math.round(usagePct)}% {tr("of your monthly hosted allowance is used", "的每月托管额度已使用")}</small></div></button>}
                  {(status?.onlineDevices ?? 0) > 0 && usagePct < 80 && <div className="attentionClear"><i>✓</i><div><strong>{tr("Everything looks good", "当前状态良好")}</strong><small>{tr("At least one device is online and Remote MCP is ready.", "至少一台设备在线，Remote MCP 已就绪。")}</small></div></div>}
                </div>
              </article>
            </section>

            <section className="overviewMainGrid">
              <div className="panelBlock overviewDevicesPanel">
                <div className="blockHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Device status", "设备状态")}</h2></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button></div>
                <div className="overviewDeviceList">
                  {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).slice(0,5).map((device) => (
                    <button className="overviewDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                      <div className="deviceIcon">{platformGlyph(device.platform)}</div>
                      <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                      <div className="overviewDeviceMeta"><span>{device.tools.length} tools</span><small>{timeAgo(device.last_seen)}</small></div>
                      <span className={"badge " + device.status}><i/>{device.status}</span>
                    </button>
                  ))}
                  {!devices.length && <button className="overviewDeviceRow empty" onClick={() => setShowAdd(true)}><div className="deviceIcon">＋</div><div><strong>{tr("Add your first computer", "添加第一台电脑")}</strong><span>{tr("One command, then approve in your browser", "一条命令，然后在浏览器确认")}</span></div></button>}
                </div>
              </div>

              <div className="panelBlock overviewActivityPanel">
                <div className="blockHeader"><div><span className="eyebrow">{tr("RECENT ACTIVITY", "最近活动")}</span><h2>{tr("What Remote Arc did", "Remote Arc 最近做了什么")}</h2></div><span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span></div>
                <div className="activityList">
                  {(status?.recentActivity || []).map((event) => (
                    <div className="activityItem" key={event.id}><i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i><div><strong>{eventLabel(event)}</strong><span>{event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}</span></div></div>
                  ))}
                  {!status?.recentActivity?.length && <div className="activityEmpty"><strong>{tr("No activity yet", "暂无活动")}</strong><span>{tr("Pair a device or call a tool from your AI client.", "配对设备或从 AI 客户端发起工具调用。")}</span></div>}
                </div>
              </div>
            </section>


          </>
        )}

        {active === "devices" && (
          <>
            <section className="pageHeader devicesPageHeader">
              <div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h1>{tr("Your computers.", "你的电脑。")}</h1><p>{tr("Pair, monitor and control exactly what each computer exposes to your AI.", "配对、监控并精确控制每台电脑向 AI 开放的能力。")}</p></div>
              <button className="addButton goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
            </section>

            <section className="deviceStatsGrid">
              <article><span>{tr("Total devices", "设备总数")}</span><strong>{devices.length}</strong><small>Windows · macOS · Linux</small></article>
              <article><span>{tr("Online now", "当前在线")}</span><strong>{devices.filter((device) => device.status === "online").length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
              <article><span>{tr("Tool access", "工具权限")}</span><strong>{devices.reduce((sum, device) => sum + (device.allowed_tools?.length ?? device.tools.length), 0)}</strong><small>{tr("Enabled across all devices", "全部设备已启用工具数")}</small></article>
            </section>

            <section className="deviceToolbar">
              <div className="deviceSearch">
                <span>⌕</span>
                <input value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder={tr("Search devices, hostname or ID", "搜索设备、Hostname 或 ID")} />
              </div>
              <div className="deviceFilters" role="tablist" aria-label={tr("Device status filter", "设备状态筛选")}>
                {(["all", "online", "offline"] as const).map((filter) => (
                  <button key={filter} className={deviceFilter === filter ? "active" : ""} onClick={() => setDeviceFilter(filter)}>
                    {filter === "all" ? tr("All", "全部") : filter === "online" ? tr("Online", "在线") : tr("Offline", "离线")}
                    <span>{filter === "all" ? devices.length : devices.filter((device) => device.status === filter).length}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="deviceGrid rich deviceManagementGrid">
              {filteredDevices.map((device) => {
                const advertisedTools = device.available_tools || device.tools;
                const enabledTools = device.allowed_tools == null ? advertisedTools : device.allowed_tools;
                const allTools = Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertisedTools, ...enabledTools]));
                return (
                  <article className={"deviceCard managed " + device.status} key={device.id}>
                    <div className="deviceTop">
                      <div className="deviceIdentity">
                        <div className="deviceIcon large">{platformGlyph(device.platform)}</div>
                        <div><h3>{device.name}</h3><span>{platformLabel(device.platform)} · {device.arch || "unknown"} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                      </div>
                      <span className={"badge " + device.status}><i/>{device.status}</span>
                    </div>

                    <div className="deviceStatusStrip">
                      <div><span>{tr("Last seen", "最后在线")}</span><strong>{timeAgo(device.last_seen)}</strong></div>
                      <div><span>{tr("Enabled tools", "已启用工具")}</span><strong>{enabledTools.length} / {allTools.length}</strong></div>
                      <div><span>Device ID</span><strong>{device.id.slice(0,8)}</strong></div>
                    </div>

                    <div className="deviceAccessSummary">
                      <div>
                        <span className="eyebrow">{tr("MCP ACCESS", "MCP 权限")}</span>
                        <strong>{device.status === "online" ? tr("Policy enforced now", "权限策略已实时生效") : tr("Policy saved for reconnect", "权限策略将在重连后生效")}</strong>
                        <p>{tr("Remote Arc blocks disabled tools at the relay before a request reaches this computer.", "关闭的工具会在 Relay 层被拦截，不会到达这台电脑。")}</p>
                      </div>
                      <div className="deviceToolChips">
                        {enabledTools.slice(0,4).map((tool) => <span key={tool}>{tool}</span>)}
                        {enabledTools.length > 4 && <span>+{enabledTools.length - 4}</span>}
                      </div>
                    </div>

                    <details className="deviceToolDetails">
                      <summary>{tr("Manage tool access", "管理工具权限")}<span>{allTools.length} tools</span></summary>
                      <div className="toolToggleGrid">
                        {allTools.map((tool) => {
                          const enabled = device.allowed_tools == null ? (device.status === "online" ? advertisedTools.includes(tool) : true) : device.allowed_tools.includes(tool);
                          const advertised = device.status === "online" ? advertisedTools.includes(tool) : true;
                          return <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}><input type="checkbox" checked={enabled} disabled={!advertised} onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)} /><span>{tool}</span></label>;
                        })}
                      </div>
                      {device.status === "offline" && <span className="offlineTools">{tr("Offline: changes are saved now and enforced the next time this device connects.", "设备离线：修改会立即保存，并在设备下次连接时生效。")}</span>}
                    </details>

                    <div className="deviceActions managedActions">
                      <button className="ghostButton" onClick={() => void rename(device)}>{tr("Rename", "重命名")}</button>
                      <CopyButton value={device.id} label={tr("Copy ID", "复制 ID")}/>
                      <button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Revoke", "撤销")}</button>
                    </div>
                  </article>
                );
              })}

              {!devices.length && <article className="emptyCard wide"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button onClick={() => setShowAdd(true)}>{tr("Add your first device", "添加第一台设备")}</button></article>}
              {!!devices.length && !filteredDevices.length && <article className="emptyCard wide"><div className="emptyIcon">⌕</div><h3>{tr("No matching devices", "没有匹配设备")}</h3><p>{tr("Try another search or clear the status filter.", "尝试其他搜索词，或清除状态筛选。")}</p><button onClick={() => { setDeviceQuery(""); setDeviceFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></article>}
            </div>
          </>
        )}

        {active === "connect" && (
          <>
            <section className="pageHeader connectPageHeader">
              <div>
                <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
                <h1>{tr("Bring your AI to your computers.", "让你的 AI 连接到你的电脑。")}</h1>
                <p>{tr("Use one Remote Arc account and one OAuth-protected MCP endpoint across supported AI clients.", "一个 Remote Arc 账户、一个受 OAuth 保护的 MCP 地址，就能连接支持 Remote MCP 的 AI 客户端。")}</p>
              </div>
              <div className="connectReadyPill"><i />{tr("Remote MCP ready", "Remote MCP 已就绪")}</div>
            </section>

            <section className="connectOverview">
              <article className="connectEndpointPanel">
                <div className="connectPanelHeader">
                  <div>
                    <span className="eyebrow">{tr("YOUR REMOTE MCP ENDPOINT", "你的 REMOTE MCP 地址")}</span>
                    <h2>{tr("One endpoint. Every paired device.", "一个端点，连接全部已配对设备。")}</h2>
                    <p>{tr("Your AI connects here. Remote Arc handles OAuth, device discovery and routing behind it.", "AI 只需要连接这个地址；OAuth、设备发现和请求路由都由 Remote Arc 处理。")}</p>
                  </div>
                  <span className="connectSecurityBadge">OAuth 2.1 + PKCE</span>
                </div>
                <div className="connectEndpointBox">
                  <code>{mcpEndpoint}</code>
                  <CopyButton value={mcpEndpoint} label={tr("Copy endpoint", "复制地址")} />
                </div>
              </article>

              <aside className="connectHealthPanel">
                <span className="eyebrow">{tr("CONNECTION STATUS", "连接状态")}</span>
                <div className="connectHealthRow"><span><i className="healthDot good" />Remote MCP</span><strong>{tr("Ready", "就绪")}</strong></div>
                <div className="connectHealthRow"><span><i className="healthDot good" />OAuth</span><strong>{tr("Enabled", "已启用")}</strong></div>
                <div className="connectHealthRow"><span><i className={"healthDot " + (devices.length ? "good" : "idle")} />{tr("Paired devices", "已配对设备")}</span><strong>{devices.length}</strong></div>
                <button className="ghostButton connectDevicesButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button>
              </aside>
            </section>

            <section className="connectClientSection">
              <div className="connectSectionHeading">
                <div><span className="eyebrow">{tr("CHOOSE YOUR AI", "选择你的 AI")}</span><h2>{tr("Connect the client you actually use.", "连接你真正使用的客户端。")}</h2></div>
                <p>{tr("ChatGPT is the recommended path. Other Remote MCP clients can use the same production endpoint.", "推荐优先使用 ChatGPT；其他支持 Remote MCP 的客户端也可以使用同一个生产地址。")}</p>
              </div>

              <div className="connectClientGrid">
                <article className="connectClientCard primary">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img src={aiClients[0].icon} alt="" /><div><span className="eyebrow">CHATGPT</span><h3>ChatGPT</h3></div></div>
                    <span className="clientState recommended">{tr("Recommended", "推荐")}</span>
                  </div>
                  <p>{tr("Remote Arc is prepared for the public Plugins flow. Until the public listing is live, use the manual MCP setup below for early access.", "Remote Arc 已按公开 Plugin 流程准备完成；正式上架前，可通过下方手动 MCP 流程进行 Early Access。")}</p>
                  <div className="connectMiniSteps">
                    <span><b>1</b>{tr("Open Settings → Apps", "打开 Settings → Apps")}</span>
                    <span><b>2</b>{tr("Create a custom MCP app", "创建自定义 MCP App")}</span>
                    <span><b>3</b>{tr("Paste endpoint → Scan Tools → OAuth", "粘贴地址 → Scan Tools → OAuth")}</span>
                  </div>
                  <div className="connectClientFooter"><span className="clientHint">{tr("Public listing pending", "公开上架准备中")}</span><CopyButton value={mcpEndpoint} label={tr("Copy MCP URL", "复制 MCP 地址")} /></div>
                </article>

                <article className="connectClientCard">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img src={aiClients[1].icon} alt="" /><div><span className="eyebrow">CLAUDE</span><h3>Claude</h3></div></div>
                    <span className="clientState">{tr("Remote MCP", "Remote MCP")}</span>
                  </div>
                  <p>{tr("If your Claude client exposes a Remote MCP / custom integration flow, use the same endpoint and complete Remote Arc OAuth.", "如果你的 Claude 客户端提供 Remote MCP / 自定义集成入口，使用同一个地址并完成 Remote Arc OAuth 即可。")}</p>
                  <div className="connectClientFooter"><span className="clientHint">{tr("Same account · same devices", "同一账户 · 同一设备")}</span><CopyButton value={mcpEndpoint} label={tr("Copy endpoint", "复制地址")} /></div>
                </article>

                <article className="connectClientCard">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><span className="protocolMark large">M</span><div><span className="eyebrow">REMOTE MCP</span><h3>{tr("Any MCP client", "任意 MCP 客户端")}</h3></div></div>
                    <span className="clientState">{tr("Standards-based", "标准协议")}</span>
                  </div>
                  <p>{tr("Use Remote Arc anywhere the client supports remote MCP servers and OAuth. No separate endpoint is required per device.", "只要客户端支持 Remote MCP Server 与 OAuth，就可以直接接入 Remote Arc；每台设备不需要单独配置地址。")}</p>
                  <div className="connectClientFooter"><span className="clientHint">OAuth 2.1 + PKCE</span><CopyButton value={mcpEndpoint} label={tr("Copy endpoint", "复制地址")} /></div>
                </article>
              </div>
            </section>

            <section className="connectGuide">
              <div className="connectSectionHeading compact">
                <div><span className="eyebrow">{tr("SETUP FLOW", "连接流程")}</span><h2>{tr("Three steps from endpoint to real machine.", "三步从 MCP 地址连接到真实电脑。")}</h2></div>
              </div>
              <div className="connectTimeline">
                <article><span className="timelineNumber">01</span><div><strong>{tr("Add Remote Arc", "添加 Remote Arc")}</strong><p>{tr("Install the public plugin when available, or add the Remote MCP endpoint manually during early access.", "公开插件上线后直接安装；Early Access 阶段则手动添加 Remote MCP 地址。")}</p></div></article>
                <article><span className="timelineNumber">02</span><div><strong>{tr("Authorize your account", "授权你的账户")}</strong><p>{tr("Remote Arc opens OAuth once. Your AI receives scoped access to the account you approve.", "Remote Arc 会打开一次 OAuth 授权；AI 只获得你批准账户范围内的权限。")}</p></div></article>
                <article><span className="timelineNumber">03</span><div><strong>{tr("Talk to a device by name", "直接说设备名称")}</strong><p>{tr("Remote Arc discovers your paired devices and enforces each device's tool policy before routing a request.", "Remote Arc 会发现已配对设备，并在路由请求前执行每台设备自己的工具权限策略。")}</p></div></article>
              </div>
            </section>

            <section className="connectTryPanel">
              <div className="connectTryCopy"><span className="eyebrow">{tr("TRY IT NOW", "马上试试")}</span><h2>{tr("Start with a natural request.", "直接用自然语言开始。")}</h2><p>{tr("Once connected, you do not need MCP syntax. Just refer to the device and the task.", "连接后不需要记任何 MCP 语法，只需要说设备和任务。")}</p></div>
              <div className="connectPromptGrid">
                {[
                  tr("Show me my connected computers.", "看看我已连接的电脑。"),
                  tr("Which of my devices are online?", "哪些设备现在在线？"),
                  tr("List the projects on my Mac.", "列出我 Mac 上的项目。"),
                  tr("Read package.json on my desktop.", "读取我桌面电脑上的 package.json。"),
                  tr("Run the tests on my desktop.", "在我的桌面电脑上运行测试。"),
                  tr("Show me the processes running on my computer.", "看看我电脑上正在运行哪些进程。"),
                ].map((prompt) => <code key={prompt}>{prompt}</code>)}
              </div>
            </section>
          </>
        )}

        {active === "security" && (
          <>
            <section className="securityTopbar">
              <div>
                <span className="eyebrow">{tr("SECURITY", "安全")}</span>
                <h1>{tr("Security center", "安全中心")}</h1>
                <p>{tr("Review authentication, device exposure and recent Remote Arc activity.", "查看身份验证、设备暴露范围与 Remote Arc 最近活动。")}</p>
              </div>
              <div className="securityTopActions">
                <button className={securityState?.mcpPaused ? "goldButton" : "dangerButton"} disabled={securityBusy} onClick={() => void setMcpPaused(!securityState?.mcpPaused)}>
                  {securityState?.mcpPaused ? tr("Resume Remote MCP", "恢复 Remote MCP") : tr("Pause Remote MCP", "暂停 Remote MCP")}
                </button>
                <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Device permissions", "设备权限")}</button>
                <a className="ghostButton" href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md" target="_blank" rel="noreferrer">SECURITY.md</a>
              </div>
            </section>

            <section className="securityStatusGrid">
              <article className={"securityStatusCard primary" + (securityState?.mcpPaused ? " paused" : "")}>
                <div><span>{tr("Remote MCP", "Remote MCP")}</span><i className={"healthDot " + (securityState?.mcpPaused ? "idle" : "good")} /></div>
                <strong>{securityState?.mcpPaused ? tr("Paused", "已暂停") : tr("Protected", "已保护")}</strong>
                <small>{securityState?.mcpPaused ? tr("All authenticated MCP calls are blocked until you resume access.", "所有已认证 MCP 调用都会被拦截，直到你恢复访问。") : tr("OAuth, per-device credentials and relay enforcement are active.", "OAuth、每设备凭证与 Relay 权限拦截均已启用。")}</small>
              </article>
              <article className="securityStatusCard">
                <div><span>{tr("Authentication", "身份验证")}</span><span className="securityMiniState">OAuth</span></div>
                <strong>OAuth 2.1 + PKCE</strong>
                <small>{tr("Scoped access to the account you approve.", "仅授予你批准账户范围内的权限。")}</small>
              </article>
              <article className="securityStatusCard">
                <div><span>{tr("Device credentials", "设备凭证")}</span><span className="securityMiniState">{devices.length}</span></div>
                <strong>{tr("Unique per device", "每设备独立")}</strong>
                <small>{tr("Credentials are independently revocable; only hashes are stored.", "凭证可单独撤销，服务端仅保存哈希。")}</small>
              </article>
              <article className="securityStatusCard">
                <div><span>{tr("Edge protection", "边缘保护")}</span><span className="securityMiniState">Cloudflare</span></div>
                <strong>{tr("Rate limited", "已限流")}</strong>
                <small>{tr("Authenticated MCP traffic is capped per user/client; auth and pairing endpoints have separate limits.", "已认证 MCP 流量按用户/客户端限流；认证与配对入口使用独立限流。")}</small>
              </article>
            </section>

            <section className="securityPanel securityGrantsPanel">
              <div className="securityPanelHeader">
                <div><span className="eyebrow">{tr("CONNECTED AI ACCESS", "已连接 AI 访问")}</span><h2>{tr("OAuth grants", "OAuth 授权")}</h2><p>{tr("These AI clients currently hold active or refreshable access to your Remote Arc account.", "这些 AI 客户端当前仍持有可用或可刷新的 Remote Arc 访问权限。")}</p></div>
                <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
              </div>
              <div className="securityGrantList">
                {(securityState?.grants || []).map((grant) => (
                  <div className="securityGrantRow" key={grant.clientId}>
                    <div className="securityGrantIdentity">
                      <span className="securityGrantIcon">AI</span>
                      <div><strong>{grant.clientName}</strong><small>{grant.clientId.slice(0,12)}… · {tr("authorized", "授权于")} {timeAgo(grant.authorizedAt)}</small></div>
                    </div>
                    <div className="securityGrantScopes">{grant.scopes.map((scope) => <code key={scope}>{scope}</code>)}</div>
                    <div className="securityGrantExpiry"><span>{tr("Refresh access until", "刷新权限有效至")}</span><strong>{grant.refreshExpiresAt ? new Date(grant.refreshExpiresAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-NZ", { year: "numeric", month: "short", day: "numeric" }) : tr("No refresh token", "无 Refresh Token")}</strong></div>
                    <button className="dangerButton" disabled={securityBusy} onClick={() => void revokeGrant(grant)}>{tr("Revoke", "撤销")}</button>
                  </div>
                ))}
                {securityState && !securityState.grants.length && <div className="securityEmptyState compact"><strong>{tr("No active AI grants", "暂无活跃 AI 授权")}</strong><span>{tr("Connect ChatGPT, Claude or another MCP client to see its OAuth access here.", "连接 ChatGPT、Claude 或其他 MCP 客户端后，其 OAuth 权限会显示在这里。")}</span><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button></div>}
                {!securityState && <div className="securityEmptyState compact"><strong>{tr("Loading access grants…", "正在加载访问授权…")}</strong></div>}
              </div>
            </section>

            <section className="securityMainGrid">
              <article className="securityPanel securityExposurePanel">
                <div className="securityPanelHeader">
                  <div><span className="eyebrow">{tr("DEVICE EXPOSURE", "设备暴露范围")}</span><h2>{tr("What each computer exposes", "每台电脑开放了什么")}</h2></div>
                  <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button>
                </div>
                <div className="securityDeviceList">
                  {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).map((device) => {
                    const enabledCount = device.allowed_tools?.length ?? device.tools.length;
                    return <button className="securityDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                      <div className="deviceIcon">{platformGlyph(device.platform)}</div>
                      <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                      <div className="securityExposureMeta"><strong>{enabledCount}</strong><span>{tr("tools enabled", "个工具已启用")}</span></div>
                      <span className={"badge " + device.status}><i />{device.status}</span>
                    </button>;
                  })}
                  {!devices.length && <div className="securityEmptyState"><strong>{tr("No paired devices", "暂无配对设备")}</strong><span>{tr("Pair a computer before granting any tool access.", "先配对电脑，再开放任何工具权限。")}</span><button className="ghostButton" onClick={() => setShowAdd(true)}>{tr("Add device", "添加设备")}</button></div>}
                </div>
              </article>

              <article className="securityPanel securityModelPanel">
                <div className="securityPanelHeader"><div><span className="eyebrow">{tr("ACCESS MODEL", "访问模型")}</span><h2>{tr("Requests pass four boundaries", "请求需要通过四层边界")}</h2></div></div>
                <div className="securityFlow">
                  <div><span>1</span><p><strong>{tr("AI client", "AI 客户端")}</strong><small>{tr("Starts an MCP request.", "发起 MCP 请求。")}</small></p></div>
                  <i>↓</i>
                  <div><span>2</span><p><strong>OAuth 2.1 + PKCE</strong><small>{tr("Validates user identity and scopes.", "验证用户身份与 Scope。")}</small></p></div>
                  <i>↓</i>
                  <div><span>3</span><p><strong>{tr("Relay policy", "Relay 权限策略")}</strong><small>{tr("Blocks disabled tools before reaching the computer.", "关闭的工具会在到达电脑前被拦截。")}</small></p></div>
                  <i>↓</i>
                  <div><span>4</span><p><strong>{tr("Local device agent", "本机 Device Agent")}</strong><small>{tr("Executes only tools the device actually exposes.", "只执行设备实际开放的工具。")}</small></p></div>
                </div>
              </article>
            </section>

            <section className="securityLowerGrid">
              <article className="securityPanel">
                <div className="securityPanelHeader">
                  <div><span className="eyebrow">{tr("AUDIT ACTIVITY", "审计活动")}</span><h2>{tr("Recent access", "最近访问")}</h2></div>
                  <span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span>
                </div>
                <div className="securityAuditList">
                  {(status?.recentActivity || []).slice(0,6).map((event) => (
                    <div className="securityAuditRow" key={event.id}>
                      <i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i>
                      <div><strong>{eventLabel(event)}</strong><span>{event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}</span></div>
                      <b>{event.success ? tr("Allowed", "已允许") : tr("Failed", "失败")}</b>
                    </div>
                  ))}
                  {!status?.recentActivity?.length && <div className="securityEmptyState compact"><strong>{tr("No audit events yet", "暂无审计事件")}</strong><span>{tr("Tool calls and security events will appear here.", "工具调用和安全事件会显示在这里。")}</span></div>}
                </div>
              </article>

              <article className="securityPanel securityPrivacyPanel">
                <div className="securityPanelHeader"><div><span className="eyebrow">{tr("PRIVACY BOUNDARY", "隐私边界")}</span><h2>{tr("What the audit log keeps", "审计日志记录什么")}</h2></div></div>
                <div className="privacyBoundaryGrid">
                  <div className="kept"><span>✓</span><p><strong>{tr("Operational metadata", "运行元数据")}</strong><small>{tr("Tool name, device, success state and time.", "工具名称、设备、结果状态与时间。")}</small></p></div>
                  <div className="notKept"><span>×</span><p><strong>{tr("File contents", "文件内容")}</strong><small>{tr("Not intentionally stored in audit records.", "不会有意保存在审计记录中。")}</small></p></div>
                  <div className="notKept"><span>×</span><p><strong>{tr("Command arguments", "命令参数")}</strong><small>{tr("Not intentionally stored in audit records.", "不会有意保存在审计记录中。")}</small></p></div>
                  <div className="notKept"><span>×</span><p><strong>{tr("OAuth tokens & device credentials", "OAuth Token 与设备凭证")}</strong><small>{tr("Never exposed in the activity feed.", "不会暴露在活动记录中。")}</small></p></div>
                </div>
              </article>
            </section>

            <section className="securityActionsPanel">
              <div><span className="eyebrow">{tr("SECURITY ACTIONS", "安全操作")}</span><h2>{tr("Keep access intentional.", "确保每一次访问都是有意授权。")}</h2><p>{tr("Review device permissions regularly, revoke computers you no longer use, and sign out of shared browsers.", "定期检查设备权限、撤销不再使用的电脑，并在共享浏览器中及时退出登录。")}</p></div>
              <div className="securityActionButtons">
                <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Review device tools", "检查设备工具")}</button>
                <button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Review MCP connection", "检查 MCP 连接")}</button>
                <button className="dangerButton" onClick={() => void signOut()}>{tr("Sign out", "退出登录")}</button>
              </div>
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
