import React from "react";
import cliPackage from "../../../packages/cli/package.json" with { type: "json" };
import { useI18n } from "./i18n.js";
import "./public-docs.css";

const version = cliPackage.version;
const release = `https://github.com/yaohuangguan/remote-arc/releases/tag/remotelink-v${version}`;
const download = `https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v${version}/`;
const targets = [
  { os: "macOS", cpu: "Apple Silicon", platform: "darwin", arch: "arm64" },
  { os: "macOS", cpu: "Intel", platform: "darwin", arch: "amd64" },
  { os: "Windows", cpu: "x64", platform: "windows", arch: "amd64" },
  { os: "Windows", cpu: "ARM64", platform: "windows", arch: "arm64" },
  { os: "Linux", cpu: "x64", platform: "linux", arch: "amd64" },
  { os: "Linux", cpu: "ARM64", platform: "linux", arch: "arm64" },
] as const;

export function NativeInstall() {
  const { tr } = useI18n();
  return <section id="agent-downloads" className="nativeInstall">
    <span className="eyebrow">REMOTE ARC {version}</span>
    <h1>{tr("Install the device Agent", "安装设备 Agent")}</h1>
    <p>{tr("The Agent and Execution Core run natively in Go on Windows, macOS and Linux. Choose npm, Homebrew or a standalone download. Each path uses the same paired device and Dashboard permissions.", "Agent 和 Execution Core 在 Windows、macOS 和 Linux 上原生运行。选择 npm、Homebrew 或直接下载，使用同一套设备配对与 Dashboard 权限。")}</p>
    <div className="nativeInstallQuickStart">
      <strong>{tr("One-line Homebrew install · macOS / Linux", "Homebrew 一行安装 · macOS / Linux")}</strong>
      <pre className="docsExample"><code>brew install yaohuangguan/remote-arc/remotelink</code></pre>
      <p>{tr("No Node.js required. If Homebrew asks you to trust this third-party formula, use the verified trust and tap instructions below before retrying.", "无需 Node.js。如果 Homebrew 要求信任第三方配方，先按下方 Tap / Trust 步骤操作，再重新安装。")}</p>
    </div>
    <h2>npm / npx</h2>
    <pre className="docsExample"><code>npx remotelink@latest</code></pre>
    <p>{tr("Only npm/npx installation requires Node.js 20+. The npm launcher downloads and verifies the native Agent; Go is the default. --go remains a compatible alias. Use --ts only for the retained TypeScript fallback.", "只有 npm/npx 安装方式需要 Node.js 20+。npm 启动器下载并校验原生 Agent，默认运行 Go；--go 保留为兼容别名。--ts 用于保留的 TypeScript 回退。")}</p>
    <h2>Homebrew</h2>
    <pre className="docsExample"><code>{"brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc\nif brew command trust >/dev/null 2>&1; then brew trust --formula yaohuangguan/remote-arc/remotelink yaohuangguan/remote-arc/remotelink-go; fi\nbrew install yaohuangguan/remote-arc/remotelink\nremotelink"}</code></pre>
    <p>{tr("Available on macOS and Linux; Node.js is not required. Existing remotelink-go installations can use brew upgrade remotelink-go. Install one formula at a time because both provide the remotelink command.", "适用于 macOS 和 Linux，不需要 Node.js。已安装 remotelink-go 的用户可以执行 brew upgrade remotelink-go；两个配方都提供 remotelink 命令，请只安装其中一个。")}</p>
    <h2>{tr("Standalone downloads", "直接下载")}</h2>
    <p>{tr("No Node.js or Go toolchain is needed. Choose your operating system and processor.", "不需要 Node.js 或 Go 编译环境，请按操作系统和处理器选择。")}</p>
    <ul className="nativeDownloads">{targets.map(target => {
      const asset = `remotelink-v${version}-${target.platform}-${target.arch}${target.platform === "windows" ? ".exe" : ""}`;
      return <li key={asset}><a href={download + asset}>{target.os} · {target.cpu}</a></li>;
    })}</ul>
    <p><a href={download + "SHA256SUMS"}>SHA256SUMS</a>{" · "}<a href={release}>{tr("Release notes and all files", "发布说明与全部文件")}</a></p>
    <p>{tr("On Windows, run the downloaded .exe in PowerShell. On macOS/Linux, make the downloaded file executable with chmod +x, then run it from Terminal. For example, on an Apple Silicon Mac:", "Windows 在 PowerShell 中运行下载的 .exe；macOS/Linux 先用 chmod +x 添加执行权限，再从终端运行。例如 Apple Silicon Mac：")}</p>
    <pre className="docsExample"><code>{`chmod +x ./remotelink-v${version}-darwin-arm64\n./remotelink-v${version}-darwin-arm64 --foreground`}</code></pre>
    <h2>{tr("Upgrade, stop and switch runtimes", "升级、停止与切换运行时")}</h2>
    <p>{tr("Stop the current Agent before starting a newer version. Ctrl+C stops a foreground Agent; remotelink --stop disables Go recovery and stops its Agent. Pairing and Undo records are preserved. A second launcher follows the current owner instead of creating a second executor.", "启动新版前先停止当前 Agent。Ctrl+C 停止前台运行；remotelink --stop 会关闭 Go 后台恢复并停止 Agent。配对和 Undo 记录保留。第二个启动器会跟随当前执行者，避免重复执行。")}</p>
    <pre className="docsExample"><code>{"npx remotelink@latest --stop\nnpx remotelink@latest --foreground"}</code></pre>
    <p>{tr("To leave an older TS Agent, run npx remotelink@latest --ts --no-background and stop its original terminal before starting Go. To return to TS, stop Go first, then use npx remotelink@latest --ts. Runtime switches do not replay commands.", "从旧 TS Agent 迁移时，先运行 npx remotelink@latest --ts --no-background，再停止原终端并启动 Go。回退到 TS 时先停止 Go，再运行 npx remotelink@latest --ts。切换运行时不会重放命令。")}</p>
    <p><a href="/docs#docs-routing">{tr("Architecture and permission model", "架构与权限模型")}</a></p>
  </section>;
}
