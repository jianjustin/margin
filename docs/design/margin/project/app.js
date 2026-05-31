/* ============ MARGIN — app shell ============ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let activeNote = NOTES[0];
  let activePath = null;
  let saveTimer = null;
  const genCache = {};

  /* ---------- sidebar: file tree ---------- */
  const noteById = (id) => NOTES.find(n => n.id === id);
  function curFilter(){ const el = $("#sb-search-input"); return el ? el.value : ""; }

  function isIgnored(name, isFolder){
    for (const pat of (SETTINGS.ignore || [])) {
      if (!pat) continue;
      if (pat.endsWith("/")) { if (isFolder && name === pat.slice(0, -1)) return true; }
      else if (pat.includes("*")) {
        const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
        if (re.test(name)) return true;
      } else if (name === pat) return true;
    }
    return false;
  }
  function extMeta(name){
    if (name.endsWith(".md")) return { ic: "M↓", cls: "f-md" };
    if (name.endsWith(".canvas")) return { ic: "◫", cls: "f-canvas" };
    if (name.endsWith(".json")) return { ic: "{}", cls: "f-json" };
    if (name.endsWith(".tmp")) return { ic: "◌", cls: "f-tmp" };
    return { ic: "·", cls: "" };
  }
  function folderHasMatch(node, f){
    return (node.children || []).some(c =>
      c.type === "folder" ? folderHasMatch(c, f) : c.name.toLowerCase().includes(f));
  }

  function renderTree(){
    const list = $("#sb-list"); list.innerHTML = "";
    const f = curFilter().trim().toLowerCase();
    const frag = document.createDocumentFragment();
    walkTree(FILE_TREE, 0, frag, f, "");
    if (!frag.childNodes.length) {
      const e = document.createElement("div"); e.className = "tree-empty"; e.textContent = "没有匹配的文件";
      frag.appendChild(e);
    }
    list.appendChild(frag);
  }
  function walkTree(nodes, depth, parent, f, prefix){
    nodes.forEach(node => {
      const ignored = isIgnored(node.name, node.type === "folder");
      if (ignored && !SETTINGS.showIgnored) return;
      if (node.type === "folder") {
        const path = prefix + node.name + "/";
        if (f && !folderHasMatch(node, f)) return;
        if (f) node.open = true;
        const row = document.createElement("div");
        row.className = "tree-row folder" + (ignored ? " ignored" : "");
        row.style.paddingLeft = (10 + depth * 14) + "px";
        row.innerHTML =
          '<span class="chev">' + (node.open ? "▾" : "▸") + '</span>' +
          '<span class="ticon fold">' + (node.open ? "▾" : "▸") + '</span>' +
          '<span class="tname">' + node.name + '</span>' +
          '<span class="tcount">' + (node.children || []).length + '</span>';
        row.onclick = () => { node.open = !node.open; renderTree(); };
        parent.appendChild(row);
        if (node.open) walkTree(node.children || [], depth + 1, parent, f, path);
      } else {
        const path = prefix + node.name;
        if (f && !node.name.toLowerCase().includes(f)) return;
        const meta = extMeta(node.name);
        const row = document.createElement("div");
        row.className = "tree-row file" + (ignored ? " ignored" : "") + (activePath === path ? " active" : "");
        row.style.paddingLeft = (10 + depth * 14 + 16) + "px";
        row.innerHTML =
          '<span class="ticon ' + meta.cls + '">' + meta.ic + '</span>' +
          '<span class="tname">' + node.name + '</span>';
        row.onclick = () => openFile(node, path);
        parent.appendChild(row);
      }
    });
  }

  function genPlaceholder(node, path){
    const title = node.name.replace(/\.[^.]+$/, "");
    let md;
    if (node.name.endsWith(".json")) md = "```json\n{\n  \"file\": \"" + node.name + "\",\n  \"managed\": true\n}\n```";
    else if (node.name.endsWith(".canvas")) md = "# " + title + "\n\n> 画布文件 · 在此组织卡片与连线。\n\n这是一个占位预览。";
    else if (node.name.endsWith(".tmp")) md = "> 临时文件 · 通常会被忽略规则隐藏。";
    else md = "# " + title + "\n\n开始书写……";
    return { id: path, title, tag: path.includes("/") ? path.split("/")[0] : "根目录", md, mtime: "未修改", icon: "•" };
  }
  function openFile(node, path){
    activePath = path;
    let note;
    if (node.noteId) note = noteById(node.noteId);
    else note = genCache[path] || (genCache[path] = genPlaceholder(node, path));
    loadNote(note, path);
  }

  function loadNote(n, path){
    activeNote = n;
    const crumb = path && path.includes("/") ? path.split("/").slice(0, -1).join(" / ") : (n.tag || "根目录");
    $("#doc-title").textContent = n.title;
    $("#doc-tag").textContent = n.tag || "笔记";
    $("#title-name").textContent = n.title;
    $(".title-doc .crumb").textContent = crumb;
    MarginEditor.load(n.md);
    renderTree();
    setSaved("已同步");
    $("#editor-scroll").scrollTop = 0;
  }

  /* ---------- drawer (block library) ---------- */
  function renderDrawer(filter){
    const body = $("#dr-body");
    body.innerHTML = "";
    const f = (filter || "").trim().toLowerCase();
    BLOCK_LIB.forEach(group => {
      const items = group.items.filter(it =>
        !f || it.name.toLowerCase().includes(f) || it.type.includes(f) || (it.desc||"").toLowerCase().includes(f));
      if (!items.length) return;
      const cat = document.createElement("div");
      cat.className = "dr-cat"; cat.textContent = group.cat; body.appendChild(cat);
      const grid = document.createElement("div"); grid.className = "dr-grid";
      items.forEach(it => {
        const card = document.createElement("div");
        card.className = "block-card"; card.draggable = true; card.dataset.type = it.type;
        card.innerHTML =
          '<div class="bc-ic">'+it.icon+'</div>' +
          '<div class="bc-name">'+it.name+'</div>' +
          '<div class="bc-desc">'+it.desc+'</div>';
        card.onclick = () => { MarginEditor.insert(it.type); };
        card.addEventListener("dragstart", (e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("margin/new", it.type); card.classList.add("dragging"); });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        grid.appendChild(card);
      });
      body.appendChild(grid);
    });
  }

  function toggleDrawer(force){
    const body = $("#body");
    const open = force == null ? !body.classList.contains("drawer-open") : force;
    body.classList.toggle("drawer-open", open);
    $("#btn-drawer").classList.toggle("on", open);
  }
  function toggleSidebar(){
    const body = $("#body");
    const c = body.classList.toggle("sidebar-collapsed");
    $("#btn-sidebar").classList.toggle("on", !c);
  }

  /* ---------- theme ---------- */
  function toggleTheme(){
    SETTINGS.theme = SETTINGS.theme === "light" ? "dark" : "light";
    MarginSettings.apply();
    MarginSettings.save();
    $("#btn-theme").innerHTML = SETTINGS.theme === "light" ? SUN : MOON;
  }
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  /* ---------- status bar ---------- */
  function setStats(s){
    $("#st-chars").innerHTML = "<b>"+s.chars+"</b> 字符";
    $("#st-words").innerHTML = "<b>"+s.words+"</b> 词";
    $("#st-read").innerHTML = "约 <b>"+s.minutes+"</b> 分钟";
    $("#st-blocks").innerHTML = "<b>"+s.blocks+"</b> 块";
  }
  function setSaved(t){ $("#st-save").textContent = t; }
  function markDirty(){
    $("#title-doc").classList.add("dirty");
    setSaved("编辑中…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { setSaved("已自动保存"); $("#title-doc").classList.remove("dirty"); }, 900);
  }

  /* ---------- slash menu ---------- */
  const slash = { open: false, items: [], active: 0, anchor: null };
  function allItems(){ const a = []; BLOCK_LIB.forEach(g => g.items.forEach(it => a.push(it))); return a; }
  function openSlash(){
    const el = $("#slash"); slash.open = true; slash.active = 0;
    renderSlash("");
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const r = sel.getRangeAt(0).getClientRects()[0] || sel.getRangeAt(0).getBoundingClientRect();
      let top = r.bottom + 6, left = r.left;
      el.style.display = "block";
      const h = el.offsetHeight;
      if (top + h > window.innerHeight - 10) top = r.top - h - 6;
      el.style.top = top + "px"; el.style.left = Math.min(left, window.innerWidth - 300) + "px";
    }
    el.classList.add("open");
  }
  function closeSlash(){ slash.open = false; $("#slash").classList.remove("open"); $("#slash").style.display = "none"; }
  function renderSlash(filter){
    const el = $("#slash");
    const f = filter.toLowerCase();
    slash.items = allItems().filter(it => !f || it.name.toLowerCase().includes(f) || it.type.includes(f));
    if (slash.active >= slash.items.length) slash.active = 0;
    el.innerHTML = '<div class="s-head">插入块' + (filter ? ' · "'+filter+'"' : "") + '</div>' +
      (slash.items.length ? slash.items.map((it, i) =>
        '<div class="slash-item'+(i===slash.active?" active":"")+'" data-i="'+i+'">' +
        '<div class="si-ic">'+it.icon+'</div>' +
        '<div><div class="si-name">'+it.name+'</div><div class="si-desc">'+it.desc+'</div></div>' +
        (it.key ? '<span class="si-key">'+it.key+'</span>' : "") +
        '</div>').join("")
      : '<div class="slash-item"><div class="si-desc" style="padding:4px">无匹配的块</div></div>');
    $$("#slash .slash-item[data-i]").forEach(node => {
      node.onmousedown = (e) => { e.preventDefault(); pickSlash(+node.dataset.i); };
    });
  }
  function pickSlash(i){
    const it = slash.items[i]; if (!it) return;
    closeSlash();
    MarginEditor.replaceOrInsert(it.type);
  }

  // slash detection: typing "/" at start of an empty-ish paragraph
  function slashWatch(e){
    const c = e.target.closest && e.target.closest(".block-content"); if (!c) { if (slash.open) closeSlash(); return; }
    const el = c.closest(".block");
    if (el.dataset.type !== "paragraph") { if (slash.open) closeSlash(); return; }
    const txt = c.textContent;
    if (txt[0] === "/" ) {
      if (!slash.open) openSlash();
      renderSlash(txt.slice(1));
    } else if (slash.open) closeSlash();
  }
  function slashKeys(e){
    if (!slash.open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); slash.active = (slash.active + 1) % slash.items.length; renderSlash(currentSlashFilter()); }
    else if (e.key === "ArrowUp") { e.preventDefault(); slash.active = (slash.active - 1 + slash.items.length) % slash.items.length; renderSlash(currentSlashFilter()); }
    else if (e.key === "Enter") { e.preventDefault(); pickSlash(slash.active); }
    else if (e.key === "Escape") { e.preventDefault(); closeSlash(); }
  }
  function currentSlashFilter(){
    const el = $(".block.editing .block-content"); return el ? el.textContent.slice(1) : "";
  }

  /* ---------- init ---------- */
  function init(){
    MarginSettings.load();
    MarginSettings.apply();
    $("#btn-theme").innerHTML = (SETTINGS.theme === "light") ? SUN : MOON;

    MarginEditor.init($("#editor"), {
      onDirty: markDirty,
      onStats: setStats,
    });

    renderTree();
    renderDrawer("");
    openFile(FILE_TREE[0].children[0], "日常/使用指南.md");

    $("#btn-drawer").onclick = () => toggleDrawer();
    $("#btn-sidebar").onclick = toggleSidebar;
    $("#btn-theme").onclick = toggleTheme;
    $("#btn-settings").onclick = () => MarginSettings.open();
    $("#btn-sidebar").classList.add("on");

    $("#dr-search-input").addEventListener("input", (e) => renderDrawer(e.target.value));
    $("#sb-search-input").addEventListener("input", renderTree);

    // doc title
    const dt = $("#doc-title");
    dt.addEventListener("input", () => { activeNote.title = dt.textContent; markDirty(); });
    dt.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); MarginEditor.focusFirst(); } });

    // slash
    $("#editor").addEventListener("input", slashWatch);
    $("#editor").addEventListener("keydown", slashKeys, true);
    document.addEventListener("click", (e) => { if (!e.target.closest("#slash") && !e.target.closest(".block-content")) closeSlash(); });
    $("#editor-scroll").addEventListener("scroll", () => { if (slash.open) closeSlash(); });

    // keyboard: cmd/ctrl + \ toggles drawer; cmd/ctrl + , opens settings
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleDrawer(); }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); MarginSettings.open(); }
    });

    // open drawer by default so the feature is visible
    toggleDrawer(true);

    // expose for settings module
    window.MarginApp = { renderTree, syncThemeBtn: () => { $("#btn-theme").innerHTML = (SETTINGS.theme === "light") ? SUN : MOON; } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
