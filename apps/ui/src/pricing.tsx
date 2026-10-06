import React from "react";
import { accountPlanHasFeature, type AccountFeature } from "@remotearc/protocol";
import { useI18n } from "./i18n.js";
import "./pricing.css";

type AccountPlan = "free" | "plus";

export function PricingContent({
  startHref,
  usageHref,
  signedIn,
  currentPlan,
}: {
  startHref: string;
  usageHref: string;
  signedIn: boolean;
  currentPlan: AccountPlan | null;
}) {
  const { tr } = useI18n();

  const freeFeatures = [
    tr("10,000 hosted MCP tool calls per account / month", "每个账户每月 10,000 次托管 MCP 工具调用"),
    tr("Text files, folders, metadata and process inspection", "文本文件、目录、元数据与进程检查"),
    tr("File editing and terminal tools when you explicitly enable them", "明确授权后可使用文件编辑与终端工具"),
    tr("Explicitly shared browser-tab context", "明确共享的浏览器标签页上下文"),
    tr("Per-device permissions, Trusted Write Locations and Sensitive Path Policy", "每设备权限、可信写入区域与 Sensitive Path Policy"),
  ];

  const plusFeatures = [
    tr("Everything in Free", "包含 Free 的全部能力"),
    tr("Binary reads plus 10-minute revision-pinned file resources for large transfers", "二进制读取 + 10 分钟绑定文件版本的大文件临时资源"),
    tr("Durable long-running command Tasks that survive chat disconnects", "可跨聊天断开的持久长命令 Task"),
    tr("Condition watches and scheduled / recurring Tasks", "条件监听与定时 / 周期 Task"),
    tr("Deterministic verification loops with bounded retries", "带有界重试的确定性验证循环"),
    tr("Keep-awake leases on supported devices", "受支持设备的 Keep-awake 租约"),
  ];

  const comparison: Array<{
    label: string;
    feature?: AccountFeature;
  }> = [
    { label: tr("Core remote tools", "核心远程工具") },
    { label: tr("Text file reads", "文本文件读取") },
    { label: tr("Binary file reads", "二进制文件读取"), feature: "binary_read" },
    { label: tr("Durable / overnight Tasks", "持久 / 隔夜 Task"), feature: "durable_tasks" },
    { label: tr("Long-running Tasks", "长任务"), feature: "durable_tasks" },
    { label: tr("Schedules & condition watches", "定时与条件监听"), feature: "scheduled_tasks" },
    { label: tr("Bounded verification loops", "有界验证循环"), feature: "planned_agent_goals" },
    { label: tr("Supported keep-awake", "受支持的保持唤醒"), feature: "keep_awake" },
  ];

  const questions = [
    [
      tr("Does 24/7 mean my computer can be powered off?", "24/7 是不是电脑关机也能继续？"),
      tr(
        "No. Remote Arc keeps the task contract and progress durable, but device-backed execution still needs the paired computer and background agent to be available. If the device goes offline, supported Tasks wait and resume instead of pretending the work completed.",
        "不是。Remote Arc 会持久保存任务契约与进度，但设备侧执行仍需要已配对电脑和后台 Agent 可用。设备离线时，支持的 Task 会等待并在恢复连接后继续，而不是假装任务已经完成。",
      ),
    ],
    [
      tr("Is Plus unlimited AI reasoning?", "Plus 是否等于无限 AI 推理？"),
      tr(
        "No. Remote Arc can keep approved deterministic work, process tracking and schedules durable, but it does not currently keep an ordinary Chat AI reasoning loop alive after that chat ends. Fresh judgment still requires a supported live AI host.",
        "不是。Remote Arc 可以持久执行已授权的确定性工作、进程跟踪和计划任务，但目前不能在普通 Chat 结束后让同一 AI 推理循环自动继续。需要新的判断时，仍需受支持且在线的 AI 宿主。",
      ),
    ],
    [
      tr("How are binary files read?", "二进制文件怎么读取？"),
      tr(
        "Plus exposes read_binary_file as a bounded byte-range tool. It defaults to 64 KiB and caps one call at 256 KiB, returning base64, MIME metadata, EOF state and a chunk SHA-256. Workspace and sensitive-path policies still apply.",
        "Plus 提供 read_binary_file 字节区间工具。默认读取 64 KiB，单次最多 256 KiB，返回 base64、MIME、EOF 状态与分块 SHA-256；Workspace 与敏感路径策略仍然生效。",
      ),
    ],
    [
      tr("How does the monthly allowance work?", "每月额度怎么计算？"),
      tr(
        "The hosted deployment currently meters MCP calls per account and resets at the UTC calendar-month boundary. A single chat request can use several calls. Plus is a capability entitlement; it does not silently bypass the hosted usage meter.",
        "托管服务当前按账户统计 MCP 调用，并在 UTC 自然月边界重置。一条聊天请求可能使用多次调用。Plus 是能力授权，不会悄悄绕过托管调用额度。",
      ),
    ],
    [
      tr("Can I buy Plus in the Dashboard today?", "现在可以直接在 Dashboard 购买 Plus 吗？"),
      tr(
        "Self-service billing is not enabled in this release candidate. Plus is being modeled as a first-class account plan now so billing or workspace plans can provision the same server-side entitlements later without changing tool authorization logic.",
        "当前 release candidate 尚未开放自助付费。现在先把 Plus 建模成正式账户套餐；以后接入付费或 Workspace 套餐时，可以直接下发同一套服务端 entitlement，而无需重写工具授权逻辑。",
      ),
    ],
  ];

  const freeCurrent = currentPlan === "free";
  const plusCurrent = currentPlan === "plus";

  return <main className="pricingContent">
    <header className="pricingIntro">
      <span className="eyebrow">{tr("FREE + PLUS", "FREE + PLUS")}</span>
      <h1>{tr("Remote control is Free. Durable task orchestration is Plus.", "远程控制用 Free，持久任务编排用 Plus。")}</h1>
      <p>{tr(
        "Start with the computer and AI client you already use. Upgrade the account capability boundary when you need binary files, durable long commands, schedules, condition watches or keep-awake support.",
        "继续使用你已有的电脑和 AI 客户端。需要二进制文件、持久长命令、定时任务、条件监听或保持唤醒时，再升级账户能力边界。",
      )}</p>
    </header>

    <section className="pricingPlans" aria-label={tr("Remote Arc plans", "Remote Arc 套餐")}>
      <article className="planCard freePlan">
        <div className="planHeader">
          <span>FREE</span>
          {freeCurrent && <span className="currentPlanTag">{tr("Current plan", "当前套餐")}</span>}
        </div>
        <div className="hostedPrice"><strong>$0</strong><span>/ {tr("month", "月")}</span></div>
        <p className="planDescription">{tr(
          "Core remote-computer access with the security controls that make Remote Arc useful day to day.",
          "日常远程电脑操作所需的核心能力，并保留 Remote Arc 的设备级安全控制。",
        )}</p>
        <ul className="planIncluded">{freeFeatures.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        <a className="primaryButton" href={startHref}>{signedIn ? tr("Open Dashboard", "打开控制台") : tr("Start free", "免费开始")} →</a>
      </article>

      <article className="planCard plusPlan">
        <div className="planHeader">
          <span>PLUS</span>
          <span className="plusBadge">{plusCurrent ? tr("Current plan", "当前套餐") : tr("Early access", "抢先体验")}</span>
        </div>
        <div className="plusPrice"><strong>{tr("Built for ongoing work", "为持续工作而生")}</strong><span>{tr("Self-service billing is not live yet", "自助付费尚未开放")}</span></div>
        <p className="planDescription">{tr(
          "A server-enforced capability tier for work that must persist, wait, resume, plan and inspect more than text.",
          "由服务端强制执行的能力套餐，面向需要持久化、等待、恢复、计划，以及处理文本之外内容的工作。",
        )}</p>
        <ul className="planIncluded plusIncluded">{plusFeatures.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        <a className={plusCurrent ? "primaryButton" : "ghostButton"} href={plusCurrent ? startHref : "/support"}>
          {plusCurrent ? tr("Open Plus Dashboard", "打开 Plus 控制台") : tr("Request Plus access", "申请 Plus 体验")} →
        </a>
      </article>
    </section>

    <section className="pricingCompare">
      <header>
        <span className="eyebrow">{tr("CAPABILITY BOUNDARY", "能力边界")}</span>
        <h2>{tr("One entitlement model, enforced at the relay.", "一套 entitlement 模型，由 Relay 统一执行。")}</h2>
        <p>{tr(
          "The UI explains the plan; it does not grant it. Direct MCP calls, Dashboard actions and future clients all cross the same server-side feature gate.",
          "界面只负责解释套餐，不负责授予权限。直接 MCP 调用、Dashboard 操作和未来客户端都会经过同一套服务端 Feature Gate。",
        )}</p>
      </header>
      <div className="planMatrixWrap">
        <table className="planMatrix">
          <thead><tr><th>{tr("Capability", "能力")}</th><th>Free</th><th>Plus</th></tr></thead>
          <tbody>{comparison.map(({ label, feature }) => <tr key={label}>
            <td>{label}</td>
            <td>{feature ? (accountPlanHasFeature("free", feature) ? "✓" : "—") : "✓"}</td>
            <td>{feature ? (accountPlanHasFeature("plus", feature) ? "✓" : "—") : "✓"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="pricingMetering">
      <header><span className="eyebrow">{tr("HOSTED METERING", "托管调用额度")}</span><h2>{tr("Plans and usage are separate controls.", "套餐能力与调用额度是两套控制。")}</h2></header>
      <div className="meteringGrid">
        <article><span>01</span><h3>{tr("Account plan", "账户套餐")}</h3><p>{tr("Free or Plus decides which capabilities can be invoked.", "Free 或 Plus 决定哪些能力可以被调用。")}</p></article>
        <article><span>02</span><h3>{tr("Device policy", "设备策略")}</h3><p>{tr("Allowed tools, workspace roots and sensitive paths decide where those capabilities can act.", "Allowed tools、工作区目录与敏感路径决定能力可以在哪些位置执行。")}</p></article>
        <article><span>03</span><h3>{tr("Monthly usage", "每月用量")}</h3><p>{tr("Hosted MCP calls are still metered separately. Reaching the allowance never expands permissions.", "托管 MCP 调用仍单独计量；额度变化不会扩大任何权限。")}</p></article>
      </div>
      <a className="pricingUsageLink" href={usageHref}>{tr("Check your current usage", "查看当前用量")} →</a>
    </section>

    <aside className="pricingTasks">
      <div>
        <span className="eyebrow">PLUS · 24/7</span>
        <h2>{tr("Durable does not mean uncontrolled.", "持续运行，不等于失去控制。")}</h2>
        <p>{tr(
          "Plus Tasks persist their goal, approved capabilities, progress and recovery state. Pause/cancel, frozen device policy, bounded planning, verification and supported keep-awake remain part of the control model.",
          "Plus Task 会持久保存目标、批准能力、进度与恢复状态；暂停/取消、冻结设备策略、有界计划、验证机制与受支持的 keep-awake 仍属于控制模型的一部分。",
        )}</p>
      </div>
      <a href="/docs/long-running-work">{tr("Read the long-running work guide", "阅读持续工作指南")} →</a>
    </aside>

    <section className="pricingQuestions">
      <header><span className="eyebrow">{tr("PLAN QUESTIONS", "套餐问题")}</span><h2>{tr("Know the boundary before enabling it.", "启用前先把边界说清楚。")}</h2></header>
      <div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
    </section>

    <footer className="pricingFooter">
      <p>{tr("Want to inspect the permission model first?", "想先看清权限模型？")}</p>
      <a href="/security-model">{tr("Security model", "安全模型")} →</a>
      <a href="/docs">{tr("Product docs", "产品文档")} →</a>
    </footer>
  </main>;
}
