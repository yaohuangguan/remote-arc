import cliPackage from "../../../packages/cli/package.json" with { type: "json" };

const SITE = "https://remotearc.app";

type ArticleBlock = { heading?: string; text: string };
type SeoPage = {
  title: string;
  description: string;
  canonical: string;
  type?: "website" | "article";
  author?: string;
  blocks?: ArticleBlock[];
};

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const articles: Record<string, SeoPage> = {
  "/blogs/why-i-built-remote-arc": {
    title: "Why I built Remote Arc: AI should reach your computer without owning it",
    description: "Why Remote Arc exists: controlled access from AI clients to real computers without surrendering the security boundary.",
    canonical: SITE + "/blogs/why-i-built-remote-arc",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "I spend a lot of time using AI tools, and I kept running into the same boundary: the model could explain what I should do, write the command I should run, or generate the patch I should apply — but the final mile was still mine. My files, terminals, repositories and development environments were sitting on real computers, while the AI was trapped behind a chat box." },
      { text: "That gap is what pushed me to build Remote Arc. The idea sounds simple: let an AI client reach a computer you own. The implementation is not simple at all, because the moment an AI can read files, edit code or run a command, the product stops being a convenience layer and becomes security-sensitive infrastructure." },
      { heading: "The goal was never full control.", text: "A lot of remote-agent products are marketed around how much control they can give an AI. I wanted to start from the opposite question: how little authority does the AI need in order to finish the job? Remote Arc therefore treats every computer as its own trust boundary." },
      { heading: "No public port. No VPN. No inbound listener.", text: "The local Remote Arc agent creates an outbound connection to the hosted relay. You pair the device explicitly, it receives its own revocable credential, and it can be removed independently later." },
      { heading: "MCP turned out to be the right interface.", text: "I did not want Remote Arc to be tied to one model vendor. MCP lets clearly described tools be discovered and called by compatible clients. The AI client can change while the paired computers and their permission model stay the same." },
      { heading: "The hardest part is not execution. It is trust.", text: "Running a command remotely is technically easy. Deciding when that command should be allowed, showing which machine will receive it, preserving useful audit metadata without turning the service into a content archive, and giving the user a reliable way to revoke access deserve most of the engineering attention." },
      { heading: "What I want Remote Arc to become", text: "I want connecting an AI to your own computer to feel as normal as connecting a calendar or code repository — but with controls that reflect how much more consequential a computer actually is. Installation should be simple. Permissions should be explicit. The AI client should be replaceable. And the user should always know where the boundary is." }
    ]
  },
  "/blogs/remote-arc-vs-openclaw": {
    title: "Remote Arc vs OpenClaw: two different layers of the AI stack",
    description: "Remote Arc and OpenClaw can both help AI act on computers, but they own different layers: a persistent real-computer agent runtime versus a self-hosted assistant and agent gateway.",
    canonical: SITE + "/blogs/remote-arc-vs-openclaw",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "Remote Arc is sometimes compared with OpenClaw because both products can ultimately connect AI to a real computer. At a screenshot level the similarity is obvious: an AI asks for something, software on a machine receives the request, and something happens. But that is roughly where the architectural similarity ends." },
      { text: "OpenClaw describes itself as an open-source AI assistant that runs on your own hardware. Its Gateway owns conversations, channels, agent sessions and integrations. It can connect to chat platforms, host coding or agent runtimes, expose capabilities over MCP, and manage outbound MCP servers for its own runtimes." },
      { text: "Remote Arc intentionally stops earlier. It does not try to own the conversation, memory, model or agent loop. It gives an AI client you already chose — ChatGPT, Claude, Codex or another compatible MCP client — a controlled way to reach computers you explicitly paired." },
      { heading: "OpenClaw is an AI home. Remote Arc is an AI bridge.", text: "OpenClaw is a broader self-hosted assistant and gateway platform. Remote Arc is narrower: a remote computer execution layer with per-device skills, OAuth and a managed routing plane." },
      { heading: "The deployment philosophy is almost opposite.", text: "OpenClaw emphasizes that the assistant, state and Gateway can live on hardware you control. Remote Arc makes a different trade-off: the control plane is hosted so pairing, OAuth, discovery and routing work without you operating a public Gateway, while operating-system execution stays on the paired computer." },
      { heading: "Their relationship with MCP is different too.", text: "For Remote Arc, MCP is the primary product boundary exposed to AI clients. For OpenClaw, MCP is one interface among a wider set of agent, channel and runtime capabilities." },
      { heading: "They can actually complement each other.", text: "If you want a self-hosted personal assistant that owns channels, memory and agent sessions, OpenClaw solves a broader problem. If you already live in ChatGPT or Claude and mainly want those clients to reach real computers with explicit device permissions, Remote Arc is intentionally narrower. Because OpenClaw can consume remote MCP servers and Remote Arc exposes one, the two models can even meet." }
    ]
  },
  "/blogs/powerful-ai-access-without-exposing-your-computer": {
    title: "How Remote Arc keeps AI access powerful without exposing your computer",
    description: "How Remote Arc combines outbound-only connectivity, OAuth, per-device permissions, protected paths, local undo and audit metadata for controlled AI access.",
    canonical: SITE + "/blogs/powerful-ai-access-without-exposing-your-computer",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "An AI that can only tell you what command to run is safe but limited. An AI that can run every command everywhere is useful but reckless. Remote Arc is built around the space between those two extremes." },
      { heading: "1. Your computer never needs a public inbound port.", text: "The local Remote Arc agent establishes an outbound connection to the hosted control plane. Your router does not need port forwarding, your laptop does not need a public IP, and the machine does not sit on the internet waiting for arbitrary inbound connections." },
      { heading: "2. Pairing creates a device identity, not a shared master password.", text: "Every paired computer receives its own revocable credential. The hosted database stores only the credential hash, so a device can be revoked independently." },
      { heading: "3. OAuth controls the AI client separately from the device.", text: "A paired computer and an authorized AI client are two different trust relationships. Revoking an AI client does not require re-pairing the computer, and revoking a computer does not require changing every AI connection." },
      { heading: "4. Permission is per device, not one global agent switch.", text: "A work laptop, gaming PC and home server should not expose the same capabilities. Safe access can stay read-only, Developer access can add targeted file edits, and Full access can add terminal execution only where it is genuinely required." },
      { heading: "5. Read visibility and write authority are separate.", text: "Ordinary non-sensitive files can remain available to read-only tools while persistent mutations stay inside Trusted Write Locations. A write outside those locations pauses for a narrowly scoped approval, and sensitive paths remain independently protected. Terminal access is still not an operating-system sandbox." },
      { heading: "6. Supported edits can be undone locally.", text: "The local agent can keep a bounded undo snapshot on the device itself, providing a recovery path without turning the hosted service into a backup of your file contents." },
      { heading: "7. Audit metadata is useful without becoming content retention.", text: "Remote Arc records operational metadata such as tool, device, result and time while intentionally avoiding persistence of file contents, raw command arguments, OAuth tokens and raw device credentials." },
      { heading: "The important limitation: permissions are not magic.", text: "Once unrestricted terminal execution is explicitly enabled, the shell inherits the permissions of the local operating-system user. The honest security model is layered control plus explicit user choice, not pretending that powerful execution has no consequences." }
    ]
  },
  "/blogs/how-remote-arc-works": {
    title: "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
    description: "A request-by-request walkthrough of Remote Arc architecture: Remote MCP, OAuth, Cloudflare Worker, D1, Durable Objects, the local agent and OS execution.",
    canonical: SITE + "/blogs/how-remote-arc-works",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "From the outside Remote Arc looks simple: connect an AI client, pair a computer, ask the AI to do something. Internally that request crosses several boundaries, and every boundary exists for a reason." },
      { heading: "Step 1: the AI client sees a Remote MCP server.", text: "ChatGPT, Claude or another compatible client connects to a single Remote Arc MCP URL. Tool discovery describes device discovery, file inspection, process inspection, file editing, managed processes, terminal execution and undo." },
      { heading: "Step 2: OAuth answers who the AI is acting for.", text: "OAuth establishes user identity, scopes and the client grant. Access tokens can be short-lived, refresh tokens can rotate, and a grant can be revoked without changing the paired-device credential." },
      { heading: "Step 3: the Cloudflare Worker is the control-plane entry point.", text: "The Worker handles MCP requests, OAuth endpoints, pairing APIs, account APIs and the web application. It authenticates requests, checks account and device policy, applies rate limits and decides whether a call may proceed." },
      { heading: "Step 4: D1 keeps durable identity and policy.", text: "D1 stores users, paired-device metadata, credential hashes, sessions, OAuth grants, per-device policy, security settings, usage counters and audit metadata. It is not the live transport for tool execution." },
      { heading: "Step 5: a per-user Durable Object owns live routing.", text: "Durable Objects coordinate WebSockets, track which paired devices are reachable and forward a tool call to exactly the selected connection." },
      { heading: "Step 6: the local agent is the final execution boundary.", text: "The local agent receives an authenticated routed request, checks what it actually exposes and executes the operation through Remote Arc local execution core. File operations, process inspection, terminal commands and undo terminate at the machine itself." },
      { heading: "Step 7: the result travels back, not the machine.", text: "The agent returns the specific tool result through the existing outbound connection. Remote Arc can therefore give AI useful access to local state without moving the entire development environment into a hosted VM." },
      { heading: "Why split control plane and execution plane?", text: "The hosted side is good at identity, discovery, routing, policy and availability. The local side is the only place that should own operating-system execution. Keeping those responsibilities separate is the core of the architecture." }
    ]
  }
};

