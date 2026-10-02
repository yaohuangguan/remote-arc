import os from "node:os";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "../../agent/node_modules/ws/wrapper.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,"../../..");
const persist=fs.mkdtempSync(path.join(os.tmpdir(),"ra-auto-e2e-"));
const wranglerCli=path.join(repo,"apps/relay/node_modules/wrangler/bin/wrangler.js");
const relayDir=path.join(repo,"apps/relay");
const removePersist=()=>{if(path.dirname(persist)!==os.tmpdir()||!path.basename(persist).startsWith("ra-auto-e2e-"))throw new Error("Invalid cleanup path");fs.rmSync(persist,{recursive:true,force:true});};
const base="http://127.0.0.1:8789";
const password="automation-e2e";
const email="automation-e2e@example.com";
const passHash=createHash("sha256").update(password).digest("hex");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw new Error("ASSERT: "+m)};
const mockBase="http://127.0.0.1:8792";
let plannerCalls=0;
let githubMergeCalls=0;
const plannerDecisions=[
  {decision:"tool",tool:"read_file",arguments_json:JSON.stringify({path:"/workspace/src/app.ts",offset:0,length:120}),decision_summary:"Inspect the failing implementation before changing it.",memory:"Need inspect src/app.ts.",completion_evidence:""},
  {decision:"tool",tool:"edit_block",arguments_json:JSON.stringify({file_path:"/workspace/src/app.ts",old_string:"return 1","new_string":"return 2",expected_replacements:1}),decision_summary:"Apply the first targeted fix suggested by the implementation.",memory:"Changed return value; run tests next.",completion_evidence:""},
  {decision:"tool",tool:"start_process",arguments_json:JSON.stringify({command:"agent-test-1",cwd:"/workspace"}),decision_summary:"Run the focused test after the first fix.",memory:"First fix applied; waiting for focused test.",completion_evidence:""},
  {decision:"tool",tool:"edit_block",arguments_json:JSON.stringify({file_path:"/workspace/src/app.ts",old_string:"return 2","new_string":"return 3",expected_replacements:1}),decision_summary:"The test output shows the first fix was insufficient; adjust the implementation.",memory:"First test failed; second targeted change applied.",completion_evidence:""},
  {decision:"tool",tool:"start_process",arguments_json:JSON.stringify({command:"agent-test-2",cwd:"/workspace"}),decision_summary:"Re-run the focused test after adapting the fix.",memory:"Second change applied; verify tests.",completion_evidence:""},
  {decision:"complete",tool:"none",arguments_json:"{}",decision_summary:"Focused tests now pass; request deterministic final verification.",memory:"Implementation adapted after one failed attempt and focused tests pass.",completion_evidence:"agent-test-2 exited 0 with tests passing."},
];
const mockServer=http.createServer(async(req,res)=>{
  const url=new URL(req.url,mockBase);
  if(req.method==="POST"&&url.pathname==="/responses"){
    let body="";for await(const chunk of req)body+=chunk;
    JSON.parse(body||"{}");
    const decision=plannerDecisions[Math.min(plannerCalls,plannerDecisions.length-1)];
    plannerCalls++;
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({id:"resp_e2e_"+plannerCalls,status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(decision)}]}]}));
    return;
  }
  if(req.method==="POST"&&/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)){
    assert(String(req.headers.authorization||"").startsWith("Bearer "),"GitHub App JWT missing");
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({token:"ghs_e2e_installation_token",expires_at:new Date(Date.now()+3600000).toISOString()}));
    return;
  }
  if(req.method==="PUT"&&url.pathname==="/repos/yaohuangguan/remote-arc/pulls/77/merge"){
    assert(req.headers.authorization==="Bearer ghs_e2e_installation_token","GitHub installation token missing");
    githubMergeCalls++;
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({sha:"abc1234",merged:true,message:"Pull Request successfully merged"}));
    return;
  }
  res.statusCode=404;res.end("not found");
});
await new Promise(r=>mockServer.listen(8792,"127.0.0.1",r));
const {privateKey}=generateKeyPairSync("rsa",{
  modulusLength:2048,
  publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"},
});

