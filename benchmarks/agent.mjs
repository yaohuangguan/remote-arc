import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {fixture,waitFor,pause} from "../scripts/go-device-fixture.mjs";
import {root,option,integerOption,profile,stats,processMetrics,saveReport,quote,environmentInfo} from "./lib.mjs";

const samples=integerOption("--samples",200,20,10000), rounds=integerOption("--rounds",3,1,20);
const modes=option("--profiles","atomic,durable,layered").split(",");
for(const mode of modes)profile(mode);
const reportPath=path.resolve(option("--report",path.join(root,"work/benchmarks/agent.json")));
const report={layer:"L2",state:"running",...await environmentInfo(),startedAt:new Date().toISOString(),samples,rounds:[],scope:"Full isolated TS/Go foreground Agents with authenticated loopback WebSockets, local journal, config and dispatch. Includes wire serialization; excludes production Cloudflare/connector. Go Agent critical-state writes stay durable; TS Agent config keeps its legacy atomic writes. Forced reconnect counts distinct accepted sockets, not periodic hello messages. Windows TS fixture termination is not a graceful-stop acceptance test."};
try {
 for(let round=1;round<=rounds;round++)for(const mode of modes)for(const engine of round%2?["TS","Go"]:["Go","TS"]){
  const f=await fixture({engine,environment:profile(mode)});
  let managed;
  try {
   const began=performance.now(),owner=f.start(["--foreground"]);
   await waitFor(()=>f.handshakes.length,"agent ready");
   const initial=f.handshakes[0].device,startup=performance.now()-began;
   assert.equal(initial.pid,owner.child.pid);
   const file=path.join(f.home,"hello.txt"),target=path.join(f.home,"edit.txt"),helper=path.join(f.home,"helper.cjs");
   await fs.writeFile(file,"agent-benchmark\n".repeat(240));await fs.writeFile(target,"original");
   await fs.writeFile(helper,"console.log('MANAGED_READY');setInterval(()=>{},1000)");
   const policy={workspaceRoots:[f.home]},metrics={},concurrency={};
   const timed=async(tool,args={},record=true)=>{
    const begin=performance.now();const value=await f.call(tool,args,policy);
    if(record)(metrics[tool]??=[]).push(performance.now()-begin);return value;
   };
   for(let i=0;i<10;i++)await timed("read_file",{path:file,length:240},false);
   const mutation=async(i,record=true)=>{
    assert.equal((await timed("write_file",{path:target,content:"written"+i},record)).undo_available,true);
    await timed("edit_block",{file_path:target,old_string:"written",new_string:"edited"},record);
    assert.equal((await timed("undo_last_change",{},record)).restored,true);assert.equal(await fs.readFile(target,"utf8"),"written"+i);
    await timed("undo_last_change",{},false);assert.equal(await fs.readFile(target,"utf8"),"original");
   };
   for(let i=0;i<5;i++)await mutation(i,false);
   const before=await processMetrics(initial.pid);
   for(let i=0;i<samples;i++){assert.match(await timed("read_file",{path:file,length:240}),/agent-benchmark/);await timed("get_file_info",{path:file});}
   for(let i=0;i<samples;i++)await mutation(i);
   for(const count of [1,8,32]){
    const values=[],total=Math.max(1024,samples*4),begin=performance.now();
    for(let i=0;i<total;i+=count)await Promise.all(Array.from({length:Math.min(count,total-i)},async()=>{const start=performance.now();assert.match(await f.call("read_file",{path:file,length:240},policy),/agent-benchmark/);values.push(performance.now()-start);}));
    concurrency[count]={...stats(values),throughput_rps:total/((performance.now()-begin)/1000),samples_ms:values};
   }
   const after=await processMetrics(initial.pid);
   managed=await f.call("start_process",{command:quote(process.execPath)+" "+quote(helper),cwd:f.home,background:true,max_duration_seconds:30},policy);
   await waitFor(async()=> (await f.call("process_output",{process_id:managed.process_id})).stdout.includes("MANAGED_READY"),"process stdout");
   await f.call("stop_process",{process_id:managed.process_id});
   await waitFor(async()=> (await f.call("process_status",{process_id:managed.process_id})).status === "exited","process exit");managed=undefined;
   const beforeHandshake=f.handshakes.length,reconnectBegin=performance.now();
   f.setOffline(true);await pause(2000);f.setOffline(false);
   await waitFor(()=>f.handshakes.length>beforeHandshake,"real fixture WebSocket handshake");
   const current=f.handshakes.at(-1).device;
   assert.equal(current.id,initial.id);assert.equal(current.pid,initial.pid);assert.equal(current.backgroundProcess,false);
   if(engine === "Go"){assert(current.connectionSequence>initial.connectionSequence);assert.notEqual(current.connectedAt,initial.connectedAt);}
   assert.match(await f.call("read_file",{path:file},policy),/agent-benchmark/);
   const log=await f.call("agent_execution_log",{limit:20});assert(!JSON.stringify(log).includes(f.token));assert(log.lines.some(line=>line.includes("tool.done")));
   report.rounds.push({engine,mode,round,startup_ms:startup,pid:initial.pid,errors:0,cpu_delta_ms:after.cpuMs-before.cpuMs,rss_mb:after.rssBytes/1048576,reconnect_ms:performance.now()-reconnectBegin,handshakes:f.handshakes.length,metrics:Object.fromEntries(Object.entries(metrics).map(([name,values])=>[name,{...stats(values),samples_ms:values}])),concurrency});
   await saveReport(reportPath,report);
   console.log(`L2 ${round} ${engine} ${mode}: passed ${samples} mutations and reconnect`);
  } finally {if(managed)await f.call("stop_process",{process_id:managed.process_id}).catch(()=>{});await f.close();}
 }
 report.state="passed";
} catch(error){report.state="failed";report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;}
finally {report.finishedAt=new Date().toISOString();await saveReport(reportPath,report);}
console.log(`L2 ${report.state}: ${reportPath}`);