const pages: Record<string, SeoPage> = {
  "/": { title: "Remote Arc — Controlled Computer Access for AI", description: "Connect ChatGPT, Claude, Codex and compatible MCP clients to paired Windows, macOS and Linux computers with explicit permissions and local safety controls.", canonical: SITE + "/" },
  "/install": { title: "Install Remote Arc for ChatGPT, Claude and Cursor", description: "Install Remote Arc, pair your computer and connect your AI client through Remote MCP.", canonical: SITE + "/install/chatgpt" },
  "/install/chatgpt": { title: "Install Remote Arc for ChatGPT", description: "Connect ChatGPT to Windows, macOS or Linux through Remote Arc and a secure OAuth-protected Remote MCP endpoint.", canonical: SITE + "/install/chatgpt" },
  "/install/claude": { title: "Install Remote Arc for Claude", description: "Connect Claude to paired computers through Remote Arc using a secure Remote MCP connector and explicit device permissions.", canonical: SITE + "/install/claude" },
  "/install/cursor": { title: "Install Remote Arc for Cursor", description: "Use Remote Arc to give Cursor controlled access to paired Windows, macOS and Linux computers through MCP.", canonical: SITE + "/install/cursor" },
  "/pricing": { title: "Remote Arc Pricing — Hosted remote MCP for AI", description: "Start free with 10,000 monthly hosted MCP tool calls. Understand account usage, separate AI subscriptions and current capacity availability.", canonical: SITE + "/pricing" },
  "/downloads": { title: "Remote Arc Downloads — Native Go Agent for Windows, macOS and Linux", description: "Download the native Remote Arc Agent or install with npm and Homebrew. Go Agent and Execution Core by default; standalone installs need no Node.js.", canonical: SITE + "/downloads" },
  "/releases": { title: "Remote Arc Releases — Product version history", description: "Remote Arc release history for remote MCP access, device controls, durable deterministic tasks, browser sharing and local execution safety.", canonical: SITE + "/releases" },
  "/demo": { title: "Remote Arc Plugin Demo — ChatGPT to a real computer", description: "Watch a real Remote Arc demo showing ChatGPT connecting to a paired Mac, inspecting a Node.js project and running its tests.", canonical: SITE + "/demo" },
  "/docs": { title: "Remote Arc Docs — Remote MCP & Computer Access", description: "Set up Remote Arc, connect AI clients, understand device permissions, MCP tools, long-running work, restart recovery, scheduling, isolation and task data.", canonical: SITE + "/docs" },
  "/docs/long-running-work": { title: "Remote Arc Long-running Work — Durable commands and schedules", description: "Learn how deterministic long tasks, schedules, device permissions and reconnect recovery work, and where fresh AI reasoning is still required.", canonical: SITE + "/docs/long-running-work" },
  "/remote-mcp": {
    title: "Remote MCP Server: What It Is & How to Connect | Remote Arc",
    description: "Learn remote vs local MCP, how to connect ChatGPT, Claude and Cursor to a Remote MCP server, and how Remote Arc reaches your own computer securely.",
    canonical: SITE + "/remote-mcp"
  },
  "/docs/mcp": { title: "Remote Arc MCP Reference — OAuth, Tools & Browser", description: "Remote MCP connection, OAuth scopes, device tools, deterministic task controls and browser companion setup for Remote Arc.", canonical: SITE + "/docs/mcp" },
  "/chrome-extension": { title: "Download Chrome Companion for Remote Arc — Extension Setup", description: "Download Remote Arc Chrome Companion, load the unpacked extension in Chrome, approve browser pairing and choose which tabs to share with AI.", canonical: SITE + "/chrome-extension" },
  "/connect-ai": { title: "Connect an AI client to Remote Arc", description: "Pair a computer, choose its device permissions, then connect ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.", canonical: SITE + "/connect-ai" },
  "/security-model": { title: "Remote Arc Security and Trust Model", description: "Remote Arc trust boundaries, per-device skills, directory and sensitive-path controls, encrypted transport, data handling, Local Undo and revocation.", canonical: SITE + "/security-model" },
  "/blogs": { title: "Remote Arc Blog — MCP, Security & Remote AI Engineering", description: "Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.", canonical: SITE + "/blogs" },
  "/use-cases": { title: "Remote Arc Use Cases — Let AI work on your real computer", description: "Explore workflows for coding, file organization, long jobs, scheduled checks, CI follow-up, data, diagnostics and explicitly shared browser context.", canonical: SITE + "/use-cases" },
  "/chatgpt-computer-access": { title: "ChatGPT Computer Access via Remote MCP — Remote Arc", description: "Connect ChatGPT to a real Windows, macOS or Linux computer through Remote MCP, OAuth and explicit per-device permissions.", canonical: SITE + "/chatgpt-computer-access" },
  "/claude-computer-access": { title: "Claude Computer Access via Remote MCP — Remote Arc", description: "Connect Claude to explicitly paired Windows, macOS and Linux computers through Remote MCP, OAuth and per-device permissions.", canonical: SITE + "/claude-computer-access" },
  "/mcp-computer-access": { title: "MCP Computer Access for AI Agents — Remote Arc", description: "Use a hosted Remote MCP bridge to give compatible AI clients controlled access to files, processes, browser tabs and approved commands on paired computers.", canonical: SITE + "/mcp-computer-access" },
  "/privacy": { title: "Remote Arc Privacy Policy", description: "How Remote Arc handles account, device, usage and operational data.", canonical: SITE + "/privacy" },
  "/terms": { title: "Remote Arc Terms of Service", description: "Terms governing use of Remote Arc.", canonical: SITE + "/terms" },
  "/support": { title: "Remote Arc Support", description: "Help with installation, pairing, MCP connections and account access.", canonical: SITE + "/support" }
};

const useCaseSeo: Record<string, [string, string]> = {
  "file-organization": ["Organize files with a reviewed move plan", "Inspect a folder, review destinations and collisions, then execute an authorized move plan with a before/after manifest."],
  "remote-development": ["Fix a project on your own computer", "Inspect, edit and test the existing checkout using Remote Arc device tools and explicit permissions."],
  "overnight-goals": ["Run durable work without pretending the AI stays awake", "Save deterministic commands and checks for later execution; fresh AI judgment still requires a live supported reasoning host."],
  "long-running-jobs": ["Track a long build, export or script", "Save a Long Task, follow its outcome after chat ends and understand process-handle recovery."],
  "scheduled-checks": ["Schedule a check or recurring goal", "Understand future starts, completion-based intervals, per-run results and device availability."],
  "ci-follow-up": ["Run an authorized CI follow-up", "Use a Condition Watch with explicit event matching, authorized actions and recorded outcomes."],
  "data-work": ["Process data in your local environment", "Use installed runtimes to analyze local files, validate results and understand task-data handling."],
  "home-lab": ["Inspect a headless host", "Inspect logs and services through an outbound device connection without opening an inbound Remote Arc port."],
  "browser-research": ["Work with explicitly shared browser tabs", "Read text, selections, links and tables, then optionally enable scoped click and fill on individual shared Chrome tabs."],
  "remote-support": ["Diagnose an authorized computer", "Read real logs and processes while keeping diagnosis and repair authorization separate."],
  "presentation-deck": ["Create an editable PowerPoint on your own computer", "Turn local notes and charts into a checked PPTX using an authorized script and document libraries installed on the paired computer."],
  "spreadsheet-report": ["Build a verified Excel workbook from local data", "Combine local CSV files into an XLSX, check totals and inspect formulas or charts using your installed runtime and spreadsheet libraries."],
  "desktop-automation": ["Run reviewed desktop mouse and keyboard scripts", "Use an authorized local terminal to run user-installed desktop automation software, with interactive-session requirements and explicit approval."],
  "cross-device-handoff": ["Work across Windows and macOS from one AI chat", "Coordinate actions on separately paired Windows and Mac computers, enforcing each device's own tool permissions and verifying results independently."],
};
for (const [slug, [title, description]] of Object.entries(useCaseSeo)) {
  const path = "/use-cases/" + slug;
  pages[path] = { title: title + " — Remote Arc", description, canonical: SITE + path };
}

function blogIndexHtml() {
  const items = Object.entries(articles).map(function(entry) {
    return '<li><a href="' + entry[0] + '">' + esc(entry[1].title) + '</a><p>' + esc(entry[1].description) + '</p></li>';
  }).join("");
  return '<main class="seo-blog-shell"><section><p class="seo-eyebrow">BLOG</p><h1>Remote Arc blog</h1>' +
    '<p>Engineering notes, architecture decisions, security trade-offs and product reasoning from building a controlled Remote MCP bridge between AI clients and real computers.</p>' +
    '<p>The articles explain why Remote Arc separates the hosted control plane from local operating-system execution, how OAuth and paired-device identities fit together, why terminal access is treated differently from narrower file tools, and where durable task execution stops being the same thing as fresh AI reasoning.</p>' +
    '<p>Use these notes when you want the implementation rationale behind the product documentation rather than only setup instructions.</p><ol>' + items + '</ol></section></main>';
}

function articleHtml(page: SeoPage) {
  const blocks = (page.blocks || []).map(function(block) {
    return (block.heading ? '<h2>' + esc(block.heading) + '</h2>' : '') + '<p>' + esc(block.text) + '</p>';
  }).join("");
  return '<main class="seo-blog-shell"><article><p class="seo-eyebrow">REMOTE ARC BLOG</p><h1>' + esc(page.title) + '</h1><p class="seo-byline">Sam Yao · Creator of Remote Arc · 27 Sep 2026</p>' + blocks + '</article></main>';
}

type CrawlSection = { heading: string; text: string };
type CrawlPage = {
  h1: string;
  intro: string;
  sections?: CrawlSection[];
  links?: Array<[string, string]>;
};

