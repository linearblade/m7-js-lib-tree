// root.js

function reparseCurrentRoot(ctx) {
  const { inspector, expanded, maxDepth } = ctx;

  inspector.parse({ maxDepth });

  expanded.clear();

  const rootPath = inspector?.tree?.path || inspector?._absRootPath || ctx.rootPath || ctx.currentRootPath;
  if (rootPath) expanded.add(rootPath);

  // rerender
  ctx.lib.tree.renderCollapsibleTree(ctx);
}

function setRootFromInput(ctx, input) {
  const { inspector, expanded, maxDepth, rootScope } = ctx;

  try {
    const next = new ctx.TreeInspector(input, { autoParse: false, global: rootScope });
    next.parse({ maxDepth });

    if (!next?.tree?.path) return false;

    // swap inspector internals (preserving instance)
    inspector.rootRef       = next.rootRef;
    inspector.tree          = next.tree;
    inspector.index         = next.index;
    inspector._absRootPath  = next._absRootPath;
    inspector._absRootParts = next._absRootParts;

    // sync ctx path trackers (you’re using both in other files)
    ctx.rootPath = inspector.tree.path;
    ctx.currentRootPath = inspector.tree.path;

    expanded.clear();
    expanded.add(inspector.tree.path);

    ctx.lib.tree.renderCollapsibleTree(ctx);
    return true;
  } catch {
    return false;
  }
}

export { reparseCurrentRoot, setRootFromInput };
export default { reparseCurrentRoot, setRootFromInput };
