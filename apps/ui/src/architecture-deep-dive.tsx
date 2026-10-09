import React from "react";
import { useI18n } from "./i18n.js";

/**
 * Detailed engineering reference inside /docs.
 * The GitHub markdown is the longer engineering specification; this is the
 * readable bilingual, capability-scoped public explanation.
 */
export function ArchitectureDeepDive() {
  const { tr } = useI18n();
  return <>
    <section id="docs-architecture-deep">
      <h2>{tr("Architecture deep dive: control plane vs execution plane", "架构详解：控制面与执行面")}</h2>
      <p>{tr(
        "Remote Arc has three separate responsibilities: your AI host decides what to do; the Cloudflare control plane authenticates, authorizes, routes and persists known work; the device Agent executes already-permitted operations. The hosted service is not a second remote computer and does not acquire an operating-system login.",
        "Remote Arc 分为三种职责：AI 宿主判断下一步；Cloudflare 控制面负责认证、授权、路由和保存已知工作；设备 Agent 执行已经获批的操作。云端并不是另一台被操作的电脑，也不会获取操作系统登录身份。",
      )}</p>
      <div className="articleFlow"><code>AI / MCP</code><span>→</span><code>OAuth + Worker</code><span>→</span><code>D1 + Durable Object</code><span>→</span><code>Outbound WSS</code><span>→</span><code>Go Agent + Core</code></div>
      <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Layer", "层级")}</th><th>{tr("Responsibilities", "职责")}</th><th>{tr("Trust boundary", "信任边界")}</th></tr></thead><tbody>
        <tr><td>{tr("Reasoning host", "推理宿主")}</td><td>{tr("Selects tools and assesses results", "选择工具并判断结果")}</td><td>{tr("Does not inherit OS authority", "不继承操作系统权限")}</td></tr>
        <tr><td>Worker + D1</td><td>{tr("OAuth, grants, policy, task records and leases", "OAuth、授权、策略、任务记录与租约")}</td><td>{tr("Account, scope, plan and device checks", "账户、Scope、套餐及设备检查")}</td></tr>
        <tr><td>Durable Object</td><td>{tr("Routes live calls to the connected computer", "向在线电脑路由实时调用")}</td><td>{tr("Authenticated outbound device session", "已认证的设备出站会话")}</td></tr>
        <tr><td>Go Agent + Core</td><td>{tr("Files, processes, terminal and Undo", "文件、进程、终端和 Undo")}</td><td>{tr("Local tools, paths and OS user", "本地工具、路径及 OS 用户权限")}</td></tr>
      </tbody></table></div>
      <p>{tr(
        "The Agent and Go Execution Core are separate modules compiled into one executable, not two RPC services. Cloudflare Worker, Dashboard and the protocol implementation continue to use TypeScript. The explicit TypeScript device runtime is a compatibility option.",
        "Agent 和 Go Execution Core 是分别维护、最终编译为同一个二进制的模块，而不是两个 RPC 服务。Cloudflare Worker、Dashboard 和协议实现仍使用 TypeScript；TS 设备运行时是明确选择的兼容选项。",
      )}</p>
    </section>
    <section id="docs-architecture-trust">
      <h2>{tr("Authorization, device ownership and policy evaluation", "认证授权、设备所有权与策略检查")}</h2>
      <p>{tr(
        "A permitted call must pass the AI client's OAuth grant, the account plan ceiling, ownership of the target computer, per-device tool switches, and any local path/sensitive-file rule. Revoking a device and revoking an AI client are separate operations. A previously saved Task never gains new powers merely because a permission was widened later.",
        "一次执行必须通过 AI 客户端 OAuth 授权、套餐能力上限、目标设备所有权、按设备的工具开关以及本地路径/敏感文件规则。撤销设备和撤销 AI 客户端是两种操作。此前保存的 Task 不能因为后来扩大权限就自动获得新能力。",
      )}</p>
      <p>{tr(
        "The most important limitation: Trusted Write Locations constrain supported file tools and a terminal working directory; they are not a kernel-enforced sandbox. An allowed shell may access other resources available to the local OS account. Local Undo covers supported file edits only, not arbitrary shell side effects.",
        "最重要的边界：Trusted Write Locations 限制受支持的文件工具以及终端工作目录，但不是内核强制隔离的沙箱。已授权的 Shell 可能访问本机 OS 用户可用的其他资源。Local Undo 只覆盖受支持的文件编辑，不会撤销任意命令副作用。",
      )}</p>
    </section>
    <section id="docs-architecture-task">
      <h2>{tr("Task lifecycle, leases and concurrency fences", "Task 生命周期、租约与并发防护")}</h2>
      <p>{tr(
        "A durable Task is a stored contract with a target device, approved plan, optional verification, deadline, iteration budget and explicit trigger. The scheduler acquires a time-bound lease before work; updates check the current lease and monotonically advancing revision. A stale worker must not resurrect cancelled work or overwrite a later checkpoint.",
        "持久 Task 是保存下来的合同，包括目标设备、已批准计划、可选验收、期限、迭代预算和明确触发条件。调度器执行前取得有限租约，写回时检查有效租约和单调递增的 revision。旧 Worker 不得恢复已取消任务或覆盖新的检查点。",
      )}</p>
      <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("State", "状态")}</th><th>{tr("Meaning", "含义")}</th></tr></thead><tbody>
        <tr><td>waiting</td><td>{tr("Scheduled or awaiting an approved trigger", "等待时间或已批准的事件触发")}</td></tr>
        <tr><td>running</td><td>{tr("Worker owns the valid lease and can dispatch work", "Worker 持有有效租约，可以派发工作")}</td></tr>
        <tr><td>waiting_for_device</td><td>{tr("Execution pauses while the device is unavailable", "设备不可用期间暂停执行")}</td></tr>
        <tr><td>paused / cancelled / expired</td><td>{tr("Distinct stop reasons; not proof of completion", "不同停止原因，不代表已成功完成")}</td></tr>
        <tr><td>completed / failed</td><td>{tr("Reported outcome and supporting verification or error", "结果以及对应验证证据或错误")}</td></tr>
      </tbody></table></div>
      <p>{tr(
        "File writes, task-state writes and external effects are not one atomic transaction. An unacknowledged command may have run even when its response was lost. The journal must distinguish action intent, observation and an unknown result, rather than blindly repeating the command and claiming exactly-once semantics.",
        "文件写入、Task 状态更新和外部副作用并不是同一个原子事务。某条命令即使没有收到回复，也可能已经执行。日志应区分执行意图、观察结果及结果未知状态，而不是盲目重试并宣称 exactly-once。",
      )}</p>
    </section>
    <section id="docs-architecture-persistence">
      <h2>{tr("Persistence, Undo and crash recovery", "持久化、Undo 与崩溃恢复")}</h2>
      <p>{tr(
        "Device reconnection, Agent process supervision and durable Task recovery solve different problems. WebSocket reconnect re-establishes communication. launchd, systemd-user or a Windows login supervisor may restart an Agent. D1 records survive independently of either process, but no computer can execute while powered off.",
        "设备重连、Agent 进程守护和持久 Task 恢复解决不同的问题。WebSocket 重连负责恢复通信；launchd、systemd-user 或 Windows 登录守护用于重启 Agent。D1 中的任务记录独立保存，但电脑断电时无法实际执行。",
      )}</p>
      <p>{tr(
        "Supported write_file and edit_block actions can save local Undo snapshots. Undo compares the current revision before restoring, refusing to overwrite an unrelated newer edit. Atomic rename without an explicit disk flush is not the same as durable synchronization. macOS and Windows have additional filesystem-specific power-loss limits, so benchmarks must state exactly which mode was measured.",
        "受支持的 write_file 和 edit_block 可以在设备本地建立 Undo 快照，恢复前会对比当前文件版本，拒绝覆盖无关的新修改。没有显式刷盘的原子重命名不等于持久化同步。macOS 和 Windows 还存在各自的文件系统断电边界，所以 Benchmark 必须说明测量了哪种模式。",
      )}</p>
    </section>
    <section id="docs-architecture-data">
      <h2>{tr("Storage, privacy and observability", "存储、隐私与可观测性")}</h2>
      <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Location", "位置")}</th><th>{tr("Stored or managed data", "数据内容")}</th></tr></thead><tbody>
        <tr><td>D1</td><td>{tr("Accounts, device and OAuth grants, policies, Task metadata, leases and bounded results", "账户、设备与 OAuth 授权、策略、Task 元数据、租约和有界结果")}</td></tr>
        <tr><td>Durable Objects</td><td>{tr("Live routing and session ownership", "实时路由与会话所有权")}</td></tr>
        <tr><td>{tr("Local device", "本地设备")}</td><td>{tr("Pairing state, Agent log, process state and Local Undo", "配对状态、Agent 日志、进程状态与 Local Undo")}</td></tr>
      </tbody></table></div>
      <p>{tr(
        "Active tool input and output can pass through the hosted Relay and the chosen AI provider. HTTPS/WSS encrypts transport but does not provide zero-knowledge end-to-end encryption. Ordinary audit logs focus on metadata; approved durable Tasks may retain bounded command output or observations.",
        "实际执行期间，工具输入输出可能经过托管 Relay 和所选 AI 提供商。HTTPS/WSS 保护传输，但不属于零知识端到端加密。普通审计日志以元数据为主；已批准的持久 Task 可能保存有界命令输出和观察内容。",
      )}</p>
    </section>
    <section id="docs-architecture-limits">
      <h2>{tr("What is shipping, and what is still experimental?", "哪些已经上线，哪些仍属于实验？")}</h2>
      <p>{tr(
        "Production Remote Arc supports native device execution, permissioned tools and bounded deterministic tasks. It does not guarantee continuous reasoning by an ordinary Chat session. Source-controlled adaptive continuation, hosted planning, MCP callback wakeup and an isolated OS execution profile require separate host integrations or acceptance tests; their presence in an engineering design does not imply shipped availability.",
        "正式 Remote Arc 支持原生设备执行、受控工具和有界确定性 Task，但不保证普通 Chat 在会话结束后继续推理。源 Agent 自适应续接、托管规划、MCP 回调唤醒和 OS 隔离执行配置都需要独立的宿主集成或验收；出现在设计文档中不代表已经上线。",
      )}</p>
      <div className="articleEndLinks">
        <a href="https://github.com/yaohuangguan/remote-arc/blob/master/docs/system-architecture.en.md" target="_blank" rel="noreferrer">{tr("Complete engineering reference (English)", "完整工程参考（英文）")} ↗</a>
        <a href="https://github.com/yaohuangguan/remote-arc/blob/master/docs/system-architecture.md" target="_blank" rel="noreferrer">{tr("Complete engineering reference (Chinese)", "完整工程参考（中文）")} ↗</a>
        <a href="/docs/long-running-work">{tr("Durable work and limitations", "持久工作与功能边界")} →</a>
      </div>
    </section>
  </>;
}
