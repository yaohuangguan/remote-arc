import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RemoteArcExecutionCore } from "../src/index.js";
import { createUndoSnapshot, undoChange } from "../src/safety.js";

for (const mode of ["atomic","durable"]) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"ra-ts-durability-"));
 process.env.REMOTEARC_FILE_DURABILITY=mode;
 process.env.REMOTEARC_UNDO_ROOT=path.join(root,"undo");
 const trusted=path.join(root,"trusted"),target=path.join(trusted,"file.txt");
 await fs.mkdir(trusted,{recursive:true});
 await fs.writeFile(target,"alpha");
 const policy={workspaceRoots:[trusted],undoEnabled:true};
 const core=new RemoteArcExecutionCore("full");
 const val=(v: {content:Array<{text:string}>})=>JSON.parse(v.content[0]!.text);
 try {
  assert.equal(val(await core.callTool("edit_block",{file_path:target,old_string:"alpha",new_string:"beta"},policy)).undo_available,true);
  const restarted=new RemoteArcExecutionCore("full");
  assert.equal(val(await restarted.callTool("undo_last_change",{},policy)).restored,true);
  assert.equal(await fs.readFile(target,"utf8"),"alpha");
  await restarted.callTool("write_file",{path:target,content:"updated"},policy);
  await fs.writeFile(target,"external");
  await assert.rejects(()=>restarted.callTool("undo_last_change",{},policy),/changed again/);
  assert.equal(await fs.readFile(target,"utf8"),"external");
  const staged=await createUndoSnapshot("edit_block",{file_path:target});
  assert.ok(staged);
  await fs.writeFile(target,"interrupted mutation");
  await assert.rejects(()=>undoChange(staged.id),/predates conflict-safe/);
  assert.equal(await fs.readFile(target,"utf8"),"interrupted mutation");
  // Concurrent writers must be serialized like the Go mutation mutex.
  process.env.REMOTEARC_UNDO_ROOT=path.join(root,"parallel-undo");
  const concurrent=path.join(trusted,"parallel.txt");
  await fs.writeFile(concurrent,"before");
  const requests=Array.from({length:16},(_,i)=>
   core.callTool("write_file",{path:concurrent,content:"value-"+i},policy));
  await Promise.all(requests);
  assert.equal(await fs.readFile(concurrent,"utf8"),"value-15");
  assert.equal(val(await core.callTool("undo_last_change",{},policy)).restored,true);
  assert.equal(await fs.readFile(concurrent,"utf8"),"value-14");
  await core.close(); await restarted.close();
  console.log(mode+": TS atomic, restart-Undo, conflict and precommit-crash guard passed");
 } finally { await fs.rm(root,{recursive:true,force:true}); }
}
