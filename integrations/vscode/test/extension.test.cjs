'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {launchSpec, launch} = require('../src/launcher.cjs');
const {openFile} = require('../src/command.cjs');
const uri = (fsPath, scheme='file') => ({fsPath,scheme,toString(){return `${this.scheme}:${this.fsPath}`;}});
function host(document, options={}) {
  const records = {saves:0,launches:[]};
  if(document) document.save ||= async()=>{records.saves++;document.isDirty=false;return true;};
  const vscode = {window:{activeTextEditor:document?{document}:undefined},workspace:{
    textDocuments:document?[document]:[],
    save:async resource=>{records.saves++;return options.savedURI;},
    getConfiguration:()=>({inspect:key=>({defaultValue:key==='args'?[]:'',globalValue:options[key],workspaceValue:key==='executablePath'?'/untrusted/attacker':undefined})})
  }};
  const launch=async(file,configuration)=>{records.launches.push({file,configuration});return {pid:123};};
  return {vscode,records,launch};
}

test('paths with spaces, quotes, shell substitutions and Chinese remain single argv entries',()=>{
 const file='/notes/中文 $(touch SHOULD_NOT_EXIST); `id` "quoted".md';
 const spec=launchSpec(file,{executablePath:'/opt/My App/Inkstone',args:['--profile','literal $HOME']},'linux',{ELECTRON_RUN_AS_NODE:'1',KEEP:'yes'});
 assert.equal(spec.executable,'/opt/My App/Inkstone');assert.deepEqual(spec.args,['--profile','literal $HOME',file]);assert.equal(spec.options.shell,false);assert.equal(spec.options.env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(spec.options.env.KEEP,'yes');
});

test('Windows executable and document paths are preserved without shell quoting',()=>{
 const spec=launchSpec('C:\\用户 文档\\note & test.md',{executablePath:'C:\\Program Files\\Inkstone\\Inkstone.exe',args:[]},'win32',{});
 assert.equal(spec.executable,'C:\\Program Files\\Inkstone\\Inkstone.exe');assert.deepEqual(spec.args,['C:\\用户 文档\\note & test.md']);assert.throws(()=>launchSpec('C:\\a.md',{executablePath:'launch.cmd'},'win32',{}),/Inkstone.exe/);
});

test('unsupported platforms and invalid configuration fail before spawn',()=>{
 for(const platform of ['darwin','freebsd']) assert.throws(()=>launchSpec('/a.md',{},platform,{}),/Windows and Linux only/);
 assert.throws(()=>launchSpec('/a.md',{args:'--bad'},'linux',{}),/array/);
 assert.throws(()=>launchSpec('/a.md',{args:['\0']},'linux',{}),/array/);
 assert.throws(()=>launchSpec('relative.md',{},'linux',{}),/absolute/);
 assert.throws(()=>launchSpec('/a.md',{executablePath:'"/bin/app"'},'linux',{}),/quotes/);
});

test('actual child process receives literal hostile-looking path, with no shell side effects',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'inkstone-extension-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const record=path.join(directory,'argv.json'),script=path.join(directory,'record.cjs');
 await fs.writeFile(script,'require("node:fs").writeFileSync(process.argv[2],JSON.stringify(process.argv.slice(3)))');
 const file=path.join(directory,'中文 $(touch INKSTONE-SHOULD-NOT-EXIST); `id` "quote".md');
 const result=await launch(file,{executablePath:process.execPath,args:[script,record]});assert.ok(result.pid>0);
 let observed;for(let attempt=0;attempt<100;attempt++){try{observed=JSON.parse(await fs.readFile(record,'utf8'));break;}catch{await new Promise(resolve=>setTimeout(resolve,20));}}
 assert.deepEqual(observed,[file]);assert.equal(await fs.stat(path.join(directory,'INKSTONE-SHOULD-NOT-EXIST')).catch(()=>null),null);
});

test('opening a dirty local document saves once before launch; workspace executable is ignored',async()=>{
 const document={uri:uri('/notes/中文.md'),languageId:'markdown',isDirty:true};const h=host(document,{executablePath:'/user/Inkstone',args:['--new-window']});
 const result=await openFile(h.vscode,undefined,{launch:h.launch});assert.equal(result.cancelled,false);assert.equal(h.records.saves,1);assert.equal(h.records.launches[0].configuration.executablePath,'/user/Inkstone');assert.equal(document.isDirty,false);
});

test('cancelled/failed dirty save cannot launch stale disk content',async()=>{
 const document={uri:uri('/notes/one.md'),languageId:'markdown',isDirty:true,save:async()=>false};const h=host(document);
 assert.deepEqual(await openFile(h.vscode,undefined,{launch:h.launch}),{cancelled:true});assert.equal(h.records.launches.length,0);
});

test('new edits during save abort launch instead of silently opening an older revision',async()=>{
 const document={uri:uri('/notes/one.md'),languageId:'markdown',isDirty:true,save:async()=>true};const h=host(document);
 await assert.rejects(openFile(h.vscode,undefined,{launch:h.launch}),/changed while saving/);assert.equal(h.records.launches.length,0);
});

test('untitled command uses system Save As result and cancellation performs no launch',async()=>{
 const document={uri:uri('Untitled-1','untitled'),languageId:'markdown',isDirty:true};const saved=host(document,{savedURI:uri('/notes/新文稿.md')});
 await openFile(saved.vscode,undefined,{launch:saved.launch});assert.equal(saved.records.saves,1);assert.equal(saved.records.launches[0].file,'/notes/新文稿.md');
 const cancelled=host(document);assert.deepEqual(await openFile(cancelled.vscode,undefined,{launch:cancelled.launch}),{cancelled:true});assert.equal(cancelled.records.launches.length,0);
});

test('explorer context opens the requested file instead of a different active editor',async()=>{
 const h=host({uri:uri('/notes/active.md'),languageId:'markdown',isDirty:true});
 await openFile(h.vscode,uri('/notes/context.md'),{launch:h.launch});assert.equal(h.records.saves,0);assert.equal(h.records.launches[0].file,'/notes/context.md');
});

test('remote, virtual, absent and non-Markdown documents never spawn',async()=>{
 for(const document of [undefined,{uri:uri('/a.md','vscode-remote'),languageId:'markdown'},{uri:uri('/a.txt'),languageId:'plaintext'}]){
  const h=host(document);await assert.rejects(openFile(h.vscode,undefined,{launch:h.launch}));assert.equal(h.records.launches.length,0);
 }
});

test('missing executable returns a useful error rather than false success',async()=>{
 await assert.rejects(launch('/notes/document.md',{executablePath:path.join(os.tmpdir(),'INKSTONE-NONEXISTENT-EXECUTABLE')}),error=>error.code==='ENOENT');
});

test('manifest exposes user commands and machine-only paths, with no auto activation',()=>{
 const manifest=require('../package.json');assert.deepEqual(manifest.activationEvents,['onCommand:inkstone.openFile']);assert.equal(manifest.contributes.configuration.properties['inkstone.executablePath'].scope,'machine');assert.equal(manifest.contributes.configuration.properties['inkstone.args'].scope,'machine');assert.equal(manifest.contributes.menus['explorer/context'][0].command,'inkstone.openFile');
});


test('unsupported host fails before saving a dirty document or spawning',async()=>{
 const h=host({uri:uri('/notes/a.md'),languageId:'markdown',isDirty:true});
 await assert.rejects(openFile(h.vscode,undefined,{launch:h.launch,platform:'darwin'}),/Windows and Linux only/);
 assert.equal(h.records.saves,0);assert.equal(h.records.launches.length,0);
});