const baseConfig=JSON.parse(fs.readFileSync(repo+"/apps/relay/wrangler.jsonc","utf8"));
baseConfig.routes=[];
delete baseConfig.ai;
baseConfig.vars={...(baseConfig.vars||{}),OPENAI_API_KEY:"e2e-key",AGENT_MODEL_BASE_URL:mockBase,AGENT_MODEL:"gpt-5.6-luna",GITHUB_APP_ID:"12345",GITHUB_APP_PRIVATE_KEY:privateKey,GITHUB_APP_INSTALLATION_ID:"67890",GITHUB_API_BASE_URL:mockBase};
if(baseConfig.assets&&Array.isArray(baseConfig.assets.run_worker_first)&&!baseConfig.assets.run_worker_first.includes("/__scheduled"))baseConfig.assets.run_worker_first.push("/__scheduled");
const e2eConfig=repo+"/apps/relay/wrangler.e2e.json";
fs.writeFileSync(e2eConfig,JSON.stringify(baseConfig,null,2));

removePersist();
let r=spawnSync(process.execPath,[wranglerCli,"d1","migrations","apply","remote-link-auth","--local","--persist-to",persist],{cwd:relayDir,encoding:"utf8"});
if(r.status!==0)throw new Error("migration failed\n"+r.stdout+"\n"+r.stderr);

const args=[wranglerCli,"dev","--config","wrangler.e2e.json","--local","--persist-to",persist,"--port","8789","--test-scheduled",
  "--var","PUBLIC_ORIGIN:"+base,"--var","APP_ORIGIN:"+base,"--var","MARKETING_ORIGIN:"+base,
  "--var","REVIEWER_EMAIL:"+email,"--var","REVIEWER_PASSWORD_SHA256:"+passHash,"--var","REVIEWER_DEMO_DEVICE_ID:review-e2e"];
