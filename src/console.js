import detail     from "./detail.js";          // cleaned
import events     from "./events.js";          // cleaned
import helpers    from "./helpers.js";         // cleaned
import root       from "./root.js";            // cleaned
import tree       from "./collapsibleTree.js"; // cleaned
import context    from "./context.js";         // cleaned
import dom        from "./dom.js";             // cleaned
import finder     from "./finder.js";          // cleaned
import path       from "./path.js";            // cleaned
import toggle     from "./toggle.js";          // cleaned
import class_inspector     from "./ClassInspector.js";  // cleaned

let TreeInspector = null;

//leaving it in the main file b/c dont want to hide it
function installLibs(ctx = {}) {
    if (!TreeInspector) throw new Error("[install] TreeInspector not installed");
    if (!ctx || typeof ctx !== "object") throw new Error("[install] ctx must be an object");

    ctx.lib ||= {};
    ctx.TreeInspector = TreeInspector;
    Object.assign(ctx.lib, {
	detail,
	events,
	helpers,
	root,
	tree,
	context,
	dom,
	finder,
	path,
	toggle,
	class_inspector
    });

    return ctx;
}


function install(cls) {
    TreeInspector = cls;
}

function openConsole(
    target,
    {
	mount = document.body,
	title = "m7 Tree Console",
	maxDepth = 25,
	rootScope = globalThis,
	eventScope = null,
    } = {}
) {
    if (!eventScope) eventScope = rootScope;

    const ctx = installLibs({});

    ctx.lib.context.build(ctx, {
	target,
	mount,
	title,
	maxDepth,
	rootScope,
	eventScope,
    });

    ctx.lib.events.bindConsoleUI(ctx);
    ctx.lib.tree.renderCollapsibleTree(ctx);

    return { inspector: ctx.inspector, el: ctx.el };
}








///
/*
  function openConsole(
  target,
  {
  mount = document.body,
  title = "m7 Tree Console",
  maxDepth = 25,
  global = window,   // explicit global root
  } = {}
  ) {

  if (target == null) throw new Error("[tree.console] target is required");
  if (!TreeInspector) throw new Error("[console] TreeInspector not installed");

  const uiName = "root";

  const inspector = new TreeInspector(target, {
  autoParse: false,
  hint: uiName,
  global,
  });

  inspector.parse({ maxDepth });

  const expanded = new Set();
  const rootPath = inspector.tree?.path || inspector._absRootPath || uiName;
  if (rootPath) expanded.add(rootPath);

  // 👇 global context gen
  const ctx = makeConsoleContext({
  mount,
  title,
  inspector,
  expanded,
  maxDepth,
  global,
  uiName,
  });
  //we'll work this next ... just focus on the boiler plate first
  setupStaticConsoleEvents({
  el,  mount,  inspector, expanded
  qEl,  detailEl,
  treeBtn,  setRootBtn,
  renderCollapsibleTree,  renderFullTree,  renderFindResults,	setDetail,
  reparseCurrentRoot,	setRootFromInput
  });

  //renderFullTree();
  renderCollapsibleTree();
  return { inspector, el };

  
  // all functions after this
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
  //if (BASE_VARS.has(currentRootName)) return true;
  if (parentPathOf(currentRootPath)) return true;   // can go up if path has a parent
  if (currentRoot !== defaultRoot) return true;     // otherwise allow fallback-to-window
  return false;
  }

  function goUpOne() {
  // 1) history pop (works when you pushed path)
  if (rootStack.length > 0) {
  const prev = rootStack.pop();
  setRoot(prev.value, prev.label, { pushHistory: false, path: prev.path });
  return;
  }

  // 2) compute parent from absolute path (THIS is the missing piece)
  const upPath = parentPathOf(currentRootPath);
  if (upPath) {
  const upVal = resolveRootSelector(upPath);
  if (upVal != null) {
  setRoot(upVal, leafNameOf(upPath), { pushHistory: false, path: upPath });
  return;
  }
  }

  // 3) last fallback: if you're at your initial root, go to defaultRoot (window)
  if (currentRoot !== defaultRoot && defaultRoot != null) {
  setRoot(defaultRoot, defaultRootName, { pushHistory: false, path: defaultRootName });
  }
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





  
  }

*/

export {install,openConsole};
export default {install,console:openConsole};
