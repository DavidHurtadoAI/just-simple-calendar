// Capture only the fictional fixtures from qa-scheduling.mjs in @Nexus-dev.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonical=path.resolve(repo,'../../@Nexus-dev');
const {fixture}=JSON.parse(readFileSync(path.join(repo,'qa/scheduling-results.json'),'utf8'));
if(!fixture.startsWith('Pruebas/Just Simple Calendar/Agenda y fechas QA ')||fixture.includes('..'))throw Error('Unexpected fixture');
mkdirSync(path.join(repo,'qa'),{recursive:true});
const output=execFileSync('C:\\Program Files\\Obsidian\\Obsidian.com',['vault=@Nexus-dev','eval','code=(async()=>{'+`
if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');
const folder=${JSON.stringify(fixture)},out=${JSON.stringify(path.join(repo,'qa'))};
const original=app.workspace.getMostRecentLeaf(),leaf=app.workspace.getLeaf('tab');
const win=require('electron').remote.getCurrentWindow();
const wasVisible=win.isVisible(),wasThrottled=win.webContents.getBackgroundThrottling?.()??true;
win.webContents.setBackgroundThrottling(false);if(!wasVisible)win.showInactive();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let v;
const capture=async(el,name)=>{await document.fonts.ready;await pause(500);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=el.getBoundingClientRect(),bounds=win.getContentBounds();const rect={x:Math.max(0,Math.floor(r.left)),y:Math.max(0,Math.floor(r.top)),width:Math.min(Math.ceil(r.width),bounds.width-Math.max(0,Math.floor(r.left))),height:Math.min(Math.ceil(r.height),bounds.height-Math.max(0,Math.floor(r.top)))};if(rect.width<200||rect.height<100)throw Error('Unusable capture bounds');const image=await win.webContents.capturePage(rect);require('fs').writeFileSync(require('path').join(out,name),image.toPNG());return rect};
try{
const source=await app.vault.read(app.vault.getFileByPath(folder+'/Vista 0 QA.base'));
const names=['Normal QA','Varios días QA','Repetición QA','Sesiones QA'];
const basePath=folder+'/Agenda - Ejemplo QA.base';
let base=app.vault.getFileByPath(basePath);
const header='filters:'+String.fromCharCode(10)+'  or:'+String.fromCharCode(10)+names.map(name=>'    - file.path == "'+folder+'/Notas/'+name+'.md"'+String.fromCharCode(10)).join('');
const text=header+'views:'+source.split('views:')[1];
if(!base)base=await app.vault.create(basePath,text);
await leaf.openFile(base);await app.workspace.revealLeaf(leaf);
for(let i=0;i<100;i++){if(leaf.view.controller?.view?.data?.data.length===4)break;await pause(50)}
v=leaf.view.controller.view;v.shownMonth=new Date(2026,10,2,12);v.config.set('showStatus',false);v.config.set('showHelp',false);v.render();
v.root.style.width='360px';
const mobile=await capture(v.root,'agenda-mobile.png');
v.root.style.width='800px';
const desktop=await capture(v.root,'agenda-desktop.png');
v.root.style.width='';
await v.editSchedule(app.vault.getFileByPath(folder+'/Notas/Sesiones QA.md'),false);
await pause(100);const content=document.querySelector('.jsc-schedule-editor');
await capture(content.closest('.modal'),'additional-dates.png');
[...content.querySelectorAll('button')].find(button=>button.textContent==='Cancel').click();
return {mobile,desktop,out};
}finally{if(v)v.root.style.width='';leaf.detach();if(original)await app.workspace.revealLeaf(original);win.webContents.setBackgroundThrottling(wasThrottled);if(!wasVisible)win.hide()}
`+'})()'],{encoding:'utf8',timeout:45000,windowsHide:true});
console.log(output.trim());
