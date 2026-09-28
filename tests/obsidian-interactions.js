// Run in the Obsidian development vault via the CLI eval command.
// Creates its own fixtures, exercises real Bases views and removes them afterward.
(async () => {
  const folder = `Calendar interaction QA ${Date.now()}`;
  const notesFolder = `${folder}/Notes`;
  const results = [];
  const check = (ok, label) => { if (!ok) throw Error(label + ' | last: ' + results.slice(-3).join('; ')); results.push(label); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => {
    for (let i = 0; i < 100; i++) { if (await fn()) return; await wait(100); }
    throw Error(`Timed out: ${label} | ${JSON.stringify({last:results.slice(-4),file:leaf?.view.file?.path,type:leaf?.view.getViewType(),data:leaf?.view.controller?.view?.data?.data.length,view:leaf?.view.controller?.view?.type,base:base?.path})}`);
  };
  const fm = file => app.metadataCache.getFileCache(file)?.frontmatter;
  const original = app.workspace.getMostRecentLeaf();
  let leaf;
  let v;
  let base;
  const otherLeaves = new Set();
  const bar = (file, day) => [...v.grid.querySelectorAll('.jsc-note')].find(el => el.dataset.path === file.path && (!day || el.dataset.start <= day && el.dataset.end >= day));
  const cell = day => v.grid.querySelector(`[data-date="${day}"]`);
  const reopen = async () => {
    await leaf.setViewState({type:'empty'});
    await leaf.openFile(base);
    await app.workspace.revealLeaf(leaf);
    await until(() => leaf.view.controller?.view?.data?.data.length === 6, 'fixtures loaded');
    v = leaf.view.controller.view;
    v.shownMonth = new Date(2026, 8, 1, 12);
    v.render();
    await wait(150);
  };
  const begin = async (file, day) => {
    let el = bar(file, day);
    check(!!el && el.draggable, `Draggable: ${file.basename}`);
    el.scrollIntoView({block:'center', inline:'center'});
    await wait(80);
    el = bar(file, day);
    const nr = el.getBoundingClientRect(), dr = cell(day).getBoundingClientRect();
    const x = Math.max(nr.left + 1, dr.left + dr.width / 2), y = nr.top + nr.height / 2;
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,clientX:x,clientY:y,dataTransfer:dt}));
    check(!!v.drag && v.drag.from === day, `Grabbed exact day: ${day} ${v.drag ? v.drag.from : JSON.stringify({x,y,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,400),rect:nr.toJSON(),day:dr.toJSON()})}`);
    return {el, dt};
  };
  const drop = async (drag, day) => {
    const target = cell(day);
    target.scrollIntoView({block:'center', inline:'center'});
    await wait(80);
    const r = target.getBoundingClientRect(), x = r.left + r.width / 2, y = r.bottom - 5;
    target.dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,clientX:x,clientY:y,dataTransfer:drag.dt}));
    check(target.classList.contains('jsc-drop-target'), `Drop feedback: ${day} ${target.classList.contains("jsc-drop-target") ? "" : JSON.stringify({rect:r.toJSON(),hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,400),drag:!!v.drag,types:drag.dt.types})}`);
    target.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,clientX:x,clientY:y,dataTransfer:drag.dt}));
    drag.el.dispatchEvent(new DragEvent('dragend', {bubbles:true,dataTransfer:drag.dt}));
    await until(() => !v.movingNote, 'write finished');
  };
  try {
    await app.vault.createFolder(folder);
    await app.vault.createFolder(notesFolder);
    const single = await app.vault.create(`${notesFolder}/Single.md`, '---\nstart: 2026-09-28\naliases: ["Coffee & ideas"]\nlabel: Coffee & ideas\nkeep: untouched\ncolor: blue\n---\nBody stays exactly here.\n');
    const multi = await app.vault.create(`${notesFolder}/Multi.md`, '---\nstart: 2026-09-25\nend: 2026-10-02\nlabel: "[[Target|Project plan]]"\n---\nMulti-day body.\n');
    const target = await app.vault.create(`${notesFolder}/Target.md`, '# Destination\n');
    const list = await app.vault.create(`${notesFolder}/List.md`, '---\nstart: 2026-09-28\nend: 2026-09-30\nlabel: ["[[Target|First link]]", "Plain alias"]\n---\n');
    const invalid = await app.vault.create(`${notesFolder}/Invalid.md`, '---\nstart: 2026-09-28\nend: 2026-09-20\nlabel: "<b>Literal HTML</b>"\n---\n');
    const stamp = await app.vault.create(`${notesFolder}/Datetime.md`, '---\nstart: 2026-09-28T15:30:02.123+02:00\nend: 2026-09-30T18:00+02:00\n---\n');
    const win = require('electron').remote.getCurrentWindow(); win.show(); win.focus();
    leaf = app.workspace.getLeaf('tab');
    for (const type of ['just-simple-calendar', 'just-simple-calendar-infinite', 'just-simple-calendar-linear']) {
      base = await app.vault.create(`${folder}/${type}.base`, `filters:\n  and:\n    - file.inFolder("${notesFolder}")\n    - file.ext == "md"\nformulas:\n  linked: 'link("${target.path}", "Formula label")'\n  computed_end: end\nviews:\n  - type: ${type}\n    name: Interaction QA\n    dateProperty: note.start\n    endDateProperty: note.end\n    titleProperty: note.label\n    colorProperty: note.color\n    weekStart: "1"\n`);
      await reopen();
      check(bar(multi).textContent === 'Project plan' && !!bar(multi).querySelector('.internal-link'), `${type}: wikilink label and native link`);
      check(bar(list).textContent === 'First link, Plain alias', `${type}: list title`);
      check(bar(single).textContent === (v.linear ? '' : 'Coffee & ideas'), `${type}: custom plain title`);
      check(!bar(invalid).querySelector('b,script'), `${type}: literal HTML is safe`);
      check(!bar(invalid).draggable, `${type}: invalid end cannot be dragged`);
      check(bar(single).getAttribute('aria-label').startsWith('Coffee & ideas'), `${type}: accessible title`);
      check(bar(single).style.getPropertyValue('--jsc-event-color') === 'var(--color-blue)', `${type}: color retained`);
      v.config.set('titleProperty', 'note.aliases'); v.render();
      check(bar(single).getAttribute('aria-label').startsWith('Coffee & ideas'), `${type}: aliases label`);
      check(bar(multi).textContent === 'Multi', `${type}: missing title fallback`);
      v.config.set('titleProperty', 'formula.linked'); v.render();
      check(bar(multi).textContent === 'Formula label' && !!bar(multi).querySelector('.internal-link, .external-link, a'), `${type}: Bases formula link renders`);
      v.config.set('titleProperty', 'note.label'); v.render();
      await wait(1200);
      bar(multi).querySelector('.internal-link, .external-link, a').click();
      await until(() => app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === target.path), 'link destination');
      check(true, `${type}: native link opens destination`);
      for (const l of app.workspace.getLeavesOfType('markdown')) if (l.view.file?.path === target.path && l !== leaf) otherLeaves.add(l);
      await reopen();
      let hovered = false;
      const ref = app.workspace.on('hover-link', event => { if (event.linktext === single.path) hovered = true; });
      bar(single).dispatchEvent(new MouseEvent('mouseover', {bubbles:true}));
      app.workspace.offref(ref); v.hoverPopover?.unload();
      check(hovered, `${type}: card hover preview`);

      let drag = await begin(single, '2026-09-28');
      await drop(drag, '2026-09-29');
      await until(() => fm(single)?.start === '2026-09-29', 'single move indexed');
      check(!Object.hasOwn(fm(single), 'end'), `${type}: single move does not add end`);
      check((await app.vault.read(single)).endsWith('Body stays exactly here.\n') && fm(single).keep === 'untouched', `${type}: body and other properties preserved`);
      await until(() => !!bar(single, '2026-09-29'), 'single rerender');
      const beforeCancel = await app.vault.read(single);
      drag = await begin(single, '2026-09-29');
      drag.el.dispatchEvent(new DragEvent('dragend', {bubbles:true,dataTransfer:drag.dt}));
      check(!v.drag && await app.vault.read(single) === beforeCancel, `${type}: cancelled drag does not write`);
      drag = await begin(single, '2026-09-29'); await drop(drag, '2026-09-29');
      check(await app.vault.read(single) === beforeCancel, `${type}: same-day drop does not write`);
      drag = await begin(multi, '2026-09-29'); await drop(drag, '2026-09-30');
      await until(() => fm(multi)?.start === '2026-09-26' && fm(multi)?.end === '2026-10-03', 'multi move indexed');
      check(true, `${type}: continuation move preserves range`);
      await until(() => !!bar(stamp), 'datetime ready');
      drag = await begin(stamp, '2026-09-28'); await drop(drag, '2026-09-29');
      await until(() => fm(stamp)?.start === '2026-09-29T15:30:02.123+02:00', 'datetime indexed');
      check(fm(stamp).end === '2026-10-01T18:00+02:00', `${type}: datetime times and offsets retained`);

      v.config.set('endDateProperty', 'formula.computed_end'); v.render();
      check(!bar(multi).draggable && !bar(single).draggable, `${type}: computed end is read-only`);
      v.config.set('endDateProperty', 'note.end');
      v.config.set('dateProperty', 'file.mtime'); v.render();
      check([...v.grid.querySelectorAll('.jsc-note')].every(n => !n.draggable), `${type}: file date is read-only`);
      v.config.set('dateProperty', 'note.start'); v.render();
      if (v.infinite) {
        const anchor = v.captureAnchor();
        drag = await begin(single, '2026-09-29');
        const source = drag.el;
        v.onDataUpdated();
        check(source.isConnected, 'Infinite: data update keeps drag source connected');
        v.viewport.scrollTop = 5; v.handleScroll();
        check(source.isConnected, 'Infinite: scrolling during drag keeps source connected');
        const droppedAnchor = v.captureAnchor();
        source.dispatchEvent(new DragEvent('dragend', {bubbles:true}));
        check(v.captureAnchor().day === droppedAnchor.day && Math.abs(v.captureAnchor().offset - droppedAnchor.offset) < 2, 'Infinite: cancellation preserves scrolled position');
        v.restoreAnchor(anchor);
      }
      for (const mode of ['right', 'tab', 'current']) {
        v.config.set('doubleClickAction', mode); v.render();
        await until(async () => (await app.vault.read(base)).includes(`doubleClickAction: ${mode}`), 'setting saved');
        const previousLeaves = app.workspace.getLeavesOfType('markdown');
        const calendarParent = leaf.parent;
        bar(single).dispatchEvent(new MouseEvent('dblclick', {bubbles:true,cancelable:true}));
        await until(() => app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === single.path), 'double-click open');
        const opened = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === single.path && (mode === 'current' ? l === leaf : !previousLeaves.includes(l)));
        check(!!opened, `${type}: double-click ${mode} opens original note`);
        if (mode === 'current') check(opened === leaf, `${type}: current pane reused`);
        else {
          otherLeaves.add(opened);
          check(mode === 'right' ? opened.parent !== calendarParent : opened.parent === calendarParent, `${type}: ${mode} placement`);
          if (mode === 'right') {
            await wait(500);
            bar(multi).dispatchEvent(new MouseEvent('dblclick', {bubbles:true,cancelable:true}));
            await wait(500);
            await until(() => opened.view.file?.path === multi.path, 'right pane reuse');
            check(v.rightLeaf === opened, `${type}: right pane reused`);
          }
          await wait(300); opened.detach(); otherLeaves.delete(opened);
        }
        await reopen();
        check(v.config.get('doubleClickAction') === mode, `${type}: setting survives reopen (${mode})`);
      }
      await app.fileManager.processFrontMatter(single, data => {data.start='2026-09-28'});
      await app.fileManager.processFrontMatter(multi, data => {data.start='2026-09-25';data.end='2026-10-02'});
      await app.fileManager.processFrontMatter(stamp, data => {data.start='2026-09-28T15:30:02.123+02:00';data.end='2026-09-30T18:00+02:00'});
      await until(() => fm(single)?.start === '2026-09-28' && fm(multi)?.start === '2026-09-25' && fm(stamp)?.start === '2026-09-28T15:30:02.123+02:00', 'reset dates');
    }
    return {passed:results.length, results};
  } catch(error) {
    throw new Error(`${String(error)}; completed ${results.length} checks`, {cause:error});
  } finally {
    v?.hoverPopover?.unload();
    for (const l of otherLeaves) l.detach();
    if (leaf) {await leaf.setViewState({type:'empty'}); leaf.detach();}
    if (original) await app.workspace.revealLeaf(original);
    await wait(1200);
    const created = app.vault.getFolderByPath(folder);
    if (created) await app.vault.delete(created, true);
  }
})()