const crawlPages: Record<string, CrawlPage> = {
  "/": {
    h1: "Remote computer access for AI through MCP",
    intro: "Remote Arc connects ChatGPT, Claude, Cursor and other compatible AI clients to Windows, macOS and Linux computers that you explicitly pair. It is a remote execution layer for work that already lives on your devices, not a replacement assistant, hosted desktop or general remote-control product.",
    sections: [
      { heading: "Use the computer where the work already lives", text: "Your repositories, files, runtimes, credentials and command-line tools can stay on your own machine. Remote Arc exposes named MCP capabilities for inspecting directories, reading files, making supported edits, checking processes and running approved commands. The AI asks for a specific tool operation and the paired device executes it locally, so you do not need to move an entire development environment into a hosted VM just to let an AI help with real work." },
      { heading: "Separate AI authorization from device permission", text: "OAuth authorizes the AI client to your Remote Arc account, while each paired computer keeps its own policy. A development workstation can allow file edits and managed terminal commands while another machine remains read-only. Trusted Write Locations, protected paths, per-tool permissions and explicit approvals let you narrow ordinary file workflows without pretending that powerful terminal access is risk free." },
      { heading: "No inbound Remote Arc port", text: "The local agent establishes an outbound connection to the hosted control plane. Normal setup does not require port forwarding, a public IP address, a VPN into the machine or a publicly reachable local MCP server. The hosted side handles identity, discovery and routing; operating-system execution still terminates on the paired computer under the local user account." },
      { heading: "Keep the AI client replaceable", text: "Remote Arc uses MCP as the product boundary exposed to compatible AI clients. That means the client can change without rebuilding the device connection model. You can connect ChatGPT, Claude, Cursor or another supported MCP client to the same account while keeping paired computers, device policy and revocation controls independent from the conversation interface." },
      { heading: "Support short actions and durable work", text: "For immediate work, an AI can inspect state and call device tools during the conversation. For deterministic work that must outlive one chat turn, Remote Arc can persist bounded commands, schedules, condition watches and task state on supported plans. Fresh reasoning is still treated separately: a saved task can continue deterministic execution, but Remote Arc does not claim that a model remains continuously conscious after the chat ends." }
    ],
    links: [["/remote-mcp", "Remote MCP guide"], ["/install/chatgpt", "Install for ChatGPT"], ["/install/claude", "Install for Claude"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"], ["/docs", "Documentation"], ["/use-cases", "Use cases"]]
  },
  "/install/chatgpt": {
    h1: "Install Remote Arc for ChatGPT",
    intro: "Pair a computer, connect ChatGPT to the Remote Arc MCP endpoint, complete OAuth and choose the capabilities that ChatGPT may use on that device.",
    sections: [
      { heading: "1. Pair the computer", text: "Run npx remotelink on the Windows, macOS or Linux machine you want ChatGPT to reach. Sign in to the Remote Arc account that should own the device, approve the short-lived pairing request and confirm the computer appears online before adding the AI connection." },
      { heading: "2. Add the Remote MCP connection", text: "Connect ChatGPT to https://mcp.remotearc.app/mcp and complete Remote Arc OAuth when your ChatGPT account supports the required MCP app path. OAuth authorizes the ChatGPT client to the Remote Arc account; it does not replace the separate policy saved for each paired computer." },
      { heading: "3. Keep permissions explicit", text: "Start with read access and a small verification request. Enable supported file editing, terminal execution, browser interaction or long-running task permissions only where the workflow requires them. A development computer can have broader permissions while another paired device stays read-only." },
      { heading: "4. Verify the target before real work", text: "Ask ChatGPT to list paired devices, name the computer you intend to use and inspect a harmless project directory or text file. Confirm the returned device and path before asking for edits or commands. This establishes that routing, OAuth and the local policy all point at the expected machine." }
    ],
    links: [["/chatgpt-computer-access", "How ChatGPT computer access works"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"], ["/use-cases/remote-development", "Remote development"]]
  },
  "/install/claude": {
    h1: "Install Remote Arc for Claude",
    intro: "Connect Claude to a paired computer through a remote MCP connector while keeping device permissions and operating-system execution on the computer you control.",
    sections: [
      { heading: "1. Pair the target computer", text: "Run npx remotelink on the Windows, macOS or Linux computer Claude should reach. Approve pairing in your Remote Arc account and confirm the device is online. The paired-device identity is independent from the Claude connector authorization." },
      { heading: "2. Add the Remote Arc connector", text: "In Claude, add a custom connector that points to https://mcp.remotearc.app/mcp and complete Remote Arc OAuth. Claude can then discover the Remote Arc tools available to the account and route permitted calls to the selected paired computer." },
      { heading: "3. Control the boundary per device", text: "A development workstation can expose editing and terminal tools while another computer remains read-only. Trusted Write Locations, protected paths and local policy still apply regardless of which compatible AI client is connected." },
      { heading: "4. Test with a narrow first action", text: "Ask Claude to list devices and read a harmless file or inspect a project directory before enabling broader actions. Confirm the computer and path are correct, then add edit or terminal permissions only if the task actually needs them." }
    ],
    links: [["/claude-computer-access", "How Claude computer access works"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"], ["/use-cases/remote-development", "Remote development"]]
  },
  "/install/cursor": {
    h1: "Install Remote Arc for Cursor",
    intro: "Use Remote Arc as a remote HTTP MCP server so Cursor can reach approved files, processes and tools on paired computers.",
    sections: [
      { heading: "1. Pair the target computer", text: "Run npx remotelink on the machine that owns the project or development environment and approve that device in Remote Arc. The computer keeps an outbound connection, so ordinary setup does not require publishing a local MCP server or forwarding a router port." },
      { heading: "2. Add the remote HTTP MCP server", text: "Point Cursor's MCP configuration at https://mcp.remotearc.app/mcp and complete OAuth for the Remote Arc account. Cursor can then discover the permitted tools while the source tree and command execution remain on the paired machine." },
      { heading: "3. Limit what Cursor can change", text: "Configure device tools, Trusted Write Locations and sensitive-path rules. Ordinary non-sensitive reads can remain broad while supported writes outside trusted locations require additional approval. Terminal execution is a separate capability because it runs with the authority of the local user." },
      { heading: "4. Verify with the repository's own checks", text: "For development work, ask Cursor to inspect the selected checkout, make a focused change and run the project's existing test or typecheck command. Review the diff and command output before treating the remote task as complete." }
    ],
    links: [["/docs/mcp", "MCP reference"], ["/use-cases/remote-development", "Remote development workflow"], ["/security-model", "Security model"], ["/mcp-computer-access", "MCP computer access"]]
  },
  "/chatgpt-computer-access": {
    h1: "Give ChatGPT access to your computer through Remote MCP",
    intro: "Remote Arc gives ChatGPT a controlled route to a real Windows, macOS or Linux computer without sharing an operating-system password or opening a Remote Arc inbound port.",
    sections: [
      { heading: "ChatGPT sees tools, not a raw desktop login", text: "The MCP connection exposes named capabilities such as device discovery, directory inspection, file reads, supported edits, process inspection and managed commands according to the policy of the selected device. ChatGPT requests those capabilities through Remote Arc instead of receiving an unrestricted desktop session or the password for the local operating-system account." },
      { heading: "The connection uses OAuth and a separate device identity", text: "ChatGPT authorizes to your Remote Arc account through OAuth. The paired computer has its own revocable device credential and outbound connection. These are separate trust relationships: removing a ChatGPT grant does not force every computer to pair again, and revoking one computer does not invalidate every AI client." },
      { heading: "Your computer remains a separate trust boundary", text: "The device can be read-only, developer-oriented or terminal-enabled. Trusted Write Locations, boundary approvals, protected paths and Local Undo add narrower controls for supported file workflows. Terminal execution is deliberately separate because it runs with the permissions of the local operating-system user and is not equivalent to a sandboxed file edit." },
      { heading: "Ask for observable work and verification", text: "A useful request names the target computer, the desired result and how to verify it. For code work, that can mean reading the affected implementation, applying a focused edit and running the project's own test command. For longer deterministic work, supported task controls can persist a command or schedule after the immediate chat turn ends." }
    ],
    links: [["/install/chatgpt", "Install for ChatGPT"], ["/docs/mcp", "MCP reference"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"], ["/use-cases/remote-development", "Remote development"]]
  },
  "/claude-computer-access": {
    h1: "Give Claude controlled access to your computer through Remote MCP",
    intro: "Remote Arc connects Claude to explicitly paired Windows, macOS and Linux computers through an OAuth-protected remote MCP endpoint.",
    sections: [
      { heading: "Remote connector, local execution", text: "Claude connects to Remote Arc over MCP while file and command execution still terminates on the paired computer through the local agent. The hosted control plane handles identity, tool discovery and routing; it does not turn the computer into a public MCP server or require a general remote-desktop login." },
      { heading: "Device permissions stay independent", text: "Changing AI clients does not change the computer policy. Tool access, Trusted Write Locations, approvals, sensitive paths and revocation remain attached to the paired device and account. A workstation can allow edits and tests while another computer exposes only read-oriented inspection tools." },
      { heading: "Authorization can be revoked independently", text: "Claude receives an OAuth grant to the Remote Arc account, while each computer has a separate paired-device identity. You can revoke a Claude authorization without re-pairing devices, or remove one device without changing every other client connection." },
      { heading: "Use the machine's existing environment", text: "Because execution happens on the paired computer, Claude can work with the checkout, installed runtimes and command-line tools already present there when those capabilities are enabled. This is useful when moving the project to a hosted coding environment would be slow, incomplete or incompatible with the local setup." }
    ],
    links: [["/install/claude", "Install for Claude"], ["/docs/mcp", "MCP reference"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"], ["/use-cases/remote-development", "Remote development"]]
  },
  "/mcp-computer-access": {
    h1: "Remote MCP computer access for AI agents",
    intro: "Remote Arc is a hosted Remote MCP bridge that lets compatible AI clients discover and invoke approved capabilities on computers you pair.",
    sections: [
      { heading: "Why remote MCP instead of a public local server", text: "AI clients connect to one hosted MCP endpoint while each computer makes an outbound device connection. The computer does not need to host a publicly reachable MCP listener, expose a router port or publish a local IP address. This keeps discovery and authorization reachable from cloud AI clients while execution remains on the machine you selected." },
      { heading: "What the MCP tools can cover", text: "Depending on device policy, Remote Arc can expose file and directory inspection, bounded binary reads, supported file edits, process inspection, managed commands, local undo, explicitly shared browser-tab context and durable task controls. The tool surface is capability-based rather than a single all-or-nothing computer-control permission." },
      { heading: "How a call reaches one device", text: "The MCP client identifies the target paired computer, the hosted control plane authenticates the account and tool request, and a per-user routing layer forwards the call to the selected outbound device connection. The local agent checks what it actually exposes before executing the operation and returns only the tool result through the existing connection." },
      { heading: "Where the security boundary lives", text: "OAuth controls the AI client and per-device policy controls the computer. Trusted Write Locations and sensitive-path checks can narrow supported file operations. Terminal execution, when enabled, still inherits the permissions of the local operating-system user, so Remote Arc does not describe a terminal-enabled device as an OS sandbox." },
      { heading: "MCP keeps the reasoning client replaceable", text: "Remote Arc does not need to own the user's conversation, model or memory in order to provide computer access. A compatible MCP client can change while the paired computers and their policy remain attached to the Remote Arc account. This keeps the remote execution layer separate from the AI interface above it." }
    ],
    links: [["/docs/mcp", "Remote MCP reference"], ["/install/chatgpt", "ChatGPT setup"], ["/install/claude", "Claude setup"], ["/security-model", "Security model"], ["/use-cases", "Use cases"]]
  },
  "/docs": {
    h1: "Remote Arc documentation",
    intro: "Technical documentation for pairing devices, connecting AI clients, choosing permissions, understanding data flow and running bounded long-running work on computers you control.",
    sections: [
      { heading: "Start with a paired device", text: "Install the remotelink agent on Windows, macOS or Linux, sign in to the Remote Arc account that should own the device and approve pairing. Pairing creates a revocable device identity. The local agent then keeps an outbound connection to the hosted control plane so the computer can receive only the Remote Arc calls routed to that device." },
      { heading: "Connect an AI client through Remote MCP", text: "Compatible clients connect to the Remote Arc MCP endpoint over OAuth. OAuth authorizes the client to an account; it does not automatically grant every operating-system capability. Device discovery, tool descriptions and authorization are exposed through the MCP layer, while actual file and process operations terminate on the selected paired machine." },
      { heading: "Choose the capability boundary per computer", text: "Read access, supported writes, process inspection, terminal execution, browser interaction and task capabilities are separate controls. Trusted Write Locations and sensitive-path rules narrow supported file operations. When unrestricted terminal execution is enabled, the command still inherits the permissions of the local operating-system user, so it should be enabled only on devices where that authority is acceptable." },
      { heading: "Understand local recovery and hosted state", text: "Supported file edits can create Local Undo snapshots on the device, and recovery checks the current file revision before restoring older content. Hosted Remote Arc stores account, device, grant, policy, usage and task metadata needed for routing and recovery. It is not intended to become a backup of your whole filesystem." },
      { heading: "Use durable work for deterministic continuation", text: "Long Tasks, schedules and condition watches can save work that should continue after the current chat stream ends. These mechanisms are best for bounded commands and checks with observable results. When the next step requires new judgment rather than a predetermined command, a supported reasoning controller must resume and decide what to do next." }
    ],
    links: [["/docs/mcp", "MCP reference"], ["/docs/long-running-work", "Long-running work"], ["/security-model", "Security model"], ["/use-cases", "Use cases"], ["/connect-ai", "Connect an AI client"]]
  },
  "/remote-mcp": {
    h1: "Remote MCP Server: what it is and how to connect",
    intro: "Remote MCP lets an AI client discover and call tools exposed by a server reachable over the network. Learn how this differs from locally launched MCP processes, how to connect a compatible ChatGPT, Claude or Cursor client, and how Remote Arc uses one hosted MCP endpoint to bridge approved tools on computers you explicitly pair.",
    sections: [
      { heading: "What is a remote MCP server?", text: "MCP, the Model Context Protocol, defines how a client discovers and invokes tools made available by a server. With a local MCP setup the AI host commonly starts the tool server as a child process and exchanges protocol messages over standard input and output (stdio). A remote MCP server is reachable through a network transport such as Streamable HTTP, so the AI host need not launch that MCP server as a local child process. Authentication and individual client compatibility still matter; a reachable URL alone does not make every MCP client able to connect or use every tool." },
      { heading: "Local MCP versus remote MCP", text: "Local stdio MCP is useful when an AI client and tools live in the same development environment, or when you can configure and run a tool process next to your assistant. Remote MCP is useful for managed network services, centrally controlled OAuth integrations and clients that need tools hosted elsewhere. The word remote describes how the client reaches an MCP endpoint. It does not require every downstream operation to run on the server hosting that endpoint. Remote Arc, for example, routes permitted calls from a hosted MCP control plane to the local agent on a paired computer." },
      { heading: "How to connect a Remote MCP server in three steps", text: "First, choose a supported remote MCP server and understand what capabilities it provides. For Remote Arc, run npx remotelink on the Windows, macOS or Linux computer that should receive tool calls, then approve pairing through the Remote Arc dashboard. Second, open the MCP apps or connectors configuration inside your AI client and add https://mcp.remotearc.app/mcp using its supported remote HTTP setup. Complete OAuth to authorize that client to your Remote Arc account. The menus and the availability of custom remote MCP connections depend on client version, account and workspace settings. Third, list paired devices through the connected client and make a harmless read-only test call before authorizing file edits, shell commands or other broader tools." },
      { heading: "Remote MCP setup for ChatGPT, Claude and Cursor", text: "ChatGPT requires a supported app or MCP connector entry point; Remote Arc can be installed when available or connected through the appropriate developer setup. Claude exposes custom connector setup with OAuth where supported. Cursor supports remote MCP server configuration; confirm authorization and tool discovery before requesting work on a project. Follow the current Remote Arc install guide for each client instead of copying a configuration meant for a different application. Running a computer agent alone does not automatically add its hosted MCP endpoint to your ChatGPT, Claude or Cursor account." },
      { heading: "Remote Arc architecture: from AI client to your computer", text: "Remote Arc separates the AI's reasoning from tool execution. Your AI client sends authenticated MCP requests over HTTPS to the Remote Arc endpoint. The hosted service checks account authorization and the selected device's policy, then routes the request through an outbound connection already established by that computer's local agent. Files, processes and approved terminal commands run on the selected computer. Ordinary setup does not open an inbound public MCP port on your laptop, expose a router port or require a VPN. A device still needs power, network connectivity and a working local agent to receive calls." },
      { heading: "Security: OAuth is not permission to run everything", text: "OAuth grants a supported AI client access to the Remote Arc account, not a shared operating-system login or unconditional control of every paired machine. Each computer has its own revocable device identity and configurable tool permissions. Start with read access; enable writing or terminal calls only for workflows you trust. Trusted Write Locations and sensitive path rules narrow supported file operations. Terminal commands, when separately enabled, run under the local OS user and are not placed in an operating-system sandbox by those file rules. Requested data and tool results can pass through the hosted relay and AI provider, so review the security and privacy documentation." },
      { heading: "Troubleshooting remote MCP connections", text: "If a client cannot discover tools, verify that your particular AI account supports remote MCP apps or connectors, that the endpoint is configured in that client and that OAuth completed. If the client connects but a computer appears offline, inspect the computer's power and network state and run npx remotelink to confirm the local agent is available. If a tool is denied, check the exact target device and its permissions; a successful OAuth login is separate from write or terminal authorization. The Free plan includes background agent recovery, but planned durable jobs, scheduling and keep-awake are separate Plus capabilities. Neither tier can execute on a powered-off computer." }
    ],
    links: [["/docs/mcp", "Remote Arc tool and OAuth reference"], ["/install/chatgpt", "Connect ChatGPT"], ["/install/claude", "Connect Claude"], ["/install/cursor", "Connect Cursor"], ["/mcp-computer-access", "Remote MCP computer access architecture"], ["/security-model", "Security and authorization"], ["/pricing", "Free and Plus capabilities"]]
  },
  "/chrome-extension": {
    h1: "Download Chrome Companion for Remote Arc",
    intro: "Install the scoped Chrome Companion extension to share individual Chrome browser tabs with your AI through Remote Arc. Get the current ZIP download immediately at the top of the page, then follow the Chrome installation instructions. This optional browser tool is not needed for file or terminal operations.",
    sections: [
      { heading: "Download the unpacked Chrome extension", text: "Download the Chrome Companion ZIP from the first card on this page. Unzip the package to a stable folder on your computer. Chrome Companion is currently distributed as an unpacked beta rather than through Chrome Web Store." },
      { heading: "Install from chrome://extensions", text: "Open the Chrome extensions management page at chrome://extensions, enable Developer mode, choose Load unpacked and select the directory containing manifest.json. Open the extension popup, choose Connect to Remote Arc, confirm browser pairing and share the browser tab you want the AI to use." },
      { heading: "Every shared tab starts read-only", text: "A newly shared Chrome tab provides read-only tools for page snapshots, selected text, links and tables. Click & fill requires separate explicit permission for that tab. Stale element references are rejected and recognized password, one-time-code, payment-card and file-picker fields are not available to normal browser filling." },
      { heading: "Unpacked extensions need manual updates", text: "The download ZIP is rebuilt from current extension source when the production website is deployed, but Chrome does not automatically update an extension loaded using Load unpacked. To upgrade, download and unpack a new ZIP and reload the unpacked extension in Chrome." }
    ],
    links: [["/docs/mcp", "Browser MCP tools and scopes"], ["/security-model", "Security and per-device permissions"], ["/connect-ai", "Connect a ChatGPT, Claude or Cursor MCP app"]]
  },
  "/docs/mcp": {
    h1: "Remote Arc Remote MCP reference",
    intro: "Reference for the Remote Arc MCP endpoint, OAuth authorization, device discovery, file and process tools, browser capabilities, durable task controls and client integration.",
    sections: [
      { heading: "Endpoint and authorization", text: "Compatible clients connect to https://mcp.remotearc.app/mcp. Remote Arc uses OAuth authorization for AI clients and keeps that authorization separate from device pairing. A client grant can be revoked without re-pairing every computer, and a single computer can be revoked without invalidating every AI connection on the account." },
      { heading: "Device discovery and selection", text: "The MCP surface can list computers linked to the account and report whether each device is online. Tool calls target a specific device identifier so work is routed to one selected connection rather than broadcast across the account. Device metadata is used for routing and policy decisions; the remote client does not receive an operating-system login session." },
      { heading: "Files, processes and commands", text: "Depending on device policy, MCP tools can list directories, read text or bounded binary data, inspect file metadata, inspect processes, apply supported text edits and start managed terminal commands. Write operations can be limited by Trusted Write Locations and protected-path rules. Terminal access is intentionally distinct because once enabled it inherits the local user's authority." },
      { heading: "Browser companion capabilities", text: "When a Chrome tab is explicitly shared, Remote Arc can expose a simplified snapshot, selected text, links or table data. Click and fill capabilities require additional per-tab permission. Password, one-time-code, payment-card and file-upload fields remain outside the ordinary browser fill path." },
      { heading: "Durable tasks and reasoning boundaries", text: "Remote Arc can persist long commands, schedules, condition watches and bounded goal state so deterministic work can survive disconnects and chat endings. Task state and recovery do not imply that an AI model is continuously running. Any step that requires fresh interpretation still needs a reasoning controller to resume from saved context and choose the next allowed action." }
    ],
    links: [["/remote-mcp", "What is Remote MCP? Connection guide"], ["/mcp-computer-access", "MCP computer access overview"], ["/install/chatgpt", "ChatGPT setup"], ["/install/claude", "Claude setup"], ["/docs/long-running-work", "Long-running work"], ["/security-model", "Security model"]]
  },
  "/docs/long-running-work": {
    h1: "Long-running AI work on your own computer",
    intro: "Understand saved tasks, bounded command slices, verification, recovery, scheduled work and the limits of continuing a task after a chat turn ends.",
    sections: [
      { heading: "Persist the task contract, not an open chat stream", text: "Remote Arc can store the objective, target device, allowed tools, working directory, command or bounded plan, verification rules and expiry needed to continue approved work. The saved task exists independently from the browser tab or chat stream that created it, so closing the conversation does not erase the deterministic work contract." },
      { heading: "Use Long Tasks for known commands", text: "When the command is already known, a Long Task can start it on the paired computer and record run state, exit status and bounded output. Recovery is explicit because repeating a command after losing a process handle can be unsafe. A task can be configured to fail rather than blindly execute a side-effecting command twice." },
      { heading: "Use schedules and condition watches for future triggers", text: "A schedule can make a fixed task due at a future time or after an interval. A condition watch can wait for a matching external event before making an authorized action due. The trigger decides when work becomes eligible; device policy and the selected tools still decide what the task is allowed to execute." },
      { heading: "Separate deterministic continuation from fresh reasoning", text: "A fixed command or pre-agreed execution slice can continue without asking a model to invent a new strategy. When evidence shows that the plan is blocked or a different next step is required, Remote Arc can preserve context for a later reasoning controller. Persisted task state is not the same thing as claiming an AI model stays awake and continuously thinks between chat turns." },
      { heading: "Verify completion with evidence", text: "A task should finish against observable criteria such as an exit code, test command, generated artifact or recorded state. Failed, expired, cancelled and paused are distinct outcomes and should not be reported as success. For source-controlled work, green-only checks and revision-aware edits provide stronger evidence than a simple 'command ran' message." }
    ],
    links: [["/use-cases/overnight-goals", "Overnight goals"], ["/use-cases/long-running-jobs", "Long-running jobs"], ["/use-cases/scheduled-checks", "Scheduled checks"], ["/docs/mcp", "MCP reference"], ["/pricing", "Pricing"]]
  },
  "/security-model": {
    h1: "Remote Arc security and trust model",
    intro: "Remote Arc separates AI-client authorization, hosted routing and local operating-system execution so each paired computer can keep its own explicit capability boundary.",
    sections: [
      { heading: "Outbound device connection", text: "The local agent connects outward to the hosted relay rather than requiring a normal inbound Remote Arc port. A computer therefore does not need port forwarding or a publicly reachable listener for ordinary Remote Arc use. The hosted control plane can route authenticated tool calls to an online device through that existing outbound connection." },
      { heading: "Separate client authorization from device identity", text: "AI clients authorize with OAuth while paired computers receive independent revocable device identities. This avoids one shared master credential for every client and machine. Revoking an AI grant does not require re-pairing every computer, and removing one computer does not force all AI clients to authorize again." },
      { heading: "Per-device capability policy", text: "Read, edit, terminal, browser and long-running task capabilities can be controlled separately. File-oriented work can be narrowed with Trusted Write Locations, workspace boundaries, protected sensitive paths and approval steps. The policy is attached to the device rather than hidden inside a prompt, so a different AI client sees the same local boundary." },
      { heading: "Terminal access is intentionally more powerful", text: "When terminal execution is enabled, commands run with the permissions of the local operating-system user. Remote Arc does not claim that workspace settings sandbox an unrestricted shell. Users should enable terminal access only on devices where that authority is appropriate and prefer narrower file tools when they are sufficient." },
      { heading: "Local recovery without hosted filesystem backups", text: "Supported write_file and edit_block operations can create Local Undo snapshots on the paired computer. A restore checks the post-edit revision before overwriting newer work. Snapshot contents remain local; hosted Remote Arc keeps the operational metadata required for identity, routing, policy, task state and audit rather than storing a backup copy of the whole device." }
    ],
    links: [["/docs", "Documentation"], ["/docs/mcp", "MCP reference"], ["/privacy", "Privacy"], ["/support", "Support"]]
  },
  "/use-cases": {
    h1: "Remote Arc use cases",
    intro: "Practical workflows for remote development, file organization, long-running jobs, scheduled checks, CI follow-up, data work, home-lab diagnostics, browser context and remote support.",
    sections: [
      { heading: "Remote development on the machine that owns the checkout", text: "An AI can inspect an existing repository, read configuration, edit selected files and run the project's own tests without first copying the project into another hosted environment. Device policy determines whether the session stays read-only or can use targeted edits and managed commands." },
      { heading: "Durable jobs without keeping a chat stream open", text: "Builds, exports, scripts and scheduled checks can be stored as bounded tasks so the device can keep working after the immediate conversation ends. Remote Arc records task state and results, while new reasoning is requested only when a later step actually requires judgment." },
      { heading: "Authorized diagnostics and support", text: "A paired machine can expose logs, file metadata and running processes for diagnosis before repair permissions are enabled. This separates observing a problem from changing the system and is useful for home-lab maintenance, remote support and incident investigation on computers you control." },
      { heading: "Explicit browser context", text: "The browser companion works only with tabs the user shares. An AI can read simplified page content, selections, links and tables, then use scoped click or fill capabilities only when interaction is enabled for that tab. This keeps browser access narrower than handing an agent unrestricted control of the whole browser profile." }
    ],
    links: [["/use-cases/remote-development", "Remote development"], ["/use-cases/overnight-goals", "Overnight goals"], ["/use-cases/browser-research", "Browser research"], ["/use-cases/home-lab", "Home lab"], ["/use-cases/remote-support", "Remote support"], ["/docs", "Documentation"]]
  },
  "/pricing": {
    h1: "Remote Arc pricing",
    intro: "Use the hosted Remote MCP control plane with a free account, then add account capabilities for heavier or longer-running workflows.",
    sections: [
      { heading: "Free covers core remote-computer access", text: "The Free plan currently includes 10,000 hosted MCP tool calls per account each month, text-file and directory inspection, process inspection, explicitly shared browser-tab context and the file-editing or terminal tools that you deliberately enable on a device. Per-device permissions, Trusted Write Locations and Sensitive Path Policy remain part of the control model." },
      { heading: "Plus is the durable-work capability tier", text: "Plus adds server-enforced capabilities such as bounded binary reads, temporary revision-pinned file resources, durable long-running command Tasks, schedules, condition watches, deterministic verification loops and supported keep-awake leases. These features extend what an authorized task may do; they do not silently override device tool policy." },
      { heading: "Plan entitlement and usage are separate", text: "The account plan decides which product capabilities can be invoked, while device policy decides where those capabilities may act. Hosted MCP calls are metered separately, and one chat request can involve multiple tool calls. Reaching a usage limit never expands permissions or changes the device's local security boundary." },
      { heading: "Durable does not mean unlimited AI reasoning", text: "Remote Arc can persist approved deterministic work, process tracking, schedules, verification state and recovery metadata after a chat disconnects. Fresh judgment still requires a supported reasoning host when the next action cannot be determined from the saved task contract." }
    ],
    links: [["/docs", "Documentation"], ["/docs/long-running-work", "Long-running work"], ["/install/chatgpt", "Get started"], ["/security-model", "Security model"]]
  },
  "/blogs": {
    h1: "Remote Arc blog",
    intro: "Engineering notes, architecture decisions, security trade-offs and product reasoning from building a controlled Remote MCP bridge to real computers."
  },
  "/releases": {
    h1: "Remote Arc release history",
    intro: "Product changes across device access, MCP tooling, browser capabilities, security controls, task persistence and the hosted control plane.",
    sections: [
      { heading: "Device runtime and onboarding", text: "Remote Arc releases track changes to remotelink pairing, background recovery, version visibility, device removal, reconnect behavior and the onboarding path that gets a new computer from install to a usable AI connection." },
      { heading: "MCP tools and local safety", text: "Release notes cover file and process tools, terminal execution, Trusted Write Locations, sensitive-path handling, Local Undo, binary reads and the browser companion. Security-sensitive behavior is documented alongside capability changes rather than being treated as an implementation detail." },
      { heading: "Durable task execution", text: "Long Tasks, schedules, condition watches, bounded Agent Goals, verification, recovery and source-controlled continuation evolve independently from immediate MCP calls. Release history records when those capabilities change so users can understand what a particular runtime version supports." },
      { heading: "Hosted control plane", text: "OAuth, device routing, usage enforcement, account entitlements, monitoring and deployment changes are part of the same release surface because the local agent and hosted relay must agree on protocol and policy semantics." }
    ],
    links: [["/docs", "Documentation"], ["/docs/mcp", "MCP reference"], ["/blogs", "Engineering blog"], ["/security-model", "Security model"]]
  },
  "/demo": {
    h1: "Remote Arc demo",
    intro: "See the shape of a Remote Arc session from an AI request through the hosted MCP control plane to a paired computer and back.",
    sections: [
      { heading: "The AI starts with a named task", text: "A Remote Arc workflow begins in a compatible AI client. The request identifies the computer and desired result, such as inspecting a project, reading files or running a test. The AI receives MCP tools rather than a raw desktop credential." },
      { heading: "The hosted control plane routes the call", text: "Remote Arc authenticates the AI client, checks account and device policy, resolves the selected paired computer and forwards the tool request through that device's existing outbound connection. The machine does not need a public inbound Remote Arc port." },
      { heading: "Execution finishes on the computer", text: "The local agent checks the capabilities it exposes and performs the approved operation using the real files, processes and runtimes on that machine. The specific tool result returns through the relay to the AI client." },
      { heading: "The demo is not a hidden unrestricted session", text: "The same per-device permissions apply during a demo as during ordinary use. Read, edit, terminal, browser and durable-task capabilities remain separable, and terminal access still carries the permissions of the local operating-system user." }
    ],
    links: [["/install/chatgpt", "Install for ChatGPT"], ["/mcp-computer-access", "How MCP computer access works"], ["/security-model", "Security model"], ["/docs", "Documentation"]]
  },
  "/connect-ai": {
    h1: "Connect an AI client to Remote Arc",
    intro: "Pair a computer first, then connect ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.",
    sections: [
      { heading: "Pair the computer before connecting the AI", text: "Run remotelink on the Windows, macOS or Linux machine that should receive Remote Arc tool calls. Approve the pairing request in your account and confirm the device appears online. Device pairing establishes the computer identity separately from any AI client authorization." },
      { heading: "Add the Remote MCP endpoint", text: "Use https://mcp.remotearc.app/mcp in a compatible client and complete Remote Arc OAuth when prompted. The client can then discover the tools permitted by your account and the selected device without needing the computer's operating-system password." },
      { heading: "Start with the narrowest useful permissions", text: "Read-only inspection is enough for many diagnosis and review tasks. Enable supported editing, terminal execution, browser interaction or durable task permissions only where the workflow requires them. Different computers can expose different capability sets under the same account." },
      { heading: "Verify with a small first request", text: "After connecting, list paired devices and ask the AI to read a harmless file or inspect a project directory on the intended computer. Confirm the device, path and result before granting broader capabilities. This catches wrong-device or wrong-workspace mistakes early in onboarding." }
    ],
    links: [["/install/chatgpt", "ChatGPT"], ["/install/claude", "Claude"], ["/install/cursor", "Cursor"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"]]
  },
  "/privacy": {
    h1: "Remote Arc privacy policy",
    intro: "How Remote Arc handles account, device, usage and operational data across the hosted control plane and paired-device workflows."
  },
  "/terms": {
    h1: "Remote Arc terms of service",
    intro: "Terms governing access to and use of Remote Arc."
  },
  "/support": {
    h1: "Remote Arc support",
    intro: "Help with installation, device pairing, Remote MCP connections, account access and security reporting.",
    links: [["/docs", "Documentation"], ["/install/chatgpt", "ChatGPT setup"], ["/security-model", "Security"]]
  }
};

const useCaseCrawlDetails: Record<string, { prompt: string; flow: string; tools: string; proof: string; boundary: string }> = {
  "remote-development": {
    prompt: "Ask the AI to inspect a named checkout, reproduce a failing test, edit only the affected code and rerun focused verification on the same paired workstation.",
    flow: "Resolve the target device and workspace first, read the failing implementation before editing, apply a focused change, run the project's own checks and inspect the resulting diff before any commit.",
    tools: "Typical capabilities are device discovery, read_file, edit_block and start_process. The device needs file-read and edit permission plus terminal access for tests.",
    proof: "A useful result includes the concrete diff, focused test output and a clear statement of any remaining failure instead of only saying that the task is done.",
    boundary: "Terminal commands run as the local operating-system user. Trusted Write Locations do not sandbox shell commands, and Local Undo covers supported file-tool edits rather than arbitrary shell edits or Git history."
  },
  "file-organization": {
    prompt: "Ask the AI to inspect a selected folder, propose an exact move plan, wait for approval, avoid deletion or overwrite, then save a before-and-after manifest.",
    flow: "Inspect names and metadata without reading unnecessary contents, review destination folders and filename collisions, execute only the approved moves, then verify that the expected files exist at their new locations.",
    tools: "Planning can use list_directory, get_file_info and selective read_file. Actual file moves currently require separately authorized terminal access because there is no dedicated move-file MCP tool.",
    proof: "The result should preserve the approved move list, document collision handling and verify destination files so the user can review exactly what changed.",
    boundary: "Shell-based moves are outside Local Undo and are not a transactional filesystem migration. A manifest improves reviewability but does not guarantee automatic rollback."
  },
  "overnight-goals": {
    prompt: "Use a bounded fixed plan when the work command and verification command are already known, with an explicit retry count and deadline.",
    flow: "Persist the exact command, working directory, verification command, run limit and expiry. Repeat only the authorized plan until verification passes or the bound is reached; stop when a genuinely new strategy would be required.",
    tools: "The workflow uses durable goal or automation controls plus terminal and background-task permission on the selected device.",
    proof: "Run history, exit codes and the final verification result show whether the fixed plan actually succeeded.",
    boundary: "This is deterministic orchestration rather than a continuously thinking AI. Unexpected failures that need a new strategy are surfaced for later user or AI reasoning instead of being improvised silently."
  },
  "long-running-jobs": {
    prompt: "Save a known build, export or script as a Long Task instead of holding an interactive chat turn open until the process finishes.",
    flow: "Store the command, working directory, recovery policy and expiry, start the managed process when the device is available, and retain bounded run state so the result can be checked later.",
    tools: "Long Tasks use durable automation controls together with terminal and background-task permissions on the paired computer.",
    proof: "Check the process exit code and the generated artifact on the device; a short textual summary alone does not prove that the output file is valid.",
    boundary: "The task survives in durable state, not as a promise that the same PID always survives. If an acknowledged process handle is lost, recovery follows the configured restart-or-fail policy and unknown dispatch outcomes are not blindly replayed."
  },
  "scheduled-checks": {
    prompt: "Save a fixed check for a future time or repeat it after a completion-based interval, with a clear stop condition and no unauthorized repair action.",
    flow: "Confirm the schedule, permitted command and expiry, let the cloud scheduler mark each run due, wait for the paired computer to become available, then record each run separately.",
    tools: "Scheduled work requires the task's normal device tools plus background and scheduled-task permission; adaptive goals require the corresponding reasoning permission as well.",
    proof: "Per-run timestamps, exit codes, summaries and any configured verification evidence show what actually happened on each iteration.",
    boundary: "Intervals begin after completion rather than at fixed wall-clock minutes. The scheduler is not a precision timer and does not currently promise calendar cron semantics, missed-run backfill or automatic computer power-on."
  },
  "ci-follow-up": {
    prompt: "Wait for a specific authorized CI or webhook condition, then run one predefined follow-up action and stop at the configured deadline.",
    flow: "Freeze the event match and action in advance, configure the source to deliver the callback, make the saved plan due only when the expected event matches, then inspect the action result and run history.",
    tools: "Condition watches use durable task controls and the device tools required by the action. Cloud-side repository actions additionally need explicit repository and installation authorization.",
    proof: "Evidence should include both the matched event and the actual action outcome rather than treating receipt of a callback as proof that the follow-up succeeded.",
    boundary: "A successful workflow is not by itself permission to merge or change a repository. Inbound secret callback URLs and delivery deduplication are separate from provider-specific webhook-signature guarantees."
  },
  "data-work": {
    prompt: "Use an existing Python, Node or other installed environment on the paired workstation to analyze local input and write a verified result into the chosen project directory.",
    flow: "Inspect the input schema and runtime, run the approved analysis, keep generated artifacts in the project, and validate totals or output structure before returning the result.",
    tools: "Common capabilities are read_file, get_file_info, start_process and write_file, with durable task controls added when processing must continue after the chat ends.",
    proof: "Return the saved output path, validated totals or structure and the command exit status so the result can be independently checked.",
    boundary: "Keeping the primary dataset on the device does not mean no data leaves it. Requested file contents and command results can pass through the hosted relay and the selected AI client, and durable observations can retain bounded excerpts."
  },
  "home-lab": {
    prompt: "Inspect a headless host for facts such as disk usage, failed services and bounded log excerpts without automatically restarting or reconfiguring anything.",
    flow: "Confirm the host is online, inspect only the requested state with bounded output, and separate diagnosis from any later proposal to repair or restart services.",
    tools: "Read-oriented diagnosis can use process and file inspection; command-based checks require terminal access when the fact is not available through a narrower tool.",
    proof: "A useful diagnosis cites the relevant log excerpts, process state and command output that support the conclusion.",
    boundary: "Remote Arc uses an outbound user-session agent; it does not replace fleet configuration management, a hypervisor console or permanent supervision of arbitrary system services."
  },
  "browser-research": {
    prompt: "Explicitly share a Chrome tab, then ask the AI to read the page, extract selected text, links or a table without navigating or submitting anything unless interaction was separately enabled.",
    flow: "Install the browser companion, share the intended tab, select its tab identifier, request only the needed context and revoke sharing when the work is finished.",
    tools: "Read capabilities include browser_read_page, selected text, link extraction and table extraction. Click and fill require a separate per-tab opt-in and fresh snapshot references.",
    proof: "The returned facts should be tied to the explicitly shared page, such as extracted rows, visible links or selected text.",
    boundary: "Tabs begin read-only. Recognized password, one-time-code, payment-card and file-upload fields are blocked from the ordinary fill path, and browser tools are not the same thing as unrestricted profile-wide browser control."
  },
  "presentation-deck": {
    prompt: "Ask your AI to build a 12-slide editable PPTX from an outline and charts stored in an approved folder on the workstation.",
    flow: "Read source notes and chart files, inspect the available local PPTX library, generate the presentation using an authorized terminal script, then validate slide count and document structure.",
    tools: "This workflow uses read_file, list_directory, start_process and get_file_info. It requires an enabled terminal tool and a suitable PPTX library installed on the computer.",
    proof: "Provide the real presentation file path, number of generated slides and the output of the document verification step.",
    boundary: "Remote Arc has no built-in PowerPoint editor MCP tool. The locally installed software is responsible for file generation and rendering, and generated layouts should be visually reviewed before sharing."
  },
  "spreadsheet-report": {
    prompt: "Ask your AI to combine authorized monthly CSV files into an Excel workbook with reconciled totals, deduplication and useful charts.",
    flow: "Inspect input headers and schemas, run a reviewed local Python or Node XLSX generation script and check the output file, row counts and aggregate totals.",
    tools: "This workflow requires file-read tools plus authorized start_process access and an appropriate local spreadsheet-generation library.",
    proof: "Return an actual XLSX path, checked input/output totals and any discrepancies or formula issues found during validation.",
    boundary: "An installed library is required and some Excel formulas calculate only when opened in a spreadsheet app. No built-in XLSX manipulation MCP tool is currently advertised, and tool results may pass through the hosted relay."
  },
  "desktop-automation": {
    prompt: "Review a local mouse-and-keyboard automation script and, after explicit approval, execute it once in an unlocked test desktop session.",
    flow: "Inspect the existing script, list the intended app interactions and side effects, confirm user authorization, then run the local utility through an enabled terminal and verify the result.",
    tools: "Remote Arc can run locally installed automation software through start_process when authorized. Interactive OS session and appropriate accessibility or input permissions are required.",
    proof: "Collect the actual script exit status and exported app output, and distinguish verified interactions from assumptions.",
    boundary: "Remote Arc currently has no native screen capture, mouse-move, click or keyboard-control MCP tools. This is optional local scripting, not native remote GUI control; sensitive interaction should not run unattended without review."
  },
  "cross-device-handoff": {
    prompt: "Use one chat to inspect a Windows workstation and a Mac developer machine, run authorized checks on each and compare cross-platform results.",
    flow: "Identify both paired devices, check their separate availability and permissions, inspect the intended checkout on each, and validate any edits with platform-specific tests.",
    tools: "Explicit device discovery, file inspection, edit_block and start_process are used independently for each connected computer.",
    proof: "Return two device-identified test logs and a reviewed diff rather than a single merged claim that work succeeded everywhere.",
    boundary: "Remote Arc does not automatically sync repositories across devices. Both machines must be reachable, separately authorized and equipped with their required local toolchain."
  },
  "remote-support": {
    prompt: "On a computer you own or are authorized to administer, inspect logs and process state, explain the likely cause and ask before restarting or modifying anything.",
    flow: "Pair only an authorized computer, observe facts within the granted tools and paths, separate diagnosis from repair, and verify the post-repair state only after the requested repair authority exists.",
    tools: "Diagnosis commonly uses read_file and list_processes; repair commands require separately authorized terminal access.",
    proof: "A diagnosis should be backed by observed state, and an authorized repair should include a post-change check rather than only reporting that a command was issued.",
    boundary: "This is file and process support rather than GUI screen control. Prompt instructions are not an operating-system sandbox, and disabling future access does not undo changes that already occurred."
  }
};

for (const [slug, [title, description]] of Object.entries(useCaseSeo)) {
  const path = "/use-cases/" + slug;
  const detail = useCaseCrawlDetails[slug]!;
  crawlPages[path] = {
    h1: title,
    intro: description,
    sections: [
      { heading: "Example request", text: detail.prompt },
      { heading: "How the work proceeds", text: detail.flow },
      { heading: "Tools and permissions", text: detail.tools },
      { heading: "What useful evidence looks like", text: detail.proof },
      { heading: "Know the boundary", text: detail.boundary }
    ],
    links: [["/use-cases", "All use cases"], ["/docs", "Documentation"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"]]
  };
}

function pageFor(pathname: string): SeoPage | null {
  return articles[pathname] ?? pages[pathname] ?? null;
}

export function isKnownMarketingPath(pathname: string) {
  return Boolean(pageFor(pathname));
}

export function marketingStatusCode(pathname: string) {
  return isKnownMarketingPath(pathname) ? 200 : 404;
}

export function canonicalForPath(pathname: string) {
  return pageFor(pathname)?.canonical ?? null;
}

function breadcrumbItems(pathname: string, page: SeoPage) {
  if (pathname === "/") return [];
  const parts = pathname.split("/").filter(Boolean);
  const items = [{ "@type": "ListItem", position: 1, name: "Remote Arc", item: SITE + "/" }];
  let current = "";
  parts.forEach((part, index) => {
    current += "/" + part;
    const currentPage = pageFor(current);
    const fallbackName = part.replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase());
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: index === parts.length - 1 ? page.title : (currentPage?.title ?? fallbackName),
      item: index === parts.length - 1 ? page.canonical : (currentPage?.canonical ?? SITE + current)
    });
  });
  return items;
}

function howToSchema(pathname: string, page: SeoPage) {
  const copy = crawlPages[pathname];
  if (!copy?.sections?.length) return null;
  return {
    "@type": "HowTo",
    name: copy.h1,
    description: copy.intro,
    step: copy.sections.map((section, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: section.heading,
      text: section.text,
      url: page.canonical + "#step-" + (index + 1)
    }))
  };
}

function jsonLd(page: SeoPage, pathname: string) {
  const graph: unknown[] = [
    {
      "@type": "Organization",
      "@id": SITE + "/#organization",
      name: "Remote Arc",
      url: SITE,
      logo: { "@type": "ImageObject", url: SITE + "/remote-arc-512.png", width: 512, height: 512 },
      sameAs: ["https://github.com/yaohuangguan/remote-arc"]
    },
    {
      "@type": "WebSite",
      "@id": SITE + "/#website",
      name: "Remote Arc",
      url: SITE,
      publisher: { "@id": SITE + "/#organization" },
      inLanguage: "en"
    }
  ];

  if (page.type === "article") {
    graph.push({
      "@type": "TechArticle",
      "@id": page.canonical + "#article",
      headline: page.title,
      description: page.description,
      datePublished: "2026-09-27",
      dateModified: "2026-09-27",
      author: { "@type": "Person", name: page.author || "Sam Yao" },
      publisher: { "@id": SITE + "/#organization" },
      mainEntityOfPage: page.canonical,
      image: SITE + "/demos/connect-workflow-poster.webp",
      inLanguage: "en"
    });
  } else if (pathname === "/") {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": SITE + "/#software",
      name: "Remote Arc",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Remote MCP computer access",
      operatingSystem: "Windows, macOS, Linux",
      url: SITE,
      description: page.description,
      publisher: { "@id": SITE + "/#organization" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Remote MCP computer access",
        "Per-device tool permissions",
        "Workspace and sensitive-path controls",
        "File inspection and supported edits",
        "Managed command execution",
        "Browser tab context",
        "Local undo for supported edits",
        "Long-running task controls"
      ]
    });
  } else if (pathname === "/blogs") {
    graph.push({ "@type": "CollectionPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@id": SITE + "/#website" } });
  } else if (pathname === "/use-cases") {
    graph.push({ "@type": "CollectionPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@id": SITE + "/#website" } });
  } else if (pathname.startsWith("/docs") || pathname === "/security-model" || pathname === "/mcp-computer-access" || pathname === "/remote-mcp") {
    graph.push({
      "@type": "TechArticle",
      headline: page.title,
      description: page.description,
      url: page.canonical,
      author: { "@id": SITE + "/#organization" },
      publisher: { "@id": SITE + "/#organization" },
      inLanguage: "en"
    });
  } else {
    graph.push({
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: page.canonical,
      isPartOf: { "@id": SITE + "/#website" },
      about: { "@id": SITE + "/#software" }
    });
  }

  if (pathname.startsWith("/install/")) {
    const howTo = howToSchema(pathname, page);
    if (howTo) graph.push(howTo);
  }

  if (pathname === "/chatgpt-computer-access") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Does Remote Arc expose a port on my computer?", acceptedAnswer: { "@type": "Answer", text: "No. The local agent creates an outbound connection to the hosted control plane." } },
        { "@type": "Question", name: "Can I keep a computer read-only?", acceptedAnswer: { "@type": "Answer", text: "Yes. Tool availability is configured per device, so terminal and write tools can remain disabled." } },
        { "@type": "Question", name: "Do I have to use only ChatGPT?", acceptedAnswer: { "@type": "Answer", text: "No. The same Remote Arc endpoint can also be used by Claude, Cursor and compatible Remote MCP clients." } }
      ]
    });
  }

  const breadcrumbs = breadcrumbItems(pathname, page);
  if (breadcrumbs.length) {
    graph.push({ "@type": "BreadcrumbList", itemListElement: breadcrumbs });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

crawlPages["/downloads"] = {
  h1: "Download Remote Arc " + cliPackage.version,
  intro: "The Agent and independent Execution Core are native Go. npm installs and verifies the same binary; standalone downloads and Homebrew need no Node.js. TypeScript is available only with the explicit --ts fallback.",
  sections: [
    { heading: "npm / npx", text: "Run npx remotelink@latest with Node.js 20+. Go is the default; --go remains a compatible alias." },
    { heading: "Homebrew", text: "brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc. On Homebrew versions with trust support, trust the remotelink and remotelink-go formulae with brew trust --formula before running brew install yaohuangguan/remote-arc/remotelink. Existing remotelink-go users can upgrade that formula." },
    { heading: "Upgrade safely", text: "Stop the current Agent before changing versions or runtimes. Ctrl+C stops foreground execution; remotelink --stop disables Go recovery and drains execution. Pairing and Undo formats are preserved." },
  ],
  links: [
    ...["darwin", "windows", "linux"].flatMap(platform => ["amd64", "arm64"].map<[string, string]>(arch => ["https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v" + cliPackage.version + "/remotelink-v" + cliPackage.version + "-" + platform + "-" + arch + (platform === "windows" ? ".exe" : ""), platform + " / " + arch])),
    ["https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v" + cliPackage.version + "/SHA256SUMS", "SHA256 checksums"],
    ["/docs#docs-routing", "System architecture"],
  ],
};

function crawlablePageHtml(pathname: string, page: SeoPage) {
  const copy = crawlPages[pathname] ?? {
    h1: page.title.replace(/ — Remote Arc$/, ""),
    intro: page.description,
    sections: [],
    links: [["/docs", "Documentation"], ["/security-model", "Security model"]]
  };
  const sections = (copy.sections || []).map((section, index) =>
    '<section id="step-' + (index + 1) + '"><h2>' + esc(section.heading) + '</h2><p>' + esc(section.text) + '</p></section>'
  ).join("");
  const links = (copy.links || []).map(([href, label]) =>
    '<li><a href="' + esc(href) + '">' + esc(label) + '</a></li>'
  ).join("");
  return '<main class="seo-blog-shell"><article><p class="seo-eyebrow">REMOTE ARC</p><h1>' + esc(copy.h1) + '</h1><p>' + esc(copy.intro) + '</p>' + sections + (links ? '<nav aria-label="Related Remote Arc pages"><h2>Related guides</h2><ul>' + links + '</ul></nav>' : '') + '</article></main>';
}

function notFoundHtml(pathname: string) {
  return '<main class="seo-blog-shell"><section><p class="seo-eyebrow">404</p><h1>Page not found</h1><p>No Remote Arc page exists at ' + esc(pathname) + '.</p><p><a href="/">Remote Arc home</a> · <a href="/docs">Documentation</a> · <a href="/install/chatgpt">Install for ChatGPT</a></p></section></main>';
}

export function renderMarketingHtml(html: string, pathname: string) {
  const page = pageFor(pathname);
  const resolved = page ?? {
    title: "Page not found — Remote Arc",
    description: "The requested Remote Arc page could not be found.",
    canonical: SITE + pathname
  };
  const indexable = Boolean(page);
  const structured = indexable ? JSON.stringify(jsonLd(resolved, pathname)).replaceAll("<", "\\u003c") : "";
  const robots = indexable
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "noindex,nofollow,noarchive";
  const image = SITE + "/demos/connect-workflow-poster.webp";
  const extra =
    '<meta name="robots" content="' + robots + '" />' +
    '<meta name="googlebot" content="' + robots + '" />' +
    '<meta name="bingbot" content="' + robots + '" />' +
    '<meta name="author" content="' + esc(resolved.type === "article" ? (resolved.author || "Sam Yao") : "Remote Arc") + '" />' +
    '<meta property="og:type" content="' + (resolved.type === "article" ? "article" : "website") + '" />' +
    '<meta property="og:locale" content="en_US" />' +
    '<meta property="og:image" content="' + image + '" />' +
    '<meta property="og:image:secure_url" content="' + image + '" />' +
    '<meta property="og:image:type" content="image/webp" />' +
    '<meta property="og:image:width" content="1280" />' +
    '<meta property="og:image:height" content="800" />' +
    '<meta property="og:image:alt" content="Remote Arc connecting an AI client to a paired computer" />' +
    '<meta name="twitter:card" content="summary_large_image" />' +
    '<meta name="twitter:title" content="' + esc(resolved.title) + '" />' +
    '<meta name="twitter:description" content="' + esc(resolved.description) + '" />' +
    '<meta name="twitter:image" content="' + image + '" />' +
    '<meta name="twitter:image:alt" content="Remote Arc connecting an AI client to a paired computer" />' +
    '<link rel="alternate" type="application/rss+xml" title="Remote Arc Blog" href="' + SITE + '/feed.xml" />' +
    (resolved.type === "article" ? '<meta property="article:published_time" content="2026-09-27T00:00:00Z" /><meta property="article:modified_time" content="2026-09-27T00:00:00Z" />' : '') +
    (indexable ? '<script type="application/ld+json">' + structured + '</script>' : '');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(resolved.title) + '</title>')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(resolved.description) + '" />')
    .replace(/<link rel="canonical"[^>]*>/, indexable ? '<link rel="canonical" href="' + esc(resolved.canonical) + '" />' : "")
    .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(resolved.title) + '" />')
    .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(resolved.description) + '" />')
    .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="' + esc(indexable ? resolved.canonical : SITE + pathname) + '" />')
    .replace(/<meta property="og:image"[^>]*>/, "")
    .replace("</head>", extra + "</head>");

  // Keep the interactive homepage client-rendered, but provide a truthful
  // no-JavaScript fallback with the same product facts. This avoids a pre-mount
  // text flash for normal visitors while still giving non-JS clients a useful,
  // semantic document instead of an empty application root.
  if (pathname === "/") {
    return html.replace(
      '<div id="root"></div>',
      '<div id="root"><noscript>' + crawlablePageHtml(pathname, resolved) + '</noscript></div>',
    );
  }

  if (!page) {
    return html.replace('<div id="root"></div>', '<div id="root">' + notFoundHtml(pathname) + '</div>');
  }
  if (pathname === "/blogs") {
    return html.replace('<div id="root"></div>', '<div id="root">' + blogIndexHtml() + '</div>');
  }
  if (articles[pathname]) {
    return html.replace('<div id="root"></div>', '<div id="root">' + articleHtml(page) + '</div>');
  }
  return html.replace('<div id="root"></div>', '<div id="root">' + crawlablePageHtml(pathname, page) + '</div>');
}

