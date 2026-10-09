import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {stats} from "./lib.mjs";

const inputs=[], soaks=[];
let output;
for(let i=2;i<process.argv.length;i++) {
 const arg=process.argv[i],value=process.argv[++i];
 assert(value,`Missing ${arg} value`);
 if(arg==="--input")inputs.push(value);
 else if(arg==="--soak")soaks.push(value);
 else if(arg==="--output")output=value;
 else throw new Error(`Unknown ${arg}`);
}
assert(inputs.length&&output,"Use --input report.json [--input ...] [--soak ...] --output summary.md");
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;};
const number=(v,digits=3)=>Number(v.toFixed(digits));
const reports=[];
for(const file of [...inputs,...soaks]) {
 const bytes=await fs.readFile(file), report=JSON.parse(bytes);
 assert.equal(report.state,"passed",`Incomplete input ${file}`);
 reports.push({file:path.basename(file),sha256:createHash("sha256").update(bytes).digest("hex"),report});
}
const benchmarks=reports.filter(r=>r.report.layer),residency=reports.filter(r=>!r.report.layer);
const revisions=new Set(benchmarks.map(r=>r.report.revision));
assert.equal(revisions.size,1,"Do not merge revisions into one baseline");
const groups=[];
for(const {report:d} of benchmarks) {
 assert.equal(d.workingTreeDirty,false,"Baseline must identify clean source");
 const profiles=[...new Set(d.rounds.map(r=>r.mode))];
 assert(profiles.length&&profiles.every(mode=>["atomic","durable","layered"].includes(mode)),"Unsupported or empty profiles");
 for(const mode of profiles)for(const engine of ["TS","Go"]) {
  const rounds=d.rounds.filter(r=>r.mode===mode&&r.engine===engine);
  assert.equal(rounds.length,3,`${d.platform} ${d.layer} ${mode} ${engine}: expected three rounds`);
  assert(rounds.every(r=>r.errors===0));
  const metrics={};
  for(const name of Object.keys(rounds[0].metrics)) {
   const values=rounds.flatMap(r=>r.metrics[name].samples_ms);
   metrics[name]={...stats(values),round_p50_range_ms:[Math.min(...rounds.map(r=>r.metrics[name].p50_ms)),Math.max(...rounds.map(r=>r.metrics[name].p50_ms))]};
  }
  groups.push({platform:d.platform,layer:d.layer,mode,engine,metrics,rss_mib:median(rounds.map(r=>r.rss_mb)),cpu_delta_ms:median(rounds.map(r=>r.cpu_delta_ms)),startup_ms:median(rounds.map(r=>r.startup_ms)),read32_rps:median(rounds.map(r=>r.concurrency[32].throughput_rps)),reconnect_ms:d.layer==="L2"?median(rounds.map(r=>r.reconnect_ms)):undefined});
 }
}
const lines=[`# TS/Go results at ${[...revisions][0].slice(0,7)}`, "", `Source: \`${[...revisions][0]}\`. Every input is completed; source was clean for all benchmark runs.`, "", "L1 is local Core JSONL IPC; L2 is a complete foreground Agent against an authenticated loopback WebSocket Relay. Neither includes production Cloudflare or connector overhead. Both engines run serially on each host, alternating order across three rounds. File operations have 200 samples per round, pooled to 600 observations below; process startup has 20 per round. Warmup is excluded. P99 remains exploratory at this sample count.", "", "Profiles: atomic = atomic workspace/Undo; durable = durable workspace/Undo; layered = atomic workspace with durable Undo. Only the tested profiles appear below. Go critical device state always stays durable; TS retains legacy atomic config persistence. macOS fsync is not F_FULLFSYNC; Windows parent-directory syncing is unavailable. Append is outside the atomic replacement contract.", "", "## Hosts", "", "| Platform | CPU | OS | Node | Go |", "|---|---|---|---|---|"];
for(const platform of [...new Set(benchmarks.map(r=>r.report.platform))]) {
 const d=benchmarks.find(r=>r.report.platform===platform).report;
 lines.push(`| ${platform}/${d.arch} | ${d.cpuModel} | ${d.osRelease} | ${d.node} | ${d.go} |`);
}
lines.push("", "## Central results", "", "Operation numbers are pooled P50 in milliseconds. RSS, CPU and throughput are the median of three complete rounds. CPU is the actual child process delta across the measured batch, excluding warmup and the driver; RSS is one post-batch observation per round, not peak or idle memory.", "", "| Platform | Layer | Profile | Engine | Read ms | Write ms | Edit ms | Undo ms | RSS MiB | CPU batch ms | Read concurrency 32 req/s |", "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
for(const g of groups) lines.push(`| ${g.platform} | ${g.layer} | ${g.mode} | ${g.engine} | ${g.metrics.read_file.p50_ms} | ${g.metrics.write_file.p50_ms} | ${g.metrics.edit_block.p50_ms} | ${g.metrics.undo_last_change.p50_ms} | ${number(g.rss_mib,2)} | ${number(g.cpu_delta_ms,2)} | ${number(g.read32_rps,1)} |`);
lines.push("", "## Tail latency and sample counts", "", "| Platform | Layer | Profile | Engine | Operation | N | P50 ms | P95 ms | P99 ms | Round P50 range ms |", "|---|---|---|---|---|---:|---:|---:|---:|---|");
for(const g of groups)for(const [name,m] of Object.entries(g.metrics))lines.push(`| ${g.platform} | ${g.layer} | ${g.mode} | ${g.engine} | ${name} | ${m.n} | ${m.p50_ms} | ${m.p95_ms} | ${m.p99_ms} | ${m.round_p50_range_ms.join("–")} |`);
lines.push("", "## Startup and controlled reconnect", "", "Startup is fresh process readiness, not a clean cold-machine boot. Reconnect includes the deliberate two-second refusal interval, normal client retry, and post-reconnect tool/journal checks; separate accepted sockets are counted. These are not production outage measurements.", "", "| Platform | Layer | Profile | Engine | Startup median ms | Reconnect median ms |", "|---|---|---|---|---:|---:|");
for(const g of groups)lines.push(`| ${g.platform} | ${g.layer} | ${g.mode} | ${g.engine} | ${number(g.startup_ms)} | ${g.reconnect_ms===undefined?"—":number(g.reconnect_ms)} |`);
lines.push("", "## Native Go residency", "", "Each run repeatedly checks file writes/edits, two Undo operations, external conflict refusal, concurrent calls, managed-process output/status/stop, journal rotation and secret-free logs. New sockets must preserve the device ID, PID and foreground role. Normal local stop releases the execution lease; temporary fixture files/processes are cleaned. Live pairing and OS service registration are outside this fixture. Failed-conflict receipts accumulate in the fixture, so changing cycle costs are not by themselves a memory-leak finding.", "", "| Platform | Duration seconds | Cycles | New connections | First RSS MiB | Last RSS MiB | Maximum sampled RSS MiB |", "|---|---:|---:|---:|---:|---:|---:|");
for(const {report:d} of residency)lines.push(`| ${d.platform} | ${d.actualDurationSeconds} | ${d.cycles} | ${d.reconnects} | ${number(d.firstRssBytes/1048576,2)} | ${number(d.lastRssBytes/1048576,2)} | ${number(d.maxRssBytes/1048576,2)} |`);
lines.push("", "The recorded residency duration with successful assertions is useful evidence, not proof of indefinite stability or hardware power-loss durability. Physical outage/production handshake, OS service upgrade, installed terminal acceptance, and formal L3 TS/Go comparison remain separate gates.", "", "## Interpretation", "", "Ratios below are Go divided by TS, within one host/layer/profile. Lower latency, RSS and CPU ratios indicate less cost. They describe these implementations and conditions rather than a universal language speed ratio.", "");
for(const platform of [...new Set(groups.map(g=>g.platform))]) {
 const ts=groups.find(g=>g.platform===platform&&g.layer==="L2"&&g.mode==="atomic"&&g.engine==="TS");
 const go=groups.find(g=>g.platform===platform&&g.layer==="L2"&&g.mode==="atomic"&&g.engine==="Go");
 if(ts&&go)lines.push(`- ${platform} L2 atomic Go/TS: read ${number(go.metrics.read_file.p50_ms/ts.metrics.read_file.p50_ms,2)}; write ${number(go.metrics.write_file.p50_ms/ts.metrics.write_file.p50_ms,2)}; Undo ${number(go.metrics.undo_last_change.p50_ms/ts.metrics.undo_last_change.p50_ms,2)}; sampled RSS ${number(go.rss_mib/ts.rss_mib,2)}; measured-batch CPU ${number(go.cpu_delta_ms/ts.cpu_delta_ms,2)}.`);
}
lines.push("- Durable workspace/Undo writes include filesystem synchronization; its cost varies by host and filesystem. Layered profiles, when shown, still sync Undo snapshots/metadata but do not make the latest workspace write/restore power-loss durable.", "- Each platform is represented by one Intel host under ordinary host load. Linux native CI passes; a long Linux performance/residency run is not represented here.", "", "## Raw artifacts", "", "The full JSON reports retain individual latency samples and hardware/toolchain metadata. Archive them alongside this summary. Hashes make the inputs independently identifiable.", "", "| Artifact | SHA256 |", "|---|---|");
for(const r of reports)lines.push(`| ${r.file} | \`${r.sha256}\` |`);
lines.push("");
await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
await fs.writeFile(output,lines.join("\n"));
const summary={revision:[...revisions][0],groups,soaks:residency.map(({file,sha256,report})=>({file,sha256,...Object.fromEntries(Object.entries(report).filter(([key])=>key!=="samples"))})),artifacts:reports.map(({file,sha256})=>({file,sha256}))};
await fs.writeFile(output.replace(/\.md$/,".json"),JSON.stringify(summary,null,2)+"\n");
console.log(`Summarized ${benchmarks.length} benchmark and ${residency.length} residency reports: ${output}`);
