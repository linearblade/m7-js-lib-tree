function bindConsoleUI(ctx) {
  const {
    el,
    mount,
    inspector,
    qEl,
    treeBtn,
    setRootBtn,
    searchBtn,
    reparseBtn,
    closeBtn,
  } = ctx;

  // pull deps from ctx.lib (no globals, no guards)
  const renderCollapsibleTree = ctx.lib.tree.renderCollapsibleTree;
  const renderFindResults     = ctx.lib.finder.renderFindResults;
  const setDetail             = ctx.lib.detail.set;
  const reparseCurrentRoot    = ctx.lib.root.reparseCurrentRoot;
  const setRootFromInput      = ctx.lib.root.setRootFromInput;
  const disableToggle         = ctx.lib.toggle.disable;

  // tree view (collapsible is default)
  treeBtn.onclick = () => renderCollapsibleTree(ctx);

  // close
  closeBtn.onclick = () => {
    disableToggle(ctx);
    el.remove();
  };

  // reparse current root
  reparseBtn.onclick = () => {
    reparseCurrentRoot(ctx);
    setDetail(ctx, { note: "Re-parsed." });
  };

  // search
  const searchFunc = () => {
    const q = String(qEl.value || "").trim();
    if (!q) return;

    const hits = inspector.find(q, { match: "both", limit: 80 });
    renderFindResults(ctx, q, hits);
  };

  searchBtn.onclick = searchFunc;

  qEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      searchFunc();
    }
  });

  // set root from input (Ctrl/Cmd+Enter or button)
  const setRootFunc = () => {
    const s = String(qEl.value || "").trim();
    if (!s) return;

    const ok = setRootFromInput(ctx, s);
    if (!ok) setDetail(ctx, { error: `Not found / not rootable: ${s}` });
  };

  setRootBtn.onclick = setRootFunc;

  qEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setRootFunc();
    }
  });

  // mount once
  mount.appendChild(el);
}

export { bindConsoleUI };
export default { bindConsoleUI };
