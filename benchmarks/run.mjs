import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn, execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const home=path.resolve(import.meta.dirname,"..");
const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ra-parity-bench-"));
const data={revision:process.env.BENCH_REV||"working-tree",platform:process.platform,arch:process.arch,node:process.version,rounds:[],soak:[],notes:"local JSONL IPC including serialization; no Cloudflare Relay. Profiles explicitly controlled. p99 samples are limited."};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stats=x=>{const a=[...x].sort((a,b)=>a-b),pos=p=>+(a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]||0).toFixed(3);return {n:a.length,mean_ms:+(a.reduce((n,v)=>n+v,0)/a.length).toFixed(3),p50_ms:pos(.5),p95_ms:pos(.95),p99_ms:pos(.99)}};
const measure=(pid,field)=>{try{return execFileSync("ps",["-p",String(pid),"-o",field+"="],{encoding:"utf8"}).trim()}catch{return ""}};
async function launch(engine,mode){
 const cmd=engine==="Go"?path.join(home,"benchmarks/.bin/go-core"):process.execPath;
 const args=engine==="Go"?[]:[path.join(home,"benchmarks/.bin/ts-core.mjs")];
 const suffix=engine+"-"+mode,undo=path.join(temp,"undo-"+suffix);
 await fs.mkdir(undo,{recursive:true});
 const begin=performance.now();
 const child=spawn(cmd,args,{stdio:["pipe","pipe","pipe"],env:{...process.env,REMOTEARC_FILE_DURABILITY:mode,REMOTEARC_UNDO_ROOT:undo}});
 let next=0,err="",pending=new Map();
 child.stderr.on("data",b=>err+=String(b).slice(0,1500));
 readline.createInterface({input:child.stdout,crlfDelay:Infinity}).on("line",line=>{
   try{const obj=JSON.parse(line),p=pending.get(obj.id);if(!p)return;pending.delete(obj.id);p.resolve(obj);}
   catch(e){err+=" malformed output "+line.slice(0,200);}
 });
 child.on("close",()=>{for(const p of pending.values())p.reject(Error("worker closed "+err));pending.clear()});
 child.on("error",e=>{err+=String(e);});
 async function call(tool,args={},policy={}){
  const id=++next,start=performance.now();
  const answer=await new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    child.stdin.write(JSON.stringify({id,tool,args,policy})+"\n",e=>{if(e){pending.delete(id);reject(e)}});
  });
  return { ...answer,ms:performance.now()-start };
 }
 const probe=path.join(temp,"probe-"+suffix+".txt");
 await fs.writeFile(probe,"OK");
 const h=await call("get_file_info",{path:probe});
 if(!h.ok)throw Error("handshake "+suffix+" "+JSON.stringify(h));
 return {engine,mode,child,call,startup_ms:+(performance.now()-begin).toFixed(1),close:async()=>{
   child.stdin.end();
   await Promise.race([new Promise(r=>child.once("close",r)),sleep(1200)]);
   if(child.exitCode===null){child.kill("SIGTERM");await sleep(100);}
 }};
}
async function suite(w){
 const dir=path.join(temp,w.engine+"-"+w.mode),pathTxt=path.join(dir,"text.txt"),bin=path.join(dir,"bin.dat"),target=path.join(dir,"edit.txt");
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(pathTxt,"sample line\n".repeat(80));
 await fs.writeFile(bin,Buffer.alloc(160000,0x42));
 for(let j=0;j<32;j++)await fs.writeFile(path.join(dir,"directory-"+j+".txt"),"A");
 await fs.writeFile(path.join(dir,".env"),"BENCH_ONLY=1");
 const policy={workspaceRoots:[dir],sensitivePaths:[],protectSensitivePaths:true,undoEnabled:true};
 const series={};
 async function checked(name,args,pred=()=>true){
   const x=await w.call(name,args,policy);
   if(!x.ok||!pred(x.value))throw Error(w.engine+"/"+w.mode+" "+name+": "+JSON.stringify(x).slice(0,300));
   (series[name]??=[]).push(x.ms);
   return x.value;
 }
 for(let i=0;i<20;i++)await checked("read_file",{path:pathTxt,offset:0,length:40});
 for(let i=0;i<160;i++)await checked("read_file",{path:pathTxt,offset:0,length:40});
 for(let i=0;i<160;i++)await checked("get_file_info",{path:pathTxt},v=>v.type==="file");
 for(let i=0;i<80;i++)await checked("list_directory",{path:dir,depth:1});
 for(let i=0;i<120;i++)await checked("read_binary_file",{path:bin,offset:0,length:65536},v=>v.bytes_read===65536);
 for(let i=0;i<48;i++){
  const content="pre_"+i+" "+"X".repeat(120)+"\n";
  await checked("write_file",{path:target,content,mode:"rewrite"},v=>v.atomic===true);
  await checked("edit_block",{file_path:target,old_string:"pre_"+i,new_string:"post_"+i},v=>v.replacements===1);
  await checked("undo_last_change",{},v=>v.restored===true);
  if(await fs.readFile(target,"utf8")!==content)throw Error("Undo mismatch");
 }
 for(let i=0;i<12;i++)await checked("start_process",{command:"printf core-ok",cwd:dir,timeout_ms:3000},v=>v.exit_code===0&&v.stdout==="core-ok");
 let denials=0;
 for(let i=0;i<16;i++){
  const x=await w.call("write_file",{path:path.join(temp,"outside"),content:"NOT_ALLOWED"},policy);
  if(x.ok)throw Error("out-of-workspace write was allowed");
  denials++;
 }
 const concurrency={};
 for(const count of [1,8,32]){
  const latency=[],total=192,start=performance.now();
  for(let i=0;i<total;i+=count) {
   const result=await Promise.all(Array.from({length:Math.min(count,total-i)},()=>w.call("read_file",{path:pathTxt,offset:0,length:40},policy)));
   for(const x of result){if(!x.ok||!String(x.value).includes("sample"))throw Error("parallel read wrong");latency.push(x.ms)}
  }
  const seconds=(performance.now()-start)/1000;
  concurrency[count]={...stats(latency),throughput_rps:+(total/seconds).toFixed(1)};
 }
 const result={engine:w.engine,mode:w.mode,startup_ms:w.startup_ms,denials,
   rss_mb:+(Number(measure(w.child.pid,"rss"))/1024).toFixed(2),
   cpu_time:measure(w.child.pid,"time"),
   metrics:Object.fromEntries(Object.entries(series).map(([key,v])=>[key,stats(v)])),
   concurrency};
 data.rounds.push(result);
 console.log("ROUND "+w.engine+" "+w.mode+" "+JSON.stringify({write:result.metrics.write_file.p50_ms,read:result.metrics.read_file.p50_ms,undo:result.metrics.undo_last_change.p50_ms,rss:result.rss_mb,rps32:concurrency[32].throughput_rps}));
}
const workers=[];
try{
 for(const mode of ["atomic","durable"]) {
   const a=await launch("TS",mode),b=await launch("Go",mode);
   workers.push(a,b);
   for(const w of mode==="atomic"?[a,b]:[b,a])await suite(w);
   if(mode==="atomic"){await a.close();await b.close();}
 }
 const alive=workers.filter(w=>w.mode==="durable");
 for(const at of [0,15000,30000,45000]){
   if(at)await sleep(15000);
   data.soak.push({elapsed_ms:at,devices:alive.map(w=>({
     engine:w.engine,rss_mb:+(Number(measure(w.child.pid,"rss"))/1024).toFixed(2),
     cpu_time:measure(w.child.pid,"time"),
     alive:w.child.exitCode===null
   }))});
 }
 for(const w of alive)await w.close();
 data.ok=true;
 const outfile=path.join(os.homedir(),"Work","remote-arc-abcd-benchmark.json");
 await fs.writeFile(outfile,JSON.stringify(data,null,2));
 console.log("BENCHMARK_OK rounds="+data.rounds.length+" soak_ms=45000 result="+outfile);
} catch(e){data.ok=false;console.error("BENCHMARK_FAILED",e.stack||String(e));process.exitCode=1}
finally{for(const w of workers)await w.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true})}
