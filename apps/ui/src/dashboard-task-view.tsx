import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import type { PlannedProgress } from "./planned-goal-view.js";
const PlannedGoalProgress = React.lazy(() => import("./planned-goal-view.js").then(module => ({ default: module.PlannedGoalProgress })));

type Task = {
  id: string;
  status: string;
  state_json: string | null;
  created_at: string;
  last_run_at: string | null;
  expires_at: string | null;
  interval_seconds: number;
  last_error: string | null;
  kind?: string;
  next_run_at?: string | null;
  goal_json?: string | null;
};
type Progress = {
  planned?: PlannedProgress;
  phase?: string;
  process_id?: string;
  agent?: {
    iteration?: number;
    last_decision_summary?: string;
    completion_evidence?: string;
    observation?: string;
  };
};
type Run = {
  id: string;
  attempt: number;
  status: string;
  exit_code: number | null;
  output_summary: string | null;
  error: string | null;
  started_at: string;
};

export function taskProgress(task: Pick<Task, "state_json">): Progress {
  try { return (JSON.parse(task.state_json || "{}") || {}) as Progress; }
  catch { return {}; }
}

export function taskNeedsAgent(task: Pick<Task, "state_json" | "status">) {
  return task.status === "waiting_for_event" && ["awaiting_agent", "needs_reasoning"].includes(taskProgress(task).phase || "");
}

export function taskNeedsAttention(task: Pick<Task, "state_json" | "status">) {
  return taskNeedsAgent(task) || ["waiting_for_device", "failed", "expired"].includes(task.status);
}

export function taskActivity(task: Pick<Task, "status" | "state_json" | "kind" | "next_run_at">, tr: (en: string, zh: string) => string) {
  if (task.status === "completed") return tr("Completed · results saved", "已完成，结果已保存");
  if (task.status === "failed") return tr("Execution failed · inspect the error", "执行失败，请查看错误");
  if (task.status === "cancelled") return tr("Cancelled · orchestration stopped", "已取消，编排已停止");
  if (task.status === "expired") return tr("Time limit reached · inspect the outcome", "已到期限，请查看实际成果");
  if (task.status === "paused") return tr("Paused · resume when ready", "已暂停，可手动恢复");
  if (task.status === "waiting_for_device") return tr("Waiting for the computer to reconnect", "等待电脑重新连接");
  if (taskNeedsAgent(task)) return tr("Waiting for an AI decision in chat", "等待聊天中的 AI 提交决策");
  if (task.status === "waiting_for_event") return tr("Waiting for a matching webhook", "等待匹配的 Webhook 事件");
  const progress = taskProgress(task);
  if (progress.planned?.finalizing) return tr("Finalizing and checking the outcome", "正在收尾并检查成果");
  if (["agent_verify_running", "goal_running"].includes(progress.phase || "")) return tr("Verifying the result", "正在验证结果");
  if (["agent_process_running", "step_running", "planned_process_running"].includes(progress.phase || "") || progress.process_id) return tr("Saved command is running", "保存的命令正在执行");
  if (task.status === "running") return tr("Working through the next step", "正在推进下一步");
  if (task.next_run_at && Date.parse(task.next_run_at) > Date.now()) return tr("Waiting for the next scheduled run", "等待下一次计划执行");
  return tr("Queued · starts when the device is available", "已排队，设备可用后启动");
}

