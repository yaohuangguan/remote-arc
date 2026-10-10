import React from "react";
import { ClientInstallWalkthrough } from "./client-install-walkthrough.js";
import { useI18n } from "./i18n.js";
import "./client-setup-guides.css";

type Client = "chatgpt" | "claude" | "cursor";
const chatgptPlugins = "https://chatgpt.com/plugins";
const chatgptDocs = "https://developers.openai.com/plugins/deploy/connect-chatgpt";
const chatgptAccess = "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt";
const claudeConnectors = "https://claude.ai/settings/connectors";
const claudeDocs = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";
const cursorDocs = "https://cursor.com/docs/mcp";
const cursorCustomize = "https://cursor.com/docs/customize-cursor";
const cursorInstallDocs = "https://prod.cursor.com/docs/mcp/install-links";

function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
}

export function ClientMcpGuide({
  client, endpoint, cursorInstallUrl, copyEndpoint,
}: {
  client: Client; endpoint: string; cursorInstallUrl: string; copyEndpoint: React.ReactNode;
}) {
  const { tr } = useI18n();
  const info = client === "chatgpt"
    ? {
      destination: chatgptPlugins,
      destinationLabel: tr("Open ChatGPT Plugins", "打开 ChatGPT Plugins"),
      path: tr("Plugins → + → Add custom MCP server", "Plugins → ＋ → Add custom MCP server"),
      steps: [
        tr("Open ChatGPT Plugins. On an eligible account, click + and choose Add custom MCP server. This is a private/custom setup; Remote Arc is not yet a public directory listing.",
          "打开 ChatGPT Plugins。如果账户支持自定义 MCP，点击 ＋ → Add custom MCP server。这里是私有/开发者接入，并非 Remote Arc 已正式上架。"),
        tr("Name the connection Remote Arc, enter the HTTPS endpoint shown below (including /mcp), and set the connection/authentication method.",
          "名称填写 Remote Arc，粘贴下方完整 HTTPS 地址（含 /mcp），按界面配置连接和认证方式。"),
        tr("Complete Remote Arc OAuth, review permissions and create the plugin. Install or enable the resulting plugin, then select it from your chat with @Remote Arc.",
          "完成 Remote Arc OAuth、核对权限并创建 Plugin。安装或启用后，在对话中通过 @Remote Arc 选择它。"),
      ],
      docs: chatgptDocs,
      access: chatgptAccess,
      important: tr("If the + / custom MCP option is missing, your account, plan or workspace may not have this feature. Managed workspaces can require an administrator to enable developer mode or approve the app. Do not assume every plan can use write tools.",
        "如果找不到 ＋ / Add custom MCP server，通常是套餐、账户或工作区尚未开放。组织账户可能需要管理员开启 Developer mode 或批准应用；不要假设所有套餐都能使用写入工具。"),
    }
    : client === "claude"
      ? {
        destination: claudeConnectors,
        destinationLabel: tr("Open Claude Connectors", "打开 Claude Connectors"),
        path: tr("Settings → Connectors → + Add → Add custom connector", "Settings → Connectors → ＋ Add → Add custom connector"),
        steps: [
          tr("Open Claude Settings → Connectors. Click + Add at the top right, then Add custom connector.",
            "打开 Claude 的 Settings → Connectors，点击右上角 ＋ Add → Add custom connector。"),
          tr("Set the name to Remote Arc and paste the HTTPS MCP endpoint below. Continue, select Sign in now and Use Claude’s published identity for OAuth, then Add.",
            "名称填写 Remote Arc，粘贴下方 HTTPS MCP 地址。点击 Continue，选择 Sign in now 与 Use Claude’s published identity，再点击 Add。"),
          tr("Click Connect and finish Remote Arc OAuth, review tool permissions, then ask Claude to use @Remote Arc in a chat.",
            "点击 Connect 并完成 Remote Arc OAuth，检查工具权限，然后在 Claude 对话中使用 @Remote Arc。"),
        ],
        docs: claudeDocs,
        access: claudeDocs,
        important: tr("Team/Enterprise organization members may need an admin or owner to add the connector under Organization settings → Connectors first; each member then connects their own account.",
          "Team / Enterprise 成员可能需要管理员先从 Organization settings → Connectors 添加 Connector，随后成员各自连接自己的账户。"),
      }
      : {
        destination: cursorInstallUrl,
        destinationLabel: tr("Add to Cursor (one click)", "一键添加到 Cursor"),
        path: tr("Customize → MCPs → Manage", "Customize → MCPs → 管理"),
        steps: [
          tr("The easiest option is Add to Cursor above. Approve the Remote Arc server configuration in the Cursor application.",
            "最简单的方法是点击上面的「一键添加到 Cursor」，在 Cursor 应用内确认 Remote Arc MCP 配置。"),
          tr("For manual setup, open Cursor → Customize → MCPs. Configure a remote HTTP MCP server in your user ~/.cursor/mcp.json or project .cursor/mcp.json using the JSON below.",
            "手动配置时，打开 Cursor → Customize → MCPs，在用户级 ~/.cursor/mcp.json 或项目级 .cursor/mcp.json 中按下方 JSON 添加 Remote HTTP MCP 服务。"),
          tr("Complete the OAuth sign-in when prompted, confirm the server is enabled and its tools are available in Agent. In MCPs you can review status and disable the connection.",
            "根据提示完成 OAuth 登录，确认服务已启用且工具出现在 Agent；可以在 MCPs 页面检查状态或关闭连接。"),
        ],
        docs: cursorDocs,
        access: cursorInstallDocs,
        important: tr("Do NOT put npx remotelink in Cursor's MCP server command field. Cursor connects to the hosted HTTPS MCP endpoint; npx remotelink runs independently on the computer you want to control.",
          "不要把 npx remotelink 填进 Cursor 的 MCP Server command！Cursor 要连接托管的 HTTPS MCP 地址；npx remotelink 则独立运行在你要控制的电脑上。"),
      };

  return <section className="installClientDetails" id="installation-client">
    <div className="installClientDetailsHeading">
      <div>
        <span className="eyebrow">{tr("REQUIRED · AI CLIENT", "必需 · AI 客户端")}</span>
        <h2>{tr("Add Remote Arc inside ", "在客户端中添加 Remote Arc · ") + (client === "chatgpt" ? "ChatGPT" : client === "claude" ? "Claude" : "Cursor")}</h2>
        <p>{tr("This is a separate step from pairing your computer. Without the app / connector, your AI cannot call Remote Arc tools even if the agent is running.",
          "这一步与配对电脑相互独立。即使本地 Agent 正在运行，没有安装 MCP App / Connector，AI 也无法调用 Remote Arc 工具。")}</p>
      </div>
      <OutLink href={info.destination}>{info.destinationLabel}</OutLink>
    </div>
    <div className="installUiTrail">
      <small>{tr("Click path in the app", "在平台内的点击路径")}</small>
      <strong>{info.path}</strong>
    </div>
    {client === "cursor" && <ol className="installClientChecklist">
      {info.steps.map((step, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{step}</p></li>)}
    </ol>}
    <div className="installEndpointPanel">
      <div><small>{tr("PASTE THIS REMOTE MCP URL", "在平台里粘贴这个 REMOTE MCP 地址")}</small><div className="docsCodeLine"><code>{endpoint}</code>{copyEndpoint}</div></div>
      <p>{tr("Connection name", "连接名称")}: <strong>Remote Arc</strong> · {tr("Transport", "传输方式")}: <strong>Streamable HTTP + OAuth</strong></p>
    </div>
    {client !== "cursor" && <ClientInstallWalkthrough client={client} />}
    {client === "cursor" && <div className="installCursorJson">
      <strong>{tr("Manual alternative · mcp.json", "手动备选 · mcp.json")}</strong>
      <pre>{JSON.stringify({mcpServers:{"remote-arc":{url:endpoint}}},null,2)}</pre>
    </div>}
    <div className="installClientSupport">
      <p>{info.important}</p>
      <nav aria-label={tr("Official setup references", "平台官方操作指南")}>
        <OutLink href={info.docs}>{tr("Official UI walkthrough", "官方界面操作说明")}</OutLink>
        {info.access !== info.docs && <OutLink href={info.access}>{tr("Account availability and permissions", "账号资格与权限")}</OutLink>}
        {client === "cursor" && <OutLink href={cursorCustomize}>{tr("Cursor Customize UI", "Cursor Customize 页面")}</OutLink>}
      </nav>
    </div>
  </section>;
}
