import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../../agent/node_modules/ws/wrapper.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,"../../..");
const persist=path.join(process.env.TMPDIR||"/tmp","ra-auto-e2e-"+process.pid);
const base="http://127.0.0.1:8789";
const password="automation-e2e";
const email="automation-e2e@example.com";
const passHash=createHash("sha256").update(password).digest("hex");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw new Error("ASSERT: "+m)};
const baseConfig=JSON.parse(fs.readFileSync(repo+"/apps/relay/wrangler.jsonc","utf8"));
baseConfig.routes=[];
if(baseConfig.assets&&Array.isArray(baseConfig.assets.run_worker_first)&&!baseConfig.assets.run_worker_first.includes("/__scheduled"))baseConfig.assets.run_worker_first.push("/__scheduled");
const e2eConfig=repo+"/apps/relay/wrangler.e2e.json";
fs.writeFileSync(e2eConfig,JSON.stringify(baseConfig,null,2));

fs.rmSync(persist,{recursive:true,force:true});
let r=spawnSync("pnpm",["--filter","@remotearc/relay","exec","wrangler","d1","migrations","apply","remote-link-auth","--local","--persist-to",persist],{cwd:repo,encoding:"utf8"});
if(r.status!==0)throw new Error("migration failed\n"+r.stdout+"\n"+r.stderr);

const args=["--filter","@remotearc/relay","exec","wrangler","dev","--config","wrangler.e2e.json","--local","--persist-to",persist,"--port","8789","--test-scheduled",
  "--var","PUBLIC_ORIGIN:"+base,"--var","APP_ORIGIN:"+base,"--var","MARKETING_ORIGIN:"+base,
  "--var","REVIEWER_EMAIL:"+email,"--var","REVIEWER_PASSWORD_SHA256:"+passHash,"--var","REVIEWER_DEMO_DEVICE_ID:review-e2e"];
const worker=spawn("pnpm",args,{cwd:repo,env:process.env,stdio:["ignore","pipe","pipe"]});
let workerLog="";
worker.stdout.on("data",d=>workerLog+=d.toString()); worker.stderr.on("data",d=>workerLog+=d.toString());