const sitemapPaths = [
  "/",
  "/downloads",
  "/install/chatgpt",
  "/install/claude",
  "/install/cursor",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/remote-mcp",
  "/connect-ai",
  "/docs",
  "/docs/long-running-work",
  "/docs/mcp",
  "/chrome-extension",
  "/security-model",
  "/use-cases",
  "/pricing",
  "/releases",
  "/demo",
  "/blogs",
  "/blogs/why-i-built-remote-arc",
  "/blogs/remote-arc-vs-openclaw",
  "/blogs/powerful-ai-access-without-exposing-your-computer",
  "/blogs/how-remote-arc-works",
  "/privacy",
  "/terms",
  "/support"
];

export function sitemapXml() {
  const paths = [...sitemapPaths, ...Object.keys(useCaseSeo).map(slug => "/use-cases/" + slug)];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(function(path) {
      const isRoot = path === "/";
      const isPrimary = path.startsWith("/install/") || path === "/chatgpt-computer-access" || path === "/claude-computer-access" || path === "/mcp-computer-access" || path === "/remote-mcp" || path === "/docs/mcp";
      return '<url><loc>' + SITE + path + '</loc><lastmod>' + (path === '/remote-mcp' ? '2026-10-08' : '2026-10-07') + '</lastmod><changefreq>' + (isRoot ? "weekly" : "monthly") + '</changefreq><priority>' + (isRoot ? "1.0" : isPrimary ? "0.9" : "0.8") + '</priority></url>';
    }).join("") + '</urlset>';
}

