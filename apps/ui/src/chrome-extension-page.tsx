import React from "react";
import { useI18n } from "./i18n.js";
import companionManifest from "../../browser-extension/manifest.json" with { type: "json" };
import "./chrome-extension-page.css";

const downloadUrl = "/downloads/remote-arc-browser.zip?v=" + encodeURIComponent(companionManifest.version);

export function ChromeExtensionPage() {
  const { tr } = useI18n();

  return (
    <main className="chromeExtensionPage">
      {/* The download card is the FIRST content on this page, not a hash target. */}
      <section className="chromeDownloadHero" aria-labelledby="chrome-download-title">
        <div className="chromeDownloadCopy">
          <span className="eyebrow">{tr("CHROME EXTENSION · BETA", "CHROME 扩展 · BETA")}</span>
          <h1 id="chrome-download-title">{tr("Download Chrome Companion", "下载 Chrome Companion 浏览器扩展")}</h1>
          <p>{tr(
            "Let your AI work with specific Chrome tabs that you choose to share. Read the page, extract selected text, links or tables, and enable click and fill only for tabs you explicitly approve.",
            "让 AI 使用你明确共享的 Chrome 标签页。读取页面、提取选中文字、链接或表格；只有你为某个标签页单独授权后，才能点击和填写。",
          )}</p>
          <div className="chromeDownloadCtas">
            <a className="primaryButton chromeDownloadPrimary" href={downloadUrl} download>
              {tr("Download Chrome Companion (.zip)", "下载 Chrome Companion (.zip)")} <span aria-hidden="true">↓</span>
            </a>
            <span className="chromeDownloadVersion">
              {tr("Version", "版本")} {companionManifest.version} · {tr("Chrome / Chromium · unpacked beta", "Chrome / Chromium · 解压安装 Beta")}
            </span>
          </div>
          <p className="chromeDownloadWarning">{tr(
            "This beta is not installed from the Chrome Web Store and will not auto-update. Download a new ZIP and reload the unpacked extension when a newer version is released.",
            "目前尚未上架 Chrome Web Store，手动加载的扩展不会自动升级。发布新版本后，需要重新下载 ZIP 并在 Chrome 扩展管理页重新加载。",
          )}</p>
        </div>
        <div className="chromeDownloadGraphic" aria-label={tr("Browser tab permissions overview", "浏览器标签页权限示意")}>
          <div className="chromeGraphicTop"><span className="chromeGraphicDots" aria-hidden="true">● ● ●</span><span>Chrome Companion</span><strong>{tr("Your choice", "由你决定")}</strong></div>
          <div className="chromeGraphicContent">
            <div className="chromeGraphicTab"><span aria-hidden="true">◉</span><div><strong>{tr("A tab you choose", "你选择的标签页")}</strong><small>{tr("Shared with Remote Arc", "已共享给 Remote Arc")}</small></div><span className="chromeGraphicOn">{tr("Shared", "已共享")}</span></div>
            <div className="chromeGraphicPermission"><span className="chromePermissionDot" />{tr("Read page content", "读取网页内容")}<strong>{tr("On", "开启")}</strong></div>
            <div className="chromeGraphicPermission"><span className="chromePermissionDot muted" />{tr("Click & fill", "点击与填写")}<strong>{tr("Off by default", "默认关闭")}</strong></div>
            <p>{tr("Each shared tab begins read-only.", "每个共享标签页默认只有读取权限。")}</p>
          </div>
        </div>
      </section>

      <section className="chromeGuideSteps" aria-labelledby="chrome-steps-title">
        <div className="chromeGuideIntro"><span className="eyebrow">{tr("INSTALLATION", "安装步骤")}</span><h2 id="chrome-steps-title">{tr("Set it up in Chrome", "在 Chrome 中完成安装")}</h2>
          <p>{tr("Browser sharing is optional. Remote Arc file access and terminal tools do not require the Chrome Companion.", "浏览器共享是可选功能。Remote Arc 的文件和终端工具无需安装 Chrome Companion。")}</p></div>
        <ol className="chromeStepsGrid">
          <li><span>01</span><h3>{tr("Download and unzip", "下载并解压")}</h3><p>{tr("Use the button above. Extract the ZIP into a folder that you will keep on this computer.", "点击页面顶部的按钮下载 ZIP，解压到电脑上一个准备长期保留的文件夹。")}</p></li>
          <li><span>02</span><h3>{tr("Open Chrome Extensions", "打开扩展程序页面")}</h3><p>{tr("Open chrome://extensions in Chrome. Turn on Developer mode at the top of the Extensions page.", "在 Chrome 地址栏输入 chrome://extensions，开启扩展程序页面顶部的「开发者模式」。")}</p><code>chrome://extensions</code></li>
          <li><span>03</span><h3>{tr("Load unpacked", "加载已解压的扩展程序")}</h3><p>{tr("Click Load unpacked, then select the extracted folder containing manifest.json.", "点击「加载已解压的扩展程序」，选择包含 manifest.json 的解压文件夹。")}</p></li>
          <li><span>04</span><h3>{tr("Connect and share a tab", "连接并共享标签页")}</h3><p>{tr("Open the extension, click Connect to Remote Arc and approve pairing. Then click Share this tab on the page you want the AI to read.", "打开扩展，点击 Connect to Remote Arc 并批准配对。接着在你想让 AI 读取的网页上点击 Share this tab。")}</p></li>
        </ol>
      </section>

      <section className="chromeGuideDetails">
        <div><h2>{tr("Permissions stay per tab", "权限按标签页独立控制")}</h2><p>{tr("Tabs start in read-only mode. For interaction, explicitly enable Click & fill for that tab. Remote Arc rejects stale page snapshots and blocks recognized password, one-time-code, payment-card and file-picker fields.", "标签页初始为只读。需要交互时，只为相应标签页单独开启 Click & fill。Remote Arc 拒绝过期的页面快照，并阻止可识别的密码、一次性验证码、支付卡及文件选择字段。")}</p></div>
        <div><h2>{tr("What happens when you update?", "扩展如何更新？")}</h2><p>{tr("The website ZIP is rebuilt from the repository's current extension source on production deployments. An extension installed with Load unpacked does not update by itself: download and extract the new version, then reload the extension in Chrome.", "官网的 ZIP 在生产部署时会从当前扩展源码重新打包。通过「加载已解压的扩展程序」安装的扩展不会自行升级；更新时请下载并解压新版，再到 Chrome 扩展页重新加载。")}</p></div>
      </section>
      <nav className="chromeGuideFooter" aria-label={tr("Related documentation", "相关文档")}>
        <a href="/docs/mcp">{tr("Remote MCP reference", "Remote MCP 工具文档")} ↗</a>
        <a href="/security-model">{tr("Security and permissions", "安全与权限说明")} ↗</a>
        <a href="/connect-ai">{tr("Connect your AI client", "连接 AI 客户端")} ↗</a>
      </nav>
    </main>
  );
}
