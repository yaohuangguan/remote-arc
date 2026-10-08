import React from "react";
import { useI18n } from "./i18n.js";
import { TaskAvailability } from "./product-docs.js";
import "./public-docs.css";

export const useCaseSlugs = ["remote-development", "file-organization", "overnight-goals", "long-running-jobs", "scheduled-checks", "ci-follow-up", "data-work", "home-lab", "browser-research", "remote-support", "presentation-deck", "spreadsheet-report", "desktop-automation", "cross-device-handoff"] as const;
export type UseCaseSlug = typeof useCaseSlugs[number];
type Tr = (en: string, zh: string) => string;

function cases(tr: Tr) {
  return [
    {
      slug: "remote-development", category: tr("DEVELOPMENT", "开发"), title: tr("Fix a project on your own computer", "修复自己电脑上的项目"),
      intro: tr("Use the existing checkout, installed dependencies and toolchain. Ask your AI to inspect, edit and test on the computer where the work already lives.", "使用现有仓库、依赖和工具链，让 AI 在项目所在电脑上检查、修改并测试。"),
      prompt: tr("On my workstation, inspect the checkout in ~/projects/app, reproduce the failing route test, fix the affected code and rerun the focused tests. Show the diff before committing.", "在我的工作站上检查 ~/projects/app，复现失败的路由测试、修复相关代码并重跑测试。提交前给我看 diff。"),
      tools: "list_devices · device_tools · read_file · edit_block · start_process", permission: tr("File reads, file editing and terminal for tests", "文件读取、文件编辑，以及用于测试的终端权限"),
      steps: [tr("Resolve the named device and inspect its available tools and checkout.", "确认目标设备、可用工具和仓库状态。"), tr("Read the failing implementation before editing; run commands in the selected workspace.", "编辑前读取失败实现，在所选工作区运行命令。"), tr("Use focused checks, inspect the diff and report the result.", "运行相关检查、检查 diff 并汇报结果。")],
      proof: tr("A concrete diff, focused test output and a clear statement of remaining failures.", "具体 diff、相关测试结果，以及仍未解决的失败。"),
      limit: tr("Terminal runs as the local OS user. Trusted Write Locations do not sandbox shell commands. Local Undo covers supported file-tool edits, not shell edits or git history.", "终端以本机 OS 用户运行，可信写入区域不会隔离 Shell。Local Undo 覆盖受支持文件工具的修改，不覆盖 Shell 编辑或 git 历史。"), durable: false,
    },
    {
      slug: "file-organization", category: tr("FILES", "文件"), title: tr("Organize files with a reviewed move plan", "按确认的整理计划归类文件"),
      intro: tr("Inspect a chosen folder, propose a grouping plan and use an authorized local command to move files. Keep destructive changes separate from organization.", "检查指定文件夹、提出归类计划，再通过获授权本机命令移动文件，将破坏性修改与整理分开。"),
      prompt: tr("Inspect my selected Downloads folder and propose how to group documents and images. Show the move plan first. After I approve, move only those files, do not delete or overwrite anything, and save a before/after manifest.", "检查我指定的 Downloads 文件夹，提出文档和图片归类方式，先给我看移动计划。确认后只移动这些文件，不删除或覆盖，保存整理前后清单。"),
      tools: "list_directory · get_file_info · read_file · start_process", permission: tr("Folder reads for planning; separately authorized terminal for file moves", "文件夹读取用于规划，文件移动另需终端授权"),
      steps: [tr("Inspect names and metadata; avoid reading unnecessary file contents.", "检查名称和元数据，避免读取不必要文件内容。"), tr("Review destinations, collisions and the exact move list.", "确认目标位置、重名冲突和具体移动清单。"), tr("Execute the approved plan and verify the before/after manifest.", "执行已批准计划并核对整理前后清单。")],
      proof: tr("The approved move list, collision handling and verified destination files.", "已批准移动清单、冲突处理与已核对的目标文件。"),
      limit: tr("No dedicated move-file MCP tool is currently exposed. Moves use terminal access with real local-user permissions. Shell moves are outside Local Undo; a manifest helps review but is not transactional rollback.", "当前没有专门的移动文件 MCP 工具，移动通过具有真实本机用户权限的终端执行。Shell 移动不属于 Local Undo，清单帮助检查但不是事务回滚。"), durable: false,
    },
    {
      slug: "overnight-goals", category: tr("DURABLE LOOP", "持久循环"), title: tr("Leave a bounded fixed plan running", "离开前运行一个有界固定计划"),
      intro: tr("When the actions and verification command are already known, Remote Arc can persist a bounded goal loop without pretending an AI keeps thinking after chat ends.", "当操作步骤和验收命令已经明确时，Remote Arc 可以持久执行有界目标循环，而不会声称聊天结束后 AI 仍在持续思考。"),
      prompt: tr("On build-pc, run the existing repair script, then pnpm test. Retry the same approved plan up to three times if verification fails, stop at the deadline, and record the final exit status. Do not invent a new strategy after an unexpected failure.", "在 build-pc 上运行现有修复脚本，然后执行 pnpm test。若验收失败，最多按同一个已批准计划重试三次，到期限停止并记录最终退出状态。遇到意外失败时不要自行发明新策略。"),
      tools: "create_automation(kind=goal_loop) · get_automation · manage_automation", permission: tr("Terminal + background tasks", "终端 + 后台任务"),
      steps: [tr("Save the exact work command, verification command, cwd, run limit and expiry.", "保存明确的工作命令、验收命令、cwd、运行次数上限与到期时间。"), tr("Run the same authorized plan and verification until it passes or the bound is reached.", "重复执行同一已授权计划与验收，直到通过或达到边界。"), tr("If the result requires a genuinely new strategy, stop and surface that blocker for a later AI/user decision.", "如果结果需要真正的新策略，则停止并把阻塞留给之后的 AI/用户判断。")],
      proof: tr("Run history, exit codes and the final verification result.", "运行历史、退出码与最终验收结果。"),
      limit: tr("This is deterministic orchestration, not a persistent AI reasoning loop. Ordinary Chat is not automatically woken to rethink the strategy.", "这是确定性编排，不是持久 AI 推理循环。普通 Chat 不会被自动唤醒来重新判断策略。"), durable: true,
    },
    {
      slug: "long-running-jobs", category: tr("LONG TASK", "长任务"), title: tr("Track a build, export or script after chat ends", "聊天结束后仍跟踪构建、导出或脚本"),
      intro: tr("When the command is known, save a Long Task rather than keeping a chat turn open. Remote Arc tracks the command and records its outcome independently of the creating conversation.", "命令已确定时，可以保存 Long Task，无需一直保持一个聊天轮次。Remote Arc 独立于创建它的对话跟踪命令并记录结果。"),
      prompt: tr("Run the existing report export on data-pc as a saved long task. Use the project directory, keep the output there and report the exit code and result summary. If the process handle is lost, fail instead of automatically running the export twice.", "在 data-pc 上将现有报表导出保存为长任务，使用项目目录并把输出保存在那里。汇报退出码与结果摘要；进程句柄丢失时失败停止，不自动重复导出。"),
      tools: "create_automation(kind=long_task) · get_automation · manage_automation", permission: tr("Terminal + background tasks", "终端 + 后台任务"),
      steps: [tr("Save the command, cwd, recovery choice and expiry.", "保存命令、cwd、恢复方式和到期时间。"), tr("The scheduler starts and follows the managed process; offline work waits for reconnection.", "调度器启动并跟踪受管进程，设备离线时等待重连。"), tr("Read exit status and bounded output summary from chat or Dashboard; cancel if needed.", "从聊天或 Dashboard 阅读退出状态与受限输出摘要，必要时取消。")],
      proof: tr("Exit code and the generated artifact checked on the device; a summary alone does not prove file integrity.", "退出码以及在设备上检查过的生成文件；摘要本身不能证明文件完整。"),
      limit: tr("The Task survives in the database, not the same PID. A lost acknowledged handle can restart or fail according to recovery. A dispatch with unknown outcome is not blindly replayed. No continuous AI planning is required for this fixed command.", "数据库保存的是 Task，不是同一个 PID。已确认进程的句柄丢失后按 recovery 重启或失败；派发结果未知时不会盲目重放。固定命令不需要持续 AI 规划。"), durable: true,
    },
    {
      slug: "scheduled-checks", category: tr("SCHEDULED WORK", "定时工作"), title: tr("Run a check later, or repeat it between runs", "稍后检查，或按间隔重复"),
      intro: tr("Save a fixed check or deterministic task for a future time. Repeated work starts a fresh run and keeps its own results without overlapping the same task.", "把固定检查或自主目标安排在未来时间。重复任务每轮重新运行、独立保存结果，同一任务不重叠执行。"),
      prompt: tr("At the agreed time, run the existing health-check script on home-server and save the result. Repeat 30 minutes after each run completes, stop at the deadline and do not restart services.", "在约定时间运行 home-server 上现有健康检查脚本并保存结果，每轮完成 30 分钟后再次运行，到期限停止，不重启服务。"),
      tools: "create_automation(kind=schedule_watch) or create_agent_goal(schedule=…) · get_automation", permission: tr("Required tools + background tasks + scheduled tasks; adaptive/source permissions if using an Agent Goal", "所需工具 + 后台任务 + 定时任务；使用自主或源目标时还需对应权限"),
      steps: [tr("Confirm an explicit timestamp or interval, the permitted action and stop limits.", "确认明确时间或间隔、允许动作与停止限制。"), tr("The cloud scheduler makes work due; device execution waits until the computer is available.", "云调度器把任务设为到期，设备执行等待电脑可用。"), tr("Read each run's result. For recurring goals, memory and iteration budgets reset for each run.", "阅读每轮结果；周期目标每轮重置工作记忆和迭代预算。")],
      proof: tr("Per-run timestamps, exit codes and result summaries; for an adaptive check, configured verification and evidence.", "每轮时间、退出码与结果摘要；自主检查还包括配置的验证与证据。"),
      limit: tr("Intervals start after completion, not at fixed wall-clock minutes. Calendar cron, timezone/DST behavior, missed-run backfill and automatic power-on are not implemented. The one-minute scheduler is not a precision timer.", "间隔从完成后开始，不是固定墙钟时间。未实现日历 Cron、时区与夏令时处理、错过运行补跑或自动开机；每分钟调度器不是精确定时器。"), durable: true,
    },
    {
      slug: "ci-follow-up", category: tr("CONDITION WATCH", "条件触发"), title: tr("Act after a matching CI or webhook event", "匹配 CI 或 Webhook 事件后执行"),
      intro: tr("A Condition Watch saves the matching event and a fixed action. Use it for an authorized follow-up that should wait until an external condition is met.", "Condition Watch 保存匹配事件和固定动作，适合等待外部条件满足后执行已授权后续操作。"),
      prompt: tr("Watch the configured CI callback for this run. When the expected workflow completes successfully, run the approved follow-up script on build-pc once. Stop at the deadline and record the event and result.", "监听配置的本轮 CI 回调；预期工作流成功完成后，在 build-pc 上运行一次已批准后续脚本，到期限停止，记录事件和结果。"),
      tools: "create_automation(kind=condition_watch) · get_automation · manage_automation", permission: tr("Required device tools and background tasks, or explicit account/repository authorization for a cloud GitHub merge", "设备所需工具与后台任务；云端 GitHub 合并则要求明确账户与仓库授权"),
      steps: [tr("Freeze the condition match and action. Store the returned secret callback URL securely.", "冻结条件匹配与动作，安全保存返回的秘密回调 URL。"), tr("Configure the event source to deliver to that URL; a matching event makes the saved plan due.", "配置事件来源向该 URL 投递，匹配事件触发已保存计划。"), tr("Check the action result and run history. A GitHub merge additionally requires an authorized installation and repository.", "检查动作结果和运行历史；GitHub 合并还要求已授权安装与仓库。")],
      proof: tr("The matched event and the actual action outcome, rather than just a received callback.", "匹配事件与实际动作结果，而非仅仅收到回调。"),
      limit: tr("Inbound condition hooks use a secret bearer URL and optional delivery-ID deduplication, not provider-specific GitHub HMAC verification. They are separate from signed outbound MCP task events. Do not treat every successful workflow as permission to merge.", "入站条件 Hook 使用秘密 Bearer URL 和可选 Delivery ID 去重，不是 GitHub 专属 HMAC 验证；它与出站签名 MCP 任务事件不同。工作流成功不等于获得合并许可。"), durable: true,
    },
    {
      slug: "data-work", category: tr("DATA", "数据"), title: tr("Process data using your installed environment", "用现有本机环境处理数据"),
      intro: tr("Use the Python, Node or other runtime already installed on the workstation. Keep input and generated artifacts in the chosen project directory.", "使用工作站已安装的 Python、Node 或其他运行时，将输入和生成文件放在指定项目目录。"),
      prompt: tr("On data-pc, use the existing Python environment to summarize reports/input.csv, check row totals and write reports/summary.md. If this will take a long time, save the approved script as a Long Task.", "在 data-pc 上使用现有 Python 环境汇总 reports/input.csv，检查行数合计并写入 reports/summary.md。耗时较长时，把已批准脚本保存为 Long Task。"),
      tools: "read_file · get_file_info · start_process · write_file; create_automation for a long job", permission: tr("File reads + needed editing/terminal tools; background tasks for durable processing", "文件读取 + 所需编辑或终端工具；持久处理还需后台任务"),
      steps: [tr("Inspect the schema and the installed runtime.", "检查数据结构和已安装运行时。"), tr("Run the approved analysis and keep outputs in the project.", "运行已批准分析，将结果保存在项目中。"), tr("Validate totals or output structure and return a concise report.", "验证合计或输出结构，返回简洁报告。")],
      proof: tr("Saved output path, validated totals and the command's exit status.", "输出路径、已验证合计和命令退出状态。"),
      limit: tr("File reads and command results can pass through the relay and AI client. Durable observations can retain excerpts. Keeping the dataset on the device does not mean no data ever leaves it.", "文件读取和命令结果可能经过 Relay 与 AI 客户端；持久观察可以保存片段。数据集留在设备上，不代表绝无数据离开设备。"), durable: false,
    },
    {
      slug: "presentation-deck", category: tr("PRESENTATIONS", "演示文稿"),
      title: tr("Turn local notes into a PowerPoint deck", "把本机资料变成 PowerPoint 演示文稿"),
      intro: tr("Ask your AI to turn existing notes, reports and assets into an editable .pptx, using an authorized local script and installed document libraries.", "让 AI 使用已授权的本机脚本和已安装的文档库，把现有笔记、报告与配图整理成可编辑的 .pptx。"),
      prompt: tr("On my workstation, turn slides/outline.md and the charts in reports/ into a 12-slide product presentation. Use the installed PPTX library, save slides/review.pptx, validate its slide count, and show the result before sharing.", "在我的工作站上，把 slides/outline.md 和 reports/ 里的图表整理成 12 页产品介绍 PPT。使用已安装的 PPTX 库，保存到 slides/review.pptx，检查页数，分享前让我确认。"),
      tools: "read_file · list_directory · start_process · get_file_info", permission: tr("Read sources + enabled local terminal and output-directory access", "读取素材 + 本机终端授权及输出目录权限"),
      steps: [tr("Inspect the outline, assets, installed library and intended slide structure.", "检查大纲、图片素材、已安装的文档库和幻灯片结构。"), tr("Generate the .pptx in the chosen local project folder.", "在指定项目文件夹内生成 .pptx。"), tr("Open or inspect the slide structure, count slides and report any layout limits.", "打开或检查演示文稿结构，核对页数并说明可能的排版限制。")],
      proof: tr("An editable .pptx on the workstation, the generated slide count and verification output.", "工作站上的可编辑 .pptx、生成页数与验证结果。"),
      limit: tr("This is a workflow using start_process and user-installed libraries such as PptxGenJS or python-pptx, not a built-in PowerPoint authoring MCP tool. Rendering depends on software installed on the computer; AI output needs visual review before delivery.", "这是通过 start_process 与本机已安装的 PptxGenJS 或 python-pptx 等文档库完成的工作流，不是内置 PowerPoint 制作 MCP 工具。渲染效果取决于电脑软件，交付前应人工检查。"), durable: false,
    },
    {
      slug: "spreadsheet-report", category: tr("SPREADSHEETS", "电子表格"),
      title: tr("Turn hundreds of files into a checked Excel report", "把数百个文件整理成可核验的 Excel"),
      intro: tr("Read selected CSVs or structured documents in a local folder and generate an .xlsx with formulas, summaries and charts using the existing runtime.", "读取本机指定文件夹内的 CSV 或结构化资料，借助现有运行时生成带公式、汇总与图表的 .xlsx。"),
      prompt: tr("On data-pc, combine reports/2026/*.csv into output/quarterly.xlsx, deduplicate by invoice ID, add monthly totals and a trend chart. Reconcile the input and output totals, and report any mismatches.", "在 data-pc 上合并 reports/2026/*.csv 到 output/quarterly.xlsx，按发票号去重，添加每月汇总和趋势图，核对输入输出合计并列出差异。"),
      tools: "list_directory · read_file · start_process · get_file_info", permission: tr("Read access to input files + enabled terminal for workbook generation", "输入文件读取权限 + 用于生成工作簿的终端权限"),
      steps: [tr("Inspect formats, headers and possible duplicates.", "检查文件格式、表头及潜在重复记录。"), tr("Run a reviewed script using Excel libraries already installed.", "运行使用已安装 Excel 文档库的已审查脚本。"), tr("Reconcile totals, inspect worksheets and return the path plus validation results.", "核对合计、检查工作表，并返回文件路径和验证结果。")],
      proof: tr("A real .xlsx file with checked row counts, formulas and relevant discrepancy report.", "真实 .xlsx 文件、已核对行数与公式，以及差异报告。"),
      limit: tr("Excel output requires a suitable installed runtime/library, and may not calculate formulas until opened in a compatible spreadsheet app. It is not a built-in spreadsheet API, and confidential data read by AI can pass through the relay.", "Excel 生成需要安装合适的运行时和文档库，公式可能要在兼容的表格软件中打开后才计算。它不是内置表格 API，AI 读取的敏感数据可能经过 Relay。"), durable: false,
    },
    {
      slug: "desktop-automation", category: tr("DESKTOP AUTOMATION", "桌面自动化"),
      title: tr("Run an approved mouse-and-keyboard automation script", "用已授权脚本操作鼠标与键盘"),
      intro: tr("If the computer already has an OS automation utility, Remote Arc can run your reviewed script through the terminal to drive local desktop actions.", "如果电脑已安装系统自动化工具，Remote Arc 可以经由终端运行你确认过的脚本，间接执行本地桌面操作。"),
      prompt: tr("On my unlocked test workstation, review the existing scripts/export-ui.js and tell me the clicks and keypresses it will make in the demo application. After approval, run it once and check the generated export. Stop if a dialog differs from the expected screen.", "在我已解锁的测试工作站上，先检查 scripts/export-ui.js，说明会在测试软件中做哪些鼠标点击和按键。经我确认后执行一次并检查导出结果；遇到不符合预期的弹窗立即停止。"),
      tools: "read_file · start_process · get_file_info", permission: tr("Explicit terminal authorization, local interactive desktop session and OS input/accessibility permission", "明确的终端授权、本地图形桌面会话及系统输入或辅助功能权限"),
      steps: [tr("Read the script and identify window targets, actions and high-impact side effects.", "审查脚本、目标窗口、操作步骤和高影响副作用。"), tr("Confirm the user is present or has explicitly approved the bounded workflow.", "确认用户在场或已明确批准该有界工作流。"), tr("Run the local script with enabled terminal permissions and verify the exported result.", "在已开启终端权限的设备上运行本机脚本并验证导出结果。")],
      proof: tr("Script output, application export and an explicit report of what was actually verified.", "脚本输出、软件导出文件以及明确说明哪些操作已验证。"),
      limit: tr("Remote Arc does NOT currently offer native screen capture, mouse-move, click or keyboard-input MCP tools. This example depends entirely on user-installed tools such as PowerShell UI Automation, AppleScript or other desktop scripting software, plus a logged-in interactive session. Browser click/fill uses a separate per-tab permission.", "Remote Arc 目前没有原生屏幕截图、移动鼠标、点击或键盘输入的 MCP 工具。本场景依赖本机安装的 PowerShell UI Automation、AppleScript 等桌面脚本软件，以及已登录的交互桌面会话。浏览器点击与填写另有独立的逐标签页授权。"), durable: false,
    },
    {
      slug: "cross-device-handoff", category: tr("MULTI-COMPUTER", "多电脑协同"),
      title: tr("Fix on one computer, verify on another", "在一台电脑修复，在另一台电脑验证"),
      intro: tr("Ask your AI to inspect two explicitly paired devices, work in their existing checkouts and compare actual test results without remote desktop.", "让 AI 检查两台明确配对的设备，在各自已有的仓库中工作、对照真实测试结果，而不需要远程桌面。"),
      prompt: tr("Use the linked Windows and Mac developer machines: inspect the same repository version on both, fix the cross-platform issue in the approved working tree and run the appropriate tests on each. Report the two results and do not deploy without confirmation.", "使用已连接的 Windows 和 Mac 开发机：检查两台机器上相同版本的代码，在已批准的工作区修复跨平台问题，分别运行测试并汇报；未经确认不要部署。"),
      tools: "list_devices · read_file · edit_block · start_process", permission: tr("Separate device authorization, file editing and terminal permissions on each computer", "每台电脑单独授权文件编辑和终端权限"),
      steps: [tr("Select each device and validate that it is online and authorized.", "分别选择设备、确认在线与已授权。"), tr("Run a bounded diagnostic and permitted edits in the correct checkout.", "在正确的代码库内执行有界诊断和允许的修改。"), tr("Verify tests separately on Windows and macOS and compare outcomes.", "分别验证 Windows 与 macOS 的测试，再对照结果。")],
      proof: tr("Two actual run logs tied to each device plus a reviewed diff.", "分别对应设备的两份实际运行记录与已审核 diff。"),
      limit: tr("There is no automatic cross-device file sync. The AI must coordinate explicitly, and each device needs to be online, independently authorized, and equipped with the required toolchain.", "Remote Arc 不会自动跨设备同步文件。AI 必须明确协调；每台设备都需要在线、独立授权并安装所需工具链。"), durable: false,
    },
    {
      slug: "home-lab", category: tr("HOME LAB", "家庭实验室"), title: tr("Inspect a headless host through its outbound connection", "通过出站连接检查无头主机"),
      intro: tr("Inspect services, logs and installed tooling without opening an inbound Remote Arc port. Save repeatable checks when you need them to run later.", "无需开放 Remote Arc 入站端口便可检查服务、日志和已有工具。需要稍后运行时，可保存可重复检查。"),
      prompt: tr("On home-server, inspect disk usage, failed systemd units and the last 100 lines of the media-service log. Explain the issue. Do not restart or reconfigure anything.", "在 home-server 上检查磁盘占用、失败的 systemd unit 和媒体服务日志最后 100 行，解释问题，不重启或修改配置。"),
      tools: "list_processes · read_file · start_process · process_output", permission: tr("Read tools; terminal when command-based inspection is required", "读取工具；命令级检查还需终端权限"),
      steps: [tr("Confirm the host is online and identify its permitted tools.", "确认主机在线及允许的工具。"), tr("Inspect the requested facts with bounded output.", "读取请求的事实，限制输出范围。"), tr("Report diagnosis separately from any proposed repair.", "把诊断结果与建议修复分开汇报。")],
      proof: tr("Relevant log excerpts, process state and command output tied to the diagnosis.", "支撑诊断的相关日志片段、进程状态和命令输出。"),
      limit: tr("Background login connection needs an available OS user session and network. Remote Arc does not replace fleet configuration management or permanently supervise arbitrary services.", "登录后台连接需要可用 OS 用户会话和网络。Remote Arc 不替代集群配置管理，也不永久监督任意服务。"), durable: false,
    },
    {
      slug: "browser-research", category: tr("BROWSER CONTEXT", "浏览器上下文"), title: tr("Read a page you explicitly share", "读取你明确共享的页面"),
      intro: tr("Share selected Chrome tabs and let the AI read page text, selections, links or tables through the same MCP connection.", "共享选定的 Chrome 标签页，让 AI 通过同一 MCP 连接读取正文、选中文字、链接或表格。"),
      prompt: tr("Read the tab I shared, extract the feature-comparison table and list the documentation links. Do not navigate or submit anything.", "读取我共享的标签页、提取功能对比表并列出文档链接，不跳转或提交任何内容。"),
      tools: "browser_list_tabs · browser_read_page · browser_get_selected_text · browser_extract_links · browser_extract_table · browser_click · browser_fill", permission: tr("Explicit tab sharing; click/fill is a separate per-tab opt-in", "明确共享标签页；点击/填写需对具体标签页单独开启"),
      steps: [tr("Install the companion and explicitly share a tab.", "安装 Companion 并明确共享标签页。"), tr("Select the shared tab ID and request only the needed context.", "选择已共享标签页 ID，只读取需要的上下文。"), tr("Return the extracted facts; revoke tab access when finished.", "返回提取的事实，结束后可以撤销标签页访问。")],
      proof: tr("Extracted text or table rows tied to the shared page.", "来自共享页面的正文或表格行。"),
      limit: tr("Tabs start read-only. Click/fill is available only after a separate per-tab opt-in, uses fresh snapshot refs, and blocks recognized sensitive fields. Browser tools remain outside the current Agent Goal action set.", "标签页默认只读；只有对具体标签页单独开启后才能点击/填写，且必须使用最新快照引用并阻止能够识别出的敏感字段。浏览器工具仍不属于当前 Agent Goal 动作集合。"), durable: false,
    },
    {
      slug: "remote-support", category: tr("AUTHORIZED SUPPORT", "授权支持"), title: tr("Diagnose a computer you are allowed to manage", "诊断你有权管理的电脑"),
      intro: tr("Read logs and process state on your own machine or one you have permission to administer. Keep diagnosis separate from repair authority.", "读取自己或已获管理许可设备的日志与进程状态，将诊断权限和修复权限区分清楚。"),
      prompt: tr("On the office mini PC, inspect the sync-worker logs and running processes, explain why it fails and ask before restarting or modifying anything.", "在办公室 Mini PC 上检查 sync-worker 日志和运行进程，解释失败原因；重启或修改任何内容前先问我。"),
      tools: "read_file · list_processes · start_process", permission: tr("Read tools for diagnosis; separately authorized terminal actions for repairs", "读取工具用于诊断，修复的终端动作需要单独授权"),
      steps: [tr("Pair only a computer you own or are authorized to administer.", "只配对自己拥有或已获管理授权的电脑。"), tr("Inspect facts within the granted tool and path policy.", "在已授予工具和路径策略内检查事实。"), tr("Explain the cause and obtain the requested repair authorization.", "解释原因并取得请求中要求的修复授权。")],
      proof: tr("A diagnosis backed by the observed state; if repair is authorized, the post-repair check.", "有观察状态支撑的诊断；修复获授权时还应提供修复后检查。"),
      limit: tr("This is file/process support rather than GUI screen control. A prompt constraint is not an OS sandbox. Turning off access does not undo earlier changes.", "这是文件与进程支持，不是 GUI 屏幕控制。提示词约束不属于 OS 沙箱，关闭访问也不会撤销此前修改。"), durable: false,
    },
  ];
}

