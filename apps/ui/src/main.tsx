import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useI18n } from "./i18n.js";
import { ThemeProvider, useTheme } from "./theme.js";
import "./styles.css";

type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  isAdmin: boolean;
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
  workspace_roots?: string[];
  sensitive_paths?: string[];
  sensitive_allow_paths?: string[];
  protect_sensitive_paths?: boolean;
  undo_enabled?: boolean;
  policy_enforcement_available?: boolean;
  undo_history_available?: boolean;
};

type UndoAction = {
  id: string;
  created_at: string;
  tool: "write_file" | "edit_block";
  path: string;
  bytes: number;
  existed_before: boolean;
  conflict_safe: boolean;
  can_undo: boolean;
  status: "ready" | "conflict" | "missing" | "legacy";
};

type DirectoryBrowser = {
  path: string;
  parent: string | null;
  directories: Array<{
    name: string;
    path: string;
    type: "directory" | "symlink";
  }>;
  protected_entries_omitted: number;
  truncated: boolean;
};

type ManagedProcess = {
  process_id: string;
  pid: number | null;
  command: string;
  cwd: string | null;
  status: "running" | "exited";
  exit_code: number | null;
  signal: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  stdout_bytes: number;
  stderr_bytes: number;
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
  devices: Device[];
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
  lastTokenIssuedAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string | null;
  tokenRows: number;
  status: "active" | "refreshable" | "expired";
};

type DashboardDialog = {
  kind: "notice" | "confirm" | "prompt";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  placeholder?: string;
  initialValue?: string;
};

type SecurityState = {
  mcpPaused: boolean;
  grants: SecurityGrant[];
};

type MonitorIncident = {
  id: string;
  created_at: string;
  severity: "warning" | "error" | "critical";
  kind: string;
  status_code: number | null;
  method: string | null;
  path: string | null;
  message: string;
  ray_id: string | null;
  colo: string | null;
};

type MonitorState = {
  status: "operational" | "degraded";
  checkedAt: string;
  worker: {
    status: "operational" | "degraded";
    errors15m: number;
    errors1h: number;
    errors24h: number;
  };
  dependencies: {
    d1: { status: string };
    durableObjects: { status: string };
  };
  account: {
    users: number;
    devices: number;
    activeTokens: number;
  };
  alerts: {
    emailConfigured: boolean;
    destination: string | null;
    cooldownMinutes: number;
    recent: Array<{
      alert_key: string;
      last_sent_at: string | null;
      last_status_code: number | null;
      last_path: string | null;
    }>;
  };
  incidents: MonitorIncident[];
};

type DashboardTab = "overview" | "devices" | "connect" | "security" | "monitor" | "settings";

const MARKETING_ORIGIN = "https://remotearc.app";
const APP_ORIGIN = "https://mcp.remotearc.app";
const MCP_ENDPOINT = APP_ORIGIN + "/mcp";
const DASHBOARD_PATHS: Record<DashboardTab, string> = {
  overview: "/overview",
  devices: "/devices",
  connect: "/connect",
  security: "/security",
  monitor: "/monitor",
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
  "undo_last_change",
  "start_process",
  "process_status",
  "process_output",
  "stop_process",
  "list_processes",
] as const;

const SAFE_DEVICE_TOOLS = [
  "list_directory",
  "read_file",
  "get_file_info",
  "list_processes",
] as const;

const DEVELOPER_DEVICE_TOOLS = [
  ...SAFE_DEVICE_TOOLS,
  "write_file",
  "edit_block",
  "undo_last_change",
] as const;

type DeviceAccessPreset = "safe" | "developer" | "full" | "custom";

const sameToolSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((tool) => right.includes(tool));

const deviceAccessPreset = (
  tools: readonly string[],
  availableTools: readonly string[],
): DeviceAccessPreset => {
  const supported = (preset: readonly string[]) =>
    preset.filter((tool) => availableTools.includes(tool));
  if (sameToolSet(tools, supported(SAFE_DEVICE_TOOLS))) return "safe";
  if (sameToolSet(tools, supported(DEVELOPER_DEVICE_TOOLS))) return "developer";
  if (sameToolSet(tools, supported(DEVICE_TOOL_CATALOG))) return "full";
  return "custom";
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
  const [showSignIn, setShowSignIn] = useState(false);
  const returnTo = APP_ORIGIN + "/overview";

  return (
    <>
      <header className="landingNav publicNav">
        <Brand />
        <nav className="publicNavLinks">
          <a href="/#how-it-works">{tr("How it works", "如何使用")}</a>

          <div className="publicNavMenu">
            <button type="button" className="publicNavMenuTrigger">
              MCP <span aria-hidden="true">⌄</span>
            </button>
            <div className="publicNavDropdown mcpDropdown">
              <a href="/connect-ai">
                <strong>{tr("Connect Remote Arc", "连接 Remote Arc")}</strong>
                <small>{tr("Pair a computer and authorize your AI client", "配对电脑并授权 AI 客户端")}</small>
              </a>
              <a href="/install/chatgpt">
                <strong>ChatGPT</strong>
                <small>{tr("Installation guide", "安装指南")}</small>
              </a>
              <a href="/install/claude">
                <strong>Claude</strong>
                <small>{tr("Installation guide", "安装指南")}</small>
              </a>
              <a href="/install/cursor">
                <strong>Cursor</strong>
                <small>{tr("Installation guide", "安装指南")}</small>
              </a>
              <a href="/docs/mcp#chrome-browser">
                <strong>Chrome Browser <span className="navBeta">Beta</span></strong>
                <small>{tr("Share selected tabs with AI", "把指定浏览器标签页共享给 AI")}</small>
              </a>
            </div>
          </div>

          <a href="/pricing">{tr("Pricing", "价格")}</a>

          <div className="publicNavMenu">
            <button type="button" className="publicNavMenuTrigger">
              {tr("Resources", "资源")} <span aria-hidden="true">⌄</span>
            </button>
            <div className="publicNavDropdown resourceDropdown">
              <a href="/blogs">
                <strong>{tr("Blog", "博客")}</strong>
                <small>{tr("Ideas, product notes and what we're building", "产品思考、开发记录与我们正在做的事")}</small>
              </a>
              <a href="/resources">
                <strong>{tr("Technical resources", "技术资源")}</strong>
                <small>{tr("Architecture, security and implementation", "架构、安全与实现细节")}</small>
              </a>
              <a href="/use-cases">
                <strong>{tr("Use cases", "使用场景")}</strong>
                <small>{tr("Real workflows with files, code and terminals", "文件、代码与终端的真实工作流")}</small>
              </a>
              <a href="/docs">
                <strong>{tr("Docs", "文档")}</strong>
                <small>{tr("Setup, tools, permissions and reference", "配置、工具、权限与参考")}</small>
              </a>
              <a href="/security-model">
                <strong>{tr("Security", "安全")}</strong>
                <small>{tr("Trust boundaries, permissions and limits", "信任边界、权限与真实限制")}</small>
              </a>
              <a href="https://github.com/yaohuangguan/remote-arc/releases">
                <strong>{tr("Releases", "版本发布")}</strong>
                <small>{tr("What's new in Remote Arc", "查看 Remote Arc 的版本更新")}</small>
              </a>
            </div>
          </div>
        </nav>
        <div className="publicNavActions">
          <ThemeSwitcher compact />
          {user ? (
            <a className="navDashboard" href={APP_ORIGIN + "/overview"}>{tr("Dashboard", "控制台")} <span>↗</span></a>
          ) : (
            <button className="navLogin installNavCta" type="button" onClick={() => setShowSignIn(true)}>
              {tr("Sign in", "登录")} <span>→</span>
            </button>
          )}
        </div>
      </header>
      {showSignIn && (
        <AuthProviderModal
          returnTo={returnTo}
          title={tr("Choose how to sign in.", "选择登录方式。")}
          body={tr(
            "Sign in to manage your Remote Arc account, paired computers and AI connections.",
            "登录后管理你的 Remote Arc 账户、已配对电脑和 AI 连接。",
          )}
          onClose={() => setShowSignIn(false)}
        />
      )}
    </>
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
  const [showSignIn, setShowSignIn] = useState(false);

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
      <>
        <CenteredCard
          title={tr("Sign in to pair this computer", "登录以配对这台电脑")}
          body={initialCode
            ? tr("Choose a Remote Arc account, then confirm the code shown in your terminal.", "选择一个 Remote Arc 账户，然后确认终端中显示的配对码。")
            : tr("Choose a Remote Arc account before approving this computer.", "授权这台电脑前，请先选择 Remote Arc 账户。")}
        >
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("Sign in to Remote Arc", "登录 Remote Arc")} <span>→</span>
          </button>
        </CenteredCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("Choose how to sign in.", "选择登录方式。")}
            body={tr("Sign in to the Remote Arc account that should own this paired computer.", "登录将拥有这台已配对电脑的 Remote Arc 账户。")}
            onClose={() => setShowSignIn(false)}
          />
        )}
      </>
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
  const [showSignIn, setShowSignIn] = useState(false);
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
      <>
        <CenteredCard title={tr("Sign in to continue", "登录后继续")} body={tr("Choose a Remote Arc account before authorizing this MCP client.", "授权 MCP 客户端前，请先选择 Remote Arc 账户。")}>
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("Sign in to Remote Arc", "登录 Remote Arc")} <span>→</span>
          </button>
        </CenteredCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("Choose how to sign in.", "选择登录方式。")}
            body={tr("Sign in to the account you want this MCP client to access.", "登录你希望此 MCP 客户端访问的 Remote Arc 账户。")}
            onClose={() => setShowSignIn(false)}
          />
        )}
      </>
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
  { name: "ChatGPT", slug: "chatgpt", icon: "/ai-openai.svg", tone: "mono" },
  { name: "Claude", slug: "claude", icon: "/ai-claude.svg", tone: "color" },
  { name: "Cursor", slug: "cursor", icon: "/ai-cursor.svg", tone: "color" },
] as const;

const topologyAiClients = aiClients;

function AiClientBadge({ name, icon, note }: { name: string; icon: string; note: string }) {
  return (
    <div className="aiClientBadge">
      <img src={icon} alt="" />
      <span><strong>{name}</strong><small>{note}</small></span>
    </div>
  );
}

function HelpTip({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <span className="helpTipWrap">
      <button
        type="button"
        className="helpTip"
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
        }}
      >
        ?
      </button>
      <span className="helpTipBubble" role="tooltip">{text}</span>
    </span>
  );
}

type InstallClientSlug = "chatgpt" | "claude" | "cursor";

type InstallDemoConfig = {
  name: string;
  icon: string;
  prompt: string;
  working: string;
  resultLines: string[];
  terminalLines: string[];
};

