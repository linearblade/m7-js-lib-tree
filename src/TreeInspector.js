// TreeInspector.js
// Refactored to make the tree *authoritative*:
// - every node has: path, pathParts, parentPath, depth
// - root gets an *absolute-ish* rootParts inferred from globals (window/globalThis)
// - console/UI should consume node.path (never recompute / guess)
// - inspect/find return stable absolute paths regardless of re-rooting UI
import treeConsole from './console.js';

 class TreeInspector {
  // ----------------------------
  // Static config / enrichers
  // ----------------------------
  static ICONS = {
    object: "📁",
    hash: "📁",
    array: "🔗",
    function: "ƒ",
    class: "🏛️",
    scalar: "❓",
    circular: "♻️",
    ref: "♻️",
    null: "∅",
    undefined: "∅",
  };

  static NODE_ENRICHERS = {
    function: (v) => ({ signature: TreeInspector.getFunctionSignature(v) }),
    class: (v) => ({ signature: TreeInspector.getFunctionSignature(v) }),
  };

  // ----------------------------
  // ctor / state
  // ----------------------------
  constructor(obj, options = {}) {
    this.rootRef = obj;
    this.options = { name: "root", autoParse: true, ...options };

    this.tree = null;

    // indexes: path -> node, ref -> node
    this.index = {
      byPath: new Map(),
      byRef: new WeakMap(),
    };

    // internal dump buffer
    this._out = "";

    if (this.options.autoParse !== false) {
      this.parse({ name: this.options.name });
    }
  }

  // ----------------------------
  // Core parse
  // ----------------------------
  parse({
    value = this.rootRef,
    name = this.options?.name ?? "root",
    maxDepth = Infinity,
    includeNonEnumerable = false, // stub for later
  } = {}) {
    // flush + persist name
    this.options.name = name;
    this.tree = null;
    this.index.byPath.clear();
    this.index.byRef = new WeakMap();

    const rootParts = TreeInspector.inferAbsoluteRootParts(value, name);

    const seen = new WeakMap(); // obj -> canonical node (for cycles/shared refs)

    const rootNode = this._parseNode({
      value,
      name: rootParts[rootParts.length - 1] ?? name,
      pathParts: rootParts,
      parentPath: null,
      depth: 0,
      seen,
      maxDepth,
      includeNonEnumerable,
    });

    this.tree = rootNode;
    return this;
  }

  _parseNode({
    value,
    name,
    pathParts,
    parentPath,
    depth,
    seen,
    maxDepth,
    includeNonEnumerable, // unused (stub)
  }) {
    const t = typeof value;

    const isClass =
      t === "function" &&
      (() => {
        try {
          return /^class\s/.test(Function.prototype.toString.call(value));
        } catch {
          return false;
        }
      })();

    const type =
      value && t === "object"
        ? Array.isArray(value)
          ? "array"
          : "hash"
        : isClass
        ? "class"
        : t === "function"
        ? "function"
        : value === null
        ? "null"
        : t;

    const isBranch = type === "hash" || type === "array";
    const isRefable = value && t === "object";

    const path = pathParts.join(".");

    // cycles/shared refs
    if (isRefable && seen.has(value)) {
      // Important: keep *this node's* path, but indicate it is a ref
      const refNode = {
        type: "ref",
        name,
        ref: value,
        path,
        pathParts,
        parentPath,
        depth,
        children: undefined,
      };
      this._indexNode(refNode);
      return refNode;
    }

    const node = {
      type,
      name,
      ref: value,
      path,
      pathParts,
      parentPath,
      depth,
    };

    // enrich (signature for functions/classes)
    Object.assign(node, TreeInspector.NODE_ENRICHERS[type]?.(value));

    // scalar preview (NOT branches, NOT ref, NOT function/class)
    if (!isBranch && type !== "ref" && type !== "function" && type !== "class") {
      const { preview, kind } = TreeInspector.formatScalar(value);
      node.valuePreview = preview;
      node.valueKind = kind;
    }

    // index now (so inspect/find can see everything, even when depth capped)
    this._indexNode(node);

    if (!isBranch) return node;

    // mark seen for cycle-safe descent
    if (isRefable) seen.set(value, node);

    // depth cap
    if (depth >= maxDepth) {
      node.children = [];
      return node;
    }

    node.children = [];

    if (type === "hash") {
      const entries = Object.entries(value);
      for (const [k, v] of entries) {
        node.children.push(
          this._parseNode({
            value: v,
            name: k,
            pathParts: pathParts.concat([k]),
            parentPath: path,
            depth: depth + 1,
            seen,
            maxDepth,
            includeNonEnumerable,
          })
        );
      }
    } else {
      for (let i = 0; i < value.length; i++) {
        const k = String(i);
        node.children.push(
          this._parseNode({
            value: value[i],
            name: k,
            pathParts: pathParts.concat([k]),
            parentPath: path,
            depth: depth + 1,
            seen,
            maxDepth,
            includeNonEnumerable,
          })
        );
      }
    }

    return node;
  }

  _indexNode(node) {
    // byPath (string -> node)
    if (node?.path) this.index.byPath.set(node.path, node);

    // byRef (only for objects/functions to avoid WeakMap TypeError)
    const r = node?.ref;
    const tr = typeof r;
    if (r && (tr === "object" || tr === "function")) {
      // keep the *first* node we saw for that ref (canonical); refs point back anyway
      if (!this.index.byRef.has(r)) this.index.byRef.set(r, node);
    }
  }

  // ----------------------------
  // Inspect
  // ----------------------------
  inspect(target, opts = {}) {
    const {
      reparseIfMissing = true,
      includeChildren = true,
      childrenPreview = 60,
      includeRef = true,
      show = false,
    } = opts;

    if (!this.tree) {
      if (reparseIfMissing) this.parse({ name: this.options.name });
      if (!this.tree) return null;
    }

    let node = null;

    if (typeof target === "string") {
      const normalized = this._normalizePath(target);
      node = this.index.byPath.get(normalized) || null;
    } else {
      node = this._findByRef(target);
    }

    if (!node) return null;

    const payload = {
      type: node.type,
      name: node.name,
      path: node.path,
      pathParts: node.pathParts,
      parentPath: node.parentPath ?? null,
      depth: node.depth ?? null,
      signature: node.signature ?? null,
      valuePreview: node.valuePreview ?? null,
      valueKind: node.valueKind ?? null,
      childCount: Array.isArray(node.children) ? node.children.length : 0,
      childrenPreview: Array.isArray(node.children)
        ? node.children.slice(0, childrenPreview).map((c) => ({
            name: c.name,
            type: c.type,
            path: c.path,
          }))
        : [],
    };

    if (includeChildren) payload.children = node.children || [];
    if (includeRef) payload.ref = node.ref;

    if (show) {
      const icon = TreeInspector.ICONS[node.type] ?? TreeInspector.ICONS.scalar;
      console.log(`${icon} ${node.path}`);
      if (payload.signature) console.log(payload.signature);
      if (payload.childCount) console.log(`children: ${payload.childCount}`);
    }

    return payload;
  }

  _normalizePath(p) {
    const s = String(p ?? "").trim().replace(/^\.+|\.+$/g, "");
    if (!s) return this.tree?.path ?? this.options.name;

    // If user provided absolute path (starts with current root), keep it
    const rootPath = this.tree?.path ?? this.options.name;
    if (s === rootPath) return rootPath;
    if (s.startsWith(rootPath + ".")) return s;

    // Otherwise treat as relative to current root
    return rootPath + "." + s;
  }

  _findByRef(ref) {
    if (ref == null) return null;
    const t = typeof ref;
    if (!(t === "object" || t === "function")) return null;
    return this.index.byRef.get(ref) || null;
  }

  // ----------------------------
  // Find
  // ----------------------------
  find(partial, opts = {}) {
    const {
      limit = 50,
      types = null, // e.g. ["function","class","hash"]
      pathsOnly = false,
      includeRef = false,
      includeSignature = true,
      match = "both", // "name" | "path" | "both"
      reparseIfMissing = true,
    } = opts;

    if (!this.tree) {
      if (reparseIfMissing) this.parse({ name: this.options.name });
      if (!this.tree) return [];
    }

    const typeSet = types ? new Set(types) : null;

    let predicate;
    if (typeof partial === "function") {
      predicate = partial;
    } else if (partial instanceof RegExp) {
      predicate = (node) => {
        const hay =
          match === "path"
            ? node.path
            : match === "name"
            ? node.name
            : `${node.path} ${node.name}`;
        return partial.test(hay);
      };
    } else {
      const needle = String(partial ?? "").toLowerCase();
      predicate = (node) => {
        const hay =
          match === "path"
            ? node.path
            : match === "name"
            ? node.name
            : `${node.path} ${node.name}`;
        return String(hay).toLowerCase().includes(needle);
      };
    }

    const results = [];

    // iterate over byPath (already canonical absolute paths)
    for (const node of this.index.byPath.values()) {
      if (results.length >= limit) break;
      if (!node) continue;
      if (typeSet && !typeSet.has(node.type)) continue;

      let ok = false;
      try {
        ok = !!predicate(node);
      } catch {
        ok = false;
      }
      if (!ok) continue;

      if (pathsOnly) {
        results.push(node.path);
      } else {
        const hit = {
          type: node.type,
          name: node.name,
          path: node.path,
          parentPath: node.parentPath ?? null,
          childCount: Array.isArray(node.children) ? node.children.length : 0,
        };
        if (includeRef) hit.ref = node.ref;
        if (includeSignature && node.signature) hit.signature = node.signature;
        results.push(hit);
      }
    }

    return results;
  }

  // ----------------------------
  // Dump (text tree)
  // ----------------------------
  dump({ node = this.tree, icons = TreeInspector.ICONS, toConsole = true } = {}) {
    this._resetOut();
    this._dumpNode(node, { indent: "", isLast: true, icons });
    const out = this._flushOut();
    if (toConsole) console.log("%s", out);
    return out;
  }

  _dumpNode(node, { indent, isLast, icons }) {
    if (!node) return;

    const branch = indent ? (isLast ? "└─ " : "├─ ") : "";
    const nextIndent = indent + (isLast ? "   " : "│  ");

    const icon =
      icons[node.type] ??
      (["string", "number", "boolean", "undefined", "symbol", "bigint"].includes(node.type)
        ? icons.scalar
        : icons.scalar);

    // show name + (optional) value preview for scalars
    const vp =
      node.valuePreview != null && node.valuePreview !== ""
        ? ` = ${String(node.valuePreview)}`
        : "";

    this._logLine(`${indent}${branch}${icon} ${node.name}${vp}`);

    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) {
      this._dumpNode(kids[i], {
        indent: nextIndent,
        isLast: i === kids.length - 1,
        icons,
      });
    }
  }

  _resetOut() {
    this._out = "";
  }
  _logLine(text) {
    this._out += text + "\n";
  }
  _flushOut() {
    const out = this._out;
    this._out = "";
    return out;
  }

  // ----------------------------
  // Helpers
  // ----------------------------
  static inferAbsoluteRootParts(value, fallbackName = "root") {
    // Prefer "window" if the object is window itself
    try {
      if (typeof window === "object" && value === window) return ["window"];
    } catch {}

    // Prefer "globalThis" if that's the object
    try {
      if (typeof globalThis === "object" && value === globalThis) return ["globalThis"];
    } catch {}

    // Best-effort: find direct global binding (window[k] === value)
    try {
      if (typeof window === "object") {
        for (const k of Object.keys(window)) {
          try {
            if (window[k] === value) return [k];
          } catch {}
        }
      }
    } catch {}

    // fallback
    return [fallbackName || "root"];
  }

  static formatScalar(value, maxLen = 140) {
    const t = typeof value;

    if (value === null) return { preview: "null", kind: "null" };
    if (t === "undefined") return { preview: "undefined", kind: "undefined" };
    if (t === "string") {
      const s = value.length > maxLen ? value.slice(0, maxLen) + "…" : value;
      return { preview: JSON.stringify(s), kind: "string" };
    }
    if (t === "number" || t === "bigint") return { preview: String(value), kind: t };
    if (t === "boolean") return { preview: value ? "true" : "false", kind: "boolean" };
    if (t === "symbol") return { preview: value.toString(), kind: "symbol" };

    if (value instanceof Date)
      return { preview: `Date(${isNaN(value) ? "Invalid" : value.toISOString()})`, kind: "date" };
    if (value instanceof RegExp) return { preview: value.toString(), kind: "regexp" };

    try {
      const s = String(value);
      return { preview: s.length > maxLen ? s.slice(0, maxLen) + "…" : s, kind: t };
    } catch {
      return { preview: "[unprintable]", kind: "unknown" };
    }
  }

  static getFunctionSignature(fn) {
    const info = {
      name: fn?.name || "",
      arity: typeof fn === "function" ? fn.length : 0,
      params: null,
      isNative: false,
      sourcePreview: null,
    };

    if (typeof fn !== "function") return info;

    let src = "";
    try {
      src = Function.prototype.toString.call(fn);
    } catch {
      return info;
    }

    info.isNative = /\{\s*\[native code\]\s*\}/.test(src);
    info.sourcePreview = src.length > 200 ? src.slice(0, 200) + "…" : src;

    if (info.isNative) return info;

    const m =
      src.match(/^[\s\(]*function\b[^(]*\(([^)]*)\)/) ||
      src.match(/^[\s\(]*\(([^)]*)\)\s*=>/) ||
      src.match(/^[\s\(]*([^=\s\(\),]+)\s*=>/);

    if (!m) return info;

    const raw = (m[1] ?? "").trim();
    if (!raw) {
      info.params = [];
      return info;
    }

    info.params = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return info;
  }
}

function factory(...args){
    return new TreeInspector(...args);
}
const openConsole = treeConsole.console;
treeConsole.install(TreeInspector);
export { TreeInspector as cls, factory as inspector , openConsole};
export default { cls: TreeInspector, inspector: factory , console:openConsole};