export function UseCaseCatalog() {
  const { tr } = useI18n();
  const items = cases(tr);
  return <main className="useCaseCatalog revisedUseCases">
    <header className="toolPageHeader"><span className="eyebrow">{tr("USE CASES", "使用场景")}</span><h1>{tr("What would you like done on your computer?", "你想让电脑上的哪项工作完成？")}</h1>
      <p>{tr("Start in your AI chat. Name the computer, describe the result and say how to check it. These examples show the tools, permissions and evidence each workflow needs.", "从 AI 聊天开始，说明目标电脑、想要的结果和检查方式。以下场景说明每种工作需要的工具、权限与证据。")}</p>
      <div className="useCaseEntry"><strong>{tr("Quick work uses tools. Ongoing work uses a saved Task.", "即时工作使用工具，持续工作保存为 Task。")}</strong><p>{tr("You do not need to configure every operation manually. Your AI can create an authorized long-running or scheduled task; Dashboard provides progress and stop controls.", "无需手动配置每次操作。AI 可以创建已授权长任务或定时任务，Dashboard 提供进度与停止控制。")}</p><a href="/docs/long-running-work">{tr("Understand durable work", "了解持久工作")} →</a></div>
    </header>
    <section className="useCaseGrid" aria-label={tr("Workflows", "工作流程")}>{items.map(item => <a className="useCaseCard" key={item.slug} href={"/use-cases/" + item.slug}>
      <span className="eyebrow">{item.category}</span><h2>{item.title}</h2><p>{item.intro}</p><span className="caseMode">{item.durable ? tr("Saved Task · staged release", "持久 Task · 准备发布") : tr("Direct tools", "直接工具调用")}</span><b aria-hidden="true">↗</b>
    </a>)}</section>
    <TaskAvailability />
    <footer className="catalogFooter"><p>{tr("Use your own projects and installed tools. Terminal access remains local-user access; browser interaction is separately scoped per shared tab. Review the exact boundaries before granting capabilities.", "使用自己的项目和现有工具。终端仍是本机用户权限；浏览器交互对每个已共享标签页单独授权。授予能力前请了解具体边界。")}</p><a href="/docs">{tr("Exact capabilities", "准确能力")} →</a></footer>
  </main>;
}

