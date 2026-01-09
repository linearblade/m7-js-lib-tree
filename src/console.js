let TreeInspector = null;

function install(cls) {
    TreeInspector = cls;
}


function openConsole(
    lib,
    {
	mount = document.body,
	title = "m7 Tree Console",
	rootName = null,       // if null, we infer it
	maxDepth = 25,
	rootVar = window,      // optional: where to scan globals from (default window)
	name = null,           // optional override
    } = {}
) {

    const defaultRoot = window??null;                          
    const defaultRootName = inferRootName(defaultRoot, { fallback: "root" });
    if (!lib) throw new Error("[tree.console] lib is required");
    if (!TreeInspector) throw new Error("[console] TreeInspector not installed");
    
    // choose a root label:
    // 1) explicit name option
    // 2) infer from rootVar (typically window) matching `lib`
    // 3) fallback "root"
    const inferred =
	  name ??
	  inferRootName(lib, { globals: true, fallback: "root" });

    const rootLabel     = rootName ?? inferred;
    let currentRootPath = rootLabel;   // <-- full path label for tree view
    
    const inspector     = new TreeInspector(lib, { autoParse: false,name:rootLabel });
    inspector.parse({ name: rootLabel, maxDepth });

    let currentRoot     = lib;                 // whatever you initially opened with
    let currentRootName = rootLabel; //inspector.tree?.name || "root"; // just for display / parse
    //let currentRootPath = currentRootName; // default, overridden when we know better
    const expanded      = new Set(); // paths that are expanded
    //backbutton / up 1 dir stuff
    const rootStack = []; // previous roots (values + labels)
    const BASE_VARS = new Set(["lib"]); // add more later if you want
    
    /*
      {
      mount = document.body,
      title = "m7 Tree Console",
      rootName = "root",
      maxDepth = 25,
\      rootVar  = window
      } = {}) {
      const name = opts.name ?? inferRootName(rootVar);

      if (!lib) throw new Error("[tree.console] lib is required");
      if (!TreeInspector) 
      throw new Error("[console] TreeInspector not installed");
      
      const inspector = new TreeInspector(lib, { autoParse: false });
      inspector.parse({ name: rootName, maxDepth });
    */
    // ---------- DOM ----------
    const el = document.createElement("div");
    enableToggle(el);
    
    el.style.cssText = `
    position: fixed; right: 12px; bottom: 12px;
    width: 780px; height: 520px;
    background: rgba(20,20,20,0.92);
    color: #eee; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    overflow: hidden;
    z-index: 999999;
  `;

    el.innerHTML = `
  <!-- HEADER -->
  <div data-head
       style="display:flex; align-items:center; gap:10px; padding:10px 12px;
              border-bottom:1px solid rgba(255,255,255,0.12);">
    <div style="font-weight:700;">${escapeHtml(title)}</div>
<button data-treeview title="tree view" style="${btnCss()}">🌳</button>
<button data-setroot title="use input as root" style="${btnCss()}">🎯</button> <!-- set target -->
    <button data-reparse style="${btnCss()}">🔄</button> <!-- reparse -->

<input data-q placeholder="find… (name or path)" style="
  flex:1; min-width:200px; background: rgba(255,255,255,0.08); color:#fff;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  padding: 6px 8px; outline: none;
"/>

    <button data-search style="${btnCss()}">🔍</button>
    <button data-close style="${btnCss()}">×</button>
  </div>

  <!-- BODY -->
  <div data-body
       style="display:grid; grid-template-columns: 1.1fr 1fr;
              height: calc(100% - 46px);">
    <div data-tree
         style="overflow:auto; padding:10px 12px; max-height:80vh;
                border-right:1px solid rgba(255,255,255,0.12);"></div>
    <div data-detail
         style="overflow:auto; padding:10px 12px;"></div>
  </div>
`;

    /*
      el.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.12);">
      <div style="font-weight:700;">${escapeHtml(title)}</div>
      <input data-q placeholder="find… (name or path)" style="
      flex:1; background: rgba(255,255,255,0.08); color:#fff;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
      padding: 6px 8px; outline: none;
      "/>
      <button data-reparse style="${btnCss()}">reparse</button>
      <button data-close style="${btnCss()}">×</button>
      </div>

      <div style="display:grid; grid-template-columns: 1.1fr 1fr; height: calc(100% - 46px);">
      <div data-tree style="overflow:auto; padding:10px 12px; border-right:1px solid rgba(255,255,255,0.12);"></div>
      <div data-detail style="overflow:auto; padding:10px 12px;"></div>
      </div>
      `;*/

    const treeEl = el.querySelector("[data-tree]");
    const detailEl = el.querySelector("[data-detail]");
    const qEl = el.querySelector("[data-q]");
    const searchEl = el.querySelector("[data-search]");
    
    const treeBtn = el.querySelector("[data-treeview]");
    treeBtn.onclick = () => renderFullTree();
    treeBtn.onclick = () => renderCollapsibleTree();
    
    el.querySelector("[data-close]").onclick = () => {
	disableToggle(el);
	el.remove();
    };
    
    //el.querySelector("[data-close]").onclick = () => el.remove();

    el.querySelector("[data-reparse]").onclick = () => {
	setRoot(currentRoot, currentRootName, { pushHistory: false });
	setDetail({ note: "Re-parsed." });
    };
    /*
    //old sauce
    el.querySelector("[data-reparse]").onclick = () => {
    inspector.parse({ name: rootName, maxDepth });
    renderTree();
    setDetail({ note: "Re-parsed." });
    };
    */
    const searchFunc = () => {
	const q = qEl.value.trim();
	if (!q) return;
	const hits = inspector.find(q, { match: "both", limit: 80 });
	renderFindResults(q, hits);
    } ;
    el.querySelector("[data-search]").onclick = searchFunc;
    qEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
	    searchFunc();
	}
    });

    const setRootBtn = el.querySelector("[data-setroot]");
    setRootBtn.onclick = () => {
	const val = resolveRootSelector(qEl.value);
	//console.log(`set root val ${val}`,val);
	if (!val) {
	    // show a message in detail panel
	    detailEl.innerHTML = `<div style="color:#ffb3b3;">Not found: ${escapeHtml(qEl.value)}</div>`;
	    return;
	}
	// label is the raw input (nice: if they typed "window.lib", name becomes that)
	setRoot(val, qEl.value.trim());
    };

    qEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
	    setRootBtn.click();
	}
    });
    
    mount.appendChild(el);


    // ----- back or up dir ----

    function isBaseVarRoot() {
	return (
	    BASE_VARS.has(currentRootName) ||
		(typeof window === "object" && window.lib && currentRoot === window.lib)
	);
    }
    
    function canGoUp() {
	// never show ../ when at window/globalThis
	if (currentRoot === window || currentRoot === globalThis) return false;

	// allow if we have history, or if we're at a base var (lib -> window)
	if (rootStack.length > 0) return true;
	if (BASE_VARS.has(currentRootName)) return true;

	return false;
    }

    function goUpOne() {
	// 1) if we have history, pop to previous root
	if (rootStack.length > 0) {
	    const prev = rootStack.pop();
	    setRoot(prev.value, prev.label, { pushHistory: false, path: prev.path });

	    //const prev = rootStack.pop();
	    //setRoot(prev.value, prev.label, { pushHistory: false });
	    return;
	}

	// 2) base-var fallback (lib -> window)
	if (BASE_VARS.has(currentRootName)) {
	    setRoot(window, "window", { pushHistory: false,path:  'window' }); //maybe defaultRootName later after cleaning
	    return;
	}

	// 3) otherwise no-op
    }
    
    
    // ----- root switching ----
