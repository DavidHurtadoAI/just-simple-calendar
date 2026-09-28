(async()=>{
 const folder=`Calendar edge QA ${Date.now()}`, results=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);results.push(label)};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,label)=>{for(let i=0;i<80;i++){if(await fn())return;await wait(100)}throw Error(label)};
 const original=app.workspace.getMostRecentLeaf();let leaf,v;
 const win=require('electron').remote.getCurrentWindow();win.show();win.focus();
 try{
  await app.vault.createFolder(folder);await app.vault.createFolder(`${folder}/Notes`);
  const other=await app.vault.create(`${folder}/Target.md`,'Wrong destination.\n');
  const target=await app.vault.create(`${folder}/Notes/Target.md`,'# Heading\nCorrect destination.\n');
  const file=await app.vault.create(`${folder}/Notes/Event.md`,'---\nstart: 2026-09-28\nend: 2026-09-30\nlabel: "[[Target#Heading|Project details]]"\n---\nBody.\n');
  const base=await app.vault.create(`${folder}/Calendar.base`,`filters:\n  and:\n    - file.path == "${file.path}"\nviews:\n  - type: just-simple-calendar\n    name: Edge QA\n    dateProperty: note.start\n    endDateProperty: note.end\n    titleProperty: note.label\n`);
  leaf=app.workspace.getLeaf('tab');
  const open=async()=>{await leaf.setViewState({type:'empty'});await leaf.openFile(base);await app.workspace.revealLeaf(leaf);await until(()=>leaf.view.controller?.view?.data?.data.length===1,'base ready');v=leaf.view.controller.view;v.shownMonth=new Date(2026,8,1,12);v.render();await wait(200)};
  await open();
  const bar=()=>v.grid.querySelector('.jsc-note');
  const link=bar().querySelector('.internal-link');
  check(link?.textContent==='Project details','Wikilink heading renders its alias');
  link.click();await until(()=>leaf.view.file?.extension==='md','link opened');
  check(leaf.view.file.path===target.path,`Relative wikilink uses source note folder (actual: ${leaf.view.file.path})`);
  await wait(400);await open();
  const event=bar();event.scrollIntoView({block:'center'});await wait(100);
  const r=bar().getBoundingClientRect();const dt=new DataTransfer();
  bar().dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+10,clientY:r.top+r.height/2}));
  check(!!v.drag,'Drag started before concurrent edit');
  await app.fileManager.processFrontMatter(file,fm=>{fm.start='2026-09-27';fm.unrelated='Concurrent edit'});
  await until(()=>app.metadataCache.getFileCache(file)?.frontmatter?.start==='2026-09-27','concurrent edit indexed');
  check(event.isConnected,'Concurrent update keeps native source attached');
  const before=await app.vault.read(file);const to=v.grid.querySelector('[data-date="2026-09-29"]');const tr=to.getBoundingClientRect();
  to.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:tr.left+tr.width/2,clientY:tr.bottom-5}));
  await until(()=>!v.movingNote,'move completed');
  check(await app.vault.read(file)===before,'Concurrent edit is preserved, with no partial date writes');
  check(!v.drag,'Conflict cleans up drag state');
  // Missing configuration defaults to opening the note in this calendar leaf.
  bar().dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
  await until(()=>leaf.view.file?.path===file.path,'default action opens');
  check(true,'Unset double-click action opens current pane');
  return {passed:results.length,results};
 }finally{
  v?.hoverPopover?.unload();if(leaf){await leaf.setViewState({type:'empty'});leaf.detach()};if(original)await app.workspace.revealLeaf(original);
  await wait(800);const created=app.vault.getFolderByPath(folder);if(created)await app.vault.delete(created,true);
 }
})()
