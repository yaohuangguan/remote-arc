import React from "react";
import { useI18n } from "./i18n.js";
import { LandingArchitectureDiagram, LandingInteractiveDemo, ConnectionFilm } from "./landing-content.js";
import "./remote-mcp-guide.css";

const endpoint = "https://mcp.remotearc.app/mcp";

const steps = [
  {
    id: "pair",
    index: "01",
    title: ["Pair a computer", "配对你自己的电脑"],
    body: ["Install the local Remote Arc agent on Windows, macOS or Linux. Confirm the pairing request in the Remote Arc dashboard. The device connects outbound — no router port forwarding is needed.", "在 Windows、macOS 或 Linux 上安装 Remote Arc 本地 Agent，并在 Dashboard 确认配对请求。设备主动向外连接，不需要路由器端口映射。"],
  },
  {
    id: "connect",
    index: "02",
    title: ["Add the Remote MCP server to your AI client", "在 AI 客户端添加 Remote MCP Server"],
    body: ["In your client's MCP / apps / connectors settings, add the URL below using its supported remote HTTP setup. Complete Remote Arc OAuth when prompted. The exact menu and availability depend on the client and account.", "在 AI 客户端的 MCP、应用或连接器设置中，通过受支持的 Remote HTTP 配置添加下方地址。按提示完成 Remote Arc OAuth。具体菜单与功能可用性取决于客户端和账户。"],
  },
  {
    id: "verify",
    index: "03",
    title: ["Start read-only and verify the result", "先从只读验证开始"],
    body: ["Ask your AI to list the paired devices and inspect a harmless folder on the intended computer. Check the device name and response; only then enable file edits or terminal access where needed.", "让 AI 列出已配对设备并读取目标电脑上一个无敏感信息的目录。核对设备和结果，再根据需要授权文件编辑或终端操作。"],
  },
] as const;

const clients = [
  { name: "ChatGPT", logo: "/demo-brands/chatgpt.svg", url: "/install/chatgpt", hint: ["Plugins / supported MCP app path", "Plugins / 受支持的 MCP 应用入口"] },
  { name: "Claude", logo: "/demo-brands/claude.svg", url: "/install/claude", hint: ["Custom connector + OAuth", "自定义连接器 + OAuth"] },
  { name: "Cursor", logo: "/demo-brands/cursor.svg", url: "/install/cursor", hint: ["Remote HTTP MCP configuration", "Remote HTTP MCP 配置"] },
] as const;

