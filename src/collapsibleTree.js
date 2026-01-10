
/**
 * Collapsible tree renderer (absolute-path based).
 *
 * Assumptions:
 * - ctx.inspector.tree nodes include:
 *   - name, type, children[]
 *   - path (absolute) + pathParts (optional)
 * - setDetail(ctx, info) works as intended (external).
 *
 * Notes:
 * - No HTML/design changes intended; only wiring + dependency correctness.
 */

function renderCollapsibleTree(
    ctx,
    {
	root = ctx.inspector.tree,
	maxNodes = 2500,
	expandRoot = true,
    } = {}
) {
    const { treeEl, expanded } = ctx;
    const { escapeHtml, chipCss, iconFor } = ctx.lib.helpers;
    const { parentPathOf, leafNameOf, goUpOne } = ctx.lib.path;

    
    treeEl.innerHTML = "";

    if (!root) {
	treeEl.textContent = "No tree. (parse failed?)";
	return;
    }

    // Absolute expansion key (fallback to name only if needed)
    const rootPath = root.path || root.name;
    const stem       = leafNameOf(rootPath);
    if (expandRoot && rootPath) expanded.add(rootPath);

    const head = document.createElement("div");
    head.style.cssText =
	"margin-bottom:8px; opacity:0.9; display:flex; gap:8px; align-items:center;";

    head.innerHTML = `
     <!--
     <span style="opacity:0.9;">
       root:
       <span style="opacity:1; font-weight:700;">${escapeHtml(rootPath)}</span>
     </span>
     -->
     <span style="opacity:0.7; margin-left:6px;">
       <!--stem:--><span style="opacity:1; font-weight:700;">${escapeHtml(stem || "")}</span>
     </span>

     <button data-expandall style="${chipCss()}">expand all</button>
     <button data-collapseall style="${chipCss()}">collapse all</button>
   `;
   /* 
    head.innerHTML = `
    <span style="opacity:0.9;">
      root: <span style="opacity:1; font-weight:700;">${escapeHtml(rootPath)}</span>
    </span>
    <button data-expandall style="${chipCss()}">expand all</button>
    <button data-collapseall style="${chipCss()}">collapse all</button>
  `;
   */
    treeEl.appendChild(head);

    const ul = document.createElement("ul");
    ul.style.cssText = "list-style:none; padding-left: 0; margin:0;";
    treeEl.appendChild(ul);
    appendTreeNavTop(ctx, rootPath, ul);
    // DFS; paths are absolute now (node.path)
    const stack = [{ node: root, path: rootPath, depth: 0 }];
    let count = 0;

    while (stack.length && count < maxNodes) {
	const { node, path, depth } = stack.pop();
	count++;

	const isBranch = !!node && (node.type === "hash" || node.type === "array");
	const isOpen = isBranch && expanded.has(path);
	const kids = node?.children || [];

	ul.appendChild(renderTreeRow(ctx, { node, path, depth, maxNodes }));

	if (isBranch && isOpen && kids.length) {
	    for (let i = kids.length - 1; i >= 0; i--) {
		const child = kids[i];
		const childPath = child?.path || `${path}.${child.name}`; // fallback only
		stack.push({ node: child, path: childPath, depth: depth + 1 });
	    }
	}
    }

    if (count >= maxNodes) {
	const warn = document.createElement("div");
	warn.style.cssText = "margin-top:8px; opacity:0.7;";
	warn.textContent = `…stopped at ${maxNodes} rendered nodes. Expand less / use find.`;
	treeEl.appendChild(warn);
    }

    // expand/collapse all
    const expandAllBtn = head.querySelector("[data-expandall]");
    if (expandAllBtn) {
	expandAllBtn.onclick = () => {
	    expandAllUnder(ctx, root, rootPath, 5000);
	    renderCollapsibleTree(ctx, { root, maxNodes, expandRoot: false });
	};
    }

    const collapseAllBtn = head.querySelector("[data-collapseall]");
    if (collapseAllBtn) {
	collapseAllBtn.onclick = () => {
	    expanded.clear();
	    if (rootPath) expanded.add(rootPath);
	    renderCollapsibleTree(ctx, { root, maxNodes, expandRoot: false });
	};
    }

    // show root details
    ctx.lib.path.showPath(ctx, rootPath);
}


