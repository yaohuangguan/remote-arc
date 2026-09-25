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
        <a href="/docs/mcp">MCP</a>
        <a href="/pricing">{tr("Pricing", "价格")}</a>
        <a href="/resources">{tr("Resources", "资源")}</a>
        <a href="https://github.com/yaohuangguan/remote-arc">GitHub</a>
      </nav>
      <div className="publicNavActions">
        {user ? (
          <a className="navDashboard" href="/dashboard">
            {tr("Dashboard", "控制台")} <span>↗</span>
          </a>
        ) : (
          <a className="navLogin" href="/auth/google?return_to=/dashboard">
            {tr("Sign in", "登录")}
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
  const command = "npx remotelink";
  return (
    <PublicLayout user={user}>
      <section className="landingHero">
        <span className="eyebrow">{tr("OPEN · SELF-HOSTABLE · REMOTE MCP", "开源 · 可自托管 · REMOTE MCP")}</span>
        <h1>{tr("Your computer. Your rules. Your AI.", "你的电脑。你的规则。你的 AI。")}</h1>
        <p>
          {tr(
            "Secure Remote MCP access to real Windows, macOS and Linux computers. Remote Arc handles identity and routing in the control plane while execution and the final permission boundary stay on your device.",
            "让 AI 安全访问真实的 Windows、macOS 与 Linux 电脑。Remote Arc 在控制面处理身份与路由，实际执行与最终权限边界始终留在你的设备上。"
          )}
        </p>
        <div className="landingActions">
          <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>
            {user ? tr("Open dashboard", "打开控制台") : tr("Start free", "免费开始")}
          </a>
          <a className="ghostLink" href="/docs/mcp">{tr("Explore MCP →", "了解 MCP →")}</a>
        </div>
        <div className="heroBadges">
          <span>{tr("10,000 hosted tool calls / month", "每月 10,000 次托管工具调用")}</span>
          <span>OAuth 2.1 + PKCE</span>
          <span>{tr("No port forwarding", "无需端口映射")}</span>
        </div>
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
      </section>

      <section className="valueSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("WHY REMOTE ARC", "为什么选择 REMOTE ARC")}</span>
          <h2>{tr(
            "Simple like a hosted service. Controllable like open source.",
            "像托管服务一样简单，像开源软件一样可控。"
          )}</h2>
        </div>
        <div className="landingFeatures">
          <article>
            <span>01</span>
            <h2>{tr("One-command pairing", "一条命令完成配对")}</h2>
            <p>{tr(
              "Run npx remotelink, confirm the short code in your browser, and the device connects outbound to the relay.",
              "运行 npx remotelink，在浏览器确认短配对码，设备随后主动出站连接 Relay。"
            )}</p>
          </article>
          <article>
            <span>02</span>
            <h2>{tr("Self-host the control plane", "控制面也能自托管")}</h2>
            <p>{tr(
              "The hosted service uses Worker, D1 and Durable Objects. The same control plane can run in your own Cloudflare account and domain.",
              "托管版基于 Worker、D1 与 Durable Objects；同一套控制面也可以部署到你自己的 Cloudflare 账户和域名。"
            )}</p>
          </article>
          <article>
            <span>03</span>
            <h2>{tr("OAuth-native Remote MCP", "原生 OAuth Remote MCP")}</h2>
            <p>{tr(
              "One standards-based Remote MCP endpoint uses OAuth 2.1 + PKCE to authorize compatible AI clients without sharing device credentials.",
              "一个标准 Remote MCP 端点通过 OAuth 2.1 + PKCE 授权兼容 AI 客户端，无需暴露设备凭证。"
            )}</p>
          </article>
          <article>
            <span>04</span>
            <h2>{tr("Local permission boundary", "权限边界留在本机")}</h2>
            <p>{tr(
              "Each machine advertises its own allowed capabilities. Cloud authorization cannot silently enable a tool that the local agent did not expose.",
              "每台设备自行声明允许的能力；云端授权无法静默启用本地 Agent 没有开放的工具。"
            )}</p>
          </article>
        </div>
      </section>

      <section className="differenceSection">
        <div className="sectionIntro">
          <span className="eyebrow">{tr("THE DIFFERENCE", "我们的差异")}</span>
          <h2>{tr("Hosted convenience without hosted lock-in.", "享受托管的省心，但不被托管平台锁死。")}</h2>
          <p>{tr(
            "Use Remote Arc's hosted relay when you want zero ops. When ownership matters more, deploy the same open-source control plane yourself while keeping the device-side permission model unchanged.",
            "想省心时使用 Remote Arc 托管 Relay；更重视所有权时，可以自行部署同一套开源控制面，同时保持设备侧权限模型不变。"
          )}</p>
        </div>
        <div className="comparisonGrid">
          <div className="comparisonHead"><span></span><strong>Remote Arc</strong><strong>{tr("Hosted-only connector", "纯托管连接器")}</strong></div>
          {[
            [tr("Control plane", "控制面"), tr("Hosted or self-hosted", "托管或自托管"), tr("Provider-owned", "平台持有")],
            [tr("AI authorization", "AI 授权"), "OAuth 2.1 + PKCE", tr("Product-specific", "通常绑定产品")],
            [tr("Device connection", "设备连接"), tr("Outbound WebSocket", "主动出站 WebSocket"), tr("Varies by provider", "取决于平台")],
            [tr("Device permissions", "设备权限"), tr("Final boundary stays local", "最终边界留在本机"), tr("Cloud policy first", "云端策略优先")],
            [tr("Exit path", "退出路径"), tr("Fork, deploy, keep running", "Fork、部署、继续运行"), tr("Migration required", "需要迁移")],
            [tr("Free hosted usage", "免费托管额度"), tr("10,000 tool calls / month", "每月 10,000 次调用"), tr("Depends on provider", "取决于平台")],
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
          <h2>{tr("10,000 tool calls every month.", "每月 10,000 次工具调用。")}</h2>
          <p>{tr(
            "Enough for everyday personal workflows. Need full ownership? Self-host the same control plane.",
            "足够覆盖日常个人工作流。需要完整所有权？直接自托管同一套控制面。"
          )}</p>
        </div>
        <div className="ctaActions">
          <a className="primaryButton goldButton" href={user ? "/dashboard" : "/auth/google?return_to=/dashboard"}>
            {user ? tr("Open dashboard", "打开控制台") : tr("Start free", "免费开始")}
          </a>
          <a className="ghostLink" href="/pricing">{tr("View pricing", "查看价格")}</a>
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
        <article className="docsCard"><h2>{tr("Device install", "设备安装")}</h2><code>npx remotelink</code><p>{tr("Pair in the browser, then the CLI keeps an outbound connection to the relay.", "浏览器完成配对后，CLI 会保持到 Relay 的出站连接。")}</p></article>
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
              <article className="settingsCard"><div><h2>{tr("Appearance", "外观")}</h2><p>{tr("Dark is the default. You can switch to Light or follow your system.", "默认使用浅色模式，也可以切换深色或跟随系统。")}</p></div><div className="languageSetting"><button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>{tr("Light", "浅色")}</button><button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>{tr("Dark", "深色")}</button><button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>{tr("System", "跟随系统")}</button></div></article>
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
