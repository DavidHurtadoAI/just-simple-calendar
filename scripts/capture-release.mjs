// Real screenshots from fictional release fixtures in the canonical test vault.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.resolve(repo, '../../@Nexus-dev');
const mode = process.argv[2] ?? 'setup';
mkdirSync(path.join(repo, 'qa'), { recursive: true });
const guard = `if(app.vault.adapter.getBasePath()!==${JSON.stringify(canonical)})throw Error('Wrong vault');`;
function evaluate(code) {
  const script = path.join(repo, 'qa', 'release-capture-eval.js');
  writeFileSync(script, '(async()=>{' + guard + code + '})()');
  const expression = 'eval(require("fs").readFileSync(' + JSON.stringify(script) + ',"utf8"))';
  const out = execFileSync('C:\\Program Files\\Obsidian\\Obsidian.com', ['vault=@Nexus-dev', 'eval', 'code=' + expression], { encoding:'utf8', timeout:60000, windowsHide:true }).trim();
  if (/^Error:/m.test(out)) throw Error(out);
  return out;
}
if (mode === 'setup') console.log(evaluate(`
  if(window.__jscReleaseQA)throw Error('Finish the previous capture first');
  const q={original:app.workspace.getMostRecentLeaf(),folder:'Pruebas/Just Simple Calendar/Release 1.6.0 QA '+Date.now(),out:${JSON.stringify(path.join(repo,'qa'))}};
  window.__jscReleaseQA=q;
  q.win=require('electron').remote.getCurrentWindow();q.bounds=q.win.getBounds();q.maximized=q.win.isMaximized();q.visible=q.win.isVisible();q.throttled=q.win.webContents.getBackgroundThrottling?.()??true;
  q.leftCollapsed=app.workspace.leftSplit.collapsed;q.rightCollapsed=app.workspace.rightSplit.collapsed;
  q.win.webContents.setBackgroundThrottling(false);if(!q.visible)q.win.showInactive();if(q.maximized)q.win.unmaximize();q.win.setContentSize(1620,1050);
  app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();
  q.pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  q.wait=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await q.pause(30)}throw Error('Capture setup timed out')};
  q.input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
  q.capture=async(el,name,extra={})=>{await document.fonts.ready;await q.pause(500);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=el.getBoundingClientRect(),b=q.win.getContentBounds();const rect={x:Math.max(0,Math.floor(r.left)),y:Math.max(0,Math.floor(r.top)),width:Math.min(Math.ceil(r.width),b.width-Math.max(0,Math.floor(r.left))),height:Math.min(Math.ceil(r.height),b.height-Math.max(0,Math.floor(r.top))),...extra};if(rect.width<100||rect.height<100)throw Error('Bad screenshot rectangle');const image=await q.win.webContents.capturePage(rect);require('fs').writeFileSync(require('path').join(q.out,name),image.toPNG());return rect};
  let parent='';for(const part of q.folder.split('/')){parent=parent?parent+'/'+part:part;if(!app.vault.getAbstractFileByPath(parent))await app.vault.createFolder(parent)}await app.vault.createFolder(q.folder+'/Notes');
  const nl=String.fromCharCode(10),defs=[
    ['Reunión de equipo QA',['start_date: 2026-11-02T10:00','end_date: 2026-11-02T11:00','repeat: every week','repeat_until: 2026-11-30','skip_dates: []','color: blue'],['# Reunión de equipo','','Compartimos avances y acordamos el siguiente paso.','','## Planificación','','Cada lunes, de 10:00 a 11:00. El 16 de noviembre no hay reunión. La última será el 23 de noviembre.']],
    ['Curso de fotografía QA',['start_date: 2026-11-04T18:00','end_date: 2026-11-04T20:00','additional_dates: []','color: purple'],['# Curso de fotografía','','Tres sesiones: 4, 12 y 20 de noviembre. Todas abren esta misma nota.']],
    ['Preparar materiales QA',['start_date: 2026-11-03','end_date: 2026-11-05','color: green'],['# Preparar materiales','','Revisamos los ejemplos para el curso.']],
    ['Revisión editorial QA',['start_date: 2026-11-10T09:30','end_date: 2026-11-10T10:30','color: orange'],['# Revisión editorial','','Revisión del borrador.']],
    ['Entrega del proyecto QA',['start_date: 2026-11-25','color: red'],['# Entrega del proyecto','','Datos ficticios de demostración.']]
  ];const filenames=['Equipo','Fotografía','Materiales','Editorial','Entrega'];q.files={};for(const [index,[name,props,body]]of defs.entries()){q.files[name]=await app.vault.create(q.folder+'/Notes/'+filenames[index]+'.md',['---',...props,'---',...body,''].join(nl))}
  const options=['    dateProperty: note.start_date','    endDateProperty: note.end_date','    colorProperty: note.color','    repeatProperty: note.repeat','    repeatUntilProperty: note.repeat_until','    repeatExceptProperty: note.skip_dates','    additionalDatesProperty: note.additional_dates','    weekStart: "1"','    doubleClickAction: right','    showHelp: false'].join(nl)+nl;
  q.options=options;const source='filters:'+nl+'  and:'+nl+'    - file.inFolder("'+q.folder+'/Notes")'+nl+'views:'+nl+'  - type: just-simple-calendar'+nl+'    name: Studio calendar'+nl+options;
  q.base=await app.vault.create(q.folder+'/Studio Calendar QA.base',source);q.leaf=app.workspace.getLeaf('tab');await q.leaf.openFile(q.base);await app.workspace.revealLeaf(q.leaf);await q.wait(()=>q.leaf.view.controller?.view?.data?.data.length===5);
  q.v=q.leaf.view.controller.view;q.v.shownMonth=new Date(2026,10,1,12);q.v.render();await q.v.openFile(q.files['Reunión de equipo QA'],'right');q.right=q.v.rightLeaf;await q.wait(()=>q.right?.view?.file?.path===q.files['Reunión de equipo QA'].path);await q.pause(500);
  return {folder:q.folder,buttons:[...q.leaf.view.containerEl.querySelectorAll('button,[role=button]')].map(el=>({text:el.textContent,title:el.getAttribute('aria-label')??el.getAttribute('title'),cls:el.className})),properties:[...q.right.view.containerEl.querySelectorAll('.metadata-property')].map(el=>({key:el.getAttribute('data-property-key'),text:el.textContent}))};
`));
else if (mode === 'configure') console.log(evaluate(`const q=window.__jscReleaseQA;[...q.leaf.view.containerEl.querySelectorAll('[role=button],button')].find(el=>el.textContent==='Studio calendar').click();await q.pause(200);return [...document.querySelectorAll('.popover,.menu')].map(el=>el.outerHTML.slice(0,18000));`));
else if (mode === 'options') console.log(evaluate(`const q=window.__jscReleaseQA;document.querySelector('.bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon').click();await q.pause(200);return [...document.querySelectorAll('.popover,.menu')].map(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('svg').forEach(svg=>svg.remove());return copy.outerHTML.slice(0,18000)});`));
else if (mode === 'settings') console.log(evaluate(`
  const q=window.__jscReleaseQA;
  const group=[...document.querySelectorAll('.input-group-header')].find(el=>el.textContent==='Optional scheduling');
  if(!group)throw Error('Configure view is not open');if(group.querySelector('.is-collapsed'))group.click();await q.pause(200);
  const menu=document.querySelector('.menu.bases-toolbar-menu');
  if(!menu.textContent.includes('repeat_until')||!menu.textContent.includes('skip_dates'))throw Error('Schedule mappings missing');
  const panel=await q.capture(menu,'optional-scheduling-settings.png');
  const left=q.leaf.view.contentEl.getBoundingClientRect(),right=q.right.view.contentEl.getBoundingClientRect();
  const y=Math.max(0,Math.floor(Math.min(left.top,right.top)));
  const split=await q.capture(q.leaf.view.contentEl,'scheduling-properties-and-calendar.png',{x:Math.floor(left.left),y,width:Math.ceil(right.right-left.left),height:Math.floor(Math.min(left.bottom,right.bottom)-y)});
  const values=[...q.right.view.contentEl.querySelectorAll('.metadata-property')].map(el=>({key:el.getAttribute('data-property-key'),inputs:[...el.querySelectorAll('input')].map(input=>({type:input.type,value:input.value})),text:el.textContent}));
  return {panel,split,values};
`));
else if (mode === 'inspect') console.log(evaluate(`const q=window.__jscReleaseQA;return {properties:q.right.view.contentEl.querySelector('.metadata-container')?.outerHTML.slice(0,14000),popovers:[...document.querySelectorAll('.popover,.menu')].map(el=>el.outerHTML.slice(0,18000))};`));
else if (mode === 'dates') console.log(evaluate(`
  const q=window.__jscReleaseQA,meeting=q.files['Reunión de equipo QA'],course=q.files['Curso de fotografía QA'];
  document.body.click();await q.v.editSchedule(meeting,true);
  let modal=document.querySelector('.jsc-schedule-editor');q.input(modal.querySelector('[aria-label="Repeat until"]'),'2026-11-23');
  [...modal.querySelectorAll('button')].find(el=>el.textContent==='Add date').click();q.input(modal.querySelector('.jsc-date-row input'),'2026-11-16');
  await q.capture(modal.closest('.modal'),'repeat-options.png');[...modal.querySelectorAll('button')].find(el=>el.textContent==='Save').click();
  await q.wait(()=>!document.querySelector('.jsc-schedule-editor'));await q.wait(()=>app.metadataCache.getFileCache(meeting)?.frontmatter?.repeat_until==='2026-11-23');
  await q.v.editSchedule(course,false);modal=document.querySelector('.jsc-schedule-editor');
  for(const day of ['2026-11-12','2026-11-20']){[...modal.querySelectorAll('button')].find(el=>el.textContent==='Add date').click();const inputs=modal.querySelectorAll('.jsc-date-row input');q.input(inputs[inputs.length-1],day)}
  await q.capture(modal.closest('.modal'),'additional-dates-release.png');[...modal.querySelectorAll('button')].find(el=>el.textContent==='Save').click();
  await q.wait(()=>!document.querySelector('.jsc-schedule-editor'));await q.wait(()=>app.metadataCache.getFileCache(course)?.frontmatter?.additional_dates?.length===2);q.v.render();
  const dates=file=>[...q.v.grid.querySelectorAll('.jsc-note')].filter(el=>el.dataset.path===file.path).map(el=>el.dataset.start);
  const meetingDays=dates(meeting),courseDays=dates(course);
  if(meetingDays.join(',')!=='2026-11-02,2026-11-09,2026-11-23'||courseDays.join(',')!=='2026-11-04,2026-11-12,2026-11-20')throw Error('Screenshot dates do not match documented examples');
  q.right.detach();await q.pause(200);await q.capture(q.leaf.view.contentEl,'scheduled-calendar.png');
  await q.v.openFile(meeting,'right');q.right=q.v.rightLeaf;await q.wait(()=>q.right?.view.file===meeting);
  return {meetingDays,courseDays};
`));
else if (mode === 'labels') console.log(evaluate(`
  const q=window.__jscReleaseQA;document.querySelector('.bases-toolbar-menu .close-icon')?.click();
  const filenames=['Equipo','Fotografía','Materiales','Editorial','Entrega'];
  for(const [index,file]of Object.values(q.files).entries()){const target=q.folder+'/Notes/'+filenames[index]+'.md';if(file.path!==target)await app.fileManager.renameFile(file,target)}
  await q.wait(()=>Object.values(q.files).every(file=>app.metadataCache.getFileCache(file)?.frontmatter?.start_date));q.v.render();
  q.right.detach();await q.pause(300);await q.capture(q.leaf.view.contentEl,'scheduled-calendar.png');await q.v.openFile(q.files['Reunión de equipo QA'],'right');q.right=q.v.rightLeaf;
  return Object.values(q.files).map(file=>file.path);
`));
else if (mode === 'cleanup') console.log(evaluate(`const q=window.__jscReleaseQA;if(q){q.v?.scheduleEditor?.close();document.body.click();q.right?.detach();q.leaf?.detach();if(!q.leftCollapsed)app.workspace.leftSplit.expand();if(!q.rightCollapsed)app.workspace.rightSplit.expand();q.win.setBounds(q.bounds);if(q.maximized)q.win.maximize();q.win.webContents.setBackgroundThrottling(q.throttled);if(!q.visible)q.win.hide();if(q.original)await app.workspace.revealLeaf(q.original);delete window.__jscReleaseQA}return 'RESTORED';`));
else throw Error('Unknown capture mode');
