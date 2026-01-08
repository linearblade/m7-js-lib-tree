let TreeInspector = null;

function install(cls) {
  TreeInspector = cls;
}


function console(lib, {
    mount = document.body,
    title = "m7 Tree Console",
    rootName = "root",
    maxDepth = 25,
} = {}) {
    if (!lib) throw new Error("[tree.console] lib is required");
    if (!TreeInspector) 
	throw new Error("[console] TreeInspector not installed");
  
    const inspector = new TreeInspector(lib, { autoParse: false });
    inspector.parse({ name: rootName, maxDepth });

    // ---------- DOM ----------
    const el = document.createElement("div");
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
  `;

    const treeEl = el.querySelector("[data-tree]");
    const detailEl = el.querySelector("[data-detail]");
    const qEl = el.querySelector("[data-q]");

    el.querySelector("[data-close]").onclick = () => el.remove();

    el.querySelector("[data-reparse]").onclick = () => {
	inspector.parse({ name: rootName, maxDepth });
	renderTree();
	setDetail({ note: "Re-parsed." });
    };

    qEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
	    const q = qEl.value.trim();
	    if (!q) return;
	    const hits = inspector.find(q, { match: "both", limit: 80 });
	    renderFindResults(q, hits);
	}
    });

    mount.appendChild(el);

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

	detailEl.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <div style="font-size:18px;">${icon}</div>
        <div>
          <div style="font-weight:700;">${escapeHtml(info.path)}</div>
          <div style="opacity:0.75;">type: ${escapeHtml(info.type)} ${info.childCount ? ` • children: ${info.childCount}` : ""}</div>
        </div>
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
    `;

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

    return { inspector, el };
}


export {install,console};
export default {install,console};
