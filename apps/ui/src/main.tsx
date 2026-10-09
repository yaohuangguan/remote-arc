import { HeroHeadline, LandingContent, ConnectionFilm } from "./landing-content.js";
import { ClientMcpGuide } from "./client-setup-guides.js";
import type { UseCaseSlug } from "./use-cases.js";
import { TaskResults, taskNeedsAgent, taskNeedsAttention, taskProgress, taskActivity } from "./dashboard-task-view.js";
import { newPlannedDraft, buildPlannedContract } from "./planned-goal-form.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, LanguageSwitcher, useI18n } from "./i18n.js";
import { ThemeProvider, useTheme } from "./theme.js";
import { UI_PREVIEW, installUiPreviewFetchMock } from "./preview.js";
import type { SecurityGrant, SecurityState } from "@remotearc/protocol";
import { parsePendingApprovals, parseSecurityState, type PendingApproval } from "./security-state.js";
import { waitForAgentOffline, waitForRecoveryState } from "./background-recovery.js";
import "./styles.css";
import "./dashboard.css";

declare const __REMOTEARC_CLI_VERSION__: string;

const LATEST_AGENT_VERSION = __REMOTEARC_CLI_VERSION__;

function releaseTuple(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as const : null;
}

function isOlderRelease(current: string | null | undefined, latest = LATEST_AGENT_VERSION) {
  const left = releaseTuple(current);
  const right = releaseTuple(latest);
  if (!left || !right) return false;
  if (left[0] !== right[0]) return left[0] < right[0];
  if (left[1] !== right[1]) return left[1] < right[1];
  if (left[2] !== right[2]) return left[2] < right[2];
  return false;
}

const PricingContent = React.lazy(() => import("./pricing.js").then(module => ({ default: module.PricingContent })));
const PlannedGoalEditor = React.lazy(() => import("./planned-goal-view.js").then(module => ({ default: module.PlannedGoalEditor })));

const NativeInstall = React.lazy(() => import("./native-install.js").then(module => ({ default: module.NativeInstall })));
const Documentation = React.lazy(() => import("./product-docs.js").then(module => ({ default: module.Documentation })));
const McpReference = React.lazy(() => import("./product-docs.js").then(module => ({ default: module.McpReference })));
const ChromeExtensionPage = React.lazy(() => import("./chrome-extension-page.js").then(module => ({ default: module.ChromeExtensionPage })));
const RemoteMcpGuide = React.lazy(() => import("./remote-mcp-guide.js").then(module => ({ default: module.RemoteMcpGuide })));
const UseCaseCatalog = React.lazy(() => import("./use-cases.js").then(module => ({ default: module.UseCaseCatalog })));
const UseCaseDetail = React.lazy(() => import("./use-cases.js").then(module => ({ default: module.UseCaseDetail })));

const LongRunningWorkDocs = React.lazy(() => import("./long-running-docs.js").then((module) => ({ default: module.LongRunningWorkDocs })));

type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  plan: "free" | "plus";
  isAdmin: boolean;
};

type DeviceTaskPermissions = { background_tasks: boolean; scheduled_tasks: boolean; adaptive_agent: boolean; source_agent: boolean; keep_awake: boolean };
const legacyTaskPermissions: DeviceTaskPermissions = { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: false, keep_awake: false };

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
  background_agent_available?: boolean;
  background_recovery_available?: boolean;
  stop_agent_available?: boolean;
  pause_agent_available?: boolean;
  execution_paused?: boolean;
  background_guard_active?: boolean;
  background_guard_pid?: number | null;
  execution_mode?: string | null;
  background_enabled?: boolean | null;
  background_service?: string | null;
  recovery_bundle_version?: string | null;
  background_seen_at?: string | null;
  background_active?: boolean;
  background_pid?: number | null;
  background_agent_version?: string | null;
  background_connected_at?: string | null;
  agent_version?: string | null;
  agent_pid?: number | null;
  connected_at?: string | null;
  automation_permissions?: DeviceTaskPermissions;
  keep_awake_available?: boolean;
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

