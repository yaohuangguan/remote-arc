import React from "react";
import { useI18n } from "./i18n.js";
import "./pricing.css";

export function PricingContent({ startHref, usageHref, signedIn }: { startHref: string; usageHref: string; signedIn: boolean }) {
  const { tr } = useI18n();
  const included = [
    tr("Connect your existing compatible AI client", "连接现有兼容 AI 客户端"),
    tr("Pair your Windows, macOS and Linux computers", "配对自己的 Windows、macOS 与 Linux 电脑"),
    tr("Choose tools and workspace permissions per device", "为每台设备选择工具与工作区权限"),
    tr("Manage access and inspect usage in Dashboard", "在 Dashboard 管理访问与查看额度"),
  ];
  const questions = [
    [tr("Is a tool call the same as a chat message?", "一次工具调用等于一条聊天消息吗？"), tr("A chat request can lead to several MCP calls: read a file, edit it, start a test, then inspect the result. Device discovery and task management also use calls. A call can use allowance even if the requested operation later fails.", "一条聊天请求可能产生多次 MCP 调用：读文件、编辑、启动测试，再查看结果。设备发现与任务管理也消耗调用额度。调用之后的操作失败，仍可能占用一次额度。")],
    [tr("When does the allowance reset?", "额度什么时候重置？"), tr("Usage is tracked per account in calendar months using UTC. A new month starts a new counter; unused allowance does not carry forward. Dashboard shows the limit and remaining usage for your account.", "按账户和 UTC 自然月统计。新月份使用新的计数，未使用额度不结转。Dashboard 显示你账户的实际限制与剩余额度。")],
    [tr("What happens when I reach the limit?", "额度用完后会怎样？"), tr("Further metered MCP calls return a monthly-limit error until the allowance resets. There is no automatic paid overage or self-service top-up currently. Use Support to discuss capacity needs; earlier work is not rolled back by reaching the limit.", "后续计入额度的 MCP 调用会返回月度限额错误，直到额度重置。当前没有自动付费超额或自助充值。可通过支持渠道沟通容量需求；额度耗尽不会撤回之前的操作。")],
    [tr("Does this include my AI subscription or model inference?", "包括 AI 订阅或模型推理费用吗？"), tr("Your ChatGPT, Claude or other AI-client plan is separate. The free allowance measures Remote Arc MCP calls, not model tokens or hours of autonomous reasoning. Pricing for the optional hosted planner is not published; do not interpret this allowance as unlimited hosted inference.", "ChatGPT、Claude 或其他 AI 客户端订阅独立计算。免费额度衡量 Remote Arc MCP 调用，不是模型 Token 或自主推理时长。可选托管 Planner 的价格尚未公布，不能把这份额度理解成无限托管推理。")],
  ];
  return <main className="pricingContent">
    <header className="pricingIntro"><span className="eyebrow">{tr("HOSTED ACCESS", "托管连接")}</span><h1>{tr("Start free. Keep your own setup.", "免费开始，沿用你的工作环境。")}</h1><p>{tr("Use the AI client and computer you already have. Remote Arc hosts the connection; you choose what each device can do.", "继续使用已有 AI 客户端与电脑。Remote Arc 托管连接，每台设备能做什么由你决定。")}</p></header>

    <section className="pricingPlans" aria-label={tr("Hosted pricing and capacity", "托管价格与容量") }>
      <article className="hostedPlan">
        <div className="planHeader"><span>{tr("HOSTED FREE", "托管免费版")}</span><span className="currentPlanTag">{tr("Current offer", "当前方案")}</span></div>
        <div className="hostedPrice"><strong>$0</strong><span>/ {tr("month", "月")}</span></div>
        <div className="includedAllowance"><strong>10,000</strong><span>{tr("tool calls per month", "每月工具调用")}</span></div>
        <p className="planDescription">{tr("One account allowance shared across your paired devices. Your computer performs the work.", "一个账户的额度由已配对设备共用，实际工作在你的电脑上执行。")}</p>
        <ul className="planIncluded">{included.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        <a className="primaryButton" href={startHref}>{signedIn ? tr("Open Dashboard", "打开控制台") : tr("Start free", "免费开始")} →</a>
        <small>{tr("Default hosted allowance. Your account's current limit is shown in Dashboard.", "默认托管额度，账户当前限制以 Dashboard 显示为准。")}</small>
      </article>
      <article className="capacityPlan">
        <span className="eyebrow">{tr("MORE CAPACITY", "更多容量")}</span><h2>{tr("Need a larger allowance?", "需要更高额度？")}</h2>
        <p>{tr("Tell us how many computers and workflows you need to support. Paid plans, rates and self-service top-ups are not available yet.", "告诉我们需要支持多少电脑和工作流。目前尚未开放付费方案、价格表或自助充值。")}</p>
        <div className="capacityDetails"><strong>{tr("Keep your connection simple", "连接保持简单")}</strong><p>{tr("Your account, paired devices and OAuth permissions stay in one place. Capacity should be understandable before you commit to it.", "账户、已配对设备与 OAuth 权限集中管理，容量方案应在使用前清楚说明。")}</p></div>
        <a className="ghostButton" href="/support">{tr("Discuss capacity", "咨询容量需求")} ↗</a>
        <a className="pricingUsageLink" href={usageHref}>{tr("Check your current usage", "查看当前用量")} →</a>
      </article>
    </section>

    <section className="pricingMetering">
      <header><span className="eyebrow">{tr("KNOW WHAT IS COUNTED", "知道额度如何计算")}</span><h2>{tr("How your allowance works.", "每月额度如何使用。")}</h2></header>
      <div className="meteringGrid">
        <article><span>01</span><h3>{tr("Each metered MCP call", "每次计入额度的 MCP 调用")}</h3><p>{tr("A single request can use several tools. Reads, edits, process checks and task decisions are separate calls.", "一个请求可能用到多个工具。读取、编辑、进程检查与任务决策是分别计数的调用。")}</p></article>
        <article><span>02</span><h3>{tr("One account, one month", "一个账户，一个自然月")}</h3><p>{tr("Paired devices share the allowance. Usage resets at the UTC calendar-month boundary.", "已配对设备共用账户额度，在 UTC 自然月边界重置。")}</p></article>
        <article><span>03</span><h3>{tr("Your AI plan is separate", "AI 订阅独立计算")}</h3><p>{tr("Remote Arc connects the tools. Your chosen provider controls its models, subscription and host runtime limits.", "Remote Arc 负责工具连接，所选 AI 服务决定模型、订阅与宿主运行限制。")}</p></article>
      </div>
    </section>

    <aside className="pricingTasks"><div><span className="eyebrow">{tr("LONG-RUNNING WORK", "持续工作")}</span><h2>{tr("Tasks have their own limits and requirements.", "Task 有独立的限制与运行条件。")}</h2><p>{tr("Overnight, scheduled and adaptive Tasks are staged for release. A saved Task is not a promise of unlimited AI reasoning. Matching agents, device permissions, an available computer and a continuing controller are required as appropriate.", "过夜、定时与自主 Task 正在准备发布。保存 Task 不代表无限 AI 推理，还需按任务类型满足匹配 Agent、设备权限、电脑可用与持续控制器等条件。")}</p></div><a href="/docs/long-running-work">{tr("Read the task guide", "阅读任务指南")} →</a></aside>

    <section className="pricingQuestions"><header><span className="eyebrow">{tr("PRICING QUESTIONS", "价格与额度问题")}</span><h2>{tr("Before you start.", "开始前了解。")}</h2></header><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div></section>
    <footer className="pricingFooter"><p>{tr("Want to understand the access you are granting?", "想先了解授予了哪些电脑权限？")}</p><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/docs">{tr("Product docs", "产品文档")} →</a></footer>
  </main>;
}