export function UseCaseDetail({ slug }: { slug: UseCaseSlug }) {
  const { tr } = useI18n();
  const item = cases(tr).find(entry => entry.slug === slug)!;
  return <main className="technicalDoc revisedUseCases">
    <header className="articleHeader"><a className="caseBack" href="/use-cases">← {tr("All use cases", "全部使用场景")}</a><span className="eyebrow">{item.category}</span><h1>{item.title}</h1><p>{item.intro}</p>{item.durable && <TaskAvailability />}</header>
    <article className="technicalArticle useCaseDetailBody">
      <section><h2>{tr("Ask in your AI chat", "在 AI 聊天中提出请求")}</h2><blockquote className="casePrompt">{item.prompt}</blockquote><p>{tr("This is a sample request, not an automatically started task. The AI resolves the device and checks your existing authorization before using tools or saving ongoing work.", "这是示例请求，不会自动启动任务。AI 会先确认设备和已有授权，再使用工具或保存持续工作。")}</p></section>
      <section><h2>{tr("How the work proceeds", "工作如何推进")}</h2><ol>{item.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      <section><h2>{tr("Tools and permissions", "工具与权限")}</h2><div className="caseTools"><code>{item.tools}</code></div><p>{item.permission}</p><p>{tr("Permissions belong to the device. Task permissions add lifecycle capabilities; they do not override tool access, workspace roots or sensitive-path checks.", "权限属于每台设备。任务权限增加生命周期能力，不会覆盖工具授权、工作区范围或敏感路径检查。")}</p></section>
      <section><h2>{tr("What a useful result contains", "有用的结果应该包含什么")}</h2><p>{item.proof}</p>{item.durable && <p>{tr("Get the saved status and recent runs with get_automation or open Dashboard → Tasks. Failed, expired, cancelled and paused are distinct outcomes; they should not be described as completed work.", "通过 get_automation 或 Dashboard → Tasks 查看保存状态和近期运行。失败、到期、取消和暂停是不同结果，不能当成工作已完成。")}</p>}</section>
      <section><h2>{tr("Know the boundary", "了解边界")}</h2><p>{item.limit}</p><p>{tr("Active tool results pass through the hosted relay and your selected AI. Durable goals additionally save their contract, bounded observations, factual memory and evidence. Choose the content and access you grant accordingly.", "当前工具结果经过托管 Relay 和所选 AI；持久目标还会保存合同、受限观察、事实记忆和证据，请据此选择任务内容与访问授权。")}</p></section>
      <footer className="articleEndLinks"><a href="/connect-ai">{tr("Connect your AI", "连接 AI")} →</a><a href="/docs/long-running-work">{tr("Long-running work", "持续工作")} →</a><a href="/docs#docs-sandbox">{tr("Execution boundaries", "执行边界")} →</a></footer>
    </article>
  </main>;
}
