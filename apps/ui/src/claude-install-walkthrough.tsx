import React, { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import "./claude-install-walkthrough.css";

type StepKind = "add" | "auth" | "connect" | "tools" | "approval" | "running" | "result";

function MockClaudeScreen({ kind, endpoint }: { kind: StepKind; endpoint: string }) {
  const { tr } = useI18n();
  if (kind === "add" || kind === "auth") {
    return <div className="claudeMockDialog">
      <div className="claudeMockHeading"><strong>Add custom connector</strong><span aria-hidden="true">×</span></div>
      <p>Connect Claude to your data and tools.</p>
      {kind === "add" ? <>
        <label>Connector name</label><div className="claudeMockField">Remote Arc</div>
        <label>Remote MCP URL</label><div className="claudeMockField claudeMockFocus">{endpoint}</div>
        <div className="claudeMockFooter"><span>Cancel</span><b>Continue →</b></div>
      </> : <>
        <div className="claudeMockDivider" />
        <strong className="claudeMockSubhead">Authentication</strong>
        <div className="claudeMockRadio active">● <div><strong>Sign in now</strong><small>Each user signs in through the server’s OAuth flow.</small></div></div>
        <div className="claudeMockRadio">○ <div>Sign in when needed</div></div>
        <div className="claudeMockRadio">○ <div>No sign-in <small>Detected</small></div></div>
        <strong className="claudeMockSubhead">OAuth client</strong>
        <div className="claudeMockRadio active">● <div><strong>Use Claude’s published identity</strong><small>Recommended</small></div></div>
        <div className="claudeMockFooter"><span>Back</span><b>Add →</b></div>
      </>}
    </div>;
  }
  if (kind === "connect") {
    return <div className="claudeMockConnected">
      <div className="claudeMockNav">← Your connectors</div>
      <span className="claudeMockAppIcon">◠</span>
      <small>{endpoint}</small>
      <p>You’re not connected to Remote Arc yet.</p>
      <strong>Connect</strong>
    </div>;
  }
  if (kind === "tools") {
    return <div className="claudeMockTools">
      <div className="claudeMockToolsTop"><strong><span className="claudeMockAppIcon mini">◠</span> Remote Arc</strong><span>Disconnect</span></div>
      <small>{endpoint}</small>
      <h4>Tool permissions</h4><p>Choose when Claude is allowed to use these tools.</p>
      <div className="claudeMockToolHeader"><strong>⌄ Read-only tools <small>18</small></strong><span>Needs approval ⌄</span></div>
      {["List Remote Arc devices", "Get the currently shared browser tab", "Get remote file info"].map((item) =>
        <div className="claudeMockToolRow" key={item}><span>{item}</span><span>✓ &nbsp; ✋ &nbsp; ⊘</span></div>)}
    </div>;
  }
  if (kind === "approval") {
    return <div className="claudeMockChat">
      <span className="claudeMockPrompt">@Remote Arc Help me look at why my Windows C disk is full?</span>
      <div className="claudeMockConsent">
        <span className="claudeMockAppIcon mini">◠</span>
        <strong>Claude wants to use List Remote Arc devices from Remote Arc</strong>
        <div>Deny</div><div>Always allow</div><div className="claudeMockConsentPrimary">Allow once</div>
      </div>
    </div>;
  }
  if (kind === "running") {
    return <div className="claudeMockChat claudeMockAnswer">
      <span className="claudeMockPrompt">@Remote Arc Help me look at why my Windows C disk is full?</span>
      <p>I'll start by checking disk usage and locating the largest folders. This scan is read-only.</p>
      <div className="claudeMockProgress"><span className="claudeMockSpinner" /> Checking disk usage and locating large folders <small>33s</small></div>
    </div>;
  }
  return <div className="claudeMockChat claudeMockAnswer">
    <span className="claudeMockPrompt">@Remote Arc Help me look at why my Windows C disk is full?</span>
    <p>The scan is complete. Here are the largest folders using disk space. I only read file sizes and changed nothing.</p>
    <div className="claudeMockResult">
      <div><b>Location</b><b>Size</b></div>
      <div><span>AppData</span><span>~55 GB</span></div>
      <div><span>Windows</span><span>~32 GB</span></div>
      <div><span>Program Files</span><span>~28 GB</span></div>
      <div><span>System Volume Information</span><span>~11 GB</span></div>
    </div>
    <small>{tr("Example result · no files modified", "示例结果 · 未修改文件")}</small>
  </div>;
}

export function ClaudeInstallWalkthrough({ endpoint }: { endpoint: string }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [expanded]);
  const steps: { kind: StepKind; group: string; title: string; detail: string; note: string }[] = [
    {
      kind: "add", group: tr("SET UP", "添加连接"),
      title: tr("Add a custom connector", "添加自定义连接器"),
      detail: tr("In Claude, open Settings → Connectors. Click + Add in the top-right corner and choose Add custom connector. Name it Remote Arc and paste the MCP URL above, then Continue.",
        "在 Claude 的 Settings → Connectors 页面，点击右上角 + Add → Add custom connector。名称填写 Remote Arc，粘贴上面的 MCP 地址并点击 Continue。"),
      note: tr("The URL must end in /mcp. Do not paste an npx command.", "URL 必须包含 /mcp；不要填入 npx 命令。"),
    },
    {
      kind: "auth", group: tr("SET UP", "添加连接"),
      title: tr("Choose OAuth sign-in", "选择 OAuth 登录"),
      detail: tr("Select Sign in now under Authentication, then Use Claude's published identity under OAuth client (recommended). Click Add.",
        "Authentication 选择 Sign in now；OAuth client 选择 Use Claude's published identity（推荐）。最后点击 Add。"),
      note: tr("Do not choose No sign-in just because Claude labels it Detected. Remote Arc requires account authorization.",
        "即使 No sign-in 显示 Detected，也不要选它。Remote Arc 需要账户 OAuth 授权。"),
    },
    {
      kind: "connect", group: tr("SET UP", "添加连接"),
      title: tr("Connect your Remote Arc account", "连接 Remote Arc 账户"),
      detail: tr("Open the new Remote Arc connector and click Connect. Complete the Remote Arc authorization in the browser.",
        "打开新建的 Remote Arc Connector，点击 Connect，在浏览器中完成 Remote Arc 账户登录与授权。"),
      note: tr("Connecting the account does not pair your computer. Keep the Remote Arc agent online on the device you want to use.",
        "登录账户不等于电脑已配对。目标设备还需要保持 Remote Arc Agent 在线。"),
    },
    {
      kind: "tools", group: tr("PERMISSIONS", "工具权限"),
      title: tr("Review tool permissions", "检查工具权限"),
      detail: tr("After connection, Claude shows the Remote Arc tools. Choose whether it asks before individual tool calls. Keep approval on for sensitive actions.",
        "连接后，Claude 会列出 Remote Arc 工具。你可以设置每个工具是否需要 Claude 端授权；敏感操作建议保留审批。"),
      note: tr("Claude's tool permissions do not override Remote Arc's device-side Safety Guard or workspace restrictions.",
        "Claude 端权限不会绕过 Remote Arc 设备端 Safety Guard 或 Workspace 限制。"),
    },
    {
      kind: "approval", group: tr("TRY IT", "开始使用"),
      title: tr("Approve the first tool call", "批准第一次工具调用"),
      detail: tr("Ask Claude to use @Remote Arc in a chat. On the first call, choose Allow once, or Always allow for tools you fully trust.",
        "在 Claude 对话中使用 @Remote Arc 发起请求。首次调用可选 Allow once，完全信任的工具才考虑 Always allow。"),
      note: tr("For a safer first test, start with read-only operations such as listing devices.",
        "第一次测试建议从列设备等只读操作开始。"),
    },
    {
      kind: "running", group: tr("TRY IT", "开始使用"),
      title: tr("Let Claude work on your computer", "让 Claude 开始执行"),
      detail: tr("For example, ask Claude why your Windows C: drive is using space. Remote Arc can inspect permitted folders without modifying them.",
        "例如，让 Claude 分析 Windows C 盘空间占用。Remote Arc 可以在授权范围内只读检查目录，而无需修改文件。"),
      note: tr("Disk scans can take a while. A slow response does not mean the connection failed.",
        "磁盘扫描可能需要一点时间，响应较慢不代表连接失败。"),
    },
    {
      kind: "result", group: tr("TRY IT", "开始使用"),
      title: tr("Review the results", "查看执行结果"),
      detail: tr("Claude returns a folder-by-folder breakdown. Confirm that the result is read-only before approving any cleanup or changes.",
        "Claude 会汇总各目录占用空间。要清理文件之前，先确认结果并单独审核任何写入操作。"),
      note: tr("The example numbers are illustrative, not a live scan of your device.", "示例数值仅用于说明，并非你的设备实时扫描结果。"),
    },
  ];
  const step = steps[selected]!;
  const move = (next: number) => { setSelected(Math.min(steps.length - 1, Math.max(0, next))); };

  return <div className="claudeWalkthrough">
    <div className="claudeGuideIntro">
      <div><span className="eyebrow">{tr("VISUAL WALKTHROUGH", "可视化安装指南")}</span>
        <h3>{tr("Connect Claude in 7 small steps", "7 个步骤，在 Claude 中接入 Remote Arc")}</h3>
        <p>{tr("One step at a time, with the screen you're looking for. No endless screenshot scrolling.",
          "一次只看一张操作示意，逐步完成，不必在一长串截图中来回找。")}</p></div>
      <span className="claudeGuideCount">{String(selected + 1).padStart(2, "0")} <span>/ 07</span></span>
    </div>
    <div className="claudeGuideLayout">
      <nav className="claudeGuideNav" aria-label={tr("Claude connector setup steps", "Claude 连接器安装步骤")}>
        {steps.map((item, index) => <button type="button" key={item.kind}
          className={selected === index ? "claudeGuideStep active" : "claudeGuideStep"}
          aria-current={selected === index ? "step" : undefined}
          onClick={() => move(index)}>
          <span className="claudeGuideStepNum">{String(index + 1).padStart(2, "0")}</span>
          <span className="claudeGuideStepText"><small>{item.group}</small><strong>{item.title}</strong></span>
        </button>)}
      </nav>
      <div className="claudeGuideMain">
        <div className="claudeGuideText"><span>{tr("STEP", "步骤")} {String(selected + 1).padStart(2, "0")}</span>
          <h4>{step.title}</h4><p>{step.detail}</p></div>
        <button className="claudeGuidePreview" type="button"
          onClick={() => setExpanded(true)}
          aria-label={tr("Expand this step illustration", "放大当前步骤的界面示意图")}>
          <div className="claudeGuideBrowserBar"><span className="claudeGuideBrowserDots"><i /><i /><i /></span><span>claude.ai</span><span>⤢</span></div>
          <MockClaudeScreen kind={step.kind} endpoint={endpoint} />
        </button>
        <p className="claudeGuideHint"><span aria-hidden="true">ⓘ</span>{step.note}</p>
        <div className="claudeGuideControls">
          <button type="button" onClick={() => move(selected - 1)} disabled={selected === 0}>← {tr("Back", "上一步")}</button>
          <span className="claudeGuideProgress" aria-hidden="true"><i style={{ width: ((selected + 1) / steps.length) * 100 + "%" }} /></span>
          <button type="button" onClick={() => move(selected + 1)} disabled={selected === steps.length - 1}>{tr("Next step", "下一步")} →</button>
        </div>
      </div>
    </div>
    {expanded && <div className="claudeGuideOverlay" role="presentation" onClick={() => setExpanded(false)}>
      <div className="claudeGuideModal" role="dialog" aria-modal="true" aria-label={step.title} onClick={(e) => e.stopPropagation()}>
        <div className="claudeGuideModalHeader"><strong>{String(selected + 1).padStart(2, "0")} · {step.title}</strong><button type="button" onClick={() => setExpanded(false)} aria-label={tr("Close", "关闭")}>×</button></div>
        <div className="claudeGuideModalContent"><MockClaudeScreen kind={step.kind} endpoint={endpoint} /></div>
        <p>{step.note}</p>
      </div>
    </div>}
  </div>;
}
