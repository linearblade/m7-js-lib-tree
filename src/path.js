// path.js
// ---------------------------------------------
// UI-ish helper (inspect by absolute path)
// ---------------------------------------------
function showPath(ctx, path) {
  const s = String(path || "").trim();
  const info = ctx.inspector.inspect(s, {
    includeRef: true,
    includeChildren: true,
    show: false,
  });

  if (!info) {
    ctx.lib.detail.set(ctx, { error: `Not found: ${s}` });
    return false;
  }

  ctx.lib.detail.set(ctx, info);
  return true;
}

// ---------------------------------------------
// Path helpers (absolute paths)
// ---------------------------------------------
function _cleanPath(path) {
  return String(path || "").trim().replace(/^\.+|\.+$/g, "");
}

function parentPathOf(path) {
  const s = _cleanPath(path);
  if (!s) return null;

  const parts = s.split(".").filter(Boolean);
  if (parts.length <= 1) return null;

  return parts.slice(0, -1).join(".");
}

function leafNameOf(path) {
  const s = _cleanPath(path);
  if (!s) return "";

  const parts = s.split(".").filter(Boolean);
  return parts[parts.length - 1] || "";
}

// ---------------------------------------------
// Navigation (ctx-based; absolute paths)
// ---------------------------------------------
function canGoUp(ctx) {
  const curPath = String(ctx.currentRootPath || ctx.rootPath || "").trim();
  return !!parentPathOf(curPath);
}

function goUpOne(ctx) {
  const curPath = String(ctx.currentRootPath || ctx.rootPath || "").trim();
  const upPath = parentPathOf(curPath);
  if (!upPath) return false;

  const ok = ctx.lib.root.setRootFromInput(ctx, upPath);

  if (ok) {
    ctx.currentRootPath = upPath;
    ctx.rootPath = upPath; // keep both synced if you track both
  }

  return ok;
}

export { showPath, parentPathOf, leafNameOf, canGoUp, goUpOne };
export default { showPath, parentPathOf, leafNameOf, canGoUp, goUpOne };
