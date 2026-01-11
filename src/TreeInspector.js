/*
  create proper console later.
  await shell.bootstrap.load({resource:"https://static.m7.org/vendor/m7BootStrap/examples/console/package.json"},{
  load: ["#runners.mount", (sys, ctx) => console.log("Loaded:", ctx.results)],
  error: [(sys, ctx) => console.error("Failed:", ctx.failed)],
  package: { hooks: true }
  })

  [...tree.index.byPath.values()]
  window.lib.testClass = class test { x = 1;static y = 2; static static_method(){}; instance_method(){}}

*/
import treeConsole          from './console.js';
import applyMixins          from './applyMixins.js';
import ClassInspectorTraits from './ClassInspector.js';

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
	function: v => ({ signature: TreeInspector.getFunctionSignature(v) }),
	class:    v => ({ signature: TreeInspector.getFunctionSignature(v) }),
    };

    // ----------------------------
    // ctor / state
    // ----------------------------
    constructor(obj, options = {}) {
	// prefer window in browsers, otherwise globalThis
	const defaultGlobal =
	      (typeof window !== "undefined" && window) ||
	      (typeof globalThis !== "undefined" ? globalThis : undefined);

	const {
	    global = defaultGlobal,
	    hint = "root",
	    autoParse = true,

	    // bounds for slow-path root inference (object -> absolute path)
	    inferDepth = 6,
	    inferMaxNodes = 50_000,

	    // parse depth cap
	    maxDepth = Infinity,
	    includeClasses = true,
	    includeNonEnumerable = false,
	    ...rest
	} = options;

	this.global = global;

	// canonical global label (used for absolute paths)
	this.globalName =
	    (typeof window !== "undefined" && global === window) ? "window" :
	    (typeof globalThis !== "undefined" && global === globalThis) ? "globalThis" :
	    "global";

	// root reference (string selector OR object/function/scalar)
	this.rootRef = obj;

	this.options = {
	    hint,
	    autoParse,
	    inferDepth,
	    inferMaxNodes,
	    maxDepth,
	    includeClasses,
	    // authoritative root for string resolution + inference
	    globalsRoot: this.global,

	    ...rest,
	};

	// internal buffers / state
	this._out = "";
	this.tree = null;

	// absolute-root tracking (filled during parse)
	this._absRootParts = null;
	this._absRootPath = null;

	// indexes
	this.index = {
	    byPath: new Map(),
	    byRef: new WeakMap(),
	};

	if (autoParse !== false) {
	    this.parse();
	}
    }

    // ----------------------------
    // Input resolution
    // ----------------------------
    _resolveInput(obj) {
	// 1) string selector: resolve directly (fast + absolute)
	if (typeof obj === "string") {
	    const sel = obj.trim();
	    if (!sel) throw new Error("[TreeInspector] Empty selector string");

	    const { ref, parts } = TreeInspector.resolveDotPath(sel, {
		root: this.global,
		rootLabel: this.globalName,
	    });

	    if (ref == null) throw new Error(`[TreeInspector] Selector not found: ${sel}`);

	    const absParts = parts.length ? parts : [this.globalName, this.options.hint];
	    const absPath  = absParts.join(".");
	    const hint     = absParts[absParts.length - 1] ?? this.options.hint;

	    return { ref, absParts, absPath, hint };
	}

	// 2) object/function/scalar: infer absolute path (bounded) when possible
	const ref = obj;
	if (ref == null) throw new Error("[TreeInspector] root ref is null/undefined");

	const tt = typeof ref;

	// scalar roots: allow, but absolute identity is global.hint (or just hint if no global)
	if (!(tt === "object" || tt === "function")) {
	    const absParts = this.global ? [this.globalName, this.options.hint] : [this.options.hint];
	    return { ref, absParts, absPath: absParts.join("."), hint: this.options.hint };
	}

	const foundParts =
	      TreeInspector.inferAbsoluteRootParts(ref, {
		  root: this.global,
		  rootLabel: this.globalName,
		  maxDepth: this.options.inferDepth,
		  maxNodes: this.options.inferMaxNodes,
	      }) || (this.global ? [this.globalName, this.options.hint] : [this.options.hint]);

	const absParts = foundParts.length ? foundParts : (this.global ? [this.globalName, this.options.hint] : [this.options.hint]);
	const absPath  = absParts.join(".");
	const hint     = absParts[absParts.length - 1] ?? this.options.hint;

	return { ref, absParts, absPath, hint };
    }

    /**
     * Resolve "lib.foo.bar" from global root.
     * Normalizes symbolic roots so "document.location" => "window.document.location" (when global is window)
     * Returns {ref, parts} where parts ALWAYS start with rootLabel.
     */
    static resolveDotPath(selector, { root = globalThis, rootLabel = "globalThis" } = {}) {
	const raw = String(selector || "").trim();
	if (!raw) return { ref: null, parts: [] };

	let parts = raw.split(".").filter(Boolean);
	if (!parts.length) return { ref: null, parts: [] };

	// If user already included "window." / "globalThis." etc, strip it for traversal but keep for parts output.
	const hasExplicitRoot = (parts[0] === rootLabel);
	const walkParts = hasExplicitRoot ? parts.slice(1) : parts;

	let obj = root;
	for (const p of walkParts) {
	    if (obj == null) return { ref: null, parts: hasExplicitRoot ? [rootLabel, ...walkParts] : [rootLabel, ...parts] };
	    try { obj = obj[p]; }
	    catch { return { ref: null, parts: hasExplicitRoot ? [rootLabel, ...walkParts] : [rootLabel, ...parts] }; }
	}

	// Always return absolute parts starting with rootLabel
	const absParts = [rootLabel, ...walkParts];
	return { ref: obj, parts: absParts };
    }

    /**
     * Best-effort: find an absolute global path to `target` by scanning from `root`.
     * Uses ref identity (===). Bounded for safety.
     * Returns array of path parts (starting with rootLabel) or null.
     */
    static inferAbsoluteRootParts(target, {
	root = globalThis,
	rootLabel = (typeof window !== "undefined" && root === window) ? "window" : "globalThis",
	maxDepth = 6,
	maxNodes = 50_000,
	includeNonEnumerable = false,
	includeSymbols = false,
	skipKeys = new Set([
	    "frames", "top", "parent", "opener",
	    "webkitStorageInfo", "chrome", "external",
	]),
    } = {}) {
	if (target == null) return null;
	const tt = typeof target;
	if (!(tt === "object" || tt === "function")) return null;

	if (target === root) return [rootLabel];

	const seen = new WeakSet();
	const q = [{ obj: root, parts: [rootLabel], depth: 0 }];
	let visited = 0;

	const tryRead = (o, k) => {
	    try {
		if (includeNonEnumerable) {
		    const d = Object.getOwnPropertyDescriptor(o, k);
		    // skip accessors to avoid triggering getters
		    if (d && typeof d.get === "function" && !("value" in d)) return { ok: false };
		}
		return { ok: true, value: o[k] };
	    } catch {
		return { ok: false };
	    }
	};

	while (q.length) {
	    const { obj, parts, depth } = q.shift();
	    visited++;
	    if (visited > maxNodes) return null;

	    if (obj == null) continue;
	    const t = typeof obj;
	    if (!(t === "object" || t === "function")) continue;

	    if (seen.has(obj)) continue;
	    seen.add(obj);

	    if (depth >= maxDepth) continue;

	    let keys = [];
	    try {
		keys = includeNonEnumerable ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
	    } catch {}

	    let symKeys = [];
	    if (includeSymbols) {
		try { symKeys = Object.getOwnPropertySymbols(obj); } catch {}
	    }

	    for (const k of keys) {
		if (skipKeys.has(k)) continue;

		const r = tryRead(obj, k);
		if (!r.ok) continue;

		const v = r.value;
		if (v === target) return [...parts, String(k)];

		const vt = typeof v;
		if (v && (vt === "object" || vt === "function")) {
		    q.push({ obj: v, parts: [...parts, String(k)], depth: depth + 1 });
		}
	    }

	    for (const s of symKeys) {
		const r = tryRead(obj, s);
		if (!r.ok) continue;

		const v = r.value;
		if (v === target) return [...parts, s.toString()];

		const vt = typeof v;
		if (v && (vt === "object" || vt === "function")) {
		    q.push({ obj: v, parts: [...parts, s.toString()], depth: depth + 1 });
		}
	    }
	}

	return null;
    }

    // ----------------------------
    // Core parse (authoritative paths)
    // ----------------------------
    parse({
	value = this.rootRef,
	maxDepth = this.options.maxDepth,
	includeClasses = this.options.includeClasses,
	includeNonEnumerable = this.options.includeNonEnumerable
    } = {}) {
	// flush
	this.tree = null;
	this.index.byPath.clear();
	this.index.byRef = new WeakMap();

	// resolve root input into {ref, absParts, absPath, hint}
	const resolved = this._resolveInput(value);

	// keep canonical absolute identity on the instance
	this.rootRef = resolved.ref;
	this._absRootParts = resolved.absParts;
	this._absRootPath = resolved.absPath;
	this.options.hint = resolved.hint;

	const rootParts = this._absRootParts.slice();
	const rootName  = rootParts[rootParts.length - 1] ?? this.options.hint;

	const seen = new WeakMap(); // obj -> canonical node (cycle/shared refs)
	//console.log('include classes = ',includeClasses);
	const rootNode = this._parseNode({
	    value: this.rootRef,
	    name: rootName,
	    pathParts: rootParts,
	    parentPath: null,
	    depth: 0,
	    seen,
	    maxDepth,
	    includeClasses,
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
	includeNonEnumerable = false,
	includeClasses = false,
    }) {
	const t = typeof value;

	const isClass =
	      t === "function" &&
	      (() => {
		  try { return /^class\s/.test(Function.prototype.toString.call(value)); }
		  catch { return false; }
	      })();

	const type =
	      value && t === "object"
	      ? (Array.isArray(value) ? "array" : "hash")
	      : isClass
	      ? "class"
	      : (t === "function" ? "function" : (value === null ? "null" : t));

	// IMPORTANT: classes become “branchy” when includeClasses is on
	const isBranch =
	      type === "hash" ||
	      type === "array" ||
	      (includeClasses && type === "class");
	//console.log('is branch', isBranch,includeClasses, type);
	const isRefable = (value && (t === "object" || t === "function")); // ok
	const path = pathParts.join(".");

	// cycles/shared refs (only meaningful for objects/functions)
	if (isRefable && seen.has(value)) {
	    const refNode = {
		type: "ref",
		name,
		ref: value,
		path,
		pathParts,
		parentPath,
		depth,
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

	Object.assign(node, TreeInspector.NODE_ENRICHERS[type]?.(value));

	// scalar preview
	if (!isBranch && type !== "ref" && type !== "function" && type !== "class") {
	    const { preview, kind } = TreeInspector.formatScalar(value);
	    node.valuePreview = preview;
	    node.valueKind = kind;
	}

	this._indexNode(node);

	// instance enrichment for objects
	if (type === "hash") {
	    this._enrichHashInstance(node, value);
	}

	
	// if not a branch, we’re done
	if (!isBranch) return node;

	// mark seen for cycle-safe descent
	if (isRefable) seen.set(value, node);

	// depth cap
	if (depth >= maxDepth) {
	    node.children = [];
	    return node;
	}

	node.children = [];

	if (type === "class") {
	    const entries = this._classChildren(node, {
		includeNonEnumerable,
		// any other knobs you want to pass through
	    });
	    console.log('got this', entries);
	    for (const entry of entries) {
		const k = entry.name;
		const v = entry.ref;

		// Special: ensure prototype branch includes non-enumerables (class methods are non-enumerable)
		const forceNonEnum =
		      entry && entry.name === "prototype" && entry.type === "hash";

		const childNode = this._parseNode({
		    value: v,
		    name: k,
		    pathParts: pathParts.concat([k]),
		    parentPath: path,
		    depth: depth + 1,
		    seen,
		    maxDepth,
		    includeNonEnumerable: forceNonEnum ? true : includeNonEnumerable,
		    includeClasses,
		});

		// Preserve/enrich metadata coming from ClassInspector
		if (entry && typeof entry === "object") {
		    // keep any flags like isStatic, ownerKind, synthetic...
		    for (const metaKey of Object.keys(entry)) {
			if (metaKey === "children") continue; // TreeInspector owns children
			if (metaKey === "ref") continue;      // TreeInspector owns ref
			if (metaKey === "path") continue;     // TreeInspector owns path
			if (metaKey === "pathParts") continue;
			if (metaKey === "parentPath") continue;
			if (metaKey === "depth") continue;
			if (metaKey === "name") continue;
			if (metaKey === "type") continue;     // TreeInspector may compute type
			childNode[metaKey] = entry[metaKey];
		    }
		}

		node.children.push(childNode);
	    }

	    return node;
	}
	if (0 &&type === "class") {
	    // expects ClassInspectorTraits mixed into TreeInspector prototype
	    // should return array of { name, value } pairs or node-like objects (your choice)
	    const entries = this._classChildren(node, {
		includeNonEnumerable,
		// any other knobs you want to pass through
	    });
	    //console.log('got this', entries);
	    for (const entry of entries) {
		//coerce into something digestible.
		const k = entry.name;
		const v = entry.ref;              
		node.children.push(
		    this._parseNode({
			value: v,
			name: k,
			pathParts: pathParts.concat([k]),
			parentPath: path,
			depth: depth + 1,
			seen,
			maxDepth,
			includeNonEnumerable : true,
			includeClasses,
		    })
		);
	    }
	    return node;

	    /*
	    // entries are already nodes
	    node.children = entries;

	    // IMPORTANT: index children manually
	    for (const child of entries) {
	    this._indexNode(child);
	    }

	    return node; */
	    /*
	      node.children.push(...entries);
	      console.log('in class diver, checking...',entries);
	      for (const { name: k, value: v } of entries) {
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
	      includeClasses,
	      })
	      );
	      }
	      console.log(node);
	      return node;*/
	}

	// existing hash/array behavior
	if (type === "hash") {
	    const keys = includeNonEnumerable
		  ? Reflect.ownKeys(value)
		  : Object.keys(value);

	    
	    for (const k of keys) {
		const v = value[k];
		node.children.push(
		    this._parseNode({
			value: v,
			name: String(k),
			pathParts: pathParts.concat([String(k)]),
			parentPath: path,
			depth: depth + 1,
			seen,
			maxDepth,
			includeNonEnumerable,
			includeClasses,
		    })
		);
	    }

	    this._appendInstanceProtoChildren(
		node,
		value,
		{
		    pathParts,
		    depth,
		    seen,
		    maxDepth,
		    includeNonEnumerable,
		    includeClasses,
		},
		{
		    includeSymbols: true,
		    skipBuiltins: true,
		}
	    );
	    
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
			includeClasses,
		    })
		);
	    }
	}

	return node;
    }

    
    
    _old__parseNode({
	value,
	name,
	pathParts,
	parentPath,
	depth,
	seen,
	maxDepth,
    }) {
	const t = typeof value;

	const isClass =
	      t === "function" &&
	      (() => {
		  try { return /^class\s/.test(Function.prototype.toString.call(value)); }
		  catch { return false; }
	      })();

	const type =
	      value && t === "object"
              ? (Array.isArray(value) ? "array" : "hash")
              : isClass
              ? "class"
              : (t === "function" ? "function" : (value === null ? "null" : t));

	const isBranch  = (type === "hash" || type === "array");
	const isRefable = (value && t === "object");
	const path      = pathParts.join(".");

	// cycles/shared refs
	if (isRefable && seen.has(value)) {
	    const refNode = {
		type: "ref",
		name,
		ref: value,
		path,
		pathParts,
		parentPath,
		depth,
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

	Object.assign(node, TreeInspector.NODE_ENRICHERS[type]?.(value));

	// scalar preview (everything that's not a branch/ref/function/class)
	if (!isBranch && type !== "ref" && type !== "function" && type !== "class") {
	    const { preview, kind } = TreeInspector.formatScalar(value);
	    node.valuePreview = preview;
	    node.valueKind = kind;
	}

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
	    for (const [k, v] of Object.entries(value)) {
		node.children.push(
		    this._parseNode({
			value: v,
			name: k,
			pathParts: pathParts.concat([k]),
			parentPath: path,
			depth: depth + 1,
			seen,
			maxDepth,
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
		    })
		);
	    }
	}

	return node;
    }

    _indexNode(node) {
	if (node?.path) this.index.byPath.set(node.path, node);

	const r = node?.ref;
	const tr = typeof r;
	if (r && (tr === "object" || tr === "function")) {
	    if (!this.index.byRef.has(r)) this.index.byRef.set(r, node);
	}
    }

    // ----------------------------
    // INSPECT (authoritative)
    // ----------------------------
    inspect(target, opts = {}) {
	const {
	    reparseIfMissing = true,
	    includeChildren = false,
	    childrenPreview = 60,
	    includeRef = true,
	    show = false,
	} = opts;

	if (!this.tree) {
	    if (reparseIfMissing) this.parse();
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

	//get canonical path for references. console can figure it out.
	const canonicalPath = this.getCanonicalPath(node);
	const payload = {
	    type: node.type,
	    name: node.name,
	    path: node.path,
	    canonicalPath,
	    pathParts: node.pathParts,
	    parentPath: node.parentPath ?? null,
	    depth: node.depth ?? null,
	    signature: node.signature ?? null,
	    valuePreview: node.valuePreview ?? null,
	    valueKind: node.valueKind ?? null,
	    isStatic : node.isStatic ?? false,
	    isInstance: node.isInstance ?? false,
	    childCount: Array.isArray(node.children) ? node.children.length : 0,
	    childrenPreview: Array.isArray(node.children)
		? node.children.slice(0, childrenPreview).map(c => ({ name: c.name, type: c.type, path: c.path }))
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

    getCanonicalPath(node){
	if (!node) return null;
	
	if (node.type !== "ref" || node.ref == null)
	    return node.path;
	
	const canonical = this._findByRef(node.ref);
	return  (canonical && canonical.node !== node) ?
	    canonical.path:
	    node.path;
    }
    
    _normalizePath(p) {
	const s = String(p ?? "").trim().replace(/^\.+|\.+$/g, "");
	if (!s) return this.tree?.path ?? this._absRootPath ?? this.options.hint;

	// absolute path?
	if (this.index.byPath.has(s)) return s;

	// relative -> prefix current root path
	const rootPath = this.tree?.path ?? this._absRootPath ?? this.options.hint;
	if (s === rootPath) return rootPath;
	if (s.startsWith(rootPath + ".")) return s;

	return rootPath + "." + s;
    }

    _findByRef(ref) {
	if (ref == null) return null;
	const t = typeof ref;
	if (!(t === "object" || t === "function")) return null;
	return this.index.byRef.get(ref) || null;
    }

    // ----------------------------
    // FIND (authoritative)
    // ----------------------------
    find(partial, opts = {}) {
	const {
	    limit = 50,
	    types = null,
	    pathsOnly = false,
	    includeRef = false,
	    includeSignature = true,
	    match = "both", // "name" | "path" | "both"
	    reparseIfMissing = true,
	} = opts;

	if (!this.tree) {
	    if (reparseIfMissing) this.parse();
	    if (!this.tree) return [];
	}

	const typeSet = types ? new Set(types) : null;

	let predicate;
	if (typeof partial === "function") {
	    predicate = partial;
	} else if (partial instanceof RegExp) {
	    predicate = (node) => {
		const hay =
		      match === "path" ? node.path :
		      match === "name" ? node.name :
		      `${node.path} ${node.name}`;
		return partial.test(hay);
	    };
	} else {
	    const needle = String(partial ?? "").toLowerCase();
	    predicate = (node) => {
		const hay =
		      match === "path" ? node.path :
		      match === "name" ? node.name :
		      `${node.path} ${node.name}`;
		return String(hay).toLowerCase().includes(needle);
	    };
	}

	const results = [];
	for (const node of this.index.byPath.values()) {
	    if (results.length >= limit) break;
	    if (!node) continue;
	    if (typeSet && !typeSet.has(node.type)) continue;

	    let ok = false;
	    try { ok = !!predicate(node); } catch { ok = false; }
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
    // DUMP (validation)
    // ----------------------------
    _out = "";
    _resetOut() { this._out = ""; }
    _logLine(text) { this._out += text + "\n"; }
    _flushOut() { const out = this._out; this._out = ""; return out; }

    dump({
	node = this.tree,
	icons = TreeInspector.ICONS,
	toConsole = true,
    } = {}) {
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
	      (["string","number","boolean","undefined","symbol","bigint"].includes(node.type)
               ? icons.scalar
               : icons.scalar);

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
    
    // ----------------------------
    // Helpers
    // ----------------------------
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

	if (value instanceof Date) {
	    return { preview: `Date(${isNaN(value) ? "Invalid" : value.toISOString()})`, kind: "date" };
	}
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
	try { src = Function.prototype.toString.call(fn); }
	catch { return info; }

	info.isNative = /\{\s*\[native code\]\s*\}/.test(src);
	info.sourcePreview = src.length > 200 ? src.slice(0, 200) + "…" : src;
	if (info.isNative) return info;

	// ---- NEW: class definition => pull constructor(...) params ----
	// class X { constructor(a,b=1) {...} foo(x) {...} }
	if (/^\s*class\b/.test(src)) {
	    // NOTE: this is intentionally “simple”: it matches until the first ')'
	    // (so destructuring with nested parens may not be perfect, but good enough for most)
	    const cm = src.match(/\bconstructor\s*\(([^)]*)\)/);

	    // default constructor => no params
	    if (!cm) {
		info.params = [];
		return info;
	    }

	    const raw = (cm[1] ?? "").trim();
	    info.params = raw
		? raw.split(",").map(s => s.trim()).filter(Boolean)
		: [];
	    return info;
	}

	// ---- existing: function / arrow / method / accessor ----
	const m =
	      // function foo(a,b) {…}
	      src.match(/^[\s\(]*function\b[^(]*\(([^)]*)\)/) ||
	      // (a,b) => …
	      src.match(/^[\s\(]*\(([^)]*)\)\s*=>/) ||
	      // a => …
	      src.match(/^[\s\(]*([^=\s\(\),]+)\s*=>/) ||
	      // async foo(a,b) {…}
	      src.match(/^\s*async\s+[*]?\s*[^(\s]+\s*\(([^)]*)\)\s*\{/) ||
	      // *foo(a,b) {…} OR foo(a,b) {…}   (class methods stringify like this too)
	      src.match(/^\s*[*]?\s*[^(\s]+\s*\(([^)]*)\)\s*\{/) ||
	      // get foo() {…}
	      src.match(/^\s*get\s+[^(\s]+\s*\(([^)]*)\)\s*\{/) ||
	      // set foo(v) {…}
	      src.match(/^\s*set\s+[^(\s]+\s*\(([^)]*)\)\s*\{/);

	if (!m) return info;

	const raw = (m[1] ?? "").trim();
	info.params = raw
	    ? raw.split(",").map(s => s.trim()).filter(Boolean)
	    : [];
	return info;
    }
}




applyMixins(TreeInspector, ClassInspectorTraits);
function factory(...args){
    return new TreeInspector(...args);
}
const openConsole = treeConsole.console;
treeConsole.install(TreeInspector);
export { TreeInspector as cls, factory as inspector , openConsole};
export default { cls: TreeInspector, inspector: factory , console:openConsole};