function setRoot(newRoot, name = null, { pushHistory = true, fallbackToDefault = true, path = null } = {}) {
  if (newRoot == null) return false;

  // reject scalars early (prevents "locked" roots)
  const tt = typeof newRoot;
  const rootable = newRoot && (tt === "object" || tt === "function");
  if (!rootable) return false;

  // snapshot current known-good state
  const prev = {
    root: currentRoot,
    name: currentRootName,
    path: currentRootPath,     // ✅ ADD
    tree: inspector.tree,
    stackLen: rootStack.length,
  };

  const nextName = (name ?? inferRootName(newRoot, { fallback: "root" })) || "root";
  const nextPath = path ?? nextName; // ✅ ADD (fallback to label)

  try {
    // Attempt parse WITHOUT committing history/state yet
    inspector.rootRef = newRoot;
    inspector.options = inspector.options || {};
    inspector.options.name = nextName;

    inspector.parse({ name: nextName, maxDepth });

    // parse succeeded but still validate tree
    if (!inspector.tree) throw new Error("parse produced null tree");

    // Commit history only after success
    if (pushHistory && prev.root && prev.root !== newRoot) {
      rootStack.push({ value: prev.root, label: prev.name, path: prev.path }); // ✅ ADD path
    }

    // Commit current state
    currentRoot = newRoot;
    currentRootName = nextName;
    currentRootPath = nextPath; // ✅ ADD

    expanded.clear();
    expanded.add(currentRootName);

    renderCollapsibleTree();
    return true;

  } catch (err) {
    // Revert to previous known-good state
    currentRoot = prev.root;
    currentRootName = prev.name;
    currentRootPath = prev.path; // ✅ ADD

    inspector.rootRef = prev.root;
    inspector.options = inspector.options || {};
    inspector.options.name = prev.name;

    // restore stack length if we ever changed it (we shouldn't now, but safe)
    while (rootStack.length > prev.stackLen) rootStack.pop();

    // If previous tree existed, keep it; otherwise fall back to default root automatically
    if (prev.tree) {
      inspector.tree = prev.tree; // keep last good tree in memory
    } else if (fallbackToDefault) {
      // last resort: return home silently
      try {
        inspector.rootRef = defaultRoot;
        inspector.options.name = defaultRootName;
        inspector.parse({ name: defaultRootName, maxDepth });
        currentRoot = defaultRoot;
        currentRootName = defaultRootName;
        currentRootPath = defaultRootName; // ✅ ADD (or "window" etc if you prefer)
      } catch {}
    }

    // Re-render whatever state we have
    expanded.clear();
    expanded.add(currentRootName || "root");
    renderCollapsibleTree();

    // optional: show a small note instead of hard failure
    setDetail?.({ error: `Cannot set root: ${String(err?.message || err)}` });

    return false;
  }
}
    function setRoot_old4(newRoot, name = null, { pushHistory = true, fallbackToDefault = true, path=null } = {}) {
	if (newRoot == null) return false;

	// reject scalars early (prevents "locked" roots)
	const tt = typeof newRoot;
	const rootable = newRoot && (tt === "object" || tt === "function");
	if (!rootable) return false;

	// snapshot current known-good state
	const prev = {
	    root: currentRoot,
	    name: currentRootName,
	    tree: inspector.tree,
	    stackLen: rootStack.length,
	};

	const nextName = (name ?? inferRootName(newRoot, { fallback: "root" })) || "root";

	try {
	    // Attempt parse WITHOUT committing history/state yet
	    inspector.rootRef = newRoot;
	    inspector.options = inspector.options || {};
	    inspector.options.name = nextName;

	    inspector.parse({ name: nextName, maxDepth });

	    // parse succeeded but still validate tree
	    if (!inspector.tree) throw new Error("parse produced null tree");

	    // Commit history only after success
	    if (pushHistory && prev.root && prev.root !== newRoot) {
		rootStack.push({ value: prev.root, label: prev.name });
	    }

	    // Commit current state
	    currentRoot = newRoot;
	    currentRootName = nextName;

	    expanded.clear();
	    expanded.add(currentRootName);

	    renderCollapsibleTree();
	    return true;

	} catch (err) {
	    // Revert to previous known-good state
	    currentRoot = prev.root;
	    currentRootName = prev.name;

	    inspector.rootRef = prev.root;
	    inspector.options = inspector.options || {};
	    inspector.options.name = prev.name;

	    // restore stack length if we ever changed it (we shouldn't now, but safe)
	    while (rootStack.length > prev.stackLen) rootStack.pop();

	    // If previous tree existed, keep it; otherwise fall back to default root automatically
	    if (prev.tree) {
		inspector.tree = prev.tree; // keep last good tree in memory
	    } else if (fallbackToDefault) {
		// last resort: return home silently
		try {
		    inspector.rootRef = defaultRoot;
		    inspector.options.name = defaultRootName;
		    inspector.parse({ name: defaultRootName, maxDepth });
		    currentRoot = defaultRoot;
		    currentRootName = defaultRootName;
		} catch {}
	    }

	    // Re-render whatever state we have
	    expanded.clear();
	    expanded.add(currentRootName || "root");
	    renderCollapsibleTree();

	    // optional: show a small note instead of hard failure
	    setDetail?.({ error: `Cannot set root: ${String(err?.message || err)}` });

	    return false;
	}
    }
    
    function setRoot_old2(newRoot, name = null, { pushHistory = true } = {}) {
	if (!newRoot) return;

	if (pushHistory && currentRoot && currentRoot !== newRoot) {
	    rootStack.push({ value: currentRoot, label: currentRootName });
	}

	currentRoot = newRoot;
	currentRootName = name ?? inferRootName(newRoot, { fallback: "root" });

	inspector.rootRef = newRoot;
	inspector.options = inspector.options || {};
	inspector.options.name = currentRootName;

	inspector.parse({ name: currentRootName, maxDepth });

	expanded.clear();
	expanded.add(currentRootName);
	
	renderCollapsibleTree(); // your tree render entry point
    }
    
    function setRoot_old1(newRoot, name = null) {
	if (!newRoot) return;

	currentRoot = newRoot;

	// Pick a label for the parse root:
	// - explicit name if provided
	// - infer from globals if possible
	// - fallback "root"
	currentRootName = name ?? inferRootName(newRoot, { fallback: "root" });

	// Rebuild inspector on new root (simplest + cleanest)
	inspector.rootRef = newRoot;
	inspector.options = inspector.options || {};
	inspector.options.name = currentRootName;

	inspector.parse({ name: currentRootName, maxDepth });

	// reset UI state
	expanded.clear();
	expanded.add(currentRootName);

	renderCollapsibleTree(); // or whatever your tree render entry point is
    }

    function resolveRootSelector(selector) {
	const s = String(selector || "").trim();
	if (!s) return null;

	// allow "window" / "globalThis" / "lib" / "window.lib.utils"
	const base = globalThis; // browsers: window === globalThis

	// If they type a bare word like "lib", try:
	// 1) current root child
	// 2) globalThis child
	// 3) dot path from globalThis
	if (!s.includes(".")) {
	    if (currentRoot && s in currentRoot) return currentRoot[s];
	    if (s in base) return base[s];
	}

	// Dot path: walk from globalThis first (covers "window.lib", "lib.site", etc)
	const parts = s.split(".").filter(Boolean);
	let obj = base;

	for (const p of parts) {
	    if (obj == null) return null;
	    try {
		obj = obj[p];
	    } catch {
		return null;
	    }
	}

	return obj;
    }
    
    // ---------- Render ----------
    function renderTree() {
	// render only first level; click to navigate
	treeEl.innerHTML = "";
	const root = inspector.tree;
	if (!root) {
	    treeEl.textContent = "No tree. (parse failed?)";
	    return;
	}
	const ul = document.createElement("ul");
	ul.style.cssText = "list-style:none; padding-left: 0; margin:0;";
	ul.appendChild(renderNodeLine(root.name, root.type, root.name));
	for (const child of root.children || []) {
	    ul.appendChild(renderNodeLine(child.name, child.type, `${root.name}.${child.name}`));
	}
	treeEl.appendChild(ul);

	// auto select root
	showPath(root.name);
    }

    function renderFindResults(q, hits) {
	treeEl.innerHTML = "";
	const head = document.createElement("div");
	head.style.cssText = "margin-bottom:8px; opacity:0.9;";
	head.textContent = `find "${q}" → ${hits.length} hits`;
	treeEl.appendChild(head);

	const ul = document.createElement("ul");
	ul.style.cssText = "list-style:none; padding-left: 0; margin:0;";

	hits.forEach(h => {
	    const li = renderNodeLine(h.path, h.type, h.path, true);
	    ul.appendChild(li);
	});

	treeEl.appendChild(ul);
    }

    
    function renderNodeLine(label, type, path, faint = false) {
	const li = document.createElement("li");
	li.style.cssText = `
      color: yellow;
      padding: 4px 6px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      ${faint ? "opacity:0.92;" : ""}
    `;
	li.onmouseenter = () => li.style.background = "rgba(255,255,255,0.08)";
	li.onmouseleave = () => li.style.background = "transparent";
	li.onclick = () => showPath(path);

	const icon = iconFor(type);
	li.innerHTML = `<span style="opacity:0.95">${icon}</span> <span>${escapeHtml(label)}</span>`;
	return li;
    }

    function showPath(path) {
	const info = inspector.inspect(path, { includeRef: true, includeChildren: true, show: false });
	if (!info) {
	    setDetail({ error: `Not found: ${path}` });
	    return;
	}
	setDetail(info);
    }

    function setDetail(info) {
	if (info.error) {
	    detailEl.innerHTML = `<div style="color:#ffb3b3;">${escapeHtml(info.error)}</div>`;
	    return;
	}
	if (info.note) {
	    detailEl.innerHTML = `<div style="opacity:0.9;">${escapeHtml(info.note)}</div>`;
	    return;
	}

	const icon = iconFor(info.type);
	const sig = info.signature;
	//console.log(info);
	detailEl.innerHTML = `
        <div style="opacity:0.8;margin-bottom:5px">${escapeHtml(currentRootPath)}</div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <div style="font-size:18px;">${icon}</div>
        <div>
          <div style="font-weight:700;">${escapeHtml(info.path)}</div>
          <div style="opacity:0.75;">type: ${escapeHtml(info.type)} ${info.childCount ? ` • children: ${info.childCount}` : ""}</div>
        </div>
        <button data-up-root style="${chipCss()}">../</button> <!--⤴︎ -->
       ${ info?.ref &&  (info.type === "hash" || info.type === "array") ? `
            <button data-use-root style="${chipCss()}">🎯</button> <!-- set target -->
	    ` : "" }
      </div>

      ${sig ? `
            <div style="margin:10px 0; padding:8px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(255,255,255,0.05);">
            <div style="opacity:0.8; margin-bottom:6px;">signature</div>
            <div><b>${escapeHtml(sig.name || "(anonymous)")}</b> (${escapeHtml((sig.params || []).join(", "))})</div>
            <div style="opacity:0.75;">arity: ${sig.arity} ${sig.isNative ? " • native" : ""}</div>
            </div>
	    ` : ""}

      ${sig?.sourcePreview ? `
            <div style="margin:10px 0; padding:8px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(255,255,255,0.05);">
            <div style="opacity:0.8; margin-bottom:6px;">source preview</div>
            <pre style="white-space:pre-wrap; margin:0;">${escapeHtml(sig.sourcePreview)}</pre>
            </div>
	    ` : ""}

      ${info.valuePreview ? `
	    <div style="
               margin:10px 0;
               padding:8px;
               border:1px solid rgba(255,255,255,0.12);
               border-radius:10px;
               background:rgba(255,255,255,0.05);
             ">
	    <div style="opacity:0.8; margin-bottom:6px;">value</div>
	    <div style="white-space:pre-wrap;">${escapeHtml(info.valuePreview)}</div>
	    </div>
	    ` : ""}

      ${Array.isArray(info.children) && info.children.length ? `
            <div style="margin-top:10px;">
            <div style="opacity:0.8; margin-bottom:6px;">children</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${info.children.slice(0, 60).map(c => `
              <button data-path="${escapeAttr(
  (
    String(info.path || "") === currentRootName ||
    String(info.path || "").startsWith(currentRootName + ".")
  )
    ? (info.path + "." + c.name)
    : (currentRootName + "." + c.name)
)}"

style="${chipCss()}">
                ${escapeHtml(iconFor(c.type))} ${escapeHtml(c.name)}
              </button>
            `).join("")}
        </div>
            </div>
	    ` : `<div style="opacity:0.7;">(no children)</div>`}


    `;

	/*
	        ${Array.isArray(info.children) && info.children.length ? `
            <div style="margin-top:10px;">
            <div style="opacity:0.8; margin-bottom:6px;">children</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${info.children.slice(0, 60).map(c => `
              <button data-path="${escapeAttr(info.path + "." + c.name)}" style="${chipCss()}">
                ${escapeHtml(iconFor(c.type))} ${escapeHtml(c.name)}
              </button>
            `).join("")}
        </div>
            </div>
            ` : `<div style="opacity:0.7;">(no children)</div>`}
	 */
	
	const useRootBtn = detailEl.querySelector("[data-use-root]");
	if (useRootBtn) {
	    useRootBtn.onclick = () => {
		// If they are inspecting a node, its ref is the value we want to re-root to.
		setRoot(info.ref, info.name, {path:info.path}); // name becomes the last segment (e.g., "lib")
	    };
	}
	const upRootBtn = detailEl.querySelector("[data-up-root]");
	if (upRootBtn) {
	    if (!canGoUp()) {
		upRootBtn.style.display = "none";
	    } else {
		upRootBtn.onclick = () => goUpOne();
	    }
	}
	
	// wire child chips
	detailEl.querySelectorAll("button[data-path]").forEach(btn => {
	    btn.onclick = () => showPath(btn.getAttribute("data-path"));
	});
    }

    function iconFor(type) {
	return TreeInspector.ICONS[type] ??
	    (["string", "number", "boolean", "undefined", "symbol", "bigint"].includes(type)
             ? TreeInspector.ICONS.scalar
             : TreeInspector.ICONS.scalar);
    }

    function btnCss() {
	return `
      background: rgba(255,255,255,0.08);
      color:#fff;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 6px 10px;
      cursor:pointer;
    `;
    }

    function chipCss() {
	return `
      background: rgba(255,255,255,0.07);
      color:#fff;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px;
      padding: 4px 10px;
      cursor:pointer;
      font: inherit;
    `;
    }

    function escapeHtml(s) {
	return String(s ?? "")
	    .replaceAll("&", "&amp;")
	    .replaceAll("<", "&lt;")
	    .replaceAll(">", "&gt;")
	    .replaceAll('"', "&quot;")
	    .replaceAll("'", "&#039;");
    }
    function escapeAttr(s) {
	// minimal attribute escape (we already html-escape above)
	return escapeHtml(s).replaceAll("`", "&#096;");
    }


    // toggles minimize/restore on `~` / backtick
    function enableToggle(el, {
	hotkey = ["Backquote"],     // ` and ~ share the same physical key on US keyboards
	minimizeHeight = "44px",    // header-ish height
	ignoreWhenTyping = true,
    } = {}) {
	if (!el) throw new Error("[tree.console] enableToggle: missing el");

	// don't double-bind
	if (el.__m7Toggle?.enabled) return;

	const header = el.querySelector('[data-head]') || el.firstElementChild; // prefer data-head if you add it
	const body   = el.querySelector('[data-body]') || el.querySelector('[data-tree]')?.parentElement; // your grid wrapper
	const input  = el.querySelector("[data-q]");

	const state = {
	    enabled: true,
	    minimized: false,
	    prev: {
		height: el.style.height,
		minHeight: el.style.minHeight,
	    },
	    handler: null,
	};

	function setMinimized(on) {
	    state.minimized = !!on;

	    if (state.minimized) {
		// keep element visible, hide main body
		if (body) body.style.display = "none";
		el.style.height = minimizeHeight;
		el.style.minHeight = minimizeHeight;
		el.style.overflow = "hidden";
		el.setAttribute("data-minimized", "1");
	    } else {
		if (body) body.style.display = "";
		el.style.height = state.prev.height || "";
		el.style.minHeight = state.prev.minHeight || "";
		el.style.overflow = "";
		el.removeAttribute("data-minimized");
		// optional: focus search when re-opened
		if (input) input.focus?.();
	    }
	}

	state.handler = (e) => {
	    // only toggle on chosen key (Backquote)
	    if (!hotkey.includes(e.code)) return;
	    /*
	    // don't toggle if user is typing in an input/textarea/contenteditable
	    if (ignoreWhenTyping) {
	    const t = e.target;
	    const typing =
	    t &&
	    (t.tagName === "INPUT" ||
	    t.tagName === "TEXTAREA" ||
	    t.isContentEditable);
	    if (typing) return;
	    }
	    */
	    // avoid weird combos
	    if (e.ctrlKey || e.metaKey || e.altKey) return;

	    e.preventDefault();
	    setMinimized(!state.minimized);
	};

	window.addEventListener("keydown", state.handler, true);

	// expose controls on the element for other code paths
	el.__m7Toggle = {
	    enabled: true,
	    minimize: () => setMinimized(true),
	    restore: () => setMinimized(false),
	    toggle: () => setMinimized(!state.minimized),
	    get minimized() { return state.minimized; },
	    _state: state,
	};
    }

    function disableToggle(el) {
	if (!el?.__m7Toggle?.enabled) return;

	const state = el.__m7Toggle._state;
	try {
	    window.removeEventListener("keydown", state.handler, true);
	} catch {}

	// restore if minimized
	if (el.__m7Toggle.minimized) {
	    el.__m7Toggle.restore();
	}

	el.__m7Toggle.enabled = false;
	delete el.__m7Toggle;
    }


    function renderCollapsibleTree({
	root = inspector.tree,
	maxNodes = 2500,         // render cap per draw
	expandRoot = true,
    } = {}) {
	treeEl.innerHTML = "";

	if (!root) {
	    treeEl.textContent = "No tree. (parse failed?)";
	    return;
	}

	if (expandRoot) expanded.add(root.name);

	const head = document.createElement("div");
	head.style.cssText = "margin-bottom:8px; opacity:0.9; display:flex; gap:8px; align-items:center;";
	console.log('collapsible tree root' , root);
	head.innerHTML = `
          <span style="opacity:0.9;">
          root: <span style="opacity:1; font-weight:700;">${escapeHtml(root.name)}</span>
         </span>
         <button data-expandall style="${chipCss()}">expand all</button>
         <button data-collapseall style="${chipCss()}">collapse all</button>
       `;
	/*
	head.innerHTML = `
          <span style="opacity:0.9;">tree</span>
          <button data-up style="${chipCss()}">../</button>
          <button data-expandall style="${chipCss()}">expand all</button>
         <button data-collapseall style="${chipCss()}">collapse all</button>
	 `;
	 */
	treeEl.appendChild(head);
	/*
	const upBtn = head.querySelector("[data-up]");
	if (!canGoUp()) {
	    upBtn.style.display = "none";
	} else {
	    upBtn.onclick = () => goUpOne();
	}
	*/
	const ul = document.createElement("ul");
	ul.style.cssText = "list-style:none; padding-left: 0; margin:0;";
	treeEl.appendChild(ul);


	// current tree path
	if (canGoUp()) {
	    const liUp = document.createElement("li");
	    liUp.style.cssText = `
    display:flex;
    align-items:center;
    gap:6px;
    padding: 4px 6px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    opacity: 0.9;
   color:yellow;
  `;
	    liUp.onmouseenter = () => liUp.style.background = "rgba(255,255,255,0.08)";
	    liUp.onmouseleave = () => liUp.style.background = "transparent";
	    liUp.innerHTML = `
    <span style="width:16px; display:inline-flex; justify-content:center;">⬅︎</span>
    <span style="font-weight:700;">../</span>
    <span style="opacity:0.6;">up</span>
  `;
	    liUp.onclick = () => goUpOne();
	    ul.appendChild(liUp);
	}
	if(head.querySelector("[data-rootlabel]")?.onclick)
	    head.querySelector("[data-rootlabel]").onclick= () => showPath(root.name);
	
	// DFS stack; we push children in reverse to preserve order
	const stack = [{ node: root, path: root.name, depth: 0, isLast: true }];
	let count = 0;

	while (stack.length && count < maxNodes) {
	    const { node, path, depth } = stack.pop();
	    count++;

	    const isBranch = node && (node.type === "hash" || node.type === "array");
	    const isOpen = isBranch && expanded.has(path);
	    const kids = (node && node.children) ? node.children : [];

	    ul.appendChild(renderTreeRow({ node, path, depth, isBranch, isOpen , maxNodes}));

	    if (isBranch && isOpen && kids.length) {
		for (let i = kids.length - 1; i >= 0; i--) {
		    const child = kids[i];
		    stack.push({
			node: child,
			path: `${path}.${child.name}`,
			depth: depth + 1,
		    });
		}
	    }
	}

	if (count >= maxNodes) {
	    const warn = document.createElement("div");
	    warn.style.cssText = "margin-top:8px; opacity:0.7;";
	    warn.textContent = `…stopped at ${maxNodes} rendered nodes. Expand less / use find.`;
	    treeEl.appendChild(warn);
	}

	// wire expand/collapse all
	head.querySelector("[data-expandall]").onclick = () => {
	    // expand everything currently visible under root (bounded)
	    expandAllUnder(root, root.name, 5000);
	    renderCollapsibleTree({ root, maxNodes, expandRoot: false });
	};
	head.querySelector("[data-collapseall]").onclick = () => {
	    expanded.clear();
	    expanded.add(root.name);
	    renderCollapsibleTree({ root, maxNodes, expandRoot: false });
	};

	// show root details if nothing selected yet
	showPath(root.name);
    }

    function renderTreeRow({ node, path, depth, isBranch, isOpen,maxNodes }) {
	const li = document.createElement("li");
	li.style.cssText = `
    display:flex;
    align-items:center;
    gap:6px;
    padding: 4px 6px;
    border-radius: 8px;
    cursor: default;
    user-select: none;
    color:yellow;
  `;
	li.onmouseenter = () => li.style.background = "rgba(255,255,255,0.08)";
	li.onmouseleave = () => li.style.background = "transparent";
	li.style.paddingLeft = `${6 + depth * 12}px`;

	// twisty
	const twisty = document.createElement("span");
	twisty.style.cssText = `
    width: 16px;
    display:inline-flex;
    justify-content:center;
    opacity: ${isBranch ? 0.9 : 0.25};
    cursor: ${isBranch ? "pointer" : "default"};
  `;
	twisty.textContent = isBranch ? (isOpen ? "▼" : "▶") : "•";

	if (isBranch) {
	    twisty.onclick = (e) => {
		e.stopPropagation();
		if (expanded.has(path)) expanded.delete(path);
		else expanded.add(path);
		renderCollapsibleTree({ root: inspector.tree, maxNodes, expandRoot: false });
	    };
	}

	// icon
	const icon = document.createElement("span");
	icon.style.cssText = "opacity:0.95;";
	icon.textContent = iconFor(node.type);

	// label
	const label = document.createElement("span");
	label.style.cssText = "cursor:pointer;";
	label.textContent = node.name;

	// clicking the label inspects
	label.onclick = (e) => {
	    e.stopPropagation();
	    showPath(path);
	};

	// optional: double click label toggles too
	label.ondblclick = (e) => {
	    if (!isBranch) return;
	    e.stopPropagation();
	    if (expanded.has(path)) expanded.delete(path);
	    else expanded.add(path);
	    renderCollapsibleTree({ root: inspector.tree, maxNodes, expandRoot: false });
	};

	li.appendChild(twisty);
	li.appendChild(icon);
	li.appendChild(label);

	// small child count hint
	if (isBranch) {
	    const hint = document.createElement("span");
	    hint.style.cssText = "opacity:0.55; margin-left:6px;";
	    const n = Array.isArray(node.children) ? node.children.length : 0;
	    hint.textContent = n ? `(${n})` : "";
	    li.appendChild(hint);
	}

	return li;
    }

    // expands nodes under a given node (bounded to avoid infinite/huge blowups)
    function expandAllUnder(node, path, limit = 5000) {
	const stack = [{ node, path }];
	let count = 0;

	while (stack.length && count < limit) {
	    const cur = stack.pop();
	    if (!cur?.node) continue;

	    const isBranch = cur.node.type === "hash" || cur.node.type === "array";
	    if (!isBranch) continue;

	    expanded.add(cur.path);
	    count++;

	    const kids = cur.node.children || [];
	    for (let i = kids.length - 1; i >= 0; i--) {
		const child = kids[i];
		stack.push({ node: child, path: `${cur.path}.${child.name}` });
	    }
	}
    }
    

    function renderFullTree() {
	treeEl.innerHTML = "";

	const root = inspector.tree;
	if (!root) {
	    treeEl.textContent = "No tree. (parse failed?)";
	    return;
	}

	const head = document.createElement("div");
	head.style.cssText = "margin-bottom:8px; opacity:0.9;";
	head.textContent = "tree view";
	treeEl.appendChild(head);

	const ul = document.createElement("ul");
	ul.style.cssText = "list-style:none; padding-left: 0; margin:0;";
	treeEl.appendChild(ul);

	// render entire parse tree (collapsed-as-text list)
	const stack = [{ node: root, path: root.name, depth: 0 }];

	// simple cap so a monstrous tree doesn't lock the browser
	const maxNodes = 2500;
	let count = 0;

	while (stack.length && count < maxNodes) {
	    const { node, path, depth } = stack.pop();

	    const li = renderNodeLine(
		`${"  ".repeat(depth)}${path}`, // show indentation + full path label
		node.type,
		path,
		true
	    );

	    // make indentation look nicer
	    li.style.paddingLeft = `${6 + depth * 10}px`;
	    ul.appendChild(li);
	    count++;

	    const kids = node.children || [];
	    for (let i = kids.length - 1; i >= 0; i--) {
		const child = kids[i];
		stack.push({ node: child, path: `${path}.${child.name}`, depth: depth + 1 });
	    }
	}

	if (count >= maxNodes) {
	    const warn = document.createElement("div");
	    warn.style.cssText = "margin-top:8px; opacity:0.7;";
	    warn.textContent = `…stopped at ${maxNodes} nodes (cap). Use find to narrow down.`;
	    treeEl.appendChild(warn);
	}

	// keep current selection on the right if any, otherwise show root
	showPath(root.name);
    }




    function inferRootName(value, {
	prefer = ["__name", "__id", "name"],
	globals = true,
	fallback = "root",
    } = {}) {
	if (!value) return fallback;

	// 1) Explicit metadata on the object itself
	for (const key of prefer) {
	    try {
		if (typeof value[key] === "string" && value[key]) {
		    return value[key];
		}
	    } catch {}
	}

	// 2) Best-effort: scan window globals (only if allowed)
	if (globals && typeof window === "object") {
	    try {
		for (const k of Object.keys(window)) {
		    if (window[k] === value) return k;
		}
	    } catch {}
	}

	// 3) Constructor / function name (least reliable, but helpful)
	try {
	    if (typeof value === "function" && value.name) return value.name;
	    if (value?.constructor?.name && value.constructor.name !== "Object") {
		return value.constructor.name;
	    }
	} catch {}

	return fallback;
    }


    
    //renderFullTree();
    renderCollapsibleTree();
    



    
    return { inspector, el };
}



export {install,openConsole};
export default {install,console:openConsole};
