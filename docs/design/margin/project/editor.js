/* ============ MARGIN — block editor engine ============ */
(function () {
  let container, editorEl, cb = {};
  let blocks = [];
  let isComposing = false;
  let uid = 0;
  const nid = () => "b" + (++uid);
  const TEXT_TYPES = ["paragraph","h1","h2","h3","bullet","numbered","todo","quote","callout"];
  const ATOMIC = ["divider","image","table"];

  const B = (type, text, meta) => ({ id: nid(), type, text: text || "", meta: meta || {} });

  /* ---------- markdown parse ---------- */
  function splitRow(line){
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(s => s.trim());
  }
  function parseMarkdown(md){
    const lines = (md || "").split("\n");
    const out = []; let i = 0, m;
    while (i < lines.length) {
      let line = lines[i];
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim() || "text"; i++; const buf = [];
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; out.push(B("code", buf.join("\n"), { lang })); continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^(---|\*\*\*|___)\s*$/.test(line)) { out.push(B("divider", "")); i++; continue; }
      if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i+1])) {
        const head = splitRow(line); i += 2; const rows = [];
        while (i < lines.length && /^\|.*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        out.push(B("table", "", { head, rows })); continue;
      }
      if (m = line.match(/^(#{1,3})\s+(.*)/)) { out.push(B("h" + m[1].length, m[2])); i++; continue; }
      if (m = line.match(/^>\s?(.*)/)) { out.push(B("quote", m[1])); i++; continue; }
      if (m = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)/)) { out.push(B("todo", m[2], { checked: /[xX]/.test(m[1]) })); i++; continue; }
      if (m = line.match(/^[-*]\s+(.*)/)) { out.push(B("bullet", m[1])); i++; continue; }
      if (m = line.match(/^\d+\.\s+(.*)/)) { out.push(B("numbered", m[1])); i++; continue; }
      out.push(B("paragraph", line)); i++;
    }
    if (!out.length) out.push(B("paragraph", ""));
    return out;
  }

  /* ---------- inline render (caret-stable: textContent === raw) ---------- */
  function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function renderInline(raw){
    if (!raw) return "";
    const stash = [];
    let s = esc(raw);
    s = s.replace(/`([^`]+)`/g, (m, p1) => { const i = stash.length; stash.push('<span class="mk">`</span><code>'+p1+'</code><span class="mk">`</span>'); return "\u0000"+i+"\u0000"; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<span class="mk">**</span><strong>$1</strong><span class="mk">**</span>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<span class="mk">*</span><em>$2</em><span class="mk">*</span>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1<span class="mk">_</span><em>$2</em><span class="mk">_</span>');
    s = s.replace(/~~([^~]+)~~/g, '<span class="mk">~~</span><del>$1</del><span class="mk">~~</span>');
    s = s.replace(/==([^=]+)==/g, '<span class="mk">==</span><mark>$1</mark><span class="mk">==</span>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="mk">[</span><a href="$2">$1</a><span class="mk">]($2)</span>');
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[+i]);
    return s;
  }

  /* ---------- caret helpers ---------- */
  function getCaret(el){
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer)) return null;
    const pre = r.cloneRange();
    pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  function setCaret(el, off){
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node, count = 0;
    while (node = walker.nextNode()) {
      const len = node.textContent.length;
      if (count + len >= off) {
        const r = document.createRange();
        r.setStart(node, Math.max(0, off - count)); r.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); return;
      }
      count += len;
    }
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  /* ---------- block DOM ---------- */
  function idx(id){ return blocks.findIndex(b => b.id === id); }
  function blockFromEl(node){ const el = node.closest(".block"); return el ? blocks[idx(el.dataset.id)] : null; }
  function elFor(id){ return editorEl.querySelector('.block[data-id="'+id+'"]'); }

  function buildBlock(b){
    const el = document.createElement("div");
    el.className = "block"; el.dataset.id = b.id; el.dataset.type = b.type;
    const gutter = '<div class="gutter"><span class="handle" draggable="true" title="拖动重排">⠿</span></div>';

    if (b.type === "divider") {
      el.innerHTML = gutter + '<div class="rule"></div>';
      el.tabIndex = 0; return el;
    }
    if (b.type === "image") {
      el.innerHTML = gutter + '<div class="img-ph"><div class="ic">▣</div><div class="lbl">点击或拖入图片 · image.png</div></div>';
      return el;
    }
    if (b.type === "table") {
      const head = (b.meta.head || ["列 1","列 2","列 3"]);
      const rows = (b.meta.rows || [["","",""],["","",""]]);
      let h = "<thead><tr>" + head.map(c => '<th class="cell" contenteditable="true">'+esc(c)+'</th>').join("") + "</tr></thead>";
      let bd = "<tbody>" + rows.map(r => "<tr>" + r.map(c => '<td class="cell" contenteditable="true">'+esc(c)+'</td>').join("") + "</tr>").join("") + "</tbody>";
      el.innerHTML = gutter + '<table class="md-table">' + h + bd + "</table>";
      return el;
    }

    const content = '<div class="block-content" contenteditable="true" '+(b.type==="code"?'spellcheck="false" ':'')+'data-ph="输入正文，或按 “/” 唤起块菜单…"></div>';
    if (b.type === "todo") {
      el.innerHTML = gutter + '<div class="check"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg></div>' + content;
      if (b.meta.checked) el.classList.add("done");
    } else if (b.type === "callout") {
      el.innerHTML = gutter + '<div class="callout-box"><div class="callout-ic">✦</div>' + content + '</div>';
    } else if (b.type === "code") {
      el.innerHTML = gutter + '<div class="code-wrap"><div class="code-bar"><button class="lang">'+(b.meta.lang||"text")+'</button><span class="copy">复制</span></div>' + content + '</div>';
    } else {
      el.innerHTML = gutter + content;
    }
    paintContent(el, b);
    return el;
  }

  function paintContent(el, b){
    const c = el.querySelector(".block-content"); if (!c) return;
    const editing = el.classList.contains("editing");
    if (b.type === "code") {
      if (editing) c.textContent = b.text;
      else c.innerHTML = renderCode(b);
    } else {
      c.innerHTML = renderInline(b.text);
    }
  }

  function renderCode(b){
    const lang = b.meta.lang || "text";
    if (window.hljs && lang !== "text") {
      try { return hljs.highlight(b.text, { language: lang, ignoreIllegal: true }).value; } catch(e){}
    }
    return esc(b.text);
  }

  function rerenderBlock(b){
    const old = elFor(b.id); if (!old) return;
    const fresh = buildBlock(b);
    if (old.classList.contains("editing")) { fresh.classList.add("editing"); paintContent(fresh, b); }
    old.replaceWith(fresh); renumber();
  }

  function renderAll(){
    editorEl.innerHTML = "";
    blocks.forEach(b => editorEl.appendChild(buildBlock(b)));
    renumber();
  }

  function renumber(){
    let n = 0;
    [...editorEl.children].forEach(el => {
      if (el.dataset.type === "numbered") { n++; el.dataset.num = n; }
      else n = 0;
    });
  }

  /* ---------- focus / navigation ---------- */
  function focusBlock(id, off){
    const el = elFor(id); if (!el) return;
    const c = el.querySelector(".block-content");
    if (!c) { el.focus(); return; }
    el.classList.add("editing");
    if (blocks[idx(id)].type === "code") c.textContent = blocks[idx(id)].text;
    setCaret(c, off == null ? (blocks[idx(id)].text.length) : off);
  }

  /* ---------- transforms ---------- */
  function maybeTransform(b, content){
    const t = b.text;
    const apply = (type, strip, meta) => {
      b.type = type; b.text = t.slice(strip); if (meta) b.meta = Object.assign({}, b.meta, meta);
      rerenderBlock(b); focusBlock(b.id, 0); dirty(); return true;
    };
    if (/^###\s/.test(t)) return apply("h3", 4);
    if (/^##\s/.test(t))  return apply("h2", 3);
    if (/^#\s/.test(t))   return apply("h1", 2);
    if (/^>\s/.test(t))   return apply("quote", 2);
    if (/^[-*]\s\[[ xX]\]\s/.test(t)) { const ch = /\[[xX]\]/.test(t); return apply("todo", t.indexOf("]")+2, { checked: ch }); }
    if (/^\[[ xX]?\]\s/.test(t))      { const ch = /\[[xX]\]/.test(t); return apply("todo", t.indexOf("]")+2, { checked: ch }); }
    if (/^[-*]\s/.test(t)) return apply("bullet", 2);
    if (/^\d+\.\s/.test(t)) return apply("numbered", t.indexOf(".")+2);
    if (t === "---" || t === "***") { b.type = "divider"; b.text = ""; b.meta = {}; rerenderBlock(b); ensureTrailing(); dirty(); return true; }
    if (t === "```") { b.type = "code"; b.text = ""; b.meta = { lang: "javascript" }; rerenderBlock(b); focusBlock(b.id, 0); dirty(); return true; }
    return false;
  }

  function ensureTrailing(){
    const last = blocks[blocks.length - 1];
    if (!last || ATOMIC.includes(last.type)) {
      const nb = B("paragraph", ""); blocks.push(nb);
      editorEl.appendChild(buildBlock(nb)); focusBlock(nb.id, 0);
    }
  }

  /* ---------- input ---------- */
  function onInput(e){
    const c = e.target.closest(".block-content");
    if (!c) {
      if (e.target.classList.contains("cell")) { dirty(); stats(); }
      return;
    }
    const b = blockFromEl(c); if (!b) return;
    b.text = c.textContent;
    if (b.type === "code") { dirty(); stats(); return; }
    if (isComposing) { dirty(); return; }
    if (maybeTransform(b, c)) { stats(); return; }
    const off = getCaret(c);
    c.innerHTML = renderInline(b.text);
    setCaret(c, off);
    dirty(); stats();
  }

  /* ---------- keydown ---------- */
  function onKey(e){
    const c = e.target.closest(".block-content");
    if (!c) return;
    const b = blockFromEl(c); if (!b) return;

    if (e.key === "Enter" && !e.shiftKey) {
      if (b.type === "code") { e.preventDefault(); document.execCommand("insertText", false, "\n"); return; }
      e.preventDefault();
      const off = getCaret(c) || 0;
      const left = b.text.slice(0, off), right = b.text.slice(off);
      const listType = ["bullet","numbered","todo"].includes(b.type);
      if (listType && b.text.trim() === "") { // empty list item -> exit
        b.type = "paragraph"; b.meta = {}; rerenderBlock(b); focusBlock(b.id, 0); dirty(); return;
      }
      b.text = left;
      let newType = "paragraph", meta = {};
      if (listType) { newType = b.type; if (b.type === "todo") meta = { checked: false }; }
      const nb = B(newType, right, meta);
      const i = idx(b.id);
      blocks.splice(i + 1, 0, nb);
      rerenderBlock(b);
      elFor(b.id).after(buildBlock(nb));
      renumber();
      focusBlock(nb.id, 0);
      dirty(); stats(); return;
    }

    if (e.key === "Backspace") {
      const off = getCaret(c);
      const sel = window.getSelection();
      if (off === 0 && sel.isCollapsed) {
        if (b.type !== "paragraph" && TEXT_TYPES.includes(b.type)) {
          e.preventDefault(); b.type = "paragraph"; b.meta = {}; rerenderBlock(b); focusBlock(b.id, 0); dirty(); return;
        }
        e.preventDefault(); mergePrev(b); return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (b.type === "code") document.execCommand("insertText", false, "  ");
      return;
    }

    if (e.key === "ArrowUp") {
      if (getCaret(c) === 0) { const p = blocks[idx(b.id) - 1]; if (p) { e.preventDefault(); focusEditable(p, "end"); } }
    }
    if (e.key === "ArrowDown") {
      if (getCaret(c) === b.text.length) { const n = blocks[idx(b.id) + 1]; if (n) { e.preventDefault(); focusEditable(n, "start"); } }
    }
  }

  function focusEditable(b, where){
    if (TEXT_TYPES.includes(b.type) || b.type === "code") focusBlock(b.id, where === "end" ? b.text.length : 0);
    else { const el = elFor(b.id); el && el.focus(); }
  }

  function mergePrev(b){
    const i = idx(b.id); if (i <= 0) return;
    const prev = blocks[i - 1];
    if (ATOMIC.includes(prev.type)) {
      if (b.text === "") { blocks.splice(i, 1); elFor(b.id).remove(); const el = elFor(prev.id); el && el.focus(); renumber(); dirty(); }
      return;
    }
    const j = prev.text.length;
    prev.text += b.text;
    blocks.splice(i, 1);
    elFor(b.id).remove();
    rerenderBlock(prev);
    focusBlock(prev.id, j);
    dirty(); stats();
  }

  /* ---------- focus in/out ---------- */
  function onFocusIn(e){
    const c = e.target.closest(".block-content"); if (!c) return;
    const el = c.closest(".block"); el.classList.add("editing");
    const b = blocks[idx(el.dataset.id)];
    if (b && b.type === "code") { const off = getCaret(c); c.textContent = b.text; }
    cb.onActive && cb.onActive(b);
  }
  function onFocusOut(e){
    const c = e.target.closest(".block-content"); if (!c) return;
    const el = c.closest(".block"); el.classList.remove("editing");
    const b = blocks[idx(el.dataset.id)]; if (!b) return;
    if (b.type === "code") c.innerHTML = renderCode(b);
  }

  /* ---------- clicks (todo, code bar, image) ---------- */
  function onClick(e){
    const check = e.target.closest(".check");
    if (check) {
      const el = check.closest(".block"); const b = blocks[idx(el.dataset.id)];
      b.meta.checked = !b.meta.checked; el.classList.toggle("done", b.meta.checked); dirty(); return;
    }
    const lang = e.target.closest(".lang");
    if (lang) {
      const el = lang.closest(".block"); const b = blocks[idx(el.dataset.id)];
      const langs = ["javascript","python","typescript","html","css","json","bash","go","rust","sql","text"];
      const cur = langs.indexOf(b.meta.lang); b.meta.lang = langs[(cur + 1) % langs.length];
      lang.textContent = b.meta.lang;
      if (!el.classList.contains("editing")) el.querySelector(".block-content").innerHTML = renderCode(b);
      dirty(); return;
    }
    const copy = e.target.closest(".copy");
    if (copy) {
      const el = copy.closest(".block"); const b = blocks[idx(el.dataset.id)];
      navigator.clipboard && navigator.clipboard.writeText(b.text);
      copy.textContent = "已复制"; setTimeout(() => copy.textContent = "复制", 1200); return;
    }
    const div = e.target.closest('.block[data-type="divider"]');
    if (div) { editorEl.querySelectorAll(".block.sel").forEach(x => x.classList.remove("sel")); div.classList.add("sel"); }
  }

  /* ---------- drag reorder + drop-to-insert ---------- */
  let dropLine = null, dragId = null;
  function clearDrop(){ if (dropLine) { dropLine.remove(); dropLine = null; } }
  function onDragStart(e){
    const h = e.target.closest(".handle");
    if (h) { const el = h.closest(".block"); dragId = el.dataset.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("margin/move", dragId); }
  }
  function onDragEnd(){ editorEl.querySelectorAll(".dragging").forEach(x => x.classList.remove("dragging")); clearDrop(); dragId = null; }
  function dropTarget(y){
    const kids = [...editorEl.children].filter(k => k.classList.contains("block"));
    for (const k of kids) { const r = k.getBoundingClientRect(); if (y < r.top + r.height / 2) return k; }
    return null;
  }
  function onDragOver(e){
    if (!e.dataTransfer) return;
    const types = e.dataTransfer.types || [];
    if (![...types].some(t => t === "margin/move" || t === "margin/new")) return;
    e.preventDefault();
    if (!dropLine) { dropLine = document.createElement("div"); dropLine.className = "drop-line"; }
    const before = dropTarget(e.clientY);
    if (before) editorEl.insertBefore(dropLine, before); else editorEl.appendChild(dropLine);
  }
  function onDrop(e){
    const before = dropLine ? dropLine.nextElementSibling : null;
    const beforeId = before && before.classList && before.classList.contains("block") ? before.dataset.id : null;
    clearDrop();
    const moveId = e.dataTransfer.getData("margin/move");
    const newType = e.dataTransfer.getData("margin/new");
    if (moveId) {
      e.preventDefault();
      const from = idx(moveId); if (from < 0) return;
      const [m] = blocks.splice(from, 1);
      let to = beforeId ? idx(beforeId) : blocks.length;
      blocks.splice(to, 0, m);
      renderAll(); dirty();
    } else if (newType) {
      e.preventDefault();
      const at = beforeId ? idx(beforeId) : blocks.length;
      insertAt(newType, at);
    }
    onDragEnd();
  }

  /* ---------- insert API ---------- */
  function makeBlock(type){
    if (type === "table") return B("table", "", { head: ["列 1","列 2","列 3"], rows: [["","",""],["","",""]] });
    if (type === "code") return B("code", "", { lang: "javascript" });
    if (type === "callout") return B("callout", "");
    return B(type, "", type === "todo" ? { checked: false } : {});
  }
  function insertAt(type, at){
    const nb = makeBlock(type);
    blocks.splice(at, 0, nb);
    renderAll();
    if (TEXT_TYPES.includes(type)) focusBlock(nb.id, 0);
    else if (type === "table") { const cell = elFor(nb.id).querySelector(".cell"); cell && cell.focus(); }
    dirty(); stats();
    return nb;
  }
  function insertAfterActive(type){
    let at = blocks.length;
    const editing = editorEl.querySelector(".block.editing");
    if (editing) at = idx(editing.dataset.id) + 1;
    return insertAt(type, at);
  }
  // replace the active empty paragraph (for slash command)
  function replaceActive(type){
    const editing = editorEl.querySelector(".block.editing");
    if (editing) {
      const b = blocks[idx(editing.dataset.id)];
      if (b && b.type === "paragraph") {
        const at = idx(b.id);
        blocks.splice(at, 1);
        const nb = makeBlock(type);
        blocks.splice(at, 0, nb);
        renderAll();
        if (TEXT_TYPES.includes(type)) focusBlock(nb.id, 0);
        else if (type === "table") { const cell = elFor(nb.id).querySelector(".cell"); cell && cell.focus(); }
        dirty(); stats(); return nb;
      }
    }
    return insertAfterActive(type);
  }

  /* ---------- stats ---------- */
  function stats(){
    const text = editorEl.innerText || "";
    const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
    const chars = text.replace(/\s+/g, "").length;
    const total = cjk + words;
    const minutes = Math.max(1, Math.round(total / 320));
    cb.onStats && cb.onStats({ chars, words: total, minutes, blocks: blocks.length });
  }
  let dirtyT = null;
  function dirty(){ cb.onDirty && cb.onDirty(); }

  /* ---------- public ---------- */
  window.MarginEditor = {
    init(containerEl, callbacks){
      container = containerEl; cb = callbacks || {};
      editorEl = container;
      container.addEventListener("input", onInput);
      container.addEventListener("keydown", onKey);
      container.addEventListener("focusin", onFocusIn);
      container.addEventListener("focusout", onFocusOut);
      container.addEventListener("click", onClick);
      container.addEventListener("compositionstart", () => { isComposing = true; });
      container.addEventListener("compositionend", (e) => {
        isComposing = false;
        const c = e.target.closest && e.target.closest(".block-content"); if (!c) { dirty(); stats(); return; }
        const b = blockFromEl(c); if (!b) return; b.text = c.textContent;
        if (b.type === "code") { dirty(); stats(); return; }
        if (maybeTransform(b, c)) { stats(); return; }
        const off = getCaret(c); c.innerHTML = renderInline(b.text); setCaret(c, off); dirty(); stats();
      });
      container.addEventListener("dragstart", onDragStart);
      container.addEventListener("dragend", onDragEnd);
      container.addEventListener("dragover", onDragOver);
      container.addEventListener("drop", onDrop);
      container.addEventListener("dragleave", (e) => { if (e.relatedTarget === null) clearDrop(); });
    },
    load(md){ blocks = parseMarkdown(md); renderAll(); stats(); },
    insert(type){ return insertAfterActive(type); },
    replaceOrInsert(type){ return replaceActive(type); },
    focusFirst(){ const b = blocks.find(x => TEXT_TYPES.includes(x.type)); if (b) focusBlock(b.id, 0); },
    refreshStats: stats,
  };
})();