type DeviceExecutionLog = {
  source: "local-device";
  lines: string[];
  total_bytes: number;
  truncated: boolean;
  updated_at: string | null;
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
  request_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  grant_id?: string | null;
  outcome?: string | null;
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
  entitlements: {
    plan: "free" | "plus";
    features: string[];
  };
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

type AutomationKind = "long_task" | "condition_watch" | "schedule_watch" | "goal_loop";
type AutomationCreateKind = AutomationKind | "agent_goal";
type AgentGoalTool = "list_directory" | "read_file" | "read_binary_file" | "get_file_info" | "write_file" | "edit_block" | "start_process";
type AutomationStatus =
  | "waiting" | "running" | "waiting_for_device" | "waiting_for_event"
  | "paused" | "completed" | "failed"
  | "cancelled" | "expired";

type Automation = {
  id: string;
  user_id: string;
  name: string;
  kind: AutomationKind;
  status: AutomationStatus;
  device_id: string | null;
  trigger_json: string | null;
  action_json: string;
  goal_json: string | null;
  state_json: string | null;
  interval_seconds: number;
  next_run_at: string | null;
  expires_at: string | null;
  max_runs: number;
  run_count: number;
  run_started_count?: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationDraft = {
  name: string;
  kind: AutomationCreateKind;
  trigger_mode: "now" | "at" | "interval" | "event";
  command_confirmed: boolean;
  device_id: string;
  command: string;
  cwd: string;
  goal_command: string;
  agent_objective: string;
  agent_success_criteria: string;
  agent_workspace: string;
  agent_controller: "hosted" | "source";
  agent_start_at: string;
  agent_repeat_minutes: string;
  keep_awake: boolean;
  agent_verify_command: string;
  agent_max_iterations: string;
  agent_allowed_tools: AgentGoalTool[];
  interval_minutes: string;
  schedule_minutes: string;
  max_runs: string;
  condition_source: "github" | "generic";
  condition_event: string;
  condition_match: string;
  condition_action: "device_command" | "github_merge";
  github_owner: string;
  github_repo: string;
  github_pr: string;
  github_merge_method: "merge" | "squash" | "rebase";
};

type DashboardTab = "overview" | "devices" | "automations" | "connect" | "security" | "monitor" | "settings";

const MARKETING_ORIGIN = "https://remotearc.app";
const APP_ORIGIN = "https://mcp.remotearc.app";
const MCP_ENDPOINT = APP_ORIGIN + "/mcp";
const dashboardHref = (path: string) => UI_PREVIEW ? path : APP_ORIGIN + path;
installUiPreviewFetchMock(MCP_ENDPOINT);
const CHATGPT_PLUGIN_DIRECTORY_URL = "https://chatgpt.com/plugins?q=Remote%20Arc";
const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

function cursorMcpInstallUrl() {
  const config = window.btoa(JSON.stringify({ url: MCP_ENDPOINT }));
  return "cursor://anysphere.cursor-deeplink/mcp/install?name=remote-arc&config=" + encodeURIComponent(config);
}
const DASHBOARD_PATHS: Record<DashboardTab, string> = {
  overview: "/overview",
  devices: "/devices",
  automations: "/automations",
  connect: "/connect",
  security: "/security",
  monitor: "/monitor",
  settings: "/settings",
};
const dashboardTabFromPath = (pathname: string): DashboardTab =>
  (Object.entries(DASHBOARD_PATHS).find(([, path]) => path === pathname)?.[0] as DashboardTab | undefined) || "overview";

const DEVICE_TOOL_CATALOG = [
  "read_file",
  "read_binary_file",
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
  "read_binary_file",
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

function DashboardNavIcon({ tab }: { tab: DashboardTab }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (tab === "overview") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (tab === "devices") return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
  if (tab === "automations") return <svg {...common}><path d="M4 12a8 8 0 0 1 14.6-4.5"/><path d="M18 3v5h-5"/><path d="M20 12a8 8 0 0 1-14.6 4.5"/><path d="M6 21v-5h5"/></svg>;
  if (tab === "connect") return <svg {...common}><path d="M8.5 12.5 12 9l3.5 3.5"/><path d="M12 9v9"/><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2h5A4.5 4.5 0 0 1 19 6.5"/></svg>;
  if (tab === "security") return <svg {...common}><path d="M12 3 5 6v5c0 4.7 2.7 7.8 7 10 4.3-2.2 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (tab === "monitor") return <svg {...common}><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03H5v-3h.44A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88L6.6 8l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.69 4.7V4h3v.7a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.78 8l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.94 11H21v3h-.06A1.7 1.7 0 0 0 19.4 15Z"/></svg>;
}

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
              <a href="/chrome-extension">
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
              <a href="/releases">
                <strong>{tr("Releases", "版本发布")}</strong>
                <small>{tr("What's new in Remote Arc", "查看 Remote Arc 的版本更新")}</small>
              </a>
            </div>
          </div>
        </nav>
        <div className="publicNavActions">
          <LanguageSwitcher compact syncUrl dropdown />
          <ThemeSwitcher compact />
          {user ? (
            <a className="navDashboard" href={dashboardHref("/overview")}>{tr("Dashboard", "控制台")} <span>↗</span></a>
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => { if (resetTimer.current !== null) window.clearTimeout(resetTimer.current); }, []);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2400);
  }
  return (
    <button type="button" className="ghostButton" onClick={() => void copy()} title={copyState === "failed" ? tr("Clipboard access was blocked. Select and copy the text manually.", "剪贴板访问被阻止，请选中文字手动复制。") : undefined}>
      {copyState === "copied" ? tr("Copied", "已复制") : copyState === "failed" ? tr("Copy manually", "手动复制") : label || tr("Copy", "复制")}
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
  const [busy, setBusy] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [approvedDeviceId, setApprovedDeviceId] = useState("");
  const [pairedDevice, setPairedDevice] = useState<Device | null>(null);
  const [setupStep, setSetupStep] = useState<"permissions" | "workspace" | "done">("permissions");
  const [directoryBrowser, setDirectoryBrowser] = useState<DirectoryBrowser | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<"file-editing" | "terminal" | null>(null);
  const [setupError, setSetupError] = useState("");
  const [terminalConfirm, setTerminalConfirm] = useState(false);
  const [backgroundRequested, setBackgroundRequested] = useState(true);

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

  useEffect(() => {
    if (
      pairedDevice?.status === "online" &&
      pairedDevice.background_agent_available !== true &&
      pairedDevice.background_enabled !== true
    ) {
      setBackgroundRequested(false);
    }
  }, [
    pairedDevice?.status,
    pairedDevice?.background_agent_available,
    pairedDevice?.background_enabled,
  ]);

  useEffect(() => {
    if (!approvedDeviceId || setupStep === "done") return;
    let cancelled = false;
    let timer: number | undefined;

    const refreshPairedDevice = async () => {
      try {
        const response = await fetch("/api/devices");
        if (!response.ok) return;
        const devices = (await response.json()) as Device[];
        const device = devices.find((item) => item.id === approvedDeviceId) || null;
        if (!cancelled && device) {
          setPairedDevice(device);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => void refreshPairedDevice(), 1400);
        }
      }
    };

    void refreshPairedDevice();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [approvedDeviceId, setupStep]);

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
      const payload = (await response.json()) as {
        error?: string;
        device?: { id: string; name: string; platform: string; arch: string | null };
      };
      if (!response.ok || !payload.device?.id) {
        throw new Error(payload.error || tr("Could not approve device", "设备授权失败"));
      }
      setApprovedDeviceId(payload.device.id);
      setDirectoryBrowser(null);
      setWorkspacePathInput("");
      setPendingWorkspaceAction(null);
      setSetupError("");
      setTerminalConfirm(false);
      setPairedDevice({
        id: payload.device.id,
        name: payload.device.name,
        platform: payload.device.platform,
        arch: payload.device.arch,
        hostname: pairing.hostname,
        created_at: new Date().toISOString(),
        last_seen: null,
        status: "offline",
        tools: [],
        available_tools: [],
        allowed_tools: [...SAFE_DEVICE_TOOLS],
        workspace_roots: [],
        sensitive_paths: [],
        sensitive_allow_paths: [],
        protect_sensitive_paths: true,
        undo_enabled: true,
        background_agent_available: false,
        background_enabled: null,
        background_service: null,
      });
      setSetupStep("permissions");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function browseWorkspace(path = "~") {
    if (!approvedDeviceId) return;
    setDirectoryLoading(true);
    setSetupError("");
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(approvedDeviceId) +
          "/directories?path=" +
          encodeURIComponent(path),
      );
      const payload = (await response.json().catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        throw new Error(
          payload.error ||
            tr("Directory browsing is unavailable until the device is online.", "设备上线后才能浏览目录。"),
        );
      }
      setDirectoryBrowser(payload.browser);
      setWorkspacePathInput(payload.browser.path);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function openWorkspacePicker(nextAction: "file-editing" | "terminal" | null = null) {
    setPendingWorkspaceAction(nextAction);
    setSetupError("");
    setSetupStep("workspace");
    if (!directoryBrowser) await browseWorkspace("~");
  }

  async function saveTools(nextTools: readonly string[]) {
    if (!approvedDeviceId) return false;
    const available = pairedDevice?.available_tools || pairedDevice?.tools || [];
    const supported =
      available.length > 0
        ? nextTools.filter((tool) => available.includes(tool))
        : [...nextTools];

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/tools",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowed_tools: supported }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || tr("Could not save device permissions.", "无法保存设备权限。"));
    }
    setPairedDevice((current) =>
      current ? { ...current, allowed_tools: supported } : current,
    );
    return true;
  }

  async function enableFileEditing() {
    if (!approvedDeviceId) return;
    if (!(pairedDevice?.workspace_roots || []).length) {
      await openWorkspacePicker("file-editing");
      return;
    }
    setBusy(true);
    setSetupError("");
    try {
      const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
      await saveTools([
        ...current,
        "write_file",
        "edit_block",
        "undo_last_change",
      ]);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyWorkspaceScope() {
    if (!approvedDeviceId) return;
    const requestedPath = workspacePathInput.trim() || directoryBrowser?.path || "";
    if (!requestedPath) {
      setSetupError(tr("Choose a folder first.", "请先选择一个目录。"));
      return;
    }

    setBusy(true);
    setSetupError("");
    try {
      const browseResponse = await fetch(
        "/api/devices/" +
          encodeURIComponent(approvedDeviceId) +
          "/directories?path=" +
          encodeURIComponent(requestedPath),
      );
      const browsePayload = (await browseResponse.json().catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!browseResponse.ok || !browsePayload.browser) {
        throw new Error(
          browsePayload.error ||
            tr("That folder is not available on this computer.", "这台电脑上无法使用该目录。"),
        );
      }

      const selectedPath = browsePayload.browser.path;
      setDirectoryBrowser(browsePayload.browser);
      setWorkspacePathInput(selectedPath);

      const policyResponse = await fetch(
        "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/policy",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_roots: [selectedPath],
            sensitive_paths: pairedDevice?.sensitive_paths || [],
            sensitive_allow_paths: pairedDevice?.sensitive_allow_paths || [],
            protect_sensitive_paths: pairedDevice?.protect_sensitive_paths ?? true,
            undo_enabled: pairedDevice?.undo_enabled ?? true,
          }),
        },
      );
      if (!policyResponse.ok) {
        const payload = (await policyResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || tr("Could not save Trusted Write Locations.", "无法保存可信写入区域。"));
      }

      const nextAction = pendingWorkspaceAction;
      setPairedDevice((current) =>
        current ? { ...current, workspace_roots: [selectedPath] } : current,
      );
      setPendingWorkspaceAction(null);

      if (nextAction === "file-editing") {
        const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
        await saveTools([
          ...current,
          "write_file",
          "edit_block",
          "undo_last_change",
        ]);
      } else if (nextAction === "terminal") {
        const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
        await saveTools([...current, "start_process"]);
        setTerminalConfirm(false);
      }

      setSetupStep("permissions");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function enableTerminal() {
    if (!(pairedDevice?.workspace_roots || []).length) {
      setTerminalConfirm(false);
      await openWorkspacePicker("terminal");
      return;
    }
    setBusy(true);
    setSetupError("");
    try {
      const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
      await saveTools([...current, "start_process"]);
      setTerminalConfirm(false);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!approvedDeviceId) return;
    if (pairedDevice?.status !== "online") {
      setSetupError(
        tr(
          "Wait for the local Remote Arc agent to connect before finishing setup.",
          "请等待本机 Remote Arc Agent 连接后再完成设置。",
        ),
      );
      return;
    }

    if (backgroundRequested && pairedDevice.background_agent_available !== true) {
      setSetupError(tr(
        "Automatic recovery is not available on this client yet. Turn it off to finish setup now, or update remotelink first.",
        "当前客户端还不支持自动恢复。你可以先关闭此选项完成设置，或先更新 remotelink。",
      ));
      return;
    }

    if (backgroundRequested && !pairedDevice.background_recovery_available) {
      setSetupError(tr("This older client exits its terminal when enabling background mode. Update to the recovery-capable CLI, or turn this option off to finish setup with the current session.", "当前旧版客户端启用后台模式会退出终端。请更新为支持恢复的 CLI，或关闭此选项，以当前会话完成设置。"));
      return;
    }
    if (!backgroundRequested && !backgroundActuallyEnabled) {
      setSetupError("");
      setSetupStep("done");
      return;
    }

    setBusy(true);
    setSetupError("");
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/background",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: backgroundRequested }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
        status?: {
          enabled?: boolean;
          active?: boolean;
          service?: string;
          detail?: string;
        };
      };
      if (!response.ok) {
        throw new Error(
          payload.error ||
            tr(
              "Could not apply the background connection setting.",
              "无法应用后台连接设置。",
            ),
        );
      }

      const actualEnabled =
        payload.enabled === true || payload.status?.enabled === true;
      if (backgroundRequested && !actualEnabled) {
        throw new Error(
          payload.status?.detail ||
            tr(
              "Background service could not be installed. This terminal session is still connected.",
              "后台服务安装失败，当前终端会话仍保持连接。",
            ),
        );
      }

      setPairedDevice((current) =>
        current
          ? {
              ...current,
              background_enabled: actualEnabled,
              background_service:
                payload.status?.service || current.background_service || null,
              background_seen_at: new Date().toISOString(),
            }
          : current,
      );
      setSetupStep("done");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const availableTools = pairedDevice?.available_tools || pairedDevice?.tools || [];
  const fileEditingSupported =
    pairedDevice?.status === "online" &&
    ["write_file", "edit_block", "undo_last_change"].every((tool) =>
      availableTools.includes(tool),
    );
  const terminalSupported =
    pairedDevice?.status === "online" && availableTools.includes("start_process");
  const enabledTools = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
  const fileEditingEnabled =
    enabledTools.includes("write_file") &&
    enabledTools.includes("edit_block") &&
    enabledTools.includes("undo_last_change");
  const terminalEnabled = enabledTools.includes("start_process");
  const backgroundCapabilityReady =
    pairedDevice?.status === "online" &&
    pairedDevice.background_agent_available === true;
  const backgroundActuallyEnabled = pairedDevice?.background_enabled === true;

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

  if (approvedDeviceId && setupStep === "done") {
    const copyEndpoint = () => {
      void navigator.clipboard?.writeText(MCP_ENDPOINT).catch(() => undefined);
    };
    const agentTargets = [
      {
        id: "chatgpt",
        name: "ChatGPT",
        icon: "/ai-openai.svg",
        href: CHATGPT_PLUGIN_DIRECTORY_URL,
        detail: tr("Find Remote Arc in the Plugin Directory", "在 Plugin Directory 中找到 Remote Arc"),
        action: tr("Open Plugins", "打开 Plugins"),
        copyEndpoint: false,
      },
      {
        id: "claude",
        name: "Claude",
        icon: "/ai-claude.svg",
        href: CLAUDE_CONNECTORS_URL,
        detail: tr("Remote MCP endpoint will be copied for you", "会自动复制 Remote MCP 地址"),
        action: tr("Open Connectors", "打开 Connectors"),
        copyEndpoint: true,
      },
      {
        id: "cursor",
        name: "Cursor",
        icon: "/ai-cursor.svg",
        href: cursorMcpInstallUrl(),
        detail: tr("One-click MCP install, then complete OAuth", "一键添加 MCP，然后完成 OAuth"),
        action: tr("Add to Cursor", "添加到 Cursor"),
        copyEndpoint: false,
      },
      {
        id: "other",
        name: tr("Other MCP", "其他 MCP"),
        icon: "",
        href: MARKETING_ORIGIN + "/docs/mcp",
        detail: tr("Copy the endpoint and use your client's MCP setup", "复制 Endpoint，并在客户端的 MCP 设置中添加"),
        action: tr("Copy & open docs", "复制并打开文档"),
        copyEndpoint: true,
      },
    ];

    return (
      <CenteredCard
        title={tr("Computer ready", "电脑已就绪")}
        body={tr(
          "Setup is complete and this computer is ready to use. Connecting an AI is optional here; if you already connected one, you can go straight to Dashboard.",
          "设置已经完成，这台电脑现在可以使用。这里连接 AI 是可选的；如果你已经连接过 AI，可以直接进入 Dashboard。",
        )}
      >
        <div className="successMark">✓</div>
        <div className="pairSetupSummary">
          <div>
            <span>{tr("Background connection", "后台连接")}</span>
            <strong>
              {backgroundActuallyEnabled
                ? tr("Enabled", "已开启")
                : tr("Foreground only", "仅前台运行")}
            </strong>
          </div>
          <div><span>{tr("Read access", "读取权限")}</span><strong>{tr("Enabled", "已开启")}</strong></div>
          <div><span>{tr("File editing", "文件编辑")}</span><strong>{fileEditingEnabled ? tr("Enabled", "已开启") : tr("Off", "未开启")}</strong></div>
          <div><span>{tr("Terminal", "终端")}</span><strong>{terminalEnabled ? tr("Enabled", "已开启") : tr("Off", "未开启")}</strong></div>
        </div>

        <section className="pairAgentConnect">
          <div className="pairAgentConnectIntro">
            <span className="eyebrow">{tr("OPTIONAL NEXT STEP · CONNECT AN AI", "可选下一步 · 连接 AI")}</span>
            <h3>{tr("Use this computer from the AI you already work with.", "从你正在使用的 AI 里操作这台电脑。")}</h3>
            <p>{tr(
              "Device setup is already finished. Choose a connector only if you still need to connect an AI client; you can also do this later from Dashboard → Connect AI.",
              "设备设置已经完成。只有在你还需要连接 AI 客户端时才选择下面的连接方式；之后也可以随时从 Dashboard → Connect AI 完成。",
            )}</p>
          </div>

          <div className="pairAgentGrid">
            {agentTargets.map((agent) => (
              <a
                className="pairAgentOption"
                href={agent.href}
                key={agent.id}
                target="_blank"
                rel="noreferrer"
                onClick={agent.copyEndpoint ? copyEndpoint : undefined}
              >
                {agent.icon ? (
                  <img
                    src={agent.icon}
                    alt=""
                    className={agent.id === "chatgpt" ? "pairChatGptLogo" : undefined}
                  />
                ) : (
                  <span className="pairMcpIcon">MCP</span>
                )}
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.detail}</small>
                </div>
                <b>{agent.action} →</b>
              </a>
            ))}
          </div>

          <div className="pairAgentEndpoint">
            <span>{tr("Remote MCP endpoint", "Remote MCP 地址")}</span>
            <code>{MCP_ENDPOINT}</code>
            <CopyButton value={MCP_ENDPOINT} />
          </div>
        </section>

        <div className="pairDoneSecondary">
          <a href="/devices" className="pairDonePrimary">{tr("Open Dashboard", "进入 Dashboard")} →</a>
          <a href="/connect">{tr("Connect an AI later", "之后再连接 AI")} →</a>
        </div>
      </CenteredCard>
    );
  }

  if (approvedDeviceId && setupStep === "workspace") {
    return (
      <CenteredCard
        title={tr("Choose where AI may work", "选择 AI 可以工作的目录")}
        body={pendingWorkspaceAction === "terminal"
          ? tr(
              "Terminal access needs a Trusted Write Location before it can be enabled. Choose a folder on this runtime. Terminal commands still run as your local OS user and are not confined to this folder by an OS sandbox.",
              "开启终端前需要先设置可信写入区域。请选择这个运行环境上的目录。终端命令仍以本机用户身份执行，并不会被操作系统沙箱限制在这个目录内。",
            )
          : tr(
              "Choose a folder where Remote Arc may create or edit files. You can browse this computer or enter any folder path that this runtime can access.",
              "选择一个允许 Remote Arc 创建或编辑文件的目录。你可以浏览这台电脑，也可以直接输入这个运行环境能够访问的任意目录路径。",
            )}
      >
        <div className="pairWorkspaceManual">
          <label htmlFor="pair-workspace-path">{tr("Folder path", "目录路径")}</label>
          <div>
            <input
              id="pair-workspace-path"
              value={workspacePathInput}
              onChange={(event) => setWorkspacePathInput(event.target.value)}
              placeholder={tr("Enter a folder path on this computer", "输入这台电脑上的目录路径")}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="ghostButton"
              disabled={!workspacePathInput.trim() || directoryLoading || busy}
              onClick={() => void browseWorkspace(workspacePathInput.trim())}
            >
              {directoryLoading ? tr("Opening…", "正在打开…") : tr("Browse", "浏览")}
            </button>
          </div>
          <small>{tr(
            "Paths are interpreted by this runtime, so Windows, macOS, Linux and WSL can each use their native filesystem paths.",
            "路径由当前运行环境解释，因此 Windows、macOS、Linux 和 WSL 都可以使用各自原生的文件系统路径。",
          )}</small>
        </div>

        <div className="pairWorkspacePath">
          <code>{directoryBrowser?.path || tr("Waiting for device…", "等待设备上线…")}</code>
          {directoryBrowser?.parent && (
            <button className="ghostButton small" onClick={() => void browseWorkspace(directoryBrowser.parent!)}>
              ↑ {tr("Parent", "上一级")}
            </button>
          )}
        </div>

        <div className="pairWorkspaceList">
          {directoryLoading && <div className="pairSetupEmpty">{tr("Loading folders…", "正在加载目录…")}</div>}
          {!directoryLoading && directoryBrowser?.directories.map((entry) => (
            <button key={entry.path} onClick={() => void browseWorkspace(entry.path)}>
              <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
              <strong>{entry.name}</strong>
              <small>›</small>
            </button>
          ))}
          {!directoryLoading && directoryBrowser && !directoryBrowser.directories.length && (
            <div className="pairSetupEmpty">{tr("No visible child folders.", "没有可见的子目录。")}</div>
          )}
        </div>

        {directoryBrowser && directoryBrowser.protected_entries_omitted > 0 && (
          <p className="pairSetupNote">{tr(
            directoryBrowser.protected_entries_omitted + " protected folder(s) are hidden.",
            "有 " + directoryBrowser.protected_entries_omitted + " 个受保护目录已隐藏。",
          )}</p>
        )}
        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupActions">
          <button className="ghostButton" onClick={() => {
            setPendingWorkspaceAction(null);
            setSetupError("");
            setSetupStep("permissions");
          }}>
            {tr("Back", "返回")}
          </button>
          <button
            className="primaryButton"
            disabled={!workspacePathInput.trim() || directoryLoading || busy}
            onClick={() => void applyWorkspaceScope()}
          >
            {busy
              ? tr("Saving…", "正在保存…")
              : pendingWorkspaceAction
                ? tr("Use folder & continue", "使用此目录并继续")
                : tr("Use this folder", "使用此目录")}
          </button>
        </div>
      </CenteredCard>
    );
  }

  if (approvedDeviceId) {
    return (
      <CenteredCard
        title={tr("Choose what AI can do", "选择 AI 可以做什么")}
        body={tr(
          "Your computer is paired. Start with the safe default, then opt in to file editing or terminal execution when you need them.",
          "电脑已经配对。默认从安全的只读权限开始，需要时再主动开启文件编辑或终端执行。",
        )}
      >
        <div className="pairConnectedDevice">
          <div className="deviceIcon large">{platformGlyph(pairedDevice?.platform)}</div>
          <div>
            <strong>{pairedDevice?.name || pairing?.device_name}</strong>
            <span>
              {pairedDevice?.status === "online"
                ? tr("Connected and ready", "已连接，可以使用")
                : tr("Waiting for the local agent to connect…", "正在等待本地 Agent 连接…")}
            </span>
          </div>
          <i className={"pairStatusDot " + (pairedDevice?.status === "online" ? "online" : "")} />
        </div>

        <div className="pairPermissionStack">
          <section className={"pairPermissionCard " + (backgroundActuallyEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">↻</span>
                <div>
                  <div className="labelWithHelp">
                    <strong>{tr("Automatic recovery", "自动恢复")}</strong>
                    <HelpTip
                      label={tr("How automatic recovery works", "自动恢复如何工作")}
                      text={tr(
                        "An updated client keeps this terminal and logs open. A local supervisor waits to take over if the executing Agent ends, and starts at login. Relay reconnect handles network interruptions independently. Sleep and power loss still make the device unavailable.",
                        "更新后的客户端会保留当前终端和日志。本机守护在执行 Agent 结束后接手，并可在登录时启动。网络中断由独立的 Relay 重连处理；睡眠和断电仍会让设备不可用。",
                      )}
                    />
                  </div>
                  <small>
                    {backgroundActuallyEnabled
                      ? tr("Installed locally", "本机已安装")
                      : backgroundRequested
                        ? tr("Recommended · selected by default", "推荐 · 默认选中")
                        : tr("Foreground only", "仅前台运行")}
                  </small>
                </div>
              </div>
              <label className="compactSwitch">
                <input
                  type="checkbox"
                  checked={backgroundRequested}
                  disabled={!backgroundCapabilityReady || busy}
                  onChange={(event) => setBackgroundRequested(event.target.checked)}
                />
                <span />
              </label>
            </div>
            <p>
              {backgroundRequested
                ? tr(
                    "Finish setup to enable a verified local supervisor and login startup while keeping this terminal open. Requires the recovery-capable CLI.",
                    "完成设置后启用经过确认的本机守护和登录自启，并保留当前终端。需要支持恢复的 CLI。",
                  )
                : tr(
                    "No login autostart will be installed. Keep this terminal session open while you want the computer reachable.",
                    "不会安装登录自启。需要电脑保持可连接时，请保持当前终端会话运行。",
                  )}
            </p>
            {!backgroundCapabilityReady && (
              <small className="pairSetupNote">
                {tr(
                  "Waiting for the local agent before this choice can be applied.",
                  "正在等待本机 Agent 上线，上线后才能应用此选项。",
                )}
              </small>
            )}
          </section>
          <section className="pairPermissionCard enabled">
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">R</span>
                <div>
                  <strong>{tr("Read access", "读取权限")}</strong>
                  <small>{tr("Safe default", "安全默认")}</small>
                </div>
              </div>
              <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>
            </div>
            <ul>
              <li>{tr("Browse files and folders", "浏览文件和目录")}</li>
              <li>{tr("Read file contents and metadata", "读取文件内容与元数据")}</li>
              <li>{tr("View running processes", "查看运行中的进程")}</li>
            </ul>
          </section>

          <section className={"pairPermissionCard " + (fileEditingEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">✎</span>
                <div>
                  <strong>{tr("File editing", "文件编辑")}</strong>
                  <small>{tr("Recommended for coding, documents and data", "推荐用于开发、文档和数据任务")}</small>
                </div>
              </div>
              {fileEditingEnabled && <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>}
            </div>
            <p>{tr(
              "Create and edit files with Sensitive Path Protection and Local Undo. Trusted Write Locations define where edits can happen without a per-request approval.",
              "开启文件创建与编辑，并继续使用 Sensitive Path Protection 和 Local Undo。可信写入区域决定哪些目录可以无需逐次审批地修改。",
            )}</p>
            {!fileEditingEnabled ? (
              <button
                className="primaryButton"
                disabled={!fileEditingSupported || busy}
                onClick={() => void enableFileEditing()}
              >
                {fileEditingSupported
                  ? (busy ? tr("Enabling…", "正在开启…") : tr("Enable file editing", "开启文件编辑"))
                  : tr("Waiting for device capability…", "等待设备能力上线…")}
              </button>
            ) : (
              <div className="pairWorkspaceControl">
                <div>
                  <span>{tr("Trusted Write Locations", "Trusted Write Locations")}</span>
                  <code>
                    {pairedDevice?.workspace_roots?.[0] ||
                      tr("All non-sensitive paths", "所有非敏感路径")}
                  </code>
                </div>
                <button className="ghostButton" onClick={() => void openWorkspacePicker()}>
                  {pairedDevice?.workspace_roots?.length
                    ? tr("Change workspace", "更改工作区")
                    : tr("Limit to a workspace", "限制到工作区")}
                </button>
              </div>
            )}
          </section>

          <section className={"pairPermissionCard terminal " + (terminalEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">›_</span>
                <div>
                  <strong>{tr("Terminal access", "终端权限")}</strong>
                  <small>{tr("Advanced", "高级功能")}</small>
                </div>
              </div>
              {terminalEnabled && <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>}
            </div>
            <p>{tr(
              "Allow AI to run shell commands. Commands can modify local state or external services, and Trusted Write Locations is not a complete OS sandbox.",
              "允许 AI 执行 Shell 命令。命令可能修改本地状态或外部服务，Trusted Write Locations 也不是完整的操作系统沙箱。",
            )}</p>
            {!terminalEnabled && !terminalConfirm && (
              <button
                className="ghostButton"
                disabled={!terminalSupported}
                onClick={() => setTerminalConfirm(true)}
              >
                {tr("Enable terminal access", "开启终端权限")}
              </button>
            )}
            {!terminalEnabled && terminalConfirm && (
              <div className="pairTerminalConfirm">
                <span>{tr("Terminal commands can have effects that Local Undo cannot reverse.", "终端命令可能产生 Local Undo 无法撤销的影响。")}</span>
                <div>
                  <button className="ghostButton" onClick={() => setTerminalConfirm(false)}>{tr("Cancel", "取消")}</button>
                  <button className="dangerConfirmButton" disabled={busy} onClick={() => void enableTerminal()}>
                    {busy ? tr("Enabling…", "正在开启…") : tr("Confirm terminal access", "确认开启终端")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupFooter">
          <span>{tr("You can change every permission later from Devices.", "之后可以在设备页随时修改所有权限。")}</span>
          <button
            className="primaryButton"
            disabled={pairedDevice?.status !== "online" || busy}
            onClick={() => void finishSetup()}
          >
            {busy
              ? tr("Saving setup…", "正在保存设置…")
              : tr("Finish setup", "完成设置")}
          </button>
        </div>
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
              <strong>{tr("Read-only access", "只读权限")}</strong>
              <span>{tr("Files, folders, metadata and process visibility", "文件、目录、元数据与进程可见性")}</span>
            </div>
            <span className="permissionBadge">{tr("Safe default", "安全默认")}</span>
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
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const params = new URLSearchParams(location.search);
  const scopes = (params.get("scope") || "").split(/\s+/).filter(Boolean);
  const clientId = params.get("client_id") || "MCP client";

  async function continueAuthorization(mode: "allow" | "deny") {
    if (decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError("");
    try {
      const body = Object.fromEntries(params.entries());
      delete body.approved;
      delete body.denied;
      const response = await fetch("/oauth/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, decision: mode }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        redirect_to?: string;
        error?: string;
      };
      if (!response.ok || !payload.redirect_to) {
        throw new Error(payload.error || tr("Authorization failed.", "授权失败。"));
      }
      location.assign(payload.redirect_to);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : String(error));
      setDecisionBusy(false);
    }
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
                      : scope === "computer:write"
                        ? tr("Edit files and run commands on devices that allow it.", "在允许的设备上编辑文件并运行命令。")
                        : scope === "offline_access"
                          ? tr("Keep the connection signed in via refresh tokens. Device permissions remain in control.", "使用刷新令牌保持登录状态，设备权限仍独立生效。")
                        : scope === "browser:read"
                          ? tr("Read content from browser tabs you explicitly share.", "读取你明确共享的浏览器标签页内容。")
                          : scope === "browser:interact"
                            ? tr("Click or fill non-sensitive controls only on shared tabs where you separately enable interaction.", "仅在你对已共享标签页单独开启交互后，点击或填写非敏感控件。")
                            : scope === "automation:read"
                            ? tr("View persistent tasks, watches and their run state.", "查看持久任务、监听及其运行状态。")
                            : scope === "automation:write"
                              ? tr("Create and manage persistent tasks that can continue after this chat ends.", "创建和管理可在当前聊天结束后继续运行的持久任务。")
                              : tr("Allow durable Agent Goals to inspect results, re-plan and choose new approved actions over time.", "允许 Durable Agent Goal 持续读取结果、重新规划，并在已授权范围内选择新的后续动作。")}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="consentNotice">
          {tr("Local permission modes still apply. OAuth cannot enable a tool that the device did not advertise.", "本机权限模式始终生效。OAuth 无法启用设备未开放的工具。")}
        </div>
        {decisionError && <p className="errorText">{decisionError}</p>}
        <div className="consentActions">
          <button className="ghostButton" disabled={decisionBusy} onClick={() => void continueAuthorization("deny")}>{tr("Deny", "拒绝")}</button>
          <button className="approveButton" disabled={decisionBusy} onClick={() => void continueAuthorization("allow")}>{decisionBusy ? tr("Authorizing…", "正在授权…") : tr("Allow access", "允许访问")}</button>
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
  const { tr } = useI18n();
  return (
    <main className="landing publicPage">
      <PublicHeader user={user} />
      {children}
      <footer className="publicFooter">
        <Brand compact />
        <nav className="publicFooterLinks" aria-label={tr("Remote Arc guides", "Remote Arc 使用指南")}>
          <a href="/remote-mcp">{tr("Remote MCP guide", "Remote MCP 指南")}</a>
          <a href="/chatgpt-computer-access">ChatGPT</a>
          <a href="/claude-computer-access">Claude</a>
          <a href="/docs/mcp">{tr("MCP Docs", "MCP 文档")}</a>
          <a href="/security-model">{tr("Security", "安全")}</a>
        </nav>
        <div className="publicFooterMeta">
          <span>© 2026 Remote Arc · {tr("Proprietary", "专有软件")}</span>
          <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
        </div>
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
      id: "email",
      label: tr("Continue with Email", "使用邮箱继续"),
      href: MARKETING_ORIGIN + "/auth/login?return_to=" + encodeURIComponent(absoluteReturnTo),
      mark: "@",
    },
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
          "Remote Arc is preparing its public ChatGPT Plugin listing. Until it is live, eligible accounts can use the developer-mode MCP connection in Plugins.",
          "Remote Arc 正在准备公开 ChatGPT Plugin 上架。在正式上线前，符合条件的账户仍可通过Plugins 中的开发模式 MCP 连接接入。",
        ),
        externalHref: CHATGPT_PLUGIN_DIRECTORY_URL,
        externalLabel: tr("Open ChatGPT Plugins", "打开 ChatGPT Plugins"),
        steps: [
          {
            title: tr("Pair your computer", "配对你的电脑"),
            body: tr("Run this once on the Windows, macOS or Linux machine you want ChatGPT to reach.", "在你希望 ChatGPT 访问的 Windows、macOS 或 Linux 电脑上运行一次。"),
            code: "npx remotelink",
          },
          {
            title: tr("Connect the Remote Arc Plugin", "连接 Remote Arc Plugin"),
            body: tr(
              "Open ChatGPT Plugins → + → Add custom MCP server (where available), enter the HTTPS endpoint, complete OAuth and install or enable the created plugin. Account and workspace permissions apply.",
              "打开 ChatGPT Plugins → ＋ → Add custom MCP server（若账户支持），填写 HTTPS 地址、完成 OAuth，再安装或启用创建好的插件。具体权限受账户和工作区限制。",
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
          externalHref: CLAUDE_CONNECTORS_URL,
          externalLabel: tr("Open Claude Connectors", "打开 Claude Connectors"),
          steps: [
            {
              title: tr("Pair your computer", "配对你的电脑"),
              body: tr("Install the Remote Arc agent on the computer Claude should reach.", "在 Claude 需要访问的电脑上安装 Remote Arc Agent。"),
              code: "npx remotelink",
            },
            {
              title: tr("Add a custom connector", "添加 Custom Connector"),
              body: tr(
                "In Claude, open Customize → Connectors → + Add → Custom → Web (or Add custom connector). Enter the Remote Arc URL, select OAuth sign-in, then enable the connector in your conversation.",
                "在 Claude 中进入 Customize → Connectors → ＋ Add → Custom → Web，输入 Remote Arc MCP 地址并完成 OAuth，随后在对话中启用连接。",
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
          externalHref: "https://cursor.com/docs/mcp",
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
      <main className="installManual">
        <header className="toolPageHeader installManualHeader">
          <nav className="installClientSwitcher" aria-label={tr("AI client installation", "AI 客户端安装")}>
            {aiClients.map((client) => (
              <a
                className={client.slug === slug ? "active" : ""}
                href={"/install/" + client.slug}
                key={client.slug}
              >
                <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                <span>{client.name}</span>
              </a>
            ))}
          </nav>

          <div className="toolPageTitleRow">
            <div>
              <span className="eyebrow">{tr("INSTALLATION", "安装")}</span>
              <h1>{config.name} {tr("installation", "安装")}</h1>
              <p>{config.intro}</p>
            </div>
            <div className="installPrimaryCommand compactCommand">
              <span>{tr("CONNECT THIS MCP SERVER IN YOUR AI", "在 AI 平台里添加此 MCP 地址")}</span>
              <div className="installHeroCommand">
                <code>{MCP_ENDPOINT}</code>
                <CopyButton value={MCP_ENDPOINT} />
              </div>
              <small>{tr("Remote HTTPS + OAuth · paste into your MCP App / Connector setup", "远程 HTTPS + OAuth · 粘贴至平台的 MCP App / Connector 配置")}</small>
            </div>
          </div>

          <div className="toolPageStatusLine">
            <span><i className="statusDot" />{config.availability}</span>
            <a href={config.externalHref} target="_blank" rel="noreferrer">{config.externalLabel} ↗</a>
          </div>
        </header>

        <div className="installMustDo" aria-label={tr("Both setup steps are required", "安装必须完成两端设置")}>
          <article className="installMustDoCard">
            <span>{tr("REQUIRED 01 · AI CLIENT", "必需 01 · AI 客户端")}</span>
            <h2>{tr("Add the MCP App / Connector", "添加 MCP App / Connector")}</h2>
            <p>{tr("Add Remote Arc in " + config.name + " and finish OAuth. Without this step your AI cannot access the computer.", "在 " + config.name + " 里添加 Remote Arc 并完成 OAuth。缺少这一步，AI 就无法访问电脑。")}</p>
            <a href="#installation-client">{tr("See UI setup steps", "查看平台内点击步骤")} ↗</a>
          </article>
          <article className="installMustDoCard">
            <span>{tr("REQUIRED 02 · LOCAL COMPUTER", "必需 02 · 目标电脑")}</span>
            <h2>{tr("Start and pair the local agent", "启动并配对本地 Agent")}</h2>
            <p>{tr("Run the CLI on the machine you want the AI to use. The MCP connection alone cannot access local files.", "在需要使用的电脑上运行本地命令。只有 MCP 连接仍无法访问本机文件。")}</p>
            <div className="docsCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div>
            <a href="#installation">{tr("Device pairing steps", "查看电脑配对步骤")} ↗</a>
          </article>
        </div>

        <div className="manualLayout">
          <aside className="manualToc">
            <strong>{tr("SETUP", "配置")}</strong>
            <a href="#installation-client">{tr("MCP App / Connector (required)", "MCP App / Connector（必需）")}</a>
            <a href="#installation">{tr("Computer setup (required)", "电脑端配置（必需）")}</a>
            <a href="#installation-example">{tr("Example session", "示例会话")}</a>
            <a href="/connect-ai">{tr("Connect another AI", "连接其他 AI")}</a>
            <a href="/docs">{tr("Documentation", "文档")}</a>
          </aside>

          <article className="manualArticle">
            <ClientMcpGuide client={slug} endpoint={MCP_ENDPOINT}
              cursorInstallUrl={cursorMcpInstallUrl()} copyEndpoint={<CopyButton value={MCP_ENDPOINT} />} />
            <section id="installation">
              <h2>{tr("Setup", "配置")}</h2>
              <p>{tr(
                "The computer and the AI client are authorized separately. Start by pairing the computer, approve it in the browser, then add Remote Arc to the AI client.",
                "电脑与 AI 客户端分别授权。先配对电脑并在浏览器确认，再把 Remote Arc 添加到 AI 客户端。",
              )}</p>

              <ol className="manualSteps">
                <li>
                  <span>1</span>
                  <div>
                    <h3>{tr("Run Remote Arc on the computer", "在电脑上运行 Remote Arc")}</h3>
                    <p>{tr("The CLI creates a short-lived pairing request and opens the browser approval page.", "CLI 会创建一个短期配对请求，并自动打开浏览器确认页面。")}</p>
                    <div className="docsCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div>
                    <p className="installAgentVersionNote">{tr("To explicitly fetch the latest published CLI, run npx --yes remotelink@latest. Previously installed background agents do not upgrade automatically.", "需要明确从 npm 获取最新 CLI 时运行 npx --yes remotelink@latest。之前安装的后台 Agent 不会自动升级。")}</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <h3>{tr("Approve the computer and choose its permissions", "确认电脑并选择权限")}</h3>
                    <p>{tr("Match the short code. Start read-oriented, then add Trusted Write Locations, file editing, terminal access or background connection only where needed.", "核对短码。默认从读取能力开始，只在需要时添加可信写入区域、文件编辑、终端或后台连接。")}</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <h3>{tr("Connect " + config.name, "连接 " + config.name)}</h3>
                    <p>{config.steps[1]?.body}</p>
                    {"code" in (config.steps[1] || {}) && config.steps[1]?.code && (
                      <div className="docsCodeLine">
                        <code>{config.steps[1].code}</code>
                        <CopyButton value={config.steps[1].code} />
                      </div>
                    )}
                  </div>
                </li>
              </ol>

              <div className="manualNote">
                <strong>{tr("Permission boundary", "权限边界")}</strong>
                <p>{tr(
                  "Changing AI clients does not change the device policy. Trusted Write Locations, Sensitive Path Policy, Local Undo and the per-device skill list still apply.",
                  "更换 AI 客户端不会改变设备策略。可信写入区域、Sensitive Path Policy、Local Undo 和逐设备 Skill 列表仍然生效。",
                )}</p>
              </div>
            </section>

            <section id="installation-example">
              <h2>{tr("Example session", "示例会话")}</h2>
              <p>{tr(
                "This is the shape of a normal Remote Arc request after setup: the AI chooses a paired device, calls only the tools allowed for that device, and receives the result in the same conversation.",
                "完成配置后，一次普通 Remote Arc 请求大致如下：AI 选择已配对设备，只调用该设备允许的工具，并在同一对话中收到结果。",
              )}</p>
              <InstallTypewriterDemo config={config.demo} />
            </section>

            <section className="manualFooterLinks">
              <a href="/connect-ai">{tr("Connection reference", "连接参考")} →</a>
              <a href="/docs">{tr("Read the documentation", "阅读文档")} →</a>
              <a href="/security-model">{tr("Security model", "安全模型")} →</a>
            </section>
          </article>
        </div>
      </main>
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
          <span className="eyebrow">{tr("PERSISTENT AGENT RUNTIME", "持久化 AGENT RUNTIME")}</span>
          <HeroHeadline />
          <p>{tr(
            "Give the AI you already use a persistent, permissioned runtime across your own computers. Start work now, save long-running goals, and return in a later chat without losing the execution state.",
            "让你已经在用的 AI 获得跨真实电脑的持久化、可控 Runtime。现在开始工作，保存长任务与目标，换到之后的聊天仍可从已保存的执行状态继续。"
          )}</p>
          <div className="heroPrimaryCommand">
            <span>{tr("START HERE · RUN ON YOUR COMPUTER", "从这里开始 · 在电脑上运行")}</span>
            <div>
              <code>{command}</code>
              <CopyButton value={command} />
            </div>
            <small>{tr("Go Agent · npm, Homebrew or standalone download", "Go Agent · npm、Homebrew 或直接下载")}</small>
          </div>
          <div className="landingActions">
            <a className="primaryButton goldButton" href="/install/chatgpt">{tr("Installation guide", "安装指南")}</a>
            <a className="ghostLink" href="/downloads">{tr("Download Agent", "下载 Agent")}</a>
            <a className="ghostLink" href="#how-it-works">{tr("See how it works →", "看看如何使用 →")}</a>
          </div>
          <div className="heroBadges">
            <span>{tr("Build & test", "开发与测试")}</span>
            <span>{tr("Overnight tasks", "过夜任务")}</span>
            <span>{tr("Scheduled tasks", "定时任务")}</span>
          </div>
          <a className="heroTaskAvailability" href="/docs/long-running-work">{tr("Long-running Tasks · staged preview · see requirements", "长任务准备发布中 · 查看运行条件")} →</a>
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
              <small>{tr("Persistent tasks · device presence · permissions", "持久任务 · 设备在线状态 · 权限控制")}</small>
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

      <LandingContent />
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


function ConnectPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const scopes = [
    ["devices:read", tr("List paired computers and their online state.", "列出已配对电脑及在线状态。")],
    ["computer:read", tr("Read files, directories and process metadata when the selected device allows it.", "在目标设备允许时读取文件、目录和进程元数据。")],
    ["computer:write", tr("Request edit and terminal tools; the selected device policy still decides whether they are available.", "请求编辑和终端工具；最终是否可用仍由目标设备策略决定。")],
    ["browser:read", tr("Read content from browser tabs explicitly shared by the user.", "读取用户明确共享的浏览器标签页内容。")],
    ["browser:interact", tr("Click or fill non-sensitive controls only on shared tabs where the user separately enabled interaction.", "仅在用户对已共享标签页单独开启交互后，点击或填写非敏感控件。")],
    ["automation:read", tr("View persistent tasks, watches and run state.", "查看持久任务、监听与运行状态。")],
    ["automation:write", tr("Create and manage persistent work that can continue after the creating chat ends.", "创建和管理可在原聊天结束后继续运行的持久任务。")],
    ["agent:write", tr("Allow durable Agent Goals to inspect results and adapt their next approved action over time.", "允许 Durable Agent Goal 根据执行结果持续调整后续已授权动作。")],
  ];

  return (
    <PublicLayout user={user}>
      <main className="referenceManual">
        <header className="toolPageHeader">
          <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
          <h1>{tr("Connect an AI client", "连接 AI 客户端")}</h1>
          <p>{tr(
            "Pair the computer once, then authorize ChatGPT, Claude, Cursor or another compatible Remote MCP client. Device pairing and AI authorization are independent.",
            "电脑只需配对一次，之后再授权 ChatGPT、Claude、Cursor 或其他兼容 Remote MCP 的客户端。设备配对与 AI 授权彼此独立。",
          )}</p>
        </header>

        <div className="manualLayout">
          <aside className="manualToc">
            <strong>{tr("CONNECTION", "连接")}</strong>
            <a href="#connect-computer">{tr("Pair computer", "配对电脑")}</a>
            <a href="#connect-policy">{tr("Device policy", "设备策略")}</a>
            <a href="#connect-client">{tr("AI client", "AI 客户端")}</a>
            <a href="#connect-walkthrough">{tr("Video walkthrough", "视频教程")}</a>
            <a href="#connect-scopes">{tr("OAuth scopes", "OAuth Scope")}</a>
          </aside>

          <article className="manualArticle">
            <section id="connect-computer">
              <h2>{tr("1. Pair the computer", "1. 配对电脑")}</h2>
              <p>{tr(
                "Run the CLI on the computer you want the AI to reach. It creates a short-lived pairing request, opens the browser, and stores a revocable device credential locally after approval.",
                "在希望 AI 访问的电脑上运行 CLI。它会创建短期配对请求、自动打开浏览器，并在确认后把可撤销的设备凭证保存在本机。",
              )}</p>
              <div className="docsCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div>
              <p className="manualFinePrint">{tr("No repository clone, VPN, public IP or inbound port is required.", "无需 clone 仓库、VPN、公网 IP 或入站端口。")}</p>
            </section>

            <section id="connect-policy">
              <h2>{tr("2. Choose the device policy", "2. 选择设备策略")}</h2>
              <p>{tr(
                "Safe, Developer and Full are shortcuts over an editable per-device skill list. Reading files does not imply editing; listing processes does not imply shell execution.",
                "Safe、Developer、Full 只是逐设备 Skill 列表的快捷预设。能读文件不代表能编辑，能列进程也不代表能执行 Shell。",
              )}</p>
              <div className="compactReferenceTable">
                <div><strong>Safe</strong><span>{tr("Read files, directories, metadata and processes", "读取文件、目录、元数据和进程")}</span></div>
                <div><strong>Developer</strong><span>{tr("Add editing and Local Undo", "增加编辑与 Local Undo")}</span></div>
                <div><strong>Full</strong><span>{tr("Add terminal and managed processes", "增加终端与受管后台进程")}</span></div>
              </div>
            </section>

            <section id="connect-client">
              <h2>{tr("3. Add Remote Arc to the AI client", "3. 在 AI 客户端中添加 Remote Arc")}</h2>
              <p>{tr("All compatible clients use the same OAuth-protected Remote MCP endpoint.", "所有兼容客户端都使用同一个受 OAuth 保护的 Remote MCP Endpoint。")}</p>
              <div className="docsCodeLine"><code>{MCP_ENDPOINT}</code><CopyButton value={MCP_ENDPOINT} /></div>
              <div className="clientGuideRows compactClientRows">
                {aiClients.map((client) => (
                  <a href={"/install/" + client.slug} key={client.name}>
                    <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                    <div><strong>{client.name}</strong><span>{tr("Setup instructions", "配置说明")}</span></div>
                    <b>→</b>
                  </a>
                ))}
                <a href="/docs/mcp">
                  <span className="miniMcp">M</span>
                  <div><strong>{tr("Other Remote MCP clients", "其他 Remote MCP 客户端")}</strong><span>{tr("Use the endpoint directly", "直接使用 Endpoint")}</span></div>
                  <b>→</b>
                </a>
              </div>
            </section>

            <section id="connect-walkthrough">
              <h2>{tr("See the connection flow", "观看连接流程")}</h2>
              <p>{tr("Follow the recorded product walkthrough, then use your client's setup guide above to complete authorization.", "先观看产品流程演示，再按上方客户端指南完成实际授权。")}</p>
              <ConnectionFilm />
            </section>

            <section id="connect-scopes">
              <h2>{tr("OAuth scopes", "OAuth Scope")}</h2>
              <p>{tr(
                "OAuth scopes describe what an AI client may request from your account. They do not override the policy stored for the selected computer.",
                "OAuth Scope 描述 AI 客户端可以向账户请求什么，但不会覆盖目标电脑保存的设备策略。",
              )}</p>
              <div className="compactReferenceTable scopeReference">
                {scopes.map(([scope, body]) => <div key={scope}><code>{scope}</code><span>{body}</span></div>)}
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}

function DocsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading…", "加载中…")}</main>}><Documentation /></React.Suspense></PublicLayout>;
}

function SecurityModelPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="technicalDoc">
        <header className="articleHeader">
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr("Security and trust model", "安全与信任模型")}</h1>
          <p>{tr(
            "Remote Arc allows an AI client to act on a real computer. The useful question is therefore not whether the system is 'secure' in the abstract, but which component is trusted for which decision, what the hosted service can observe, and how access can be constrained or revoked.",
            "Remote Arc 允许 AI 客户端在真实电脑上执行操作。因此真正有意义的问题不是抽象地问“是否安全”，而是：哪个组件负责哪类信任决策、托管服务能观察到什么，以及访问如何被限制和撤销。",
          )}</p>
          <div className="articleMetaLinks">
            <a href="/docs#docs-policy">{tr("Permission model", "权限模型")} →</a>
            <a href="/docs#docs-data">{tr("Data handling", "数据处理")} →</a>
            <a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md">SECURITY.md ↗</a>
          </div>
        </header>

        <div className="technicalDocLayout">
          <aside className="articleToc">
            <strong>{tr("CONTENTS", "目录")}</strong>
            <a href="#security-threat">{tr("Threat model", "威胁模型")}</a>
            <a href="#security-identity">{tr("Identity", "身份")}</a>
            <a href="#security-device">{tr("Device trust", "设备信任")}</a>
            <a href="#security-paths">{tr("Path confinement", "路径约束")}</a>
            <a href="#security-tools">{tr("Skill policy", "Skill 策略")}</a>
            <a href="#security-transport">{tr("Transport & relay", "传输与 Relay")}</a>
            <a href="#security-recovery">{tr("Recovery", "恢复")}</a>
            <a href="#security-automations">{tr("Persistent tasks", "持久任务")}</a>
            <a href="#security-revoke">{tr("Revocation", "撤销")}</a>
            <a href="#security-nonclaims">{tr("What we do not claim", "我们不声称什么")}</a>
          </aside>

          <article className="technicalArticle">
            <section id="security-threat">
              <h2>{tr("Threat model and assumptions", "威胁模型与假设")}</h2>
              <p>{tr(
                "Remote Arc assumes the paired computer and its operating-system account are under the user's control. It also assumes that granting terminal execution is materially more powerful than granting read-only file or process inspection. The design therefore tries to keep those capabilities separable instead of treating 'computer access' as one permission.",
                "Remote Arc 假设已配对电脑及其操作系统账户处于用户控制之下，同时承认终端执行的能力显著高于只读文件或进程检查。因此设计重点是把这些能力拆开，而不是把“电脑访问”当成一个权限。",
              )}</p>
              <p>{tr(
                "The hosted control plane is trusted to authenticate users and AI clients, store policy, route live requests and enforce server-side revocation. It is not treated as a blind encrypted pipe: the relay processes active tool payloads. The local agent and native execution core remain responsible for what the computer actually exposes and for final filesystem/path checks.",
                "托管控制面被信任来认证用户与 AI 客户端、保存策略、路由实时请求并执行服务端撤销；它不是一个看不到内容的加密管道，因为 Relay 会处理当前 Tool Payload。本地 Agent 与原生执行核心继续负责电脑实际开放什么，以及最终的文件系统/路径检查。",
              )}</p>
            </section>

            <section id="security-identity">
              <h2>{tr("Identity is split between the user, AI client and device", "用户、AI 客户端与设备使用分离身份")}</h2>
              <p>{tr(
                "Dashboard authentication, MCP client authorization and device pairing are separate credentials. AI clients use OAuth 2.1 authorization code flow with PKCE. A paired computer receives its own revocable device credential; the hosted database stores a SHA-256 hash rather than the raw credential.",
                "Dashboard 登录、MCP 客户端授权与设备配对使用分离的凭证。AI 客户端采用 OAuth 2.1 Authorization Code + PKCE。已配对电脑获得独立可撤销的设备凭证；托管数据库保存 SHA-256 Hash，而不是原始凭证。",
              )}</p>
              <p>{tr(
                "This separation is what makes independent revocation possible. Removing an OAuth grant does not invalidate every paired computer, and revoking one computer does not force every AI client to reconnect.",
                "这种分离使独立撤销成为可能：删除一个 OAuth Grant 不会使所有已配对电脑失效，撤销一台电脑也不要求所有 AI 客户端重新连接。",
              )}</p>
            </section>

            <section id="security-device">
              <h2>{tr("The device is the final execution boundary", "设备是最终执行边界")}</h2>
              <p>{tr(
                "The relay can deny a request before routing it, but it cannot make the local agent execute a skill the agent does not expose. The selected device has an allowed-tool list, and the execution core performs the operating-system action only after local policy checks pass.",
                "Relay 可以在路由前拒绝请求，但不能让本地 Agent 执行它没有开放的 Skill。目标设备保存 Allowed Tool 列表，只有本地策略检查通过后，执行核心才会进行真实 OS 操作。",
              )}</p>
              <div className="articleFlow"><code>OAuth scope</code><span>→</span><code>account state</code><span>→</span><code>device skill policy</code><span>→</span><code>local path policy</code><span>→</span><code>OS execution</code></div>
              <p>{tr(
                "The CLI can additionally establish a local --safe ceiling. That ceiling deliberately cannot be expanded by a remote dashboard policy change.",
                "CLI 还可以通过 --safe 建立本机上限；这个上限故意不能被远程 Dashboard 策略扩大。",
              )}</p>
            </section>

            <section id="security-paths">
              <h2>{tr("Filesystem confinement happens below the skill level", "文件系统约束发生在 Skill 之下")}</h2>
              <p>{tr(
                "Read-only tools may inspect ordinary non-sensitive files outside Trusted Write Locations. File mutation outside those locations requires approval. Sensitive Path Policy separately protects credential-bearing paths such as .ssh, .aws, .gnupg, browser profiles and environment files.",
                "只读工具可以查看可信写入区域之外的普通非敏感文件；超出可信写入区域的文件修改需要审批。Sensitive Path Policy 会独立保护 .ssh、.aws、.gnupg、浏览器 Profile 与环境文件等可能包含凭证的位置。",
              )}</p>
              <p>{tr(
                "Existing path ancestors are canonicalized on the device before execution. The goal is to prevent an apparently allowed path from trivially escaping through a symlink. When a protected project genuinely needs one sensitive file or directory, a narrow exception can be added instead of disabling protection globally.",
                "执行前，本机会对已有路径 Ancestor 做规范化解析，目标是防止一个表面位于允许范围内的路径通过符号链接轻易逃逸边界。如果某个项目确实需要访问一个受保护文件或目录，可以添加窄范围例外，而不是全局关闭保护。",
              )}</p>
            </section>

            <section id="security-tools">
              <h2>{tr("Skill policy keeps read, write and shell separate", "Skill 策略把读取、写入与 Shell 分开")}</h2>
              <p>{tr(
                "Safe, Developer and Full are convenience presets over the same editable per-device skill list. Reading files can remain enabled while editing is off. Process listing can remain enabled while start_process is off. Terminal access, when enabled, is real shell execution under the local OS user's permissions.",
                "Safe、Developer、Full 只是同一份逐设备 Skill 列表上的快捷预设。可以保持读取开启而关闭编辑，也可以保持进程查看开启而关闭 start_process。终端一旦开启，就是继承本机 OS 用户权限的真实 Shell 执行。",
              )}</p>
              <p>{tr(
                "Safety Guard blocks a narrow set of catastrophic command patterns as defense in depth. It should not be interpreted as an operating-system sandbox or a substitute for running the agent under an appropriately restricted local user.",
                "Safety Guard 会作为纵深防御拦截一小类灾难性命令模式，但不能把它理解为操作系统沙箱，也不能替代使用权限适当受限的本机用户来运行 Agent。",
              )}</p>
            </section>

            <section id="security-transport">
              <h2>{tr("Transport is encrypted; the relay is not zero-knowledge", "传输会加密；Relay 不是 zero-knowledge")}</h2>
              <p>{tr(
                "The local agent maintains an outbound WSS connection and public web/API traffic uses HTTPS. This protects data in transit against ordinary network interception and removes the need to expose an inbound service on the computer.",
                "本地 Agent 维持出站 WSS 连接，公开 Web/API 流量使用 HTTPS。这能保护传输过程免受普通网络窃听，也无需在电脑上暴露入站服务。",
              )}</p>
              <p>{tr(
                "Encryption in transit is not the same thing as end-to-end zero knowledge. To route a read_file response or process_output result, the hosted relay must process that active payload. Remote Arc therefore makes a narrower storage claim: operational audit records are designed around device, tool, result state and time, rather than intentionally persisting file contents, raw command arguments or tool results.",
                "传输加密不等于端到端 zero-knowledge。为了路由 read_file 响应或 process_output 结果，托管 Relay 必须处理当前 Payload。因此 Remote Arc 做的是更窄的存储承诺：运行审计记录围绕设备、工具、结果状态与时间设计，而不是有意持久化文件内容、原始命令参数或 Tool Result。",
              )}</p>
              <table className="articleTable">
                <thead><tr><th>{tr("Location", "位置")}</th><th>{tr("Examples", "示例")}</th></tr></thead>
                <tbody>
                  <tr><td>D1</td><td>{tr("Account, device and OAuth metadata, policy, usage and audit metadata; separately, durable task contracts, commands, bounded observations, factual memory, run summaries and evidence. Observations may contain file or process content.", "账户、设备与 OAuth 元数据、策略、用量和审计元数据；另保存持久任务合同、命令、受限观察、事实记忆、运行摘要与证据。观察可能包含文件或进程内容。")}</td></tr>
                  <tr><td>{tr("Live relay path", "实时 Relay 链路")}</td><td>{tr("Active file contents, directory listings, process output and command results required for the current call.", "当前调用所需的文件内容、目录列表、进程输出与命令结果。")}</td></tr>
                  <tr><td>{tr("Device only", "仅设备")}</td><td>{tr("Raw device credential, full local process capture and Local Undo snapshots. Requested file/process content can pass through the relay; bounded task observations can be saved.", "原始设备凭证、本地完整进程捕获和 Local Undo 快照。请求的文件或进程内容可以经过 Relay，受限任务观察可以保存到云端。")}</td></tr>
                </tbody>
              </table>
            </section>

            <section id="security-recovery">
              <h2>{tr("Local file recovery and durable task recovery", "本机文件恢复与持久任务恢复")}</h2>
              <p>{tr(
                "Before supported write_file and edit_block changes, Remote Arc can save the previous state under ~/.remotearc/undo. Snapshot contents stay on the paired computer. A restore checks the post-edit file hash first; if the file changed again, automatic restore is refused rather than overwriting newer work.",
                "在受支持的 write_file 与 edit_block 修改前，Remote Arc 可以把旧状态保存到 ~/.remotearc/undo。快照内容留在已配对电脑本机。恢复前会先检查修改后的文件 Hash；如果文件之后又发生变化，自动恢复会拒绝覆盖新工作。",
              )}</p>
              <p>{tr(
                "Local Undo only covers supported file edits. It cannot reverse a deployment, package publish, API request, database mutation or arbitrary shell side effect.",
                "Local Undo 只覆盖受支持的文件编辑，无法撤销部署、包发布、API 请求、数据库修改或任意 Shell 副作用。",
              )}</p>
              <p>{tr("Durable task recovery is separate: the control plane saves contracts, checkpoints and run history. After an interruption it checks leases, revisions and actual device state before continuing. It preserves work progress rather than guaranteeing that the same local process survives a restart.", "持久任务恢复是另一层能力：控制面保存合同、检查点和运行历史，中断后检查租约、版本与真实设备状态再继续。它保留的是工作进度，不保证同一本地进程跨重启存活。")}</p>
            </section>

            <section id="security-automations">
              <h2>{tr("Persistent tasks freeze authority at creation time", "持久任务在创建时冻结权限")}</h2>
              <p>{tr(
                "A durable automation may execute hours after the MCP request that created it has ended. Deterministic automations therefore store an explicit trigger and action plan. Adaptive Agent Goals store a user-approved objective, success criteria, tool set, optional deterministic verification, iteration/expiry limits, target device and permission snapshot. The planner can reinterpret results and choose a different next action, but cannot expand those stored authority boundaries.",
                "Durable Automation 可能在创建它的 MCP 请求结束数小时后才执行。确定性 Automation 会保存明确 Trigger 与 Action Plan；Adaptive Agent Goal 则保存用户批准的目标、成功标准、Tool Set、可选确定性验证、迭代/到期限制、目标设备和权限快照。Planner 可以重新理解结果并调整下一步，但不能扩大这些已经保存的权限边界。",
              )}</p>
              <p>{tr(
                "Every future device action still passes the normal ownership, revocation, allowed-tool and local path-policy checks. Unattended tasks do not enter a mid-run approval queue: disconnects wait for the device, known acknowledged deterministic attempts use the configured restart/fail policy when a handle is lost; unknown dispatch effects are not blindly replayed, and Agent Goals re-inspect state before choosing another action after a lost process handle. If the device security policy itself changes, execution stops and records the policy change instead of waiting for someone to approve it.",
                "未来每次设备执行仍然经过正常的 Ownership、Revocation、Allowed Tool 与本地路径策略检查。无人值守任务不会在运行途中进入审批队列：断线时等待设备；已确认的确定性尝试在句柄丢失后按 restart/fail 处理，未知派发副作用不会盲目重放；Agent Goal 则会先重新检查状态，再决定下一步。如果设备安全策略本身发生变化，执行会停止并记录原因，而不是等待有人批准。",
              )}</p>
              <p>{tr(
                "Condition Watch callback URLs contain a high-entropy secret and act as bearer capabilities. Only a SHA-256 hash is stored and delivery IDs can be deduplicated when supplied. A configured GitHub condition can merge one explicitly selected pull request with a repository-scoped GitHub App installation token. The current webhook transport still relies on the secret callback URL rather than claiming provider-specific GitHub HMAC verification.",
                "Condition Watch 回调 URL 包含高熵 Secret，本身就是 Bearer Capability；云端只保存 SHA-256 Hash，并在提供 Delivery ID 时做去重。配置后的 GitHub Condition 可以使用仓库范围的 GitHub App Installation Token 合并一个明确指定的 Pull Request。当前 Webhook 传输仍依赖这个秘密回调 URL，不声称已经实现 GitHub Provider-specific HMAC 校验。",
              )}</p>
              <p>{tr("Durable goals store their contract, bounded observations, factual memory and completion evidence separately from the operational audit. Observations may contain file contents or command output. Source decisions are scoped to the account/client and fenced by revision. Signed task events require a verified callback and secure egress; cloud GitHub actions also require explicit account/repository permission.", "持久目标在运行审计之外保存合同、受限观察、事实记忆与完成证据；观察可能包含文件内容或命令输出。源决策按账户和客户端隔离，并检查版本。签名任务事件需要经过验证的回调和安全出站服务；云端 GitHub 动作还需要明确的账户与仓库授权。")}</p>
            </section>

            <section id="security-revoke">
              <h2>{tr("Access can be cut at several layers", "访问可以在多个层级被切断")}</h2>
              <p>{tr(
                "An account-wide MCP pause blocks authenticated MCP calls server-side until the user resumes them. Individual OAuth grants can be revoked without re-pairing computers. Individual device credentials can be revoked, forcing that machine to pair again. Stopping the local agent also removes the machine from live routing because the connection is outbound from the device.",
                "账户级 MCP Pause 会在服务端阻止已认证 MCP 调用，直到用户恢复。单个 OAuth Grant 可以独立撤销而无需重新配对电脑；单个 Device Credential 也可以被撤销，使该机器必须重新配对。由于连接由设备主动出站，停止本地 Agent 同样会让该机器退出实时路由。",
              )}</p>
            </section>

            <section id="security-nonclaims">
              <h2>{tr("What Remote Arc does not claim", "Remote Arc 不声称什么")}</h2>
              <ul className="articleBulletList">
                <li>{tr("The hosted relay is not zero-knowledge and processes active tool payloads.", "托管 Relay 不是 zero-knowledge，会处理当前 Tool Payload。")}</li>
                <li>{tr("Terminal execution is not sandboxed by Remote Arc when Full access is enabled.", "开启 Full 后，终端执行不会被 Remote Arc 变成沙箱。")}</li>
                <li>{tr("Local Undo is not a general transaction rollback system.", "Local Undo 不是通用事务回滚系统。")}</li>
                <li>{tr("Direct process handles are local to the agent. Durable Tasks preserve progress across interruptions; recovery may inspect or start a new attempt rather than preserve the same OS process.", "直接进程句柄属于本地 Agent；持久 Task 可跨中断保存进度，恢复时可能检查或启动新尝试，不保留同一个 OS 进程。")}</li>
                <li>{tr("Browser tabs start read-only; click/fill is a separate per-tab opt-in rather than unrestricted browser automation.", "浏览器标签页默认只读；点击/填写需按标签页单独授权，而不是无限制浏览器自动化。")}</li>
                <li>{tr("Adaptive Agent Goals may choose different next actions over time, but only inside the approved objective, tool set, device policy, iteration/expiry limits and optional deterministic verification boundary.", "Adaptive Agent Goal 可以随执行结果调整下一步，但只能在已批准目标、Tool Set、设备策略、迭代/到期限制与可选确定性验证边界内行动。")}</li>
                <li>{tr("Login background connection is separate from task keep-awake. Opted-in active tasks can request temporary sleep inhibition; power loss, forced sleep and network loss still make the device unavailable.", "登录后台连接与任务保持唤醒不同。已授权活动任务可临时申请抑制休眠，断电、强制休眠和断网仍会使设备不可用。")}</li>
              </ul>
              <p>{tr(
                "These are product boundaries, not footnotes. The safest deployment still depends on selecting an appropriate local OS user, granting only the skills a device needs, constraining paths where practical and revoking access when it is no longer required.",
                "这些是产品边界，不是脚注。更安全的实际部署仍然依赖：选择合适的本机 OS 用户、只给设备真正需要的 Skill、在可行时约束路径，并在不再需要时撤销访问。",
              )}</p>
              <div className="articleEndLinks">
                <a href="/docs">{tr("Documentation", "文档")} →</a>
                <a href="/privacy">{tr("Privacy policy", "隐私政策")} →</a>
                <a href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md">SECURITY.md ↗</a>
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}

function UseCasesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading…", "加载中…")}</main>}><UseCaseCatalog /></React.Suspense></PublicLayout>;
}

function UseCaseDetailPage({ slug, user }: { slug: UseCaseSlug; user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading…", "加载中…")}</main>}><UseCaseDetail slug={slug} /></React.Suspense></PublicLayout>;
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


function ClaudeComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CLAUDE + REMOTE ARC</span>
        <h1>{tr("Give Claude controlled access to your computer through Remote MCP.", "通过 Remote MCP，让 Claude 在受控权限下使用你的电脑。")}</h1>
        <p>{tr("Remote Arc connects Claude to explicitly paired Windows, macOS and Linux computers while keeping operating-system execution on the device you control.", "Remote Arc 把 Claude 连接到你明确配对的 Windows、macOS 与 Linux 电脑，同时让真正的系统执行留在你控制的设备上。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/install/claude">{tr("Install Remote Arc for Claude", "为 Claude 安装 Remote Arc")} →</a><a className="ghostButton" href="/docs/mcp">{tr("Read the MCP docs", "查看 MCP 文档")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("Pair the computer once", "先配对电脑")}</h2><p>{tr("Run npx remotelink on the target computer and approve the pairing in your Remote Arc account.", "在目标电脑运行 npx remotelink，并在 Remote Arc 账户中批准配对。")}</p></article>
        <article><span>02</span><h2>{tr("Connect Claude over Remote MCP", "通过 Remote MCP 连接 Claude")}</h2><p>{tr("Add the Remote Arc endpoint to Claude and complete OAuth. Claude connects to a hosted MCP server while the paired device remains a separate execution boundary.", "在 Claude 中添加 Remote Arc Endpoint 并完成 OAuth。Claude 连接的是托管 MCP 服务，而配对设备仍然是独立执行边界。")}</p></article>
        <article><span>03</span><h2>{tr("Keep device policy independent", "设备权限独立控制")}</h2><p>{tr("Tool access, workspace roots, sensitive paths and revocation stay attached to the paired device rather than to one AI vendor.", "工具权限、工作区、敏感路径与撤销能力都绑定在配对设备上，而不是绑定某一家 AI。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">RELATED</span><h2>{tr("Continue with the technical details.", "继续查看技术细节。")}</h2></div>
        <div className="sectionResourceLinks"><a href="/mcp-computer-access">{tr("Remote MCP computer access", "Remote MCP 电脑访问")} →</a><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/chatgpt-computer-access">{tr("ChatGPT computer access", "ChatGPT 电脑访问")} →</a></div>
      </section>
    </PublicLayout>
  );
}

function McpComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">REMOTE MCP + COMPUTER ACCESS</span>
        <h1>{tr("Remote MCP computer access for AI agents.", "面向 AI Agent 的 Remote MCP 电脑访问。")}</h1>
        <p>{tr("Remote Arc is a hosted Remote MCP bridge that lets compatible AI clients discover and invoke approved capabilities on Windows, macOS and Linux computers you pair.", "Remote Arc 是一个托管的 Remote MCP Bridge，让兼容 AI 客户端发现并调用你配对的 Windows、macOS 与 Linux 电脑上的已授权能力。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/docs/mcp">{tr("Open the MCP reference", "查看 MCP Reference")} →</a><a className="ghostButton" href="/security-model">{tr("Security model", "安全模型")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("One hosted MCP endpoint", "一个托管 MCP Endpoint")}</h2><p>{tr("Your AI client connects to Remote Arc over OAuth instead of requiring a publicly reachable MCP server on every computer.", "AI 客户端通过 OAuth 连接 Remote Arc，不需要每台电脑都暴露一个公网可访问的 MCP Server。")}</p></article>
        <article><span>02</span><h2>{tr("Outbound device connections", "设备主动出站连接")}</h2><p>{tr("Each paired computer connects outward to the control plane and receives only routed calls for the device selected by the AI workflow.", "每台配对电脑主动连接控制面，只接收被路由到该设备的调用。")}</p></article>
        <article><span>03</span><h2>{tr("Per-device capabilities", "按设备配置能力")}</h2><p>{tr("Read files, edit supported content, inspect processes, run approved commands, share browser-tab context or keep a device read-only depending on its policy.", "根据设备策略，可以读取文件、编辑受支持内容、检查进程、运行已授权命令、共享浏览器标签页上下文，也可以让设备始终保持只读。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">CONNECT</span><h2>{tr("Use the same device boundary with different AI clients.", "不同 AI 客户端复用同一套设备权限边界。")}</h2></div>
        <div className="sectionResourceLinks"><a href="/install/chatgpt">ChatGPT →</a><a href="/install/claude">Claude →</a><a href="/install/cursor">Cursor →</a><a href="/use-cases">{tr("Use cases", "使用场景")} →</a></div>
      </section>
    </PublicLayout>
  );
}

function NotFoundPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">404</span>
        <h1>{tr("Page not found.", "页面不存在。")}</h1>
        <p>{tr("The Remote Arc page you requested does not exist.", "你访问的 Remote Arc 页面不存在。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/">{tr("Back to Remote Arc", "返回 Remote Arc")} →</a><a className="ghostButton" href="/docs">{tr("Documentation", "文档")}</a></div>
      </section>
    </PublicLayout>
  );
}

function PricingPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const startHref = user ? dashboardHref("/overview") : APP_ORIGIN + "/auth/login?return_to=/overview";
  const usageHref = user ? dashboardHref("/settings") : APP_ORIGIN + "/auth/login?return_to=/settings";
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading…", "加载中…")}</main>}><PricingContent startHref={startHref} usageHref={usageHref} signedIn={Boolean(user)} currentPlan={user?.plan || null} /></React.Suspense></PublicLayout>;
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
  {
    slug: "go-vs-typescript-agent-benchmarks",
    date: "9 Oct 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
] as const;

function BlogsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const posts = [
    {
      ...blogPosts[4],
      title: tr(
        "Why Remote Arc chose Go: measured against TypeScript on Mac and Windows",
        "为什么 Remote Arc 选择 Go：在 Mac 和 Windows 上实测对比 TypeScript",
      ),
      summary: tr(
        "An honest account of a Windows performance regression, its fix, matching atomic/durable workloads, two-hour Agent residency and what we still have not measured.",
        "真实记录 Windows 上 Go 性能回退的发现与修复、相同持久化策略下的比较、两小时 Agent 驻留，以及尚未完成的实测范围。",
      ),
      tag: tr("ENGINEERING · BENCHMARK", "工程 · 基准测试"),
    },
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
        "Both can help AI act on real computers, but OpenClaw is a self-hosted assistant and gateway platform while Remote Arc is a persistent agent runtime beneath the AI clients you already use.",
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
          <a href="/docs#docs-routing">{tr("Architecture notes", "架构说明")} →</a>
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


function GoVsTypescriptBenchmarkArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const rows = [
    { host: "Mac", source: "f68ab09", profile: "atomic", engine: "TS", read: "2.284", write: "5.327", undo: "5.345", rss: "100.69" },
    { host: "Mac", source: "f68ab09", profile: "atomic", engine: "Go", read: "0.964", write: "2.713", undo: "2.519", rss: "16.35" },
    { host: "Mac", source: "f68ab09", profile: "durable", engine: "TS", read: "2.149", write: "203.618", undo: "53.092", rss: "101.36" },
    { host: "Mac", source: "f68ab09", profile: "durable", engine: "Go", read: "0.972", write: "195.803", undo: "47.742", rss: "16.68" },
    { host: "Windows", source: "f68ab09", profile: "atomic", engine: "TS", read: "5.337", write: "20.977", undo: "16.091", rss: "95.79" },
    { host: "Windows", source: "f68ab09", profile: "atomic", engine: "Go", read: "22.660", write: "29.152", undo: "51.719", rss: "19.57" },
    { host: "Windows", source: "71cde96", profile: "atomic", engine: "TS", read: "5.422", write: "21.294", undo: "16.189", rss: "98.99" },
    { host: "Windows", source: "71cde96", profile: "atomic", engine: "Go", read: "4.168", write: "9.687", undo: "12.942", rss: "19.33" },
  ];
  return <PublicLayout user={user}>
    <article className="blogArticle">
      <header className="blogArticleHeader">
        <a className="blogBack" href="/blogs">← {tr("All posts", "全部文章")}</a>
        <span className="eyebrow">{tr("ENGINEERING NOTES · 9 OCT 2026", "工程笔记 · 2026 年 10 月 9 日")}</span>
        <h1>{tr(
          "Why Remote Arc chose Go: measured against TypeScript on Mac and Windows",
          "为什么 Remote Arc 选择 Go：在 Mac 和 Windows 上实测对比 TypeScript",
        )}</h1>
        <p className="blogDeck">{tr(
          "Go did not win every test. Our first Windows build was slower. Here is what we measured, what we fixed, and why the native Agent still made sense.",
          "Go 并不是一开始就全面胜出。早期 Windows 版本反而更慢。这篇文章记录我们测到了什么、修复了什么，以及为什么最终仍选择原生 Go Agent。",
        )}</p>
        <div className="blogByline"><span className="blogAuthorMark">SY</span><div>
          <strong>Sam Yao</strong>
          <span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · 9 Oct 2026 · 9 min</span>
        </div></div>
      </header>
      <div className="blogArticleBody">
        <p>{tr(
          "Remote Arc is not a benchmark project. Its Agent needs to stay on the computer for hours, preserve one execution owner, reconnect safely and honor file permissions and Undo. Choosing Go was about the shape of that product, not a claim that Go is universally faster than Node.js.",
          "Remote Arc 不是跑分项目。设备 Agent 需要长期驻留、确保只有一个执行者、可靠重连，并始终遵守文件权限和 Undo 语义。选择 Go 是基于这种产品形态，而不是宣称 Go 在所有场景中都比 Node.js 快。",
        )}</p>
        <h2>{tr("What exactly did we benchmark?", "我们到底测了什么？")}</h2>
        <p>{tr(
          "L1 measures each execution core through local JSONL IPC. L2 measures the complete foreground Agent through an authenticated loopback WebSocket relay. Both use matched operations, three alternating rounds, warmup outside the measured set and 600 samples per routine file operation. RSS is sampled after a batch, not peak RAM.",
          "L1 通过本地 JSONL IPC 测量执行内核。L2 通过已认证的本机回环 WebSocket Relay 测试完整前台 Agent。两边执行相同操作，交替运行三轮，预热不计入测量，每项常规文件操作合计 600 次样本。RSS 是批次结束后的采样值，并非峰值内存。",
        )}</p>
        <p>{tr(
          "The table below is L2 only: median (P50) latency in milliseconds and post-batch RSS in MiB. Source hashes matter: the Windows follow-up is a different, newer commit than the original baseline. These are not production Cloudflare or ChatGPT end-to-end timings.",
          "下表只展示 L2：延迟为中位数 P50（毫秒），RSS 为批次结束后内存（MiB）。源码版本很重要：Windows 修复后测试使用的是不同于旧基线的新提交。这些不是生产 Cloudflare 或 ChatGPT 端到端延迟。",
        )}</p>
        <div className="benchmarkTableScroll" role="region" aria-label={tr("Agent benchmark results, scroll horizontally to see more columns", "Agent 基准结果表，可横向滚动查看更多列")} tabIndex={0}>
          <table className="benchmarkTable">
            <caption>{tr("Full Agent (L2): median time in ms, memory in MiB", "完整 Agent（L2）：延迟单位 ms，内存单位 MiB")}</caption>
            <thead><tr>
              <th scope="col">{tr("Host", "系统")}</th>
              <th scope="col">{tr("Source", "版本")}</th>
              <th scope="col">{tr("Mode", "模式")}</th>
              <th scope="col">{tr("Engine", "引擎")}</th>
              <th scope="col">{tr("Read", "读取")}</th>
              <th scope="col">{tr("Write", "写入")}</th>
              <th scope="col">Undo</th>
              <th scope="col">RSS</th>
            </tr></thead>
            <tbody>{rows.map((item) => <tr key={item.host + item.source + item.profile + item.engine}>
              <th scope="row">{item.host}</th><td><code>{item.source}</code></td><td>{item.profile}</td>
              <td><strong>{item.engine}</strong></td><td>{item.read}</td><td>{item.write}</td><td>{item.undo}</td><td>{item.rss}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="benchmarkMethodNote">{tr(
          "Read/write/Undo values come from distinct three-round matched runs. Do not compare different hosts as if they had identical hardware. The Windows follow-up verified revised native-path handling, not a universal Go advantage.",
          "读取、写入与 Undo 数据来自三轮同条件测试。Mac 和 Windows 硬件不同，不能把跨机器数字直接相除。Windows 后续测试验证的是原生路径处理修复后的实现，而不是 Go 的普遍速度优势。",
        )}</p>
        <h2>{tr("The Windows regression we nearly missed", "差点被忽略的 Windows 性能回退")}</h2>
        <p>{tr(
          "At source f68ab09, Go on Windows took 29.15 ms to write versus 20.98 ms for TS, and 51.72 ms to Undo versus 16.09 ms. The issue was not evidence that native Go was the wrong runtime: the native Windows path-handling implementation needed correction. After that change, source 71cde96 measured 9.69 ms Go versus 21.29 ms TS for writes, and 12.94 ms versus 16.19 ms for Undo. Both measurements remain published.",
          "在 f68ab09 版本中，Windows 的 Go 写入需要 29.15 ms，TS 仅为 20.98 ms；Go Undo 需要 51.72 ms，TS 为 16.09 ms。但问题不代表 Go 运行时本身不合适，而是 Windows 原生路径处理需要修复。修复后，71cde96 测到 Go 写入 9.69 ms、TS 21.29 ms，Undo 则是 Go 12.94 ms、TS 16.19 ms。新旧两份结果都保留，不能只展示有利数字。",
        )}</p>
        <h2>{tr("Why durable writes look slow on the Mac", "为什么 Mac 上 durable 写入会变慢？")}</h2>
        <p>{tr(
          "In atomic mode the agent writes a temporary file and renames it, without explicitly waiting for storage flushes. Durable mode additionally synchronizes file data, Undo records and directory metadata. On this Intel Mac, L2 Go writes rose from 2.71 ms in atomic mode to 195.80 ms in durable mode. TS showed a similar jump (5.33 to 203.62 ms). Most of that difference is a stronger synchronization policy, not a proof that either language became slower.",
          "atomic 模式通过临时文件加重命名进行原子替换，但不显式等待数据落盘。durable 模式还会同步文件数据、Undo 记录与目录元数据。在这台 Intel Mac 上，L2 Go 写入由 atomic 的 2.71 ms 上升至 durable 的 195.80 ms，TS 则由 5.33 ms 上升至 203.62 ms。主要差别是同步策略，而非语言性能突然下降。",
        )}</p>
        <p>{tr(
          "The layered experiment keeps workspace writes atomic while persisting Undo state more strictly. It lowers some latency, but does not guarantee that the latest workspace edit survives sudden power loss. macOS fsync is not F_FULLFSYNC, and Windows directory synchronization has limits. We will not relabel this as full power-loss protection.",
          "layered 实验让工作区写入保持 atomic，而对 Undo 状态采用更严格的同步。它能降低部分延迟，但不保证最近一次工作区修改在突然断电后仍然存在。macOS 的 fsync 不等于 F_FULLFSYNC；Windows 的目录同步也有限制。我们不会把它包装成完整断电安全。",
        )}</p>
        <h2>{tr("Long-running resources and the decision", "长期驻留与最终选择")}</h2>
        <p>{tr(
          "Under the earlier f68ab09 native-Go soak, the Mac ran for 7,200 seconds with sampled RSS growing from 14.11 to 17.33 MiB; Windows ran for 7,200 seconds from 17.80 to 24.79 MiB, with a sampled peak of 25.11 MiB. The runs included execution, Undo, conflict checks, managed processes and repeated WebSocket reconnects in an isolated fixture, not a real production outage.",
          "在较早的 f68ab09 原生 Go 驻留实验中，Mac 运行 7,200 秒，采样 RSS 从 14.11 增至 17.33 MiB；Windows 同样运行 7,200 秒，从 17.80 增至 24.79 MiB，采样峰值为 25.11 MiB。测试覆盖文件操作、Undo、冲突检查、受管进程及隔离环境下的 WebSocket 重连，并不等于真实生产断网测试。",
        )}</p>
        <p>{tr(
          "Remote Arc 0.6.0 therefore ships Go as the default native computer Agent: low measured resident memory, native distribution without a Node prerequisite, and one executable that owns the local execution boundary. TypeScript remains an explicit compatibility fallback. Cloudflare Worker and Dashboard still use TypeScript.",
          "因此，Remote Arc 0.6.0 选择 Go 作为默认原生设备 Agent：实测较低的常驻内存、无需 Node 的原生分发，以及由同一个可执行文件负责本地执行边界。TypeScript 仍作为明确的兼容回退；Cloudflare Worker 和 Dashboard 依然使用 TypeScript。",
        )}</p>
        <h2>{tr("What we have not proved yet", "哪些事情仍没有证明？")}</h2>
        <p>{tr(
          "L3 is still outstanding: a formal paired TS/Go measurement of ChatGPT/client → production Cloudflare Relay → real device, separating network, routing and execution time. We also need installed-service upgrades, real power/network outages and hardware-specific crash-durability experiments. Benchmark samples are useful engineering evidence, not a blanket performance claim or production SLO.",
          "L3 仍未完成：需要把 ChatGPT/客户端 → 生产 Cloudflare Relay → 真机的 TS/Go 对照拆成网络、路由和执行耗时。另外，安装后的后台服务升级、真实断网/断电，以及硬件层面的崩溃持久化测试仍需独立验收。基准样本是工程证据，不是普适性能承诺或生产 SLO。",
        )}</p>
        <div className="benchmarkSources">
          <h2>{tr("Methods and source data", "方法与原始来源")}</h2>
          <p><a href="https://github.com/yaohuangguan/remote-arc/blob/master/benchmarks/RESULTS-2026-10-09-f68ab09.md">{tr("Mac + Windows baseline (f68ab09)", "Mac + Windows 旧基线（f68ab09）")} ↗</a></p>
          <p><a href="https://github.com/yaohuangguan/remote-arc/blob/master/benchmarks/RESULTS-2026-10-09-71cde96.md">{tr("Windows path-handling follow-up (71cde96)", "Windows 路径处理修复后测试（71cde96）")} ↗</a></p>
          <p><a href="https://github.com/yaohuangguan/remote-arc/blob/master/benchmarks/README.md">{tr("Reproduction steps, profiles and raw-artifact hashes", "复现步骤、同步模式和原始报告哈希")} ↗</a></p>
        </div>
        <footer className="blogArticleFooter">
          <div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div>
          <a href="/downloads">{tr("Download the native Go Agent", "下载原生 Go Agent")} →</a>
        </footer>
      </div>
    </article>
  </PublicLayout>;
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
            "They can both help AI act on real computers, but they start from different product boundaries. OpenClaw is an assistant and agent platform; Remote Arc is a persistent runtime that keeps approved work, execution state and real-device access alive beneath the AI client you choose.",
            "它们都可以让 AI 在真实电脑上做事，但产品边界不同：OpenClaw 是 Assistant 与 Agent 平台；Remote Arc 是位于你所选 AI 客户端之下的持久化 Runtime，负责保存任务、执行状态与真实设备访问。",
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
            "Remote Arc deliberately owns a different layer. It does not replace your conversation UI or model; it owns the durable execution layer beneath them: paired computers, task state, checkpoints, bounded Agent Goals, recovery and permissioned tool execution. ChatGPT, Claude, Codex or another compatible MCP client can act as the reasoning source above that runtime.",
            "Remote Arc 刻意负责不同的一层：它不替代你的对话界面或模型，而是负责其下方的持久执行层——配对电脑、任务状态、检查点、受限 Agent Goal、恢复机制与权限化工具执行。ChatGPT、Claude、Codex 或其他兼容 MCP 的客户端可以作为 Runtime 上方的推理来源。",
          )}</p>

          <h2>{tr("OpenClaw is an AI home. Remote Arc is the runtime underneath.", "OpenClaw 更像 AI 的“家”，Remote Arc 是它下方的 Runtime。")}</h2>
          <div className="blogCompareTable">
            <div className="blogCompareHead"><span></span><strong>Remote Arc</strong><strong>OpenClaw</strong></div>
            <div><span>{tr("Primary role", "核心角色")}</span><b>{tr("Persistent agent runtime for real computers", "面向真实电脑的持久化 Agent Runtime")}</b><b>{tr("Self-hosted assistant / gateway platform", "自托管 Assistant / Gateway 平台")}</b></div>
            <div><span>{tr("Who owns the conversation", "谁承载对话")}</span><b>{tr("Your existing AI client", "现有 AI 客户端")}</b><b>{tr("OpenClaw Gateway and its channels", "OpenClaw Gateway 与其渠道")}</b></div>
            <div><span>{tr("Model / reasoning", "模型 / 推理")}</span><b>{tr("External source; runtime state stays in Remote Arc", "外部提供推理；Runtime 状态由 Remote Arc 持久化")}</b><b>{tr("Part of the OpenClaw platform", "属于 OpenClaw 平台能力")}</b></div>
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
            "The two models can even meet: OpenClaw can consume remote MCP servers, while Remote Arc exposes one. In that setup OpenClaw can be the assistant above Remote Arc, while Remote Arc remains the persistent computer runtime below it. The same runtime can instead be driven by ChatGPT, Claude, Codex or another compatible client.",
            "从架构上看，两者甚至可以连接起来：OpenClaw 可以消费 Remote MCP，而 Remote Arc 暴露对应 Endpoint。此时 OpenClaw 可以作为上层 Assistant，Remote Arc 仍是下方的持久化电脑 Runtime；同一个 Runtime 也可以由 ChatGPT、Claude、Codex 或其他兼容客户端驱动。",
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

          <h2>{tr("5. Sensitive paths and trusted write locations reduce accidental reach.", "5. 敏感路径和可信写入区域减少误操作范围。")}</h2>
          <p>{tr(
            "Remote Arc separates read visibility from write authority: ordinary non-sensitive files can be inspected broadly, while persistent mutation is limited to Trusted Write Locations and temporary approvals. Sensitive paths remain separately protected. These controls are not a replacement for operating-system sandboxing, especially once arbitrary terminal execution is enabled.",
            "Remote Arc 将“可读取范围”和“可写入权限”分开：普通非敏感文件可以广泛只读查看，持续修改仅允许在可信写入区域或临时审批范围内；敏感路径继续独立保护。这些控制不能替代操作系统级沙箱，尤其是在开启任意终端执行之后。",
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
            <a href="/docs#docs-routing">{tr("System architecture", "系统架构")} →</a>
            <a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">GitHub →</a>
          </div>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/docs/mcp">{tr("Explore the MCP architecture", "查看 MCP 架构")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}

function ResourcesRedirect() {
  const { tr } = useI18n();
  useEffect(() => { window.location.replace("/docs"); }, []);
  return <p role="status"><a href="/docs">{tr("Open documentation", "打开文档")} →</a></p>;
}

function McpPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading…", "加载中…")}</main>}><McpReference /></React.Suspense></PublicLayout>;
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
  const hasPlus = user.plan === "plus" || user.isAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  const [backgroundUpdatingId, setBackgroundUpdatingId] = useState<string | null>(null);
  const [backgroundTargetEnabled, setBackgroundTargetEnabled] = useState<boolean | null>(null);
  const [backgroundPhase, setBackgroundPhase] = useState<"applying" | "verifying" | "stopping">("applying");
  const backgroundMutationInFlight = useRef(false);
  const runtimeMutationInFlight = useRef(false);
  const [runtimeUpdatingId, setRuntimeUpdatingId] = useState<string | null>(null);
  const [runtimeTargetPaused, setRuntimeTargetPaused] = useState<boolean | null>(null);
  const [managedDeviceId, setManagedDeviceId] = useState<string | null>(null);
  const [devicePanel, setDevicePanel] = useState<"access" | "tasks" | "activity">("access");
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const securityRefreshRevision = useRef(0);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [taskScheduler, setTaskScheduler] = useState<{ state: string; last_success_at: string | null; overdue_count: number } | null>(null);
  const [taskCapabilities, setTaskCapabilities] = useState<{ hosted_planner: boolean; github_merge: boolean } | null>(null);
  const [createdTask, setCreatedTask] = useState<Automation | null>(null);
  const [createdTaskOutcome, setCreatedTaskOutcome] = useState<{ title: string; detail: string } | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationLoadError, setAutomationLoadError] = useState(false);
  const [automationQuery, setAutomationQuery] = useState(() => new URLSearchParams(location.search).get("task") || "");
  const [automationFilter, setAutomationFilter] = useState<"all" | "active" | "attention" | "finished">("all");
  const [deviceTaskBusy, setDeviceTaskBusy] = useState<string | null>(null);
  const [automationBusy, setAutomationBusy] = useState<string | null>(null);
  const [showAutomationCreate, setShowAutomationCreate] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<string | null>(null);
  const [plannedDraft, setPlannedDraft] = useState(newPlannedDraft);
  const [automationDraft, setAutomationDraft] = useState<AutomationDraft>({
    name: "",
    kind: "agent_goal",
    trigger_mode: "now",
    command_confirmed: false,
    device_id: "",
    command: "",
    cwd: "",
    goal_command: "",
    agent_objective: "",
    agent_success_criteria: "",
    agent_workspace: "",
    agent_controller: "hosted",
    agent_start_at: "",
    agent_repeat_minutes: "",
    keep_awake: false,
    agent_verify_command: "",
    agent_max_iterations: "720",
    agent_allowed_tools: ["list_directory", "read_file", "get_file_info", "edit_block", "start_process"],
    interval_minutes: "1",
    schedule_minutes: "60",
    max_runs: "",
    condition_source: "github",
    condition_event: "workflow_run",
    condition_match: '{"action":"completed","workflow_run.conclusion":"success"}',
    condition_action: "device_command",
    github_owner: "yaohuangguan",
    github_repo: "remote-arc",
    github_pr: "",
    github_merge_method: "merge",
  });
  const [undoByDevice, setUndoByDevice] = useState<Record<string, UndoAction[]>>({});
  const [undoLoading, setUndoLoading] = useState<string | null>(null);
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});
  const [processesByDevice, setProcessesByDevice] = useState<Record<string, ManagedProcess[]>>({});
  const [processLoading, setProcessLoading] = useState<string | null>(null);
  const [processErrors, setProcessErrors] = useState<Record<string, string>>({});
  const [executionLogsByDevice, setExecutionLogsByDevice] = useState<Record<string, DeviceExecutionLog>>({});
  const [executionLogLoading, setExecutionLogLoading] = useState<string | null>(null);
  const [executionLogErrors, setExecutionLogErrors] = useState<Record<string, string>>({});
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
    const revision = ++securityRefreshRevision.current;
    try {
      const [securityResponse, approvalsResponse] = await Promise.all([
        fetch("/api/security"), fetch("/api/approvals"),
      ]);
      if (!securityResponse.ok || !approvalsResponse.ok) throw new Error("Security data unavailable");
      const [security, approvals] = await Promise.all([
        securityResponse.json().then(parseSecurityState), approvalsResponse.json().then(parsePendingApprovals),
      ]);
      if (!security || !approvals) throw new Error("Invalid security response");
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(security);
      setPendingApprovals(approvals);
      setSecurityError(false);
    } catch {
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(null);
      setPendingApprovals([]);
      setSecurityError(true);
    }
  }

  async function decidePendingApproval(
    approval: PendingApproval,
    decision: "allow_once" | "allow_10m" | "always_folder" | "deny",
  ) {
    if (UI_PREVIEW || !securityState) return;
    setSecurityBusy(true);
    try {
      const response = await fetch(
        "/api/approvals/" + encodeURIComponent(approval.id) + "/decision",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(
          tr("Approval was not updated", "审批未更新"),
          payload.error || tr("Please refresh and try again.", "请刷新后重试。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  useEffect(() => {
    if (active !== "security") return;
    void refreshSecurity();
    const timer = window.setInterval(() => void refreshSecurity(), 5_000);
    return () => window.clearInterval(timer);
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

  async function refreshAutomations() {
    setAutomationLoading(true);
    try {
      const response = await fetch("/api/automations");
      if (!response.ok) throw new Error("Tasks unavailable");
      const payload = await response.json() as { automations?: Automation[]; capabilities?: { hosted_planner: boolean; github_merge: boolean }; scheduler?: { state: string; last_success_at: string | null; overdue_count: number } };
      setAutomations(Array.isArray(payload.automations) ? payload.automations : []);
      setTaskCapabilities(payload.capabilities || null);
      setTaskScheduler(payload.scheduler || null);
      setAutomationLoadError(false);
    } catch {
      setAutomationLoadError(true);
    } finally {
      setAutomationLoading(false);
    }
  }

  useEffect(() => {
    if (active !== "automations" && active !== "overview") return;
    void refreshAutomations();
    const timer = window.setInterval(() => void refreshAutomations(), 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (automationDraft.device_id || !devices.length) return;
    const preferred = devices.find((device) => device.status === "online") || devices[0];
    if (preferred) {
      setAutomationDraft((current) => ({ ...current, device_id: preferred.id }));
    }
  }, [devices, automationDraft.device_id]);

  async function createDashboardAutomation() {
    if (UI_PREVIEW) return;
    const name = automationDraft.name.trim() || (automationDraft.kind === "agent_goal" ? automationDraft.agent_objective.trim().slice(0, 120) : "");
    const command = automationDraft.command.trim();
    const isAgentGoal = automationDraft.kind === "agent_goal";
    const isGitHubMerge =
      automationDraft.kind === "condition_watch" &&
      automationDraft.condition_action === "github_merge";

    if (!name) {
      await showNotice(
        tr("Missing automation name", "缺少自动化名称"),
        tr("Give this persistent task a name.", "请为这条持久任务填写名称。"),
      );
      return;
    }
    if (
      isAgentGoal &&
      (!automationDraft.device_id ||
        !automationDraft.agent_objective.trim() ||
        !automationDraft.agent_success_criteria.trim() ||
        automationDraft.agent_allowed_tools.length === 0)
    ) {
      await showNotice(
        tr("Agent Goal details required", "Agent Goal 信息不完整"),
        tr(
          "Choose a device, provide the objective and success criteria, and explicitly select at least one Agent Goal tool.",
          "请选择设备、填写目标与成功标准，并明确选择至少一个 Agent Goal Tool。",
        ),
      );
      return;
    }
    if (
      isGitHubMerge &&
      (!automationDraft.github_owner.trim() ||
        !automationDraft.github_repo.trim() ||
        !/^\d+$/.test(automationDraft.github_pr.trim()))
    ) {
      await showNotice(
        tr("GitHub PR details required", "需要 GitHub PR 信息"),
        tr(
          "Repository owner, repository name and pull request number are required.",
          "需要填写仓库 Owner、仓库名和 Pull Request 编号。",
        ),
      );
      return;
    }
    if (!isAgentGoal && !isGitHubMerge && (!command || !automationDraft.device_id || !automationDraft.cwd.trim())) {
      await showNotice(
        tr("Missing automation details", "自动化信息不完整"),
        tr("Device, executable command and an approved working directory are required.", "需要设备、可执行命令以及已批准的工作目录。"),
      );
      return;
    }
    if (isAgentGoal && automationDraft.agent_allowed_tools.includes("start_process") && !automationDraft.agent_workspace.trim()) {
      await showNotice(tr("Workspace required", "需要工作区"), tr("Terminal access needs a working directory inside this computer's approved locations.", "终端访问需要填写这台电脑已批准位置中的工作目录。")); return;
    }

    if (!isAgentGoal && !isGitHubMerge && !automationDraft.command_confirmed) {
      await showNotice(tr("Confirm executable instructions", "请确认可执行指令"), tr("This field runs shell code verbatim. Use Complete a goal for natural-language requests.", "这里会原样运行 shell 代码。自然语言需求请选择完成一个目标。"));
      return;
    }
    let plannedContract: ReturnType<typeof buildPlannedContract> | undefined;
    if (isAgentGoal) {
      try { plannedContract = buildPlannedContract(plannedDraft.enabled ? plannedDraft : { ...newPlannedDraft(), maxMinutes: plannedDraft.maxMinutes }); }
      catch (error) {
        await showNotice(tr("Plan details required", "计划信息不完整"), String(error));
        return;
      }
    }
    const intervalMinutes = Number(automationDraft.interval_minutes || "5");
    const scheduleMinutes = Number(automationDraft.schedule_minutes || "60");
    const maxRunsRaw = automationDraft.max_runs.trim();
    const body: Record<string, unknown> = {
      name,
      kind: automationDraft.kind,
      keep_awake: automationDraft.keep_awake,
      interval_seconds: Math.max(
        60,
        Math.round((Number.isFinite(intervalMinutes) ? intervalMinutes : 5) * 60),
      ),
      ...(maxRunsRaw ? { max_runs: Math.max(0, Math.round(Number(maxRunsRaw))) } : {}),
      recovery: "restart",
    };

    if (isAgentGoal) {
      body.device_id = automationDraft.device_id;
      body.agent_goal = {
        controller: automationDraft.agent_controller,        objective: automationDraft.agent_objective.trim(),
        success_criteria: automationDraft.agent_success_criteria.trim(),
        ...(automationDraft.agent_workspace.trim()
          ? { workspace: automationDraft.agent_workspace.trim() }
          : {}),
        ...(automationDraft.agent_verify_command.trim()
          ? { verify_command: automationDraft.agent_verify_command.trim() }
          : {}),
        ...(automationDraft.agent_workspace.trim()
          ? { verify_cwd: automationDraft.agent_workspace.trim() }
          : {}),
        max_iterations: Math.min(
          2000,
          Math.max(1, Math.round(Number(automationDraft.agent_max_iterations || "720"))),
        ),
        allowed_tools: automationDraft.agent_allowed_tools,
        ...(plannedContract ? { plan: plannedContract } : {}),
        ...(automationDraft.agent_controller === "source" ? { source_capabilities: { durable_context: true, resume_on_next_turn: true, autonomous_event_wakeup: false } } : {}),
      };

    } else if (isGitHubMerge) {
      body.github_merge = {
        owner: automationDraft.github_owner.trim(),
        repo: automationDraft.github_repo.trim(),
        pull_number: Number(automationDraft.github_pr),
        merge_method: automationDraft.github_merge_method,
      };
    } else {
      body.device_id = automationDraft.device_id;
      body.command = command;
      if (automationDraft.cwd.trim()) body.cwd = automationDraft.cwd.trim();
    }

    if (automationDraft.kind === "goal_loop") {
      if (!automationDraft.goal_command.trim()) {
        await showNotice(
          tr("Goal check required", "需要目标验证"),
          tr("Repeat & check needs a verification command. Exit code 0 means the goal has been reached.", "重复并验证需要填写验证命令；退出码 0 表示目标已经达成。"),
        );
        return;
      }
      body.goal = {
        command: automationDraft.goal_command.trim(),
        expected_exit_code: 0,
        ...(automationDraft.cwd.trim() ? { cwd: automationDraft.cwd.trim() } : {}),
      };
    }

    if (automationDraft.trigger_mode === "at") {
      if (!automationDraft.agent_start_at || !Number.isFinite(Date.parse(automationDraft.agent_start_at))) {
        await showNotice(tr("Start time required", "需要启动时间"), tr("Choose a valid future start time.", "请选择有效的未来启动时间。")); return;
      }
      body.schedule = { at: new Date(automationDraft.agent_start_at).toISOString() };
    } else if (automationDraft.trigger_mode === "interval") {
      body.schedule = { every_seconds: Math.max(60, Math.round(scheduleMinutes * 60)) };
    }

    if (automationDraft.trigger_mode === "event") {
      let match: Record<string, string | number | boolean | null> = {};
      try {
        const parsed = JSON.parse(automationDraft.condition_match || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        match = parsed as Record<string, string | number | boolean | null>;
      } catch {
        await showNotice(
          tr("Invalid condition JSON", "条件 JSON 无效"),
          tr("Match conditions must be a JSON object using dotted payload paths.", "Match 条件必须是一个使用点号路径的 JSON 对象。"),
        );
        return;
      }
      body.condition = {
        source: isGitHubMerge ? "github" : automationDraft.condition_source,
        ...(automationDraft.condition_event.trim() ? { event: automationDraft.condition_event.trim() } : {}),
        match,
      };
    }

    const trigger = automationDraft.trigger_mode === "at" ? { type: "at", at: (body.schedule as { at: string }).at }
      : automationDraft.trigger_mode === "interval" ? { type: "interval", every_seconds: (body.schedule as { every_seconds: number }).every_seconds }
      : automationDraft.trigger_mode === "event" ? { type: "event", ...(body.condition as object) } : { type: "now" };
    const taskContract = {
      version: 1, intent: isAgentGoal ? "goal" : "command", name, device_id: body.device_id,
      trigger, keep_awake: body.keep_awake,
      ...(isAgentGoal ? { goal: body.agent_goal } : isGitHubMerge ? { github_merge: body.github_merge }
        : { command: { text: command, cwd: body.cwd, recovery: "fail", ...(body.goal ? { verification: (body.goal as { command: string }).command } : {}) } }),
      limits: { check_interval_seconds: body.interval_seconds, ...(body.max_runs !== undefined ? { max_runs: body.max_runs } : {}) },
    };

    setAutomationBusy("create");
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: taskContract }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        webhook?: { url?: string } | null;
        automation?: Automation;
      };
      if (!response.ok) {
        await showNotice(
          tr("Automation was not created", "自动化创建失败"),
          payload.error || tr("The server rejected this automation.", "服务器拒绝了这条自动化。"),
        );
        return;
      }
      setCreatedWebhook(payload.webhook?.url || null);
      setCreatedTask(payload.automation || null);
      setCreatedTaskOutcome({ title: draftStartTitle, detail: draftStartDetail });
      if (payload.automation) {
        setAutomationQuery(payload.automation.id);
        setAutomationFilter("all");
      }
      setShowAutomationCreate(false);
      setPlannedDraft(newPlannedDraft());
      setAutomationDraft((current) => ({
        ...current,
        name: "",
        command: "",
        command_confirmed: false,
        goal_command: "",
        agent_objective: "",
        agent_success_criteria: "",
        agent_verify_command: "",
        github_pr: "",
        max_runs: "",
      }));
      await refreshAutomations();
    } catch {
      await showNotice(tr("Task creation could not be confirmed", "无法确认任务是否创建成功"), tr("Refresh the task list before trying again. The request may have reached the server, so retrying immediately could create a duplicate.", "请先刷新任务列表再重试。请求可能已到达服务器，立即重试可能产生重复任务。"));
    } finally {
      setAutomationBusy(null);
    }
  }

  async function manageDashboardAutomation(
    automation: Automation,
    action: "pause" | "resume" | "cancel",
  ) {
    if (UI_PREVIEW) return;
    if (
      action === "cancel" &&
      !(await askConfirm(
        tr("Cancel automation?", "取消自动化？"),
        tr("Remote Arc will stop orchestration and best-effort stop its currently managed process.", "Remote Arc 会停止编排，并尽力停止当前由它管理的进程。"),
        tr("Cancel automation", "取消自动化"),
        "danger",
      ))
    ) return;

    setAutomationBusy(automation.id + ":" + action);
    try {
      const response = await fetch(
        "/api/automations/" + encodeURIComponent(automation.id) + "/" + action,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await showNotice(
          tr("Automation was not updated", "自动化更新失败"),
          payload.error || tr("The server rejected this change.", "服务器拒绝了这次修改。"),
        );
        return;
      }
      await refreshAutomations();
    } finally {
      setAutomationBusy(null);
    }
  }

  async function setMcpPaused(paused: boolean) {
    if (UI_PREVIEW || !securityState) return;
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
    if (UI_PREVIEW || !securityState) return;
    const shortId = grant.grantId.slice(0, 12) + "…";
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
      const response = await fetch("/api/security/grants/" + encodeURIComponent(grant.grantId) + "/revoke", { method: "POST" });
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
      tr("Forget this device?", "删除这台设备？"),
      tr(
        (device?.name || "This device") + " will be removed from your Remote Arc account. Local files and software are not deleted. To use this runtime again, run Remote Arc locally and pair it again. Your AI-client authorizations are unchanged.",
        (device?.name || "这台设备") + " 将从 Remote Arc 账户中移除。本机文件和软件不会被删除。如需再次使用这个运行环境，请在本机重新运行 Remote Arc 并重新配对。AI 客户端授权不会受影响。",
      ),
      tr("Forget device", "删除设备"),
      "danger",
    );
    if (!confirmed) return;

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(deviceId) + "/revoke",
      { method: "POST" },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      await showNotice(
        tr("Device was not removed", "设备未删除"),
        payload.error || tr(
          "Remote Arc could not remove this device. Its existing pairing is still active.",
          "Remote Arc 无法删除这台设备，现有配对仍然有效。",
        ),
      );
      return;
    }

    if (managedDeviceId === deviceId) setManagedDeviceId(null);
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

  async function updateDeviceBackground(
    device: Device,
    enabled: boolean,
    stopCurrent = false,
  ) {
    if (UI_PREVIEW || backgroundMutationInFlight.current || runtimeMutationInFlight.current) return;
    if (device.status !== "online") {
      await showNotice(
        tr("Computer is offline", "电脑当前离线"),
        tr(
          "Background mode can only be changed while the local Remote Arc agent is online. If it was disabled previously, run npx remotelink once on that computer to reconnect it.",
          "只有本机 Remote Arc Agent 在线时才能修改后台运行设置。如果之前已经关闭，请在那台电脑上运行一次 npx remotelink 重新连接。",
        ),
      );
      return;
    }
    if (!device.background_agent_available) {
      await showNotice(
        tr("Update remotelink first", "请先更新 remotelink"),
        tr(
          "This computer is running an older Remote Arc client that does not support background-agent controls yet.",
          "这台电脑正在运行旧版 Remote Arc 客户端，暂不支持后台 Agent 控制。",
        ),
      );
      return;
    }

    // Disable duplicate clicks synchronously, not after the next React render.
    backgroundMutationInFlight.current = true;
    setBackgroundUpdatingId(device.id);
    setBackgroundTargetEnabled(enabled);
    setBackgroundPhase("applying");
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/background",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled,
            ...(enabled === false && stopCurrent ? { stop_current: true } : {}),
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll();
        await showNotice(
          tr("Background setting was not updated", "后台设置未更新"),
          payload.error === "device offline" ? tr("This computer disconnected before the setting could be applied. The setting is not confirmed. Reconnect with npx remotelink on this computer, then try again.", "应用设置前这台电脑已断开连接，设置尚未确认。请在本机运行 npx remotelink 重新连接后再试。") : payload.error ||
            tr(
              "Remote Arc could not update the background connection on this computer.",
              "Remote Arc 无法更新这台电脑的后台连接设置。",
            ),
        );
        return;
      }
      if (stopCurrent) {
        // Stop is different from disabling recovery: confirm the *executor*
        // leaves the Relay, not merely that a boolean was saved in D1.
        setBackgroundPhase("stopping");
        const offline = await waitForAgentOffline(device.id, {
          read: async () => {
            const statusResponse = await fetch("/api/devices", {
              cache: "no-store",
              signal: AbortSignal.timeout(4_000),
            });
            if (!statusResponse.ok) throw new Error("Device status unavailable");
            return await statusResponse.json() as Device[];
          },
          pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        });
        await refreshAll();
        await showNotice(
          offline ? tr("Agent stopped", "Agent 已停止") : tr("Stop still unconfirmed", "停止操作尚未确认"),
          offline
            ? tr("The Agent is offline and automatic recovery has been disabled. Restart it locally when you need access.", "Agent 已离线，自动恢复已关闭。需要重新使用时请在该电脑上启动。")
            : tr("The stop request was accepted, but the Agent has not gone offline yet. Check the device status before retrying.", "停止请求已被接受，但设备尚未确认离线。请先检查设备状态，再决定是否重试。"),
        );
        return;
      }
      // The POST acknowledges the command, but the operating-system supervisor
      // can take several seconds to start (or may still fail). Confirm a live
      // guard from a fresh device snapshot before dismissing the spinner.
      setBackgroundPhase("verifying");
      const confirmed = await waitForRecoveryState(device.id, enabled, {
        read: async () => {
          const response = await fetch("/api/devices", {
            cache: "no-store",
            signal: AbortSignal.timeout(4_000),
          });
          if (!response.ok) throw new Error("Device status unavailable");
          return await response.json() as Device[];
        },
        pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      });
      await refreshAll();
      if (!confirmed) {
        await showNotice(
          tr("Still awaiting device confirmation", "仍在等待设备确认"),
          tr("The command was accepted, but the device has not confirmed the requested supervisor state. Check its displayed status or refresh before retrying.", "操作请求已接受，但设备尚未确认守护进程的目标状态。请先检查当前状态或刷新设备列表，再决定是否重试。"),
        );
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Background setting is unconfirmed", "后台设置尚未确认"), tr("The response was interrupted. Refresh the device state before trying again; the local setting may already have changed.", "响应已中断，请先刷新设备状态再尝试；本机设置可能已经发生变化。"));
    } finally {
      backgroundMutationInFlight.current = false;
      setBackgroundUpdatingId(null);
      setBackgroundTargetEnabled(null);
    }

  }

  async function updateDeviceRuntime(device: Device, paused: boolean) {
    if (UI_PREVIEW || runtimeMutationInFlight.current || backgroundMutationInFlight.current) return;
    if (device.status !== "online" || device.pause_agent_available !== true) return;
    runtimeMutationInFlight.current = true;
    setRuntimeUpdatingId(device.id);
    setRuntimeTargetPaused(paused);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/runtime", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll().catch(() => undefined);
        await showNotice(tr("Runtime change not accepted", "切换执行状态失败"),
          payload.error || tr("The current device cannot change runtime state.", "当前设备无法切换运行状态。"));
        return;
      }
      let confirmed = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        try {
          const result = await fetch("/api/devices", { cache: "no-store", signal: AbortSignal.timeout(4000) });
          if (!result.ok) continue;
          const list = await result.json() as Device[];
          const current = list.find((item) => item.id === device.id);
          if (current?.status === "online" && current.execution_paused === paused &&
            (paused ? current.tools.length === 0 : (current.available_tools?.length ?? 0) > 0)) {
            confirmed = true;
            break;
          }
        } catch { /* Transport failure does not prove a state transition. */ }
      }
      await refreshAll().catch(() => undefined);
      if (!confirmed) {
        await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
          tr("The handoff may still be taking place. Refresh the device state before retrying; no second request was sent.", "执行实例可能仍在交接，请刷新设备状态确认后再重试；系统没有重复发送指令。"));
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
        tr("The response was interrupted. Check whether the device is paused before retrying.", "请求中断，请检查设备是否已经暂停，再决定是否重试。"));
    } finally {
      runtimeMutationInFlight.current = false;
      setRuntimeUpdatingId(null);
      setRuntimeTargetPaused(null);
    }
  }

  async function updateDeviceTools(device: Device, tool: string, enabled: boolean) {
    const workspaceRequired = new Set([
      "write_file",
      "edit_block",
      "undo_last_change",
      "start_process",
    ]);
    if (enabled && workspaceRequired.has(tool) && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Remote Arc requires a Trusted Write Location before enabling this capability. Add one under File boundaries & recovery, then enable the tool again.",
          "Remote Arc 在开启此能力前必须先设置可信写入区域。请先在“文件边界与恢复”中添加目录，再重新开启。",
        ),
      );
      return;
    }
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
    if (preset !== "safe" && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Developer and Full Access are unavailable until this device has a Trusted Write Location.",
          "为设备指定可信写入区域后，才能开启 Developer 或 Full Access。",
        ),
      );
      return;
    }
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

  async function saveDeviceTaskPermission(device: Device, key: keyof DeviceTaskPermissions, enabled: boolean) {
    setDeviceTaskBusy(device.id);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/task-permissions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(device.automation_permissions || legacyTaskPermissions), [key]: enabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(tr("Task settings were not saved", "任务设置未保存"), payload.error || tr("Please try again.", "请重试。"));
      } else await refreshAll();
    } catch {
      await showNotice(tr("Task settings were not saved", "任务设置未保存"), tr("Connection failed. Please try again.", "连接失败，请重试。"));
    } finally { setDeviceTaskBusy(null); }
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

  async function loadDeviceExecutionLog(device: Device) {
    setExecutionLogLoading(device.id);
    setExecutionLogErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/execution-log?limit=100",
      );
      const payload = await response.json().catch(() => ({})) as {
        log?: DeviceExecutionLog;
        error?: string;
      };
      if (!response.ok || !payload.log) {
        setExecutionLogErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr(
              "Local execution log is unavailable on this device.",
              "这台设备暂时无法读取本地执行日志。",
            ),
        }));
        return;
      }
      setExecutionLogsByDevice((current) => ({
        ...current,
        [device.id]: payload.log!,
      }));
    } catch {
      setExecutionLogErrors((current) => ({
        ...current,
        [device.id]: tr(
          "Could not reach this device to read its execution log.",
          "无法连接到这台设备读取执行日志。",
        ),
      }));
    } finally {
      setExecutionLogLoading((current) => (current === device.id ? null : current));
    }
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

  const automationTime = (value: string | null) => {
    if (!value) return "—";
    const delta = new Date(value).getTime() - Date.now();
    if (delta <= 0) return timeAgo(value);
    if (delta < 60_000) return tr("in <1m", "<1 分钟后");
    if (delta < 3_600_000) return tr("in " + Math.ceil(delta / 60_000) + "m", Math.ceil(delta / 60_000) + " 分钟后");
    if (delta < 86_400_000) return tr("in " + Math.ceil(delta / 3_600_000) + "h", Math.ceil(delta / 3_600_000) + " 小时后");
    return tr("in " + Math.ceil(delta / 86_400_000) + "d", Math.ceil(delta / 86_400_000) + " 天后");
  };

  const automationDisplayKind = (automation: Automation): AutomationCreateKind => {
    if (automation.kind !== "goal_loop" || !automation.goal_json) return automation.kind;
    try {
      const goal = JSON.parse(automation.goal_json) as { type?: string };
      return goal?.type === "agent_goal" ? "agent_goal" : automation.kind;
    } catch {
      return automation.kind;
    }
  };

  const automationKindLabel = (kind: AutomationCreateKind) =>
    kind === "long_task"
      ? tr("Run once", "运行一次")
      : kind === "condition_watch"
        ? tr("After an event", "事件触发")
        : kind === "schedule_watch"
          ? tr("On a timer", "定时运行")
          : kind === "agent_goal"
            ? tr("Goal task", "目标任务")
            : tr("Repeat & check", "重复并验证");

  const automationStatusLabel = (value: AutomationStatus) =>
    value === "waiting"
      ? tr("Waiting", "等待中")
      : value === "running"
        ? tr("Running", "运行中")
        : value === "waiting_for_device"
          ? tr("Waiting for device", "等待设备")
          : value === "waiting_for_event"
            ? tr("Waiting for event", "等待事件")
            : value === "paused"
              ? tr("Paused", "已暂停")
                : value === "completed"
                  ? tr("Completed", "已完成")
                  : value === "failed"
                    ? tr("Failed", "失败")
                    : value === "cancelled"
                      ? tr("Cancelled", "已取消")
                      : tr("Expired", "已过期");

  const automationTerminal = (value: AutomationStatus) =>
    ["completed", "failed", "cancelled", "expired"].includes(value);

  const automationActiveCount = automations.filter((item) =>
    ["waiting", "running", "waiting_for_device", "waiting_for_event"].includes(item.status),
  ).length;
  const backgroundConfiguredCount = devices.filter((device) => device.background_enabled === true).length;
  const draftDevice = devices.find((device) => device.id === automationDraft.device_id);
  const draftPermissions = draftDevice?.automation_permissions || legacyTaskPermissions;
  const draftIsCloud = automationDraft.kind === "condition_watch" && automationDraft.condition_action === "github_merge";
  const draftAllowedTools = draftDevice?.allowed_tools;
  const draftRequiredTools = automationDraft.kind === "agent_goal" ? automationDraft.agent_allowed_tools : ["start_process"];
  const draftToolBlocked = !draftIsCloud && draftAllowedTools != null && draftRequiredTools.some(tool => !draftAllowedTools.includes(tool));
  const draftPermissionBlocked = draftToolBlocked || (!draftIsCloud && !!draftDevice && (!draftPermissions.background_tasks
    || (["at", "interval"].includes(automationDraft.trigger_mode) && !draftPermissions.scheduled_tasks)
    || (automationDraft.kind === "agent_goal" && (!draftPermissions.adaptive_agent || (automationDraft.agent_controller === "source" && !draftPermissions.source_agent)))));
  const draftServiceBlocked = taskCapabilities !== null && (
    (automationDraft.kind === "agent_goal" && automationDraft.agent_controller === "hosted" && !taskCapabilities.hosted_planner)
    || (draftIsCloud && !taskCapabilities.github_merge));
  const sourceHasSavedCommands = plannedDraft.enabled && plannedDraft.phases.some(phase => !!phase.command.trim());
  const draftStartTitle = automationDraft.trigger_mode === "event" ? tr("Waits for a matching event", "等待匹配事件")
    : automationDraft.trigger_mode === "at" ? tr("Starts at the selected time", "在所选时间启动")
    : automationDraft.trigger_mode === "interval" ? tr("First run after the interval", "首次执行在间隔结束后")
    : automationDraft.kind === "agent_goal" && automationDraft.agent_controller === "source" ? sourceHasSavedCommands ? tr("Saved steps can run; new decisions wait for your AI", "保存的步骤可执行，新决策等待你的 AI") : tr("Needs an AI decision before starting", "启动前需要 AI 提交决策")
    : tr("Queues as soon as you create it", "创建后立即排队");
  const draftStartDetail = automationDraft.kind === "agent_goal"
    ? automationDraft.agent_controller === "source"
      ? sourceHasSavedCommands
        ? tr("Your saved phase commands can run when due. Any new reasoning still needs your connected AI chat. Copy the task reference into that chat to continue; Remote Arc cannot wake it automatically.", "已保存的阶段命令可在到期后执行，任何新判断仍需要已连接的 AI 聊天。复制任务引用到聊天中即可接续，Remote Arc 无法自动唤起它。")
        : tr("This form saves a goal, not a decision from ChatGPT. Copy the new task reference into your connected AI chat so it can read the context and submit the next action. Remote Arc cannot wake the chat automatically.", "表单保存的是目标，并非 ChatGPT 的决策。创建后将任务引用复制到已连接的 AI 聊天，让它读取上下文并提交下一步。Remote Arc 无法自动唤起聊天。")
      : tr("A configured Remote Arc hosted model chooses actions from your approved tools. It uses this goal and its results, not your ChatGPT conversation. No chat is needed to start.", "已配置的 Remote Arc 托管模型从你批准的工具中选择操作，依据这里的目标和执行结果工作，不会读取 ChatGPT 对话。启动不需要聊天。")
    : automationDraft.kind === "condition_watch"
      ? tr("Connect the webhook returned after creation to your event source. Only a matching event runs the saved action; no AI chat is needed.", "创建后将返回的 Webhook 接入事件来源。只有匹配事件才会执行保存的操作，无需 AI 聊天。")
      : automationDraft.kind === "schedule_watch"
        ? tr("The first run follows the interval; later intervals start after the previous run finishes. Remote Arc repeats the saved command without AI planning until stopped or its limit is reached.", "首次执行在间隔结束后开始，后续间隔从上次执行结束后计算。Remote Arc 无需 AI 规划，重复保存的命令，直到停止或达到限制。")
        : automationDraft.kind === "goal_loop"
          ? tr("Remote Arc repeats the same work command, then runs your check. It stops when the check exits 0 or the attempt limit is reached. It does not rewrite the command using AI.", "Remote Arc 重复同一工作命令，再执行验证；验证退出码为 0 或达到轮数上限后停止。它不会用 AI 改写命令。")
          : tr("Remote Arc starts the exact command you enter and tracks it to completion. No chat or further AI decision is needed. Closing this page does not cancel it.", "Remote Arc 启动你填写的命令并跟踪到结束，无需聊天或进一步的 AI 决策。关闭此页面不会取消任务。");
  const automationAttentionCount = automations.filter(taskNeedsAttention).length;
  const automationNeedsAgentCount = automations.filter(taskNeedsAgent).length;
  const matchesTaskFilter = (item: Automation, filter: typeof automationFilter) =>
    filter === "all" || (filter === "attention" ? taskNeedsAttention(item)
      : filter === "finished" ? automationTerminal(item.status)
      : !automationTerminal(item.status) && item.status !== "paused");
  const visibleAutomations = automations.filter((item) => matchesTaskFilter(item, automationFilter))
    .filter((item) => !automationQuery.trim() || [item.id, item.name, deviceNameById.get(item.device_id || ""), automationKindLabel(automationDisplayKind(item))]
      .some((value) => value?.toLowerCase().includes(automationQuery.trim().toLowerCase())))
    .sort((a, b) => Number(taskNeedsAttention(b)) - Number(taskNeedsAttention(a)));
  const hasAttention = automationAttentionCount > 0 || devices.some((device) => device.status === "offline") || usagePct >= 80;

  const navItems: Array<[DashboardTab, string]> = [
    ["overview", tr("Overview", "概览")],
    ["devices", tr("Devices", "设备")],
    ["automations", tr("Tasks", "任务")],
    ["connect", tr("Connect AI", "连接 AI")],
    ["security", tr("Security", "安全")],
    ...(user.isAdmin ? [["monitor", tr("Monitor", "监控")] as [DashboardTab, string]] : []),
    ["settings", tr("Settings", "设置")],
  ];

  return (
    <div className="appFrame">
      <aside className="sidebar">
        <Brand />
        <nav className="sideNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
          {navItems.map(([id, label]) => (
            <button key={id} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
              <span className="sideNavIcon"><DashboardNavIcon tab={id} /></span>
              <span className="sideNavLabel">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarStatus"><div className="livePulse"/><div><strong>{tr("Relay online", "Relay 在线")}</strong><span>mcp.remotearc.app</span></div></div>
        <div className="sidebarAccount">
          {user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <div className="avatarFallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>}
          <div><strong>{user.name || "Owner"}</strong><span>{user.email}</span></div>
          <button onClick={() => void signOut()} aria-label={tr("Sign out", "退出登录")}>↪</button>
        </div>
      </aside>

      <main className="dashboardMain">
        {UI_PREVIEW && (
          <div className="previewModeBanner" role="status">
            <strong>PR PREVIEW</strong>
            <span>{tr("Mock data · read-only · no production OAuth, D1, MCP or device state", "模拟数据 · 只读 · 不连接生产 OAuth、D1、MCP 或设备状态")}</span>
          </div>
        )}
        <header className="mobileTopbar"><Brand/><div className="mobileActions"><ThemeSwitcher compact/><button className="addButton compact" onClick={() => setShowAdd(true)}>+ {tr("Device", "设备")}</button></div></header>

        {active === "overview" && (
          <>
            <section className="overviewTopbar">
              <div>
                <span className="eyebrow">{tr("OVERVIEW", "概览")}</span>
                <h1>{tr("Your workspace", "我的工作台")}</h1>
                <p>{tr("See what is running, what needs attention, and which computers are ready.", "查看任务进展、待处理问题，以及电脑是否准备就绪。")}</p>
              </div>
              <div className="overviewActions">
                <button className="ghostButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
                <button className="addButton goldButton" onClick={() => { if (!hasPlus) { location.href = MARKETING_ORIGIN + "/pricing"; return; } navigateTab("automations"); setShowAutomationCreate(true); }}>{hasPlus ? "+ " + tr("New task", "新建任务") : tr("Plus tasks", "Plus 任务")}</button>
              </div>
            </section>
            <section className="overviewStatusGrid">
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Devices online", "在线设备")}</span><i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} /></div><strong>{status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
              <article className="overviewStatusCard taskStatusCard"><div className="statusCardHead"><span>{tr("Active tasks", "活动任务")}</span><i className={"healthDot " + (automationAttentionCount ? "idle" : "good")} /></div><strong>{automationLoadError ? "—" : automationActiveCount}</strong><button onClick={() => { setAutomationFilter(automationAttentionCount ? "attention" : "active"); navigateTab("automations"); }}>{automationLoadError ? tr("Retry loading tasks", "重新加载任务") : automationAttentionCount ? automationAttentionCount + " " + tr("need attention", "项需要处理") : tr("View progress", "查看进度")} →</button></article>
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
                  <button onClick={() => navigateTab("automations")}><span>↻</span><div><strong>{tr("Long-running work", "持续工作")}</strong><small>{tr("Agent goals, schedules and results", "Agent 目标、定时任务与结果")}</small></div></button>
                </div>
              </article>
              <article className="overviewAttentionCard">
                <span className="eyebrow">{tr("ATTENTION", "需要关注")}</span>
                <div className="attentionList">
                  {!!automationAttentionCount && <button onClick={() => { setAutomationFilter("attention"); navigateTab("automations"); }}><i className="attentionIcon warn">!</i><div><strong>{automationAttentionCount} {tr("task(s) need attention", "项任务需要处理")}</strong><small>{automationNeedsAgentCount ? tr("Some goals are waiting for the source AI to continue.", "部分目标正在等待来源 AI 继续决策。") : tr("Check disconnected devices or failed runs.", "检查离线设备或失败的执行。")}</small></div></button>}
                  {automationLoadError && <button onClick={() => void refreshAutomations()}><i className="attentionIcon warn">!</i><div><strong>{tr("Task status unavailable", "任务状态暂不可用")}</strong><small>{tr("Retry to see current progress.", "点击重试以查看当前进度。")}</small></div></button>}
                  {!devices.length && <button onClick={() => setShowAdd(true)}><i className="attentionIcon warn">!</i><div><strong>{tr("No computer paired", "还没有配对电脑")}</strong><small>{tr("Pair your first device to start using Remote Arc.", "先配对第一台设备即可开始使用 Remote Arc。")}</small></div></button>}
                  {!!devices.length && devices.some((device) => device.status === "offline") && <button onClick={() => navigateTab("devices")}><i className="attentionIcon idle">•</i><div><strong>{tr("Some devices are offline", "部分设备离线")}</strong><small>{devices.filter((device) => device.status === "offline").length} {tr("device(s) unavailable for MCP calls", "台设备当前无法接受 MCP 调用")}</small></div></button>}
                  {usagePct >= 80 && <button onClick={() => navigateTab("settings")}><i className="attentionIcon warn">!</i><div><strong>{tr("Usage is getting high", "本月额度使用较高")}</strong><small>{Math.round(usagePct)}% {tr("of your monthly hosted allowance is used", "的每月托管额度已使用")}</small></div></button>}
                  {(status?.onlineDevices ?? 0) > 0 && !hasAttention && !automationLoadError && <div className="attentionClear"><i>✓</i><div><strong>{tr("Everything looks good", "当前状态良好")}</strong><small>{tr("Devices are online and no tasks need attention.", "设备在线，目前没有待处理任务。")}</small></div></div>}
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
                      <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
                    </button>
                  ))}
                  {!devices.length && <button className="overviewDeviceRow empty" onClick={() => setShowAdd(true)}><div className="deviceIcon">＋</div><div><strong>{tr("Add your first computer", "添加第一台电脑")}</strong><span>{tr("One command, then approve in your browser", "一条命令，然后在浏览器确认")}</span></div></button>}
                </div>
              </div>

              <div className="panelBlock overviewActivityPanel">
                <div className="blockHeader"><div><span className="eyebrow">{tr("RECENT ACTIVITY", "最近活动")}</span><h2>{tr("What Remote Arc did", "Remote Arc 最近做了什么")}</h2></div><span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span></div>
                <div className="activityList">
                  {(status?.recentActivity || []).map((event) => (
                    <div className="activityItem" key={event.id}><i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i><div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div></div>
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

            <section className="deviceToolbar">
              <div className="deviceSearch">
                <span>⌕</span>
                <input aria-label={tr("Search devices", "搜索设备")} value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder={tr("Search devices, hostname or ID", "搜索设备、Hostname 或 ID")} />
              </div>
              <div className="deviceFilters" role="group" aria-label={tr("Device status filter", "设备状态筛选")}>
                {(["all", "online", "offline"] as const).map((filter) => (
                  <button key={filter} aria-pressed={deviceFilter === filter} className={deviceFilter === filter ? "active" : ""} onClick={() => setDeviceFilter(filter)}>
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
                const executionLog = executionLogsByDevice[device.id];
                const executionLogError = executionLogErrors[device.id];
                const runtimeVersion = device.agent_version
                  ? device.platform === "browser"
                    ? device.agent_version.replace(/^browser-/, "")
                    : device.agent_version
                  : null;
                const recoveryVersion = device.recovery_bundle_version || null;
                const updateAvailable =
                  device.platform !== "browser" &&
                  Boolean(runtimeVersion) &&
                  isOlderRelease(runtimeVersion);
                const updateCommand =
                  device.background_enabled === true
                    ? `npx -y remotelink@${LATEST_AGENT_VERSION} --background`
                    : `npx -y remotelink@${LATEST_AGENT_VERSION}`;
                return (
                  <article className={"deviceCard managed " + device.status} key={device.id}>
                    <div className="deviceTop">
                      <div className="deviceIdentity">
                        <div className="deviceIcon large">{platformGlyph(device.platform)}</div>
                        <div><h3>{device.name}</h3><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "未提供主机名")}</span></div>
                      </div>
                      <div className="deviceOverviewActions">
                        {updateAvailable && <span className="badge updateAvailable"><i/>{tr("Update available", "可更新")}</span>}
                        <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
                        <button className="ghostButton" aria-expanded={managedDeviceId === device.id} aria-controls={"device-management-" + device.id} aria-label={tr("Manage " + device.name, "管理 " + device.name)} onClick={() => { setManagedDeviceId(managedDeviceId === device.id ? null : device.id); setDevicePanel("access"); }}>{managedDeviceId === device.id ? tr("Close", "收起") : tr("Manage", "管理")}</button>
                      </div>
                    </div>

                    <div className="deviceOverviewFacts">
                      <span><i aria-hidden="true">◇</i>{accessPreset === "safe" ? tr("Read only", "只读访问") : accessPreset === "developer" ? tr("Read & edit", "读取与编辑") : accessPreset === "full" ? tr("Terminal enabled", "已启用终端") : tr("Custom permissions", "自定义权限")}</span>
                      <span className="deviceRuntimeVersion"><i aria-hidden="true">⌁</i>{device.platform === "browser" ? tr("Browser", "浏览器") : tr("Running", "运行中")} {runtimeVersion ? "v" + runtimeVersion : tr("version unknown", "版本未知")}{device.platform !== "browser" && recoveryVersion && recoveryVersion !== runtimeVersion ? " · " + tr("Recovery", "恢复包") + " v" + recoveryVersion : ""}{updateAvailable ? " · " + tr("Latest", "最新") + " v" + LATEST_AGENT_VERSION : ""}</span>
                      <span>{(device.workspace_roots || []).length} {tr("trusted folders", "个可信目录")}</span>
                      <span>{device.background_guard_active ? tr("Recovery supervisor running", "恢复守护运行中") : device.background_enabled ? tr("Startup configured · recovery unconfirmed", "自启已配置，恢复待确认") : tr("Automatic recovery off", "自动恢复关闭")}</span>
                      <span>{tr("Seen ", "最后在线：")}{timeAgo(device.last_seen)}</span>
                    </div>
                    {device.status === "offline" && <p className="deviceOfflineHint">{tr("Tasks wait until this computer reconnects. Remote Arc cannot power it on.", "任务会等待这台电脑重新连接，Remote Arc 无法远程开机。")}</p>}
                    <div id={"device-management-" + device.id} hidden={managedDeviceId !== device.id} className="deviceManagementPanel">
                      {managedDeviceId === device.id && <>
                        <div className="deviceManagementTabs" role="group" aria-label={tr("Device settings", "设备设置")}>
                          {([ ["access", tr("Access & files", "权限与文件")], ["tasks", tr("Background & tasks", "后台与任务")], ["activity", tr("Activity & details", "活动与详情")] ] as const).map(([panel, label]) => <button key={panel} aria-pressed={devicePanel === panel} className={devicePanel === panel ? "active" : ""} onClick={() => {
                            setDevicePanel(panel);
                            if (
                              panel === "activity" &&
                              device.status === "online" &&
                              !executionLog &&
                              executionLogLoading !== device.id
                            ) {
                              void loadDeviceExecutionLog(device);
                            }
                          }}>{label}</button>)}
                        </div>
                        <section aria-label={tr("Access and files", "权限与文件")} hidden={devicePanel !== "access"}>
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
                            tool === "read_binary_file"
                              ? tr("Plus capability: read bounded binary byte ranges. This device switch is still required in addition to the account plan.", "Plus 能力：读取有界的二进制字节区间。除账户套餐外，这个设备开关仍必须开启。")
                              : tool === "undo_last_change"
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
                            : tr("read-only until scoped", "未设范围时仅只读")}
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
                                "Always protects built-in credential locations such as .ssh, .aws, browser profiles and .env files for remote MCP. Use a narrow exception below when one specific path must be accessible.",
                                "远程 MCP 始终保护 .ssh、.aws、浏览器配置、.env 等内置敏感位置；确需访问某个路径时，请在下方添加窄范围例外。",
                              )}
                            />
                          </div>
                          <span className="privacyPill">{tr("Always on", "始终开启")}</span>
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Trusted Write Locations", "可信写入区域")}</strong>
                              <HelpTip
                                label={tr("About Trusted Write Locations", "了解可信写入区域")}
                                text={tr(
                                  "These are trusted mutation roots. Read-only tools may inspect other non-sensitive paths, but file changes and terminal execution require a configured workspace.",
                                  "这些目录是长期可信的修改区域。只读工具仍可查看其他非敏感路径，但文件修改与终端执行必须先配置工作区。",
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
                                "No trusted write workspace yet. Read-only access to non-sensitive paths still works.",
                                "尚未设置可信写入工作区；仍可只读访问其他非敏感路径。",
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
                                  "Keep protection enabled globally, but explicitly allow only the sensitive files or folders this device truly needs. A sensitive-path exception grants visibility only; it does not create write authority outside Trusted Write Locations.",
                                  "保持整体敏感路径保护开启，只对确实需要访问的敏感文件或目录做窄范围例外；敏感路径例外只授予可见性，不会自动获得可信写入区域之外的修改权限。",
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

                        </section>
                        <section aria-label={tr("Background and tasks", "后台与任务")} hidden={devicePanel !== "tasks"}>
                    {updateAvailable && (
                      <div className="deviceBackgroundRow deviceUpdateRow">
                        <div>
                          <strong>{tr("Remote Arc update available", "Remote Arc 有可用更新")}</strong>
                          <span>{tr("Running: ", "运行版本：")}v{runtimeVersion} · {tr("Latest: ", "最新版本：")}v{LATEST_AGENT_VERSION}</span>
                          {recoveryVersion && <span>{tr("Installed recovery bundle: ", "已安装恢复包：")}v{recoveryVersion}</span>}
                          <span>{device.background_enabled === true
                            ? tr("The update command performs a controlled handoff to the new background Agent without creating a second executor.", "更新命令会安全交接到新版后台 Agent，不会创建第二个执行器。")
                            : tr("Automatic recovery is off. Stop the current Agent before starting the newer foreground version.", "自动恢复未开启。启动新版前台 Agent 前，请先停止当前 Agent。")}</span>
                        </div>
                        <button className="ghostButton small" onClick={async () => {
                          try {
                            if (navigator.clipboard) await navigator.clipboard.writeText(updateCommand);
                            await showNotice(
                              tr("Update command", "更新命令"),
                              updateCommand + (navigator.clipboard ? "\n\n" + tr("Copied to clipboard.", "已复制到剪贴板。") : ""),
                            );
                          } catch {
                            await showNotice(tr("Update command", "更新命令"), updateCommand);
                          }
                        }}>{tr("Copy update command", "复制更新命令")}</button>
                      </div>
                    )}
                    <div className="deviceBackgroundRow" aria-busy={backgroundUpdatingId === device.id}>
                      <div>
                        <div className="labelWithHelp">
                          <strong>{tr("Automatic recovery", "自动恢复")}</strong>
                          <HelpTip label={tr("About automatic recovery", "了解自动恢复")}
                            text={tr("The switch enables a local supervisor and login startup. It keeps your terminal and operation log open, and takes over if the executing Agent ends. Relay reconnect handles network interruptions separately. Turning recovery off preserves current execution; Stop background Agent also ends its work. Sleep, shutdown and logout can still make the device unavailable.", "此开关启用本机守护和登录自启，保留终端及操作日志，执行 Agent 结束后由守护接手。网络中断由独立的 Relay 重连处理。关闭恢复会保留当前执行；“停止后台 Agent”还会结束它的工作。睡眠、关机或退出登录仍可能让电脑不可用。")}/>
                        </div>
                        <span>{backgroundUpdatingId === device.id
                          ? backgroundPhase === "applying" ? tr("Sending device command…", "正在发送设备指令…") : backgroundPhase === "stopping" ? tr("Waiting for Agent to disconnect…", "正在等待 Agent 离线…") : tr("Waiting for supervisor confirmation…", "正在确认后台守护进程…")
                          : device.status !== "online" ? tr("Reconnect to verify the local recovery setting", "重新连接后可确认本机恢复设置") : device.background_recovery_available
                          ? device.background_enabled ? tr("Enabled · login startup and process recovery", "已启用 · 登录自启与进程恢复") : tr("Off · current execution continues", "已关闭 · 当前执行继续")
                          : tr("Older client · login startup only. Update to keep the terminal attached and recover processes.", "旧版客户端仅提供登录自启。更新客户端后支持保留终端与进程恢复。")}</span>
                        <span>{tr("Supervisor: ", "守护：")}{device.background_guard_active
                          ? tr("Running", "运行中") + (device.background_guard_pid ? " · PID " + device.background_guard_pid : "")
                          : device.status !== "online" ? tr("Unconfirmed while offline", "离线，无法确认") : tr("Not confirmed", "尚未确认")}</span>
                        <span>{tr("Execution: ", "执行：")}{device.status !== "online" ? tr("Disconnected from Relay", "Relay 已断开")
                          : device.execution_paused === true ? tr("Paused · wake-only control connected", "已暂停 · 仅唤醒控制通道在线")
                          : device.execution_mode === "foreground" ? tr("Foreground Agent connected", "前台 Agent 已连接")
                          : device.background_active ? tr("Background Agent connected", "后台 Agent 已连接") : tr("Agent connected", "Agent 已连接")}
                          {device.agent_pid ? " · PID " + device.agent_pid : ""}{device.agent_version ? " · v" + device.agent_version : ""}</span>
                      </div>
                      <div className="managedProcessActions backgroundRecoveryControls">
                        <span className="backgroundToggleProgress" data-pending={backgroundUpdatingId === device.id} id={"background-toggle-progress-" + device.id} role="status" aria-live="polite" aria-label={backgroundUpdatingId === device.id ? tr("Verifying background recovery on device", "正在设备上确认后台恢复") : undefined}>
                          <span className="backgroundToggleSpinner" aria-hidden="true" />
                        </span>
                        {device.background_enabled === true && device.background_guard_active !== true && device.status === "online" && device.background_recovery_available && (
                          <button className="ghostButton small" disabled={UI_PREVIEW || backgroundUpdatingId === device.id} onClick={() => void updateDeviceBackground(device, true, false)}>{tr("Repair recovery", "修复恢复")}</button>
                        )}
                        {device.status === "online" && (
                          <button
                            className="dangerButton small"
                            disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.stop_agent_available !== true}
                            title={device.stop_agent_available ? tr("Disable auto-recovery and stop this computer's Agent.", "关闭自动恢复并停止此电脑的 Agent。") : tr("Update this computer's Agent to use remote Stop Agent.", "请先升级此电脑 Agent，才能远程停止。")}
                            onClick={async () => {
                              if (await askConfirm(
                                tr("Disconnect this computer completely?", "完全断开这台电脑？"),
                                tr("This disables BOTH the execution Agent and the wake-only connection, and turns off future automatic recovery. Remote Arc cannot remotely start a fully disconnected computer. You must restart it locally.", "这会同时停止执行 Agent 和仅唤醒连接，并关闭之后的自动恢复。完全断开后 Remote Arc 无法再远程启动这台电脑，必须从本机重新启动。"),
                              )) await updateDeviceBackground(device, false, true);
                            }}
                          >{device.stop_agent_available ? tr("Disconnect completely", "完全断开") : tr("Disconnect · update needed", "断开 · 需升级")}</button>
                        )}
                        <label className="compactSwitch">
                          <input type="checkbox" aria-label={tr("Automatic recovery", "自动恢复")}
                            checked={backgroundUpdatingId === device.id && backgroundTargetEnabled !== null ? backgroundTargetEnabled : device.background_enabled === true}
                            disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.execution_paused === true || device.status !== "online" || !device.background_agent_available}
                            aria-describedby={backgroundUpdatingId === device.id ? "background-toggle-progress-" + device.id : undefined}
                            onChange={async (event) => {
                              const enabled = event.target.checked;
                              if (enabled && !device.background_recovery_available) {
                                await showNotice(tr("Update remotelink first", "请先更新 remotelink"), tr("This Agent predates process recovery and exits the terminal when enabling background mode. Use the updated CLI before enabling recovery.", "当前 Agent 尚不支持进程恢复，启用旧版后台模式会退出终端。请先使用更新后的 CLI 再启用恢复。")); return;
                              }
                              await updateDeviceBackground(device, enabled, false);
                            }}/><span/>
                        </label>
                      </div>
                    </div>

                    <div className="deviceBackgroundRow deviceRuntimePauseRow" aria-busy={runtimeUpdatingId === device.id}>
                      <div>
                        <strong>{tr("Execution control", "执行控制")}</strong>
                        <span>{runtimeUpdatingId === device.id
                          ? runtimeTargetPaused ? tr("Pausing execution and connecting the wake-only channel…", "正在停止执行并切换至仅唤醒通道…") : tr("Restoring the execution Agent…", "正在恢复执行 Agent…")
                          : device.status !== "online" ? tr("Fully disconnected · restart Remote Arc locally", "已完全断开 · 请在电脑本机启动 Remote Arc")
                          : device.execution_paused ? tr("Paused · computer tools are blocked; dashboard wake control stays connected", "已暂停 · 电脑操作已封锁，Dashboard 唤醒控制仍在线")
                          : tr("Running · AI computer tools can execute according to device permissions", "运行中 · AI 可按设备权限执行电脑操作")}</span>
                        <span>{tr("Pause keeps a minimal authenticated wake channel. Disconnect completely closes it as well.", "暂停时保留最小授权唤醒通道；完全断开则连该通道一起关闭。")}</span>
                      </div>
                      <div className="managedProcessActions backgroundRecoveryControls">
                        <span className="backgroundToggleProgress" data-pending={runtimeUpdatingId === device.id} role="status" aria-live="polite">
                          <span className="backgroundToggleSpinner" aria-hidden="true" />
                        </span>
                        <button className="ghostButton small"
                          disabled={UI_PREVIEW || !!backgroundUpdatingId || !!runtimeUpdatingId || device.status !== "online" || device.pause_agent_available !== true || (!device.execution_paused && (!device.background_enabled || !device.background_guard_active))}
                          title={device.pause_agent_available ? tr("Switch between full execution and wake-only control.", "切换完整执行和仅唤醒控制。") : tr("Upgrade remotelink for remote Pause / Resume.", "请升级 remotelink 后使用远程暂停与恢复。")}
                          onClick={async () => {
                            const resume = device.execution_paused === true;
                            if (!resume && !await askConfirm(
                              tr("Pause computer execution?", "暂停这台电脑的执行？"),
                              tr("Remote file/terminal tools will stop working and running managed operations may be interrupted. Only a minimal authenticated wake connection stays online so you can resume from Dashboard.", "远程文件与终端工具将不可用，正在执行的受管操作可能中断。设备仅保留最小授权唤醒连接，之后可通过 Dashboard 恢复。"),
                            )) return;
                            await updateDeviceRuntime(device, !device.execution_paused);
                          }}
                        >{device.pause_agent_available ? device.execution_paused ? tr("Resume Agent", "恢复 Agent") : tr("Pause Agent", "暂停 Agent") : tr("Pause / Resume · update needed", "暂停 / 恢复 · 需升级")}</button>
                      </div>
                    </div>

                    <details className="deviceTaskSettings" open>
                      <summary>{tr("Task permissions", "任务权限")}<span>{Object.values(device.automation_permissions || legacyTaskPermissions).filter(Boolean).length} / 5 {tr("enabled", "已开启")}</span></summary>
                      <p>{tr("Choose which background capabilities this computer allows. Turning a permission off stops affected tasks. Choose a task mode when creating each task.", "选择这台电脑允许使用的后台能力。关闭权限会停止相关任务；每个任务的模式在创建任务时选择。")}</p>
                      {([
                        ["background_tasks", tr("Background tasks", "后台任务")],
                        ["scheduled_tasks", tr("Scheduled tasks", "定时任务")],
                        ["adaptive_agent", tr("Adaptive Agent Goals", "自主 Agent 目标任务")],
                        ["source_agent", tr("Continue with the source agent", "由当前 AI 客户端持续推进")],
                        ["keep_awake", tr("Allow a task to keep this computer awake", "允许任务期间保持电脑唤醒")],
                      ] as Array<[keyof DeviceTaskPermissions, string]>).map(([key, label]) => (
                        <div className="deviceBackgroundRow" key={key}>
                          <strong>{label}</strong>
                          <label className="compactSwitch">
                            <input type="checkbox" aria-label={label}
                              checked={(device.automation_permissions || legacyTaskPermissions)[key]}
                              disabled={UI_PREVIEW || !!deviceTaskBusy || (key === "keep_awake" && !device.keep_awake_available)}
                              onChange={(event) => void saveDeviceTaskPermission(device, key, event.target.checked)} />
                            <span />
                          </label>
                        </div>
                      ))}
                      {!device.keep_awake_available && <p>{tr("Keeping awake requires an updated device agent. Login autostart alone does not prevent sleep.", "保持唤醒需要新版设备 Agent。仅开启登录自启不会阻止电脑睡眠。")}</p>}
                      <a href="/docs/long-running-work">{tr("How long-running work operates", "了解长任务如何运行")} →</a>
                    </details>

                        </section>
                        <section aria-label={tr("Activity and details", "活动与详情")} hidden={devicePanel !== "activity"}>
                          <div className="deviceTechnicalIdentity"><span>{tr("Device ID", "设备 ID")} <code>{device.id}</code></span><span>{tr("Architecture", "架构")} <code>{device.arch || "—"}</code></span></div>

                    <div className="deviceExecutionLogPanel">
                      <div className="policyBlockHead">
                        <div>
                          <strong>{tr("Device execution log", "设备执行日志")}</strong>
                          <p>{tr(
                            "Read on demand from this computer's local Remote Arc operation log. File contents, full command output and raw MCP payloads are not stored here.",
                            "按需读取这台电脑本地的 Remote Arc 操作日志。这里不会保存文件内容、完整命令输出或原始 MCP Payload。",
                          )}</p>
                        </div>
                        <button
                          className="ghostButton small"
                          disabled={device.status !== "online" || executionLogLoading === device.id}
                          onClick={() => void loadDeviceExecutionLog(device)}
                        >
                          {executionLogLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh log", "刷新日志")}
                        </button>
                      </div>

                      {device.status !== "online" && (
                        <p className="policyWarning">{tr(
                          "This device is offline. Its execution log remains local and can be read after it reconnects.",
                          "这台设备当前离线。执行日志仍保留在本机，重新上线后即可读取。",
                        )}</p>
                      )}

                      {!!executionLogError && (
                        <p className="policyWarning">{executionLogError}</p>
                      )}

                      {!!executionLog?.lines.length && (
                        <>
                          <div className="deviceExecutionLogMeta">
                            <span>{tr("Source", "来源")}: {tr("Local device", "本机")}</span>
                            <span>{executionLog.updated_at
                              ? tr("Updated ", "更新于 ") + timeAgo(executionLog.updated_at)
                              : tr("No timestamp", "无时间戳")}</span>
                            {executionLog.truncated && <span>{tr("Showing recent entries", "仅显示最近记录")}</span>}
                          </div>
                          <div className="deviceExecutionLog" role="log" aria-label={tr("Recent Remote Arc execution log", "最近 Remote Arc 执行日志")}>
                            {executionLog.lines.map((line, index) => (
                              <code
                                key={index}
                                className={
                                  line.includes("  error  ") || line.includes("tool.fail")
                                    ? "error"
                                    : line.includes("  warn  ")
                                      ? "warn"
                                      : line.includes("  success  ") || line.includes("tool.done")
                                        ? "success"
                                        : line.includes("  event  ") || line.includes("tool.call")
                                          ? "event"
                                          : ""
                                }
                              >
                                {line}
                              </code>
                            ))}
                          </div>
                        </>
                      )}

                      {executionLog !== undefined &&
                        !executionLog.lines.length &&
                        !executionLogError && (
                          <p className="policyEmpty">{tr(
                            "No Remote Arc execution events have been recorded locally yet.",
                            "本机暂时还没有 Remote Arc 执行记录。",
                          )}</p>
                        )}
                    </div>

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
                                "Only workload processes started with Remote Arc's managed process mode appear here. The Remote Arc connection agent itself is shown separately under Background connection above.",
                                "这里只显示通过 Remote Arc 后台进程模式启动的工作负载。Remote Arc 自己的连接 Agent 会单独显示在“后台与任务”页。",
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
                    </div>
                        </section>
                    <div className="deviceDangerZone">
                      <div>
                        <strong>{tr("Forget device", "删除设备")}</strong>
                        <span>{tr(
                          "Remove this pairing from Remote Arc. Local files stay untouched, and this runtime can be paired again later.",
                          "从 Remote Arc 删除这条设备配对。本机文件不会被删除，之后仍可以重新配对这个运行环境。",
                        )}</span>
                      </div>
                      <button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Forget device", "删除设备")}</button>
                    </div>
                      </>}
                    </div>
                  </article>
                );
              })}

              {!devices.length && <article className="emptyCard wide deviceEmptyState"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button className="goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add your first device", "添加第一台设备")}</button></article>}
              {!!devices.length && !filteredDevices.length && <article className="emptyCard wide"><div className="emptyIcon">⌕</div><h3>{tr("No matching devices", "没有匹配设备")}</h3><p>{tr("Try another search or clear the status filter.", "尝试其他搜索词，或清除状态筛选。")}</p><button onClick={() => { setDeviceQuery(""); setDeviceFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></article>}
            </div>
          </>
        )}

        {active === "automations" && (
          <>
            <section className="overviewTopbar automationPageHeader">
              <div>
                <span className="eyebrow">{tr("TASKS", "任务")}</span>
                <h1>{tr("Tasks", "任务")}</h1>
                <p>{tr(
                  "Ask your AI to create ongoing work in chat. Track, inspect and control those same tasks here.",
                  "在 AI 聊天里提出持续任务，AI 会在授权范围内创建并保存。在这里查看和管理同一条任务。",
                )}</p>
              </div>
              <div className="automationHeaderActions">
                <button className="ghostButton" disabled={automationLoading} onClick={() => void refreshAutomations()}>
                  {automationLoading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}
                </button>
                <button
                  className="ghostButton"
                  onClick={() => {
                    if (!hasPlus) { location.href = MARKETING_ORIGIN + "/pricing"; return; }
                    setCreatedWebhook(null);
                    setShowAutomationCreate((value) => !value);
                  }}
                >
                  {showAutomationCreate ? tr("Close", "关闭") : hasPlus ? "+ " + tr("Create manually", "手动创建") : tr("Plus · create task", "Plus · 创建任务")}
                </button>
              </div>
            </section>

            {!hasPlus && (
              <aside className="automationPlanNotice">
                <div>
                  <span className="eyebrow">REMOTE ARC PLUS</span>
                  <strong>{tr("24/7-capable durable work lives in Plus.", "支持 24/7 持续编排的持久任务属于 Plus。")}</strong>
                  <p>{tr(
                    "Plus enables overnight and long Tasks, schedules, planned Agent Goals, keep-awake on supported devices, and binary-file reads. Your device permissions still remain the final execution boundary.",
                    "Plus 提供隔夜与长任务、定时任务、计划模式 Agent Goal、受支持设备的保持唤醒，以及二进制文件读取；设备权限仍然是最终执行边界。",
                  )}</p>
                </div>
                <a className="ghostButton" href={MARKETING_ORIGIN + "/pricing"}>{tr("Compare Free & Plus", "对比 Free 与 Plus")} →</a>
              </aside>
            )}

            {taskScheduler && taskScheduler.state !== "healthy" && <aside className="automationAttention" role="status"><div><strong>{tr("Task scheduling needs attention", "任务调度需要处理")}</strong><span>{tr("The scheduler has no recent successful heartbeat. Saved tasks may not start until the deployment is repaired.", "调度器没有近期成功心跳。部署修复前，已保存任务可能无法启动。")}{taskScheduler.overdue_count > 0 && ` ${taskScheduler.overdue_count} ${tr("overdue tasks", "条任务已延迟")}`}</span></div></aside>}
            <details className="taskStartGuide"><summary>{tr("What happens if I create a task without an AI chat?", "不在 AI 聊天中交代，直接创建任务会发生什么？")}</summary>
              <p>{tr("The instructions in this form are the task. Commands run on their own; timers and events wait for their trigger. A hosted AI goal needs a configured model. A goal using your chat's AI waits for that AI to submit a decision. Remote Arc does not read or start your chats.", "表单里的指令就是任务。命令可独立执行，定时和事件任务等待触发。托管 AI 目标需要配置好的模型；使用聊天 AI 的目标则等待它提交决策。Remote Arc 不会读取或自动开启你的聊天。")}</p>
              <a href="/docs/long-running-work">{tr("Read the task guide", "阅读任务指南")} →</a>
            </details>
            {createdTask && <aside className="taskCreatedNotice" role="status"><div><strong>{tr("Task saved · execution status below", "任务已保存 · 执行状态见下方")} · {createdTask.name}</strong><p>{createdTaskOutcome?.title}</p><p>{createdTaskOutcome?.detail}</p></div><button className="ghostButton" onClick={() => { setCreatedTask(null); setAutomationQuery(""); }}>{tr("Show all tasks", "查看全部任务")}</button></aside>}

            {createdWebhook && (
              <section className="automationWebhookNotice">
                <div>
                  <span className="eyebrow">{tr("WEBHOOK CREATED", "WEBHOOK 已创建")}</span>
                  <strong>{tr("Copy this URL now. It is shown only after creation.", "请现在复制这个 URL；它只会在创建后返回一次。")}</strong>
                  <p>{tr(
                    "Treat it like a secret bearer capability. For GitHub, add it as a repository webhook with JSON payloads and the workflow_run event.",
                    "把它当作秘密 Bearer Capability。GitHub 中可将它添加为仓库 Webhook，Payload 使用 JSON，并监听 workflow_run 事件。",
                  )}</p>
                </div>
                <div className="automationWebhookValue">
                  <code>{createdWebhook}</code>
                  <CopyButton value={createdWebhook} />
                </div>
                <button className="ghostButton small" onClick={() => setCreatedWebhook(null)}>{tr("Dismiss", "关闭")}</button>
              </section>
            )}

            {showAutomationCreate && (
              <section className="automationCreatePanel">
                <div className="automationCreateIntro">
                  <div>
                    <span className="eyebrow">{tr("OPTIONAL · MANUAL CREATION", "可选 · 手动创建")}</span>
                    <h2>{tr("Give the work a goal", "给工作一个目标")}</h2>
                  </div>
                  <p>{tr(
                    "One goal can include a plan and hours of work. Choose its executor and start condition; the Dashboard tracks the same task created from your AI chat.",
                    "同一个目标可以包含计划和数小时工作。选择执行器及启动条件；Dashboard 也会跟踪 AI 聊天创建的同一条任务。",
                  )}</p>
                </div>

                <div className="automationKindTabs taskIntentTabs" role="group" aria-label={tr("Task intent", "任务意图")}>
                  <button type="button" className={automationDraft.kind === "agent_goal" ? "active" : ""} aria-pressed={automationDraft.kind === "agent_goal"} onClick={() => setAutomationDraft(current => ({ ...current, kind: "agent_goal" }))}>
                    <strong>{tr("Complete a goal", "完成一个目标")}</strong><small>{tr("Plan, act, check and adapt within your time budget.", "在时间预算内规划、执行、验证并调整。")}</small>
                  </button>
                  <button type="button" className={automationDraft.kind !== "agent_goal" ? "active" : ""} aria-pressed={automationDraft.kind !== "agent_goal"} onClick={() => setAutomationDraft(current => ({ ...current, kind: current.trigger_mode === "event" ? "condition_watch" : ["at", "interval"].includes(current.trigger_mode) ? "schedule_watch" : "long_task" }))}>
                    <strong>{tr("Command automation", "命令自动化")}</strong><small>{tr("Advanced: run explicit shell code or a cloud action.", "高级：运行明确的 shell 代码或云端操作。")}</small>
                  </button>
                </div>
                <div className="automationForm taskTriggerControls">
                  <label className="automationField"><span>{tr("When should it start?", "何时启动？")}</span>
                    <select value={automationDraft.trigger_mode} onChange={event => { const mode = event.target.value as AutomationDraft["trigger_mode"]; setAutomationDraft(current => ({ ...current, trigger_mode: mode, kind: current.kind === "agent_goal" ? "agent_goal" : mode === "event" ? "condition_watch" : ["at", "interval"].includes(mode) ? "schedule_watch" : "long_task" })); }}>
                      <option value="now">{tr("Now", "现在")}</option><option value="at">{tr("At a time", "指定时间")}</option><option value="interval">{tr("Repeat at an interval", "按间隔重复")}</option><option value="event">{tr("After a matching event", "匹配事件后")}</option>
                    </select>
                  </label>
                  {automationDraft.trigger_mode === "at" && <label className="automationField"><span>{tr("Start at · your local time", "启动时间 · 你的本地时间")}</span><input type="datetime-local" value={automationDraft.agent_start_at} onChange={event => setAutomationDraft(current => ({ ...current, agent_start_at: event.target.value }))} /></label>}
                  {automationDraft.trigger_mode === "interval" && <label className="automationField"><span>{tr("Interval after the last run finishes (minutes)", "上次执行结束后的间隔（分钟）")}</span><input type="number" min="1" max="43200" value={automationDraft.schedule_minutes} onChange={event => setAutomationDraft(current => ({ ...current, schedule_minutes: event.target.value }))} /><small>{tr("The first run follows this interval. This is not a daily local-time schedule.", "首次执行在此间隔结束后启动；这不等于每天固定本地时间。")}</small></label>}
                </div>

                <div className="taskCreationOutcome"><span className="eyebrow">{tr("AFTER YOU CREATE", "创建之后")}</span><strong>{draftStartTitle}</strong><p>{draftStartDetail}</p>
                  {!draftIsCloud && <small>{tr("Device offline? It waits for reconnection. Keep-awake prevents sleep only on a supported, online device.", "设备离线时等待重连。保持唤醒仅能阻止受支持的在线设备睡眠。")}</small>}
                </div>
                <div className="automationForm">
                  {draftServiceBlocked && <div className="automationAttention automationFieldWide" role="status"><div><strong>{draftIsCloud ? tr("GitHub merging is not configured on this deployment.", "当前部署未配置 GitHub 合并。") : tr("Hosted AI planning is not configured on this deployment.", "当前部署未配置托管 AI 规划。")}</strong><span>{draftIsCloud ? tr("Choose a device command, or ask the deployment owner to configure the GitHub App.", "请选择设备命令，或请部署管理员配置 GitHub App。") : tr("Unattended goals require a configured executor. The connected-AI option saves context but cannot wake an idle chat.", "无人值守目标需要配置好的执行器。已连接 AI 选项可保存上下文，但不能唤起空闲聊天。")}</span></div></div>}
                  {draftPermissionBlocked && <div className="automationAttention automationFieldWide" role="status"><div><strong>{draftToolBlocked ? tr("This computer has not enabled the tools this task needs.", "这台电脑尚未开启任务所需的工具。") : tr("This computer has not enabled the selected task capability.", "这台电脑尚未开启所选任务能力。")}</strong><span>{draftToolBlocked ? tr("For a command, enable terminal access. For an AI goal, approve its selected tools or narrow the tool set below.", "命令任务需要终端权限；AI 目标需要批准所选工具，或在下方缩小工具集合。") : tr("Review its task permissions before creating this task.", "创建前，请检查这台电脑的任务权限。")}</span><button className="ghostButton" onClick={() => { setManagedDeviceId(draftDevice?.id || null); setDevicePanel(draftToolBlocked ? "access" : "tasks"); setDeviceQuery(""); setDeviceFilter("all"); navigateTab("devices"); }}>{tr("Manage device permissions", "管理设备权限")}</button></div></div>}
                  <label className="automationField">
                    <span>{tr("Task name", "任务名称")} <small>{automationDraft.kind === "agent_goal" ? tr("optional · uses your objective", "可选 · 默认使用目标") : ""}</small></span>
                    <input
                      value={automationDraft.name}
                      maxLength={120}
                      placeholder={tr("A short name for this work", "便于识别的任务名称")}
                      onChange={(event) => setAutomationDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  {!(automationDraft.kind === "condition_watch" && automationDraft.condition_action === "github_merge") && (
                    <label className="automationField">
                      <span>{tr("Device", "设备")}</span>
                      <select
                        value={automationDraft.device_id}
                        onChange={(event) => setAutomationDraft((current) => ({ ...current, device_id: event.target.value, keep_awake: false }))}
                      >
                        <option value="">{tr("Choose a device", "选择设备")}</option>
                        {devices.map((device) => (
                          <option value={device.id} key={device.id}>
                            {device.name} · {device.status === "online" ? tr("Online", "在线") : tr("Offline · waits for reconnection", "离线 · 等待重连")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {automationDraft.kind !== "agent_goal" &&
                    !(automationDraft.kind === "condition_watch" && automationDraft.condition_action === "github_merge") && (
                    <>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Shell command · executed verbatim", "Shell 命令 · 原样执行")}</span>
                        <textarea
                          rows={3}
                          value={automationDraft.command}
                          maxLength={4000}
                          placeholder={tr("pnpm test", "pnpm test")}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, command: event.target.value, command_confirmed: false }))}
                        />
                      </label>

                      <label className="automationKeepAwake automationFieldWide"><input type="checkbox" checked={automationDraft.command_confirmed} onChange={event => setAutomationDraft(current => ({ ...current, command_confirmed: event.target.checked }))} />{tr("I entered executable shell code. Natural-language objectives belong in Complete a goal.", "我填写的是可执行 shell 代码。自然语言目标应使用完成一个目标。")}</label>
                      {automationDraft.trigger_mode === "now" && <label className="automationField"><span>{tr("Command behavior", "命令行为")}</span><select value={automationDraft.kind} onChange={event => setAutomationDraft(current => ({ ...current, kind: event.target.value as AutomationCreateKind }))}><option value="long_task">{tr("Run once", "运行一次")}</option><option value="goal_loop">{tr("Repeat the same command until a check passes", "重复同一命令直到检查通过")}</option></select></label>}
                      <label className="automationField">
                        <span>{tr("Approved working directory", "已批准的工作目录")}</span>
                        <input
                          value={automationDraft.cwd}
                          maxLength={500}
                          placeholder="/Users/sam/work/project"
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, cwd: event.target.value }))}
                        />
                      </label>
                    </>
                  )}

                  {(automationDraft.kind === "long_task" || automationDraft.kind === "goal_loop") && (
                    <label className="automationField">
                      <span>{tr("Check / retry interval", "检查 / 重试间隔")}</span>
                      <div className="automationInlineInput">
                        <input
                          inputMode="numeric"
                          value={automationDraft.interval_minutes}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, interval_minutes: event.target.value.replace(/[^0-9]/g, "") }))}
                        />
                        <span>{tr("minutes", "分钟")}</span>
                      </div>
                    </label>
                  )}

                  {automationDraft.kind === "goal_loop" && (
                    <>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Goal verification command", "目标验证命令")}</span>
                        <textarea
                          rows={2}
                          value={automationDraft.goal_command}
                          maxLength={4000}
                          placeholder={tr("pnpm test:e2e", "pnpm test:e2e")}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, goal_command: event.target.value }))}
                        />
                        <small>{tr("Exit code 0 means the goal is reached. Otherwise Remote Arc waits and starts the next attempt.", "退出码 0 表示目标达成；否则 Remote Arc 等待后开始下一轮。")}</small>
                      </label>
                      <label className="automationField">
                        <span>{tr("Maximum attempts", "最大轮数")} <small>{tr("blank = unlimited until expiry", "留空 = 到期前不限轮数")}</small></span>
                        <input
                          inputMode="numeric"
                          value={automationDraft.max_runs}
                          placeholder={tr("Unlimited", "不限")}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, max_runs: event.target.value.replace(/[^0-9]/g, "") }))}
                        />
                      </label>
                    </>
                  )}

                  {automationDraft.kind === "agent_goal" && (
                    <>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Objective", "目标")}</span>
                        <textarea
                          rows={4}
                          value={automationDraft.agent_objective}
                          maxLength={6000}
                          placeholder={tr(
                            "Make the integration suite pass without weakening tests or removing coverage.",
                            "让 integration suite 全部通过，不允许削弱测试或删除覆盖。",
                          )}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, agent_objective: event.target.value }))}
                        />
                      </label>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Success criteria", "成功标准")}</span>
                        <textarea
                          rows={3}
                          value={automationDraft.agent_success_criteria}
                          maxLength={4000}
                          placeholder={tr(
                            "All tests pass, typecheck passes, and git diff contains only changes needed for this goal.",
                            "全部测试通过、typecheck 通过，并且 git diff 只包含完成目标所需的修改。",
                          )}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, agent_success_criteria: event.target.value }))}
                        />
                      </label>
                      <label className="automationField">
                        <span>{tr("Workspace", "工作区")} <small>{automationDraft.agent_allowed_tools.includes("start_process") ? tr("required for terminal access", "终端访问必填") : tr("optional for file reads", "文件读取时可选")}</small></span>
                        <input
                          value={automationDraft.agent_workspace}
                          maxLength={500}
                          placeholder="/Users/sam/work/project"
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, agent_workspace: event.target.value }))}
                        />
                      </label>
                      <label className="automationField">
                        <span>{tr("Decision executor", "决策执行器")}</span>
                        <select value={automationDraft.agent_controller} onChange={event => setAutomationDraft(current => ({ ...current, agent_controller: event.target.value as "hosted" | "source" }))}>
                          <option value="hosted">{tr("Hosted AI · can continue while you are away", "托管 AI · 你离开后可继续执行")}</option>
                          <option value="source">{tr("Connected AI · waits for decisions from that client", "已连接的 AI · 等待该客户端提交决策")}</option>
                        </select>
                        <small>{tr("Source mode saves context for the next chat turn. Saved command slices continue locally; new reasoning waits for the AI host. Automatic wakeup is not guaranteed. The controller never changes silently.", "源模式保存上下文供下一轮聊天续接。已保存的命令步骤继续执行，新判断等待 AI 宿主。自动唤醒不作保证，控制器不会悄悄替换。")}</small>
                      </label>
                      <label className="automationField"><span>{tr("Time budget per run", "每次执行的时间预算")}</span><select value={plannedDraft.maxMinutes} onChange={event => setPlannedDraft(current => ({ ...current, maxMinutes: event.target.value }))}><option value="60">{tr("1 hour", "1 小时")}</option><option value="480">{tr("8 hours", "8 小时")}</option><option value="1440">{tr("24 hours · overnight", "24 小时 · 可隔夜")}</option><option value="2880">{tr("48 hours", "48 小时")}</option>{!["60", "480", "1440", "2880"].includes(plannedDraft.maxMinutes) && <option value={plannedDraft.maxMinutes}>{plannedDraft.maxMinutes} {tr("minutes", "分钟")}</option>}</select><small>{tr("Can finish early. Stops at the earliest time or iteration limit and preserves partial results.", "可以提前完成。最早的时间或轮数限制生效，未完成成果会保留。")}</small></label>
                      <label className="automationField">
                        <span>{tr("Maximum planning turns", "最大规划轮数")}</span>
                        <input
                          inputMode="numeric"
                          value={automationDraft.agent_max_iterations}
                          onChange={(event) => setAutomationDraft((current) => ({
                            ...current,
                            agent_max_iterations: event.target.value.replace(/[^0-9]/g, ""),
                          }))}
                        />
                      </label>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Deterministic final verification", "最终确定性验证")} <small>{tr("optional but recommended", "可选，但建议填写")}</small></span>
                        <textarea
                          rows={2}
                          value={automationDraft.agent_verify_command}
                          maxLength={4000}
                          placeholder="pnpm typecheck && pnpm test"
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, agent_verify_command: event.target.value }))}
                        />
                        <small>{plannedDraft.enabled ? tr(
                          "Each phase must pass this check before acceptance. Deadline finalization records failed or unavailable checks in the report.",
                          "每个阶段通过此检查后才能接受。到期收尾时，报告会记录未通过或无法执行的检查。",
                        ) : tr(
                          "When provided, the AI cannot mark the goal complete until this command exits 0.",
                          "填写后，AI 不能仅凭自己判断完成；必须等这条命令退出码为 0。",
                        )}</small>
                      </label>
                      <label className="automationField">
                        <span>{tr("Planner interval", "Planner 间隔")}</span>
                        <div className="automationInlineInput">
                          <input
                            inputMode="numeric"
                            value={automationDraft.interval_minutes}
                            onChange={(event) => setAutomationDraft((current) => ({
                              ...current,
                              interval_minutes: event.target.value.replace(/[^0-9]/g, ""),
                            }))}
                          />
                          <span>{tr("minutes", "分钟")}</span>
                        </div>
                      </label>
                      <details className="taskAdvancedControls automationFieldWide"><summary>{tr("Tools & plan settings", "工具与计划设置")}<span>{automationDraft.agent_allowed_tools.length} {tr("approved tools", "个已批准工具")}</span></summary><div className="automationForm">
                      <div className="automationAgentTools automationFieldWide">
                        <span>{tr("Approved Agent Goal tools", "已批准的 Agent Goal 工具")}</span>
                        <div>
                          {([
                            ["list_directory", tr("List folders", "列目录")],
                            ["read_file", tr("Read text files", "读取文本文件")],
                            ["read_binary_file", tr("Read binary chunks · Plus", "读取二进制分块 · Plus")],
                            ["get_file_info", tr("File metadata", "文件信息")],
                            ["edit_block", tr("Edit existing blocks", "编辑现有代码块")],
                            ["write_file", tr("Write / create files", "写入 / 创建文件")],
                            ["start_process", tr("Run commands", "运行命令")],
                          ] as Array<[AgentGoalTool, string]>).map(([tool, label]) => {
                            const checked = automationDraft.agent_allowed_tools.includes(tool);
                            return (
                              <label key={tool} className={checked ? "selected" : ""}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => setAutomationDraft((current) => ({
                                    ...current,
                                    agent_allowed_tools: event.target.checked
                                      ? [...new Set([...current.agent_allowed_tools, tool])]
                                      : current.agent_allowed_tools.filter((item) => item !== tool),
                                  }))}
                                />
                                <span>{label}</span>
                                <code>{tool}</code>
                              </label>
                            );
                          })}
                        </div>
                        <small>{tr(
                          "The approved tool set and device policy are saved with the goal. Changing device policy stops affected unattended work; create a new goal under the updated permissions.",
                          "已批准的工具集合和设备策略会随目标保存。修改设备策略会停止相关无人值守任务；请在更新后的权限下创建新目标。",
                        )}</small>
                      </div>

                      <React.Suspense fallback={<p role="status">{tr("Loading plan controls…", "正在加载计划控件…")}</p>}><PlannedGoalEditor value={plannedDraft} onChange={setPlannedDraft} /></React.Suspense>
                      </div></details>
                    </>
                  )}

                  {automationDraft.trigger_mode === "interval" && (
                    <>
                      <label className="automationField">
                        <span>{tr("Maximum runs", "最大执行次数")} <small>{tr("blank = unlimited", "留空 = 不限")}</small></span>
                        <input
                          inputMode="numeric"
                          value={automationDraft.max_runs}
                          placeholder={tr("Unlimited", "不限")}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, max_runs: event.target.value.replace(/[^0-9]/g, "") }))}
                        />
                      </label>
                    </>
                  )}

                  {automationDraft.trigger_mode === "event" && (
                    <>
                      {automationDraft.kind !== "agent_goal" && <label className="automationField">
                        <span>{tr("On match", "匹配后执行")}</span>
                        <select
                          value={automationDraft.condition_action}
                          onChange={(event) => setAutomationDraft((current) => ({
                            ...current,
                            condition_action: event.target.value as "device_command" | "github_merge",
                            condition_source: event.target.value === "github_merge" ? "github" : current.condition_source,
                          }))}
                        >
                          <option value="device_command">{tr("Run command on device", "在设备上运行命令")}</option>
                          <option value="github_merge">{tr("Merge GitHub pull request", "合并 GitHub Pull Request")}</option>
                        </select>
                      </label>}
                      {automationDraft.kind === "agent_goal" || automationDraft.condition_action === "device_command" ? (
                        <label className="automationField">
                          <span>{tr("Webhook source", "Webhook 来源")}</span>
                          <select
                            value={automationDraft.condition_source}
                            onChange={(event) => setAutomationDraft((current) => ({ ...current, condition_source: event.target.value as "github" | "generic" }))}
                          >
                            <option value="github">GitHub</option>
                            <option value="generic">{tr("Generic webhook", "通用 Webhook")}</option>
                          </select>
                        </label>
                      ) : (
                        <>
                          <label className="automationField">
                            <span>{tr("Repository owner", "仓库 Owner")}</span>
                            <input
                              value={automationDraft.github_owner}
                              placeholder="yaohuangguan"
                              onChange={(event) => setAutomationDraft((current) => ({ ...current, github_owner: event.target.value }))}
                            />
                          </label>
                          <label className="automationField">
                            <span>{tr("Repository", "仓库")}</span>
                            <input
                              value={automationDraft.github_repo}
                              placeholder="remote-arc"
                              onChange={(event) => setAutomationDraft((current) => ({ ...current, github_repo: event.target.value }))}
                            />
                          </label>
                          <label className="automationField">
                            <span>{tr("Pull request", "Pull Request")}</span>
                            <input
                              inputMode="numeric"
                              value={automationDraft.github_pr}
                              placeholder="43"
                              onChange={(event) => setAutomationDraft((current) => ({ ...current, github_pr: event.target.value.replace(/[^0-9]/g, "") }))}
                            />
                          </label>
                          <label className="automationField">
                            <span>{tr("Merge method", "合并方式")}</span>
                            <select
                              value={automationDraft.github_merge_method}
                              onChange={(event) => setAutomationDraft((current) => ({
                                ...current,
                                github_merge_method: event.target.value as "merge" | "squash" | "rebase",
                              }))}
                            >
                              <option value="merge">merge</option>
                              <option value="squash">squash</option>
                              <option value="rebase">rebase</option>
                            </select>
                          </label>
                          <div className="automationAgentNotice automationFieldWide">
                            <strong>{tr("Cloud-side merge", "云端直接合并")}</strong>
                            <span>{tr(
                              "When the webhook matches, Remote Arc uses its GitHub App installation token to merge the PR directly. The computer does not need to be online.",
                              "Webhook 匹配后，Remote Arc 使用 GitHub App Installation Token 直接合并 PR；电脑无需在线。",
                            )}</span>
                          </div>
                        </>
                      )}
                      <label className="automationField">
                        <span>{tr("Event", "事件")}</span>
                        <input
                          value={automationDraft.condition_event}
                          placeholder="workflow_run"
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, condition_event: event.target.value }))}
                        />
                      </label>
                      <label className="automationField automationFieldWide">
                        <span>{tr("Match conditions", "匹配条件")} <small>JSON</small></span>
                        <textarea
                          rows={4}
                          value={automationDraft.condition_match}
                          spellCheck={false}
                          onChange={(event) => setAutomationDraft((current) => ({ ...current, condition_match: event.target.value }))}
                        />
                        <small>{tr(
                          'Use dotted payload paths, for example {"workflow_run.name":"CI","workflow_run.conclusion":"success"}.',
                          '使用点号 Payload 路径，例如 {"workflow_run.name":"CI","workflow_run.conclusion":"success"}。',
                        )}</small>
                      </label>
                    </>
                  )}
                  {!draftIsCloud && <div className="automationFieldWide">                    <label className="taskKeepAwake automationFieldWide">
                      <input type="checkbox" checked={automationDraft.keep_awake}
                        disabled={!devices.find(device => device.id === automationDraft.device_id)?.automation_permissions?.keep_awake || !devices.find(device => device.id === automationDraft.device_id)?.keep_awake_available}
                        onChange={(event) => setAutomationDraft(current => ({ ...current, keep_awake: event.target.checked }))} />
                      {tr("Keep this computer awake during the task", "任务期间保持这台电脑唤醒")}
                    </label>

<small className="taskAwakeHelp">{tr("Available when this device supports keep-awake and its permission is enabled. This cannot wake an offline computer.", "设备支持并开启保持唤醒权限时可用，无法唤起离线电脑。")}</small></div>}
                </div>

                <div className="automationCreateFooter">
                  <div>
                    <strong>{tr("Recovery policy", "恢复策略")}</strong>
                    <span>{tr(
                      "Fixed tasks use their saved restart/fail policy. Agent Goals preserve unknown outcomes for inspection; they do not blindly replay a lost action.",
                      "固定任务遵循保存的 restart/fail 策略。Agent Goal 保存未知结果供检查，不会盲目重放丢失的动作。",
                    )}</span>
                  </div>
                  <button
                    className="primaryButton"
                    disabled={automationBusy === "create" || UI_PREVIEW || draftPermissionBlocked || draftServiceBlocked || !hasPlus || (!draftIsCloud && automationDraft.kind !== "agent_goal" && !automationDraft.command_confirmed)}
                    onClick={() => void createDashboardAutomation()}
                  >
                    {automationBusy === "create" ? tr("Creating…", "创建中…") : tr("Create task", "创建任务")}
                  </button>
                </div>
              </section>
            )}

            <section className="automationListPanel">
              <div className="automationListHeader">
                <div>
                  <span className="eyebrow">{tr("TASKS & WATCHES", "任务与监听")}</span>
                  <h2>{tr("Your tasks", "你的任务")}</h2>
                </div>
                <span>{automations.length} {tr("total", "条")}</span>
              </div>

              <div className="taskToolbar">
                <div className="deviceSearch"><span aria-hidden="true">⌕</span><input aria-label={tr("Search tasks", "搜索任务")} placeholder={tr("Search tasks, devices or task ID", "搜索任务、设备或任务 ID")} value={automationQuery} onChange={(event) => setAutomationQuery(event.target.value)} /></div>
                <div className="deviceFilters" role="group" aria-label={tr("Task status filter", "任务状态筛选")}>
                  {(["all", "active", "attention", "finished"] as const).map((filter) => <button key={filter} aria-pressed={automationFilter === filter} className={automationFilter === filter ? "active" : ""} onClick={() => setAutomationFilter(filter)}>{filter === "all" ? tr("All", "全部") : filter === "active" ? tr("Active", "活动") : filter === "attention" ? tr("Needs attention", "待处理") : tr("Finished", "已结束")}<span>{automations.filter((item) => matchesTaskFilter(item, filter)).length}</span></button>)}
                </div>
              </div>
              {automationLoadError && <div className="taskLoadError" role="status">{tr("Tasks could not be refreshed. Showing the last available state.", "任务刷新失败，当前显示上次加载的状态。 ")}<button className="ghostButton" onClick={() => void refreshAutomations()}>{tr("Retry", "重试")}</button></div>}
              <div className="automationList" aria-busy={automationLoading}>
                {visibleAutomations.map((automation) => {
                  const device = devices.find((item) => item.id === automation.device_id);
                  const busy = automationBusy?.startsWith(automation.id + ":");
                  return (
                    <article className={"automationRow status-" + automation.status} key={automation.id}>
                      <div className="automationIdentity">
                        <span className={"automationStatusDot " + automation.status} />
                        <div>
                          <strong>{automation.name}</strong>
                          <span>{automationKindLabel(automationDisplayKind(automation))} · {device?.name || automation.device_id || tr("Cloud", "云端")}</span>
                          <p className="taskActivityLabel">{taskScheduler && taskScheduler.state !== "healthy" && automation.status === "waiting" && automation.next_run_at && Date.parse(automation.next_run_at) < Date.now() - 180000 ? tr("Overdue · task scheduling is unhealthy", "已延迟 · 任务调度异常") : taskActivity(automation, tr)}</p>
                        </div>
                      </div>

                      <div className="taskRunSummary"><span>{automation.run_started_count === undefined ? tr("Execution count pending refresh", "执行次数待刷新") : `${automation.run_started_count} ${tr("runs started", "次执行已启动")}`}{automation.max_runs > 0 ? ` · ${tr("limit", "上限")} ${automation.max_runs}` : ""}</span>{automation.status === "waiting" && automation.next_run_at && <span>{tr("Next: ", "下次：")}{automationTime(automation.next_run_at)}</span>}</div>

                      <span className={"automationStatusBadge " + automation.status}>{taskNeedsAgent(automation) ? tr("Waiting for AI", "等待 AI") : automationStatusLabel(automation.status)}</span>

                      <div className="automationActions">
                        {automation.status === "paused" && (
                          <button disabled={!!busy || UI_PREVIEW} onClick={() => void manageDashboardAutomation(automation, "resume")}>{tr("Resume", "恢复")}</button>
                        )}
                        {!automationTerminal(automation.status) && automation.status !== "paused" && (
                          <button disabled={!!busy || UI_PREVIEW} onClick={() => void manageDashboardAutomation(automation, "pause")}>{tr("Pause", "暂停")}</button>
                        )}
                        {!automationTerminal(automation.status) && (
                          <button className="danger" disabled={!!busy || UI_PREVIEW} onClick={() => void manageDashboardAutomation(automation, "cancel")}>{tr("Cancel", "取消")}</button>
                        )}
                      </div>

                      <TaskResults task={automation} reveal={createdTask?.id === automation.id} referenceControl={<CopyButton label={tr("Copy chat reference", "复制聊天引用")} value={taskNeedsAgent(automation)
                        ? tr(`Continue Remote Arc task ${automation.id}. Read its saved context using get_goal_context (automation_id: ${automation.id}); use get_automation for status and recent runs. Check the saved objective, revision, permissions and evidence before submitting any next decision. If these Remote Arc tools are unavailable, explain the missing capability. This ID refers to a cloud task record, not a local checkpoint file or the full original chat.`, `请继续 Remote Arc 任务 ${automation.id}。先用 get_goal_context（automation_id: ${automation.id}）读取已保存的上下文，再用 get_automation 查看状态与近期执行。提交下一步决策前核对目标、版本、权限和证据。若当前客户端没有这些 Remote Arc 工具，请明确说明缺少能力。这个 ID 对应云端任务记录，不是本地检查点文件，也不包含原聊天全文。`)
                        : tr(`Review Remote Arc task ${automation.id} using get_automation (automation_id: ${automation.id}). Summarize its saved status and recent runs without changing or executing the task. If that tool is unavailable, explain the missing capability. This ID refers to a cloud task record; do not infer a local checkpoint-file path.`, `请用 get_automation（automation_id: ${automation.id}）查看 Remote Arc 任务的已保存状态与近期执行，只汇报，不修改或执行任务。若当前客户端没有此工具，请明确说明缺少能力。这个 ID 对应云端任务记录，请勿据此猜测本地检查点文件路径。`)} />} />
                    </article>
                  );
                })}

                {!automationLoading && !automationLoadError && !automations.length && (
                  <div className="automationEmpty">
                    <strong>{tr("No persistent work yet", "还没有持久任务")}</strong>
                    <span>{tr(
                      "Create a goal with a verified executor, or an explicit command automation. A connected AI can create the same task through MCP.",
                      "创建有明确执行器的目标任务，或明确的命令自动化。已连接 AI 可以通过 MCP 创建同一条任务。",
                    )}</span>
                    <button onClick={() => { if (!hasPlus) { location.href = MARKETING_ORIGIN + "/pricing"; return; } setShowAutomationCreate(true); }}>{hasPlus ? "+ " + tr("New task", "新建任务") : tr("See Plus", "查看 Plus")}</button>
                  </div>
                )}
                {!!automations.length && !visibleAutomations.length && <div className="automationEmpty"><strong>{tr("No matching tasks", "没有匹配任务")}</strong><span>{tr("Try another search or clear the filters.", "尝试其他搜索词，或清除筛选。")}</span><button onClick={() => { setAutomationQuery(""); setAutomationFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></div>}
                {automationLoading && !automations.length && <div className="automationEmpty">{tr("Loading automations…", "正在加载自动化…")}</div>}
              </div>
            </section>
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
                    <h2>{tr("Remote MCP endpoint", "Remote MCP 地址")}</h2>
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
                <div><span className="eyebrow">{tr("AI CLIENTS", "AI 客户端")}</span><h2>{tr("Clients", "客户端")}</h2></div>
                <p>{tr("ChatGPT is the recommended path. Other Remote MCP clients can use the same production endpoint.", "推荐优先使用 ChatGPT；其他支持 Remote MCP 的客户端也可以使用同一个生产地址。")}</p>
              </div>

              <div className="connectClientGrid connectAgentLaunchers">
                <a className="connectClientCard primary" href={CHATGPT_PLUGIN_DIRECTORY_URL} target="_blank" rel="noreferrer">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="monoLogo" src={aiClients[0].icon} alt="" /><div><span className="eyebrow">CHATGPT</span><h3>ChatGPT</h3></div></div>
                    <span className="clientState recommended">{tr("Plugins", "Plugins")}</span>
                  </div>
                  <p>{tr("Open ChatGPT Plugins and install Remote Arc when available. Before publication, eligible accounts can use developer-mode MCP setup and Remote Arc OAuth.", "打开 ChatGPT Plugins，账户可见时安装 Remote Arc。发布前符合条件的账户可以通过开发模式 MCP 接入并完成 Remote Arc OAuth。")}</p>
                  <div className="connectAgentAction"><span>{tr("Open ChatGPT Plugins", "打开 ChatGPT Plugins")}</span><b>↗</b></div>
                </a>

                <a
                  className="connectClientCard"
                  href={CLAUDE_CONNECTORS_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}
                >
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[1].icon} alt="" /><div><span className="eyebrow">CLAUDE</span><h3>Claude</h3></div></div>
                    <span className="clientState">{tr("Connectors", "Connectors")}</span>
                  </div>
                  <p>{tr("Open Claude Connectors. The Remote Arc endpoint is copied automatically so you can add it as a Remote MCP connector.", "打开 Claude Connectors；Remote Arc Endpoint 会自动复制，可直接添加为 Remote MCP Connector。")}</p>
                  <div className="connectAgentAction"><span>{tr("Open Claude Connectors", "打开 Claude Connectors")}</span><b>↗</b></div>
                </a>

                <a className="connectClientCard" href={cursorMcpInstallUrl()}>
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[2].icon} alt="" /><div><span className="eyebrow">CURSOR</span><h3>Cursor</h3></div></div>
                    <span className="clientState">{tr("One-click MCP", "一键 MCP")}</span>
                  </div>
                  <p>{tr("Use Cursor's MCP install deeplink. Cursor reviews the Remote Arc configuration before installation and then completes OAuth.", "使用 Cursor 官方 MCP 安装 Deeplink；Cursor 会先确认 Remote Arc 配置，再完成 OAuth。")}</p>
                  <div className="connectAgentAction"><span>{tr("Add to Cursor", "添加到 Cursor")}</span><b>↗</b></div>
                </a>

                <a
                  className="connectClientCard"
                  href={MARKETING_ORIGIN + "/docs/mcp"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}
                >
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><span className="protocolMark large">M</span><div><span className="eyebrow">REMOTE MCP</span><h3>{tr("Other MCP client", "其他 MCP 客户端")}</h3></div></div>
                    <span className="clientState">{tr("Manual", "手动")}</span>
                  </div>
                  <p>{tr("Copy the production endpoint and open the Remote MCP reference for any compatible client.", "复制生产 Endpoint，并打开 Remote MCP 参考文档用于其他兼容客户端。")}</p>
                  <div className="connectAgentAction"><span>{tr("Copy endpoint & open docs", "复制地址并打开文档")}</span><b>↗</b></div>
                </a>
              </div>
            </section>

            <section className="connectGuide">
              <div className="connectSectionHeading compact">
                <div><span className="eyebrow">{tr("SETUP", "配置")}</span><h2>{tr("Connection flow", "连接流程")}</h2></div>
              </div>
              <div className="connectTimeline">
                <article><span className="timelineNumber">01</span><div><strong>{tr("Add Remote Arc", "添加 Remote Arc")}</strong><p>{tr("Install the public plugin when available, or add the Remote MCP endpoint manually during early access.", "公开插件上线后直接安装；Early Access 阶段则手动添加 Remote MCP 地址。")}</p></div></article>
                <article><span className="timelineNumber">02</span><div><strong>{tr("Authorize your account", "授权你的账户")}</strong><p>{tr("Remote Arc opens OAuth once. Your AI receives scoped access to the account you approve.", "Remote Arc 会打开一次 OAuth 授权；AI 只获得你批准账户范围内的权限。")}</p></div></article>
                <article><span className="timelineNumber">03</span><div><strong>{tr("Talk to a device by name", "直接说设备名称")}</strong><p>{tr("Remote Arc discovers your paired devices and enforces each device's tool policy before routing a request.", "Remote Arc 会发现已配对设备，并在路由请求前执行每台设备自己的工具权限策略。")}</p></div></article>
              </div>
            </section>

            <section className="connectTryPanel">
              <div className="connectTryCopy"><span className="eyebrow">{tr("EXAMPLES", "示例")}</span><h2>{tr("Example prompts", "示例指令")}</h2><p>{tr("Once connected, refer to the device and the task. Remote Arc handles MCP routing.", "连接后只需要说明设备和任务，MCP 路由由 Remote Arc 处理。")}</p></div>
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
                <button className={securityState?.mcpPaused ? "goldButton" : "dangerButton"} disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void setMcpPaused(!securityState?.mcpPaused)}>
                  {securityState?.mcpPaused ? tr("Resume AI MCP access", "恢复 AI MCP 访问") : tr("Pause AI MCP access", "暂停 AI MCP 访问")}
                </button>
                <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Device permissions", "设备权限")}</button>
                <a className="ghostButton" href="https://github.com/yaohuangguan/remote-arc/blob/master/SECURITY.md" target="_blank" rel="noreferrer">SECURITY.md</a>
              </div>
            </section>

            {securityError && <section className="policyWarning" role="alert">
              <strong>{tr("Could not load security data", "无法加载安全数据")}</strong>
              <p>{tr("Your current access state could not be verified. Refresh to try again.", "当前访问状态暂无法确认，请刷新后重试。")}</p>
              <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Retry", "重试")}</button>
            </section>}

            <section className="securityStatusGrid">
              <article className={"securityStatusCard primary" + (securityState?.mcpPaused ? " paused" : "")}>
                <div><span>{tr("Remote MCP", "Remote MCP")}</span><i className={"healthDot " + (!securityState || securityState.mcpPaused ? "idle" : "good")} /></div>
                <strong>{!securityState ? (securityError ? tr("Unavailable", "暂无法确认") : tr("Checking…", "正在检查…")) : securityState.mcpPaused ? tr("Paused", "已暂停") : tr("Protected", "已保护")}</strong>
                <small>{!securityState ? tr("Waiting for the current access state from Remote Arc.", "等待 Remote Arc 返回当前访问状态。") : securityState.mcpPaused ? tr("Authenticated AI MCP calls are blocked until resumed. This does not stop paired Agents or already-running tasks.", "已认证 AI MCP 请求会被拦截，直到恢复。此操作不会停止已配对的 Agent 或正在执行的独立任务。") : tr("OAuth, per-device credentials and relay enforcement are active.", "OAuth、每设备凭证与 Relay 权限拦截均已启用。")}</small>
              </article>
              <article className="securityStatusCard">
                <div><span>{tr("Authentication", "身份验证")}</span><span className="securityMiniState">OAuth</span></div>
                <strong>OAuth 2.1 + PKCE</strong>
                <small>{tr("Scoped access to the account you approve.", "仅授予你批准账户范围内的权限。")}</small>
              </article>
              <article className="securityStatusCard">
                <div><span>{tr("Device pairing credentials", "设备配对凭证")}</span><span className="securityMiniState">{devices.length}</span></div>
                <strong>{tr("Unique per device", "每设备独立")}</strong>
                <small>{tr("One pairing credential per device (not AI OAuth). Only hashes are stored in the cloud.", "每台设备一份配对凭证（不是 AI OAuth），云端仅保存哈希。")}</small>
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
                  <span className="eyebrow">{tr("PENDING APPROVALS", "待审批")}</span>
                  <div className="headingWithHelp">
                    <h2>{tr("Boundary requests", "越界访问请求")}</h2>
                    <HelpTip
                      label={tr("About boundary approvals", "了解越界审批")}
                      text={tr(
                        "Remote Arc can read ordinary non-sensitive files outside Trusted Write Locations. File changes outside those locations pause and ask you for a narrowly scoped approval.",
                        "Remote Arc 可以读取可信写入区域之外的普通非敏感文件；如果要在这些区域之外修改文件，会暂停并请求一份最小范围的授权。",
                      )}
                    />
                  </div>
                </div>
                <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
              </div>
              <div className="securityGrantList">
                {pendingApprovals.map((approval) => (
                  <div className="securityGrantRow active" key={approval.id}>
                    <div className="securityGrantIdentity">
                      <span className="securityGrantIcon">!</span>
                      <div>
                        <strong>{approval.tool_name}</strong>
                        <small>{approval.client_name || approval.client_id?.slice(0, 12) || tr("AI client", "AI 客户端")} · {deviceNameById.get(approval.device_id) || approval.device_id.slice(0, 8)}</small>
                      </div>
                    </div>
                    <div className="securityGrantState">
                      <span className="grantState refreshable">{tr("Waiting for you", "等待确认")}</span>
                    </div>
                    <div className="securityGrantDetails">
                      <span>{tr("Target", "目标")} <strong><code>{approval.target_path}</code></strong></span>
                      <span>{tr("Request", "请求")} <strong>{approval.request_id?.slice(0, 8) || "—"}</strong></span>
                      <span>{tr("Request expires", "请求过期时间")} <strong>{new Date(approval.expires_at).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-NZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</strong></span>
                    </div>
                    <div className="securityGrantScopes">
                      <button className="goldButton" disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void decidePendingApproval(approval, "allow_once")}>{tr("Allow once", "仅允许一次")}</button>
                      <button className="ghostButton" disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void decidePendingApproval(approval, "allow_10m")}>{tr("Allow 10 min", "允许 10 分钟")}</button>
                      <button className="ghostButton" disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void decidePendingApproval(approval, "always_folder")}>{tr("Trust this folder", "信任此文件夹")}</button>
                      <button className="dangerButton" disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void decidePendingApproval(approval, "deny")}>{tr("Deny", "拒绝")}</button>
                    </div>
                  </div>
                ))}
                {!pendingApprovals.length && (
                  <div className="securityEmptyState compact">
                    <strong>{securityState ? tr("No pending approvals", "暂无待审批请求") : securityError ? tr("Approvals unavailable", "暂无法获取审批请求") : tr("Loading approvals…", "正在加载审批请求…")}</strong>
                    {securityState && <span>{tr("Out-of-scope file changes will appear here and in an interactive remotelink terminal.", "超出可信写入范围的文件修改会显示在这里，也会显示在交互式 remotelink 终端中。")}</span>}
                  </div>
                )}
              </div>
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
                    <div className={"securityGrantRow " + grant.status} key={grant.grantId}>
                      <div className="securityGrantIdentity">
                        <span className="securityGrantIcon">AI</span>
                        <div>
                          <strong>{grant.clientName}</strong>
                          <small>{tr("Authorization", "授权")} {grant.grantId.slice(0,12)}… · {tr("Client", "客户端")} {grant.clientId.slice(0,8)}…</small>
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
                      <button className={grant.status === "expired" ? "ghostButton" : "dangerButton"} disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void revokeGrant(grant)}>
                        {grant.status === "expired" ? tr("Remove expired", "移除过期授权") : tr("Disconnect access", "断开此授权")}
                      </button>
                    </div>
                  );
                })}
                {securityState && !securityState.grants.length && <div className="securityEmptyState compact"><strong>{tr("No AI authorizations", "暂无 AI 授权")}</strong><span>{tr("Connect ChatGPT, Claude or another MCP client to see each OAuth authorization here.", "连接 ChatGPT、Claude 或其他 MCP 客户端后，每一份 OAuth 授权都会显示在这里。")}</span><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button></div>}
                {!securityState && <div className="securityEmptyState compact"><strong>{securityError ? tr("Authorizations unavailable", "暂无法获取授权") : tr("Loading access grants…", "正在加载访问授权…")}</strong></div>}
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
                      <div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div>
                      <b>{event.success ? tr("Allowed", "已允许") : tr("Failed", "失败")}</b>
                    </div>
                  ))}
                  {!status?.recentActivity?.length && <div className="securityEmptyState compact"><strong>{tr("No audit events yet", "暂无审计事件")}</strong><span>{tr("Tool calls and security events will appear here.", "工具调用和安全事件会显示在这里。")}</span></div>}
                </div>
              </article>

              <article className="securityPanel securityPrivacyPanel">
                <div className="securityPanelHeader"><div><span className="eyebrow">{tr("PRIVACY BOUNDARY", "隐私边界")}</span><h2>{tr("What the audit log keeps", "审计日志记录什么")}</h2></div></div>
                <div className="privacyBoundaryGrid">
                  <div className="kept"><span>✓</span><p><strong>{tr("Operational metadata", "运行元数据")}</strong><small>{tr("Tool, device, OAuth client, request ID, outcome and time.", "工具、设备、OAuth 客户端、Request ID、结果与时间。")}</small></p></div>
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
            <section className="pageHeader dashboardUtilityHeader"><div><span className="eyebrow">{tr("SETTINGS", "设置")}</span><h1>{tr("Settings", "设置")}</h1><p>{tr("Appearance, language, account, MCP and billing preferences.", "外观、语言、账号、MCP 与账单偏好。")}</p></div></section>
            <section className="settingsGrid">
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Choose Light, Dark or System. Your preference is saved in this browser.", "选择浅色、深色或跟随系统；偏好会保存在当前浏览器。")}</p></div><ThemeSwitcher /></article>
              <article className="settingsCard"><div><h2>{tr("Language", "语言")}</h2><p>{tr("Changes apply immediately and are saved in this browser.", "修改后立即生效，并保存在当前浏览器。")}</p></div><div className="languageSetting"><button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button><button className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button></div></article>
              <article className="settingsCard"><div><h2>{tr("Account & profile", "账号与个人信息")}</h2><p>{user.name || tr("Remote Arc user", "Remote Arc 用户")} · {user.email}</p></div><button className="ghostButton" onClick={() => void signOut()}>{tr("Sign out", "退出登录")}</button></article><article className="settingsCard"><div><h2>{tr("MCP connection", "MCP 连接")}</h2><p>{tr("Manage per-device tool access from Devices. Disabled tools are enforced by the relay.", "在设备页管理每台电脑的工具权限；关闭的工具会由 Relay 强制拦截。")}</p><code>{mcpEndpoint}</code></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button></article><article className="settingsCard"><div><h2>{tr("Plan & allowance", "套餐与额度")}</h2><p>{hasPlus ? tr("Remote Arc Plus enables binary reads, durable/overnight Tasks, schedules, planned Agent Goals and supported keep-awake.", "Remote Arc Plus 已启用二进制读取、持久/隔夜任务、定时任务、计划模式 Agent Goal 与受支持的保持唤醒。") : tr("Remote Arc Free includes core remote tools. Plus capabilities are enforced by the relay, not only hidden in the UI.", "Remote Arc Free 包含核心远程工具；Plus 能力由 Relay 强制执行，不只是界面隐藏。")}</p></div><div><div className="planValue">{hasPlus ? "Plus" : "Free"} · {usage?.unlimited ? tr("Unlimited", "无限") : `${usage?.used ?? 0} / ${usageLimitLabel}`}</div>{!hasPlus && <a className="pricingUsageLink" href={MARKETING_ORIGIN + "/pricing"}>{tr("Compare plans", "对比套餐")} →</a>}</div></article>
              <article className="settingsCard"><div><h2>{tr("Plans & capacity", "方案与容量")}</h2><p>{tr("Review the current allowance, how calls are counted and the support path for capacity needs.", "了解当前额度、调用计数方式和更多容量的咨询渠道。")}</p></div><a className="ghostButton" href={MARKETING_ORIGIN + "/pricing"}>{tr("View pricing", "查看价格")}</a></article>
            </section>
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · mcp.remotearc.app</span><div><a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a><a href={MARKETING_ORIGIN + "/docs"}>{tr("Docs", "文档")}</a><a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a><a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a><a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a><a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a></div></footer>
      </main>

      <nav className="mobileBottomNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
        {([
          ["overview", tr("Home", "首页")],
          ["devices", tr("Devices", "设备")],
          ["automations", tr("Tasks", "任务")],
          ["connect", tr("Connect", "连接")],
          ["security", tr("Security", "安全")],
          ["settings", tr("Settings", "设置")],
        ] as Array<[DashboardTab, string]>).map(([id, label]) => (
          <button key={id} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
            <span aria-hidden="true"><DashboardNavIcon tab={id} /></span>
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
              "Remote Arc will add the selected folder to Trusted Write Locations. Sensitive paths remain protected.",
              "Remote Arc 会把所选目录加入可信写入区域；敏感路径保护仍然生效。",
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
            <p><a href="/downloads" target="_blank" rel="noopener noreferrer">{tr("Install without Node.js: native download or Homebrew", "无需 Node.js：直接下载或使用 Homebrew")} →</a></p>
            <div className="commandLabel secondary">{tr("Optional local hard lock · always read-only", "可选本机硬限制 · 始终只读")}</div>
            <div className="commandBox muted"><code>{safeCommand}</code><CopyButton value={safeCommand}/></div>
            <div className="onboardingSteps">
              <div><b>1</b><span><strong>{tr("Run the command", "运行命令")}</strong><small>npm / npx · Node.js 20+</small></span></div>
              <div><b>2</b><span><strong>{tr("Match the pairing code", "确认配对码")}</strong><small>{tr("The browser opens automatically", "浏览器会自动打开")}</small></span></div>
              <div><b>3</b><span><strong>{tr("Authorize the computer", "授权电脑")}</strong><small>{tr("It appears here after connecting", "连接后会自动出现在这里")}</small></span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}



type ProductRelease = {
  version: string;
  date: string;
  status?: "release-candidate" | "released";
  title: string;
  summary: string;
  changes: string[];
};

declare const __REMOTEARC_RELEASES__: ProductRelease[];

const LEGACY_PRODUCT_RELEASES: ProductRelease[] = [
  {
    version: "0.3.14",
    date: "2026-09-29",
    status: "released",
    title: "Relay reconnect resilience",
    summary: "Made long-lived device connectivity recover more reliably after failed handshakes instead of giving up on the relay session.",
    changes: [
      "Keep reconnect attempts alive after WebSocket handshake failures.",
      "Hardened the background connection path used by remotelink.",
    ],
  },
  {
    version: "0.3.13",
    date: "2026-09-27",
    status: "released",
    title: "Self-repairing pairing and publishing",
    summary: "Reduced two operational failure modes: revoked devices can repair their pairing flow and release automation no longer depends on hard-coded CLI versions.",
    changes: [
      "Automatically re-pair a remotelink client when its saved device credential has been revoked.",
      "Made package/release version checks derive the current CLI version dynamically.",
    ],
  },
  {
    version: "0.3.12",
    date: "2026-09-27",
    status: "released",
    title: "Clearer AI grants and dashboard controls",
    summary: "Made the relationship between OAuth client grants, paired computers and device controls easier to understand and manage.",
    changes: [
      "Clarified AI-client grants independently from paired-device trust.",
      "Upgraded dashboard controls for day-to-day device administration.",
    ],
  },
  {
    version: "0.3.11",
    date: "2026-09-27",
    status: "released",
    title: "Policy-aware operations",
    summary: "Connected path-policy, undo and managed-process state more directly to the dashboard and live device connection.",
    changes: [
      "Extended path-policy and Local Undo status surfaced by connected devices.",
      "Improved managed background-process visibility and policy-capable connection selection.",
    ],
  },
  {
    version: "0.3.10",
    date: "2026-09-27",
    status: "released",
    title: "Protected directory listings",
    summary: "Sensitive-path policy stopped being only an operation-time guard: protected entries are also hidden from ordinary directory listings.",
    changes: [
      "Hide protected entries from directory-listing results.",
      "Reduce accidental disclosure before a later file operation is attempted.",
    ],
  },
  {
    version: "0.3.9",
    date: "2026-09-27",
    status: "released",
    title: "Path policy and Local Undo history",
    summary: "Introduced practical filesystem boundaries and user-visible recovery state for supported edits.",
    changes: [
      "Trusted Write Locations and sensitive-path policy for normal file tools.",
      "Local-only Undo history with conflict-safe restore semantics.",
    ],
  },
  {
    version: "0.3.8",
    date: "2026-09-27",
    status: "released",
    title: "Native execution core",
    summary: "Removed the Desktop Commander dependency and brought filesystem, process and safety behavior into Remote Arc's own execution core.",
    changes: [
      "Replaced Desktop Commander with Remote Arc's native Node/OS execution core.",
      "Removed the legacy external CLI path and refreshed trusted-publisher/architecture documentation.",
    ],
  },
  {
    version: "0.3.7",
    date: "2026-09-27",
    status: "released",
    title: "Free-tier global relay optimization",
    summary: "Reduced unnecessary Worker cost and request pressure while keeping the hosted relay globally reachable.",
    changes: [
      "Optimized static and live routing paths for Cloudflare's free-tier economics.",
      "Kept the outbound device relay architecture while reducing avoidable Worker work.",
    ],
  },
  {
    version: "0.3.6",
    date: "2026-09-27",
    status: "released",
    title: "Local Undo and Safety Guard",
    summary: "Added local recovery for supported edits and another defense-in-depth layer around catastrophic shell patterns.",
    changes: [
      "Local Undo snapshots for supported Remote Arc file edits.",
      "Safety Guard for a narrow set of catastrophic command patterns.",
      "Hardened OIDC-based package publishing.",
    ],
  },
  {
    version: "0.3.5",
    date: "2026-09-26",
    status: "released",
    title: "Safe-by-default device access",
    summary: "New device access began from a read-oriented baseline instead of assuming broad write or terminal authority.",
    changes: [
      "Safe access became the default permission posture.",
      "Production D1 binding and health fixes stabilized the hosted control plane.",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-09-26",
    status: "released",
    title: "Real security controls and edge protection",
    summary: "Turned the dashboard's security story into enforceable controls instead of descriptive settings.",
    changes: [
      "Added real per-device security controls and edge-side enforcement.",
      "Upgraded Overview, Devices, Connect AI and Security Center UX around those controls.",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-09-26",
    status: "released",
    title: "Separate website, dashboard and MCP surfaces",
    summary: "Split product marketing from the authenticated control plane and prepared the service for public MCP/plugin review.",
    changes: [
      "Separated the dashboard/MCP host from the public website.",
      "Refined onboarding, installation entry points and public-review readiness.",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-09-25",
    status: "released",
    title: "Observable CLI and trusted publishing",
    summary: "Made remotelink easier to diagnose and moved package publishing toward an auditable OIDC flow.",
    changes: [
      "Structured connection and tool logs in the CLI.",
      "Trusted-publishing workflow plus package metadata and source-license cleanup.",
      "Fixed pairing-log output.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-09-25",
    status: "released",
    title: "remotearc.app and product identity",
    summary: "Completed the public Remote Arc identity, domain migration and legal/plugin surface around the renamed product.",
    changes: [
      "Migrated public traffic and canonical branding to remotearc.app.",
      "Added plugin/MCP metadata, privacy, terms and support pages.",
      "Centralized Settings and per-device tool permissions.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-25",
    status: "released",
    title: "Remote Arc",
    summary: "The Remote Link prototype became Remote Arc, with the remotelink CLI/package becoming the stable installation entry.",
    changes: [
      "Rebranded Remote Link to Remote Arc across UI, CLI and MCP surfaces.",
      "Standardized the remotelink package and executable product flow.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-24",
    status: "released",
    title: "Hosted identity, pairing and OAuth",
    summary: "The prototype became a multi-user hosted control plane with explicit device identity and AI-client authorization.",
    changes: [
      "Google account/session authentication, browser-approved device pairing and per-device credentials.",
      "OAuth 2.1 authorization-code flow with PKCE and explicit consent for Remote MCP clients.",
      "Per-user Durable Object routing, device ownership/revocation checks and privacy-preserving audit metadata.",
      "10,000-call monthly hosted quota, bilingual product pages and the first full device dashboard.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-24",
    status: "released",
    title: "First end-to-end Remote Link",
    summary: "Established the original architecture: local agent, hosted relay, MCP adapter and a one-command path toward pairing a real computer.",
    changes: [
      "Initialized the monorepo, local MCP execution path, agent and Cloudflare relay.",
      "Added the first dashboard and one-command pairing CLI foundation.",
    ],
  },
];

const PRODUCT_RELEASES: ProductRelease[] = [
  ...__REMOTEARC_RELEASES__,
  ...LEGACY_PRODUCT_RELEASES,
];

function ReleasesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const latest = PRODUCT_RELEASES[0]!;

  return (
    <PublicLayout user={user}>
      <main className="releasesPage">
        <header className="articleHeader releaseHeader">
          <span className="eyebrow">{tr("RELEASES", "版本发布")}</span>
          <h1>{tr("Remote Arc release history", "Remote Arc 版本历史")}</h1>
          <p>{tr(
            "A version-by-version record of how Remote Arc evolved from a one-command remote MCP prototype into a persistent, policy-aware execution and agent control plane.",
            "按版本记录 Remote Arc 如何从一条命令即可连接的 Remote MCP 原型，演进为具备持久任务、权限策略与 Agent 控制面的产品。",
          )}</p>
          <div className="releaseLatestLine">
            <span>{tr("LATEST CLI", "最新 CLI")}</span>
            <strong>v{latest.version}</strong>
            <em>{latest.status === "release-candidate" ? tr("Release candidate", "候选发布") : tr("Published", "已发布")}</em>
            <time>{latest.date}</time>
          </div>
        </header>

        <section className="releaseIntro">
          <div>
            <strong>{tr("One product history", "一条完整产品历史")}</strong>
            <p>{tr(
              "This page stays on remotearc.app and combines CLI, relay, dashboard, security and product-surface milestones into the version in which they became part of the product.",
              "本页保留在 remotearc.app 内，把 CLI、Relay、Dashboard、安全能力和产品界面的重要升级归入真正形成产品能力的对应版本。",
            )}</p>
          </div>
          <div>
            <strong>{tr("Release status", "版本状态")}</strong>
            <p>{tr(
              `The latest published CLI is remotelink ${latest.version}. Task availability also depends on your plan, relay configuration and device permissions; a website preview does not execute work.`,
              `最新已发布的 CLI 是 remotelink ${latest.version}。任务可用性还取决于套餐、Relay 配置与设备权限；网站预览不会执行任务。`,
            )}</p>
          </div>
        </section>

        <div className="releaseTimeline">
          {PRODUCT_RELEASES.map((release, index) => (
            <article className={"releaseEntry " + (index === 0 ? "latest" : "")} key={release.version} id={"v" + release.version.replaceAll(".", "-")}>
              <aside className="releaseVersionRail">
                <span className="releaseRailDot" />
                <strong>v{release.version}</strong>
                <time>{release.date}</time>
                <span className={"releaseState " + (release.status || "released")}>
                  {release.status === "release-candidate"
                    ? tr("Release candidate", "候选版本")
                    : tr("Released", "已发布")}
                </span>
              </aside>
              <div className="releaseBody">
                <h2>{release.title}</h2>
                <p className="releaseSummary">{release.summary}</p>
                <ul>
                  {release.changes.map((change) => <li key={change}>{change}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </main>
    </PublicLayout>
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
        [tr("Durable automation and Agent Goal data", "持久自动化与 Agent Goal 数据"), tr("Durable tasks store their approved commands/plans, trigger, objective, success criteria, tool set, verification, limits, permission snapshot and progress. They also retain bounded tool/process observations, factual working memory, journal and decision summaries, run output summaries and completion evidence in the control plane. Observations can include file contents or command output. Pending source decisions may contain editing content; their bodies are cleared after consumption while idempotency hashes remain. This task storage is separate from metadata-only operational audit and is not a full archive of local stdout/stderr.", "持久任务保存已批准命令或计划、触发方式、目标、成功标准、工具集合、验证、限制、权限快照与进度。控制面还保存受限工具或进程观察、事实工作记忆、日志与决策摘要、运行输出摘要和完成证据。观察可能包含文件内容或命令输出；待消费源决策可能包含编辑内容，消费后清除正文并保留幂等 Hash。任务存储独立于仅保留元数据的运行审计，不属于本地 stdout/stderr 完整存档。")],
        [tr("Reasoning controller processing", "推理控制器处理"), tr("Hosted Agent Goals send the objective, criteria, factual memory and bounded observations to the configured planner provider, such as Cloudflare Workers AI or a configured OpenAI Responses API integration. Source Agent Goals return saved context to the authorized source AI client, which decides the next action. Source mode does not silently switch to a hosted model. Decisions in both modes are validated against the frozen tool and device-policy boundary. Signed task events additionally store subscription metadata and encrypted callback signing secrets when configured.", "托管 Agent Goal 会把目标、标准、事实记忆和受限观察发给配置的 Planner 服务，例如 Cloudflare Workers AI 或已配置的 OpenAI Responses API 集成。源 Agent Goal 把保存上下文返回给已授权源 AI 客户端，由它决定下一步。源模式不会静默切换托管模型；两种模式的决策都受冻结工具与设备策略边界校验。配置签名任务事件时，还会保存订阅元数据和加密的回调签名 Secret。")],
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
        [tr("Your responsibility", "你的责任"), tr("Remote computer control can read or modify files, execute commands, affect running software and, when commands access network services, cause changes outside the local computer. Durable Automations may continue after the chat that created them has ended. You are responsible for reviewing device permissions, persistent task plans, expiry and run limits, AI prompts and consequential actions before approving or enabling high-impact access.", "远程电脑控制可能读取或修改文件、执行命令、影响运行中的软件；当命令访问网络服务时，也可能对本机之外的系统产生影响。Durable Automations 可能在创建它的聊天结束后继续运行。你有责任在批准或启用高影响访问前检查设备权限、持久任务计划、到期与次数限制、AI 提示与相关操作。")],
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
    if (UI_PREVIEW || !("serviceWorker" in navigator) || location.protocol !== "https:") return;
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
  const isDashboardHost = isAppHost || UI_PREVIEW;
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
  if (location.pathname === "/docs/long-running-work") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading documentation…", "正在加载文档…")}</main>}><LongRunningWorkDocs /></React.Suspense></PublicLayout>;
  if (location.pathname === "/docs") return <DocsPage user={user === undefined ? null : user} />;
  if (location.pathname === "/security-model") return <SecurityModelPage user={user === undefined ? null : user} />;
  if (location.pathname === "/use-cases") return <UseCasesPage user={user === undefined ? null : user} />;
  const useCaseMatch = location.pathname.match(/^\/use-cases\/(remote-development|file-organization|disk-space-cleanup|overnight-goals|long-running-jobs|scheduled-checks|ci-follow-up|data-work|home-lab|browser-research|remote-support|presentation-deck|spreadsheet-report|desktop-automation|cross-device-handoff)$/);
  if (useCaseMatch) {
    return <UseCaseDetailPage slug={useCaseMatch[1] as UseCaseSlug} user={user === undefined ? null : user} />;
  }
  if (location.pathname === "/chatgpt-computer-access") return <ChatGptComputerAccessPage user={user === undefined ? null : user} />;
  if (location.pathname === "/claude-computer-access") return <ClaudeComputerAccessPage user={user === undefined ? null : user} />;
  if (location.pathname === "/mcp-computer-access") return <McpComputerAccessPage user={user === undefined ? null : user} />;
  if (location.pathname === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (location.pathname === "/downloads") return <PublicLayout user={user === undefined ? null : user}><main className="technicalDoc"><React.Suspense fallback={<p role="status">{tr("Loading downloads…", "正在加载下载页面…")}</p>}><NativeInstall /></React.Suspense></main></PublicLayout>;
  if (location.pathname === "/releases") return <ReleasesPage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs") return <BlogsPage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/go-vs-typescript-agent-benchmarks") return <GoVsTypescriptBenchmarkArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/why-i-built-remote-arc") return <BlogArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/remote-arc-vs-openclaw") return <RemoteArcVsOpenClawArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/powerful-ai-access-without-exposing-your-computer") return <PowerfulAccessArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/blogs/how-remote-arc-works") return <ArchitectureArticlePage user={user === undefined ? null : user} />;
  if (location.pathname === "/resources") return <ResourcesRedirect />;
  if (location.pathname === "/remote-mcp") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc" role="status">{tr("Loading guide…", "正在加载指南…")}</main>}><RemoteMcpGuide /></React.Suspense></PublicLayout>;
  if (location.pathname === "/chrome-extension") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="chromeExtensionPage" role="status">{tr("Loading Chrome extension…", "正在加载 Chrome 扩展页面…")}</main>}><ChromeExtensionPage /></React.Suspense></PublicLayout>;
  if (location.pathname === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;
  if (location.pathname === "/privacy") return <LegalPage kind="privacy" user={user === undefined ? null : user} />;
  if (location.pathname === "/terms") return <LegalPage kind="terms" user={user === undefined ? null : user} />;
  if (location.pathname === "/support") return <LegalPage kind="support" user={user === undefined ? null : user} />;

  if (isDashboardHost && (location.pathname === "/dashboard" || Object.values(DASHBOARD_PATHS).includes(location.pathname))) {
    if (user === undefined) {
      return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Connecting to Remote Arc.", "正在连接 Remote Arc。")} />;
    }
    if (!user) return <DashboardAccess />;
    if (location.pathname === "/monitor" && !user.isAdmin) {
      return <CenteredCard title={tr("Admin only", "仅管理员可访问")} body={tr("Service monitoring is restricted to Remote Arc administrators.", "服务监控仅限 Remote Arc 管理员访问。")} />;
    }
    return <Dashboard user={user} devices={devices} status={status} refreshAll={loadAll} signOut={signOut} />;
  }

  if (!isDashboardHost && location.pathname !== "/") return <NotFoundPage user={user === undefined ? null : user} />;
  return <Landing user={user === undefined ? null : user} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider><App /></I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
