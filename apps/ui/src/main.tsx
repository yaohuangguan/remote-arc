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

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Remote Arc">
      <defs>
        <linearGradient id="remote-arc-gradient" x1="8" y1="48" x2="56" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path d="M10 42C15 20 27 12 44 17C50 19 54 24 56 30" fill="none" stroke="url(#remote-arc-gradient)" strokeWidth="7" strokeLinecap="round" />
      <path d="M54 42C49 29 42 24 32 24C22 24 15 31 10 42" fill="none" stroke="url(#remote-arc-gradient)" strokeWidth="7" strokeLinecap="round" opacity=".78" />
      <circle cx="10" cy="42" r="5" fill="#7dd3fc" />
      <circle cx="54" cy="42" r="5" fill="#38bdf8" />
      <circle cx="32" cy="24" r="3.5" fill="var(--logo-spark, #f0f9ff)" />
    </svg>
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
        <a href="/docs/mcp">{tr("MCP", "MCP")}</a>
        <a href="/pricing">{tr("Pricing", "价格")}</a>
        <a href="/resources">{tr("Resources", "资源")}</a>
        <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
      </nav>
      <div className="publicNavActions">
        <ThemeSwitcher compact />
        {user ? (
          <a className="navDashboard" href="/dashboard">{tr("Dashboard", "控制台")} <span>↗</span></a>
        ) : (
          <a className="navLogin" href="/auth/google?return_to=/dashboard">{tr("Sign in", "登录")}</a>
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
        <span>© 2026 Remote Arc · MIT</span>
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
          <a className="primaryButton" href="/auth/google?return_to=/dashboard">
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
  const command = "npx remotelink";
  return (
    <PublicLayout>
      <section className="landingHero">
        <div className="heroCopy">
          <span className="eyebrow">{tr("THE OPEN CONTROL PLANE FOR AI", "面向 AI 的开源远程控制层")}</span>
          <h1>{tr("Your computer. One prompt away.", "你的电脑，一句话就能触达。")}</h1>
          <p>{tr(
            "Give ChatGPT, Claude and compatible MCP clients secure access to your real Windows, macOS and Linux machines — without public IPs, VPNs or surrendering control.",
            "让 ChatGPT、Claude 与兼容 MCP 的 AI 安全访问你的真实 Windows、macOS 和 Linux 设备。无需公网 IP，无需 VPN，控制权始终在你手里。"
          )}</p>
          <div className="landingActions">
            <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>{user ? tr("Open dashboard", "打开控制台") : tr("Connect a computer", "连接一台电脑")}</a>
            <a className="ghostLink" href="#how-it-works">{tr("See how it works →", "看看如何使用 →")}</a>
          </div>
          <div className="heroBadges">
            <span>{tr("10,000 hosted calls / month", "每月 10,000 次托管调用")}</span>
            <span>{tr("Open source + self-hostable", "开源且可自托管")}</span>
            <span>{tr("Outbound connection only", "仅需出站连接")}</span>
          </div>
        </div>
        <div className="heroProduct" aria-label={tr("Remote Arc connection preview", "Remote Arc 连接预览")}>
          <div className="aiStack">
            {aiClients.map((client) => (
              <AiClientBadge
                key={client.name}
                {...client}
                note={client.name === "ChatGPT" ? tr("Custom MCP app", "自定义 MCP 应用") : tr("Custom connector", "自定义连接器")}
              />
            ))}
            <div className="aiClientBadge protocolBadge">
              <span className="protocolMark">M</span>
              <span><strong>{tr("Any MCP client", "其他 MCP 客户端")}</strong><small>{tr("Standards-based", "遵循标准协议")}</small></span>
            </div>
          </div>
          <div className="flowLine"><span>OAuth 2.1 + Remote MCP</span></div>
          <div className="arcNode">
            <LogoMark />
            <div><strong>Remote Arc</strong><span>{tr("routes each call to the right machine", "把每次调用安全路由到正确设备")}</span></div>
            <b>{tr("ONLINE", "在线")}</b>
          </div>
          <div className="deviceNodes">
            <span><i>⊞</i><strong>SamPC</strong><small>Windows</small></span>
            <span><i>⌘</i><strong>MacBook</strong><small>macOS</small></span>
            <span><i>›_</i><strong>Home lab</strong><small>Linux</small></span>
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
          <article><span className="stepNumber">02</span><div className="journeyLogos">{aiClients.map((client) => <img key={client.name} src={client.icon} alt="" />)}</div><h3>{tr("Add your AI client", "添加到你的 AI")}</h3><p>{tr("Use the same Remote MCP URL in ChatGPT or Claude. OAuth discovers and handles sign-in automatically.", "在 ChatGPT 或 Claude 中使用同一个 Remote MCP URL，OAuth 会自动发现并完成登录。")}</p><code>remote.samyao.me/mcp</code></article>
          <article><span className="stepNumber">03</span><div className="journeyIcon">✦</div><h3>{tr("Ask in natural language", "直接自然语言操作")}</h3><p>{tr("Say which computer you mean. Remote Arc finds it, checks its local capability policy and routes the tool call.", "只需说出设备名称。Remote Arc 会找到它、检查本机权限，再把工具调用路由过去。")}</p><blockquote>{tr("“Run the tests on SamPC.”", "“在 SamPC 上跑一下测试。”")}</blockquote></article>
        </div>
        <div className="clientSetupNote">
          <div><img src={aiClients[0].icon} alt="" /><p><strong>{tr("ChatGPT today", "目前的 ChatGPT")}</strong><span>{tr("Custom MCP apps currently require Developer Mode. Remote Arc itself is the app connection — no extra desktop plugin is required.", "添加自定义 MCP 应用目前需要开启 Developer Mode。Remote Arc 的连接就是这个应用，不需要额外安装桌面插件。")}</span></p></div>
          <div><img src={aiClients[1].icon} alt="" /><p><strong>{tr("Claude today", "目前的 Claude")}</strong><span>{tr("Add Remote Arc under Settings → Connectors. No developer mode or local plugin is required.", "在 Settings → Connectors 中添加 Remote Arc，不需要 Developer Mode，也不需要本地插件。")}</span></p></div>
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
          <article><span>03</span><h2>{tr("Open, not trapped", "开源，不被锁定")}</h2><p>{tr("Use the hosted relay for zero ops or run the same control plane in your own Cloudflare account.", "想省心就用托管 Relay，想完全掌控就部署到自己的 Cloudflare 账户。")}</p></article>
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
            [tr("Control plane", "控制面"), tr("Hosted or self-hosted", "托管或自托管"), tr("Provider-owned", "平台持有")],
            [tr("AI clients", "AI 客户端"), tr("ChatGPT, Claude + Remote MCP", "ChatGPT、Claude + Remote MCP"), tr("Often product-specific", "通常绑定单一产品")],
            [tr("Onboarding", "上手方式"), tr("One command + browser approval", "一条命令 + 浏览器授权"), tr("Tokens and manual config", "Token 与手动配置")],
            [tr("Device permissions", "设备权限"), tr("Final boundary stays local", "最终边界留在本机"), tr("Cloud policy first", "云端策略优先")],
            [tr("Network exposure", "网络暴露"), tr("Outbound connection only", "仅需出站连接"), tr("VPN, tunnel or open port", "VPN、隧道或开放端口")],
            [tr("Exit path", "退出路径"), tr("Fork, deploy, keep running", "Fork、部署、继续运行"), tr("Migration required", "需要迁移")],
            [tr("Hosted usage", "托管额度"), tr("10,000 free calls / month", "每月 10,000 次免费调用"), tr("Depends on provider", "取决于平台")],
          ].map(([label, ours, other]) => (
            <div className="comparisonRow" key={label}>
              <span>{label}</span><strong>✓ {ours}</strong><em>{other}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="ctaStrip">
        <div>
          <span className="eyebrow">{tr("FREE HOSTED PLAN", "免费托管方案")}</span>
          <h2>{tr("Connect one machine in minutes.", "几分钟内，让第一台电脑上线。")}</h2>
          <p>{tr("Start with 10,000 hosted tool calls each month. Move to your own infrastructure whenever you want.", "每月先用 10,000 次免费托管调用；任何时候都可以迁移到你自己的基础设施。")}</p>
        </div>
        <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>{user ? tr("Open dashboard", "打开控制台") : tr("Start with Remote Arc", "开始使用 Remote Arc")}</a>
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
          <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>{user ? tr("Open dashboard", "打开控制台") : tr("Start free", "免费开始")}</a>
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
  const endpoint = "https://remote.samyao.me/mcp";
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
  const [active, setActive] = useState<DashboardTab>("overview");
  const command = "npx remotelink";
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
        <div className="sidebarControls"><ThemeSwitcher /></div>
        <div className="sidebarStatus"><div className="livePulse"/><div><strong>{tr("Relay online", "Relay 在线")}</strong><span>remote.samyao.me</span></div></div>
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
              <div className="connectIcon">↗</div><div><span className="eyebrow">CHATGPT · CLAUDE · REMOTE MCP</span><h2>{tr("Connect once. Then just talk.", "连接一次，之后直接对话。")}</h2><p>{tr("Use one OAuth-protected endpoint across compatible AI clients.", "同一个受 OAuth 保护的端点，连接所有兼容 AI 客户端。")}</p></div>
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
            <section className="setupGrid aiSetupGrid">
              <article className="setupCard featured clientSetupCard"><span className="stepNumber"><img src={aiClients[0].icon} alt="" /></span><div><span className="eyebrow">CHATGPT</span><h2>{tr("Create a custom MCP app", "创建自定义 MCP 应用")}</h2><p>{tr("Enable ChatGPT Developer Mode, create an app, paste this endpoint and complete OAuth.", "开启 ChatGPT Developer Mode，创建 App，粘贴此端点并完成 OAuth。")}</p><div className="endpointRow large"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/></div></div></article>
              <article className="setupCard featured clientSetupCard"><span className="stepNumber"><img src={aiClients[1].icon} alt="" /></span><div><span className="eyebrow">CLAUDE</span><h2>{tr("Add a custom connector", "添加自定义连接器")}</h2><p>{tr("Open Settings → Connectors, add the same endpoint and click Connect. No Developer Mode required.", "打开 Settings → Connectors，添加同一个端点并点击 Connect，无需 Developer Mode。")}</p><div className="endpointRow large"><code>{mcpEndpoint}</code><CopyButton value={mcpEndpoint}/></div></div></article>
              <article className="setupCard fullSetupCard"><span className="stepNumber">03</span><div><h2>{tr("Authorize once, then talk naturally", "授权一次，之后直接自然语言操作")}</h2><p>{tr("Address a device by name. Remote Arc checks its local Safe or Developer policy and handles routing.", "直接说设备名称；Remote Arc 会检查它的本机 Safe 或 Developer 权限并完成路由。")}</p><div className="promptExamples"><code>{tr("“List the projects on my Mac.”", "“看看我 Mac 上有哪些项目。”")}</code><code>{tr("“Run the tests on SamPC.”", "“在 SamPC 上跑测试。”")}</code></div></div></article>
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
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Choose Light, Dark or System. Your preference is saved in this browser.", "选择浅色、深色或跟随系统；偏好会保存在当前浏览器。")}</p></div><ThemeSwitcher /></article>
              <article className="settingsCard"><div><h2>{tr("Language", "语言")}</h2><p>{tr("Changes apply immediately and are saved in this browser.", "修改后立即生效，并保存在当前浏览器。")}</p></div><div className="languageSetting"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button><button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Hosted plan", "托管方案")}</h2><p>{tr("Free includes 10,000 Remote MCP tool calls each UTC month.", "免费版每个 UTC 月包含 10,000 次 Remote MCP 工具调用。")}</p></div><div className="planValue">{usage?.unlimited ? "∞" : `${usage?.used ?? 0} / ${usage?.limit ?? 10000}`}</div></article>
              <article className="settingsCard"><div><h2>{tr("Self-hosting", "自托管")}</h2><p>{tr("Set MONTHLY_TOOL_CALL_LIMIT=0 on your own deployment for unlimited calls.", "在自己的部署中设置 MONTHLY_TOOL_CALL_LIMIT=0 即可取消调用额度限制。")}</p></div><a className="ghostButton" href="https://github.com/yaohuangguan/remote-arc">{tr("Open GitHub", "打开 GitHub")}</a></article>
            </section>
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · remote.samyao.me</span><div><a href="/pricing">{tr("Pricing", "价格")}</a><a href="/resources">{tr("Resources", "资源")}</a><a href="/docs/mcp">MCP</a><a href="/privacy">{tr("Privacy", "隐私")}</a><a href="/terms">{tr("Terms", "条款")}</a><a href="/support">{tr("Support", "支持")}</a></div></footer>
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
        [tr("Remote actions", "远程操作"), tr("Remote Arc relays tool requests between ChatGPT and your connected device. Audit records may include the tool name, device, success state and time. File contents and command arguments are not intentionally stored in audit records.", "Remote Arc 在 ChatGPT 与已连接设备之间转发工具请求。审计记录可能包含工具名称、设备、成功状态和时间；不会有意在审计记录中保存文件内容或命令参数。")],
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
        [tr("Your responsibility", "你的责任"), tr("Remote computer control can modify files, execute commands and affect running software. You are responsible for reviewing permissions, prompts and commands before allowing high-impact actions.", "远程电脑控制可能修改文件、执行命令并影响运行中的软件。你有责任在允许高影响操作前检查权限、提示和命令。")],
        [tr("Service availability", "服务可用性"), tr("The hosted service is provided without a guarantee of uninterrupted availability. Features, quotas and supported integrations may change as Remote Arc develops.", "托管服务不保证持续无中断可用。随着 Remote Arc 的发展，功能、额度和支持的集成可能发生变化。")],
        [tr("Open-source software", "开源软件"), tr("Open-source portions of Remote Arc are also governed by the licenses included with the source code. Self-hosted deployments are operated by their deployer, not by the hosted Remote Arc service.", "Remote Arc 的开源部分同时受源码中附带的许可证约束。自托管部署由其部署者负责运行，不属于 Remote Arc 托管服务。")],
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
        [tr("Documentation", "文档"), tr("Start with the MCP setup guide and the open-source README for pairing, permissions and self-hosting instructions.", "可先查看 MCP 接入指南和开源 README，了解配对、权限与自托管说明。")],
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
          <a href="/privacy">{tr("Privacy", "隐私")}</a>
          <a href="/terms">{tr("Terms", "条款")}</a>
          <a href="/support">{tr("Support", "支持")}</a>
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

  if (location.pathname === "/device") return <PairDevice user={user} onSignedIn={loadMe} />;
  if (location.pathname === "/oauth/consent") return <OAuthConsent user={user} />;
  if (location.pathname === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (location.pathname === "/resources") return <ResourcesPage user={user === undefined ? null : user} />;
  if (location.pathname === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;
  if (location.pathname === "/privacy") return <LegalPage kind="privacy" user={user === undefined ? null : user} />;
  if (location.pathname === "/terms") return <LegalPage kind="terms" user={user === undefined ? null : user} />;
  if (location.pathname === "/support") return <LegalPage kind="support" user={user === undefined ? null : user} />;

  if (location.pathname === "/dashboard") {
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