const worker=spawn(process.execPath,args,{cwd:relayDir,env:process.env,stdio:["ignore","pipe","pipe"]});
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

  const tools=["list_directory","read_file","get_file_info","write_file","edit_block","list_processes","start_process","process_status","process_output","stop_process"];
  const updateTools=await fetch(base+"/api/devices/"+deviceId+"/tools",{method:"POST",headers:authHeaders,body:JSON.stringify({allowed_tools:tools})});
  assert(updateTools.ok,"tools update "+updateTools.status+" "+await updateTools.text());

  let verifyStarts=0; let processSeq=0; let lostHandleInjected=false;
  const processes=new Map();
  let socket=new WebSocket(base.replace("http","ws")+"/agent",{headers:{Authorization:"Bearer "+tokenBody.device_token}});
  const attachSocket=ws=>{
    ws.on("open",()=>ws.send(JSON.stringify({type:"hello",device:{id:deviceId,name:"Automation Fake Mac",platform:"darwin",arch:"arm64",hostname:"automation-fake",agentVersion:"e2e",connectedAt:new Date().toISOString()},tools,capabilities:["native_core_v1","device_policy_v1","undo_history_v1"]})));
    ws.on("message",raw=>{
      const m=JSON.parse(raw.toString()); if(m.type!=="call")return;
      try {
        if(m.tool==="read_file"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{path:String(m.arguments.path),content:"export function value(){ return 1 }",offset:0,length:1,total_lines:1}}));
        } else if(m.tool==="list_directory"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{path:String(m.arguments.path),entries:[{name:"src",type:"directory"}]}}));
        } else if(m.tool==="get_file_info"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{path:String(m.arguments.path),type:"file",size:38}}));
        } else if(m.tool==="write_file"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{path:String(m.arguments.path),bytes:String(m.arguments.content||"").length,written:true}}));
        } else if(m.tool==="edit_block"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{path:String(m.arguments.file_path),replacements:1,undo_available:true}}));
        } else if(m.tool==="start_process"){
          const id="p"+(++processSeq); const command=String(m.arguments.command||"");
          if(command==="verify-goal")verifyStarts++;
          processes.set(id,{command,statusChecks:0,verifyAttempt:verifyStarts});
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:id,pid:1000+processSeq,command,status:"running",started_at:new Date().toISOString()}}));
        } else if(m.tool==="process_status"){
          const proc=processes.get(String(m.arguments.process_id)); if(!proc)throw new Error("Managed process not found");
          if(proc.command==="lost-handle"&&!lostHandleInjected){lostHandleInjected=true;processes.delete(String(m.arguments.process_id));throw new Error("Managed process not found");}
          proc.statusChecks++; let exit=0; let running=false;
          if(proc.command==="long-task"&&proc.statusChecks===1)running=true;
          if(proc.command==="verify-goal"&&proc.verifyAttempt===1)exit=1;
          if(proc.command==="agent-test-1")exit=1;
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:running?"running":"exited",exit_code:running?null:exit,started_at:new Date().toISOString(),ended_at:running?null:new Date().toISOString()}}));
        } else if(m.tool==="stop_process"){
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:"exited",exit_code:0,stopped:true}}));
        } else if(m.tool==="process_output"){
          const proc=processes.get(String(m.arguments.process_id));
          const stdout=proc?.command==="agent-test-1"
            ?"FAIL expected 2 but got 1"
            :proc?.command==="agent-test-2"
              ?"PASS focused tests"
              :proc?.command==="verify-agent"
                ?"PASS typecheck and full test suite"
                :"fake output";
          ws.send(JSON.stringify({type:"result",id:m.id,result:{process_id:String(m.arguments.process_id),status:"exited",exit_code:proc?.command==="agent-test-1"?1:0,stdout,stderr:""}}));
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

  // Unattended recovery: a lost local process handle automatically restarts instead of waiting for approval.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E unattended recovery",kind:"long_task",device_id:deviceId,command:"lost-handle",interval_seconds:60})});
  const recoveryId=created.automation.id;
  await tick(); row=await get(recoveryId); assert(row.status==="running","recovery task starts "+row.status);
  await poke(recoveryId); await tick(); row=await get(recoveryId); assert(row.status==="waiting","lost handle schedules automatic restart "+JSON.stringify(row));
  await poke(recoveryId); await tick(); row=await get(recoveryId); assert(row.status==="running","recovery task restarts automatically "+row.status);
  await poke(recoveryId); await tick(); row=await get(recoveryId); assert(row.status==="completed","recovery task completes without approval "+JSON.stringify(row));

  // Goal loop: first verification fails, second attempt succeeds.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E goal",kind:"goal_loop",device_id:deviceId,command:"work-goal",goal:{command:"verify-goal",expected_exit_code:0},interval_seconds:60,max_runs:3})});
  const goalId=created.automation.id;
  await tick();
  for(let i=0;i<5;i++){await poke(goalId);await tick();}
  row=await get(goalId); assert(row.status==="completed"&&row.run_count===2,"goal completes on second attempt "+JSON.stringify(row));

  // Agent Goal: inspect -> edit -> failed test -> rethink -> edit -> pass -> deterministic verify.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({
    name:"E2E adaptive agent",
    kind:"agent_goal",
    device_id:deviceId,
    interval_seconds:60,
    agent_goal:{
      objective:"Make the focused test pass by inspecting and fixing the implementation.",
      success_criteria:"Focused tests pass and deterministic verification succeeds.",
      workspace:"/workspace",
      verify_command:"verify-agent",
      max_iterations:12,
      allowed_tools:["read_file","edit_block","start_process"]
    }
  })});
  const agentId=created.automation.id;
  await tick(); row=await get(agentId); assert(row.status==="running","agent starts first command "+row.status);
  await poke(agentId); await tick(); row=await get(agentId); assert(row.status==="running","agent adapts after failed test "+row.status);
  await poke(agentId); await tick(); row=await get(agentId); assert(row.status==="running","agent starts deterministic verification "+row.status);
  await poke(agentId); await tick(); row=await get(agentId);
  assert(row.status==="completed","agent goal completes "+JSON.stringify(row));
  assert(plannerCalls===6,"agent planner should rethink across six turns, got "+plannerCalls);

  // Permission snapshot: a real security-policy change stops unattended work; it never waits for approval.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E policy stop",kind:"long_task",device_id:deviceId,command:"policy-test",interval_seconds:60})});
  const policyId=created.automation.id;
  await api("/api/devices/"+deviceId+"/tools",{method:"POST",body:JSON.stringify({allowed_tools:["list_processes","start_process","process_status"]})});
  await tick(); row=await get(policyId); assert(row.status==="failed","policy change stops unattended task "+JSON.stringify(row));
  assert(String(row.last_error||"").includes("stopped instead of waiting for approval"),"policy stop should explain no approval queue");
  await api("/api/devices/"+deviceId+"/tools",{method:"POST",body:JSON.stringify({allowed_tools:tools})});

  // Condition watch: mismatch ignored, match triggers.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E CI",kind:"condition_watch",device_id:deviceId,command:"condition-action",condition:{source:"github",event:"workflow_run",match:{action:"completed","workflow_run.conclusion":"success"}},max_runs:1,interval_seconds:60})});
  const ciId=created.automation.id; const hook=created.webhook.url;
  let hookRes=await fetch(hook,{method:"POST",headers:{"content-type":"application/json","x-github-event":"workflow_run","x-github-delivery":"bad-1"},body:JSON.stringify({action:"completed",workflow_run:{conclusion:"failure"}})});
  assert(hookRes.status===202,"mismatch webhook response"); row=await get(ciId); assert(row.status==="waiting_for_event","mismatch does not trigger "+row.status);
  hookRes=await fetch(hook,{method:"POST",headers:{"content-type":"application/json","x-github-event":"workflow_run","x-github-delivery":"good-1"},body:JSON.stringify({action:"completed",workflow_run:{conclusion:"success"}})});
  assert(hookRes.status===202,"matching webhook response"); row=await get(ciId); assert(row.status==="waiting","match arms task "+row.status);
  await tick(); row=await get(ciId); assert(row.status==="running","condition starts "+row.status);
  await poke(ciId); await tick(); row=await get(ciId); assert(row.status==="completed","condition completes "+row.status);

  assert(/^[a-f0-9-]{36}$/.test(deviceId),"safe SQL fixture device ID");
  const permission=spawnSync(process.execPath,[wranglerCli,"d1","execute","remote-link-auth","--local","--persist-to",persist,"--command",
    "INSERT INTO github_automation_permissions(user_id,installation_id,owner,repo,created_at) SELECT user_id,'67890','yaohuangguan','remote-arc',datetime('now') FROM devices WHERE id='"+deviceId+"'"],{cwd:relayDir,encoding:"utf8"});
  assert(permission.status===0,"local test permission setup "+permission.stderr);

  // Native GitHub action: CI webhook success -> cloud-side PR merge, no device command.
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({
    name:"E2E merge after CI",
    kind:"condition_watch",
    github_merge:{owner:"yaohuangguan",repo:"remote-arc",pull_number:77,merge_method:"merge"},
    condition:{source:"github",event:"workflow_run",match:{action:"completed","workflow_run.conclusion":"success"}},
    max_runs:1,
    interval_seconds:60
  })});
  const mergeId=created.automation.id;
  const mergeHook=created.webhook.url;
  hookRes=await fetch(mergeHook,{method:"POST",headers:{"content-type":"application/json","x-github-event":"workflow_run","x-github-delivery":"merge-1"},body:JSON.stringify({action:"completed",workflow_run:{conclusion:"success"}})});
  assert(hookRes.status===202,"GitHub merge webhook response");
  await tick(); row=await get(mergeId);
  assert(row.status==="completed","GitHub cloud merge completes "+row.status);
  assert(githubMergeCalls===1,"GitHub merge API should be called exactly once");

  // Offline task waits instead of failing.
  socket.close(); await sleep(250);
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E offline",kind:"long_task",device_id:deviceId,command:"offline-task",interval_seconds:60})});
  const offlineId=created.automation.id; await tick(); row=await get(offlineId); assert(row.status==="waiting_for_device","offline waits "+row.status);

  const reconnected=new WebSocket(base.replace("http","ws")+"/agent",{headers:{Authorization:"Bearer "+tokenBody.device_token}});
  attachSocket(reconnected);
  await new Promise((ok,fail)=>{reconnected.once("open",()=>setTimeout(ok,150));reconnected.once("error",fail)});
  await poke(offlineId);await tick();row=await get(offlineId);assert(row.status==="running","reconnected task starts "+row.status);
  await poke(offlineId);await tick();row=await get(offlineId);assert(row.status==="completed","reconnected task completes "+row.status);
  // Extend the same Wrangler/D1 + WebSocket device E2E with chat-independent
  // planned execution. This proves relay behavior, not real Chat wakeup.
  await api("/api/devices/"+deviceId+"/task-permissions",{method:"POST",body:JSON.stringify({background_tasks:true,scheduled_tasks:true,adaptive_agent:true,source_agent:true,keep_awake:false})});
  created=await api("/api/automations",{method:"POST",body:JSON.stringify({name:"E2E source planned slices",kind:"agent_goal",device_id:deviceId,interval_seconds:60,agent_goal:{controller:"source",objective:"Execute saved validation phases",success_criteria:"Both checks pass",workspace:"/workspace",allowed_tools:["start_process"],plan:{planning_mode:"fixed",time_policy:{max_duration_seconds:3600,finalization_reserve_seconds:60},phases:[{id:"first",objective:"First check",success_criteria:"First exit zero",execution_slice:[{name:"first",command:"planned-first",timeout_seconds:20}]},{id:"second",objective:"Second check",success_criteria:"Second exit zero",depends_on:["first"],execution_slice:[{name:"second",command:"planned-second",timeout_seconds:20}]}]}}})});
  const plannedId=created.automation.id, turnsBefore=plannerCalls;
  for(let i=0;i<8;i++){row=await get(plannedId);if(row.status==="completed")break;await poke(plannedId);await tick();}
  row=await get(plannedId);assert(row.status==="completed","planned source goal settles "+JSON.stringify(row));
  const plannedState=JSON.parse(row.state_json).planned;
  assert(plannedState.outcomes.length===2&&plannedState.outcomes.every(p=>p.outcome==="completed"),"phases persist accepted outcomes");
  assert(plannedState.report.accepted.length===2,"final phase report stored");
  assert(plannerCalls===turnsBefore,"source mode must not fall back to hosted planner");
  assert([...processes.values()].filter(p=>p.command==="planned-first").length===1,"first slice exactly one acknowledged dispatch");
  assert([...processes.values()].filter(p=>p.command==="planned-second").length===1,"second slice exactly one acknowledged dispatch");
  reconnected.close();

  console.log(JSON.stringify({ok:true,long:"completed",unattended_recovery:"completed_without_approval",goal:{status:"completed",attempts:2},agent_goal:{status:"completed",planner_turns:plannerCalls},policy_change:"failed_without_approval",condition:"completed",github_merge:{status:"completed",api_calls:githubMergeCalls},offline:"reconnected_and_completed",deviceId},null,2));
} finally {
  worker.kill("SIGTERM");
  await sleep(300);
  await new Promise((resolve)=>mockServer.close(resolve));
  fs.rmSync(e2eConfig,{force:true});
  removePersist();
}
