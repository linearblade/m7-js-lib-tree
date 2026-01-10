// detail.js

/**
 * detail.js
 * Renders the right-side detail panel and wires local interactions.
 *
 * HARD expectations (ctx):
 * - ctx.detailEl: HTMLElement
 * - ctx.inspector: TreeInspector instance
 * - ctx.lib.helpers: { iconFor, chipCss, escapeHtml, escapeAttr }
 * - ctx.lib.root.setRootFromInput(ctx, absPathString): boolean
 * - ctx.lib.path.goUpOne(ctx): boolean (optional; if missing, ../ is hidden)
 *
 * Notes:
 * - info.path is expected to be ABSOLUTE (TreeInspector provides it).
 * - child chips prefer child.path, else `${info.path}.${child.name}`.
 */

// ----------------------------
// Main
// ----------------------------
function setDetail(ctx, info) {

    const { detailEl } = ctx;
    const { iconFor, chipCss, escapeHtml, escapeAttr } = ctx.lib.helpers;

    
    if (info?.error) {
	detailEl.innerHTML = `<div style="color:#ffb3b3;">${escapeHtml(info.error)}</div>`;
	return;
    }

    if (info?.note) {
	detailEl.innerHTML = `<div style="opacity:0.9;">${escapeHtml(info.note)}</div>`;
	return;
    }

    
    const icon = iconFor(ctx, info.type);
    const sig = info.signature;

    ctx.detailPath = info?.canonicalPath || info?.refPath || info?.path || null;
    const canonicalPath = info.canonicalPath || info.refPath || null;
    const showCanonical =
	  info.type === "ref" &&
	  canonicalPath &&
	  canonicalPath !== info.path;
    
    detailEl.innerHTML = `
    <div style="opacity:0.8;margin-bottom:5px">${escapeHtml(info.path)}</div>

${
  showCanonical
    ? `
  <div style="
    margin: 8px 0 10px;
    padding: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    background: rgba(255,255,255,0.05);
  ">
    <div style="opacity:0.8; margin-bottom:6px;">points to</div>
    <button
      data-canonical-path="${escapeAttr(canonicalPath)}"
      style="${chipCss()}"
    >
      ${escapeHtml(canonicalPath)}
    </button>
  </div>
  `
    : ""
}

 
    <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
      <div style="font-size:18px;">${icon}</div>
      <div>
        <div style="font-weight:700;">${escapeHtml(info.name)}</div>
        <div style="opacity:0.75;">
          type: ${escapeHtml(info.type)}
          ${info.childCount ? ` • children: ${info.childCount}` : ""}
        </div>
      </div>

      <button data-up-root style="${chipCss()}">../</button>
      ${
        info?.ref && (info.type === "hash" || info.type === "array")
          ? `<button data-use-root style="${chipCss()}">🎯</button>`
          : ""
      }
    </div>

    ${
      sig
        ? `
	<div style="margin:10px 0; padding:8px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(255,255,255,0.05);">
        <div style="opacity:0.8; margin-bottom:6px;">signature</div>
        <div><b>${escapeHtml(sig.name || "(anonymous)")}</b> (${escapeHtml(
            (sig.params || []).join(", ")
        )})</div>
        <div style="opacity:0.75;">arity: ${sig.arity}${sig.isNative ? " • native" : ""}</div>
	</div>
	`
        : ""
    }

    ${
      sig?.sourcePreview
        ? `
	<div style="margin:10px 0; padding:8px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(255,255,255,0.05);">
        <div style="opacity:0.8; margin-bottom:6px;">source preview</div>
        <pre style="white-space:pre-wrap; margin:0;">${escapeHtml(sig.sourcePreview)}</pre>
	</div>
	`
        : ""
    }

    ${
      info?.valuePreview
        ? `
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
	`
        : ""
    }

    ${
      Array.isArray(info.children) && info.children.length
        ? `
	<div style="margin-top:10px;">
        <div style="opacity:0.8; margin-bottom:6px;">children</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${info.children
          .slice(0, 60)
          .map((c) => {
              const childPath = c?.path || `${info.path}.${c.name}`;
              return `
                <button data-path="${escapeAttr(childPath)}" style="${chipCss()}">
                  ${escapeHtml(iconFor(ctx, c.type))} ${escapeHtml(c.name)}
                </button>
              `;
          })
          .join("")}
    </div>
	</div>
	`
        : `<div style="opacity:0.7;">(no children)</div>`
    }
  `;

    wireDetailEvents(ctx, info);
}