export function feedXml() {
  const items = Object.entries(articles).map(([path, article]) =>
    '<item><title>' + esc(article.title) + '</title><link>' + article.canonical + '</link><guid isPermaLink="true">' + article.canonical + '</guid><description>' + esc(article.description) + '</description><pubDate>Sun, 27 Sep 2026 00:00:00 GMT</pubDate></item>'
  ).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Remote Arc Blog</title><link>' + SITE + '/blogs</link><description>Engineering notes, architecture decisions and security trade-offs from Remote Arc.</description><language>en</language><lastBuildDate>Sun, 04 Oct 2026 00:00:00 GMT</lastBuildDate>' + items + '</channel></rss>';
}

export function llmsTxt() {
  return [
    "# Remote Arc",
    "",
    "> Remote Arc is a hosted Remote MCP bridge that connects compatible AI clients to explicitly paired Windows, macOS and Linux computers.",
    "",
    "## Core pages",
    "- [Home](" + SITE + "/): product overview and setup path",
    "- [Remote MCP guide](" + SITE + "/remote-mcp): remote vs local MCP, how to connect ChatGPT, Claude and Cursor, OAuth and troubleshooting",
    "- [Remote MCP computer access](" + SITE + "/mcp-computer-access): vendor-neutral architecture and capability overview",
    "- [ChatGPT computer access](" + SITE + "/chatgpt-computer-access): ChatGPT-specific setup and trust model",
    "- [Claude computer access](" + SITE + "/claude-computer-access): Claude-specific remote MCP setup",
    "- [MCP reference](" + SITE + "/docs/mcp): endpoint, OAuth and tool reference",
    "- [Security model](" + SITE + "/security-model): trust boundaries, permissions, data handling and revocation",
    "- [Long-running work](" + SITE + "/docs/long-running-work): durable tasks and recovery model",
    "- [Use cases](" + SITE + "/use-cases): practical workflows",
    "",
    "## Install",
    "- [ChatGPT](" + SITE + "/install/chatgpt)",
    "- [Claude](" + SITE + "/install/claude)",
    "- [Cursor](" + SITE + "/install/cursor)",
    "",
    "## Source",
    "- [GitHub](https://github.com/yaohuangguan/remote-arc)",
    ""
  ].join("\n");
}

