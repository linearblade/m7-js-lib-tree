function renderFindResults(ctx, q, hits) {
  const { treeEl } = ctx;

  treeEl.innerHTML = "";

  const head = document.createElement("div");
  head.style.cssText = "margin-bottom:8px; opacity:0.9;";
  head.textContent = `find "${q}" → ${hits.length} hits`;
  treeEl.appendChild(head);

  const ul = document.createElement("ul");
  ul.style.cssText = "list-style:none; padding-left:0; margin:0;";

  hits.forEach(h => {
    const li = ctx.lib.tree.renderNodeLine(ctx, {
      label: h.path,
      type: h.type,
      path: h.path,
	faint: true,
	node: h
    });
    ul.appendChild(li);
  });

  treeEl.appendChild(ul);
}

export { renderFindResults };
export default { renderFindResults };