try {
  let ready=false;
  for(let i=0;i<100;i++){try{const h=await fetch(base+"/health");if(h.ok){ready=true;break}}catch{}await sleep(100)}
  assert(ready,"worker did not start: "+workerLog.slice(-3000));

  const loginBody=new URLSearchParams({email,password,return_to:"/overview"});
  const login=await fetch(base+"/auth/reviewer",{method:"POST",body:loginBody,redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded"}});
  if(login.status!==302){throw new Error("reviewer login "+login.status+" location="+(login.headers.get("location")||"")+" body="+await login.text()+" worker="+workerLog.slice(-1800));}
  const rawCookie=(login.headers.getSetCookie?login.headers.getSetCookie()[0]:login.headers.get("set-cookie"))||"";
  const cookie=rawCookie.split(";")[0];
  assert(cookie.includes("="),"missing session cookie");
  const authHeaders={cookie,"content-type":"application/json"};

  const start=await fetch(base+"/api/device/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_name:"Automation Fake Mac",platform:"darwin",arch:"arm64",hostname:"automation-fake"})});
  const startBody=await start.json(); assert(start.ok,"device start "+JSON.stringify(startBody));
  const approve=await fetch(base+"/api/pairing/approve",{method:"POST",headers:authHeaders,body:JSON.stringify({user_code:startBody.user_code})});
  const approveBody=await approve.json(); assert(approve.ok,"approve "+JSON.stringify(approveBody));
  const deviceId=approveBody.device.id;
  const tokenRes=await fetch(base+"/api/device/token",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_code:startBody.device_code,device_secret:startBody.device_secret})});
  const tokenBody=await tokenRes.json(); assert(tokenRes.ok,"token "+JSON.stringify(tokenBody));

  const tools=["list_processes","start_process","process_status","process_output","stop_process"];
  const updateTools=await fetch(base+"/api/devices/"+deviceId+"/tools",{method:"POST",headers:authHeaders,body:JSON.stringify({allowed_tools:tools})});
  assert(updateTools.ok,"tools update "+updateTools.status+" "+await updateTools.text());

  let verifyStarts=0; let processSeq=0;
  const processes=new Map();
  let socket=new WebSocket(base.replace("http","ws")+"/agent",{headers:{Authorization:"Bearer "+tokenBody.device_token}});
  const attachSocket=ws=>{
    ws.on("open",()=>ws.send(JSON.stringify({type:"hello",device:{id:deviceId,name:"Automation Fake Mac",platform:"darwin",arch:"arm64",hostname:"automation-fake",agentVersion:"e2e",connectedAt:new Date().toISOString()},tools,capabilities:["native_core_v1","device_policy_v1","undo_history_v1"]})));
    ws.on("message",raw=>{
      const m=JSON.parse(raw.toString()); if(m.type!=="call")return;
      try {
        if(m.tool==="start_process"){
          const id="p"+(++processSeq); const command=String(m.arguments.command||"");
          if(command==="verify-goal")verifyStarts++;
          processes.set(id,{command,statusChecks:0,verifyAttempt:verifyStarts});
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:id,pid:1000+processSeq,command,status:"running",started_at:new Date().toISOString()}}));
        } else if(m.tool==="process_status"){
          const proc=processes.get(String(m.arguments.process_id)); if(!proc)throw new Error("Managed process not found");
          proc.statusChecks++; let exit=0; let running=false;
          if(proc.command==="long-task"&&proc.statusChecks===1)running=true;
          if(proc.command==="verify-goal"&&proc.verifyAttempt===1)exit=1;
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:running?"running":"exited",exit_code:running?null:exit,started_at:new Date().toISOString(),ended_at:running?null:new Date().toISOString()}}));
        } else if(m.tool==="stop_process"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:"exited",exit_code:0,stopped:true}}));
        } else if(m.tool==="process_output"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:"exited",exit_code:0,stdout:"fake output",stderr:""}}));
        } else { throw new Error("unsupported "+m.tool); }
      } catch(e){ws.send(JSON.stringify({type:"result",id:m.id,error:String(e.message||e)}));}
    });
  };
  attachSocket(socket);
  await new Promise((ok,fail)=>{socket.once("open",()=>setTimeout(ok,150));socket.once("error",fail)});

  const api=async(path,init={})=>{const res=await fetch(base+path,{...init,headers:{...authHeaders,...(init.headers||{})}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(path+" "+res.status+" "+JSON.stringify(body));return body};
  const tick=async()=>{const res=await fetch(base+"/__scheduled?cron="+encodeURIComponent("* * * * *"));const txt=await res.text();assert(res.ok,"scheduled tick "+res.status+" "+txt);await sleep(650)};
  const poke=async id=>{await api("/api/automations/"+id+"/pause",{method:"POST"});await api("/api/automations/"+id+"/resume",{method:"POST"});};
  const get=async id=>(await api("/api/automations/"+id)).automation;

  // Long task: running -> running -> completed.
  let created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E long",kind:"long_task",device_id:deviceId,command:"long-task",interval_seconds:60})});
  const longId=created.automation.id;
  await tick(); let row=await get(longId); if(row.status!=="running")throw new Error("long starts "+row.status+" worker="+workerLog.slice(-2500));
  await poke(longId); await tick(); row=await get(longId); assert(row.status==="running","long stays running after first poll "+row.status);
  await poke(longId); await tick(); row=await get(longId); assert(row.status==="completed"&&row.run_count===1,"long completes "+JSON.stringify(row));

  // Goal loop: first verification fails, second attempt succeeds.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E goal",kind:"goal_loop",device_id:deviceId,command:"work-goal",goal:{command:"verify-goal",expected_exit_code:0},interval_seconds:60,max_runs:3})});
  const goalId=created.automation.id;
  await tick();
  for(let i=0;i<5;i++){await poke(goalId);await tick();}
  row=await get(goalId); assert(row.status==="completed"&&row.run_count===2,"goal completes on second attempt "+JSON.stringify(row));

  // Permission snapshot: changing policy requires explicit approval.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E approval",kind:"long_task",device_id:deviceId,command:"approval-test",interval_seconds:60})});
  const approvalId=created.automation.id;
  await api("/api/devices/"+deviceId+"/tools",{method:"POST",body:JSON.stringify({allowed_tools:["list_processes","start_process","process_status"]})});
  await tick(); row=await get(approvalId); assert(row.status==="approval_required","permission change pauses "+row.status);
  await api("/api/devices/"+deviceId+"/tools",{method:"POST",body:JSON.stringify({allowed_tools:tools})});
  await api("/api/automations/"+approvalId+"/reapprove",{method:"POST"});

  // Condition watch: mismatch ignored, match triggers.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E CI",kind:"condition_watch",device_id:deviceId,command:"condition-action",condition:{source:"github",event:"workflow_run",match:{action:"completed","workflow_run.conclusion":"success"}},max_runs:1,interval_seconds:60})});
  const ciId=created.automation.id; const hook=created.webhook.url;
  let hookRes=await fetch(hook,{method:"POST",headers:{"content-type":"application/json","x-github-event":"workflow_run","x-github-delivery":"bad-1"},body:JSON.stringify({action:"completed",workflow_run:{conclusion:"failure"}})});
  assert(hookRes.status===202,"mismatch webhook response"); row=await get(ciId); assert(row.status==="waiting_for_event","mismatch does not trigger "+row.status);
  hookRes=await fetch(hook,{method:"POST",headers:{"content-type":"application/json","x-github-event":"workflow_run","x-github-delivery":"good-1"},body:JSON.stringify({action:"completed",workflow_run:{conclusion:"success"}})});
  assert(hookRes.status===202,"matching webhook response"); row=await get(ciId); assert(row.status==="waiting","match arms task "+row.status);
  await tick(); row=await get(ciId); assert(row.status==="running","condition starts "+row.status);
  await poke(ciId); await tick(); row=await get(ciId); assert(row.status==="completed","condition completes "+row.status);

  // Offline task waits instead of failing.
  socket.close(); await sleep(250);
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E offline",kind:"long_task",device_id:deviceId,command:"offline-task",interval_seconds:60})});
  const offlineId=created.automation.id; await tick(); row=await get(offlineId); assert(row.status==="waiting_for_device","offline waits "+row.status);

  console.log(JSON.stringify({ok:true,long:"completed",goal:{status:"completed",attempts:2},permission:"approval_required",condition:"completed",offline:"waiting_for_device",deviceId},null,2));
} finally {
  worker.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(e2eConfig,{force:true});
  fs.rmSync(persist,{recursive:true,force:true});
}