// ----------------------------
// Local inspect helper (detail.js local)
// ----------------------------
function synthetic_inspectAndShow(ctx, path) {
    const p = String(path || "").trim();
    if (!p) {
	setDetail(ctx, { error: "Not found: (empty path)" });
	return false;
    }

    let info = ctx.inspector.inspect(p, {
	includeRef: true,
	includeChildren: true,
	show: false,
    });

    if (!info) {
	setDetail(ctx, { error: `Not found: ${p}` });
	return false;
    }

    // Class expansion hook (class defs + class-like functions)
    if (info.ref) {
	const isClass =
	      info.type === "class" ||
	      (info.type === "function" &&
               ctx.lib.class_inspector.isInspectableClass(info.ref));

	if (isClass) {
	    info = ctx.lib.class_inspector.expandClassInfo(ctx, info, {
		includeSymbols: true,
		skipBuiltins: false,
	    });
	}
    }

    setDetail(ctx, info);
    return true;
}

// ----------------------------
// Local inspect helper
// ----------------------------
function inspectAndShow(ctx, path) {
    const p = String(path || "").trim();
    if (!p) {
	setDetail(ctx, { error: "Not found: (empty path)" });
	return false;
    }
    /*
      const info = ctx.inspector.inspect(p, {
      includeRef: true,
      includeChildren: true,
      show: false,
      });*/
    let info = ctx.inspector.inspect(p, { includeRef:true, includeChildren:true, show:false });

    if (info && (info.type === "class" || (info.type === "function" && ctx.lib.class_inspector.isInspectableClass(info.ref)))) {
	info = ctx.lib.class_inspector.expandClassInfo(ctx, info, {
	    includeSymbols: true,
	    skipBuiltins: false, // “get it all”
	});
    }

    ctx.lib.detail.set(ctx, info);
    

    if (!info) {
	setDetail(ctx, { error: `Not found: ${p}` });
	return false;
    }

    setDetail(ctx, info);
    return true;
}

// ----------------------------
// Wiring
// ----------------------------
function wireDetailEvents(ctx, info) {
    const { detailEl } = ctx;

    // 🎯 set target (re-root to current node, by ABSOLUTE PATH)
    const useRootBtn = detailEl.querySelector("[data-use-root]");
    if (useRootBtn) {
	useRootBtn.onclick = () => {
	    const ok = ctx.lib.root.setRootFromInput(ctx, info.path);
	    if (!ok) setDetail(ctx, { error: `Not found / not rootable: ${info.path}` });
	};
    }

    /*
    // ../ up one dir (optional)
    const upRootBtn = detailEl.querySelector("[data-up-root]");
    if (upRootBtn) {
	const goUpOne = ctx.lib.path.goUpOne;
	upRootBtn.onclick = () => goUpOne(ctx);

    }
    */

    const upRootBtn = detailEl.querySelector("[data-up-root]");
    const parentPathOf = ctx.lib.path.parentPathOf;

    upRootBtn.onclick = () => {
	const root = String(ctx.currentRootPath || ctx.rootPath || "").trim();
	const cur  = String(ctx.detailPath || info?.canonicalPath || info?.refPath || info?.path || "").trim();
	if (!root || !cur) return;

	const up = parentPathOf(cur);
	if (!up) return;

	const inRoot = (up === root) || up.startsWith(root + ".");
	if (!inRoot) {
	    alert('already at root');
	    //setDetail(ctx, { note: `At root: ${root}` }); 
	    return;
	}

	inspectAndShow(ctx, up);
    };
    /*
    const upRootBtn = detailEl.querySelector("[data-up-root]");
    const parentPathOf = ctx.lib.path.parentPathOf;

    upRootBtn.onclick = () => {
	const cur = String(ctx.detailPath || "").trim();
	const up = parentPathOf(cur);
	if (!up) return;
	inspectAndShow(ctx, up);
	};
    */
    
    // child chips -> inspect
    detailEl.querySelectorAll("button[data-path]").forEach((btn) => {
	btn.onclick = () => inspectAndShow(ctx, btn.getAttribute("data-path"));
    });
    
    //  canonical ref jump
    const canonicalBtn = detailEl.querySelector("[data-canonical-path]");
    if (canonicalBtn) {
	canonicalBtn.onclick = () => {
	    const p = canonicalBtn.getAttribute("data-canonical-path");
	    if (p) inspectAndShow(ctx, p);
	};
    }
    
}

export { setDetail as set };
export default { set: setDetail };