// ---------- Render helpers (optional; kept for compatibility) ----------
function renderTree(ctx) {
    const { inspector, treeEl } = ctx;
    const { escapeHtml, chipCss, iconFor} = ctx.lib.helpers;
    treeEl.innerHTML = "";

    const root = inspector.tree;
    if (!root) {
	treeEl.textContent = "No tree. (parse failed?)";
	return;
    }

    const ul = document.createElement("ul");
    ul.style.cssText = "list-style:none; padding-left:0; margin:0;";

    // root line
    ul.appendChild(
	renderNodeLine(ctx, {
	    label: root.name,
	    type: root.type,
	    path: root.path || root.name,
	    faint: false,
	})
    );

    // first-level children
    for (const child of root.children || []) {
	const childPath = child.path || `${root.path || root.name}.${child.name}`;
	ul.appendChild(
	    renderNodeLine(ctx, {
		label: child.name,
		type: child.type,
		path: childPath,
		faint: false,
	    })
	);
    }

    treeEl.appendChild(ul);
    ctx.lib.path.showPath(ctx, root.path || root.name);
}

function renderNodeLine(ctx, { label, type, path, faint = false }) {
    const { escapeHtml, chipCss, iconFor } = ctx.lib.helpers;
    const li = document.createElement("li");
    li.style.cssText = `
      color: yellow;
      padding: 4px 6px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      ${faint ? "opacity:0.92;" : ""}
    `;

    li.onmouseenter = () => {
	li.style.background = "rgba(255,255,255,0.08)";
    };
    li.onmouseleave = () => {
	li.style.background = "transparent";
    };

    li.onclick = () => ctx.lib.path.showPath(ctx, path);

    const icon = iconFor(ctx,type);
    li.innerHTML = `<span style="opacity:0.95">${icon}</span> <span>${escapeHtml(
    label
  )}</span>`;

    return li;
}

// expands nodes under a given node (bounded to avoid infinite/huge blowups)
function expandAllUnder(ctx, node, path, limit = 5000) {
    const { escapeHtml, chipCss, iconFor} = ctx.lib.helpers;
    const { expanded } = ctx;

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
	    const childPath = child?.path || `${cur.path}.${child.name}`; // prefer absolute
	    stack.push({ node: child, path: childPath });
	}
    }
}

function renderTreeRow(ctx, { node, path, depth, maxNodes }) {
    const { escapeHtml, chipCss, iconFor} = ctx.lib.helpers;
    const { expanded } = ctx;

    const isBranch = !!node && (node.type === "hash" || node.type === "array");
    const isOpen = isBranch && expanded.has(path);

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
    li.style.paddingLeft = `${6 + depth * 12}px`;

    li.onmouseenter = () => (li.style.background = "rgba(255,255,255,0.08)");
    li.onmouseleave = () => (li.style.background = "transparent");

    const toggle = (e) => {
	e?.stopPropagation?.();
	if (!isBranch) return;

	if (expanded.has(path)) expanded.delete(path);
	else expanded.add(path);

	renderCollapsibleTree(ctx, {
	    root: ctx.inspector.tree,
	    maxNodes,
	    expandRoot: false,
	});
    };

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
    if (isBranch) twisty.onclick = toggle;

    // icon
    const icon = document.createElement("span");
    icon.style.cssText = "opacity:0.95;";
    icon.textContent = iconFor(ctx,node.type);

    // label (inspect)
    const label = document.createElement("span");
    label.style.cssText = "cursor:pointer;";
    label.textContent = node.name;

    label.onclick = (e) => {
	e.stopPropagation();
	ctx.lib.path.showPath(ctx, path);
    };

    // dblclick toggles branch
    label.ondblclick = toggle;

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


function appendTreeNavTop(ctx, rootPath, ul){
    // --- "up one dir" row (../ + parent path as text) ---


    const parentPath = ctx.lib.path.parentPathOf(rootPath); // "abs path minus stem"
    if(!parentPath) return;

	const liUp = document.createElement("li");
	liUp.style.cssText = `
        display:flex;
        align-items:center;
        gap:10px;
        padding: 4px 6px;
        border-radius: 8px;
        user-select: none;
        color: yellow;
        opacity: 0.95;
        `;

	const upBtn = document.createElement("span");
	upBtn.style.cssText = `
          cursor: pointer;
         font-weight: 700;
        `;
	upBtn.textContent = "../";
	upBtn.onclick = (e) => {
	    e.stopPropagation();
	    ctx.lib.path.goUpOne(ctx);                  // path-based navigation
	    // NOTE: goUpOne should call setRootFromInput which re-renders already.
	    // If not, you can force:
	    // renderCollapsibleTree(ctx, { expandRoot: true });
	};

	const upText = document.createElement("span");
	upText.style.cssText = "opacity:0.65;";
	upText.textContent = parentPath;

	liUp.appendChild(upBtn);
	liUp.appendChild(upText);

	liUp.onmouseenter = () => (liUp.style.background = "rgba(255,255,255,0.08)");
	liUp.onmouseleave = () => (liUp.style.background = "transparent");

	ul.appendChild(liUp);

}

export { renderCollapsibleTree,renderNodeLine };
export default {renderCollapsibleTree,renderNodeLine};
