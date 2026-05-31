/* ============ MARGIN — settings ============ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  let pane = "appearance";
  let overlay = null;

  /* ---------- persistence + apply ---------- */
  function load(){
    try {
      const raw = localStorage.getItem("margin-settings");
      if (raw) SETTINGS = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {}
  }
  function save(){ localStorage.setItem("margin-settings", JSON.stringify(SETTINGS)); }

  function apply(){
    const s = SETTINGS;
    const root = document.documentElement;
    root.setAttribute("data-theme", s.theme);
    const a = ACCENTS[s.accent] || ACCENTS.gold;
    const L = s.theme === "light" ? 0.60 : 0.82;
    const st = root.style;
    st.setProperty("--accent", `oklch(${L} ${a.c} ${a.h})`);
    st.setProperty("--accent-soft", `oklch(${L} ${a.c} ${a.h} / 0.14)`);
    st.setProperty("--accent-line", `oklch(${L} ${a.c} ${a.h} / 0.32)`);
    st.setProperty("--accent-ink", s.theme === "light" ? `oklch(0.99 0.02 ${a.h})` : `oklch(0.30 0.05 ${a.h})`);
    st.setProperty("--sel", `oklch(${L} ${a.c} ${a.h} / 0.20)`);
    const f = FONTS[s.font] || FONTS.sans;
    st.setProperty("--editor-font", f.stack);
    st.setProperty("--editor-size", s.size + "px");
    st.setProperty("--editor-leading", String(s.leading));
    st.setProperty("--editor-width", s.width + "px");
  }

  /* ---------- overlay ---------- */
  function ensure(){
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "set-overlay";
    overlay.innerHTML =
      '<div class="set-card">' +
        '<div class="set-bar"><span class="set-dots"><i></i><i></i><i></i></span><b>设置</b><button class="set-close" title="关闭 (Esc)">✕</button></div>' +
        '<div class="set-main">' +
          '<nav class="set-nav">' +
            '<button data-pane="appearance">外观</button>' +
            '<button data-pane="editor">编辑器</button>' +
            '<button data-pane="files">文件</button>' +
            '<button data-pane="about">关于</button>' +
          '</nav>' +
          '<div class="set-content" id="set-content"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".set-close").onclick = close;
    overlay.querySelectorAll(".set-nav button").forEach(b => b.onclick = () => { pane = b.dataset.pane; renderNav(); renderPane(); });
  }
  function renderNav(){ overlay.querySelectorAll(".set-nav button").forEach(b => b.classList.toggle("active", b.dataset.pane === pane)); }
  function open(){ ensure(); renderNav(); renderPane(); overlay.classList.add("show"); }
  function close(){ if (overlay) overlay.classList.remove("show"); }

  /* ---------- panes ---------- */
  const group = (title, ...rows) => '<div class="set-group"><div class="set-gt">' + title + '</div>' + rows.join("") + '</div>';
  const row = (label, sub, control) =>
    '<div class="set-row"><div class="set-lab"><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div><div class="set-ctl">' + control + '</div></div>';

  function seg(name, options){ // options: [[val,label],...]
    return '<div class="seg" data-seg="' + name + '">' +
      options.map(o => '<button data-v="' + o[0] + '"' + (SETTINGS[name] === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join("") + '</div>';
  }

  function renderPane(){
    const c = $("#set-content"); if (!c) return;
    if (pane === "appearance") renderAppearance(c);
    else if (pane === "editor") renderEditor(c);
    else if (pane === "files") renderFiles(c);
    else renderAbout(c);
  }

  function renderAppearance(c){
    const swatches = Object.entries(ACCENTS).map(([k, a]) => {
      const col = `oklch(${SETTINGS.theme === "light" ? 0.60 : 0.82} ${a.c} ${a.h})`;
      return '<button class="swatch' + (SETTINGS.accent === k ? ' on' : '') + '" data-acc="' + k + '" title="' + a.name + '"><i style="background:' + col + '"></i><span>' + a.name + '</span></button>';
    }).join("");
    c.innerHTML =
      group("主题", row("外观模式", "深色更适合长时间夜间写作", seg("theme", [["dark", "深色"], ["light", "浅色"]]))) +
      group("强调色", '<div class="set-row"><div class="set-lab"><span>颜色</span><small>用于光标块、选中、链接等</small></div></div><div class="swatches">' + swatches + '</div>');
    c.querySelectorAll('.seg[data-seg="theme"] button').forEach(b => b.onclick = () => set("theme", b.dataset.v, true));
    c.querySelectorAll('.swatch').forEach(b => b.onclick = () => set("accent", b.dataset.acc));
  }

  function renderEditor(c){
    const fonts = Object.entries(FONTS).map(([k, f]) =>
      "<button data-font='" + k + "'" + (SETTINGS.font === k ? " class='on'" : "") + " style='font-family:" + f.stack + "'>" + f.name + "</button>").join("");
    c.innerHTML =
      group("排版",
        row("正文字体", "", '<div class="font-grid">' + fonts + '</div>'),
        row("字号", "", slider("size", 14, 22, 1, "px")),
        row("行距", "", slider("leading", 1.4, 2.0, 0.02, "")),
        row("行宽", "", slider("width", 560, 900, 20, "px"))
      ) +
      group("预览", '<div class="set-preview"><div class="pv-h">标题示例</div><p>这是 <strong>正文</strong> 与 <em>强调</em> 的实时预览，<code>inline code</code> 也在其中。调整上面的设置即时生效。</p></div>');
    c.querySelectorAll('.font-grid button').forEach(b => b.onclick = () => set("font", b.dataset.font));
    wireSliders(c);
    refreshPreview(c);
  }

  function slider(name, min, max, step, unit){
    return '<div class="sld"><input type="range" data-sld="' + name + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + SETTINGS[name] + '"><span class="sld-v" data-sldv="' + name + '">' + fmt(SETTINGS[name], unit) + '</span></div>';
  }
  const fmt = (v, unit) => unit === "px" ? Math.round(v) + " px" : (Math.round(v * 100) / 100);
  function wireSliders(c){
    c.querySelectorAll('input[data-sld]').forEach(inp => {
      const name = inp.dataset.sld;
      const unit = name === "leading" ? "" : "px";
      inp.addEventListener("input", () => {
        SETTINGS[name] = name === "leading" ? parseFloat(inp.value) : parseInt(inp.value, 10);
        c.querySelector('[data-sldv="' + name + '"]').textContent = fmt(SETTINGS[name], unit);
        apply(); save(); refreshPreview(c);
      });
    });
  }
  function refreshPreview(c){
    const pv = c.querySelector(".set-preview");
    if (pv) { pv.style.fontFamily = "var(--editor-font)"; pv.style.fontSize = SETTINGS.size + "px"; pv.style.lineHeight = SETTINGS.leading; }
  }

  function renderFiles(c){
    const list = (SETTINGS.ignore || []).map((p, i) =>
      '<div class="ig-item"><span class="ig-pat">' + p + '</span><button class="ig-del" data-i="' + i + '">✕</button></div>').join("");
    c.innerHTML =
      group("可见性",
        row("显示被忽略的文件", "以淡化样式在文件树中显示", toggle("showIgnored"))
      ) +
      group("忽略规则",
        '<div class="set-hint">匹配的文件 / 文件夹不会出现在文件树中。支持精确名（<code>.DS_Store</code>）、通配（<code>*.tmp</code>）、文件夹（<code>.obsidian/</code>）。</div>' +
        '<div class="ig-list">' + (list || '<div class="set-hint" style="padding:6px 2px">暂无规则</div>') + '</div>' +
        '<div class="ig-add"><input id="ig-input" placeholder="新增规则，如  *.log" /><button id="ig-add-btn">添加</button></div>'
      );
    c.querySelector(".toggle").onclick = () => { SETTINGS.showIgnored = !SETTINGS.showIgnored; save(); c.querySelector(".toggle").classList.toggle("on", SETTINGS.showIgnored); reTree(); };
    c.querySelectorAll(".ig-del").forEach(b => b.onclick = () => { SETTINGS.ignore.splice(+b.dataset.i, 1); save(); renderPane(); reTree(); });
    const inp = c.querySelector("#ig-input");
    const add = () => { const v = inp.value.trim(); if (v && !SETTINGS.ignore.includes(v)) { SETTINGS.ignore.push(v); save(); renderPane(); reTree(); } };
    c.querySelector("#ig-add-btn").onclick = add;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  }
  function toggle(name){ return '<button class="toggle' + (SETTINGS[name] ? ' on' : '') + '" data-t="' + name + '"><i></i></button>'; }

  function renderAbout(c){
    c.innerHTML =
      group("Margin",
        '<div class="about"><div class="about-mark">M</div><div><div class="about-name">Margin</div><div class="about-ver">版本 0.1 · 块编辑 Markdown 编辑器</div><p>所见即所得的 Markdown 编辑，块库抽屉，完整文件树。灵感来自 Obsidian、熊掌记与 Typora。</p></div></div>') +
      group("快捷键",
        kv("⌘ \\", "开关块库抽屉") + kv("⌘ ,", "打开设置") + kv("/", "唤起插入块菜单") + kv("# / ## / -", "实时转换块类型") + kv("⌘ B", "开关文件树"));
  }
  const kv = (k, v) => '<div class="kv"><span class="kk">' + k + '</span><span class="kv-v">' + v + '</span></div>';

  /* ---------- setters ---------- */
  function set(name, val, syncTheme, noRerender){
    SETTINGS[name] = val; apply(); save();
    if (syncTheme && window.MarginApp) MarginApp.syncThemeBtn();
    if (!noRerender) renderPane();
    else { const t = overlay.querySelector('.toggle'); t && t.classList.toggle('on', !!SETTINGS[name]); }
  }
  function reTree(){ if (window.MarginApp) MarginApp.renderTree(); }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay && overlay.classList.contains("show")) close(); });

  window.MarginSettings = { load, save, apply, open, close };
})();