export function RemoteMcpGuide() {
  const { tr } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return <div className="remoteMcpGuide landingContent">
    <section className="rmgHero" aria-labelledby="rmg-title">
      <div className="rmgHeroCopy">
        <div className="rmgEyebrow"><span className="rmgDot" /> {tr("THE REMOTE MCP GUIDE", "REMOTE MCP 入门指南")}</div>
        <h1 id="rmg-title">{tr("Remote MCP servers,", "Remote MCP Server，")}<span>{tr("explained and connected.", "从概念到真正连接。")}</span></h1>
        <p>{tr("Learn how remote MCP works, how it differs from a local MCP server, and how to connect ChatGPT, Claude or Cursor. Then see how Remote Arc makes your own computer accessible through a permissioned remote MCP connection.", "了解远程 MCP 如何工作、与本地 MCP 有何不同，以及如何连接 ChatGPT、Claude 或 Cursor。再看看 Remote Arc 如何通过有权限控制的远程 MCP 连接，让 AI 使用你自己的电脑。")}</p>
        <div className="rmgHeroActions">
          <a className="primaryButton" href="#rmg-start">{tr("Connect a remote MCP server", "连接远程 MCP Server")} <span aria-hidden="true">↗</span></a>
          <a className="rmgTextLink" href="#rmg-basics">{tr("Start with the basics", "先了解基础概念")} ↓</a>
        </div>
        <div className="rmgMiniFacts">
          <span>{tr("Streamable HTTP", "Streamable HTTP")}</span>
          <span>{tr("OAuth authorization", "OAuth 授权")}</span>
          <span>{tr("No exposed device port", "设备无需开放公网端口")}</span>
        </div>
      </div>
      <div className="rmgHeroVisual" aria-label={tr("Remote MCP connection overview", "Remote MCP 连接概览")}>
        <div className="rmgVisualTop"><span className="rmgWindowDots">● ● ●</span><span>remote-mcp / connection</span><span className="rmgActive"><i />{tr("Ready", "就绪")}</span></div>
        <div className="rmgVisualBody">
          <div className="rmgVisualClients"><span><img src="/demo-brands/chatgpt.svg" alt="" /> ChatGPT</span><span><img src="/demo-brands/claude.svg" alt="" /> Claude</span><span><img src="/demo-brands/cursor.svg" alt="" /> Cursor</span></div>
          <div className="rmgVisualFlow"><span className="rmgFlowDash" /> <small>HTTPS · MCP · OAuth</small> <span className="rmgFlowDash" /></div>
          <div className="rmgVisualCore"><img src="/remote-arc-app-icon.svg" alt="" /><div><strong>Remote Arc</strong><small>Remote MCP Server</small></div><span className="rmgVerified">✓</span></div>
          <div className="rmgVisualFlow"><span className="rmgFlowDash" /> <small>{tr("Outbound connection", "设备主动出站")}</small> <span className="rmgFlowDash" /></div>
          <div className="rmgVisualDevices"><span>⌘ <b>macOS</b></span><span>▣ <b>Windows</b></span><span>⌁ <b>Linux</b></span></div>
        </div>
        <div className="rmgVisualFooter"><span className="rmgStatusDot" /> {tr("Your computers keep control of their permissions.", "每台电脑独立管理自己的权限。")}</div>
      </div>
    </section>

    <nav className="rmgJump" aria-label={tr("On this page", "页面目录")}>
      <a href="#rmg-basics">{tr("What is Remote MCP?", "什么是 Remote MCP？")}</a>
      <a href="#rmg-start">{tr("Connection guide", "连接步骤")}</a>
      <a href="#rmg-demo">{tr("Interactive demo", "交互演示")}</a>
      <a href="#rmg-security">{tr("Security & FAQ", "安全与常见问题")}</a>
    </nav>

    <section className="rmgSection" id="rmg-basics">
      <div className="rmgSectionHeading"><span className="rmgEyebrow">{tr("01 / THE BASICS", "01 / 基础知识")}</span><h2>{tr("What is a remote MCP server?", "什么是 Remote MCP Server？")}</h2><p>{tr("MCP (Model Context Protocol) is a standard way for AI clients to discover and call tools. A remote MCP server exposes those tools over a network transport such as Streamable HTTP instead of requiring the AI client to start a tool server on its own computer.", "MCP（模型上下文协议）让 AI 客户端通过统一方式发现和调用工具。Remote MCP Server 通过 Streamable HTTP 等网络传输对外提供工具，而不是要求 AI 客户端在本机启动工具服务器进程。")}</p></div>
      <div className="rmgCompare" role="group" aria-label={tr("Local versus Remote MCP", "本地与远程 MCP 对比")}>
        <article><div className="rmgCompareHead"><span className="rmgCompareBadge">LOCAL MCP</span><span className="rmgCompareSymbol">⌘</span></div><h3>{tr("A tool server beside your AI client", "AI 客户端旁的工具服务器")}</h3><p>{tr("The client launches a local process and exchanges MCP messages, commonly through standard input/output (stdio). Convenient for local developer tools, but the client needs access to the computer running the server.", "AI 客户端启动本地进程，通常通过标准输入/输出（stdio）交换 MCP 消息。适合本地开发工具，但客户端必须能够访问运行服务器的电脑。")}</p><div className="rmgComparePath"><span>AI client</span><b>→ stdio →</b><span>Local server</span></div></article>
        <article className="rmgCompareFeature"><div className="rmgCompareHead"><span className="rmgCompareBadge">REMOTE MCP</span><span className="rmgCompareSymbol">↗</span></div><h3>{tr("A tool server your AI client connects to", "AI 客户端经网络连接的工具服务器")}</h3><p>{tr("The client connects to an HTTP endpoint over the network. Transport, authentication and available tools are defined by the server and client. Useful for hosted integrations and for bridging access to explicitly paired computers.", "AI 客户端通过网络连接 HTTP 端点，身份验证和可用工具由服务端与客户端共同决定。适合托管集成服务，也可以桥接到明确配对的个人电脑。")}</p><div className="rmgComparePath"><span>AI client</span><b>→ HTTPS →</b><span>Remote server</span></div></article>
      </div>
      <p className="rmgNuance">{tr("“Remote” describes where the MCP endpoint is reachable — not where every tool must execute. With Remote Arc, the endpoint is hosted while approved file and terminal actions run on the paired computer.", "“远程”指 MCP 端点可通过网络访问，不代表所有工具必须在云端执行。Remote Arc 的端点在云端，但获授权的文件和终端操作仍在配对电脑上执行。")}</p>
    </section>

    <section className="rmgSection rmgSetupSection" id="rmg-start">
      <div className="rmgSectionHeading"><span className="rmgEyebrow">{tr("02 / GET CONNECTED", "02 / 开始连接")}</span><h2>{tr("Connect your AI to a remote MCP server.", "把你的 AI 连接到 Remote MCP Server。")}</h2><p>{tr("Here's a real Remote Arc connection path. Remote MCP is the protocol; Remote Arc is one implementation that connects your AI to a computer you explicitly own and pair.", "下面以 Remote Arc 为例走完整连接流程。Remote MCP 是协议方式，Remote Arc 是其中一种实现，可把 AI 连接到你主动配对的电脑。")}</p></div>
      <div className="rmgSteps">
        {steps.map(step => <article id={"rmg-"+step.id} key={step.id}><span className="rmgStepNumber">{step.index}</span><div><h3>{tr(step.title[0], step.title[1])}</h3><p>{tr(step.body[0], step.body[1])}</p>{step.id === "pair" && <div className="rmgCommand"><code>npx remotelink</code><a href="/install/chatgpt">{tr("View pairing instructions", "查看设备配对指南")} ↗</a></div>}{step.id === "connect" && <div className="rmgCommand"><code>{endpoint}</code><button type="button" onClick={() => void copyEndpoint()} aria-label={tr("Copy MCP endpoint URL", "复制 MCP 端点地址")}>{copied ? tr("Copied ✓", "已复制 ✓") : tr("Copy", "复制")}</button></div>}{step.id === "verify" && <div className="rmgExamplePrompt">{tr("“List my Remote Arc devices. On my Mac, inspect the project directory without editing anything.”", "“列出我的 Remote Arc 设备。只读取 Mac 上的项目目录，不修改任何内容。”")}</div>}</div></article>)}
      </div>
      <div className="rmgClientHeader"><h3>{tr("Choose your client to see the exact setup screens", "选择客户端，查看详细的配置步骤")}</h3><p>{tr("Adding the MCP endpoint inside the AI application is required. Running the local agent alone does not connect the app.", "必须在 AI 应用内添加 MCP 端点，仅运行本地 Agent 并不能让 AI 自动连接。")}</p></div>
      <div className="rmgClientGrid">{clients.map(client => <a key={client.name} href={client.url} className="rmgClient"><img src={client.logo} alt="" /><div><strong>{client.name}</strong><span>{tr(client.hint[0],client.hint[1])}</span></div><b aria-hidden="true">↗</b></a>)}</div>
    </section>

    <section className="rmgSection rmgArchitecture" id="rmg-architecture">
      <div className="rmgSectionHeading"><span className="rmgEyebrow">{tr("03 / UNDER THE HOOD", "03 / 架构原理")}</span><h2>{tr("One endpoint. Your computers. Your permissions.", "一个端点，连接你的电脑，权限仍由你掌控。")}</h2><p>{tr("The AI client does the reasoning. The remote MCP layer authenticates and routes tool calls. Each paired computer checks permissions and performs approved operations locally.", "AI 客户端负责推理，Remote MCP 层负责验证身份并路由工具调用，配对电脑检查权限后在本地执行获授权操作。")}</p></div>
      <div className="rmgArchGrid">
        <div className="rmgArchFlow"><div><small>01 · AI CLIENT</small><strong>ChatGPT / Claude / Cursor</strong><span>{tr("Decides which tools to call", "决定调用哪些工具")}</span></div><span className="rmgArchArrow">↓ <small>OAuth · Streamable HTTP</small></span><div className="rmgArchCenter"><small>02 · REMOTE MCP</small><strong>Remote Arc</strong><span>{tr("Scopes · device policy · routing", "Scope · 设备策略 · 请求路由")}</span></div><span className="rmgArchArrow">↓ <small>{tr("Outbound device WebSocket", "设备出站 WebSocket")}</small></span><div><small>03 · DEVICE</small><strong>{tr("Your Mac / Windows / Linux", "你的 Mac / Windows / Linux")}</strong><span>{tr("Approved tools execute here", "获授权的工具在本机运行")}</span></div></div>
        <div className="rmgSharedArchitecture"><LandingArchitectureDiagram /><a href="/blogs/how-remote-arc-works">{tr("Read the complete architecture walkthrough", "阅读完整的技术架构解析")} ↗</a></div>
      </div>
    </section>

    <section className="rmgSection rmgDemoSection" id="rmg-demo">
      <div className="rmgSectionHeading"><span className="rmgEyebrow">{tr("04 / SEE THE FLOW", "04 / 看看运行过程")}</span><h2>{tr("Watch an AI request travel to a real computer.", "看看 AI 请求如何抵达真实电脑。")}</h2><p>{tr("Switch between ChatGPT, Claude and Cursor and select a task. This is the same interactive illustration as on our homepage — it simulates the experience and does not execute real commands.", "在 ChatGPT、Claude、Cursor 之间切换并选择任务。这与首页使用同一套交互演示，模拟执行体验，不会执行真实命令。")}</p></div>
      <LandingInteractiveDemo />
      <div className="rmgRecorded"><div><strong>{tr("Prefer a recorded interface walkthrough?", "想看录制的产品界面？")}</strong><p>{tr("The walkthrough uses example data and explains the authorization flow; it does not perform live third-party OAuth.", "录制使用示例数据并讲解授权流程，不会现场执行第三方 OAuth。")}</p></div><ConnectionFilm /></div>
    </section>

    <section className="rmgSection rmgSecurity" id="rmg-security">
      <div className="rmgSectionHeading"><span className="rmgEyebrow">{tr("05 / SECURITY & TROUBLESHOOTING", "05 / 安全与排错")}</span><h2>{tr("Remote MCP is a connection — not unlimited permission.", "Remote MCP 是连接方式，不代表无限权限。")}</h2><p>{tr("A remote endpoint can be reachable without granting broad access to every device. Protect the client OAuth grant, configure tools per device and review anything that changes files or runs shell commands.", "远程端点能够连接，不代表每台电脑都会被授予完全访问权限。保护 OAuth 授权，按设备配置工具权限，对文件更改和终端命令进行审查。")}</p></div>
      <div className="rmgSecurityCards">
        <article><span>01</span><h3>{tr("OAuth is not an OS password", "OAuth 不等于电脑密码")}</h3><p>{tr("AI clients authorize with Remote Arc via OAuth. Devices have separate credentials and can be revoked independently.", "AI 客户端通过 OAuth 授权，设备使用独立凭证，可分别撤销。")}</p><a href="/security-model">{tr("Security model", "安全模型")} ↗</a></article>
        <article><span>02</span><h3>{tr("Read tools before write tools", "优先只读，再启用写入")}</h3><p>{tr("File editing and terminal tools require explicit device permission. A permitted shell command still runs as the local OS user; it is not sandboxed.", "文件编辑和终端工具需要明确授权；终端命令仍以本机 OS 用户权限运行，并非沙箱。")}</p><a href="/docs/mcp">{tr("MCP tools & scopes", "MCP 工具与 Scope")} ↗</a></article>
        <article><span>03</span><h3>{tr("A connection isn't an always-on computer", "连接成功不代表电脑永远在线")}</h3><p>{tr("The device must be powered on, online and running its agent. Background Agent recovery is available on Free; saved schedules and durable Tasks require Plus.", "电脑必须开机、联网且运行 Agent。Free 支持后台 Agent 恢复，持久任务与定时调度需要 Plus。")}</p><a href="/pricing">{tr("Free vs Plus", "Free / Plus 对比")} ↗</a></article>
      </div>
      <div className="rmgFaq">
        <h3>{tr("Common connection questions", "常见连接问题")}</h3>
        {[
          [tr("The MCP server doesn't appear in ChatGPT, Claude or Cursor.", "ChatGPT、Claude 或 Cursor 中看不到 MCP Server。"),tr("Check whether your client/account supports remote MCP connections, add the endpoint inside that application's own settings, and complete OAuth. Pairing the computer alone does not register the AI connector. See the client-specific installation pages above.", "检查 AI 客户端与账户是否支持 Remote MCP，在应用内添加端点并完成 OAuth。仅配对电脑不会自动注册 AI 连接器。请参照上方客户端专属安装页面。")],
          [tr("The connection works, but my device shows offline.", "MCP 已连接，但电脑显示离线。"),tr("The computer may be asleep, powered off, disconnected, or running an outdated/stopped local agent. Run npx remotelink on the device and check it appears online in Dashboard. Login autostart cannot wake a sleeping or powered-off computer.", "电脑可能休眠、关机、断网，或本地 Agent 已停止/过期。请在目标设备运行 npx remotelink，并检查 Dashboard 在线状态。登录自启不能唤醒休眠或关机的电脑。")],
          [tr("OAuth succeeded, but a file or terminal tool is blocked.", "OAuth 成功，但文件或终端工具被拒绝。"),tr("OAuth grants the AI client's account connection, not blanket device access. Check the chosen device's tool permissions, trusted write locations and sensitive-path settings. Only enable the narrow capability you need.", "OAuth 只授权 AI 客户端连接账户，不代表赋予设备所有权限。检查目标设备的工具授权、可信写入目录和敏感路径策略，按需开启最小权限。")],
          [tr("Is a remote MCP server the same as Remote Arc?", "Remote MCP Server 就是 Remote Arc 吗？"),tr("No. Remote MCP is a general connection pattern within MCP. Remote Arc is a source-viewable, proprietary-licensed product using a hosted MCP endpoint to reach explicitly paired personal computers.", "不是。Remote MCP 是 MCP 中的一种通用连接方式；Remote Arc 是采用托管 MCP 端点、连接明确配对的个人电脑的专有许可产品，源码可供审查。")],
        ].map(([question,answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}
      </div>
    </section>

    <section className="rmgNext">
      <div><span className="rmgEyebrow">{tr("KEEP LEARNING", "继续深入")}</span><h2>{tr("From understanding remote MCP to using it.", "从理解 Remote MCP，到亲手使用它。")}</h2><p>{tr("Read the implementation details, follow the connection guide for your AI client or try Remote Arc with an explicitly paired computer.", "阅读实现细节、按 AI 客户端完成连接指南，或用自己的电脑实际体验 Remote Arc。")}</p></div>
      <div className="rmgNextLinks"><a href="/docs/mcp">{tr("MCP reference & tools", "MCP 参考与工具")} ↗</a><a href="/install/chatgpt">{tr("Connect ChatGPT", "连接 ChatGPT")} ↗</a><a href="/mcp-computer-access">{tr("MCP computer access", "MCP 电脑访问")} ↗</a></div>
    </section>
  </div>;
}