export function llmsFullTxt() {
  return llmsTxt() + [
    "",
    "## Architecture summary",
    "AI clients connect to the hosted Remote Arc MCP endpoint over OAuth. The hosted control plane handles identity, policy and routing. Each paired computer keeps an outbound connection to Remote Arc, receives only routed tool calls for that device, and executes them through the local agent.",
    "",
    "## Security summary",
    "AI-client authorization and device authorization are separate. Device policies can limit tools, Trusted Write Locations, sensitive paths, browser interaction and long-running task capabilities. Ordinary non-sensitive reads can remain broad; supported writes outside trusted locations pause for approval. Terminal access, when enabled, inherits the permissions of the local operating-system user and is not presented as an OS sandbox.",
    "",
    "## Data-flow summary",
    "Requested tool arguments, selected file content and tool output can pass through the hosted relay to the connected AI provider. Local Undo snapshots for supported file edits stay on the device. See the privacy policy and security model for current details.",
    "",
    "## Product positioning",
    "Remote Arc is not a replacement AI assistant and does not own the user's model or conversation. It is a bridge between an AI client the user already chose and computers the user explicitly paired."
  ].join("\n");
}

export function robotsTxt() {
  return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\nDisallow: /auth/\nDisallow: /device$\nDisallow: /dashboard$\nDisallow: /overview$\nDisallow: /devices$\nDisallow: /automations$\nDisallow: /connect$\nDisallow: /monitor$\nDisallow: /settings$\nDisallow: /security$\n\nSitemap: " + SITE + "/sitemap.xml\n";
}
