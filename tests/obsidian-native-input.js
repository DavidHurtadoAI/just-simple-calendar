(async () => {
 const results=[];const check=(ok,label)=>{if(!ok)throw Error(label);results.push(label)};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,label)=>{for(let i=0;i<60;i++){if(await fn())return;await wait(100)}throw Error(label)};
 const folder=`Calendar native QA ${Date.now()}`;
 const original=app.workspace.getMostRecentLeaf();let leaf,v;
 const win=require('electron').remote.getCurrentWindow();win.show();win.focus();
 const dbg=win.webContents.debugger;const attached=dbg.isAttached();if(!attached)dbg.attach('1.3');
 const send=(method,params)=>dbg.sendCommand(method,params);
 let intercepted=null;
 const listen=(event,method,params)=>{if(method==='Input.dragIntercepted')intercepted=params.data};
 dbg.on('message',listen);
 try {
  await send('Input.setInterceptDrags',{enabled:true});
  await app.vault.createFolder(folder);
  const note=await app.vault.create(`${folder}/Native card.md`,'---\nstart: 2026-09-28\nend: 2026-09-30\nlabel: "[[Destination|Linked title]]"\n---\nKeep this body.\n');
  const target=await app.vault.create(`${folder}/Destination.md`,'Destination\n');
  leaf=app.workspace.getLeaf('tab');
  for(const type of ['just-simple-calendar','just-simple-calendar-infinite','just-simple-calendar-linear']) {
   const base=await app.vault.create(`${folder}/${type}.base`,`filters:\n  and:\n    - file.inFolder("${folder}")\n    - file.ext == "md"\nviews:\n  - type: ${type}\n    name: Native drag QA\n    dateProperty: note.start\n    endDateProperty: note.end\n    titleProperty: note.label\n`);
   await leaf.setViewState({type:'empty'});await leaf.openFile(base);await app.workspace.revealLeaf(leaf);
   await until(()=>leaf.view.controller?.view?.data?.data.length===2,'base ready');
   v=leaf.view.controller.view;v.shownMonth=new Date(2026,8,1,12);v.render();
   const bar=()=>[...v.grid.querySelectorAll('.jsc-note')].find(n=>n.dataset.path===note.path);
   const startDrag=async()=>{
    bar().scrollIntoView({block:'center',inline:'center'});await wait(200);
    const n=bar(),r=n.getBoundingClientRect();const x=r.left+Math.min(10,r.width/2),y=r.top+r.height/2;
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    intercepted=null;
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+8,y:y+2,button:'left',buttons:1});
    await until(()=>!!intercepted,'Native drag intercepted');
    check(intercepted.items.some(i=>i.mimeType==='application/x-just-simple-calendar'),`${type}: native mouse starts calendar drag on linked title`);
    check(v.drag?.from==='2026-09-28',`${type}: native drag grabs correct date`);
    return {x,y,data:intercepted};
   };
   let drag=await startDrag();
   const to=v.grid.querySelector('[data-date="2026-09-29"]');
   const tr=to.getBoundingClientRect();const x=tr.left+tr.width/2,y=tr.bottom-5;
   await send('Input.dispatchDragEvent',{type:'dragEnter',x,y,data:drag.data});
   await send('Input.dispatchDragEvent',{type:'dragOver',x,y,data:drag.data});
   check(to.classList.contains('jsc-drop-target'),`${type}: native drag highlights destination`);
   await send('Input.dispatchDragEvent',{type:'drop',x,y,data:drag.data});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
   await until(()=>app.metadataCache.getFileCache(note)?.frontmatter?.start==='2026-09-29','native move saved');
   check(app.metadataCache.getFileCache(note).frontmatter.end==='2026-10-01',`${type}: native drop updates both dates`);
   check(!v.drag && !v.grid.querySelector('.jsc-drop-target'),`${type}: native drag cleans up`);
   await app.fileManager.processFrontMatter(note,fm=>{fm.start='2026-09-28';fm.end='2026-09-30'});
   await until(()=>app.metadataCache.getFileCache(note)?.frontmatter?.start==='2026-09-28'&&bar()?.dataset.start==='2026-09-28','reset indexed');
   const before=await app.vault.read(note);
   drag=await startDrag();
   await send('Input.dispatchDragEvent',{type:'dragCancel',x:drag.x,y:drag.y,data:drag.data});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x,y:drag.y,button:'left',buttons:0,clickCount:1});
   await wait(150);
   check(!v.drag && await app.vault.read(note)===before,`${type}: native cancellation preserves note`);
   // Native keyboard activation of the rendered title must follow its destination.
   const link=bar().querySelector('.internal-link');link.focus();
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await until(()=>leaf.view.file?.path===target.path,'keyboard link destination');
   check(true,`${type}: native Enter follows title link`);
   await wait(400);
  }
  return {passed:results.length,results};
 } finally {
  await send('Input.setInterceptDrags',{enabled:false});dbg.removeListener('message',listen);if(!attached)dbg.detach();
  v?.hoverPopover?.unload();if(leaf){await leaf.setViewState({type:'empty'});leaf.detach()};
  if(original)await app.workspace.revealLeaf(original);await wait(800);
  const created=app.vault.getFolderByPath(folder);if(created)await app.vault.delete(created,true);
 }
})()