export function TaskResults({ task, referenceControl, reveal = false }: { task: Task; referenceControl?: React.ReactNode; reveal?: boolean }) {
  const { tr, locale } = useI18n();
  const linked = new URLSearchParams(location.search).get("task") === task.id;
  const [open, setOpen] = useState(linked);
  const details = useRef<HTMLDetailsElement>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const progress = taskProgress(task);
  useEffect(() => {
    if (!linked && !reveal) return;
    setOpen(true);
    const frame = requestAnimationFrame(() => details.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [linked, reveal]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/automations/" + encodeURIComponent(task.id), { signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json() as { runs?: Run[] };
        if (!controller.signal.aborted) {
          setRuns(Array.isArray(data.runs) ? data.runs.slice(0, 10) : []);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally { fetching = false; }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [open, task.id, retry]);

  const timestamp = (value: string | null) => value
    ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "—";
  const phaseLabel = taskActivity(task, tr);
  const chatReference = <div className="taskChatReference"><strong>{tr("Open this task in your AI chat", "在 AI 聊天中引用这条任务")}</strong>{referenceControl}<code>{task.id}</code><p>{tr("Paste the reference into an authorized, connected AI chat. Remote Arc provides saved task context; it cannot read your other chats or start a ChatGPT conversation.", "将引用粘贴到已授权并连接的 AI 聊天中。Remote Arc 提供保存的任务上下文，不会读取其他聊天或自动开启 ChatGPT 对话。")}</p></div>;

  return (
    <details ref={details} open={open} className="automationDetails" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{tr("Progress & results", "进度与结果")}<span aria-hidden="true">›</span></summary>
      <div className="taskResultsBody">
        {!['completed', 'failed', 'cancelled', 'expired'].includes(task.status) && (
          <div className="taskProgressPanel">
            <strong>{phaseLabel}</strong>
            {progress.agent && <span>{tr("Planning turn", "规划轮次")} {progress.agent.iteration || 0}</span>}
            {progress.agent?.last_decision_summary && <p>{progress.agent.last_decision_summary}</p>}
            {taskNeedsAgent(task) && <p>{tr("The source AI must read the latest context and submit the next decision. If you created this goal here, copy its reference into your connected AI chat. Closing this page does not wake that AI.", "来源 AI 需要读取最新上下文并提交下一步决策。如果目标是在这里创建的，请将任务引用复制到已连接的 AI 聊天。关闭此页面不会唤起 AI。")}</p>}
          </div>
        )}
        {taskNeedsAgent(task) && chatReference}
        {progress.agent?.completion_evidence && <div className="taskEvidence"><strong>{tr("Completion evidence", "完成证据")}</strong><p>{progress.agent.completion_evidence}</p></div>}
        {progress.planned && <React.Suspense fallback={<p role="status">{tr("Loading saved plan…", "正在加载保存的计划…")}</p>}><PlannedGoalProgress value={progress.planned} expiresAt={task.expires_at} /></React.Suspense>}
        {task.last_error && <p className="automationLastError">{task.last_error}</p>}
        <div className="taskRunHistory" aria-busy={open && runs === null && !error}>
          <h3>{tr("Recent runs", "最近执行")}</h3>
          {error && <p role="status">{tr("Run history could not be loaded.", "执行记录加载失败。 ")} <button className="ghostButton" onClick={() => setRetry((value) => value + 1)}>{tr("Retry", "重试")}</button></p>}
          {open && runs === null && !error && <p role="status">{tr("Loading results…", "正在加载结果…")}</p>}
          {runs?.length === 0 && <p>{tr("Results appear here when the first run starts.", "第一次执行开始后，结果会显示在这里。")}</p>}
          {runs?.map((run) => (
            <details className="taskRun" key={run.id}>
              <summary>
                <strong>{tr("Run", "执行")} {run.attempt}</strong>
                <span>{run.status === "completed" ? tr("Completed", "已完成") : run.status === "running" ? tr("Running", "运行中") : run.status === "failed" ? tr("Failed", "失败") : run.status === "cancelled" ? tr("Cancelled", "已取消") : run.status}</span>
                <time dateTime={run.started_at}>{timestamp(run.started_at)}</time>
                {run.exit_code !== null && <span>{tr("Exit", "退出码")} {run.exit_code}</span>}
              </summary>
              {run.error && <p className="automationLastError">{run.error}</p>}
              {run.output_summary ? <pre>{run.output_summary.slice(0, 12000)}</pre> : <p>{tr("No output recorded yet.", "暂时没有输出记录。")}</p>}
            </details>
          ))}
        </div>
        <details className="taskTechnicalDetails"><summary>{tr("Timing & chat reference", "时间与聊天引用")}</summary>
          <div className="automationDetailGrid">
            <div><span>{tr("Created", "创建时间")}</span><strong>{timestamp(task.created_at)}</strong></div>
            <div><span>{tr("Last run", "上次执行")}</span><strong>{timestamp(task.last_run_at)}</strong></div>
            <div><span>{tr("Expires", "到期时间")}</span><strong>{task.expires_at ? timestamp(task.expires_at) : tr("No expiry", "未设置")}</strong></div>
            <div><span>{tr("Check interval", "检查间隔")}</span><strong>{Math.round(task.interval_seconds / 60)} {tr("min", "分钟")}</strong></div>
          </div>{!taskNeedsAgent(task) && chatReference}
        </details>
        <p className="automationDetailNote"><a href="/docs/long-running-work">{tr("Understand task recovery and completion checks", "了解任务恢复与完成验收")} →</a></p>
      </div>
    </details>
  );
}
