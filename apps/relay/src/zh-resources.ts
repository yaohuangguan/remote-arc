type Section = { heading: string; text: string };
type ResourceSeo = {
 title: string; description: string; h1: string; intro: string; sections: Section[];
};
type Brief = [string, string, string, string];
const blogArticles: Record<string, ResourceSeo> = {
 "/blogs/why-i-built-remote-arc": {
  title: "为什么我做 Remote Arc：让 AI 使用电脑，而不是接管电脑",
  description: "Remote Arc 创作初衷：打破 AI 聊天与真实电脑之间的隔阂，以明确授权、独立设备身份与可撤销权限保护用户控制权。",
  h1: "为什么我做 Remote Arc：AI 应该能使用你的电脑，但不该接管它",
  intro: "模型能解释命令、生成补丁，但真正完成最后一步的往往还是用户。Remote Arc 想让已有 AI 客户端安全地使用你自己的电脑。",
  sections: [
   { heading: "聊天与真实电脑之间的最后一公里", text: "我的文件、终端、代码仓库和开发环境都在本机，AI 却常常只能输出一段要我自行执行的指令。让模型通过 MCP 调用已批准的本地工具，才有机会让聊天真正产生工作结果。" },
   { heading: "从最小必要权限出发", text: "如果 AI 可以修改代码和运行命令，这就不再是简单的聊天功能，而是安全敏感的基础设施。Remote Arc 将每台电脑视为独立的信任边界，允许开发机开放更多工具，同时让其他电脑保持只读。" },
   { heading: "不需要公开电脑的端口", text: "本地 Agent 通过出站连接与托管中继通信，不需要路由器端口转发、公网 IP 或公网可访问的本地 MCP 服务。配对生成独立、可以撤销的设备身份。" },
   { heading: "为什么选 MCP", text: "我不希望用户为了使用 Remote Arc 而放弃自己熟悉的 AI。兼容的 ChatGPT、Claude、Cursor 等客户端可以使用同一个远程 MCP 入口，聊天与模型由用户自行选择。" },
   { heading: "安全不是简单的开或关", text: "OAuth 管理 AI 客户端访问，设备策略控制真正开放哪些工具。只读检查、文件写入和终端执行不能被粗暴地当成相同权限；有些修改支持本地 Undo，终端操作则不能假装具备相同恢复能力。" },
   { heading: "我希望它最终成为怎样的产品", text: "连接 AI 和自己的电脑，应该像连接代码仓库或日历一样自然，但由于可能触及真正的系统执行，授权必须更透明、撤销必须更可靠，并且用户始终知道控制权在哪里。" }
  ]
 },
 "/blogs/remote-arc-vs-openclaw": {
  title: "Remote Arc 与 OpenClaw 有什么不同？理解 AI 技术栈的两层架构",
  description: "比较 Remote Arc 的远程设备执行层与 OpenClaw 的自托管 AI 助手和 Gateway：模型归属、MCP 边界、设备权限和协作方式。",
  h1: "Remote Arc 和 OpenClaw 有什么区别？",
  intro: "两者都能让 AI 在真实设备上执行任务，但 OpenClaw 侧重拥有助手、频道和 Agent 会话，Remote Arc 侧重连接你已经在使用的 AI 客户端与自己的电脑。",
  sections: [
   { heading: "OpenClaw 是更完整的 AI 助手平台", text: "OpenClaw 支持自托管 Gateway、会话、消息渠道及 Agent 运行环境。对于希望自己运营一整套助手系统的用户，这是一条完整的技术路线。" },
   { heading: "Remote Arc 选择更窄的产品边界", text: "Remote Arc 不托管用户与大模型的主要对话，也不要求用户更换 ChatGPT、Claude 等 AI 客户端。它把设备配对、授权工具、任务状态和远程路由作为核心能力。" },
   { heading: "部署方式不同", text: "Remote Arc 采用托管控制面，处理 OAuth、设备身份和转发；本地 Agent 持有系统执行权限。OpenClaw 更强调把 Gateway 与助手状态运行在用户自有环境中。" },
   { heading: "MCP 对二者的角色不同", text: "Remote Arc 把 Remote MCP 作为提供给 AI 客户端的主入口。OpenClaw 则是更广泛的助手和 Gateway 体系，MCP 是其可以使用的若干接口之一。" },
   { heading: "它们不一定是竞争替代关系", text: "如果希望自己运营助手和会话，OpenClaw 可能更合适。如果已经在某个 AI 对话客户端里工作，只想安全触及自己的 Windows、macOS 或 Linux，Remote Arc 是另一种取舍。在支持 MCP 的部署中，两者甚至可以协同使用。" }
  ]
 },
 "/blogs/powerful-ai-access-without-exposing-your-computer": {
  title: "Remote Arc 安全架构：让 AI 动手，同时保护自己的电脑",
  description: "了解 Remote Arc 的只出站连接、OAuth、设备独立授权、可信写入目录、敏感路径防护、Undo 和审计元数据。",
  h1: "Remote Arc 如何让 AI 足够强大，同时不把你的电脑暴露出去",
  intro: "AI 只能告诉你命令会很受限；AI 随意运行所有命令又会带来不可接受的风险。Remote Arc 把能力与权限拆成多个清晰的边界。",
  sections: [
   { heading: "不开放公网入站端口", text: "本地 Agent 主动连向 Cloudflare 托管控制面，普通部署不需要公网 IP、VPN 或路由器端口转发。电脑不会因此在公网开放一个任意人都能探测的本地 MCP 监听端口。" },
   { heading: "设备身份和 AI 授权彼此独立", text: "每台已配对电脑有自己的可撤销凭证；AI 客户端通过 OAuth 获得独立授权。撤销某个客户端，不要求重配所有电脑；撤销某台电脑，也不需要重置所有客户端。" },
   { heading: "权限因设备而异", text: "开发机可以允许有限的文件编辑和终端调用，其他电脑保持只读。可信写入位置、敏感路径保护及明确审批可以让日常文件操作更可控。" },
   { heading: "读取与写入分开控制", text: "AI 可以在授权范围内读取非敏感信息；持久修改则需要写入权限，有些超出可信写入位置的修改需要附加审批。不能因为终端功能已启用，就假装它被操作系统沙箱隔离。" },
   { heading: "本地 Undo 与审计", text: "受支持的文件编辑可以在设备端保存撤销快照。托管审计主要记录设备、工具、时间和结果等元数据，不应把它误认为文件内容的云备份。" },
   { heading: "必须承认的安全限制", text: "一旦明确授予不受限制的终端执行，Shell 就继承本机用户账户的权限。工具审批和路径规则可以降低风险，但不能替代真正的 OS 隔离。" }
  ]
 },
 "/blogs/how-remote-arc-works": {
  title: "Remote Arc 技术架构：Cloudflare Worker、OAuth 与本地 Agent",
  description: "分步骤理解 Remote Arc 如何通过 MCP、OAuth、Cloudflare Worker、D1、Durable Objects 和本地 Go Agent 执行远程电脑操作。",
  h1: "Remote Arc 是怎么工作的：Worker、Durable Objects、OAuth 与本地 Agent",
  intro: "用户在 AI 客户端发出请求，调用经过 OAuth 授权的远程 MCP 工具，托管服务选择正确设备，再由本地 Agent 执行并返回结果。",
  sections: [
   { heading: "第一步：AI 客户端看到 Remote MCP 工具", text: "ChatGPT、Claude 或其他兼容客户端连接到 Remote Arc 的 MCP 服务地址。工具描述说明可以查找设备、读取文件、编辑内容、查询进程或执行已授权的命令。" },
   { heading: "第二步：OAuth 确定调用者身份", text: "OAuth 关联用户、客户端和授权范围。客户端 Access Token 与设备配对凭证并不相同，二者可以分别撤销。" },
   { heading: "第三步：Cloudflare Worker 负责控制面", text: "Worker 接收 MCP、OAuth、配对和 Dashboard API 请求，核对账户、配额和策略，并路由获批准的操作。" },
   { heading: "第四步：D1 保存持久身份与策略", text: "D1 保存账户、设备元数据、凭证散列、用户会话、OAuth 授权、设备策略、任务状态与审计元数据。它不是每次设备调用的实时执行环境。" },
   { heading: "第五步：Durable Objects 管理实时连接", text: "Durable Objects 跟踪每个用户当前可到达的已配对设备，通过出站 WebSocket 连接把操作发往指定电脑。" },
   { heading: "第六步：本地 Agent 执行最终权限检查", text: "本地 Go Agent 与执行核心检查可用工具、目录范围和敏感路径政策，在本机读取文件或调用进程。最终系统执行发生在用户自己管理的电脑上。" },
   { heading: "第七步：结果沿原路返回", text: "设备只把调用所需的结果经中继送回 AI 客户端，而不需要把整套开发环境上传到托管虚拟机。操作参数和结果会经过中继，不是零知识端到端加密。" }
  ]
 },
 "/blogs/go-vs-typescript-agent-benchmarks": {
  title: "为什么 Remote Arc 选择 Go？Mac 和 Windows 上的 Agent 性能实测",
  description: "真实对比 Go 与 TypeScript 原生执行 Agent 的内存、读写和 Undo 表现，解释 Windows 回退修复、磁盘同步开销与测试边界。",
  h1: "为什么 Remote Arc 选择 Go：Mac 和 Windows 上的实测结果",
  intro: "Go 并非每项指标都更快。Remote Arc 选择原生 Go Agent，主要依据是长期驻留、低内存和执行环境独立，而不是宣称 Go 总会击败 Node.js。",
  sections: [
   { heading: "比较的是相同任务，而非语言印象", text: "L1 使用本地 JSONL IPC 测量执行核心，L2 使用认证的本机回环 WebSocket 测量完整前台 Agent。每种常规文件操作收集 600 次样本，交替运行并区分预热。结果不是经生产 Cloudflare 或 ChatGPT 的端到端延迟。" },
   { heading: "Mac：Atomic 与 Durable 必须分开比较", text: "在 Intel Mac 上，相同版本的 L2 Atomic 写入中，TypeScript P50 为 5.327 ms、Go 为 2.713 ms；批次后 RSS 分别为 100.69 MiB 和 16.35 MiB。Durable 写入因同步磁盘数据，双方延迟都接近 200 ms，不能据此判断语言本身优劣。" },
   { heading: "Windows：先发现回退，再修复", text: "Windows 早期 Go Atomic 写入 P50 为 29.152 ms，慢于 TypeScript 的 20.977 ms。修正原生路径处理后，后续版本 Go 为 9.687 ms，TypeScript 为 21.294 ms。两组数字来自不同源码修订，必须分开标注。" },
   { heading: "长期驻留看的是稳定性与资源", text: "隔离的两小时驻留实验覆盖 Undo、文件冲突、受管进程和重连场景；它不能替代真实断电、升级或长期生产运行的可靠性验证。" },
   { heading: "尚未解决的问题", text: "真正的 L3 性能还要测从 AI 客户端到 Cloudflare Relay 再到本机工具的完整路径。当前数据支持选择 Go 作为原生常驻 Agent，但不支持『Go 在任何操作下都更快』的结论。" }
  ]
 }
};
const useCases: Record<string, Brief> = {
 "remote-development": ["在自己电脑上修复代码项目", "通过 Remote MCP 让 AI 检查已有仓库、编辑代码并运行有针对性的测试。", "使用现有工作区和工具链，在受控权限下复现问题、修改并验证。", "确认目标电脑和仓库范围，先读取实现与测试，再审阅修改 diff 并运行相关检查。"],
 "file-organization": ["按审查过的计划整理文件", "先分析指定目录、生成清晰的移动计划，经过确认后再使用已授权的本机操作。", "从只读检查开始，不允许未经确认的覆盖或删除。", "列出目标目录、重名冲突与移动清单，再检查前后文件状态；Shell 移动不在文件工具 Undo 范围内。"],
 "disk-space-cleanup": ["安全查找 Windows 或 Mac 磁盘占用", "检查大目录、缓存和重复构建产物，先预览可回收空间，确认具体路径后再清理。", "提供高风险和可清理项的清单，避免误删个人及系统文件。", "未经逐项批准不要删除 Windows 系统目录、用户资料、Time Machine 快照、备份或未知程序数据。"],
 "overnight-goals": ["运行有限次数的持续工作计划", "当步骤和验收命令已明确时，保存可追踪的固定工作循环。", "重复已批准命令，直到验证通过、达到次数上限或到期。", "这是确定性调度，不代表 AI 模型在聊天关闭后仍持续独立推理。"],
 "long-running-jobs": ["聊天结束后继续跟踪构建或导出任务", "把已经确定的长命令保存为 Task，并记录执行状态和结果。", "让设备执行长任务，控制台可以查看状态、结果并取消。", "持久保存的是任务记录，不是同一个进程 PID；未知执行结果不能盲目重放。"],
 "scheduled-checks": ["在未来运行或周期执行检查", "在授权设备上定时运行固定命令并保存每次执行结果。", "明确触发时间、允许动作、停止边界和设备可用条件。", "周期间隔从每轮完成时开始，当前不承诺精确 Cron 或自动唤醒已关机电脑。"],
 "ci-follow-up": ["CI 或 Webhook 事件发生后执行下一步", "在匹配的事件到达后触发事先批准的动作，并保留执行证据。", "保存明确的条件与操作，再核对实际执行结果。", "收到 CI 成功事件不等于自动获得合并代码或任意终端执行的权限。"],
 "data-work": ["使用本机开发环境分析数据", "通过已有 Python、Node 或其他运行时处理本地数据文件并核对结果。", "数据保持在指定项目目录，脚本和输出由用户管理。", "读取与结果输出会通过所选 AI 和托管中继，需确认哪些数据可以分享。"],
 "home-lab": ["检查无头服务器与家庭实验室", "在无需公网入站端口的前提下查看远程服务器的服务、日志和进程。", "先以只读方式获取状态，确认问题后再申请额外修改权限。", "命令执行继承目标系统账户权限，不是独立沙箱。"],
 "browser-research": ["研究明确共享的浏览器标签页", "让 AI 读取已共享标签页的文本、链接和表格，必要时增加单标签页交互权限。", "每个标签页默认只读，点击和输入需要单独授权。", "浏览器共享不等于读取整个浏览器资料；交互能力必须符合当前标签页权限。"],
 "remote-support": ["远程诊断已获授权的电脑", "在用户允许的设备上查看日志、进程和文件，区分诊断与修复权限。", "用实际观察支持诊断结论，修复前明确获得授权。", "Remote Arc 目前不提供任意 GUI 桌面接管；故障修复后仍需检查实际状态。"],
 "presentation-deck": ["在自己电脑上生成可编辑 PowerPoint", "使用本机文档库、图片和脚本生成 PPTX，并核对页面与内容。", "把源材料与生成文件留在选定目录，执行受审批的脚本。", "输出文件需要校验结构与可编辑性，不能把一张图片等同于可编辑演示文稿。"],
 "spreadsheet-report": ["从本地数据制作并验证 Excel 报表", "把多个 CSV 或表格合成可编辑 XLSX，并检查公式、汇总和图表。", "使用已安装的分析工具，核对数据范围和关键计算。", "生成报表不能只检查文件是否存在，应验证数值、公式及预期工作表。"],
 "desktop-automation": ["执行审查过的桌面自动化脚本", "通过授权本机命令调用用户已安装的键鼠自动化工具，执行可观察的桌面动作。", "先明确动作脚本、交互会话与撤销计划。", "这不是 Remote Arc 内置的 GUI 操作工具；终端脚本继承本机账户权限。"],
 "cross-device-handoff": ["在一个 AI 对话中协作 Windows 与 macOS", "通过分别配对的 Windows 和 Mac 设备执行各自授权的工作，再核对交接成果。", "设备之间独立配置工具、目录范围和授权，交接文件需显式安排。", "配对多个电脑不会自动同步仓库或绕过每台电脑独立的权限设置。"]
};
export const chineseResourceSeo: Record<string, ResourceSeo> = {
 "/blogs": {
  title: "Remote Arc 中文博客 — 架构、MCP、安全与工程实践",
  description: "阅读 Remote Arc 的中文工程博客：Go 性能实测、MCP 与本地 Agent 架构、权限设计，以及和 OpenClaw 的区别。",
  h1: "Remote Arc 博客",
  intro: "记录 Remote Arc 的工程实现、架构决策、安全取舍和产品思考。这里的文章不是泛泛的功能介绍，而是解释设计为什么这样做。",
  sections: [{heading:"工程与产品实践",text:"阅读真实的基准测试、OAuth 和设备身份设计、云端 Worker 与本地执行面的分工，以及为什么 AI 需要明确、可撤销的电脑访问权限。"}]
 },
 "/use-cases": {
  title: "Remote Arc 中文使用场景 — 让 AI 在你的电脑上工作",
  description: "了解 Remote Arc 如何用于远程开发、文件整理、CI 跟进、长期任务、数据工作、浏览器研究与跨设备协作。",
  h1: "Remote Arc 使用场景",
  intro: "从开发、文件管理到定时检查与跨电脑协作，Remote Arc 提供受权限约束的本机工具与可保存的确定性任务。",
  sections: [
   {heading:"即时工作",text:"让兼容 AI 客户端读取指定设备上的项目、检查进程，并按批准的工具权限编辑文件或执行命令。"},
   {heading:"持续执行",text:"长命令、固定的周期检查和条件触发任务可以保存状态、期限与结果；新策略仍需要模型参与。"},
   {heading:"权限边界",text:"每台电脑都有独立的权限与路径规则。终端继承本机用户权限；文件 Undo 不能保证撤回 Shell 或外部 API 操作。"}
  ]
 },
 "/security-model": {
  title: "Remote Arc 中文安全说明 — 设备权限、OAuth 与撤销",
  description: "查看 Remote Arc 安全与信任模型，包括独立设备身份、OAuth、可信写入位置、敏感路径保护、Undo、审计和终端限制。",
  h1: "Remote Arc 安全与信任模型",
  intro: "真正需要回答的不是系统是否抽象地『安全』，而是谁有权批准哪类操作、云端能够看到什么，以及用户怎样限制或撤销访问。",
  sections: [
   {heading:"分离用户、AI 客户端与设备身份",text:"Dashboard、AI 客户端 OAuth 授权和设备配对采用独立凭证，任何一个连接都可以单独撤销。"},
   {heading:"授权文件能力不等于授权终端",text:"读取、写入与终端是不同层级。可信写入位置和敏感路径保护可限制文件工具，但允许终端之后，Shell 仍继承操作系统用户权限。"},
   {heading:"本地 Undo 与数据经过的范围",text:"支持的文件编辑可在设备端保留撤销快照；实际工具内容可能经云端中继送回 AI，不能把它称为零知识端到端加密。"},
   {heading:"公开限制",text:"Remote Arc 当前的工具权限并不构成完整 OS 沙箱，设备离线或断电也不能由中继凭空恢复。"}
  ]
 },
 "/releases": {
  title: "Remote Arc 中文版本历史 — Agent、MCP 与安全能力更新",
  description: "查看 Remote Arc 的产品演进：原生 Go Agent、MCP 连接、Cloudflare Relay、权限、设备管理和任务持久化。",
  h1: "Remote Arc 版本历史",
  intro: "按版本查看 CLI、Relay、Dashboard、设备权限与 Agent 执行能力的升级记录，了解功能何时发布及其适用边界。",
  sections: [
   {heading:"原生 Agent 与本地执行",text:"版本历史包括原生 Go Agent、跨平台安装、断线重连、后台服务和文件编辑与 Undo 能力的演进。"},
   {heading:"连接与权限",text:"记录 OAuth、MCP 工具发现、设备独立授权、可信写入位置及敏感路径策略的重要修改。"},
   {heading:"持久任务",text:"跟踪固定长任务、调度与恢复机制的完善。具体功能是否可用，仍以对应版本、账户计划和设备授权为准。"}
  ]
 },
 ...blogArticles
};
for (const [slug, [title, description, intro, boundary]] of Object.entries(useCases)) {
 chineseResourceSeo["/use-cases/" + slug] = {
  title: title + " — Remote Arc 使用场景",
  description,
  h1: title,
  intro,
  sections: [
   {heading:"如何进行",text:intro},
   {heading:"先验证结果",text:"在选定的已授权设备上执行前，先查看输入、权限与工作区。完成后核对实际文件、命令状态或运行记录，而不只是相信成功提示。"},
   {heading:"需要知道的限制",text:boundary}
  ]
 };
}
