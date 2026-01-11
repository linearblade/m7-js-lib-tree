function iconFor(ctx, type,opts = {}) {
    if(opts === null || typeof opts !=='object') opts = {};
    const {isStatic=false,isInstance=false} =opts;
    const ICONS = ctx.TreeInspector?.ICONS;
    if (!ICONS) throw new Error("[helpers.iconFor] ctx.TreeInspector.ICONS missing");
    
    const base =  (
	ICONS[type] ??
	    (["string", "number", "boolean", "undefined", "symbol", "bigint"].includes(type)
	     ? ICONS.scalar
	     : ICONS.scalar)
    );
    // consider 
    //const staticMarker = "Ⓢ`";
    const staticMarker = "⚡";
    //const instanceMarker = "Ⓘ";
    const instanceMarker = "📦";//boxunicode
    //const instanceMarker = "&#128230;"; //box entity
    if (isStatic)
	return `${staticMarker} ${base}`;
    if(isInstance)
	return `${instanceMarker} ${base}`;
    return base;
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
  return escapeHtml(s).replaceAll("`", "&#096;");
}

export { iconFor, btnCss, chipCss, escapeHtml, escapeAttr };
export default { iconFor, btnCss, chipCss, escapeHtml, escapeAttr };
