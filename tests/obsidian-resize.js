// Run through Obsidian CLI eval in the Windows development vault.
// Native Chromium input tests; all notes and Bases are disposable fixtures.
(async () => {
  const results = [];
  const check = (ok, label) => { if (!ok) throw Error(label); results.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    for (let i = 0; i < 80; i++) { if (await fn()) return; await wait(100); }
    throw Error(label);
  };
  const folder = `Calendar resize QA ${Date.now()}`;
  const original = app.workspace.getMostRecentLeaf();
  let leaf, v;
  const win = require('electron').remote.getCurrentWindow(); win.show(); win.focus();
  const dbg = win.webContents.debugger, attached = dbg.isAttached();
  if (!attached) dbg.attach('1.3');
  const send = (method, params) => dbg.sendCommand(method, params);
  let intercepted;
  const listener = (_event, method, params) => { if (method === 'Input.dragIntercepted') intercepted = params.data; };
  dbg.on('message', listener);
  const fm = file => app.metadataCache.getFileCache(file)?.frontmatter;
  const bars = file => [...v.grid.querySelectorAll('.jsc-note')].filter(n => n.dataset.path === file.path);
  const handle = file => bars(file).find(n => n.querySelector('.jsc-resize-handle'))?.querySelector('.jsc-resize-handle');
  const begin = async file => {
    handle(file).scrollIntoView({block:'center', inline:'center', behavior:'instant'});
    await wait(150);
    const r = handle(file).getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', x, y});
    await send('Input.dispatchMouseEvent', {type:'mousePressed', x, y, button:'left', buttons:1, clickCount:1});
    intercepted = null;
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:x+9, y:y+2, button:'left', buttons:1});
    await until(() => !!intercepted, 'Native resize drag intercepted');
    check(v.drag?.resize === true, `${v.type}: handle starts resize rather than move`);
    return {x, y, data:intercepted};
  };
  const over = async (drag, day) => {
    let target = v.grid.querySelector(`[data-date="${day}"]`);
    target.scrollIntoView({block:'center', inline:'center', behavior:'instant'});
    await wait(80);
    target = v.grid.querySelector(`[data-date="${day}"]`);
    const r = target.getBoundingClientRect(), vr = v.viewport.getBoundingClientRect();
    const x = r.left + r.width / 2, y = Math.min(r.bottom, vr.bottom) - 5;
    await send('Input.dispatchDragEvent', {type:'dragEnter', x, y, data:drag.data});
    await send('Input.dispatchDragEvent', {type:'dragOver', x, y, data:drag.data});
    return {x, y};
  };
  const drop = async (drag, day) => {
    const {x, y} = await over(drag, day);
    await send('Input.dispatchDragEvent', {type:'drop', x, y, data:drag.data});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased', x, y, button:'left', buttons:0, clickCount:1});
    await until(() => !v.movingNote && !v.drag, 'Resize finished');
  };
  const reset = async (file, data) => {
    await app.fileManager.processFrontMatter(file, value => { delete value.finish; Object.assign(value, data); });
    await until(() => fm(file)?.finish === data.finish && v.moves.get(file.path)?.end === data.finish, 'Reset indexed');
  };
  try {
    await send('Input.setInterceptDrags', {enabled:true});
    await send('Input.dispatchMouseEvent', {type:'mouseMoved', x:20, y:15});
    // Close any view-settings menu left open before the test.
    await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
    await app.vault.createFolder(folder);
    const single = await app.vault.create(`${folder}/Single.md`, '---\nstart: 2026-09-28\ncolor: blue\nkeep: unchanged\n---\nBody remains intact.\n');
    const multi = await app.vault.create(`${folder}/Multi.md`, '---\nstart: 2026-09-25\nfinish: 2026-10-02\n---\n');
    const stamp = await app.vault.create(`${folder}/Datetime.md`, '---\nstart: 2026-09-28T09:30+02:00\nfinish: 2026-09-30T18:00:02.123+02:00\n---\n');
    leaf = app.workspace.getLeaf('tab');
    for (const type of ['just-simple-calendar', 'just-simple-calendar-infinite', 'just-simple-calendar-linear']) {
      const base = await app.vault.create(`${folder}/${type}.base`, `filters:\n  and:\n    - file.inFolder("${folder}")\n    - file.ext == "md"\nviews:\n  - type: ${type}\n    name: Resize QA\n    dateProperty: note.start\n    colorProperty: note.color\n`);
      await leaf.setViewState({type:'empty'}); await leaf.openFile(base); await app.workspace.revealLeaf(leaf);
      await until(() => leaf.view.controller?.view?.data?.data.length === 3, 'Base loaded');
      v = leaf.view.controller.view; v.shownMonth = new Date(2026, 8, 1, 12); v.render();
      check(v.grid.querySelectorAll('.jsc-resize-handle').length === 0, `${type}: no end property configured, no resize handles`);
      v.config.set('endDateProperty', 'note.finish'); v.render(); await wait(200);
      check(!!handle(single) && !Object.hasOwn(fm(single), 'finish'), `${type}: missing note end still has a handle`);
      check(getComputedStyle(handle(single)).cursor === 'ew-resize', `${type}: right edge has resize cursor`);
      let drag = await begin(single);
      const before = await app.vault.read(single);
      await over(drag, '2026-10-01');
      check(v.grid.querySelectorAll('.jsc-resize-range').length === 4, `${type}: preview includes the proposed four-day range`);
      check(await app.vault.read(single) === before, `${type}: preview does not write to the note`);
      await drop(drag, '2026-10-01');
      await until(() => fm(single)?.finish === '2026-10-01', 'Missing end created');
      check(fm(single).start === '2026-09-28' && fm(single).keep === 'unchanged' && !Object.hasOwn(fm(single), 'end'), `${type}: creates selected property only, keeps start and other values`);
      check((await app.vault.read(single)).endsWith('Body remains intact.\n'), `${type}: body unchanged`);
      check(bars(single).filter(n => n.querySelector('.jsc-resize-handle')).length === 1 && handle(single).parentElement.dataset.end === '2026-10-01', `${type}: only final segment has the handle`);
      drag = await begin(single); await drop(drag, '2026-09-28');
      await until(() => fm(single)?.finish === '2026-09-28', 'Range shortened');
      check(fm(single).start === '2026-09-28', `${type}: shortening to one day preserves start`);
      drag = await begin(single);
      const beforeInvalid = await app.vault.read(single);
      await over(drag, '2026-09-27');
      check(!v.grid.querySelector('.jsc-drop-target, .jsc-resize-range'), `${type}: end before start is not an accepted destination`);
      await drop(drag, '2026-09-27');
      check(await app.vault.read(single) === beforeInvalid, `${type}: invalid resize leaves file untouched`);
      await reset(single, {start:'2026-09-28'});
      drag = await begin(single);
      await over(drag, '2026-10-01');
      await send('Input.dispatchDragEvent', {type:'dragCancel', x:drag.x, y:drag.y, data:drag.data});
      await send('Input.dispatchMouseEvent', {type:'mouseReleased', x:drag.x, y:drag.y, button:'left', buttons:0, clickCount:1});
      await until(() => !v.drag, 'Cancelled resize');
      check(!Object.hasOwn(fm(single), 'finish'), `${type}: cancellation does not create an end property`);
      check(!v.grid.querySelector('.jsc-resize-range') && !v.root.classList.contains('jsc-resizing'), `${type}: cancellation clears preview`);
      check(bars(multi).length > 1 && bars(multi).slice(0, -1).every(n => !n.querySelector('.jsc-resize-handle')), `${type}: continuation edges are not resizable`);
      drag = await begin(multi); await drop(drag, '2026-10-03');
      await until(() => fm(multi)?.finish === '2026-10-03', 'Multi resized');
      check(fm(multi).start === '2026-09-25', `${type}: final continuation changes only end`);
      drag = await begin(stamp); await drop(drag, '2026-10-02');
      await until(() => fm(stamp)?.finish === '2026-10-02T18:00:02.123+02:00', 'Datetime resized');
      check(fm(stamp).start === '2026-09-28T09:30+02:00', `${type}: timestamp suffix and start are preserved`);
      if (type === 'just-simple-calendar') {
        drag = await begin(single);
        await app.fileManager.processFrontMatter(single, value => {value.finish='2026-09-29'});
        await until(() => fm(single)?.finish === '2026-09-29', 'Concurrent date indexed');
        const edited = await app.vault.read(single);
        await drop(drag, '2026-10-01');
        check(await app.vault.read(single) === edited, 'Concurrent end edit cancels resize without overwriting it');
      }
      for (const selection of [undefined, 'note.start', 'file.mtime']) {
        v.config.set('endDateProperty', selection); v.render();
        check(!v.grid.querySelector('.jsc-resize-handle'), `${type}: handle absent for end selection ${selection}`);
      }
      v.config.set('endDateProperty', 'note.finish'); v.render();
      await reset(single, {start:'2026-09-28'});
      await reset(multi, {start:'2026-09-25', finish:'2026-10-02'});
      await reset(stamp, {start:'2026-09-28T09:30+02:00', finish:'2026-09-30T18:00:02.123+02:00'});
    }
    return {passed:results.length, results};
  } finally {
    await send('Input.setInterceptDrags', {enabled:false}); dbg.removeListener('message', listener); if (!attached) dbg.detach();
    v?.hoverPopover?.unload(); if (leaf) {await leaf.setViewState({type:'empty'}); leaf.detach();}
    if (original) await app.workspace.revealLeaf(original);
    await wait(800); const created = app.vault.getFolderByPath(folder); if (created) await app.vault.delete(created, true);
  }
})()
