// context.js
function build(ctx, { target, mount, title, maxDepth, rootScope, eventScope }) {
  if (!ctx || typeof ctx !== "object") throw new Error("[context.build] ctx must be an object");
  if (target == null) throw new Error("[tree.console] target is required");
  if (!ctx.TreeInspector) throw new Error("[console] TreeInspector not installed");

  if (!rootScope) rootScope = globalThis;
  if (!eventScope) eventScope = rootScope;

  const uiName = "root";
  const inspector = new ctx.TreeInspector(target, {
    autoParse: false,
    hint: uiName,
    global: rootScope,
  });
  inspector.parse({ maxDepth });

  const expanded = new Set();
  const rootPath = inspector?.tree?.path || inspector?._absRootPath || uiName;
  if (rootPath) expanded.add(rootPath);

  // (path.js expects stable names)
  const rootScopeName =
    (typeof window !== "undefined" && rootScope === window) ? "window"
    : (typeof globalThis !== "undefined" && rootScope === globalThis) ? "globalThis"
    : "globalThis";

  const currentRootPath = rootPath;

  // ---- DOM ----
  const el = document.createElement("div");

  // bind these BEFORE dom/toggle because they read ctx.el/ctx.title/ctx.eventScope
  ctx.el = el;
  ctx.title = title;
  ctx.rootScope = rootScope;
  ctx.eventScope = eventScope;

  ctx.lib.dom.buildConsole(ctx);
  ctx.lib.toggle.enable(ctx);

  const treeEl     = el.querySelector("[data-tree]");
  const detailEl   = el.querySelector("[data-detail]");
  const qEl        = el.querySelector("[data-q]");
  const treeBtn    = el.querySelector("[data-treeview]");
  const setRootBtn = el.querySelector("[data-setroot]");
  const searchBtn  = el.querySelector("[data-search]");
  const reparseBtn = el.querySelector("[data-reparse]");
  const closeBtn   = el.querySelector("[data-close]");

  const extra = {
    target,
    mount,
    title,
    maxDepth,
    rootScope,
    eventScope,
    rootScopeName,
    uiName,

    inspector,
    expanded,
    rootPath,
    currentRootPath,

    el,
    treeEl,
    detailEl,
    qEl,
    treeBtn,
    setRootBtn,
    searchBtn,
    reparseBtn,
    closeBtn,
  };

  return Object.assign(ctx, extra);
}

export { build };
export default { build };
