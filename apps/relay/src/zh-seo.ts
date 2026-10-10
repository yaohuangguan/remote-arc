type ChineseSeoContent = {
  title: string; description: string; h1: string; intro: string;
  sections: Array<{heading: string; text: string}>;
};
export const chineseSeo: Record<string, ChineseSeoContent> = {
  "/": {
    title: "Remote Arc — 让 AI 聊天真正操作你的电脑",
    description: "通过安全的 Remote MCP，把 ChatGPT、Claude 等兼容 AI 对话连接到自己已授权的 Windows、macOS 或 Linux。无需单独配置模型 API Key；AI 服务商的套餐和额度限制仍适用。",
    h1: "别让 AI 只停留在聊天。让它在你的电脑上真正完成工作。",
    intro: "Remote Arc 将你正在使用的 AI 对话连接到你自己的电脑。通过明确授权，AI 可以查看文件、编辑代码并调用已批准的工具；无需另购模型 API 额度。",
    sections: [
      { heading: "你的电脑仍由你掌控", text: "设备主动连接云端中继，无需打开入站端口。按设备控制权限，必要时要求确认，并可随时撤销 AI 访问。" },
      { heading: "使用你已经熟悉的 AI", text: "在支持 Remote MCP 的 ChatGPT、Claude 或其他客户端中添加 Remote Arc，无需让 Remote Arc 接管模型、对话或 API 密钥。" },
      { heading: "任务与聊天可以分开", text: "可保存设备端长任务与执行状态，再次进入控制台继续查看。需要新 AI 判断的步骤，仍须由已连接的大模型执行。" }
    ]
  },
  "/install/chatgpt": {
    title: "ChatGPT 连接 Remote Arc 教程 — 用 AI 操作你的电脑",
    description: "按步骤将 ChatGPT 的自定义 MCP 连接器接入 Remote Arc，完成授权、设备配对与工具调用，适用于 Windows、macOS 和 Linux。",
    h1: "让 ChatGPT 连接你的电脑",
    intro: "在 Remote Arc 安装本地 Agent、配对设备，然后在 ChatGPT 添加自定义 Remote MCP 连接器并确认授权。",
    sections: [
      { heading: "安装并配对 Agent", text: "在电脑上安装 Remote Arc Agent，确认设备在 Dashboard 中上线。可使用 npx 入口，也可使用原生安装包。" },
      { heading: "在 ChatGPT 添加连接器", text: "按安装教程填写 Remote Arc 的 MCP 地址，使用 OAuth 登录并同意明确的访问范围。" },
      { heading: "测试最小权限", text: "让 ChatGPT 先读取允许访问的文件，确认设备及授权状态，再按需要开启编辑或命令执行。" }
    ]
  },
  "/install/claude": {
    title: "Claude 连接 Remote Arc 教程 — 自定义 MCP 连接器",
    description: "在 Claude 中添加 Remote Arc 自定义 Remote MCP 连接器，用 OAuth 配对自己的 Windows、macOS 或 Linux 电脑。",
    h1: "在 Claude 中连接 Remote Arc",
    intro: "在 Claude 的自定义连接器设置中添加 Remote Arc MCP 地址，然后完成账户授权及设备配对。",
    sections: [
      { heading: "添加自定义连接器", text: "打开 Claude 的连接器设置，选择添加自定义连接器，填写 Remote Arc 的 MCP 服务地址。" },
      { heading: "登录并确认访问", text: "通过 Google 或邮箱登录 Remote Arc，核对连接器访问权限，再完成授权。" },
      { heading: "从只读工具开始", text: "在 Claude 对话中检查已配对设备和可用工具，然后再按需要增加设备执行权限。" }
    ]
  },
  "/install/cursor": {
    title: "Cursor 连接 Remote Arc 教程 — Remote MCP 开发工作流",
    description: "将 Remote Arc 作为 Cursor 中的 Remote MCP 服务，安全访问配对电脑上的项目、文件与开发工具。",
    h1: "在 Cursor 中使用 Remote Arc",
    intro: "在 Cursor MCP 设置中添加 Remote Arc 地址并完成 OAuth 授权，让开发助手使用已批准的本机工具。",
    sections: [
      { heading: "配置 MCP 地址", text: "在 Cursor 的 MCP 配置中添加 Remote Arc 托管端点，并通过浏览器完成授权。" },
      { heading: "选择可访问的电脑", text: "在 Dashboard 管理设备及权限，先测试只读文件和进程信息。" },
      { heading: "安全执行开发操作", text: "需要修改文件或运行命令时明确启用对应权限，并检查工具返回结果。" }
    ]
  },
  "/docs": {
    title: "Remote Arc 中文文档 — 设备、权限与 Remote MCP",
    description: "阅读 Remote Arc 中文指南：账户与设备配对、Remote MCP、权限安全、任务状态、恢复和浏览器共享。",
    h1: "Remote Arc 文档",
    intro: "了解如何安装本机 Agent、连接 AI 客户端、管理设备权限，以及保存和恢复支持的任务状态。",
    sections: [
      { heading: "快速开始", text: "安装 Agent，登录控制台，配对电脑，再将支持 Remote MCP 的 AI 客户端连接到 Remote Arc。" },
      { heading: "权限与安全边界", text: "按设备限制工具、可信写入位置和敏感路径。终端命令继承本机系统账户权限，并非独立沙箱。" },
      { heading: "长期任务和恢复", text: "了解任务何时会暂停、如何跟踪执行进度，以及什么时候需要新的 AI 对话继续判断。" }
    ]
  },
  "/docs/mcp": {
    title: "Remote Arc MCP 中文参考 — OAuth、工具与浏览器连接",
    description: "Remote Arc 的 Remote MCP 端点、OAuth 范围、设备工具、任务控制和 Chrome 浏览器共享参考。",
    h1: "Remote MCP 技术参考",
    intro: "Remote Arc 通过 MCP 向兼容 AI 客户端暴露经授权的设备工具，OAuth 管理用户和客户端授权。",
    sections: [
      { heading: "连接和授权", text: "使用托管 MCP 地址，让客户端完成 OAuth 登录；授予的范围与本地设备可执行权限彼此独立。" },
      { heading: "工具与设备路由", text: "浏览设备、读取文件、查看进程，并按权限编辑文件、执行命令或管理任务。" },
      { heading: "浏览器与安全", text: "Chrome 共享需要显式开启，可选择只读上下文或对指定标签页授予有限的交互权限。" }
    ]
  },
  "/docs/long-running-work": {
    title: "Remote Arc 长任务中文指南 — 计划、恢复与执行状态",
    description: "了解 Remote Arc 的长任务、计划执行、设备断线恢复、权限检查，以及 AI 推理与确定性执行的区别。",
    h1: "长期任务如何跨聊天继续",
    intro: "Remote Arc 可以保存明确的设备端操作和任务状态，但不会声称聊天结束后大模型仍在持续自主思考。",
    sections: [
      { heading: "保存执行计划", text: "根据明确的步骤保存任务，由设备端在得到授权后执行，Dashboard 展示状态与结果。" },
      { heading: "断线与重新连接", text: "设备暂时不可用时按任务规则等待、失败或恢复。网络超时不能自动代表本地操作失败。" },
      { heading: "理解 AI 推理边界", text: "新判断仍需受支持的模型会话或明确的规划能力，单纯定时执行不等于持续 AI 推理。" }
    ]
  },
  "/pricing": {
    title: "Remote Arc 价格方案 — 免费版与 Plus",
    description: "了解 Remote Arc 免费版和 Plus 的账号用量、设备权限与服务额度，AI 聊天订阅或模型 API 的费用由对应服务商决定。",
    h1: "Remote Arc 价格与额度",
    intro: "先使用免费版连接 AI 和电脑，按需要了解 Plus。Remote Arc 的 MCP 服务额度独立于 AI 客户端自己的套餐和限制。",
    sections: [
      { heading: "免费开始", text: "可使用现有兼容 AI 客户端连接 Remote Arc，但客户端是否开放 MCP 工具受其套餐限制。" },
      { heading: "Plus 与额度", text: "查看当前账户计划及托管 MCP 使用量，相关数字与规则以登录后的 Dashboard 和价格页实时展示为准。" },
      { heading: "无需另买模型 API", text: "Remote Arc 本身并不向你提供大模型推理，也不要求额外配置模型 API Key；大模型客户端仍可能收费或限流。" }
    ]
  },
  "/downloads": {
    title: "Remote Arc 下载 — Windows、macOS、Linux 原生 Agent",
    description: "下载 Remote Arc 原生 Go Agent，或使用 npx remotelink 安装，支持 Windows、macOS 与 Linux。",
    h1: "下载 Remote Arc",
    intro: "开发者可使用 npx remotelink，普通用户可选择对应系统的原生安装方式。Go Agent 不要求设备单独安装 Node.js。",
    sections: [
      { heading: "选择系统", text: "按 Windows、macOS、Linux 选择匹配的安装版本，并核对平台架构。" },
      { heading: "连接控制台", text: "安装后使用 Remote Arc 账户配对，确认设备在线并设置操作权限。" },
      { heading: "开发者快速安装", text: "已安装 Node.js 的开发者仍然可以使用 npx remotelink 作为快捷入口。" }
    ]
  }
};