function InstallTypewriterDemo({ config }: { config: InstallDemoConfig }) {
  const { tr } = useI18n();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "sent" | "working" | "done">("typing");
  const [activityCount, setActivityCount] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setTyped("");
    setPhase("typing");
    setActivityCount(0);

    let index = 0;
    const timers: number[] = [];
    const interval = window.setInterval(() => {
      index += 1;
      setTyped(config.prompt.slice(0, index));
      if (index >= config.prompt.length) {
        window.clearInterval(interval);

        const sendAt = 520;
        const workingAt = 960;
        timers.push(window.setTimeout(() => {
          setTyped("");
          setPhase("sent");
        }, sendAt));
        timers.push(window.setTimeout(() => setPhase("working"), workingAt));

        config.terminalLines.forEach((_, lineIndex) => {
          timers.push(window.setTimeout(
            () => setActivityCount(lineIndex + 1),
            workingAt + 280 + lineIndex * 430,
          ));
        });

        const doneAt = workingAt + 520 + config.terminalLines.length * 430;
        timers.push(window.setTimeout(() => setPhase("done"), doneAt));
        timers.push(window.setTimeout(() => setCycle((value) => value + 1), doneAt + 4600));
      }
    }, 34);

    return () => {
      window.clearInterval(interval);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [config.prompt, config.terminalLines, cycle]);

  const messageSent = phase !== "typing";

  return (
    <div className="remoteSessionDemo" aria-label={tr("Simulated Remote Arc live session", "Remote Arc 模拟实时会话")}>
      <div className="remoteSessionHeader">
        <div>
          <LogoMark />
          <span>
            <strong>Remote Arc Live Session</strong>
            <small>{tr("AI request → local device", "AI 请求 → 本机设备")}</small>
          </span>
        </div>
        <div className="remoteSessionStatus">
          <i />
          <span>{tr("Personal Mac · online", "Personal Mac · 在线")}</span>
        </div>
      </div>

      <div className="remoteSessionPanels">
        <section className="sessionTerminalPanel">
          <div className="sessionPanelLabel">
            <span>{tr("LOCAL ACTIVITY", "本机活动")}</span>
            <small>{tr("runs on your computer", "运行在你的电脑上")}</small>
          </div>

          <div className="sessionTerminalWindow">
            <div className="sessionTerminalBar">
              <span><i /><i /><i /></span>
              <small>remote-arc@personal-mac</small>
            </div>
            <div className="sessionTerminalBody">
              <div className="sessionTerminalPrompt">
                <span>$</span>
                <code>{tr("remote-arc session --client ", "remote-arc session --client ")}{config.name.toLowerCase()}</code>
              </div>

              <div className="sessionTerminalLine muted">
                <b>✓</b>
                <span>{tr("secure device connection ready", "设备安全连接已就绪")}</span>
              </div>

              {messageSent && (
                <div className="sessionTerminalLine">
                  <b>→</b>
                  <span>{tr("routing request to Personal Mac", "正在把请求路由到 Personal Mac")}</span>
                </div>
              )}

              {config.terminalLines.slice(0, activityCount).map((line, index) => (
                <div className="sessionTerminalLine" key={line + index}>
                  <b>{index === config.terminalLines.length - 1 && phase === "done" ? "✓" : "›"}</b>
                  <span>{line}</span>
                </div>
              ))}

              {phase === "working" && (
                <div className="sessionTerminalCursor">
                  <span>▌</span>
                </div>
              )}

              {phase === "typing" && (
                <div className="sessionTerminalIdle">
                  <span>{tr("waiting for an AI request…", "等待 AI 请求…")}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="sessionBridge">
          <span>Remote MCP</span>
          <i>→</i>
        </div>

        <section className="sessionChatPanel">
          <div className="sessionChatHeader">
            <div>
              <img src={config.icon} alt="" />
              <strong>{config.name}</strong>
            </div>
            <span><i />{tr("Remote Arc connected", "Remote Arc 已连接")}</span>
          </div>

          <div className="sessionChatBody">
            {messageSent ? (
              <div className="sessionUserMessage">{config.prompt}</div>
            ) : (
              <div className="sessionChatHint">
                <strong>{tr("Ask naturally.", "直接自然语言输入。")}</strong>
                <span>{tr("Remote Arc will route the task to the computer you name.", "Remote Arc 会把任务路由到你指定的电脑。")}</span>
              </div>
            )}

            {(phase === "sent" || phase === "working") && (
              <div className="sessionAssistantState">
                <span>{config.working}</span>
                <div><i /><i /><i /></div>
              </div>
            )}

            {phase === "done" && (
              <div className="sessionAssistantResult">
                <strong>{tr("Done on your computer.", "已在你的电脑上完成。")}</strong>
                <ul>
                  {config.resultLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className={"sessionComposer " + (phase === "typing" ? "typing" : "")}>
            <span>＋</span>
            <div>
              {phase === "typing" ? typed : tr("Ask another task…", "继续输入任务…")}
              {phase === "typing" && <b className="typeCursor" />}
            </div>
            <button type="button" aria-hidden="true">↑</button>
          </div>
        </section>
      </div>

      <div className="remoteSessionFooter">
        <span>{tr("Simulated walkthrough — no live computer is being controlled.", "模拟演示——此处没有实际控制电脑。")}</span>
        <span>{tr("The same device policy still applies.", "设备权限策略仍然生效。")}</span>
      </div>
    </div>
  );
}

function AuthProviderModal({
  returnTo,
  title,
  body,
  note,
  onClose,
}: {
  returnTo: string;
  title: string;
  body: string;
  note?: string;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const absoluteReturnTo = (() => {
    try {
      return new URL(returnTo, location.origin).toString();
    } catch {
      return location.origin + "/";
    }
  })();

  const providers = [
    {
      id: "google",
      label: tr("Continue with Google", "使用 Google 继续"),
      href:
        MARKETING_ORIGIN +
        "/auth/google?return_to=" +
        encodeURIComponent(absoluteReturnTo),
      mark: "G",
    },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modalBackdrop installAuthBackdrop" onMouseDown={onClose}>
      <section className="installAuthModal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modalClose" type="button" onClick={onClose} aria-label={tr("Close", "关闭")}>×</button>
        <div className="installAuthBrand"><LogoMark /></div>
        <span className="eyebrow">{tr("SIGN IN TO REMOTE ARC", "登录 REMOTE ARC")}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="installAuthProviders">
          {providers.map((provider) => (
            <a className={"authProviderButton " + provider.id} href={provider.href} key={provider.id}>
              <span aria-hidden="true">{provider.mark}</span>
              <strong>{provider.label}</strong>
              <b>→</b>
            </a>
          ))}
        </div>
        <small>{note || tr(
          "More sign-in methods can be added here later without changing your paired computers or AI connections.",
          "以后可以在这里增加更多登录方式，而不会影响已经配对的电脑或 AI 连接。",
        )}</small>
      </section>
    </div>
  );
}

function ClientInstallPage({
  slug,
  user,
}: {
  slug: InstallClientSlug;
  user?: User | null;
}) {
  const { tr } = useI18n();
  const config = slug === "chatgpt"
    ? {
        name: "ChatGPT",
        icon: "/ai-openai.svg",
        eyebrow: tr("CHATGPT INSTALLATION", "CHATGPT 安装"),
        title: tr("Give ChatGPT access to your local computer.", "让 ChatGPT 连接你的本地电脑。"),
        intro: tr(
          "Pair a computer once, add Remote Arc as a Remote MCP app on an eligible ChatGPT account, then work with that machine from chat.",
          "电脑只需配对一次，再在支持 Remote MCP App 的 ChatGPT 账户中添加 Remote Arc，之后即可直接在聊天里操作这台电脑。",
        ),
        availability: tr(
          "Remote Arc is preparing its public ChatGPT Plugin listing. Until it is live, eligible accounts can use the manual Remote MCP app path.",
          "Remote Arc 正在准备公开 ChatGPT Plugin 上架。在正式上线前，符合条件的账户仍可通过手动 Remote MCP App 方式接入。",
        ),
        externalHref: "https://chatgpt.com/",
        externalLabel: tr("Open ChatGPT", "打开 ChatGPT"),
        steps: [
          {
            title: tr("Pair your computer", "配对你的电脑"),
            body: tr("Run this once on the Windows, macOS or Linux machine you want ChatGPT to reach.", "在你希望 ChatGPT 访问的 Windows、macOS 或 Linux 电脑上运行一次。"),
            code: "npx remotelink",
          },
          {
            title: tr("Create the Remote Arc app", "创建 Remote Arc App"),
            body: tr(
              "In ChatGPT, open Settings → Apps → Create, paste the Remote MCP endpoint, scan tools, and continue through OAuth. If Create is not available, your current account does not expose manual MCP app creation.",
              "在 ChatGPT 中打开 Settings → Apps → Create，填入 Remote MCP 地址、扫描工具并完成 OAuth。如果没有 Create，说明当前账户尚未开放手动创建 MCP App。",
            ),
            code: MCP_ENDPOINT,
          },
          {
            title: tr("Ask ChatGPT to use your computer", "让 ChatGPT 操作你的电脑"),
            body: tr("Name the machine and task in normal language. Remote Arc checks the saved device policy before routing each tool call.", "直接用自然语言说明设备和任务。每次 Tool Call 路由前，Remote Arc 都会检查这台设备保存的权限策略。"),
          },
        ],
        demo: {
          name: "ChatGPT",
          icon: "/ai-openai.svg",
          prompt: tr("Organize my Downloads folder on my Mac", "整理我 Mac 上的 Downloads 文件夹"),
          working: tr("Working on your Mac…", "正在你的 Mac 上处理…"),
          resultLines: [
            tr("Grouped screenshots and documents into folders.", "已将截图和文档按类型整理到文件夹。"),
            tr("Moved 126 files; nothing was deleted.", "移动了 126 个文件，没有删除任何内容。"),
            tr("Changes stayed inside your allowed workspace.", "所有修改都限制在允许的工作区内。"),
          ],
          terminalLines: [
            tr("policy → Full · ~/Downloads", "policy → Full · ~/Downloads"),
            tr("start_process → inspect and group files", "start_process → 检查并整理文件"),
            tr("process_output → 126 files planned", "process_output → 已规划 126 个文件"),
            tr("process_output → move complete · 0 deleted", "process_output → 移动完成 · 0 删除"),
          ],
        },
      }
    : slug === "claude"
      ? {
          name: "Claude",
          icon: "/ai-claude.svg",
          eyebrow: tr("CLAUDE INSTALLATION", "CLAUDE 安装"),
          title: tr("Connect Claude to the computer you already use.", "让 Claude 连接你正在使用的电脑。"),
          intro: tr(
            "Claude custom connectors support remote MCP. Add Remote Arc once, authorize your account, and your paired computers become available through the connector.",
            "Claude Custom Connectors 支持 Remote MCP。添加一次 Remote Arc 并完成授权后，你配对的电脑即可通过 Connector 使用。",
          ),
          availability: tr("Available through Claude custom connectors using remote MCP.", "可通过 Claude 的 Remote MCP Custom Connector 接入。"),
          externalHref: "https://claude.ai/",
          externalLabel: tr("Open Claude", "打开 Claude"),
          steps: [
            {
              title: tr("Pair your computer", "配对你的电脑"),
              body: tr("Install the Remote Arc agent on the computer Claude should reach.", "在 Claude 需要访问的电脑上安装 Remote Arc Agent。"),
              code: "npx remotelink",
            },
            {
              title: tr("Add a custom connector", "添加 Custom Connector"),
              body: tr(
                "In Claude, open Settings → Connectors and add a custom connector that points to the Remote Arc MCP endpoint. Complete OAuth when Claude redirects you.",
                "在 Claude 中打开 Settings → Connectors，添加一个指向 Remote Arc MCP 地址的 Custom Connector，并在跳转后完成 OAuth。",
              ),
              code: MCP_ENDPOINT,
            },
            {
              title: tr("Use Remote Arc in a Claude conversation", "在 Claude 对话里使用 Remote Arc"),
              body: tr("Ask Claude to inspect, edit or run a permitted task on a named paired device. The local skill policy remains the final boundary.", "让 Claude 在指定的已配对设备上执行允许的读取、编辑或命令任务；本机 Skill Policy 仍是最终边界。"),
            },
          ],
          demo: {
            name: "Claude",
            icon: "/ai-claude.svg",
            prompt: tr("Find why the tests fail on my desktop and fix it", "找出我桌面电脑上的测试为什么失败并修好"),
            working: tr("Inspecting your desktop…", "正在检查你的桌面电脑…"),
            resultLines: [
              tr("Found one failing assertion in the auth flow.", "定位到认证流程里的一处失败断言。"),
              tr("Updated the file and reran the test suite.", "修改文件后重新跑了测试。"),
              tr("All tests pass; a Local Undo snapshot is available.", "测试已全部通过，并保留了 Local Undo 快照。"),
            ],
            terminalLines: [
              tr("start_process → pnpm test", "start_process → pnpm test"),
              tr("process_output → 1 failing assertion", "process_output → 1 条断言失败"),
              tr("read_file → src/auth.test.ts", "read_file → src/auth.test.ts"),
              tr("edit_block → assertion updated", "edit_block → 已更新断言"),
              tr("start_process → pnpm test · passed", "start_process → pnpm test · 已通过"),
            ],
          },
        }
      : {
          name: "Cursor",
          icon: "/ai-cursor.svg",
          eyebrow: tr("CURSOR INSTALLATION", "CURSOR 安装"),
          title: tr("Let Cursor reach the machine behind your code.", "让 Cursor 连接代码所在的真实电脑。"),
          intro: tr(
            "Cursor supports remote HTTP MCP servers with OAuth. Point Cursor at Remote Arc and keep the actual filesystem and terminal on your paired machine.",
            "Cursor 支持带 OAuth 的 Remote HTTP MCP Server。把 Cursor 指向 Remote Arc，就能让文件系统和终端仍然运行在你配对的真实电脑上。",
          ),
          availability: tr("Supported through Cursor remote HTTP MCP with OAuth.", "可通过 Cursor 的 Remote HTTP MCP + OAuth 接入。"),
          externalHref: "https://cursor.com/",
          externalLabel: tr("Open Cursor", "打开 Cursor"),
          steps: [
            {
              title: tr("Pair your computer", "配对你的电脑"),
              body: tr("Run Remote Arc on the machine that owns the project or development environment.", "在真正保存项目或开发环境的电脑上运行 Remote Arc。"),
              code: "npx remotelink",
            },
            {
              title: tr("Add Remote Arc as an MCP server", "把 Remote Arc 添加为 MCP Server"),
              body: tr(
                "Add a remote HTTP MCP server from Cursor's MCP settings, or place the configuration below in your Cursor MCP config. Cursor will complete OAuth for the remote server.",
                "在 Cursor 的 MCP 设置中添加 Remote HTTP MCP Server，或者把下面配置写入 Cursor MCP 配置文件。Cursor 会为远程 Server 完成 OAuth。",
              ),
              code: '{ "mcpServers": { "remote-arc": { "url": "' + MCP_ENDPOINT + '" } } }',
            },
            {
              title: tr("Use it from Agent", "从 Agent 中直接使用"),
              body: tr("Cursor Agent can call the permitted Remote Arc tools while your source tree and commands stay on the selected paired computer.", "Cursor Agent 可以调用已授权的 Remote Arc 工具，同时源码和命令仍然留在你选择的已配对电脑上。"),
            },
          ],
          demo: {
            name: "Cursor",
            icon: "/ai-cursor.svg",
            prompt: tr("Run the tests in remote-arc on my Mac", "在我的 Mac 上运行 remote-arc 的测试"),
            working: tr("Running on your Mac…", "正在你的 Mac 上运行…"),
            resultLines: [
              tr("Started the test command in the project workspace.", "已在项目工作区启动测试命令。"),
              tr("Captured the process output through Remote Arc.", "通过 Remote Arc 获取了进程输出。"),
              tr("Test suite completed successfully.", "测试套件已成功完成。"),
            ],
            terminalLines: [
              tr("policy → Full · ~/Work/remote-arc", "policy → Full · ~/Work/remote-arc"),
              tr("start_process → pnpm test · background", "start_process → pnpm test · 后台运行"),
              tr("process_status → running", "process_status → running"),
              tr("process_output → 42 tests passed", "process_output → 42 tests passed"),
            ],
          },
        };

  return (
    <PublicLayout user={user}>
      <section className="clientInstallHero">
        <nav className="installClientSwitcher" aria-label={tr("AI client installation", "AI 客户端安装")}>
          {aiClients.map((client) => (
            <a
              className={client.slug === slug ? "active" : ""}
              href={"/install/" + client.slug}
              key={client.slug}
            >
              <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
              <span>{client.name}</span>
              {client.slug === slug && <small>{tr("Current", "当前")}</small>}
            </a>
          ))}
        </nav>

        <div className="clientInstallIntro">
          <div className="installBrandChain">
            <span><img src={config.icon} alt="" /></span>
            <i>×</i>
            <span><LogoMark /></span>
          </div>

          <div className="clientInstallCopy">
            <span className="eyebrow">{config.eyebrow}</span>
            <h1>{config.title}</h1>
            <p>{config.intro}</p>
            <div className="installAvailability"><i />{config.availability}</div>
            <div className="installPrimaryCommand">
              <span>{tr("START ON THE COMPUTER", "先在电脑上运行")}</span>
              <div className="installHeroCommand">
                <code>npx remotelink</code>
                <CopyButton value="npx remotelink" />
              </div>
              <small>{tr("Node.js 20+ · Windows, macOS or Linux · opens the secure pairing page automatically", "Node.js 20+ · Windows、macOS 或 Linux · 自动打开安全配对页面")}</small>
            </div>
            <div className="clientInstallActions">
              <a className="primaryButton" href="#installation">{tr("Continue setup", "继续配置")} <span>→</span></a>
              <a className="ghostButton" href={config.externalHref} target="_blank" rel="noreferrer">{config.externalLabel} ↗</a>
            </div>
            <div className="installQuickFacts">
              <span>{tr("No repository clone", "无需 clone 仓库")}</span>
              <span>{tr("No VPN or port forwarding", "无需 VPN 或端口映射")}</span>
              <span>{tr("Browser-approved pairing", "浏览器确认配对")}</span>
            </div>
          </div>
        </div>

        <InstallTypewriterDemo config={config.demo} />
      </section>

      <section className="clientInstallSteps" id="installation">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("INSTALLATION", "安装")}</span>
            <h2>{tr("Three steps to connect " + config.name + ".", "三步连接 " + config.name + "。")}</h2>
          </div>
          <p>{tr("The computer is paired independently from the AI client. You can later disconnect one without removing the other.", "电脑配对和 AI 客户端授权彼此独立，之后可以单独断开其中一层，而不必删除另一层。")}</p>
        </div>

        <div className="installSetupMap">
          <div><b>1</b><span><strong>npx remotelink</strong><small>{tr("Run one command on the computer.", "在电脑上运行这一条命令。")}</small></span></div>
          <div><b>2</b><span><strong>{tr("Sign in and approve", "登录并确认配对")}</strong><small>{tr("The CLI opens the browser and shows the same short code.", "CLI 自动打开浏览器，并显示相同的短配对码。")}</small></span></div>
          <div><b>3</b><span><strong>{tr("Connect " + config.name, "连接 " + config.name)}</strong><small>{tr("Add Remote Arc through OAuth.", "通过 OAuth 添加 Remote Arc。")}</small></span></div>
        </div>

        <div className="clientInstallStepList">
          {config.steps.map((step, index) => (
            <article key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {"code" in step && step.code && (
                  <div className="clientInstallCode">
                    <code>{step.code}</code>
                    <CopyButton value={step.code} />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="clientInstallSecurityNote">
          <strong>{tr("Your computer still controls the boundary.", "最终权限仍由你的电脑控制。")}</strong>
          <p>{tr("New devices start read-only. Workspace Scope, Sensitive Path Policy, Local Undo and per-device skills continue to apply no matter which supported AI client you connect.", "新设备默认只读。无论连接哪一个支持的 AI 客户端，Workspace Scope、Sensitive Path Policy、Local Undo 和逐设备 Skill 权限都会继续生效。")}</p>
        </div>
      </section>
    </PublicLayout>
  );
}

function DashboardAccess() {
  const { tr } = useI18n();
  const [showSignIn, setShowSignIn] = useState(false);
  return (
    <>
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
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("Sign in to Remote Arc", "登录 Remote Arc")} <span>→</span>
          </button>
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
    {showSignIn && (
      <AuthProviderModal
        returnTo="/overview"
        title={tr("Choose how to sign in.", "选择登录方式。")}
        body={tr("Sign in to manage your devices, permissions, usage and AI connections.", "登录后管理设备、权限、用量与 AI 连接。")}
        onClose={() => setShowSignIn(false)}
      />
    )}
    </>
  );
}

function Landing({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const command = "npx remotelink";
  return (
    <PublicLayout user={user}>
      <section className="landingHero">
        <div className="heroCopy">
          <span className="eyebrow">{tr("CONTROLLED COMPUTER ACCESS FOR AI", "面向 AI 的可控电脑访问")}</span>
          <h1>{tr("Go beyond chat. Unleash your AI. Keep the control.", "不止聊天。释放 AI 的能力，把控制权留给你。")}</h1>
          <p>{tr(
            "Turn ChatGPT, Claude and Cursor into real computer operators for the machines you already own. Let AI inspect files, edit code and run permitted workflows while Remote Arc keeps access explicit and under your control.",
            "让 ChatGPT、Claude 和 Cursor 不再只是聊天，而是真正连接你已有的电脑：检查文件、修改代码、执行被允许的工作流，同时由 Remote Arc 把访问范围和控制权留在你手里。"
          )}</p>
          <div className="heroPrimaryCommand">
            <span>{tr("START HERE · RUN ON YOUR COMPUTER", "从这里开始 · 在电脑上运行")}</span>
            <div>
              <code>{command}</code>
              <CopyButton value={command} />
            </div>
            <small>{tr("Node.js 20+ · opens the browser pairing flow automatically", "Node.js 20+ · 自动打开浏览器配对流程")}</small>
          </div>
          <div className="landingActions">
            <a className="primaryButton goldButton" href="/install/chatgpt">{tr("Installation guide", "安装指南")}</a>
            <a className="ghostLink" href="#how-it-works">{tr("See how it works →", "看看如何使用 →")}</a>
          </div>
          <div className="heroBadges">
            <span>{tr("Folder-scoped access", "目录级访问边界")}</span>
            <span>{tr("Local Undo", "本机 Undo")}</span>
            <span>{tr("Remote kill switch", "远程总开关")}</span>
          </div>
        </div>
        <div className="heroArchitecture" aria-label={tr("How Remote Arc connects AI clients to your devices", "Remote Arc 如何连接 AI 客户端与设备")}>
          <div className="architectureLabel">{tr("YOUR AI", "你的 AI")}</div>
          <div className="architectureClients">
            {topologyAiClients.map((client) => (
              <a href={"/install/" + client.slug} key={client.name} aria-label={tr("Install Remote Arc in " + client.name, "在 " + client.name + " 中安装 Remote Arc")}>
                <img
                  className={client.tone === "mono" ? "monoLogo" : "colorLogo"}
                  src={client.icon}
                  alt=""
                />
                <strong>{client.name}</strong>
                <span className="agentCardArrow">↗</span>
              </a>
            ))}
          </div>
          <div className="architectureCompatibility">
            <span className="protocolMark">M</span>
            <strong>{tr("Any compatible Remote MCP client", "任意兼容 Remote MCP 的客户端")}</strong>
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
        <span>{tr("Install for your AI client", "选择你的 AI 客户端安装")}</span>
        {aiClients.map((client) => (
          <a href={"/install/" + client.slug} key={client.name}>
            <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
            <strong>{client.name}</strong>
          </a>
        ))}
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
          <article>
            <span className="stepNumber">02</span>
            <div className="journeyLogos">
              {aiClients.map((client) => (
                <a href={"/install/" + client.slug} key={client.name} aria-label={tr("Install for " + client.name, "查看 " + client.name + " 安装方式")}>
                  <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                </a>
              ))}
            </div>
            <h3>{tr("Choose your AI client", "选择你的 AI 客户端")}</h3>
            <p>{tr("Open the ChatGPT, Claude or Cursor installation guide and connect the same Remote Arc account through OAuth.", "打开 ChatGPT、Claude 或 Cursor 的安装页面，再通过 OAuth 连接同一个 Remote Arc 账户。")}</p>
            <code>{tr("ChatGPT · Claude · Cursor", "ChatGPT · Claude · Cursor")}</code>
          </article>
          <article><span className="stepNumber">03</span><div className="journeyIcon">✦</div><h3>{tr("Ask in natural language", "直接自然语言操作")}</h3><p>{tr("Say which computer you mean. Remote Arc finds it, checks its local capability policy and routes the tool call.", "只需说出设备名称。Remote Arc 会找到它、检查本机权限，再把工具调用路由过去。")}</p><blockquote>{tr("“Run the tests on my desktop.”", "“在我的桌面电脑上跑一下测试。”")}</blockquote></article>
        </div>
        <div className="clientSetupNote">
          <div>
            <div className="clientSetupMiniLogos">
              {aiClients.map((client) => (
                <a href={"/install/" + client.slug} key={client.name} title={client.name}>
                  <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                </a>
              ))}
            </div>
            <p>
              <strong>{tr("Client-specific installation", "按客户端安装")}</strong>
              <span>{tr("ChatGPT, Claude and Cursor each have a dedicated installation page with the current connection path and a working example.", "ChatGPT、Claude 和 Cursor 都有独立安装页面，包含当前可用的连接方式和实际使用示例。")}</span>
            </p>
          </div>
          <div><span className="miniMcp">M</span><p><strong>{tr("One Remote Arc endpoint", "一个 Remote Arc Endpoint")}</strong><span>{tr("The same paired computers and device permissions are reused across supported clients through Remote MCP and OAuth.", "支持的客户端通过 Remote MCP 与 OAuth 共用同一批已配对电脑和设备权限策略。")}</span></p></div>
        </div>
      </section>

      <section className="demoSection" id="demos">
        <div className="demoGrid">
          <article className="mobileScenarioPanel">
            <div className="demoCopy mobileScenarioCopy">
              <div className="mobileScenarioHeader">
                <span className="eyebrow">{tr("CHATGPT ON MOBILE", "手机上的 CHATGPT")}</span>
              </div>
              <h3>{tr(
                "Ask in ChatGPT on your phone. Let Remote Arc reach your computer.",
                "在手机 ChatGPT 里提问，让 Remote Arc 去操作你的电脑。"
              )}</h3>
              <p>{tr(
                "Your request stays in the AI client you already use. Remote Arc exposes only the tools you allowed on the paired computer, runs the approved action there, and returns the result to ChatGPT.",
                "请求仍然从你已经在用的 AI 客户端发出。Remote Arc 只提供你在已配对电脑上允许的工具，在那台电脑上执行获准操作，再把结果返回给 ChatGPT。"
              )}</p>
              <div className="mobileScenarioFlow" aria-label={tr("ChatGPT mobile to Remote Arc to paired computer", "手机 ChatGPT 到 Remote Arc 再到已配对电脑")}>
                <div className="mobileScenarioNode">
                  <span>01</span>
                  <strong>{tr("ChatGPT mobile", "手机 ChatGPT")}</strong>
                  <small>{tr("Ask naturally", "自然语言提问")}</small>
                </div>
                <b aria-hidden="true">→</b>
                <div className="mobileScenarioNode">
                  <span>02</span>
                  <strong>Remote Arc</strong>
                  <small>{tr("Route allowed tools", "路由已授权工具")}</small>
                </div>
                <b aria-hidden="true">→</b>
                <div className="mobileScenarioNode">
                  <span>03</span>
                  <strong>{tr("Your computer", "你的电脑")}</strong>
                  <small>{tr("Run and return", "执行并返回结果")}</small>
                </div>
              </div>
            </div>
          </article>
          <article className="demoCard">
            <div className="demoMedia">
              <video autoPlay muted loop playsInline preload="metadata" poster="/demos/mcp-connect-demo-poster.webp" aria-label={tr("Connecting Remote Arc as a Remote MCP app demo", "把 Remote Arc 连接为 Remote MCP 应用的演示")}>
                <source src="/demos/mcp-connect-demo.webm" type="video/webm" />
                <source src="/demos/mcp-connect-demo.mp4" type="video/mp4" />
              </video>
              <span className="demoBadge">MCP</span>
            </div>
            <div className="demoCopy">
              <span className="eyebrow">{tr("REMOTE MCP", "REMOTE MCP")}</span>
              <h3>{tr("Connect your AI client once.", "一次连接你的 AI 客户端。")}</h3>
              <p>{tr(
                "Paste the Remote Arc MCP endpoint, complete OAuth, and the same paired computers become available through the tools you have allowed.",
                "填写 Remote Arc MCP 地址并完成 OAuth，同一批已配对电脑就能按照你允许的工具权限提供给 AI 客户端使用。"
              )}</p>
              <code className="demoEndpoint">{MCP_ENDPOINT}</code>
            </div>
          </article>
        </div>
      </section>

      <section className="valueSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("WHAT REMOTE ARC ACTUALLY EXPOSES", "REMOTE ARC 实际开放什么")}</span>
          <h2>{tr("Useful computer capabilities, exposed as explicit tools.", "把真正有用的电脑能力拆成明确的工具。")}</h2>
          <p>{tr(
            "Remote Arc is not a screen-sharing product and it does not hand an AI one giant computer permission. The public MCP surface is a set of named tools whose availability is filtered by the selected device.",
            "Remote Arc 不是屏幕共享，也不是给 AI 一个笼统的“整机权限”。公开 MCP 能力由一组具名工具组成，并继续受到目标设备策略过滤。",
          )}</p>
        </div>
        <div className="landingFeatures capabilityFacts">
          <article><span>01</span><h2>{tr("Files and directories", "文件与目录")}</h2><p>{tr("List directories, read files and inspect metadata. Workspace Scope can limit file tools to the folders you choose.", "列目录、读文件、查看元数据；Workspace Scope 可以把文件工具限制在你选择的目录内。")}</p></article>
          <article><span>02</span><h2>{tr("Targeted file editing", "定向文件编辑")}</h2><p>{tr("Enable write_file or edit_block independently. Supported edits can create a conflict-safe Local Undo snapshot before changing the file.", "write_file 与 edit_block 可以独立开启；受支持的编辑会在修改前创建可冲突检测的 Local Undo 快照。")}</p></article>
          <article><span>03</span><h2>{tr("Processes and terminal", "进程与终端")}</h2><p>{tr("Inspect processes without granting shell access. start_process is a separate high-impact skill and runs under the local OS user's permissions.", "查看进程并不等于开放 Shell；start_process 是独立的高权限 Skill，并继承本机 OS 用户权限。")}</p></article>
          <article><span>04</span><h2>{tr("Managed background jobs", "受管后台任务")}</h2><p>{tr("When terminal access is enabled, a task can run as a Remote Arc-managed background process with a local handle for status, output and stop.", "开启终端权限后，任务可以作为 Remote Arc 受管后台进程运行，并通过本地 Handle 查询状态、读取输出或停止。")}</p></article>
          <article><span>05</span><h2>{tr("Explicitly shared browser context", "明确共享的浏览器上下文")}</h2><p>{tr("The Chrome companion exposes read-only tools for tabs you explicitly share: readable text, selections, links and tables.", "Chrome Companion 只对你明确共享的标签页开放只读能力：正文、选中文本、链接和表格。")}</p></article>
          <article><span>06</span><h2>{tr("One device can differ from another", "每台设备可以完全不同")}</h2><p>{tr("A workstation can allow editing and terminal while another computer stays read-only. Policy belongs to the device, not to a global agent mode.", "开发机可以开放编辑和终端，而另一台电脑保持只读；策略属于每台设备，而不是一个全局 Agent 模式。")}</p></article>
        </div>
      </section>

      <section className="platformSection">
        <div className="sectionIntro splitIntro">
          <div>
            <span className="eyebrow">{tr("CONTROL MODEL", "控制模型")}</span>
            <h2>{tr("Six controls that matter when AI can act on a real computer.", "AI 能操作真实电脑时，真正重要的六个控制点。")}</h2>
          </div>
          <p>{tr(
            "These are enforced by the current implementation: path boundaries, local recovery, managed jobs, per-skill policy, encrypted transport with minimized retention, and revocation at the account, client and device layers.",
            "这些都来自当前实现：路径边界、本机恢复、受管任务、逐 Skill 策略、加密传输与最小化留存，以及账户、AI 客户端和设备三层撤销能力。",
          )}</p>
        </div>
        <div className="platformCapabilityGrid">
          <article>
            <span className="platformCapabilityIcon">⌂</span>
            <div><strong>{tr("Directory and path boundaries", "目录与路径级边界")}</strong><p>{tr("Workspace Scope limits normal file tools to configured roots. Sensitive Path Policy protects credential locations and supports narrow file or directory exceptions; canonical paths are checked again on the device.", "Workspace Scope 把普通文件工具限制在指定 Root；Sensitive Path Policy 保护凭证目录，并支持精确到文件或目录的窄范围例外；真实路径还会在本机再次校验。")}</p></div>
            <small>Workspace Scope · Sensitive Paths</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">↶</span>
            <div><strong>{tr("Local Undo before supported edits", "受支持编辑前保留本机 Undo")}</strong><p>{tr("Remote Arc snapshots the previous file state under ~/.remotearc/undo before supported writes. Snapshots stay local, and restore is refused if the file changed again.", "Remote Arc 会在受支持写入前把旧状态保存到 ~/.remotearc/undo；快照只留在本机，如果文件之后又被修改，自动恢复会拒绝覆盖新内容。")}</p></div>
            <small>{tr("Local-only snapshot", "快照仅在本机")}</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">▶</span>
            <div><strong>{tr("Optional managed background processes", "可选的受管后台进程")}</strong><p>{tr("A permitted start_process call can return a local process handle instead of blocking the request. The AI can check status, read captured output or stop that managed process later.", "允许 start_process 后，可以返回本地 Process Handle 而不是阻塞当前请求；之后 AI 可以查询状态、读取捕获输出或停止该受管进程。")}</p></div>
            <small>start · status · output · stop</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">≡</span>
            <div><strong>{tr("Atomic control over individual skills", "逐 Skill 原子级控制")}</strong><p>{tr("Safe, Developer and Full are shortcuts only. The stored policy is an individually editable per-device skill list, and npx remotelink --safe can add a local read-only ceiling the dashboard cannot expand.", "Safe、Developer、Full 只是快捷预设；真正保存的是每台设备可逐项编辑的 Skill 列表。npx remotelink --safe 还能建立 Dashboard 无法远程放大的本机只读上限。")}</p></div>
            <small>{tr("Per device · per skill", "逐设备 · 逐 Skill")}</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">⇄</span>
            <div><strong>{tr("Encrypted transport, least-knowledge storage", "加密传输，尽量少知道")}</strong><p>{tr("HTTPS/WSS encrypts transport. The hosted relay must see the active tool payload to route it, so Remote Arc does not claim zero-knowledge E2EE; instead it avoids intentionally persisting file contents, raw command arguments or tool results in the audit store.", "HTTPS/WSS 负责传输加密。托管 Relay 为了路由必须看到当前 Tool Payload，因此 Remote Arc 不声称 zero-knowledge E2EE；我们的做法是尽量不在审计存储中持久化文件内容、原始命令参数或 Tool Result。")}</p></div>
            <small>{tr("Encrypted in transit · minimized retention", "传输加密 · 最小化留存")}</small>
          </article>
          <article>
            <span className="platformCapabilityIcon">Ⅱ</span>
            <div><strong>{tr("Pause or revoke access at any time", "随时暂停或撤销连接")}</strong><p>{tr("The dashboard can pause all authenticated Remote MCP calls for the account immediately. Individual OAuth grants and individual paired devices can also be revoked independently.", "Dashboard 可以立即暂停账户下全部已认证 Remote MCP 调用；单个 OAuth Grant 和单台已配对设备也可以分别撤销。")}</p></div>
            <small>{tr("Account · AI grant · device", "账户 · AI Grant · 设备")}</small>
          </article>
        </div>
        <div className="platformFootnote">
          <code>OAuth → account pause → device skill policy → local path policy → execution core</code>
          <a href="/security-model">{tr("Read the full security model →", "阅读完整安全模型 →")}</a>
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
            [tr("AI clients", "AI 客户端"), tr("ChatGPT, Claude, Cursor + Remote MCP", "ChatGPT、Claude、Cursor + Remote MCP"), tr("Often product-specific", "通常绑定单一产品")],
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
            [
              tr("What makes Remote Arc different from remote desktop or a generic tunnel?", "Remote Arc 和远程桌面、通用隧道有什么不同？"),
              tr(
                "Remote Arc is purpose-built for AI through MCP. Instead of exposing a whole desktop or network, it exposes explicit tools, scopes and per-device policies so an AI gets only the capabilities you choose.",
                "Remote Arc 是专门为 AI + MCP 设计的。它不是把整台桌面或整个网络暴露出去，而是只开放明确的 Tool、Scope 和逐设备策略，让 AI 只获得你选择的能力。",
              ),
            ],
            [
              tr("What can AI do by default?", "AI 默认能对我的电脑做什么？"),
              tr(
                "New devices start read-only. You choose when to enable file editing, terminal access or individual skills, and every computer can have a different policy.",
                "新设备默认只读。是否开启文件编辑、终端或某个具体 Skill 都由你决定，而且每台电脑都可以使用不同权限策略。",
              ),
            ],
            [
              tr("Can I hard-lock a device to read-only?", "可以把设备硬锁定成只读吗？"),
              tr(
                "Yes. Running npx remotelink --safe applies a local read-only ceiling that the dashboard cannot expand remotely. It is a device-side boundary, not just a UI preset.",
                "可以。使用 npx remotelink --safe 会在本机建立只读上限，Dashboard 无法远程把它扩大。这是设备侧边界，不只是一个 UI 预设。",
              ),
            ],
            [
              tr("Can I limit which folders and secrets AI can access?", "可以限制 AI 能访问哪些目录和敏感文件吗？"),
              tr(
                "Yes. Workspace Scope limits file tools to folders you choose. Sensitive Path Policy protects common credential locations, supports custom protected paths, and re-checks canonical paths locally to block symlink escapes.",
                "可以。Workspace Scope 把文件工具限制在你选择的目录内；Sensitive Path Policy 保护常见凭证位置、支持自定义敏感路径，并在本机再次检查真实路径以阻止符号链接逃逸。",
              ),
            ],
            [
              tr("Can I undo AI file changes?", "AI 修改文件后可以撤销吗？"),
              tr(
                "Supported write and edit operations create Local Undo snapshots on your own computer. Undo verifies that the file has not changed again before restoring it, reducing the risk of overwriting newer work.",
                "受支持的写入和编辑操作会在你的电脑本地创建 Local Undo 快照。恢复前还会确认文件没有被再次修改，避免覆盖更新后的内容。",
              ),
            ],
            [
              tr("Does Remote Arc keep a cloud copy of my files?", "Remote Arc 会在云端保存我的文件副本吗？"),
              tr(
                "No cloud copy is created. Remote Arc routes the content needed for a request but does not intentionally persist file contents or tool results after the request. Operational metadata is kept separately for product and security visibility.",
                "不会创建云端文件副本。Remote Arc 会转发请求所需内容，但不会在请求结束后有意持久化文件内容或 Tool Result；产品与安全所需的运行元数据会单独记录。",
              ),
            ],
            [
              tr("Is Remote Arc end-to-end encrypted?", "Remote Arc 是端到端加密的吗？"),
              tr(
                "Transport is encrypted with HTTPS/WSS, but the hosted relay must process task payloads in transit to route MCP requests, so Remote Arc does not claim zero-knowledge end-to-end encryption. The design instead minimizes retention and keeps final execution boundaries on the device.",
                "传输使用 HTTPS/WSS 加密，但托管 Relay 需要在转发 MCP 请求时处理任务内容，因此 Remote Arc 不声称是 zero-knowledge 端到端加密。设计重点是尽量不留存内容，并把最终执行边界留在设备本地。",
              ),
            ],
            [
              tr("Do I need a public IP, VPN or open port?", "需要公网 IP、VPN 或开放端口吗？"),
              tr(
                "No. The device agent creates an outbound encrypted connection to Remote Arc. There is no inbound listener, router port forwarding or VPN requirement for normal home and office networks.",
                "不需要。设备 Agent 会主动建立到 Remote Arc 的加密出站连接，不需要入站监听、路由器端口映射或 VPN，普通家庭和办公网络即可使用。",
              ),
            ],
            [
              tr("Can I connect more than one computer?", "可以同时连接多台电脑吗？"),
              tr(
                "Yes. Windows, macOS and Linux devices are paired independently. Each gets its own revocable credential, online presence and tool policy, so one computer can stay read-only while another enables development tools.",
                "可以。Windows、macOS 和 Linux 设备会独立配对，每台都有自己的可撤销凭证、在线状态和 Tool 策略，因此一台可以保持只读，另一台可以开启开发能力。",
              ),
            ],
            [
              tr("Can I use Remote Arc from different AI clients?", "可以从不同 AI 客户端使用 Remote Arc 吗？"),
              tr(
                "Yes. ChatGPT, Claude and Cursor have guided setup, and the same OAuth-protected Remote MCP endpoint is designed to work with compatible MCP clients instead of locking your computers to one AI provider.",
                "可以。ChatGPT、Claude 和 Cursor 都有明确接入流程，同一个受 OAuth 保护的 Remote MCP 地址也面向兼容 MCP 的客户端，不把你的电脑绑定在单一 AI 平台上。",
              ),
            ],
            [
              tr("Are AI authorizations and paired devices separate?", "AI 授权和设备配对是分开的吗？"),
              tr(
                "Yes. OAuth grants and device credentials are independent. You can revoke one AI authorization without re-pairing your computers, or revoke one computer without disconnecting every AI client.",
                "是。OAuth Grant 与设备凭证彼此独立。你可以只撤销某一个 AI 授权而不用重新配对电脑，也可以只撤销某一台电脑而不影响所有 AI 客户端。",
              ),
            ],
            [
              tr("Does Remote Arc depend on another computer-control server?", "Remote Arc 是否依赖其他电脑控制服务？"),
              tr(
                "No. Filesystem, process, terminal and undo capabilities run through Remote Arc's own native execution core built on standard Node and OS APIs. This keeps the execution path, safety rules and release lifecycle under one codebase.",
                "不依赖。文件、进程、终端和 Undo 能力都通过 Remote Arc 自己的原生执行核心实现，基于标准 Node 与操作系统 API，让执行链路、安全规则和版本生命周期保持在同一套代码中。",
              ),
            ],
            [
              tr("Can Remote Arc handle long-running commands?", "Remote Arc 能处理长时间运行的命令吗？"),
              tr(
                "Yes. Full mode can start managed background processes, retain their local process handle, inspect output and status later, and stop them from the dashboard or MCP path.",
                "可以。Full 模式支持启动受管理的后台进程，在本机保留进程句柄，之后继续查看输出和状态，并可从 Dashboard 或 MCP 路径停止进程。",
              ),
            ],
            [
              tr("Can AI read browser tabs too?", "AI 也可以读取浏览器标签页吗？"),
              tr(
                "Remote Arc Browser Beta adds a separate read-only browser capability. Every tab must be shared explicitly, multiple tabs can be shared at once, and browser access uses its own browser:read scope.",
                "Remote Arc Browser Beta 提供独立的只读浏览器能力。每个标签页都必须明确授权，可以同时共享多个标签页，并使用独立的 browser:read Scope。",
              ),
            ],
            [
              tr("What happens if the relay connection drops?", "Relay 连接中断会怎样？"),
              tr(
                "The agent reconnects automatically with exponential backoff. A transient handshake failure should not terminate the agent, and the dashboard reflects whether each device is currently online.",
                "Agent 会自动按指数退避策略重连。一次临时握手失败不应让 Agent 退出，Dashboard 也会实时反映每台设备当前是否在线。",
              ),
            ],
            [
              tr("How can I review Remote Arc's security model?", "我怎么审查 Remote Arc 的安全模型？"),
              tr(
                "The source is publicly reviewable, the repository documents its trust boundaries and security controls, and the MCP listing is M8ven Verified. Remote Arc treats those as transparency signals, not as a substitute for independent security certification.",
                "源码可以公开审查，仓库文档明确描述信任边界与安全控制，MCP Listing 也已获得 M8ven Verified。Remote Arc 把这些视为透明度信号，而不是正式安全认证的替代品。",
              ),
            ],
            [
              tr("What is included in the free plan?", "免费版包含什么？"),
              tr(
                "The hosted free plan includes 10,000 Remote Arc tool calls each month, multiple personal devices and the same OAuth-protected MCP connection. Website page loads and static assets are not counted as AI tool calls.",
                "托管免费版每月包含 10,000 次 Remote Arc Tool Call、支持多台个人设备，并使用同一套受 OAuth 保护的 MCP 连接。官网页面加载和静态资源请求不会被算成 AI Tool Call。",
              ),
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="ctaStrip">
        <div>
          <span className="eyebrow">{tr("FREE HOSTED PLAN", "免费托管方案")}</span>
          <h2>{tr("Connect one machine in minutes.", "几分钟内，让第一台电脑上线。")}</h2>
          <p>{tr("Start with 10,000 hosted tool calls each month, then add paid usage when you need more.", "每月先用 10,000 次免费托管调用，需要更多时直接充值扩容。")}</p>
        </div>
        <a className="primaryButton goldButton" href={user ? APP_ORIGIN + "/overview" : "/install/chatgpt"}>{user ? tr("Open dashboard", "打开控制台") : tr("Install Remote Arc", "安装 Remote Arc")}</a>
      </section>
    </PublicLayout>
  );
}



const PLUGIN_DEMO_VIDEO_URL =
  "https://assets.ps6.space/remote-arc/openai-plugin-demo/remote-arc-plugin-demo.mp4";

function DemoPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="pluginDemoPage">
        <section className="pluginDemoIntro">
          <span className="eyebrow">OPENAI PLUGIN DEMO</span>
          <h1>{tr("Remote Arc in ChatGPT", "ChatGPT 中的 Remote Arc")}</h1>
          <p>
            {tr(
              "A real end-to-end session: ChatGPT discovers a paired Mac, reads the demo project, runs its Node.js tests through Remote Arc, and returns the result.",
              "一次真实的端到端演示：ChatGPT 发现已配对的 Mac，读取演示项目，通过 Remote Arc 运行 Node.js 测试，并返回结果。",
            )}
          </p>
        </section>

        <section className="pluginDemoVideoWrap" aria-label="Remote Arc plugin demonstration video">
          <video
            className="pluginDemoVideo"
            controls
            playsInline
            preload="metadata"
          >
            <source src={PLUGIN_DEMO_VIDEO_URL} type="video/mp4" />
            {tr(
              "Your browser does not support HTML5 video.",
              "你的浏览器不支持 HTML5 视频。",
            )}
          </video>
        </section>

        <div className="pluginDemoMeta">
          <span>{tr("Recorded 27 Sep 2026", "录制于 2026 年 9 月 27 日")}</span>
          <span aria-hidden="true">·</span>
          <span>{tr("macOS · real Remote Arc connection", "macOS · 真实 Remote Arc 连接")}</span>
          <span aria-hidden="true">·</span>
          <a href={PLUGIN_DEMO_VIDEO_URL}>{tr("Open MP4 directly", "直接打开 MP4")}</a>
        </div>
      </main>
    </PublicLayout>
  );
}


type PublicUseCaseSlug =
  | "remote-development"
  | "data-work"
  | "home-lab"
  | "browser-research"
  | "remote-support";

function ConnectPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const scopes = [
    ["devices:read", tr("See your paired computers and their online state.", "查看已配对电脑及其在线状态。")],
    ["computer:read", tr("Read files, directories and process metadata on devices that allow it.", "在允许的设备上读取文件、目录和进程元数据。")],
    ["computer:write", tr("Use editing and terminal tools only where the device policy allows them.", "只在设备策略允许时使用文件编辑和终端工具。")],
    ["browser:read", tr("Read content from browser tabs you explicitly share.", "读取你明确共享的浏览器标签页内容。")],
  ];

  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero editorialPageHero">
        <span className="eyebrow">{tr("CONNECT", "连接")}</span>
        <h1>{tr("One paired computer. One Remote MCP endpoint. Use it from the AI client you already prefer.", "配对一次电脑，通过一个 Remote MCP Endpoint，让你已经在用的 AI 客户端直接使用。")}</h1>
        <p>{tr(
          "Remote Arc separates the device relationship from the AI relationship. Pair the computer locally, then authorize ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.",
          "Remote Arc 把“电脑配对”和“AI 授权”拆成两层。先在本机配对电脑，再通过 OAuth 授权 ChatGPT、Claude、Cursor 或其他兼容 MCP 客户端。",
        )}</p>
      </section>

      <section className="referenceSection">
        <div className="referenceLead">
          <span className="eyebrow">{tr("1 · PAIR THE COMPUTER", "1 · 配对电脑")}</span>
          <h2>{tr("Run this on the computer you want AI to reach.", "在希望 AI 访问的电脑上运行这一条命令。")}</h2>
          <p>{tr(
            "The CLI creates a short-lived pairing request and opens the approval page. After approval, the computer receives its own revocable credential stored locally.",
            "CLI 会创建短期配对请求并打开批准页面。批准后，这台电脑会获得一份独立、可撤销并保存在本机的设备凭证。",
          )}</p>
        </div>
        <div className="largeCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div>
        <div className="referenceFacts">
          <span>{tr("No repository clone", "无需 clone 仓库")}</span>
          <span>{tr("No VPN", "无需 VPN")}</span>
          <span>{tr("No public inbound port", "无需公网入站端口")}</span>
          <span>{tr("Windows · macOS · Linux", "Windows · macOS · Linux")}</span>
        </div>
      </section>

      <section className="referenceSection">
        <div className="referenceLead">
          <span className="eyebrow">{tr("2 · CHOOSE DEVICE PERMISSIONS", "2 · 选择设备权限")}</span>
          <h2>{tr("A paired device starts read-oriented. More power is a separate choice.", "配对完成后默认以只读能力为主，更高权限是另外的选择。")}</h2>
          <p>{tr(
            "The dashboard stores allowed tools per device. A development workstation can allow editing or terminal commands while another computer stays read-only.",
            "Dashboard 会逐设备保存允许的工具。开发机可以开放编辑或终端，而另一台电脑仍然保持只读。",
          )}</p>
        </div>
        <div className="permissionLadder">
          <div><strong>{tr("Safe", "Safe")}</strong><span>{tr("Read files, directories, metadata and processes", "读取文件、目录、元数据和进程")}</span><small>{tr("Default", "默认")}</small></div>
          <div><strong>{tr("Developer", "Developer")}</strong><span>{tr("Add write_file, edit_block and Local Undo", "增加 write_file、edit_block 与 Local Undo")}</span><small>{tr("Opt-in", "主动开启")}</small></div>
          <div><strong>{tr("Full", "Full")}</strong><span>{tr("Add shell execution and managed processes", "增加 Shell 执行与后台进程管理")}</span><small>{tr("Advanced", "高级")}</small></div>
        </div>
        <a className="textAction" href="/security-model#permissions">{tr("Understand the permission model", "了解权限模型")} →</a>
      </section>

      <section className="referenceSection">
        <div className="referenceLead">
          <span className="eyebrow">{tr("3 · CONNECT THE AI", "3 · 连接 AI")}</span>
          <h2>{tr("Every supported client reaches the same Remote Arc account.", "所有支持的客户端都连接到同一个 Remote Arc 账户。")}</h2>
          <p>{tr("The Universal Remote MCP endpoint is OAuth-protected and shared across your paired devices.", "Universal Remote MCP Endpoint 由 OAuth 保护，并复用同一批已配对设备。")}</p>
        </div>
        <div className="largeCodeLine"><code>{MCP_ENDPOINT}</code><CopyButton value={MCP_ENDPOINT} /></div>
        <div className="clientGuideRows">
          {aiClients.map((client) => (
            <a href={"/install/" + client.slug} key={client.name}>
              <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
              <div><strong>{client.name}</strong><span>{tr("Current setup guide and working example", "当前接入方式与可用示例")}</span></div>
              <b>→</b>
            </a>
          ))}
          <a href="/docs/mcp">
            <span className="miniMcp">M</span>
            <div><strong>{tr("Other Remote MCP clients", "其他 Remote MCP 客户端")}</strong><span>{tr("Use the endpoint directly and complete OAuth", "直接使用 Endpoint 并完成 OAuth")}</span></div>
            <b>→</b>
          </a>
        </div>
      </section>

      <section className="referenceSection">
        <div className="referenceLead">
          <span className="eyebrow">{tr("OAUTH SCOPES", "OAUTH SCOPE")}</span>
          <h2>{tr("What the AI client asks your account for.", "AI 客户端会向你的账户请求什么。")}</h2>
        </div>
        <div className="referenceTable">
          {scopes.map(([scope, body]) => <div key={scope}><code>{scope}</code><p>{body}</p></div>)}
        </div>
        <p className="referenceNote">{tr(
          "OAuth scope is not a way to bypass local device policy. A tool still has to be enabled for the selected computer and exposed by the local agent.",
          "OAuth Scope 不能绕过本机设备策略。工具仍然必须在目标电脑上被允许，而且必须由本地 Agent 实际开放。",
        )}</p>
      </section>
    </PublicLayout>
  );
}

function DocsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const toolGroups = [
    {
      title: tr("Device discovery", "设备发现"),
      tools: "list_devices · device_tools",
      body: tr("Find the target computer, its online state and the exact skills it currently exposes.", "找到目标电脑、在线状态，以及它当前实际开放的 Skill。"),
    },
    {
      title: tr("Filesystem", "文件系统"),
      tools: "list_directory · read_file · get_file_info · write_file · edit_block · undo_last_change",
      body: tr("Reading can stay enabled while editing is disabled. Workspace Scope and Sensitive Path Policy are checked again locally before filesystem execution.", "可以保留读取而关闭编辑；文件系统执行前还会在本机再次检查 Workspace Scope 与 Sensitive Path Policy。"),
    },
    {
      title: tr("Processes and terminal", "进程与终端"),
      tools: "list_processes · start_process · process_status · process_output · stop_process",
      body: tr("Process inspection is separate from terminal execution. start_process can run synchronously or return a managed background-process handle.", "进程查看与终端执行彼此独立；start_process 可以同步执行，也可以返回受管后台进程 Handle。"),
    },
    {
      title: tr("Shared browser tab", "共享浏览器标签页"),
      tools: "browser_list_tabs · browser_get_current_tab · browser_read_page · browser_get_selected_text · browser_extract_links · browser_extract_table",
      body: tr("Read-only browser context from Chrome tabs the user explicitly shares.", "从用户明确共享的 Chrome 标签页读取只读浏览器上下文。"),
    },
  ];

  return (
    <PublicLayout user={user}>
      <section className="readingPageIntro">
        <div>
          <span className="eyebrow">{tr("DOCS", "文档")}</span>
          <h1>{tr("Remote Arc documentation", "Remote Arc 文档")}</h1>
        </div>
        <p>{tr(
          "Install the local agent, connect an AI client, understand the permission model, and see exactly what crosses the hosted relay.",
          "从安装本地 Agent、连接 AI 客户端开始，再看权限模型、工具能力，以及究竟有哪些数据会经过托管 Relay。",
        )}</p>
        <nav className="readingPageLinks">
          <a href="/connect-ai">{tr("Connect AI", "连接 AI")} →</a>
          <a href="/security-model">{tr("Security model", "安全模型")} →</a>
          <a href="/use-cases">{tr("Use cases", "使用场景")} →</a>
          <a href="https://github.com/yaohuangguan/remote-arc">GitHub ↗</a>
        </nav>
      </section>

      <section className="docsIndex readingLayout">
        <aside>
          <span>{tr("ON THIS PAGE", "本页目录")}</span>
          <a href="#docs-start">{tr("Quick start", "快速开始")}</a>
          <a href="#docs-use">{tr("How to use it", "怎么使用")}</a>
          <a href="#docs-architecture">{tr("How it works", "工作原理")}</a>
          <a href="#docs-policy">{tr("Permissions", "权限模型")}</a>
          <a href="#docs-tools">{tr("19 public tools", "19 个公开工具")}</a>
          <a href="#docs-jobs">{tr("Background jobs & Undo", "后台任务与 Undo")}</a>
          <a href="#docs-data">{tr("Data handling", "数据处理")}</a>
          <a href="#docs-concerns">{tr("Concerns & limits", "Concern 与限制")}</a>
          <a href="#docs-reference">{tr("Reference", "参考")}</a>
        </aside>

        <div className="docsBody readingBody">
          <article id="docs-start">
            <span className="resourceArticleTag">01 / QUICK START</span>
            <h2>{tr("Start with one computer and one AI client.", "先连接一台电脑和一个 AI 客户端。")}</h2>
            <ol className="docSteps">
              <li><strong>{tr("Install and pair the computer.", "安装并配对电脑。")}</strong><p>{tr("Requires Node.js 20+. Run the command locally; the CLI opens a browser pairing page and shows a short code to approve.", "需要 Node.js 20+。在本机运行命令，CLI 会打开浏览器配对页，并显示短码供确认。")}</p><div className="docsCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div></li>
              <li><strong>{tr("Choose the device boundary.", "选择设备边界。")}</strong><p>{tr("A new device starts read-oriented. Use Safe, Developer or Full as a shortcut, then edit individual skills. Optionally configure Workspace Scope and extra protected paths.", "新设备以读取能力为主。可以先选 Safe、Developer 或 Full，再逐项调整 Skill；也可以配置 Workspace Scope 和额外受保护路径。")}</p></li>
              <li><strong>{tr("Connect the AI client.", "连接 AI 客户端。")}</strong><p>{tr("Add the Remote MCP endpoint and complete OAuth. The AI authorization is separate from the paired-device credential.", "添加 Remote MCP Endpoint 并完成 OAuth。AI 授权与电脑的设备凭证是两条独立信任关系。")}</p><div className="docsCodeLine"><code>{MCP_ENDPOINT}</code><CopyButton value={MCP_ENDPOINT} /></div></li>
              <li><strong>{tr("Address the computer by name.", "按设备名称使用。")}</strong><p>{tr("Ask the AI to list devices if needed, then name the target computer in the task: “On Personal Mac, read package.json and run the tests.”", "需要时先让 AI 列出设备，然后在任务里明确目标电脑，例如：“在 Personal Mac 上读取 package.json 并运行测试。”")}</p></li>
            </ol>
            <p className="referenceNote">{tr(
              "For a local hard read-only ceiling, run npx remotelink --safe. The dashboard cannot remotely expand that device beyond the local cap.",
              "如果希望建立本机硬只读上限，可运行 npx remotelink --safe；Dashboard 无法远程把这台设备扩展到更高权限。",
            )}</p>
          </article>

          <article id="docs-use">
            <span className="resourceArticleTag">02 / USING REMOTE ARC</span>
            <h2>{tr("Typical tasks and the permission they actually require.", "常见任务真正需要哪些权限。")}</h2>
            <div className="referenceTable docTaskTable">
              <div><strong>{tr("Inspect a project", "检查项目")}</strong><p>{tr("list_directory, read_file and get_file_info. No write or terminal permission is required.", "使用 list_directory、read_file、get_file_info；不需要写入或终端权限。")}</p></div>
              <div><strong>{tr("Patch a file", "修改文件")}</strong><p>{tr("Enable write_file and/or edit_block. undo_last_change can restore the newest supported Remote Arc edit when the file has not changed again.", "开启 write_file 和/或 edit_block；如果文件之后没有再次变化，undo_last_change 可以恢复最近一次受支持的 Remote Arc 编辑。")}</p></div>
              <div><strong>{tr("Run tests or a command", "运行测试或命令")}</strong><p>{tr("Enable start_process. Terminal execution is real shell access under the local OS user, so treat it as a high-impact skill.", "开启 start_process。终端执行是真实 Shell 权限，继承本机 OS 用户，因此应当视为高影响 Skill。")}</p></div>
              <div><strong>{tr("Keep a dev server running", "保持开发服务器运行")}</strong><p>{tr("Start a managed background process, keep its process_id, then use process_status, process_output or stop_process later.", "启动受管后台进程，保留 process_id，之后通过 process_status、process_output 或 stop_process 管理。")}</p></div>
              <div><strong>{tr("Read a web page you already opened", "读取你已经打开的网页")}</strong><p>{tr("Share the Chrome tab explicitly, then use the browser read tools. The current browser companion does not grant generic click or form-fill control.", "明确共享 Chrome 标签页，再使用浏览器读取工具；当前 Browser Companion 不开放通用点击或表单填写能力。")}</p></div>
            </div>
          </article>

          <article id="docs-architecture">
            <span className="resourceArticleTag">03 / ARCHITECTURE</span>
            <h2>{tr("How a tool call reaches one paired computer.", "一次 Tool Call 如何抵达指定电脑。")}</h2>
            <p>{tr(
              "The AI client talks to the Remote MCP endpoint over OAuth. The Cloudflare Worker authenticates the user and checks hosted policy. D1 holds durable account, device and policy state. A per-user Durable Object routes the live request to the outbound WebSocket maintained by the local agent. The native execution core performs the final operation on the computer.",
              "AI 客户端通过 OAuth 访问 Remote MCP Endpoint；Cloudflare Worker 负责认证并检查托管策略；D1 保存账户、设备和策略等持久状态；每用户 Durable Object 把实时请求路由到本地 Agent 主动维持的 WebSocket；最后由电脑上的原生执行核心完成操作。",
            )}</p>
            <div className="resourceCodeRail"><code>AI client</code><span>→</span><code>OAuth / MCP</code><span>→</span><code>Worker</code><span>→</span><code>Durable Object</code><span>→</span><code>outbound WSS</code><span>→</span><code>local execution core</code></div>
            <p className="referenceNote">{tr("Remote Arc does not require a public inbound port, router forwarding or an always-on VPN.", "Remote Arc 不要求公网入站端口、路由器端口映射或常驻 VPN。")}</p>
          </article>

          <article id="docs-policy">
            <span className="resourceArticleTag">04 / PERMISSIONS</span>
            <h2>{tr("There is no single “full computer access” switch.", "不存在一个笼统的“整机访问”开关。")}</h2>
            <div className="policyLayers">
              <div><strong>OAuth scope</strong><p>{tr("Constrains what an AI client is authorized to request from the account.", "限制 AI 客户端被授权向账户请求哪些能力。")}</p></div>
              <div><strong>{tr("Per-device skill list", "逐设备 Skill 列表")}</strong><p>{tr("The relay checks the selected computer's allowed tools before routing. Presets are only shortcuts over the editable list.", "Relay 在路由前检查目标电脑的 Allowed Tools；预设只是逐项 Skill 列表上的快捷方式。")}</p></div>
              <div><strong>Workspace Scope</strong><p>{tr("Normal filesystem tools can be restricted to one or more canonical directory roots.", "普通文件系统工具可以被限制在一个或多个规范化目录 Root 内。")}</p></div>
              <div><strong>Sensitive Path Policy</strong><p>{tr("Common credential locations are protected by default; custom protected paths and narrow exceptions can be configured per device.", "常见凭证位置默认受保护；每台设备还可以配置自定义保护路径与窄范围例外。")}</p></div>
              <div><strong>{tr("Local enforcement", "本机再次执行")}</strong><p>{tr("The native core re-checks path boundaries and only executes tools that the local agent actually exposes.", "原生执行核心会重新检查路径边界，并且只执行本地 Agent 实际开放的工具。")}</p></div>
            </div>
          </article>

          <article id="docs-tools">
            <span className="resourceArticleTag">05 / TOOLS</span>
            <h2>{tr("The current public MCP surface: 19 tools.", "当前公开 MCP Tool Surface：19 个工具。")}</h2>
            <p>{tr("These names come from the current relay implementation; dashboard-only helpers are intentionally excluded.", "以下名称直接来自当前 Relay 实现；仅供 Dashboard 使用的内部辅助能力不计入公开 Tool Surface。")}</p>
            <div className="docsToolGroups">
              {toolGroups.map((group) => (
                <div key={group.title}><h3>{group.title}</h3><code>{group.tools}</code><p>{group.body}</p></div>
              ))}
            </div>
          </article>

          <article id="docs-jobs">
            <span className="resourceArticleTag">06 / BACKGROUND JOBS & UNDO</span>
            <h2>{tr("Long-running work is managed locally; recovery stays local too.", "长任务在本机管理，恢复数据也留在本机。")}</h2>
            <h3>{tr("Managed background processes", "受管后台进程")}</h3>
            <p>{tr(
              "start_process can run normally or create a managed background process. Remote Arc keeps an in-memory local record with the command, cwd, PID, captured stdout/stderr and lifecycle state. Up to 32 managed process records are kept; finished records are retained for a limited local window. This is process management, not a reboot-persistent job scheduler.",
              "start_process 可以普通执行，也可以创建受管后台进程。Remote Arc 会在本机内存中记录 command、cwd、PID、捕获的 stdout/stderr 与生命周期状态；最多管理 32 条记录，已结束记录只保留有限时间。这是进程管理，不是跨重启持久化的任务调度器。",
            )}</p>
            <h3>{tr("Local Undo", "Local Undo")}</h3>
            <p>{tr(
              "Before supported write_file and edit_block changes, the previous file state is stored under ~/.remotearc/undo. The snapshot is not uploaded to Remote Arc Cloud. Before restore, the current file hash is checked so newer work is not silently overwritten.",
              "在受支持的 write_file 与 edit_block 修改前，旧文件状态会保存在 ~/.remotearc/undo；快照不会上传到 Remote Arc Cloud。恢复前还会校验当前文件 Hash，避免静默覆盖更新后的工作。",
            )}</p>
            <p className="referenceNote">{tr("Undo does not reverse deployments, package publishing, network requests, database mutations or arbitrary shell side effects.", "Undo 无法撤销部署、包发布、网络请求、数据库变更或任意 Shell 副作用。")}</p>
          </article>

          <article id="docs-data">
            <span className="resourceArticleTag">07 / DATA</span>
            <h2>{tr("What Remote Arc stores, what only transits, and what stays on the device.", "Remote Arc 保存什么、只转发什么、什么只留在设备上。")}</h2>
            <div className="referenceTable">
              <div><strong>D1</strong><p>{tr("Account identity, paired-device metadata, device credential hashes, sessions, OAuth grants, per-device policy, usage counters and audit metadata.", "账户身份、设备元数据、设备凭证 Hash、Session、OAuth Grant、逐设备策略、使用量与审计元数据。")}</p></div>
              <div><strong>Durable Object</strong><p>{tr("Live device presence and request routing while a computer is connected.", "设备在线时的实时 Presence 与请求路由。")}</p></div>
              <div><strong>{tr("Relay transit", "Relay 传输")}</strong><p>{tr("The active file content, directory listing, process output or command result needed to fulfill the current request passes through the hosted relay.", "完成当前请求所需的文件内容、目录列表、进程输出或命令结果会经过托管 Relay。")}</p></div>
              <div><strong>{tr("Local only", "仅本机")}</strong><p>{tr("Filesystem state, process state, raw local device credential and Local Undo snapshot contents.", "文件系统状态、进程状态、本机原始设备凭证与 Local Undo 快照内容。")}</p></div>
              <div><strong>{tr("Audit design", "审计设计")}</strong><p>{tr("Audit records keep operational metadata such as device, tool, result and time rather than intentionally storing file contents, raw command arguments or tool results.", "审计记录保存设备、工具、结果、时间等运行元数据，而不是有意保存文件内容、原始命令参数或 Tool Result。")}</p></div>
            </div>
          </article>

          <article id="docs-concerns">
            <span className="resourceArticleTag">08 / CONCERNS & LIMITS</span>
            <h2>{tr("Important things Remote Arc does not pretend away.", "Remote Arc 不会回避的几个重要限制。")}</h2>
            <div className="concernList">
              <div><strong>{tr("The relay is not zero-knowledge.", "Relay 不是 zero-knowledge。")}</strong><p>{tr("Transport is encrypted, but the hosted relay has to process the active tool payload to route it. Remote Arc minimizes retention instead of claiming an E2EE property it does not have.", "传输会加密，但托管 Relay 为了路由必须处理当前 Tool Payload。Remote Arc 选择最小化留存，而不是声称并不存在的 E2EE 属性。")}</p></div>
              <div><strong>{tr("Terminal access is real shell access.", "终端权限是真实 Shell 权限。")}</strong><p>{tr("Full terminal runs under the local OS user's permissions. Workspace Scope constrains Remote Arc file tools and the start_process cwd, but it is not a VM or OS sandbox for arbitrary shell commands.", "Full Terminal 继承本机 OS 用户权限。Workspace Scope 会约束 Remote Arc 文件工具和 start_process 的 cwd，但它不是任意 Shell 命令的 VM 或 OS 沙箱。")}</p></div>
              <div><strong>{tr("Undo has a defined boundary.", "Undo 有明确边界。")}</strong><p>{tr("It protects supported Remote Arc file edits, not external side effects.", "它保护受支持的 Remote Arc 文件编辑，而不是外部副作用。")}</p></div>
              <div><strong>{tr("Managed jobs are not reboot-persistent.", "受管任务不是跨重启持久化任务。")}</strong><p>{tr("Their management record lives in the running local agent. Use a real service manager if a workload must survive agent or machine restarts.", "它们的管理记录存在于正在运行的本地 Agent 中；如果任务必须跨 Agent 或机器重启，请使用真正的系统服务管理器。")}</p></div>
            </div>
            <div className="inlineReference">
              <a href="/security-model">{tr("Security and trust model", "安全与信任模型")} →</a>
              <a href="/privacy">{tr("Privacy policy", "隐私政策")} →</a>
            </div>
          </article>

          <article id="docs-reference">
            <span className="resourceArticleTag">09 / REFERENCE</span>
            <h2>{tr("Reference", "参考")}</h2>
            <div className="referenceLinkRows">
              <a href="/docs/mcp"><strong>{tr("Remote MCP reference", "Remote MCP 参考")}</strong><span>{MCP_ENDPOINT}</span><b>→</b></a>
              <a href="/connect-ai"><strong>{tr("Connect a client", "连接客户端")}</strong><span>ChatGPT · Claude · Cursor · Remote MCP</span><b>→</b></a>
              <a href="/security-model"><strong>{tr("Security & trust model", "安全与信任模型")}</strong><span>{tr("Identity, path boundaries, data handling, revocation and limits", "身份、路径边界、数据处理、撤销与限制")}</span><b>→</b></a>
              <a href="/resources"><strong>{tr("Architecture notes", "架构说明")}</strong><span>Worker · D1 · Durable Objects · OAuth</span><b>→</b></a>
              <a href="https://github.com/yaohuangguan/remote-arc/blob/master/README.md"><strong>README</strong><span>{tr("Implementation notes and development setup", "实现说明与开发环境")}</span><b>↗</b></a>
              <a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md"><strong>SECURITY.md</strong><span>{tr("Public security notes", "公开安全说明")}</span><b>↗</b></a>
            </div>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}

function SecurityModelPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="readingPageIntro">
        <div>
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr("Security and trust model", "安全与信任模型")}</h1>
        </div>
        <p>{tr(
          "Remote Arc lets an AI act on a real computer. This page documents the actual trust boundaries, what can be revoked, what the hosted service can see, and where protection stops.",
          "Remote Arc 让 AI 能在真实电脑上执行操作。本页只说明真实的信任边界：哪些权限可以撤销、托管服务能看到什么，以及保护在哪里停止。",
        )}</p>
        <nav className="readingPageLinks">
          <a href="/docs#docs-policy">{tr("Permission docs", "权限文档")} →</a>
          <a href="/docs#docs-data">{tr("Data handling", "数据处理")} →</a>
          <a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md">SECURITY.md ↗</a>
        </nav>
      </section>

      <section className="securityModelLayout readingLayout">
        <aside>
          <span>{tr("ON THIS PAGE", "本页目录")}</span>
          <a href="#summary">{tr("Summary", "摘要")}</a>
          <a href="#identity">{tr("Identity & transport", "身份与传输")}</a>
          <a href="#paths">{tr("Files & directories", "文件与目录")}</a>
          <a href="#skills">{tr("Skills & terminal", "Skill 与终端")}</a>
          <a href="#undo">{tr("Undo & managed jobs", "Undo 与后台任务")}</a>
          <a href="#data">{tr("Hosted knowledge", "托管服务知道什么")}</a>
          <a href="#revocation">{tr("Pause & revoke", "暂停与撤销")}</a>
          <a href="#limits">{tr("Limits", "限制")}</a>
        </aside>

        <div className="securityModelBody readingBody">
          <article id="summary">
            <span className="resourceArticleTag">01 / SUMMARY</span>
            <h2>{tr("The current security model in plain terms.", "用直接的话概括当前安全模型。")}</h2>
            <div className="securitySummaryRows">
              <div><strong>{tr("Default posture", "默认状态")}</strong><p>{tr("Newly paired devices expose read-oriented skills first. Editing and terminal are separate opt-ins.", "新配对设备首先开放读取类 Skill；编辑和终端是独立的主动开启项。")}</p></div>
              <div><strong>{tr("Final execution boundary", "最终执行边界")}</strong><p>{tr("The hosted relay checks account/device policy, then the local agent checks what it actually exposes and the native core re-checks local path rules.", "托管 Relay 先检查账户/设备策略；本地 Agent 再检查实际开放能力，原生执行核心还会重新检查本机路径规则。")}</p></div>
              <div><strong>{tr("Transport", "传输")}</strong><p>{tr("HTTPS/WSS is encrypted in transit. The relay is not zero-knowledge because it must process active tool payloads to route them.", "HTTPS/WSS 在传输中加密。Relay 不是 zero-knowledge，因为它必须处理当前 Tool Payload 才能完成路由。")}</p></div>
              <div><strong>{tr("Emergency control", "紧急控制")}</strong><p>{tr("Account-wide MCP pause, per-client OAuth revocation and per-device revocation are independent controls.", "账户级 MCP Pause、逐 AI 客户端 OAuth 撤销和逐设备撤销是三套独立控制。")}</p></div>
            </div>
          </article>

          <article id="identity">
            <span className="resourceArticleTag">02 / IDENTITY & TRANSPORT</span>
            <h2>{tr("The AI client, the account and the computer have separate credentials.", "AI 客户端、账户与电脑使用分离的凭证。")}</h2>
            <p>{tr(
              "The dashboard user signs in separately from the MCP client. AI clients use OAuth 2.1 authorization code flow with PKCE. Every paired computer receives its own revocable device credential; D1 stores a SHA-256 hash rather than the raw device credential. The local agent opens an outbound encrypted WebSocket to Remote Arc, so the computer does not need to expose an inbound port.",
              "Dashboard 用户登录与 MCP 客户端授权彼此分离。AI 客户端使用 OAuth 2.1 Authorization Code + PKCE；每台配对电脑拥有独立可撤销的 Device Credential，D1 保存 SHA-256 Hash 而不是原始凭证。本地 Agent 主动建立加密出站 WebSocket，因此电脑无需暴露入站端口。",
            )}</p>
          </article>

          <article id="paths">
            <span className="resourceArticleTag">03 / FILES & DIRECTORIES</span>
            <h2>{tr("Filesystem access can be constrained below the device level.", "文件系统访问可以继续细化到设备以下。")}</h2>
            <div className="securitySummaryRows">
              <div><strong>Workspace Scope</strong><p>{tr("Configure one or more allowed directory roots. Normal Remote Arc filesystem tools must stay under those canonical roots.", "配置一个或多个允许的目录 Root；普通 Remote Arc 文件工具必须停留在这些规范化 Root 下。")}</p></div>
              <div><strong>Sensitive Path Policy</strong><p>{tr("Common credential locations such as .ssh, .aws, .gnupg, browser profiles and .env files are protected by default.", "常见凭证位置如 .ssh、.aws、.gnupg、浏览器 Profile 与 .env 默认受保护。")}</p></div>
              <div><strong>{tr("Narrow exceptions", "窄范围例外")}</strong><p>{tr("If a project genuinely needs one protected file or directory, add an explicit exception without disabling protection globally.", "如果项目确实需要一个受保护文件或目录，可以添加明确例外，而不必全局关闭保护。")}</p></div>
              <div><strong>{tr("Local canonical-path check", "本机规范化路径检查")}</strong><p>{tr("Existing path ancestors are resolved again on the computer so a symlink inside an allowed workspace cannot trivially escape the boundary.", "路径 Ancestor 会在电脑本机再次规范化解析，避免 Allowed Workspace 内的符号链接轻易逃逸边界。")}</p></div>
            </div>
          </article>

          <article id="skills">
            <span className="resourceArticleTag">04 / SKILLS & TERMINAL</span>
            <h2>{tr("Skills are individually controllable; presets are convenience only.", "Skill 可以逐项控制；预设只是方便操作。")}</h2>
            <p>{tr(
              "Safe, Developer and Full map to an editable per-device allowed-tool list. Reading files does not imply permission to edit them; process listing does not imply permission to start a shell. The CLI can also add a local --safe ceiling that the dashboard cannot expand remotely.",
              "Safe、Developer、Full 最终都会落到每台设备可编辑的 Allowed Tool 列表。能读文件不代表能编辑；能看进程不代表能启动 Shell。CLI 还可以通过 --safe 加一个 Dashboard 无法远程放大的本机上限。",
            )}</p>
            <p className="referenceNote">{tr(
              "When start_process is enabled, it is real shell access under the local OS user. Safety Guard blocks a narrow set of catastrophic patterns, but it is defense in depth, not an operating-system sandbox.",
              "一旦开启 start_process，它就是真实的本机用户 Shell 权限。Safety Guard 会拦截一小类灾难性模式，但它只是纵深防御，不是操作系统沙箱。",
            )}</p>
          </article>

          <article id="undo">
            <span className="resourceArticleTag">05 / RECOVERY & JOBS</span>
            <h2>{tr("File recovery and long-running jobs are managed on the computer.", "文件恢复与长任务都由电脑本机管理。")}</h2>
            <div className="securitySummaryRows">
              <div><strong>Local Undo</strong><p>{tr("Supported write_file/edit_block operations snapshot the previous file under ~/.remotearc/undo. Snapshot contents are not uploaded.", "受支持的 write_file/edit_block 会把旧状态保存到 ~/.remotearc/undo；快照内容不会上传。")}</p></div>
              <div><strong>{tr("Conflict-safe restore", "冲突安全恢复")}</strong><p>{tr("Undo checks the post-edit file hash before restoring. If the file changed again, automatic restore is refused.", "Undo 会在恢复前检查修改后的文件 Hash；如果文件又被改变，自动恢复会拒绝覆盖。")}</p></div>
              <div><strong>{tr("Managed background process", "受管后台进程")}</strong><p>{tr("A permitted start_process call can create a local managed process with captured stdout/stderr and a handle for status, output and stop.", "允许的 start_process 可以创建本机受管进程，捕获 stdout/stderr，并提供 Handle 用于状态、输出与停止。")}</p></div>
              <div><strong>{tr("No reboot-persistence claim", "不声称跨重启持久化")}</strong><p>{tr("Managed-process tracking belongs to the running local agent. It is not a replacement for launchd, systemd, Windows Services or another persistent service manager.", "受管进程的追踪属于当前运行的本地 Agent；它不替代 launchd、systemd、Windows Services 等持久服务管理器。")}</p></div>
            </div>
          </article>

          <article id="data">
            <span className="resourceArticleTag">06 / HOSTED KNOWLEDGE</span>
            <h2>{tr("Encrypted transport does not mean the hosted relay is blind.", "传输加密并不意味着托管 Relay 看不到当前请求。")}</h2>
            <div className="dataBoundaryTable">
              <div><strong>{tr("Stored control-plane state", "保存的控制面状态")}</strong><p>{tr("Account identity, device metadata, credential hashes, OAuth grants, per-device policy, usage counters and operational audit metadata.", "账户身份、设备元数据、凭证 Hash、OAuth Grant、逐设备策略、使用量与运行审计元数据。")}</p></div>
              <div><strong>{tr("Passes through while active", "请求期间会经过")}</strong><p>{tr("The file content, directory listing, process output, command result or other tool payload needed to fulfill the current call.", "完成当前调用所需的文件内容、目录列表、进程输出、命令结果或其他 Tool Payload。")}</p></div>
              <div><strong>{tr("Not intentionally retained in audit records", "不会有意写入审计记录")}</strong><p>{tr("File contents, raw command arguments, OAuth tokens, raw device credentials and tool results.", "文件内容、原始命令参数、OAuth Token、原始设备凭证与 Tool Result。")}</p></div>
              <div><strong>{tr("Local-only recovery data", "仅本机恢复数据")}</strong><p>{tr("Undo snapshot contents remain on the paired computer.", "Undo 快照内容留在已配对电脑本机。")}</p></div>
            </div>
          </article>

          <article id="revocation">
            <span className="resourceArticleTag">07 / PAUSE & REVOKE</span>
            <h2>{tr("There is more than one way to cut access.", "关闭访问不依赖单一开关。")}</h2>
            <div className="securitySummaryRows">
              <div><strong>{tr("Pause Remote MCP", "暂停 Remote MCP")}</strong><p>{tr("The account-level switch blocks authenticated MCP calls server-side until you explicitly resume them.", "账户级开关会在服务端阻止已认证 MCP 调用，直到你明确恢复。")}</p></div>
              <div><strong>{tr("Revoke one AI client grant", "撤销一个 AI 客户端授权")}</strong><p>{tr("Invalidate that OAuth authorization without re-pairing every computer.", "只使该 OAuth 授权失效，不需要重新配对所有电脑。")}</p></div>
              <div><strong>{tr("Revoke one computer", "撤销一台电脑")}</strong><p>{tr("Invalidate that device credential; the computer must be paired again before any AI can use it.", "使该设备凭证失效；在任何 AI 再次使用它之前必须重新配对。")}</p></div>
              <div><strong>{tr("Stop the local agent", "停止本地 Agent")}</strong><p>{tr("Because the computer maintains the outbound connection, stopping the local agent also removes that machine from live routing.", "由于连接由电脑本地主动维持，停止本地 Agent 也会让该机器退出实时路由。")}</p></div>
            </div>
          </article>

          <article id="limits">
            <span className="resourceArticleTag">08 / LIMITS</span>
            <h2>{tr("What these controls do not guarantee.", "这些控制不保证什么。")}</h2>
            <div className="concernList">
              <div><strong>{tr("No zero-knowledge claim", "不声称 zero-knowledge")}</strong><p>{tr("The relay processes active tool payloads in order to route them.", "Relay 为完成路由会处理当前 Tool Payload。")}</p></div>
              <div><strong>{tr("No shell sandbox claim", "不声称 Shell 是沙箱")}</strong><p>{tr("An allowed terminal command can use the local user's OS permissions and can reach external services.", "允许的终端命令可以使用本机用户的 OS 权限，也可能访问外部服务。")}</p></div>
              <div><strong>{tr("Undo is not transaction rollback", "Undo 不是事务回滚")}</strong><p>{tr("Deployments, publishes, API calls and remote database changes are outside Local Undo.", "部署、发布、API 调用和远程数据库修改不在 Local Undo 范围内。")}</p></div>
              <div><strong>{tr("Public security work continues", "公开安全工作仍在继续")}</strong><p>{tr("See SECURITY.md for the current pre-public hardening list, including CSRF protection, installer signing and ongoing OAuth/DCR review.", "当前公开前加固清单见 SECURITY.md，包括 CSRF 防护、安装包签名与持续 OAuth/DCR 审查。")}</p></div>
            </div>
          </article>

          <div className="inlineReference">
            <a href="/docs">{tr("Documentation", "文档")} →</a>
            <a href="/privacy">{tr("Privacy policy", "隐私政策")} →</a>
            <a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md">SECURITY.md ↗</a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function UseCasesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const cases: Array<{ slug: PublicUseCaseSlug; title: string; body: string; tag: string; tools: string }> = [
    {
      slug: "remote-development",
      title: tr("Remote development on the machine that already has the repo", "直接在已经有仓库的电脑上远程开发"),
      body: tr("Inspect code, read logs, make targeted edits, run tests and manage a long-running local process without moving the project into another environment.", "无需把项目搬到另一个环境：直接检查代码、读取日志、定向修改、运行测试并管理本机长任务。"),
      tag: tr("DEVELOPMENT", "开发"),
      tools: "read_file · edit_block · start_process · undo",
    },
    {
      slug: "data-work",
      title: tr("Work with local data and the software already installed beside it", "直接使用本机数据和已经安装好的软件"),
      body: tr("Let the AI reach a CSV, logs or project data on your workstation, run the local Python/Node toolchain when allowed, and save a result back.", "让 AI 读取工作站上的 CSV、日志或项目数据，在允许时调用本机 Python/Node 工具链，并把结果写回本机。"),
      tag: tr("DATA", "数据"),
      tools: "read_file · start_process · write_file",
    },
    {
      slug: "home-lab",
      title: tr("Home lab and headless machine checks without opening SSH to the internet", "无需把 SSH 暴露到互联网，也能检查 Home Lab 和无头设备"),
      body: tr("Check disk space, containers, services and logs through the existing outbound Remote Arc connection.", "通过 Remote Arc 已建立的出站连接检查磁盘、容器、服务和日志。"),
      tag: tr("OPS", "运维"),
      tools: "list_processes · start_process · process_output",
    },
    {
      slug: "browser-research",
      title: tr("Read the browser tab you explicitly shared", "读取你明确共享的浏览器标签页"),
      body: tr("Extract readable page content, selected text, links or a table without granting navigation, clicking or form-filling controls.", "提取页面正文、选中文本、链接或表格，而不开放跳转、点击或表单填写能力。"),
      tag: tr("BROWSER", "浏览器"),
      tools: "browser_read_page · selected_text · links · tables",
    },
    {
      slug: "remote-support",
      title: tr("Authorized remote support with an AI reading the same machine output you would", "让 AI 读取真实机器输出，辅助授权范围内的远程支持"),
      body: tr("On a computer you own or are authorized to administer, inspect logs, processes and configuration and make the approved fix without a screen-sharing session.", "在你拥有或获授权管理的电脑上检查日志、进程和配置，并在无需屏幕共享的情况下完成获准修复。"),
      tag: tr("SUPPORT", "支持"),
      tools: "read_file · list_processes · start_process",
    },
  ];

  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero editorialPageHero">
        <span className="eyebrow">{tr("USE CASES", "使用场景")}</span>
        <h1>{tr("Use Remote Arc when the answer depends on a real machine, not another cloud sandbox.", "当任务依赖真实电脑，而不是另一个云端沙箱时，Remote Arc 才真正有价值。")}</h1>
        <p>{tr(
          "The common thread is local context: a repository, installed toolchain, data file, home server, running process or browser tab that already exists somewhere you control.",
          "这些场景的共同点是本机上下文：某个仓库、已安装工具链、数据文件、家庭服务器、运行中进程，或你正在浏览的标签页。",
        )}</p>
      </section>
      <section className="useCaseEditorialList">
        {cases.map((item, index) => (
          <a href={"/use-cases/" + item.slug} key={item.slug}>
            <span className="caseIndex">{String(index + 1).padStart(2, "0")}</span>
            <div className="caseMain"><small>{item.tag}</small><h2>{item.title}</h2><p>{item.body}</p><code>{item.tools}</code></div>
            <b>→</b>
          </a>
        ))}
      </section>
      <section className="ctaStrip editorialCta">
        <div><span className="eyebrow">{tr("NOT A GENERIC RPA TOOL", "不是通用 RPA")}</span><h2>{tr("Remote Arc is strongest when the AI needs machine context you already have.", "当 AI 需要你已经拥有的本机上下文时，Remote Arc 最有价值。")}</h2><p>{tr("For screen-first GUI automation, a desktop-control product may be a better fit. Remote Arc focuses on files, processes, terminals, managed jobs and explicitly shared browser content.", "如果任务主要依赖 GUI 屏幕操作，桌面控制类产品可能更合适。Remote Arc 更专注文件、进程、终端、受管任务与明确共享的浏览器内容。")}</p></div>
        <a className="ghostButton" href="/docs">{tr("See exact capabilities", "查看准确能力")} →</a>
      </section>
    </PublicLayout>
  );
}

function UseCaseDetailPage({ slug, user }: { slug: PublicUseCaseSlug; user?: User | null }) {
  const { tr } = useI18n();
  const data = {
    "remote-development": {
      tag: tr("DEVELOPMENT", "开发"),
      title: tr("Work on the repository that already lives on your remote computer.", "直接处理已经存在于远程电脑上的仓库。"),
      intro: tr("Instead of copying a project into a hosted workspace, let your AI inspect and act in the existing checkout with the toolchain, dependencies and environment already on that machine.", "无需把项目复制到托管工作区，让 AI 直接进入现有 Checkout，使用那台电脑已经存在的工具链、依赖和环境。"),
      prompt: tr("“On my Mac, inspect the current git status, run the tests, find the failing route test, patch only the affected file, rerun the tests and show me the diff.”", "“在我的 Mac 上检查当前 git status、跑测试、找到失败的路由测试，只修改受影响文件，再跑测试并给我看 diff。”"),
      tools: "list_directory · read_file · get_file_info · edit_block · start_process · undo_last_change",
      permission: tr("Read access + File editing + Terminal", "读取权限 + 文件编辑 + 终端"),
      facts: [
        tr("The repository and dependencies stay on your machine.", "仓库和依赖继续留在你的电脑上。"),
        tr("File edits are separate from terminal permission.", "文件编辑和终端权限彼此独立。"),
        tr("Supported Remote Arc edits can keep local-only undo snapshots.", "受支持的 Remote Arc 修改可以保留仅存本机的 Undo 快照。"),
      ],
      limit: tr("Terminal commands inherit the local OS user's permissions. Remote Arc does not sandbox an unrestricted shell.", "终端命令继承本机操作系统用户权限；Remote Arc 不会把 unrestricted shell 伪装成沙箱。"),
    },
    "data-work": {
      tag: tr("DATA", "数据"),
      title: tr("Analyze local data without uploading the whole working environment somewhere else.", "无需把整个工作环境上传到别处，也能处理本机数据。"),
      intro: tr("The AI can inspect a file on your workstation and, if terminal access is enabled, call the Python, Node or other tooling that is already installed there.", "AI 可以检查工作站上的文件；如果开启终端权限，还能调用那台电脑已经安装的 Python、Node 或其他工具。"),
      prompt: tr("“On my Windows PC, inspect reports/input.csv, use the local Python environment to summarize missing values and group totals, then save reports/summary.md.”", "“在我的 Windows 电脑上检查 reports/input.csv，用本机 Python 环境汇总缺失值和分组统计，然后保存 reports/summary.md。”"),
      tools: "read_file · get_file_info · start_process · write_file",
      permission: tr("Read access + optional File editing / Terminal", "读取权限 + 可选文件编辑 / 终端"),
      facts: [
        tr("The source file can stay on the local machine.", "源文件可以继续留在本机。"),
        tr("The AI can use software already installed on that computer.", "AI 可以使用那台电脑已经安装的软件。"),
        tr("Workspace Scope can optionally constrain ordinary file access.", "Workspace Scope 可以选择性限制普通文件访问范围。"),
      ],
      limit: tr("Remote Arc does not magically add a data runtime. Commands rely on software actually installed on the target machine.", "Remote Arc 不会凭空提供数据运行时；命令依赖目标电脑上实际安装的软件。"),
    },
    "home-lab": {
      tag: tr("HOME LAB / OPS", "HOME LAB / 运维"),
      title: tr("Check a headless box without publishing an SSH port.", "无需发布 SSH 端口，也能检查一台无头设备。"),
      intro: tr("A home server, mini PC or Linux host can keep an outbound Remote Arc connection while your AI reads the exact command output you would normally inspect over SSH.", "家庭服务器、Mini PC 或 Linux 主机可以保持 Remote Arc 出站连接，让 AI 读取你平时通过 SSH 才会查看的真实命令输出。"),
      prompt: tr("“On home-server, show disk usage, Docker containers, failed systemd units and the last 100 lines of the media service log. Do not restart anything.”", "“在 home-server 上查看磁盘占用、Docker 容器、失败的 systemd unit 和媒体服务日志最后 100 行。不要重启任何东西。”"),
      tools: "list_processes · start_process · process_status · process_output",
      permission: tr("Terminal if command-level inspection is needed", "如果需要命令级检查，则需终端权限"),
      facts: [
        tr("No inbound port forwarding is required by Remote Arc.", "Remote Arc 不要求做入站端口转发。"),
        tr("Different machines can expose different tool sets.", "不同设备可以开放不同工具集合。"),
        tr("The AI sees command output and can reason about it in the same conversation.", "AI 可以在同一对话中读取命令输出并继续分析。"),
      ],
      limit: tr("Remote Arc is not configuration management. For declarative fleet state at scale, keep using tools designed for that job.", "Remote Arc 不是配置管理系统；大规模声明式 Fleet 管理仍应使用专门工具。"),
    },
    "browser-research": {
      tag: tr("BROWSER", "浏览器"),
      title: tr("Share the page, not the whole browser.", "共享一个页面，而不是交出整个浏览器。"),
      intro: tr("The browser companion exposes read-only tools for tabs you explicitly share. That makes current-page context available to the AI without enabling clicks, navigation or form submission.", "Browser Companion 为你明确共享的标签页提供只读工具，让 AI 获得当前页面上下文，而不开放点击、跳转或表单提交。"),
      prompt: tr("“Read the tab I shared, extract the feature comparison table, then list only documentation links from the page.”", "“读取我共享的标签页，提取功能对比表，然后只列出页面里的文档链接。”"),
      tools: "browser_list_tabs · browser_get_current_tab · browser_read_page · browser_get_selected_text · browser_extract_links · browser_extract_table",
      permission: tr("Browser read", "浏览器只读"),
      facts: [
        tr("Tabs must be explicitly shared.", "标签页必须被明确共享。"),
        tr("The current browser tools are read-only.", "当前浏览器工具全部只读。"),
        tr("Page text, selected text, links and tables can be extracted separately.", "页面正文、选中文本、链接和表格可以分别提取。"),
      ],
      limit: tr("Remote Arc browser tools do not currently navigate, click elements or fill forms.", "Remote Arc 当前的浏览器工具不会执行跳转、元素点击或表单填写。"),
    },
    "remote-support": {
      tag: tr("AUTHORIZED SUPPORT", "授权支持"),
      title: tr("Let AI help diagnose a computer you are authorized to administer.", "让 AI 协助诊断你有权管理的电脑。"),
      intro: tr("For your own machine or one you have explicit permission to administer, Remote Arc can expose logs, files, processes and approved terminal actions without requiring a screen-sharing session.", "对于你自己的电脑或明确获授权管理的设备，Remote Arc 可以提供日志、文件、进程和获准终端操作，而无需开启屏幕共享会话。"),
      prompt: tr("“On the office mini PC, inspect the service log and running processes, explain why sync-worker is failing, and ask me before restarting anything.”", "“在办公室 Mini PC 上检查服务日志和运行进程，解释 sync-worker 为什么失败，重启任何东西之前先问我。”"),
      tools: "read_file · list_processes · start_process",
      permission: tr("Depends on the repair", "取决于修复动作"),
      facts: [
        tr("Read-only diagnosis can stay separate from terminal access.", "只读诊断可以与终端权限分离。"),
        tr("Per-device policy limits which Remote Arc tools are available.", "逐设备策略限制这台设备可用的 Remote Arc 工具。"),
        tr("Remote Arc audit records retain operational metadata for visibility.", "Remote Arc 审计记录保留运行元数据用于可见性。"),
      ],
      limit: tr("Use Remote Arc only on computers, files, accounts and services you own or are authorized to administer.", "Remote Arc 只能用于你拥有或获授权管理的电脑、文件、账户和服务。"),
    },
  } as const;

  const item = data[slug];
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero useCaseDetailHero">
        <span className="eyebrow">{item.tag}</span>
        <h1>{item.title}</h1>
        <p>{item.intro}</p>
        <div className="useCaseMeta"><span>{tr("Permission", "权限")}: <strong>{item.permission}</strong></span><code>{item.tools}</code></div>
      </section>

      <section className="useCaseNarrative">
        <article>
          <span className="resourceArticleTag">{tr("WHAT YOU ASK", "你怎么问")}</span>
          <blockquote>{item.prompt}</blockquote>
        </article>
        <article>
          <span className="resourceArticleTag">{tr("WHAT MAKES IT USEFUL", "为什么有用")}</span>
          <ul>{item.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
        </article>
        <article className="honestLimit">
          <span className="resourceArticleTag">{tr("HONEST LIMIT", "明确限制")}</span>
          <p>{item.limit}</p>
        </article>
      </section>

      <section className="useCaseBottomNav">
        <a href="/use-cases">← {tr("All use cases", "全部使用场景")}</a>
        <a href="/connect-ai">{tr("Connect a computer", "连接一台电脑")} →</a>
      </section>
    </PublicLayout>
  );
}

function ChatGptComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CHATGPT + REMOTE ARC</span>
        <h1>{tr("Give ChatGPT access to your computer — without exposing the computer itself.", "让 ChatGPT 使用你的电脑，但不把电脑本身暴露出去。")}</h1>
        <p>{tr("Remote Arc connects ChatGPT to Windows, macOS and Linux through an OAuth-protected Remote MCP endpoint and an outbound-only device connection.", "Remote Arc 通过受 OAuth 保护的 Remote MCP 与仅出站的设备连接，把 ChatGPT 连接到 Windows、macOS 和 Linux。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/install/chatgpt">{tr("Install Remote Arc for ChatGPT", "为 ChatGPT 安装 Remote Arc")} →</a><a className="ghostButton" href="/docs/mcp">{tr("Read the MCP docs", "查看 MCP 文档")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("Pair your computer", "配对电脑")}</h2><p>{tr("Run one local command and approve the pairing in your Remote Arc account. No public IP or inbound port is required.", "运行一条本地命令并在 Remote Arc 账户中确认配对，无需公网 IP 或入站端口。")}</p></article>
        <article><span>02</span><h2>{tr("Connect ChatGPT through MCP", "通过 MCP 连接 ChatGPT")}</h2><p>{tr("Use the Remote Arc MCP endpoint and complete OAuth. ChatGPT receives tools, not a shared machine password.", "使用 Remote Arc MCP 地址并完成 OAuth。ChatGPT 获得的是工具能力，而不是一份共享的电脑密码。")}</p></article>
        <article><span>03</span><h2>{tr("Choose what this device can do", "选择这台设备可以做什么")}</h2><p>{tr("Start read-only, add file editing when needed, and enable terminal execution only on devices where it is appropriate.", "默认从只读开始，需要时增加文件编辑，并只在合适的设备上开启终端执行。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">FAQ</span><h2>{tr("Common questions about ChatGPT computer access.", "关于 ChatGPT 访问电脑的常见问题。")}</h2></div>
        <div className="faqList">
          <details><summary>{tr("Does Remote Arc expose a port on my computer?", "Remote Arc 会在我的电脑上暴露端口吗？")}</summary><p>{tr("No. The local agent creates an outbound connection to the hosted control plane.", "不会。本地 Agent 主动向托管控制面建立出站连接。")}</p></details>
          <details><summary>{tr("Can I keep a computer read-only?", "可以让某台电脑保持只读吗？")}</summary><p>{tr("Yes. Tool availability is configured per device, so terminal and write tools can remain disabled.", "可以。工具能力按设备配置，因此可以一直关闭终端和写入类工具。")}</p></details>
          <details><summary>{tr("Do I have to use only ChatGPT?", "只能使用 ChatGPT 吗？")}</summary><p>{tr("No. The same Remote Arc endpoint can also be used by Claude, Cursor and compatible Remote MCP clients.", "不是。同一个 Remote Arc Endpoint 也可以被 Claude、Cursor 与兼容 Remote MCP 的客户端使用。")}</p></details>
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

const blogPosts = [
  {
    slug: "why-i-built-remote-arc",
    date: "27 Sep 2026",
    readTime: "6 min read",
    author: "Sam Yao",
  },
  {
    slug: "remote-arc-vs-openclaw",
    date: "27 Sep 2026",
    readTime: "8 min read",
    author: "Sam Yao",
  },
  {
    slug: "powerful-ai-access-without-exposing-your-computer",
    date: "27 Sep 2026",
    readTime: "7 min read",
    author: "Sam Yao",
  },
  {
    slug: "how-remote-arc-works",
    date: "27 Sep 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
] as const;

function BlogsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const posts = [
    {
      ...blogPosts[0],
      title: tr(
        "Why I built Remote Arc: AI should reach your computer without owning it",
        "为什么我做了 Remote Arc：AI 应该能使用你的电脑，但不该接管它",
      ),
      summary: tr(
        "Chat is useful. Agents are more useful when they can work with the files, tools and environments we already use. The hard part is making that access powerful without making it reckless.",
        "聊天当然有用，但当 AI 能真正使用我们已经在用的文件、工具与开发环境时，它才更像一个 Agent。难点不是让它获得能力，而是让这种能力足够强、同时又足够克制。",
      ),
      tag: tr("WHY REMOTE ARC", "为什么做 REMOTE ARC"),
    },
    {
      ...blogPosts[1],
      title: tr(
        "Remote Arc vs OpenClaw: two different layers of the AI stack",
        "Remote Arc 和 OpenClaw 有什么区别：它们其实处在 AI 技术栈的不同层",
      ),
      summary: tr(
        "Both can help AI do things on real computers, but OpenClaw is a self-hosted assistant and gateway platform while Remote Arc is a remote execution layer for AI clients you already use.",
        "两者都能让 AI 在真实电脑上做事，但 OpenClaw 更像自托管 Assistant / Gateway 平台，而 Remote Arc 是给你已经在用的 AI 客户端提供远程执行能力的一层。",
      ),
      tag: tr("COMPARISON", "产品对比"),
    },
    {
      ...blogPosts[2],
      title: tr(
        "How Remote Arc keeps AI access powerful without exposing your computer",
        "Remote Arc 如何让 AI 足够强大，同时不把你的电脑暴露出去",
      ),
      summary: tr(
        "Powerful remote access should not require a public port, a VPN, or one giant permission switch. The architecture is built around explicit, layered boundaries.",
        "强大的远程访问不应该以公网端口、VPN 或一个巨大的总权限开关为代价。Remote Arc 的架构从一开始就是围绕分层、明确的安全边界设计的。",
      ),
      tag: tr("SECURITY", "安全"),
    },
    {
      ...blogPosts[3],
      title: tr(
        "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
        "Remote Arc 是怎么工作的：Worker、Durable Objects、OAuth 与本地 Agent",
      ),
      summary: tr(
        "A request begins in an AI client, crosses the hosted control plane, reaches exactly one paired computer and still ends at a local policy boundary. Here is the full path.",
        "一次请求从 AI 客户端出发，经过托管控制面，抵达指定电脑，最终仍要经过本地权限边界。这里把整条链路完整拆开。",
      ),
      tag: tr("ARCHITECTURE", "架构"),
    },
  ];

  return (
    <PublicLayout user={user}>
      <section className="readingPageIntro blogReadingIntro">
        <div>
          <span className="eyebrow">{tr("BLOG", "博客")}</span>
          <h1>{tr("Remote Arc blog", "Remote Arc 博客")}</h1>
        </div>
        <p>{tr(
          "Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.",
          "记录 Remote Arc 的工程实现、架构决策、安全取舍和产品思考。",
        )}</p>
        <nav className="readingPageLinks">
          <a href="/docs">{tr("Docs", "文档")} →</a>
          <a href="/security-model">{tr("Security", "安全")} →</a>
          <a href="/resources">{tr("Architecture notes", "架构说明")} →</a>
        </nav>
      </section>

      <section className="blogIndex blogListPlain">
        {posts.map((post) => (
          <a className="blogPostRow" href={"/blogs/" + post.slug} key={post.slug}>
            <div className="blogLeadMeta">
              <span>{post.tag}</span>
              <span>{post.date}</span>
              <span>{post.readTime}</span>
            </div>
            <h2>{post.title}</h2>
            <p>{post.summary}</p>
            <span className="blogReadLink">{tr("Read", "阅读")} →</span>
          </a>
        ))}
      </section>
    </PublicLayout>
  );
}

function BlogArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[0];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href="/blogs">← {tr("All posts", "全部文章")}</a>
          <span className="eyebrow">{tr("BUILDING REMOTE ARC", "构建 REMOTE ARC")}</span>
          <h1>{tr(
            "Why I built Remote Arc: AI should reach your computer without owning it",
            "为什么我做了 Remote Arc：AI 应该能使用你的电脑，但不该接管它",
          )}</h1>
          <p className="blogDeck">{tr(
            "The most useful AI is not another chat window. It is an AI that can work with the computer you already have — under permissions you can actually understand and control.",
            "真正有用的 AI 不应该只是另一个聊天窗口，而应该能够使用你已经拥有的电脑，同时所有权限都清晰、可理解、可控制。",
          )}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "I spend a lot of time using AI tools, and I kept running into the same boundary: the model could explain what I should do, write the command I should run, or generate the patch I should apply — but the final mile was still mine. My files, terminals, repositories and development environments were sitting on real computers, while the AI was trapped behind a chat box.",
            "我长期使用各种 AI 工具，但总会撞到同一个边界：模型可以告诉我应该做什么，可以写好命令，也可以生成补丁，但最后一公里依然要我自己完成。我的文件、终端、代码仓库和开发环境都在真实电脑上，而 AI 仍然被困在聊天框里。",
          )}</p>

          <p>{tr(
            "That gap is what pushed me to build Remote Arc. The idea sounds simple: let an AI client reach a computer you own. The implementation is not simple at all, because the moment an AI can read files, edit code or run a command, the product stops being a convenience layer and becomes security-sensitive infrastructure.",
            "这就是我开始做 Remote Arc 的原因。想法听起来很简单：让 AI 客户端能够访问你自己的电脑。但真正实现起来完全不简单，因为一旦 AI 可以读取文件、修改代码或运行命令，这个产品就不再只是一个便利工具，而变成了安全敏感的基础设施。",
          )}</p>

          <h2>{tr("The goal was never “full control.”", "目标从来不是“完全控制”。")}</h2>
          <p>{tr(
            "A lot of remote-agent products are marketed around how much control they can give an AI. I wanted to start from the opposite question: how little authority does the AI need in order to finish the job?",
            "很多远程 Agent 产品会强调 AI 能获得多大的控制权。我更想从相反的问题出发：为了完成任务，AI 最少需要多少权限？",
          )}</p>

          <p>{tr(
            "Remote Arc therefore treats every computer as its own trust boundary. A development machine can expose file reads, targeted edits and terminal commands. Another machine can stay effectively read-only. Permissions belong to the device, not to a vague account-wide “agent mode.”",
            "因此 Remote Arc 把每台电脑都视为独立的信任边界。一台开发机可以开放文件读取、定向编辑和终端命令；另一台电脑可以保持接近只读。权限属于设备本身，而不是某个模糊的全局“Agent 模式”。",
          )}</p>

          <blockquote>{tr(
            "The product should make powerful actions possible, but it should never make them feel invisible.",
            "产品应该允许强大的操作发生，但绝不能让这些操作变得不可见。",
          )}</blockquote>

          <h2>{tr("No public port. No VPN. No inbound listener.", "不需要公网端口，不需要 VPN，也不需要入站监听。")}</h2>
          <p>{tr(
            "The local Remote Arc agent creates an outbound connection to the hosted relay. That matters to me because I did not want installation to begin with router configuration, firewall exceptions or a machine permanently listening to the public internet. You pair the device explicitly, it receives its own revocable credential, and it can be removed independently later.",
            "Remote Arc 的本地 Agent 主动向托管 Relay 建立出站连接。这一点对我很重要，因为我不希望安装流程从配置路由器、添加防火墙例外或让电脑永久监听公网开始。设备需要明确配对，每台设备都有独立、可撤销的凭证，也可以单独移除。",
          )}</p>

          <h2>{tr("MCP turned out to be the right interface.", "MCP 恰好是最合适的接口。")}</h2>
          <p>{tr(
            "I did not want Remote Arc to be tied to one model vendor. The useful abstraction is not “a ChatGPT remote-control feature” or “a Claude remote-control feature.” It is a set of clearly described tools that compatible AI clients can discover and call. MCP gives Remote Arc that boundary.",
            "我不希望 Remote Arc 被绑定在某一家模型厂商上。真正有价值的抽象并不是“ChatGPT 的远程控制功能”或“Claude 的远程控制功能”，而是一组描述清晰、可以被兼容 AI 客户端发现并调用的工具。MCP 正好提供了这样的边界。",
          )}</p>

          <p>{tr(
            "Today the same Remote Arc endpoint can be used from ChatGPT, Claude and other compatible clients. The client can change; the paired computers and their permission model do not have to.",
            "现在，同一个 Remote Arc 端点可以被 ChatGPT、Claude 和其他兼容客户端使用。AI 客户端可以更换，但已经配对的电脑和权限模型不需要跟着重做。",
          )}</p>

          <h2>{tr("The hardest part is not execution. It is trust.", "最难的不是执行，而是信任。")}</h2>
          <p>{tr(
            "Running a command remotely is technically easy. Deciding when that command should be allowed, showing which machine will receive it, preserving a useful audit trail without turning the service into a content archive, and giving the user a reliable way to revoke access are the parts that deserve most of the engineering attention.",
            "远程执行一条命令在技术上并不难。真正值得投入工程精力的是：什么时候应该允许它执行、明确告诉用户命令会发到哪台电脑、在不把服务变成内容存档系统的前提下保留有用的审计信息，以及让用户始终拥有可靠的撤销方式。",
          )}</p>

          <p>{tr(
            "That is why Remote Arc has an account-level MCP pause, per-device tool policies, revocable OAuth grants, protected paths, local undo support for supported edits and a local execution layer that remains the final authority. None of those controls are glamorous. They are the product.",
            "所以 Remote Arc 会有账户级 MCP Pause、每设备工具策略、可撤销 OAuth 授权、受保护路径、对支持编辑的本地 Undo，以及始终拥有最终决定权的本地执行层。这些功能可能并不“炫”，但它们本身就是产品。",
          )}</p>

          <h2>{tr("What I want Remote Arc to become", "我希望 Remote Arc 最终变成什么")}</h2>
          <p>{tr(
            "I want connecting an AI to your own computer to feel as normal as connecting a calendar or a code repository — but with controls that reflect how much more consequential a computer actually is. Installation should be simple. Permissions should be explicit. The AI client should be replaceable. And the user should always know where the boundary is.",
            "我希望未来把 AI 连接到自己的电脑，能像连接日历或代码仓库一样自然——但权限设计必须体现出“电脑”本身远比这些服务更敏感。安装应该简单，权限应该明确，AI 客户端应该可以替换，而且用户始终知道边界在哪里。",
          )}</p>

          <p>{tr(
            "Remote Arc is still early. I am building it in public, using it on my own machines, and refining the product every time something feels more powerful than it feels understandable. That tension is exactly what makes this project interesting to me.",
            "Remote Arc 还处在很早期的阶段。我会继续公开构建它，在自己的电脑上真实使用它，并且每当某个能力显得比它本身更难理解时，就重新调整产品。对我来说，这种“能力与可控性之间的张力”正是这个项目最有意思的地方。",
          )}</p>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div>
            </div>
            <a href="/install/chatgpt">{tr("Install Remote Arc for ChatGPT", "为 ChatGPT 安装 Remote Arc")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}

function RemoteArcVsOpenClawArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[1];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href="/blogs">← {tr("All posts", "全部文章")}</a>
          <span className="eyebrow">{tr("COMPARISON", "产品对比")}</span>
          <h1>{tr(
            "Remote Arc vs OpenClaw: two different layers of the AI stack",
            "Remote Arc 和 OpenClaw 有什么区别：它们其实处在 AI 技术栈的不同层",
          )}</h1>
          <p className="blogDeck">{tr(
            "They can both help AI act on real computers, but they start from very different product boundaries. One is an assistant and agent platform. The other is a controlled remote execution layer.",
            "它们都可以让 AI 在真实电脑上做事，但产品边界完全不同：一个更像 Assistant 与 Agent 平台，另一个更像受控的远程执行层。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "Remote Arc is sometimes compared with OpenClaw because both products can ultimately connect AI to a real computer. At a screenshot level the similarity is obvious: an AI asks for something, software on a machine receives the request, and something happens. But that is roughly where the architectural similarity ends.",
            "Remote Arc 有时会被拿来和 OpenClaw 比，因为两者最终都可以让 AI 连接到真实电脑。从截图层面看确实很像：AI 发出请求，电脑上的软件收到请求，然后执行某些事情。但架构上的相似性大致也就到这里为止。",
          )}</p>

          <p>{tr(
            "OpenClaw describes itself as an open-source AI assistant that runs on your own hardware. Its Gateway owns conversations, channels, agent sessions and integrations. It can connect to chat platforms, host coding or agent runtimes, expose some of its capabilities over MCP, and manage outbound MCP servers for its own runtimes.",
            "OpenClaw 官方把自己定义为运行在用户自己硬件上的开源 AI Assistant。它的 Gateway 会承载会话、聊天渠道、Agent Session 与各种集成；它既能连接聊天平台、承载编码或 Agent Runtime，也能把部分能力通过 MCP 暴露出去，并为自己的 Runtime 管理外部 MCP Server。",
          )}</p>

          <p>{tr(
            "Remote Arc intentionally stops earlier. It does not try to own the conversation, memory, model or agent loop. It gives an AI client you already chose — ChatGPT, Claude, Codex or another compatible MCP client — a controlled way to reach computers you explicitly paired.",
            "Remote Arc 刻意停在更底层。它不试图拥有对话、记忆、模型或 Agent Loop，而是给你已经选择好的 AI 客户端——例如 ChatGPT、Claude、Codex 或其他兼容 MCP 的客户端——提供一种受控方式去访问你明确配对的电脑。",
          )}</p>

          <h2>{tr("OpenClaw is an AI home. Remote Arc is an AI bridge.", "OpenClaw 更像 AI 的“家”，Remote Arc 更像 AI 的“桥”。")}</h2>
          <div className="blogCompareTable">
            <div className="blogCompareHead"><span></span><strong>Remote Arc</strong><strong>OpenClaw</strong></div>
            <div><span>{tr("Primary role", "核心角色")}</span><b>{tr("Remote computer execution layer", "远程电脑执行层")}</b><b>{tr("Self-hosted assistant / gateway platform", "自托管 Assistant / Gateway 平台")}</b></div>
            <div><span>{tr("Who owns the conversation", "谁承载对话")}</span><b>{tr("Your existing AI client", "现有 AI 客户端")}</b><b>{tr("OpenClaw Gateway and its channels", "OpenClaw Gateway 与其渠道")}</b></div>
            <div><span>{tr("Model/runtime", "模型 / Runtime")}</span><b>{tr("External to Remote Arc", "不由 Remote Arc 承载")}</b><b>{tr("Part of the OpenClaw platform", "属于 OpenClaw 平台能力")}</b></div>
            <div><span>MCP</span><b>{tr("Primary remote interface to paired computers", "连接已配对电脑的核心远程接口")}</b><b>{tr("One interface among several; can serve and consume MCP", "多种接口之一；既能作为 MCP Server，也能消费 MCP")}</b></div>
            <div><span>{tr("Deployment", "部署方式")}</span><b>{tr("Managed control plane + local agent", "托管控制面 + 本地 Agent")}</b><b>{tr("Self-hosted Gateway by default", "默认自托管 Gateway")}</b></div>
            <div><span>{tr("Computer control", "电脑控制")}</span><b>{tr("Files, processes, terminal and explicit device skills", "文件、进程、终端与明确设备技能")}</b><b>{tr("Broader agent tooling, including computer-use providers", "更广泛的 Agent 工具，包括 Computer Use Provider")}</b></div>
          </div>

          <h2>{tr("The deployment philosophy is almost opposite.", "两者的部署哲学几乎相反。")}</h2>
          <p>{tr(
            "OpenClaw emphasizes that the assistant, state and Gateway can live on hardware you control, with no hosted service in the middle by default. Remote Arc makes a different trade-off: the control plane is hosted so that pairing, OAuth, device discovery and remote routing work without you operating a public Gateway, while actual operating-system execution stays on the paired computer.",
            "OpenClaw 强调 Assistant、状态与 Gateway 都可以运行在你自己控制的硬件上，默认不需要中间托管服务。Remote Arc 做的是另一种取舍：控制面托管化，让配对、OAuth、设备发现与远程路由不需要用户自己维护公网 Gateway；而真正的操作系统执行依然留在已配对电脑上。",
          )}</p>

          <p>{tr(
            "That means OpenClaw gives technically inclined users more ownership of the assistant platform itself. Remote Arc gives up some of that self-hosting purity in exchange for a simpler connection model across multiple AI clients and multiple computers.",
            "这意味着 OpenClaw 给技术用户更多对 Assistant 平台本身的所有权；Remote Arc 则牺牲一部分纯自托管属性，换取多个 AI 客户端与多台电脑之间更简单的连接体验。",
          )}</p>

          <h2>{tr("Their relationship with MCP is different too.", "它们和 MCP 的关系也不同。")}</h2>
          <p>{tr(
            "For Remote Arc, MCP is the product boundary exposed to the AI side. The AI discovers a small set of computer tools, authenticates with OAuth, and Remote Arc routes those calls to the selected device.",
            "对 Remote Arc 来说，MCP 就是面向 AI 一侧最核心的产品边界。AI 发现一组明确的电脑工具，通过 OAuth 授权，然后 Remote Arc 把工具调用路由到指定设备。",
          )}</p>

          <p>{tr(
            "OpenClaw uses MCP in more than one direction. Its documentation describes an MCP server mode for exposing OpenClaw-backed conversations to external clients, and an MCP client-side registry for servers that OpenClaw-managed runtimes may consume. MCP is therefore one part of a wider agent platform rather than the whole product boundary.",
            "OpenClaw 对 MCP 的使用方向更多。官方文档既描述了把 OpenClaw 会话能力暴露给外部客户端的 MCP Server 模式，也提供了让 OpenClaw 自己的 Runtime 消费外部 MCP Server 的注册管理能力。因此 MCP 是其更大 Agent 平台中的一个组成部分，而不是整个产品边界。",
          )}</p>

          <h2>{tr("They can actually complement each other.", "它们其实可以互补。")}</h2>
          <p>{tr(
            "This is why I do not think the most useful framing is “which one replaces the other?” If you want a self-hosted personal assistant that owns channels, memory and agent sessions, OpenClaw solves a much broader problem. If you already live in ChatGPT or Claude and mainly want those clients to reach your real computers with explicit device permissions, Remote Arc is intentionally narrower.",
            "所以我不认为最有价值的问题是“谁取代谁”。如果你想要一个自托管个人 Assistant，自己承载渠道、记忆与 Agent Session，OpenClaw 解决的问题明显更广；如果你已经长期使用 ChatGPT 或 Claude，主要只是希望这些客户端在明确设备权限下访问你的真实电脑，那么 Remote Arc 就是刻意做得更窄。",
          )}</p>

          <p>{tr(
            "In principle the two models can even meet: OpenClaw supports remote MCP server definitions, while Remote Arc exposes a Remote MCP endpoint. That makes Remote Arc less of an alternative runtime and more of a reusable computer-access layer that different runtimes can sit above.",
            "从架构上看，两者甚至可以连接起来：OpenClaw 支持配置远程 MCP Server，而 Remote Arc 本身就暴露 Remote MCP Endpoint。这样看，Remote Arc 更不像另一个 Agent Runtime，而更像一层可以被不同 Runtime 复用的电脑访问能力。",
          )}</p>

          <div className="blogSourceNote">
            <strong>{tr("Sources for the OpenClaw comparison", "OpenClaw 对比资料来源")}</strong>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noreferrer">OpenClaw overview ↗</a>
            <a href="https://docs.openclaw.ai/cli/mcp" target="_blank" rel="noreferrer">OpenClaw MCP docs ↗</a>
            <a href="https://docs.openclaw.ai/nodes/computer-use" target="_blank" rel="noreferrer">OpenClaw computer-use docs ↗</a>
          </div>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/install/chatgpt">{tr("Try Remote Arc with ChatGPT", "在 ChatGPT 中使用 Remote Arc")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}

function PowerfulAccessArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[2];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href="/blogs">← {tr("All posts", "全部文章")}</a>
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr(
            "How Remote Arc keeps AI access powerful without exposing your computer",
            "Remote Arc 如何让 AI 足够强大，同时不把你的电脑暴露出去",
          )}</h1>
          <p className="blogDeck">{tr(
            "Remote control becomes useful only when the AI can do consequential work. The design problem is giving it that power without turning your computer into a permanently exposed endpoint.",
            "只有当 AI 能做真正有影响的工作时，远程控制才有意义。设计难点在于：如何给它足够能力，又不让你的电脑变成一个永久暴露的公网端点。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "An AI that can only tell you what command to run is safe but limited. An AI that can run every command everywhere is useful but reckless. Remote Arc is built around the space between those two extremes.",
            "一个只能告诉你应该运行什么命令的 AI 很安全，但能力有限；一个可以在任何地方运行任何命令的 AI 很有用，但也非常危险。Remote Arc 的设计目标就是在这两个极端之间找到边界。",
          )}</p>

          <h2>{tr("1. Your computer never needs a public inbound port.", "1. 你的电脑不需要开放任何公网入站端口。")}</h2>
          <p>{tr(
            "The local Remote Arc agent establishes an outbound connection to the hosted control plane. Your router does not need port forwarding, your laptop does not need a public IP, and the machine does not sit on the internet waiting for arbitrary inbound connections.",
            "本地 Remote Arc Agent 主动向托管控制面建立出站连接。路由器不需要端口转发，电脑不需要公网 IP，也不会在互联网上开放一个入口等待任意外部连接。",
          )}</p>
          <blockquote>{tr(
            "The connection starts from the computer you own. Remote Arc does not ask the internet to find an open door into it.",
            "连接由你自己的电脑主动发起。Remote Arc 不需要让互联网找到一扇通往它的开放大门。",
          )}</blockquote>

          <h2>{tr("2. Pairing creates a device identity, not a shared master password.", "2. 配对建立的是设备身份，而不是共享的万能密码。")}</h2>
          <p>{tr(
            "Every paired computer receives its own revocable credential. The hosted database stores only the credential hash. If one machine should no longer be reachable, that device can be revoked independently without rotating access for every other computer.",
            "每台已配对电脑都有自己独立、可撤销的凭证。托管数据库只保存凭证哈希。如果某台设备不应该继续被访问，可以单独撤销它，而不需要同时轮换所有其他电脑的访问凭证。",
          )}</p>

          <h2>{tr("3. OAuth controls the AI client separately from the device.", "3. OAuth 把 AI 客户端权限和设备身份分开。")}</h2>
          <p>{tr(
            "A paired computer and an authorized AI client are two different trust relationships. ChatGPT or Claude authenticates through OAuth with explicit scopes. Revoking an AI client does not require re-pairing the computer, and revoking a computer does not require changing every AI connection.",
            "一台已配对电脑和一个获得授权的 AI 客户端，是两种完全不同的信任关系。ChatGPT 或 Claude 通过 OAuth 和明确 Scope 获得授权。撤销某个 AI 客户端不需要重新配对电脑；撤销某台电脑也不需要修改所有 AI 连接。",
          )}</p>

          <h2>{tr("4. Permission is per device, not one global agent switch.", "4. 权限按设备控制，而不是一个全局 Agent 开关。")}</h2>
          <p>{tr(
            "A work laptop, a gaming PC and a home server should not expose the same capabilities. Remote Arc lets each device advertise and enable its own skill set. Safe access can stay read-only. Developer access can add targeted file edits. Full access can add terminal execution where that is genuinely required.",
            "工作笔记本、游戏 PC 和家庭服务器不应该开放完全相同的能力。Remote Arc 让每台设备独立声明和启用自己的技能集合。Safe 可以保持只读；Developer 可以加入定向文件编辑；只有确实需要时才在 Full 中加入终端执行。",
          )}</p>

          <div className="blogSecurityLayers">
            <span><b>OAuth scope</b><small>{tr("What the AI client may request", "AI 客户端可以请求什么")}</small></span>
            <span><b>Relay policy</b><small>{tr("What the account and device allow", "账户和设备策略允许什么")}</small></span>
            <span><b>Local agent</b><small>{tr("What the computer actually exposes", "电脑实际暴露什么能力")}</small></span>
            <span><b>OS user</b><small>{tr("The final operating-system boundary", "最终的操作系统权限边界")}</small></span>
          </div>

          <h2>{tr("5. Sensitive paths and workspace roots reduce accidental reach.", "5. 敏感路径和工作区根目录减少误操作范围。")}</h2>
          <p>{tr(
            "Remote Arc can constrain file-oriented workflows to configured workspace roots and protect sensitive paths. These controls are not a replacement for operating-system sandboxing, especially once arbitrary terminal execution is enabled, but they provide an important first boundary for normal AI file work.",
            "Remote Arc 可以把文件类工作流限制在配置好的 Workspace Root 中，并保护敏感路径。这些控制并不能替代操作系统级沙箱——尤其当任意终端执行被开启后——但对于日常 AI 文件操作来说，它们构成了非常重要的第一层边界。",
          )}</p>

          <h2>{tr("6. Supported edits can be undone locally.", "6. 支持的修改可以在本机撤销。")}</h2>
          <p>{tr(
            "For supported Remote Arc file mutations, the local agent keeps a bounded undo snapshot on the device itself. The hosted service does not need to become a backup of your file contents in order to give you a recovery path.",
            "对于 Remote Arc 支持的文件修改，本地 Agent 会在设备本机保留有限的 Undo Snapshot。这样即使提供恢复能力，托管服务也不需要变成一个保存你文件内容的云端备份。",
          )}</p>

          <h2>{tr("7. Audit metadata is useful without becoming content retention.", "7. 审计应该提供可见性，而不是变成内容留存。")}</h2>
          <p>{tr(
            "Remote Arc records operational metadata such as which tool ran, which device received it, whether it succeeded and when it happened. The audit design intentionally avoids persisting file contents, raw command arguments, OAuth tokens or raw device credentials.",
            "Remote Arc 会记录运行所需的元数据，例如使用了什么工具、发送到了哪台设备、是否成功以及发生时间。审计设计会刻意避免持久化文件内容、原始命令参数、OAuth Token 或原始设备凭证。",
          )}</p>

          <h2>{tr("The important limitation: permissions are not magic.", "最重要的限制：权限控制并不是魔法。")}</h2>
          <p>{tr(
            "Once you explicitly enable unrestricted terminal execution, the shell inherits the permissions of the local operating-system user. Remote Arc can put strong gates around when a terminal tool is available, but it cannot honestly claim that an unrestricted shell is harmless. The right security model is therefore layered control plus explicit user choice, not pretending that powerful execution has no consequences.",
            "一旦你明确开启不受限制的终端执行，Shell 最终继承的是本地操作系统用户本身的权限。Remote Arc 可以严格控制终端工具什么时候可用，但不能假装一个 unrestricted shell 天生无害。正确的安全模型应该是分层控制 + 明确的用户选择，而不是假装强执行能力没有后果。",
          )}</p>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md">{tr("Read the security model", "查看安全模型")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}

function ArchitectureArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[3];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href="/blogs">← {tr("All posts", "全部文章")}</a>
          <span className="eyebrow">{tr("ARCHITECTURE", "架构")}</span>
          <h1>{tr(
            "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
            "Remote Arc 是怎么工作的：Worker、Durable Objects、OAuth 与本地 Agent",
          )}</h1>
          <p className="blogDeck">{tr(
            "Remote Arc is deliberately split into a hosted control plane and a local execution plane. That separation is what makes one MCP endpoint work across many AI clients and many computers.",
            "Remote Arc 刻意拆成托管控制面与本地执行面。正是这层分离，让一个 MCP Endpoint 可以同时服务多个 AI 客户端和多台电脑。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "From the outside Remote Arc looks simple: connect an AI client, pair a computer, ask the AI to do something. Internally that request crosses several boundaries, and every boundary exists for a reason.",
            "从外面看 Remote Arc 很简单：连接 AI 客户端、配对电脑、让 AI 做一件事。实际上，一次请求内部会跨越多层边界，而每一层边界都有明确存在的理由。",
          )}</p>

          <div className="blogArchitectureRail">
            <span>ChatGPT / Claude</span><i>→</i><span>Remote MCP</span><i>→</i><span>Worker</span><i>→</i><span>Durable Object</span><i>→</i><span>Local Agent</span><i>→</i><span>OS</span>
          </div>

          <h2>{tr("Step 1: the AI client sees a Remote MCP server.", "第一步：AI 客户端看到的是一个 Remote MCP Server。")}</h2>
          <p>{tr(
            "ChatGPT, Claude or another compatible client connects to a single Remote Arc MCP URL. Tool discovery describes the capabilities Remote Arc can expose: device discovery, file inspection, process inspection, file editing, managed processes, terminal execution and undo.",
            "ChatGPT、Claude 或其他兼容客户端只需要连接一个 Remote Arc MCP URL。Tool Discovery 会描述 Remote Arc 能暴露的能力：设备发现、文件读取、进程查看、文件编辑、后台进程管理、终端执行与 Undo。",
          )}</p>

          <h2>{tr("Step 2: OAuth answers who the AI is acting for.", "第二步：OAuth 解决“这个 AI 正在代表谁”。")}</h2>
          <p>{tr(
            "The MCP endpoint is not a shared secret pasted into every client. OAuth establishes the user identity, scopes and client grant. Access tokens can be short-lived, refresh tokens can rotate, and a grant can be revoked without changing the paired-device credential.",
            "MCP Endpoint 不是一个复制到所有客户端里的共享密钥。OAuth 会建立用户身份、Scope 与客户端授权。Access Token 可以保持短期，Refresh Token 可以轮换，而且某个客户端授权可以单独撤销，不需要改变设备配对凭证。",
          )}</p>

          <h2>{tr("Step 3: the Cloudflare Worker is the control-plane entry point.", "第三步：Cloudflare Worker 是控制面的统一入口。")}</h2>
          <p>{tr(
            "The Worker handles the public HTTP surface: MCP requests, OAuth endpoints, pairing APIs, account APIs and the web application. It authenticates the request, checks account state and device policy, applies rate limits and decides whether a call is allowed to proceed.",
            "Worker 承担公开 HTTP 表面：MCP 请求、OAuth 入口、配对 API、账户 API 与 Web App。它负责认证请求、检查账户状态和设备策略、执行限流，并决定一次调用是否可以继续。",
          )}</p>

          <h2>{tr("Step 4: D1 keeps durable identity and policy.", "第四步：D1 保存持久身份与策略。")}</h2>
          <p>{tr(
            "D1 stores the durable facts that should survive disconnects and deployments: users, paired-device metadata, credential hashes, sessions, OAuth grants, per-device policy, security settings, usage counters and audit metadata. It is not the live transport for tool execution.",
            "D1 保存那些即使设备断线或 Worker 更新也必须持续存在的事实：用户、设备元数据、凭证哈希、Session、OAuth Grant、每设备策略、安全设置、用量计数和审计元数据。它并不是工具执行时的实时传输通道。",
          )}</p>

          <h2>{tr("Step 5: a per-user Durable Object owns live routing.", "第五步：每用户 Durable Object 负责实时路由。")}</h2>
          <p>{tr(
            "Live device connections are stateful. Durable Objects give Remote Arc a stable place to coordinate WebSockets, track which paired devices are currently reachable and forward a tool call to exactly the selected connection. This avoids trying to force real-time connection state into a stateless Worker request.",
            "设备在线连接本质上是有状态的。Durable Objects 给 Remote Arc 提供了一个稳定位置来协调 WebSocket、维护哪些已配对设备此刻可达，并把工具调用精确转发到被选中的连接。这样就不用强行把实时连接状态塞进无状态 Worker 请求里。",
          )}</p>

          <h2>{tr("Step 6: the local agent is the final execution boundary.", "第六步：本地 Agent 是最终执行边界。")}</h2>
          <p>{tr(
            "The hosted control plane never directly opens a shell on your computer. The local agent receives an authenticated routed request, checks what it actually exposes and executes the operation through Remote Arc's local execution core. File operations, process inspection, terminal commands and undo all terminate at the machine itself.",
            "托管控制面不会直接在你的电脑上打开 Shell。本地 Agent 收到经过认证和路由的请求后，会再次检查自己实际开放的能力，再通过 Remote Arc 的本地执行核心执行操作。文件、进程、终端与 Undo 最终都在电脑本机完成。",
          )}</p>

          <h2>{tr("Step 7: the result travels back, not the machine.", "第七步：返回的是结果，不是把整台电脑搬到云上。")}</h2>
          <p>{tr(
            "The agent returns the specific tool result through the existing outbound connection. The control plane relays it to the authenticated MCP client. This is why Remote Arc can give an AI useful access to local state without moving the entire development environment into a hosted VM.",
            "Agent 会把具体工具结果沿现有出站连接返回，控制面再把结果转发给已认证的 MCP 客户端。也正因为这样，Remote Arc 可以让 AI 使用本地状态，而不需要把整个开发环境搬进托管虚拟机。",
          )}</p>

          <h2>{tr("Why split control plane and execution plane?", "为什么要把控制面和执行面拆开？")}</h2>
          <p>{tr(
            "The hosted side is good at identity, discovery, routing, policy and availability. The local side is the only place that should own operating-system execution. Keeping those responsibilities separate makes it possible to improve the hosted experience without pretending that the cloud should become the authority over the user's machine.",
            "托管侧擅长身份、发现、路由、策略与可用性；本地侧才应该拥有操作系统执行的最终权力。把两者分开，可以持续改进托管体验，同时避免让云端变成用户电脑的最终权限主体。",
          )}</p>

          <div className="blogSourceNote">
            <strong>{tr("Explore the implementation", "查看实现")}</strong>
            <a href="/resources">{tr("Technical resources", "技术资源")} →</a>
            <a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">GitHub →</a>
          </div>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/docs/mcp">{tr("Explore the MCP architecture", "查看 MCP 架构")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}

function ResourcesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const items: Array<[string, string, string, string]> = [
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
      <section className="resourceDocsLayout">
        <aside className="resourceToc">
          <div className="resourceTocInner">
            <span className="eyebrow">{tr("TECHNICAL INDEX", "技术目录")}</span>
            <nav>
              {items.filter(([, , href]) => href.startsWith("#")).map(([title, , href, tag], index) => (
                <a href={href} key={title}><span>{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><small>{tag}</small></a>
              ))}
            </nav>
            <div className="resourceTocLinks">
              <span>{tr("REFERENCE", "参考")}</span>
              {items.filter(([, , href]) => !href.startsWith("#")).map(([title, , href]) => <a href={href} key={title}>{title}<em>↗</em></a>)}
            </div>
          </div>
        </aside>

        <div className="resourceArticles">
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
          <p>{tr("A laptop used for development does not need the same exposure as a home server. Remote Arc stores per-device tool policy in the control plane, blocks disabled tools before routing, and still respects the local agent's advertised capability set. Supported file edits can also be reversed from local-only snapshots.", "开发用笔记本与家庭服务器不应暴露同样的能力。Remote Arc 在控制面保存每设备工具策略，在路由前拦截被关闭的工具，同时仍严格受本地 Agent 实际声明的能力集合约束。支持的文件修改还可以通过仅保存在本机的快照撤销。")}</p>
          <div className="resourceCodeRail"><code>read_file</code><span>✓</span><code>edit_block</code><span>↶</span><code>start_process</code><span>?</span></div>
        </article>

        <article id="privacy-audit">
          <span className="resourceArticleTag">AUDIT / 07</span>
          <h2>{tr("Privacy-preserving audit", "隐私友好审计")}</h2>
          <p>{tr("The activity feed is designed for operational visibility rather than content retention. Remote Arc records metadata such as tool name, device, result and time, while file contents, command arguments, OAuth tokens and raw device credentials are not intentionally stored in audit records.", "活动记录用于运行可观测性，而不是内容留存。Remote Arc 记录工具名称、设备、结果与时间等元数据，而不会有意在审计记录中保存文件内容、命令参数、OAuth Token 或原始设备凭证。")}</p>
          <div className="resourceAuditMatrix"><span>✓ tool</span><span>✓ device</span><span>✓ result</span><span>✓ time</span><span>× file contents</span><span>× command args</span><span>× credentials</span></div>
        </article>
        </div>
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
          {aiClients.map((client) => <div key={client.name}><img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" /><span>{client.name}</span></div>)}
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
            <header><img className="monoLogo" src={aiClients[0].icon} alt="" /><div><h3>ChatGPT</h3><span>{tr("Developer Mode required today", "目前需要 Developer Mode")}</span></div></header>
            <ol>
              <li><b>1</b><span>{tr("Open Settings → Apps → Advanced Settings and enable Developer Mode.", "打开 Settings → Apps → Advanced Settings，开启 Developer Mode。")}</span></li>
              <li><b>2</b><span>{tr("Create a custom app and paste the Remote Arc MCP URL.", "创建 Custom App，并粘贴 Remote Arc MCP 地址。")}</span></li>
              <li><b>3</b><span>{tr("Scan tools, complete Google OAuth, then select Remote Arc in chat.", "扫描工具、完成 Google OAuth，然后在对话中选择 Remote Arc。")}</span></li>
            </ol>
            <p className="clientReality"><strong>{tr("Do I need your plugin?", "还需要安装你的 Plugin 吗？")}</strong>{tr(" No. The MCP connection is enough. A reviewed Remote Arc app/plugin would make discovery and installation one-click later.", " 不需要，MCP 连接本身已经足够。未来通过审核的 Remote Arc App/Plugin 可以把发现与安装进一步变成一键操作。")}</p>
            <a href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt">{tr("OpenAI setup guide ↗", "查看 OpenAI 官方指南 ↗")}</a>
          </article>
          <article className="clientGuideCard">
            <header><img className="colorLogo" src={aiClients[1].icon} alt="" /><div><h3>Claude</h3><span>{tr("No developer mode required", "无需 Developer Mode")}</span></div></header>
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

      <section className="browserCapabilitySection" id="chrome-browser">
        <div className="browserCapabilityIntro">
          <span className="eyebrow">CHROME BROWSER · BETA</span>
          <h2>{tr("Share only the tabs you choose.", "只把你选择的标签页共享给 AI。")}</h2>
          <p>{tr(
            "Remote Arc Browser adds a lightweight, read-only browser capability to the same MCP connection. Each tab must be explicitly allowed, multiple tabs can be shared at once, and access can be revoked per tab.",
            "Remote Arc Browser 为同一条 MCP 连接增加轻量、只读的浏览器能力。每个标签页都需要单独授权，可同时共享多个标签页，也可以逐个撤销访问。",
          )}</p>
          <div className="browserCapabilityActions">
            <a className="primaryButton" href="/downloads/remote-arc-browser.zip" download>
              {tr("Download Chrome Browser (.zip)", "下载 Chrome Browser (.zip)")}
            </a>
            <a className="ghostButton" href="https://github.com/yaohuangguan/remote-arc/issues" target="_blank" rel="noreferrer">
              {tr("GitHub Issues", "GitHub Issues")} ↗
            </a>
          </div>
          <small className="browserBetaNote">{tr(
            "Beta distribution: install manually as an unpacked extension. It is not currently listed in the Chrome Web Store.",
            "Beta 版本目前通过手动加载未打包扩展安装，暂未上架 Chrome Web Store。",
          )}</small>
        </div>
        <ol className="browserInstallSteps">
          <li><b>01</b><div><strong>{tr("Download and unzip", "下载并解压")}</strong><span>{tr("Download the extension package above and unzip it to a folder you keep.", "下载上方扩展包并解压到一个保留的文件夹。")}</span></div></li>
          <li><b>02</b><div><strong>{tr("Load the extension", "加载扩展")}</strong><span>{tr("Open chrome://extensions, enable Developer mode, choose Load unpacked, then select the extracted folder.", "打开 chrome://extensions，开启 Developer mode，选择 Load unpacked，再选择解压后的文件夹。")}</span></div></li>
          <li><b>03</b><div><strong>{tr("Share a tab explicitly", "明确授权标签页")}</strong><span>{tr("Connect the extension to Remote Arc, then use Allow AI on this tab only on pages you want the AI to read.", "把扩展连接到 Remote Arc，然后只在希望 AI 读取的页面点击 Allow AI on this tab。")}</span></div></li>
        </ol>
      </section>

      <section className="mcpSystemGrid">
        <article><span className="eyebrow">{tr("1 · PAIR THE DEVICE", "1 · 配对设备")}</span><h3>{tr("Install the device agent", "安装设备 Agent")}</h3><code>npx remotelink</code><p>{tr("The browser confirms the pairing code and stores a unique revocable credential on that machine.", "浏览器确认配对码，并在这台设备上保存一份独立、可撤销的凭证。")}</p></article>
        <article><span className="eyebrow">{tr("2 · GRANT SCOPES", "2 · 授予权限")}</span><h3>{tr("OAuth stays explicit", "OAuth 权限清晰可见")}</h3><div className="scopeChips"><code>devices:read</code><code>computer:read</code><code>computer:write</code><code>browser:read</code></div><p>{tr("AI access can be revoked without re-pairing the computer.", "可以单独撤销 AI 的访问权限，而不需要重新配对电脑。")}</p></article>
        <article><span className="eyebrow">{tr("3 · CHOOSE DEVICE SKILLS", "3 · 选择设备技能")}</span><h3>{tr("Start Safe. Add only what you need.", "默认 Safe，只增加真正需要的能力。")}</h3><div className="modeRows"><span><b>Safe</b>{tr("Read files and inspect processes", "读取文件与查看进程")}</span><span><b>Developer</b>{tr("Read and edit files", "读取并编辑文件")}</span><span><b>Full</b>{tr("Adds terminal execution", "额外开启终端执行")}</span></div><p>{tr("Presets are shortcuts. The real policy is a per-device skill list that you can customize at any time.", "预设只是快捷方式；真正生效的是每台设备独立的技能列表，你可以随时逐项修改。")}</p></article>
      </section>

      <section className="pluginPath">
        <div><span className="eyebrow">{tr("THE SILKY-SMOOTH PATH", "真正丝滑的路径")}</span><h2>{tr("MCP works now. A published app makes it one click.", "MCP 现在就能用；发布 App 后，安装可以只点一下。")}</h2></div>
        <p>{tr("The universal path is a standards-based Remote MCP URL plus OAuth. A branded Remote Arc app/plugin can preconfigure the endpoint and explain its permissions, while ChatGPT, Claude and future MCP clients all share the same native Remote Arc execution core.", "当前最通用的路径是标准 Remote MCP URL + OAuth。品牌化的 Remote Arc App/Plugin 可以预置端点并解释权限，同时让 ChatGPT、Claude 与未来兼容 MCP 的客户端共用同一套 Remote Arc 原生执行核心。")}</p>
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
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [undoByDevice, setUndoByDevice] = useState<Record<string, UndoAction[]>>({});
  const [undoLoading, setUndoLoading] = useState<string | null>(null);
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});
  const [processesByDevice, setProcessesByDevice] = useState<Record<string, ManagedProcess[]>>({});
  const [processLoading, setProcessLoading] = useState<string | null>(null);
  const [processErrors, setProcessErrors] = useState<Record<string, string>>({});
  const [directoryPicker, setDirectoryPicker] = useState<{
    device: Device;
    browser: DirectoryBrowser | null;
    loading: boolean;
    error: string;
  } | null>(null);
  const [dialog, setDialog] = useState<DashboardDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogResolver = useRef<((value: boolean | string | null) => void) | null>(null);
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
  const usageLimitLabel = usage?.unlimited
    ? tr("Unlimited", "无限")
    : (usage?.limit ?? 10000).toLocaleString();

  function settleDialog(value: boolean | string | null) {
    const resolve = dialogResolver.current;
    dialogResolver.current = null;
    setDialog(null);
    if (resolve) resolve(value);
  }

  function showNotice(title: string, message: string) {
    return new Promise<void>((resolve) => {
      dialogResolver.current = () => resolve();
      setDialogValue("");
      setDialog({
        kind: "notice",
        title,
        message,
        confirmLabel: tr("Got it", "知道了"),
      });
    });
  }

  function askConfirm(
    title: string,
    message: string,
    confirmLabel = tr("Continue", "继续"),
    tone: "default" | "danger" = "default",
  ) {
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = (value) => resolve(value === true);
      setDialogValue("");
      setDialog({
        kind: "confirm",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("Cancel", "取消"),
        tone,
      });
    });
  }

  function askPrompt(
    title: string,
    message: string,
    initialValue = "",
    placeholder = "",
    confirmLabel = tr("Save", "保存"),
  ) {
    return new Promise<string | null>((resolve) => {
      dialogResolver.current = (value) =>
        resolve(typeof value === "string" ? value : null);
      setDialogValue(initialValue);
      setDialog({
        kind: "prompt",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("Cancel", "取消"),
        placeholder,
        initialValue,
      });
    });
  }

  async function refreshSecurity() {
    const response = await fetch("/api/security");
    if (!response.ok) return;
    setSecurityState(await response.json() as SecurityState);
  }

  useEffect(() => {
    if (active === "security") void refreshSecurity();
  }, [active]);

  async function refreshMonitor() {
    if (!user.isAdmin) return;
    setMonitorLoading(true);
    try {
      const response = await fetch("/api/monitor");
      if (!response.ok) return;
      setMonitorState(await response.json() as MonitorState);
    } finally {
      setMonitorLoading(false);
    }
  }

  useEffect(() => {
    if (active !== "monitor" || !user.isAdmin) return;
    void refreshMonitor();
    const timer = window.setInterval(() => void refreshMonitor(), 30_000);
    return () => window.clearInterval(timer);
  }, [active, user.isAdmin]);

  async function setMcpPaused(paused: boolean) {
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!response.ok) {
        await showNotice(
          tr("Remote MCP access was not updated", "Remote MCP 访问状态未更新"),
          tr("The server did not accept this change. Your current access state has been left unchanged.", "服务器没有接受这次修改，当前访问状态保持不变。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeGrant(grant: SecurityGrant) {
    const shortId = grant.clientId.slice(0, 12) + "…";
    const expired = grant.status === "expired";
    const confirmed = await askConfirm(
      expired
        ? tr("Remove this expired authorization?", "移除这条已过期授权？")
        : tr("Disconnect this " + grant.clientName + " authorization?", "断开这条 " + grant.clientName + " 授权？"),
      expired
        ? tr(
            "Authorization " + shortId + " can no longer access Remote Arc. Removing it clears this expired grant from your account history. Your paired computers and other AI authorizations are not affected.",
            "授权 " + shortId + " 已无法继续访问 Remote Arc。移除后只会清理这条已过期授权，不会影响已配对电脑或其他 AI 授权。",
          )
        : tr(
            "Only authorization " + shortId + " will be revoked. The ChatGPT session using this grant will need to complete OAuth again. Your paired computers and other ChatGPT authorizations stay connected.",
            "只会撤销授权 " + shortId + "。正在使用这条授权的 ChatGPT 之后需要重新完成 OAuth；已配对电脑以及其他 ChatGPT 授权不会受影响。",
          ),
      expired ? tr("Remove expired grant", "移除过期授权") : tr("Disconnect authorization", "断开此授权"),
      "danger",
    );
    if (!confirmed) return;

    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/grants/" + encodeURIComponent(grant.clientId) + "/revoke", { method: "POST" });
      if (!response.ok) {
        await showNotice(
          tr("Authorization was not revoked", "授权未撤销"),
          tr("Remote Arc could not revoke this authorization. Nothing was disconnected.", "Remote Arc 无法撤销这条授权，当前连接没有发生变化。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revoke(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    const confirmed = await askConfirm(
      tr("Remove this computer from Remote Arc?", "从 Remote Arc 移除这台电脑？"),
      tr(
        (device?.name || "This computer") + " will lose its device credential and must be paired again before any AI can use it. This does not revoke your ChatGPT OAuth grants.",
        (device?.name || "这台电脑") + " 的设备凭证会被撤销，之后必须重新配对才能继续被 AI 使用；这不会撤销 ChatGPT 的 OAuth 授权。",
      ),
      tr("Remove device", "移除设备"),
      "danger",
    );
    if (!confirmed) return;
    await fetch("/api/devices/" + encodeURIComponent(deviceId) + "/revoke", { method: "POST" });
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = (await askPrompt(
      tr("Rename device", "重命名设备"),
      tr("Choose the name shown throughout your Remote Arc dashboard.", "设置这台设备在 Remote Arc Dashboard 中显示的名称。"),
      device.name,
      tr("Device name", "设备名称"),
    ))?.trim();
    if (!next || next === device.name) return;
    await fetch("/api/devices/" + encodeURIComponent(device.id) + "/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await refreshAll();
  }

  async function saveDeviceTools(device: Device, next: readonly string[]) {
    const available = device.status === "online"
      ? (device.available_tools || device.tools)
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...(device.available_tools || device.tools)]));
    const allowedTools = Array.from(new Set(next)).filter((tool) => available.includes(tool));
    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowed_tools: allowedTools }),
    });
    if (!response.ok) {
      await showNotice(
        tr("Skill access was not updated", "技能权限未更新"),
        tr("Remote Arc could not save this device skill policy. The previous permissions are still in effect.", "Remote Arc 无法保存这台设备的技能策略，之前的权限仍然生效。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateDeviceTools(device: Device, tool: string, enabled: boolean) {
    if (enabled && tool === "start_process") {
      const confirmed = await askConfirm(
        tr("Enable terminal execution on " + device.name + "?", "在 " + device.name + " 上开启终端执行？"),
        tr(
          "This lets connected AI clients run shell commands that can modify files, software and external services. Safety Guard blocks a narrow set of catastrophic commands, but terminal access is not an OS sandbox.",
          "这会允许已连接的 AI 运行可能修改文件、软件和外部服务的 Shell 命令。Safety Guard 会阻止少量灾难级命令，但终端权限并不是操作系统级沙箱。",
        ),
        tr("Enable terminal", "开启终端"),
        "danger",
      );
      if (!confirmed) return;
    }
    const advertised = device.available_tools || device.tools;
    const baseline = device.status === "online"
      ? advertised
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertised]));
    const current = device.allowed_tools == null ? baseline : device.allowed_tools;
    const next = enabled ? Array.from(new Set([...current, tool])) : current.filter((item) => item !== tool);
    await saveDeviceTools(device, next);
  }

  async function applyDevicePreset(device: Device, preset: Exclude<DeviceAccessPreset, "custom">) {
    if (preset === "full") {
      const confirmed = await askConfirm(
        tr("Switch " + device.name + " to Full Access?", "将 " + device.name + " 切换为 Full Access？"),
        tr(
          "Full Access enables terminal execution and managed background processes. Commands may affect local files or external services and can include actions Local Undo cannot reverse.",
          "Full Access 会开启终端执行和后台进程管理。命令可能影响本地文件或外部服务，其中部分操作无法通过 Local Undo 撤销。",
        ),
        tr("Enable Full Access", "开启 Full Access"),
        "danger",
      );
      if (!confirmed) return;
    }
    const next =
      preset === "safe"
        ? SAFE_DEVICE_TOOLS
        : preset === "developer"
          ? DEVELOPER_DEVICE_TOOLS
          : DEVICE_TOOL_CATALOG;
    await saveDeviceTools(device, next);
  }

  async function saveDevicePolicy(
    device: Device,
    patch: Partial<Pick<Device, "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths" | "protect_sensitive_paths" | "undo_enabled">>,
  ) {
    const next = {
      workspace_roots: patch.workspace_roots ?? device.workspace_roots ?? [],
      sensitive_paths: patch.sensitive_paths ?? device.sensitive_paths ?? [],
      sensitive_allow_paths: patch.sensitive_allow_paths ?? device.sensitive_allow_paths ?? [],
      protect_sensitive_paths:
        patch.protect_sensitive_paths ?? device.protect_sensitive_paths ?? true,
      undo_enabled: patch.undo_enabled ?? device.undo_enabled ?? true,
    };

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(device.id) + "/policy",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      await showNotice(
        tr("Safety policy was not updated", "安全策略未更新"),
        payload.error || tr("Remote Arc could not save this device safety policy.", "Remote Arc 无法保存这台设备的安全策略。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function addPolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
  ) {
    const label =
      kind === "workspace_roots"
        ? tr("Add an allowed workspace path", "添加允许访问的工作区路径")
        : kind === "sensitive_paths"
          ? tr("Add a protected sensitive path", "添加额外受保护路径")
          : tr("Allow one sensitive path exception", "添加敏感路径例外");
    const example =
      device.platform === "win32"
        ? "E:\\Coding"
        : "~/work";
    const next = (await askPrompt(
      label,
      tr(
        "Enter a local path on " + device.name + ". Example: " + example,
        "输入 " + device.name + " 上的本地路径。示例：" + example,
      ),
      "",
      example,
      tr("Add path", "添加路径"),
    ))?.trim();
    if (!next) return;
    const current = device[kind] || [];
    await saveDevicePolicy(device, {
      [kind]: Array.from(new Set([...current, next])),
    });
  }

  async function removePolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
    value: string,
  ) {
    await saveDevicePolicy(device, {
      [kind]: (device[kind] || []).filter((item) => item !== value),
    });
  }

  async function browseDeviceDirectories(device: Device, path = "~") {
    setDirectoryPicker((current) => ({
      device,
      browser: current?.device.id === device.id ? current.browser : null,
      loading: true,
      error: "",
    }));
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(device.id) +
          "/directories?path=" +
          encodeURIComponent(path),
      );
      const payload = await response.json().catch(() => ({})) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        setDirectoryPicker({
          device,
          browser: null,
          loading: false,
          error:
            payload.error ||
            tr("Directory browsing is unavailable on this device.", "这台设备暂时无法浏览目录。"),
        });
        return;
      }
      setDirectoryPicker({
        device,
        browser: payload.browser,
        loading: false,
        error: "",
      });
    } catch {
      setDirectoryPicker({
        device,
        browser: null,
        loading: false,
        error: tr("Could not reach this device.", "无法连接到这台设备。"),
      });
    }
  }

  async function addCurrentWorkspace() {
    if (!directoryPicker?.browser) return;
    const { device, browser } = directoryPicker;
    const current = device.workspace_roots || [];
    const saved = await saveDevicePolicy(device, {
      workspace_roots: Array.from(new Set([...current, browser.path])),
    });
    if (saved) setDirectoryPicker(null);
  }

  async function loadManagedProcesses(device: Device) {
    setProcessLoading(device.id);
    setProcessErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/processes",
      );
      const payload = await response.json().catch(() => ({})) as {
        processes?: ManagedProcess[];
        error?: string;
      };
      if (!response.ok) {
        setProcessErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("Managed processes are unavailable on this device.", "这台设备暂时不支持后台进程管理。"),
        }));
        return;
      }
      setProcessesByDevice((current) => ({
        ...current,
        [device.id]: payload.processes || [],
      }));
    } finally {
      setProcessLoading((current) => (current === device.id ? null : current));
    }
  }

  async function showManagedProcessOutput(device: Device, item: ManagedProcess) {
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/output",
    );
    const payload = await response.json().catch(() => ({})) as {
      process?: ManagedProcess & { stdout?: string; stderr?: string };
      error?: string;
    };
    if (!response.ok || !payload.process) {
      await showNotice(
        tr("Process output is unavailable", "无法读取进程输出"),
        payload.error || tr("Remote Arc could not read this process output.", "Remote Arc 无法读取这个后台进程的输出。"),
      );
      return;
    }
    const stdout = payload.process.stdout || "";
    const stderr = payload.process.stderr || "";
    const combined = [
      stdout ? "stdout\n" + stdout : "",
      stderr ? "stderr\n" + stderr : "",
    ].filter(Boolean).join("\n\n");
    await showNotice(
      tr("Background process output", "后台进程输出"),
      combined.slice(-12000) || tr("No output captured yet.", "当前还没有捕获到输出。"),
    );
  }

  async function stopBackgroundProcess(device: Device, item: ManagedProcess) {
    const confirmed = await askConfirm(
      tr("Stop this background process?", "停止这个后台进程？"),
      tr(
        "Remote Arc will stop the managed process and its child process tree on " + device.name + ". This does not undo side effects the process may already have caused.",
        "Remote Arc 会在 " + device.name + " 上停止这个后台进程及其子进程树；已经产生的副作用不会因此自动撤销。",
      ),
      tr("Stop process", "停止进程"),
      "danger",
    );
    if (!confirmed) return;
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/stop",
      { method: "POST" },
    );
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      await showNotice(
        tr("Process was not stopped", "进程未停止"),
        payload.error || tr("Remote Arc could not stop this process.", "Remote Arc 无法停止这个进程。"),
      );
      return;
    }
    await loadManagedProcesses(device);
  }

  async function loadUndoHistory(device: Device) {
    setUndoLoading(device.id);
    setUndoErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/undo",
      );
      const payload = await response.json().catch(() => ({})) as {
        actions?: UndoAction[];
        error?: string;
      };
      if (!response.ok) {
        setUndoErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("Undo history is unavailable on this device.", "这台设备暂时不支持撤销历史。"),
        }));
        return;
      }
      setUndoByDevice((current) => ({
        ...current,
        [device.id]: payload.actions || [],
      }));
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
  }

  async function restoreUndoAction(device: Device, action: UndoAction) {
    const confirmed = await askConfirm(
      tr("Restore this local snapshot?", "恢复这个本机快照？"),
      tr(
        "Remote Arc will restore " + action.path + " to its state before this Remote Arc edit. The restore will run only if the current file still matches the recorded post-edit state.",
        "Remote Arc 会把 " + action.path + " 恢复到本次 Remote Arc 修改之前的状态。只有当前文件仍与当时修改后的状态一致时才会执行恢复。",
      ),
      tr("Restore file", "恢复文件"),
      "danger",
    );
    if (!confirmed) return;

    setUndoLoading(device.id);
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(device.id) +
          "/undo/" +
          encodeURIComponent(action.id),
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await showNotice(
          tr("Local Undo was not applied", "Local Undo 未执行"),
          payload.error || tr("Remote Arc could not safely restore this change.", "Remote Arc 无法安全恢复这次修改。"),
        );
        return;
      }
      await loadUndoHistory(device);
      await refreshAll();
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
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
    if (event.event_type === "device.policy_updated") return tr("Device safety policy updated", "设备安全策略已更新");
    if (event.event_type === "device.undo_restored") return tr("Local change restored", "本机修改已恢复");
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
    ...(user.isAdmin ? [["monitor", "◉", tr("Monitor", "监控")] as [DashboardTab, string, string]] : []),
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
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Devices online", "在线设备")}</span><i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} /></div><strong>{status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Monthly usage", "本月用量")}</span><span>{usage?.unlimited ? tr("Unlimited", "无限") : Math.round(usagePct) + "%"}</span></div><strong>{(usage?.used ?? 0).toLocaleString()}</strong><div className="miniUsageBar"><i style={{ width: (usage?.unlimited ? 0 : usagePct) + "%" }} /></div><small>{usage?.unlimited ? tr("Admin account · unlimited hosted calls", "管理员账户 · 托管调用无限额") : tr("of", "共") + " " + usageLimitLabel + " " + tr("hosted calls", "次托管调用")}</small></article>
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
            <section className="overviewTopbar devicesPageHeader">
              <div>
                <span className="eyebrow">{tr("DEVICES", "设备")}</span>
                <h1>{tr("Device management", "设备管理")}</h1>
                <p>{tr("Manage paired computers and per-device access.", "管理已配对电脑和每台设备的访问权限。")}</p>
              </div>
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
                const accessPreset = deviceAccessPreset(enabledTools, advertisedTools);
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
                        <strong>
                          {accessPreset === "safe"
                            ? tr("Safe · read-only", "Safe · 只读")
                            : accessPreset === "developer"
                              ? tr("Developer · files can be edited", "Developer · 可编辑文件")
                              : accessPreset === "full"
                                ? tr("Full access · terminal enabled", "Full Access · 已启用终端")
                                : tr("Custom tool policy", "自定义工具权限")}
                        </strong>
                        <p>{tr("New devices start in Safe. Enable only the skills you want this AI to use.", "新设备默认使用 Safe，只开启你愿意交给 AI 的技能。")}</p>
                      </div>
                      <div className="deviceToolChips">
                        {enabledTools.slice(0,4).map((tool) => <span key={tool}>{tool}</span>)}
                        {enabledTools.length > 4 && <span>+{enabledTools.length - 4}</span>}
                      </div>
                    </div>

                    <div className="devicePresetRow">
                      <span>{tr("Quick presets", "快捷预设")}</span>
                      <div>
                        <button className={accessPreset === "safe" ? "active" : ""} onClick={() => void applyDevicePreset(device, "safe")}>
                          <strong>Safe</strong><small>{tr("Read only", "只读")}</small>
                        </button>
                        <button className={accessPreset === "developer" ? "active" : ""} onClick={() => void applyDevicePreset(device, "developer")}>
                          <strong>Developer</strong><small>{tr("Read + edit", "读写文件")}</small>
                        </button>
                        <button className={accessPreset === "full" ? "active danger" : "danger"} onClick={() => void applyDevicePreset(device, "full")}>
                          <strong>Full</strong><small>{tr("Terminal", "含终端")}</small>
                        </button>
                      </div>
                    </div>

                    <details className="deviceToolDetails">
                      <summary>{tr("Manage individual skills", "逐项管理技能")}<span>{enabledTools.length} / {allTools.length}</span></summary>
                      <div className="toolToggleGrid">
                        {allTools.map((tool) => {
                          const enabled = device.allowed_tools == null ? (device.status === "online" ? advertisedTools.includes(tool) : true) : device.allowed_tools.includes(tool);
                          const advertised = device.status === "online" ? advertisedTools.includes(tool) : true;
                          const description =
                            tool === "undo_last_change"
                              ? tr("AI permission: lets the connected AI invoke the newest Local Undo snapshot. Snapshot creation is controlled separately under Recovery below.", "AI 权限：允许已连接的 AI 调用最新一条 Local Undo 快照。是否创建快照由下方 Recovery 中的 Local Undo 单独控制。")
                              : tool === "start_process"
                                ? tr("Run shell commands on this computer.", "在这台电脑上执行 Shell 命令。")
                                : tool === "process_status" || tool === "process_output"
                                  ? tr("Inspect a Remote Arc managed background process.", "查看由 Remote Arc 管理的后台进程。")
                                  : tool === "stop_process"
                                    ? tr("Stop a Remote Arc managed background process.", "停止由 Remote Arc 管理的后台进程。")
                                    : tr("Allow this AI client to use this native Remote Arc skill.", "允许 AI 客户端使用这个 Remote Arc 原生技能。");
                          return (
                            <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}>
                              <input type="checkbox" checked={enabled} disabled={!advertised} onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)} />
                              <span className="skillLabel">
                                <strong>{tool}</strong>
                                <HelpTip
                                  label={tr("About " + tool, "了解 " + tool)}
                                  text={description}
                                />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {device.status === "offline" && <span className="offlineTools">{tr("Offline: changes are saved now and enforced the next time this device connects.", "设备离线：修改会立即保存，并在设备下次连接时生效。")}</span>}
                    </details>

                    <details className="deviceSafetyDetails">
                      <summary>
                        {tr("File boundaries & recovery", "文件边界与恢复")}
                        <span>
                          {(device.protect_sensitive_paths ?? true)
                            ? tr("Sensitive paths protected", "敏感路径已保护")
                            : tr("Sensitive protection off", "敏感路径保护已关闭")}
                          {" · "}
                          {(device.workspace_roots || []).length
                            ? (device.workspace_roots || []).length + " " + tr("workspaces", "个工作区")
                            : tr("all non-sensitive paths", "全部非敏感路径")}
                        </span>
                      </summary>

                      <div className="deviceSafetyBody">
                        {!device.policy_enforcement_available && device.status === "online" && (
                          <p className="policyWarning">{tr(
                            "This device is still running an older remotelink client. Policy settings are saved now, but symlink-safe local enforcement activates after you restart it with the latest npm release.",
                            "这台设备仍在运行旧版 remotelink。策略会立即保存，但防符号链接绕过的本机强制执行，需要用最新版 npm 客户端重启后才会生效。",
                          )}</p>
                        )}
                        <div className="policyToggleRow">
                          <div className="labelWithHelp">
                            <strong>{tr("Sensitive Path Policy", "敏感路径策略")}</strong>
                            <HelpTip
                              label={tr("About Sensitive Path Policy", "了解敏感路径策略")}
                              text={tr(
                                "Blocks built-in credential locations such as .ssh, .aws, browser profiles and .env files before local execution.",
                                "在本机执行前阻止 .ssh、.aws、浏览器配置、.env 等内置敏感位置。",
                              )}
                            />
                          </div>
                          <label className="compactSwitch">
                            <input
                              type="checkbox"
                              checked={device.protect_sensitive_paths ?? true}
                              onChange={(event) => void saveDevicePolicy(device, {
                                protect_sensitive_paths: event.target.checked,
                              })}
                            />
                            <span />
                          </label>
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Workspace Scope", "工作区范围")}</strong>
                              <HelpTip
                                label={tr("About Workspace Scope", "了解工作区范围")}
                                text={tr(
                                  "When configured, Remote Arc file tools can only touch these roots. Empty means all non-sensitive paths.",
                                  "配置后，Remote Arc 文件工具只能访问这些根目录；留空表示可访问全部非敏感路径。",
                                )}
                              />
                            </div>
                            <div className="policyHeaderActions">
                              <button className="ghostButton small" disabled={device.status !== "online"} onClick={() => void browseDeviceDirectories(device)}>
                                {tr("Browse folders", "浏览目录")}
                              </button>
                              <button className="ghostButton small" onClick={() => void addPolicyPath(device, "workspace_roots")}>
                                + {tr("Enter path", "输入路径")}
                              </button>
                            </div>
                          </div>
                          <div className="policyPathList">
                            {(device.workspace_roots || []).map((root) => (
                              <span className="policyPathChip" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "workspace_roots", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.workspace_roots || []).length && (
                              <span className="policyEmpty">{tr(
                                "No workspace restriction yet.",
                                "当前未限制工作区。",
                              )}</span>
                            )}
                          </div>
                          {enabledTools.includes("start_process") && !!(device.workspace_roots || []).length && (
                            <p className="policyWarning">{tr(
                              "Full terminal access is not an OS sandbox. Remote Arc requires an in-scope cwd, but shell commands may still reference other paths. Use Developer mode when strict file confinement matters.",
                              "Full 终端并不是操作系统级沙箱。Remote Arc 会要求 cwd 位于工作区内，但 Shell 命令仍可能引用其他路径；需要严格文件隔离时请使用 Developer 模式。",
                            )}</p>
                          )}
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Extra protected paths", "额外保护路径")}</strong>
                              <HelpTip
                                label={tr("About extra protected paths", "了解额外保护路径")}
                                text={tr(
                                  "Add private folders that should remain blocked in addition to Remote Arc's built-in sensitive locations.",
                                  "在内置敏感位置之外，再添加不希望 AI 访问的私有目录。",
                                )}
                              />
                            </div>
                            <button className="ghostButton small" onClick={() => void addPolicyPath(device, "sensitive_paths")}>
                              + {tr("Protect path", "保护路径")}
                            </button>
                          </div>
                          <div className="policyPathList">
                            {(device.sensitive_paths || []).map((root) => (
                              <span className="policyPathChip protected" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "sensitive_paths", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.sensitive_paths || []).length && (
                              <span className="policyEmpty">{tr(
                                "Built-in sensitive paths only.",
                                "当前仅使用内置敏感路径。",
                              )}</span>
                            )}
                          </div>
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Sensitive path exceptions", "敏感路径例外")}</strong>
                              <HelpTip
                                label={tr("About sensitive path exceptions", "了解敏感路径例外")}
                                text={tr(
                                  "Keep protection enabled globally, but explicitly allow only the sensitive files or folders this device truly needs. Exceptions still remain inside Workspace Scope.",
                                  "保持整体敏感路径保护开启，只对确实需要访问的敏感文件或目录做窄范围例外；例外仍受 Workspace Scope 限制。",
                                )}
                              />
                            </div>
                            <button
                              className="ghostButton small"
                              onClick={() => void addPolicyPath(device, "sensitive_allow_paths")}
                            >
                              + {tr("Allow exception", "添加例外")}
                            </button>
                          </div>
                          <div className="policyPathList">
                            {(device.sensitive_allow_paths || []).map((root) => (
                              <span className="policyPathChip exception" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "sensitive_allow_paths", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.sensitive_allow_paths || []).length && (
                              <span className="policyEmpty">{tr(
                                "No sensitive-path exceptions.",
                                "当前没有敏感路径例外。",
                              )}</span>
                            )}
                          </div>

                        </div>

                        <div className="policyToggleRow undoPolicyToggle">
                          <div className="labelWithHelp">
                            <strong>{tr("Create Local Undo snapshots", "创建 Local Undo 快照")}</strong>
                            <HelpTip
                              label={tr("About Local Undo snapshots", "了解 Local Undo 快照")}
                              text={tr(
                                "Recovery setting: when enabled, supported file edits save the previous state on this computer. This is separate from the undo_last_change skill, which only controls whether AI may invoke an existing snapshot.",
                                "恢复设置：开启后，支持的文件修改会先在本机保存修改前状态。它和 undo_last_change 技能是两件事；后者只控制 AI 是否能调用已有快照。",
                              )}
                            />
                          </div>
                          <label className="compactSwitch">
                            <input
                              type="checkbox"
                              checked={device.undo_enabled ?? true}
                              onChange={(event) => void saveDevicePolicy(device, {
                                undo_enabled: event.target.checked,
                              })}
                            />
                            <span />
                          </label>
                        </div>

                        <div className="undoHistorySection">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Undo history", "撤销历史")}</strong>
                              <HelpTip
                                label={tr("About Undo history", "了解撤销历史")}
                                text={tr(
                                  "Loaded directly from the device on demand; this history is not persisted in the cloud.",
                                  "仅在需要时直接从设备读取，历史记录不会持久化到云端。",
                                )}
                              />
                            </div>
                            <button
                              className="ghostButton small"
                              disabled={
                                device.status !== "online" ||
                                !device.undo_history_available ||
                                undoLoading === device.id
                              }
                              onClick={() => void loadUndoHistory(device)}
                            >
                              {undoLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
                            </button>
                          </div>

                          {!device.undo_history_available && (
                            <p className="policyNotice">{tr(
                              "Undo history UI requires the latest remotelink client. Restart this device with the current npm release after the update is published.",
                              "撤销历史 UI 需要最新版 remotelink 客户端。新版本发布后，请用最新 npm 版本重启这台设备。",
                            )}</p>
                          )}

                          {!!undoErrors[device.id] && (
                            <p className="policyWarning">{undoErrors[device.id]}</p>
                          )}

                          {!!undoByDevice[device.id]?.length && (
                            <div className="undoActionList">
                              {(undoByDevice[device.id] || []).map((action) => (
                                <div className="undoActionRow" key={action.id}>
                                  <div>
                                    <strong>{action.tool}</strong>
                                    <code title={action.path}>{action.path}</code>
                                    <small>
                                      {timeAgo(action.created_at)}
                                      {" · "}
                                      {action.existed_before
                                        ? tr("restore previous content", "恢复原有内容")
                                        : tr("remove created file", "删除新建文件")}
                                      {" · "}
                                      {action.status === "ready"
                                        ? tr("ready", "可撤销")
                                        : action.status === "conflict"
                                          ? tr("conflict: file changed again", "冲突：文件后来又被修改")
                                          : action.status === "missing"
                                            ? tr("target missing", "目标文件已不存在")
                                            : tr("legacy snapshot", "旧版快照")}
                                    </small>
                                  </div>
                                  <button
                                    className="ghostButton small"
                                    disabled={
                                      undoLoading === device.id ||
                                      !(device.undo_enabled ?? true) ||
                                      !action.can_undo
                                    }
                                    title={
                                      action.can_undo
                                        ? tr("Restore this local snapshot", "恢复这个本机快照")
                                        : tr("Automatic undo is unavailable because the current file no longer matches the recorded post-edit state.", "当前文件已不再匹配当时修改后的状态，自动撤销不可用。")
                                    }
                                    onClick={() => void restoreUndoAction(device, action)}
                                  >
                                    {action.can_undo ? tr("Undo", "撤销") : tr("Unavailable", "不可撤销")}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {undoByDevice[device.id] !== undefined && !(undoByDevice[device.id] || []).length && !undoErrors[device.id] && (
                            <p className="policyEmpty">{tr(
                              "No reversible Remote Arc file changes are currently stored.",
                              "当前没有可撤销的 Remote Arc 文件修改。",
                            )}</p>
                          )}
                        </div>
                      </div>
                    </details>

                    <details className="deviceProcessDetails">
                      <summary>
                        {tr("Managed background processes", "后台进程管理")}
                        <span>
                          {processesByDevice[device.id]
                            ? (processesByDevice[device.id] || []).filter((item) => item.status === "running").length + " " + tr("running", "个运行中")
                            : tr("load on demand", "按需读取")}
                        </span>
                      </summary>
                      <div className="managedProcessBody">
                        <div className="policyBlockHead">
                          <div className="labelWithHelp">
                            <strong>{tr("Processes started by Remote Arc", "由 Remote Arc 启动的进程")}</strong>
                            <HelpTip
                              label={tr("About managed background processes", "了解后台进程管理")}
                              text={tr(
                                "Only background processes started with Remote Arc's managed process mode appear here. This is not a list of every process on your computer.",
                                "这里只显示通过 Remote Arc 后台进程模式启动的进程，并不是这台电脑上所有系统进程的列表。",
                              )}
                            />
                          </div>
                          <button
                            className="ghostButton small"
                            disabled={device.status !== "online" || processLoading === device.id}
                            onClick={() => void loadManagedProcesses(device)}
                          >
                            {processLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
                          </button>
                        </div>

                        {!!processErrors[device.id] && (
                          <p className="policyWarning">{processErrors[device.id]}</p>
                        )}

                        {!!processesByDevice[device.id]?.length && (
                          <div className="managedProcessList">
                            {(processesByDevice[device.id] || []).map((item) => (
                              <div className="managedProcessRow" key={item.process_id}>
                                <div className="managedProcessState">
                                  <i className={item.status === "running" ? "running" : "exited"} />
                                  <div>
                                    <strong>{item.status === "running" ? tr("Running", "运行中") : tr("Exited", "已退出")}</strong>
                                    <small>PID {item.pid || "—"} · {timeAgo(item.started_at)}</small>
                                  </div>
                                </div>
                                <div className="managedProcessCommand">
                                  <code title={item.command}>{item.command}</code>
                                  <small>{item.cwd || tr("Default working directory", "默认工作目录")}</small>
                                </div>
                                <div className="managedProcessActions">
                                  <button className="ghostButton small" onClick={() => void showManagedProcessOutput(device, item)}>
                                    {tr("Output", "查看输出")}
                                  </button>
                                  {item.status === "running" && (
                                    <button className="dangerButton small" onClick={() => void stopBackgroundProcess(device, item)}>
                                      {tr("Stop", "停止")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {processesByDevice[device.id] !== undefined && !(processesByDevice[device.id] || []).length && !processErrors[device.id] && (
                          <p className="policyEmpty">{tr(
                            "No Remote Arc managed background processes are currently retained on this device.",
                            "这台设备当前没有由 Remote Arc 管理并保留的后台进程。",
                          )}</p>
                        )}
                      </div>
                    </details>

                    <div className="deviceActions managedActions">
                      <button className="ghostButton" onClick={() => void rename(device)}>{tr("Rename", "重命名")}</button>
                      <CopyButton value={device.id} label={tr("Copy ID", "复制 ID")}/>
                      <button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Revoke", "撤销")}</button>
                    </div>
                  </article>
                );
              })}

              {!devices.length && <article className="emptyCard wide deviceEmptyState"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button className="goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add your first device", "添加第一台设备")}</button></article>}
              {!!devices.length && !filteredDevices.length && <article className="emptyCard wide"><div className="emptyIcon">⌕</div><h3>{tr("No matching devices", "没有匹配设备")}</h3><p>{tr("Try another search or clear the status filter.", "尝试其他搜索词，或清除状态筛选。")}</p><button onClick={() => { setDeviceQuery(""); setDeviceFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></article>}
            </div>
          </>
        )}

        {active === "connect" && (
          <>
            <section className="overviewTopbar connectPageHeader">
              <div>
                <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
                <h1>{tr("AI connections", "AI 连接")}</h1>
                <p>{tr("Connect supported AI clients to your Remote Arc MCP endpoint.", "把支持的 AI 客户端连接到 Remote Arc MCP 地址。")}</p>
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
                    <div className="connectClientIdentity"><img className="monoLogo" src={aiClients[0].icon} alt="" /><div><span className="eyebrow">CHATGPT</span><h3>ChatGPT</h3></div></div>
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
                    <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[1].icon} alt="" /><div><span className="eyebrow">CLAUDE</span><h3>Claude</h3></div></div>
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
                <strong>{tr("Rate limiting active", "限流保护已启用")}</strong>
                <small>{tr("Traffic is protected by per-user/client limits. This status means protection is enabled, not that requests are currently being blocked.", "流量已受到按用户/客户端的限流保护。这个状态表示保护已启用，并不代表当前请求正在被拦截。")}</small>
              </article>
            </section>

            <section className="securityPanel securityGrantsPanel">
              <div className="securityPanelHeader">
                <div>
                  <span className="eyebrow">{tr("CONNECTED AI ACCESS", "已连接 AI 访问")}</span>
                  <div className="headingWithHelp">
                    <h2>{tr("AI authorizations", "AI 授权")}</h2>
                    <HelpTip
                      label={tr("About AI authorizations", "了解 AI 授权")}
                      text={tr(
                        "Each row is one OAuth authorization instance created when an AI client connects to Remote Arc. Multiple ChatGPT rows can exist if ChatGPT registered or authorized Remote Arc more than once. Active means the current access token works now; Refreshable means the access token expired but the client can obtain a new one without asking again; Expired can no longer reconnect.",
                        "每一行代表 AI 客户端连接 Remote Arc 时创建的一份 OAuth 授权实例。ChatGPT 多次注册或授权时可能出现多行。Active 表示当前 Access Token 可用；Refreshable 表示 Access Token 已过期但仍可无须重新确认地换取新 Token；Expired 表示已无法重新连接。",
                      )}
                    />
                  </div>
                </div>
                <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
              </div>
              <div className="securityGrantList">
                {(securityState?.grants || []).map((grant) => {
                  const statusLabel =
                    grant.status === "active"
                      ? tr("Active now", "当前有效")
                      : grant.status === "refreshable"
                        ? tr("Refreshable", "可刷新")
                        : tr("Expired", "已过期");
                  const statusHelp =
                    grant.status === "active"
                      ? tr("Its current access token is still valid.", "当前 Access Token 仍有效。")
                      : grant.status === "refreshable"
                        ? tr("The short-lived access token expired, but the refresh authorization can still obtain a new one without asking you again.", "短期 Access Token 已过期，但 Refresh 授权仍可在无需再次询问你的情况下换取新 Token。")
                        : tr("Both access and refresh authorization have expired. This grant can no longer access Remote Arc.", "Access 与 Refresh 授权均已过期，这条 Grant 已无法继续访问 Remote Arc。");
                  return (
                    <div className={"securityGrantRow " + grant.status} key={grant.clientId}>
                      <div className="securityGrantIdentity">
                        <span className="securityGrantIcon">AI</span>
                        <div>
                          <strong>{grant.clientName}</strong>
                          <small>{tr("Authorization", "授权")} {grant.clientId.slice(0,12)}…</small>
                        </div>
                      </div>
                      <div className="securityGrantState">
                        <span className={"grantState " + grant.status}>{statusLabel}</span>
                        <HelpTip
                          label={tr("About this authorization status", "了解此授权状态")}
                          text={statusHelp}
                        />
                      </div>
                      <div className="securityGrantDetails">
                        <span>{tr("First authorized", "首次授权")} <strong>{timeAgo(grant.authorizedAt)}</strong></span>
                        <span>{tr("Last token issued", "最近签发 Token")} <strong>{timeAgo(grant.lastTokenIssuedAt)}</strong></span>
                        <span>{tr("Access token expires", "Access Token 到期")} <strong>{new Date(grant.accessExpiresAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></span>
                        <span>{tr("Refresh authorization", "Refresh 授权")} <strong>{grant.refreshExpiresAt ? new Date(grant.refreshExpiresAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-NZ", { year: "numeric", month: "short", day: "numeric" }) : tr("None", "无")}</strong></span>
                      </div>
                      <div className="securityGrantScopes">{grant.scopes.map((scope) => <code key={scope}>{scope}</code>)}</div>
                      <button className={grant.status === "expired" ? "ghostButton" : "dangerButton"} disabled={securityBusy} onClick={() => void revokeGrant(grant)}>
                        {grant.status === "expired" ? tr("Remove expired", "移除过期授权") : tr("Disconnect access", "断开此授权")}
                      </button>
                    </div>
                  );
                })}
                {securityState && !securityState.grants.length && <div className="securityEmptyState compact"><strong>{tr("No AI authorizations", "暂无 AI 授权")}</strong><span>{tr("Connect ChatGPT, Claude or another MCP client to see each OAuth authorization here.", "连接 ChatGPT、Claude 或其他 MCP 客户端后，每一份 OAuth 授权都会显示在这里。")}</span><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button></div>}
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

        {active === "monitor" && user.isAdmin && (
          <>
            <section className="overviewTopbar monitorTopbar">
              <div>
                <span className="eyebrow">{tr("MONITOR", "监控")}</span>
                <h1>{tr("Service health", "服务健康度")}</h1>
                <p>{tr("Worker errors, dependencies and alert delivery for Remote Arc production.", "查看 Remote Arc 生产环境的 Worker 错误、依赖状态与告警投递。")}</p>
              </div>
              <button className="ghostButton" disabled={monitorLoading} onClick={() => void refreshMonitor()}>
                {monitorLoading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}
              </button>
            </section>

            <section className="monitorSummary">
              <div className={"monitorHealth " + (monitorState?.status || "unknown")}>
                <span>{tr("Overall", "整体状态")}</span>
                <strong>{monitorState?.status === "operational" ? tr("Operational", "运行正常") : monitorState?.status === "degraded" ? tr("Degraded", "存在异常") : tr("Loading", "加载中")}</strong>
                <small>{monitorState ? tr("Checked ", "检查于 ") + new Date(monitorState.checkedAt).toLocaleTimeString() : "—"}</small>
              </div>
              <div><span>5xx · 15m</span><strong>{monitorState?.worker.errors15m ?? "—"}</strong><small>{tr("Recent errors", "最近错误")}</small></div>
              <div><span>5xx · 1h</span><strong>{monitorState?.worker.errors1h ?? "—"}</strong><small>{tr("Last hour", "过去一小时")}</small></div>
              <div><span>5xx · 24h</span><strong>{monitorState?.worker.errors24h ?? "—"}</strong><small>{tr("Last 24 hours", "过去 24 小时")}</small></div>
            </section>

            <section className="monitorMainGrid">
              <article className="monitorPanel">
                <div className="monitorPanelHeader">
                  <div><span className="eyebrow">{tr("RECENT INCIDENTS", "最近异常")}</span><h2>{tr("Production errors", "生产错误")}</h2></div>
                  <span className="privacyPill">{monitorState?.incidents.length ?? 0} {tr("shown", "条")}</span>
                </div>
                <div className="monitorIncidentList">
                  {(monitorState?.incidents || []).map((incident) => (
                    <div className={"monitorIncidentRow " + incident.severity} key={incident.id}>
                      <span className="monitorIncidentCode">{incident.status_code || "ERR"}</span>
                      <div className="monitorIncidentBody">
                        <strong>{incident.method ? incident.method + " " : ""}{incident.path || incident.kind}</strong>
                        <small>{incident.message}</small>
                        <code>{incident.ray_id ? "CF-Ray " + incident.ray_id : incident.kind}{incident.colo ? " · " + incident.colo : ""}</code>
                      </div>
                      <time>{timeAgo(incident.created_at)}</time>
                    </div>
                  ))}
                  {monitorState && !monitorState.incidents.length && (
                    <div className="monitorEmpty">✓ {tr("No recorded production errors.", "暂无已记录的生产错误。")}</div>
                  )}
                  {!monitorState && <div className="monitorEmpty">{tr("Loading monitor data…", "正在加载监控数据…")}</div>}
                </div>
              </article>

              <aside className="monitorSide">
                <section>
                  <span className="eyebrow">{tr("DEPENDENCIES", "依赖")}</span>
                  <div className="monitorCheck"><span><i className="healthDot good" />Cloudflare Worker</span><strong>{monitorState?.worker.status || "—"}</strong></div>
                  <div className="monitorCheck"><span><i className="healthDot good" />D1</span><strong>{monitorState?.dependencies.d1.status || "—"}</strong></div>
                  <div className="monitorCheck"><span><i className="healthDot good" />Durable Objects</span><strong>{monitorState?.dependencies.durableObjects.status || "—"}</strong></div>
                </section>
                <section>
                  <span className="eyebrow">{tr("ALERTING", "告警")}</span>
                  <div className="monitorAlertState">
                    <strong>{monitorState?.alerts.emailConfigured ? tr("Email active", "邮件告警已启用") : tr("Email channel pending", "邮件通道待启用")}</strong>
                    <span>{monitorState?.alerts.destination || "moviegoer24@gmail.com"}</span>
                    <small>{monitorState?.alerts.emailConfigured ? tr("5xx and exceptions are rate-limited to one email per alert type every 10 minutes.", "5xx 与异常告警按类型限频，每 10 分钟最多一封。") : tr("Monitoring is active. Cloudflare Email Service is not enabled for this account yet, so incidents are stored here but email delivery is pending.", "监控已经生效；当前 Cloudflare Email Service 尚未对账号开放，因此异常会记录在这里，但邮件投递仍待启用。")}</small>
                  </div>
                </section>
                <section>
                  <span className="eyebrow">{tr("SERVICE", "服务")}</span>
                  <div className="monitorCheck"><span>{tr("Users", "用户")}</span><strong>{monitorState?.account.users ?? "—"}</strong></div>
                  <div className="monitorCheck"><span>{tr("Devices", "设备")}</span><strong>{monitorState?.account.devices ?? "—"}</strong></div>
                  <div className="monitorCheck"><span>{tr("Active OAuth tokens", "有效 OAuth Token")}</span><strong>{monitorState?.account.activeTokens ?? "—"}</strong></div>
                </section>
              </aside>
            </section>
          </>
        )}

        {active === "settings" && (
          <>
            <section className="pageHeader"><div><span className="eyebrow">{tr("SETTINGS", "设置")}</span><h1>{tr("Make Remote Arc yours.", "把 Remote Arc 调成你喜欢的样子。")}</h1><p>{tr("Language, plan information and account preferences.", "语言、套餐信息与账户偏好。")}</p></div></section>
            <section className="settingsGrid">
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Choose Light, Dark or System. Your preference is saved in this browser.", "选择浅色、深色或跟随系统；偏好会保存在当前浏览器。")}</p></div><ThemeSwitcher /></article>
              <article className="settingsCard"><div><h2>{tr("Language", "语言")}</h2><p>{tr("Changes apply immediately and are saved in this browser.", "修改后立即生效，并保存在当前浏览器。")}</p></div><div className="languageSetting"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button><button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Account & profile", "账号与个人信息")}</h2><p>{user.name || tr("Remote Arc user", "Remote Arc 用户")} · {user.email}</p></div><button className="ghostButton" onClick={() => void signOut()}>{tr("Sign out", "退出登录")}</button></article><article className="settingsCard"><div><h2>{tr("MCP connection", "MCP 连接")}</h2><p>{tr("Manage per-device tool access from Devices. Disabled tools are enforced by the relay.", "在设备页管理每台电脑的工具权限；关闭的工具会由 Relay 强制拦截。")}</p><code>{mcpEndpoint}</code></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button></article><article className="settingsCard"><div><h2>{tr("Billing & payments", "账单与支付")}</h2><p>{usage?.unlimited ? tr("Administrator account with unlimited hosted usage.", "管理员账户，托管调用无限额。") : tr("Your account starts on the free hosted tier. Paid usage is added through top-ups when you need more capacity.", "账户默认使用免费托管额度；需要更多容量时通过充值增加付费调用额度。")}</p></div><div className="planValue">{usage?.unlimited ? tr("Unlimited", "无限") : `${usage?.used ?? 0} / ${usageLimitLabel}`}</div></article>
              <article className="settingsCard"><div><h2>{tr("Usage & top-ups", "额度与充值")}</h2><p>{tr("Your hosted account includes a free monthly allowance. Add paid usage when you need more capacity.", "托管账户每月包含免费额度；需要更多容量时可按需充值。")}</p></div><a className="ghostButton" href={MARKETING_ORIGIN + "/pricing"}>{tr("View pricing", "查看价格")}</a></article>
            </section>
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · mcp.remotearc.app</span><div><a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a><a href={MARKETING_ORIGIN + "/resources"}>{tr("Resources", "资源")}</a><a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a><a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a><a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a><a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a></div></footer>
      </main>

      <nav className="mobileBottomNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
        {([
          ["overview", "⌂", tr("Home", "首页")],
          ["devices", "▣", tr("Devices", "设备")],
          ["connect", "↗", tr("Connect", "连接")],
          ["security", "◇", tr("Security", "安全")],
          ["settings", "⚙", tr("Settings", "设置")],
        ] as Array<[DashboardTab, string, string]>).map(([id, icon, label]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
            <span aria-hidden="true">{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>

      {directoryPicker && (
        <div className="modalBackdrop" onMouseDown={() => setDirectoryPicker(null)}>
          <section className="modal directoryPickerModal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setDirectoryPicker(null)}>×</button>
            <span className="eyebrow">{tr("CHOOSE WORKSPACE", "选择工作区")}</span>
            <h2>{tr("Choose a folder on " + directoryPicker.device.name, "选择 " + directoryPicker.device.name + " 上的目录")}</h2>
            <p>{tr(
              "Remote Arc will add the selected folder as an allowed Workspace Scope root. Sensitive paths remain protected.",
              "Remote Arc 会把所选目录加入 Workspace Scope 允许根目录；敏感路径保护仍然生效。",
            )}</p>

            {directoryPicker.browser && (
              <div className="directoryPickerPath">
                <code>{directoryPicker.browser.path}</code>
                {directoryPicker.browser.parent && (
                  <button className="ghostButton small" onClick={() => void browseDeviceDirectories(directoryPicker.device, directoryPicker.browser!.parent!)}>
                    ↑ {tr("Parent", "上一级")}
                  </button>
                )}
              </div>
            )}

            <div className="directoryPickerList">
              {directoryPicker.loading && <div className="directoryPickerEmpty">{tr("Loading folders…", "正在加载目录…")}</div>}
              {!directoryPicker.loading && !!directoryPicker.error && (
                <div className="policyWarning">{directoryPicker.error}</div>
              )}
              {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser?.directories.map((entry) => (
                <button
                  className="directoryPickerEntry"
                  key={entry.path}
                  onClick={() => void browseDeviceDirectories(directoryPicker.device, entry.path)}
                >
                  <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
                  <strong>{entry.name}</strong>
                  <small>›</small>
                </button>
              ))}
              {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser && !directoryPicker.browser.directories.length && (
                <div className="directoryPickerEmpty">{tr("No visible child folders.", "没有可见的子目录。")}</div>
              )}
            </div>

            {directoryPicker.browser && directoryPicker.browser.protected_entries_omitted > 0 && (
              <p className="directoryPickerNote">{tr(
                directoryPicker.browser.protected_entries_omitted + " protected folder(s) are hidden by Sensitive Path Policy.",
                "有 " + directoryPicker.browser.protected_entries_omitted + " 个受保护目录已被 Sensitive Path Policy 隐藏。",
              )}</p>
            )}

            <div className="dialogActions">
              <button className="ghostButton" onClick={() => setDirectoryPicker(null)}>{tr("Cancel", "取消")}</button>
              <button className="primaryButton" disabled={!directoryPicker.browser || directoryPicker.loading} onClick={() => void addCurrentWorkspace()}>
                {tr("Use this folder", "使用当前目录")}
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className="modalBackdrop" onMouseDown={() => settleDialog(dialog.kind === "notice" ? true : null)}>
          <section className={"modal appDialog " + (dialog.tone === "danger" ? "danger" : "")} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => settleDialog(dialog.kind === "notice" ? true : null)}>×</button>
            <span className="eyebrow">
              {dialog.kind === "prompt"
                ? tr("INPUT REQUIRED", "需要输入")
                : dialog.tone === "danger"
                  ? tr("CONFIRM ACTION", "确认操作")
                  : tr("REMOTE ARC", "REMOTE ARC")}
            </span>
            <h2>{dialog.title}</h2>
            <p>{dialog.message}</p>
            {dialog.kind === "prompt" && (
              <input
                className="dialogInput"
                autoFocus
                value={dialogValue}
                placeholder={dialog.placeholder}
                onChange={(event) => setDialogValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && dialogValue.trim()) settleDialog(dialogValue.trim());
                  if (event.key === "Escape") settleDialog(null);
                }}
              />
            )}
            <div className="dialogActions">
              {dialog.kind !== "notice" && (
                <button className="ghostButton" onClick={() => settleDialog(null)}>
                  {dialog.cancelLabel || tr("Cancel", "取消")}
                </button>
              )}
              <button
                className={dialog.tone === "danger" ? "dangerButton" : "primaryButton"}
                disabled={dialog.kind === "prompt" && !dialogValue.trim()}
                onClick={() => settleDialog(dialog.kind === "prompt" ? dialogValue.trim() : true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}

      {showAdd && (
        <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
            <span className="eyebrow">{tr("ADD A DEVICE", "添加设备")}</span>
            <h2>{tr("Connect a computer in one command.", "一条命令连接电脑。")}</h2>
            <p>{tr("No repository clone, environment file, token copy, public IP or router configuration. New devices start with read-only skills enabled.", "无需 clone 仓库、环境文件、复制 Token、公网 IP 或路由器配置。新设备默认只开启只读技能。")}</p>
            <div className="commandLabel">{tr("Recommended · Safe by default", "推荐 · 默认 Safe")}</div>
            <div className="commandBox"><code>{command}</code><CopyButton value={command}/></div>
            <div className="commandLabel secondary">{tr("Optional local hard lock · always read-only", "可选本机硬限制 · 始终只读")}</div>
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
      const response = await fetch("/api/status");
      if (!response.ok) return;
      const payload = (await response.json()) as ProductStatus;
      setDevices(payload.devices);
      setStatus(payload);
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
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA support is progressive enhancement; dashboard functionality must not depend on it.
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadAll();
    };
    void loadAll();
    const timer = window.setInterval(refreshIfVisible, 60_000);
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

  if (location.pathname === "/install") {
    location.replace("/install/chatgpt");
    return <CenteredCard title={tr("Opening installation…", "正在打开安装页…")} body={tr("Redirecting to the ChatGPT installation guide.", "正在跳转到 ChatGPT 安装指南。")} />;
  }

  const installMatch = location.pathname.match(/^\/install\/(chatgpt|claude|cursor)$/);
  if (installMatch) {
    return (
      <ClientInstallPage
        slug={installMatch[1] as InstallClientSlug}
        user={user === undefined ? null : user}
      />
    );
  }

  if (location.pathname === "/demo") return <DemoPage user={user === undefined ? null : user} />;
  if (location.pathname === "/connect-ai") return <ConnectPage user={user === undefined ? null : user} />;
  if (location.pathname === "/docs") return <DocsPage user={user === undefined ? null : user} />;
  if (location.pathname === "/security-model") return <SecurityModelPage user={user === undefined ? null : user} />;
  if (location.pathname === "/use-cases") return <UseCasesPage user={user === undefined ? null : user} />;
  const useCaseMatch = location.pathname.match(/^\/use-cases\/(remote-development|data-work|home-lab|browser-research|remote-support)$/);
  if (useCaseMatch) {
    return <UseCaseDetailPage slug={useCaseMatch[1] as PublicUseCaseSlug} user={user === undefined ? null : user} />;
  }
  if (location.pathname === "/chatgpt-computer-access") return <ChatGptComputerAccessPage user={user === undefined ? null : user} />;
  if (location.pathname === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs") return <BlogsPage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/why-i-built-remote-arc") return <BlogArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/remote-arc-vs-openclaw") return <RemoteArcVsOpenClawArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/powerful-ai-access-without-exposing-your-computer") return <PowerfulAccessArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/how-remote-arc-works") return <ArchitectureArticlePage user={user === undefined ? null : user} />;
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
    if (location.pathname === "/monitor" && !user.isAdmin) {
      return <CenteredCard title={tr("Admin only", "仅管理员可访问")} body={tr("Service monitoring is restricted to Remote Arc administrators.", "服务监控仅限 Remote Arc 管理员访问。")} />;
    }
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
