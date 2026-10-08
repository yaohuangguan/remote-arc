import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import {spawn} from "node:child_process";
import {performance} from "node:perf_hooks";
import {root, option, integerOption, stats, profile, processMetrics, saveReport, sleep, quote, environmentInfo} from "./lib.mjs";

const samples = integerOption("--samples", 200, 20, 10000);
const rounds = integerOption("--rounds", 3, 1, 20);
const modes = option("--profiles", "atomic,durable,layered").split(",");
for (const mode of modes) profile(mode);
const outfile = path.resolve(option("--report", path.join(root,"work/benchmarks/core.json")));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ra-parity-bench-"));
const data = {layer:"L1", state:"running", ...await environmentInfo(), startedAt:new Date().toISOString(), samples, requestedRounds:rounds, rounds:[], notes:"Local core JSONL IPC; includes serialization, excludes Relay and full Agent. Warmup excluded. Engines run serially; order alternates. Atomic/durable/layered set both file and Undo policies explicitly. Windows parent-directory sync unavailable. P99 is exploratory at small sample counts."};
const workers = [];
async function launch(engine, mode, round) {
  const suffix = `${engine}-${mode}-${round}`, undo = path.join(temp,"undo-"+suffix);
  await fs.mkdir(undo,{recursive:true});
  const begin = performance.now();
  const child = spawn(engine === "Go" ? path.join(root,"benchmarks/.bin/go-core"+(process.platform === "win32" ? ".exe" : "")) : process.execPath, engine === "Go" ? [] : [path.join(root,"benchmarks/.bin/ts-core.mjs")], {windowsHide:true, stdio:["pipe","pipe","pipe"], env:{...process.env,...profile(mode),HOME:temp,USERPROFILE:temp,REMOTEARC_UNDO_ROOT:undo,REMOTEARC_HOME:temp}});
  let next = 0, stderr = "", exited = false;
  const pending = new Map();
  const closed = new Promise(resolve => child.once("close", () => {exited=true; resolve();}));
  const rejectAll = error => {for (const p of pending.values()) p.reject(error); pending.clear();};
  child.stderr.on("data", b => {stderr=(stderr+String(b)).slice(-4000);});
  child.on("error", rejectAll);
  child.on("close", () => rejectAll(new Error("Worker closed: "+stderr)));
  readline.createInterface({input:child.stdout,crlfDelay:Infinity}).on("line", line => {
    try {const value=JSON.parse(line), p=pending.get(value.id); if(p){pending.delete(value.id);p.resolve(value);}}
    catch {rejectAll(new Error("Malformed worker output"));}
  });
  const call = async (tool,args={},policy={}) => {
    if (exited) throw new Error("Worker exited");
    const id=++next, start=performance.now();
    const answer=await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(tool+" timed out"));},15000);
      pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
      child.stdin.write(JSON.stringify({id,tool,args,policy})+"\n",error=>{if(error){const p=pending.get(id);pending.delete(id);p?.reject(error);}});
    });
    return {...answer,ms:performance.now()-start};
  };
  const worker={engine,mode,round,child,call,close:async()=>{if(exited)return; child.stdin.end(); await Promise.race([closed,sleep(1500)]); if(!exited){child.kill("SIGTERM");await closed;}}};
  workers.push(worker);
  const probe=path.join(temp,"probe-"+suffix); await fs.writeFile(probe,"OK");
  if(!(await call("get_file_info",{path:probe})).ok)throw new Error("Worker handshake failed");
  worker.startup_ms=performance.now()-begin;
  return worker;
}
async function suite(w) {
  const dir=path.join(temp,`${w.engine}-${w.mode}-${w.round}`), text=path.join(dir,"text.txt"), bin=path.join(dir,"binary.dat"), target=path.join(dir,"edit.txt");
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(text,"sample line\n".repeat(240)); await fs.writeFile(bin,Buffer.alloc(160000,0x42));
  await fs.writeFile(target,"original");
  for(let i=0;i<32;i++)await fs.writeFile(path.join(dir,"entry-"+i),"A");
  const helper=path.join(dir,"helper.cjs"); await fs.writeFile(helper,"process.stdout.write('core-ok')");
  const policy={workspaceRoots:[dir],sensitivePaths:[],protectSensitivePaths:true,undoEnabled:true}, series={};
  let errors=0,denials=0;
  const checked=async(name,args,predicate=()=>true,record=true)=>{
    const x=await w.call(name,args,policy);
    if(!x.ok||!predicate(x.value)){errors++;throw new Error(`${w.engine}/${w.mode} ${name}: ${JSON.stringify(x).slice(0,400)}`);}
    if(record)(series[name]??=[]).push(x.ms);
    return x.value;
  };
  // Warm reads and writes without counting them or growing the Undo store.
  for(let i=0;i<10;i++)await checked("read_file",{path:text,length:240},()=>true,false);
  const mutation=async(i,record)=>{
    const content="pre_"+i+" "+"X".repeat(4000)+"\n";
    await checked("write_file",{path:target,content},v=>v.atomic===true&&v.undo_available===true,record);
    await checked("edit_block",{file_path:target,old_string:"pre_"+i,new_string:"post_"+i},v=>v.replacements===1,record);
    await checked("undo_last_change",{},v=>v.restored===true,record);
    if(await fs.readFile(target,"utf8")!==content)throw new Error("Undo content mismatch");
    await checked("undo_last_change",{},v=>v.restored===true,false);
    if(await fs.readFile(target,"utf8")!=="original")throw new Error("Write cleanup Undo mismatch");
  };
  for(let i=0;i<5;i++)await mutation(i,false);
  const before=await processMetrics(w.child.pid);
  for(let i=0;i<samples;i++)await checked("read_file",{path:text,length:240},v=>String(v).includes("sample"));
  for(let i=0;i<samples;i++)await checked("get_file_info",{path:text},v=>v.type==="file");
  for(let i=0;i<samples;i++)await checked("list_directory",{path:dir,depth:1});
  for(let i=0;i<samples;i++)await checked("read_binary_file",{path:bin,offset:0,length:65536},v=>v.bytes_read===65536);
  for(let i=0;i<samples;i++)await mutation(i,true);
  for(let i=0;i<20;i++)await checked("start_process",{command:quote(process.execPath)+" "+quote(helper),cwd:dir,timeout_ms:5000},v=>v.exit_code===0&&v.stdout==="core-ok");
  for(let i=0;i<16;i++){if((await w.call("write_file",{path:path.join(temp,"outside"),content:"NOT_ALLOWED"},policy)).ok)throw new Error("Outside write allowed");denials++;}
  const concurrency={};
  for(const count of [1,8,32]){
    const values=[], total=Math.max(1024,samples*4),begin=performance.now();
    for(let i=0;i<total;i+=count){
      const batch=await Promise.all(Array.from({length:Math.min(count,total-i)},()=>w.call("read_file",{path:text,length:240},policy)));
      for(const x of batch){if(!x.ok||!String(x.value).includes("sample"))throw new Error("Concurrent read failed");values.push(x.ms);}
    }
    concurrency[count]={...stats(values),throughput_rps:total/((performance.now()-begin)/1000),samples_ms:values};
  }
  const after=await processMetrics(w.child.pid);
  const result={engine:w.engine,mode:w.mode,round:w.round,startup_ms:w.startup_ms,errors,denials,rss_mb:after.rssBytes/1048576,cpu_delta_ms:after.cpuMs-before.cpuMs,metrics:Object.fromEntries(Object.entries(series).map(([name,values])=>[name,{...stats(values),samples_ms:values}])),concurrency};
  data.rounds.push(result);await saveReport(outfile,data);
  console.log(`ROUND ${w.round} ${w.engine} ${w.mode} `+JSON.stringify({write:result.metrics.write_file.p50_ms,undo:result.metrics.undo_last_change.p50_ms,rss:result.rss_mb,rps32:concurrency[32].throughput_rps}));
}
try {
  for(let round=1;round<=rounds;round++)for(const mode of modes)for(const engine of round%2?["TS","Go"]:["Go","TS"]){
    const worker=await launch(engine,mode,round); await suite(worker);await worker.close();
  }
  data.state="passed";
} catch(error){data.state="failed";data.error=error.stack||String(error);console.error(data.error);process.exitCode=1;}
finally {for(const w of workers)await w.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});data.finishedAt=new Date().toISOString();await saveReport(outfile,data);}
console.log(`L1 ${data.state}: ${outfile}`);
