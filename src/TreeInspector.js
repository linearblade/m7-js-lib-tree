/*
  create proper console later.
await shell.bootstrap.load({resource:"https://static.m7.org/vendor/m7BootStrap/examples/console/package.json"},{
  load: ["#runners.mount", (sys, ctx) => console.log("Loaded:", ctx.results)],
  error: [(sys, ctx) => console.error("Failed:", ctx.failed)],
  package: { hooks: true }
})
 */
import treeConsole from './console.js';
class TreeInspector {

    static ICONS = {
	object: "📁",     // hash / plain object
	array: "🔗",      // array
	function: "ƒ",    // function
	class: "🏛️",      // class
	scalar: "❓",     // primitive / data
	circular: "♻️",   // circular reference
    };
    static NODE_ENRICHERS = {
	function: v => ({ signature: TreeInspector.getFunctionSignature(v) }),
	class:    v => ({ signature: TreeInspector.getFunctionSignature(v) }),
    };
    /**
     * @param {any} obj - The root object/hash you want to analyze (e.g. your monstrous `lib`)
     * @param {object} [options]
     */
    
    constructor(obj, options = {name='root'}) {
	this.rootRef = obj;
	this.options = options;

	// internal line buffer for dumps
	this._out = "";
	// Will hold the enriched parse tree (your {type,name,children,ref,...} nodes)
	this.tree = null;

	// Optional indexes for fast lookup later (path->node, ref->node, etc.)
	this.index = {
	    byPath: new Map(),
	    byRef: new WeakMap(),
	};

	// Parse immediately by default (can be turned off via options.autoParse === false)
	if (this.options.autoParse !== false) {
	    this.parse({name});
	}

	

    }

    /**
     * Builds/rebuilds the enriched tree and any indexes.
     * @param {object} [opts] - e.g. { maxDepth, includeNonEnumerable, ... }
     * @returns {this}
     */
    // ---- parse (refactored from buildParseTree) ----
    parse({
	value = this.rootRef,
	name = "root",
	seen = new WeakMap(),
	maxDepth = Infinity,
	depth = 0,
    } = {}) {

	if (depth === 0) {
	    // explicit flush
	    this.tree = null;
	    this.index.byPath.clear();
	    this.index.byRef = new WeakMap();
	}
	const t = typeof value;

	const isClass =
	      t === "function" &&
	      /^class\s/.test(Function.prototype.toString.call(value));

	const type =
	      value && t === "object"
              ? (Array.isArray(value) ? "array" : "hash")
              : isClass
              ? "class"
              : t === "function"
              ? "function"
              : value === null
              ? "null"
              : t;

	// Handle cycles/shared refs (only for objects/arrays)
	if (value && t === "object" && seen.has(value)) {
	    return { type: "ref", name, ref: value };
	}

	const node = { type, name, ref: value };
	Object.assign(node, TreeInspector.NODE_ENRICHERS[type]?.(value));

	const isNonTerminal = type === "hash" || type === "array";
	if (!isNonTerminal) return node;

	// Register before descending (cycle-safe)
	seen.set(value, node);

	if (depth >= maxDepth) {
	    node.children = [];
	    return node;
	}

	node.children = [];

	if (type === "hash") {
	    for (const [k, v] of Object.entries(value)) {
		node.children.push(
		    this.parse({ value: v, name: k, seen, maxDepth, depth: depth + 1 })
		);
	    }
	} else {
	    for (let i = 0; i < value.length; i++) {
		node.children.push(
		    this.parse({ value: value[i], name: String(i), seen, maxDepth, depth: depth + 1 })
		);
	    }
	}

	// If this was the top-level parse call, store it
	if (depth === 0 && value === this.rootRef) {
	    this.tree = node;
	}

	return node;
    }


    
    /**
     * Inspect a target within the tree.
     * @param {string|any} target
     *   - string: dot-notation path like "utils.hash.merge"
     *   - ref: actual object/function reference contained in the tree
     * @param {object} [opts]
     * @returns {any} - likely a node (or nodes) plus useful metadata
     */
    inspect(target, opts = {}) {
	// TODO: if string, resolve via byPath index (support leading "root." optional)
	// TODO: if ref (object/function), resolve via byRef WeakMap
	// TODO: return a rich inspection payload (node, children preview, signature, etc.)
	return null;
    }

    /**
     * Find nodes by partial match.
     * @param {string|RegExp|function} partial
     *   - string: substring match against node.name and/or path
     *   - RegExp: regex match
     *   - function: predicate(node) => boolean
     * @param {object} [opts]
     * @returns {Array<any>} - list of matching nodes (or result objects)
     */
    find(partial, opts = {}) {
	// TODO: traverse this.tree and collect matches
	// TODO: support opts like { limit, types, pathsOnly }
	return [];
    }

    /**
     * Dump a printable representation (tree text) for validation / console output.
     * @param {object} [opts]
     * @returns {string} - multi-line text
     */
    dump(opts = {}) {
	// TODO: render this.tree into a string (optionally using icons, maxDepth, etc.)
	return "";
    }

    static  getFunctionSignature(fn) {
	const info = {
	    name: fn?.name || "",
	    arity: typeof fn === "function" ? fn.length : 0,
	    params: null,          // array of param "strings" (best effort)
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

	// Best-effort param extraction (handles function/method/arrow in common cases)
	// NOTE: returns raw param text segments (may include destructuring/defaults)
	const m =
	      src.match(/^[\s\(]*function\b[^(]*\(([^)]*)\)/) ||          // function f(a,b)
	      src.match(/^[\s\(]*\(([^)]*)\)\s*=>/) ||                    // (a,b)=> ...
	      src.match(/^[\s\(]*([^=\s\(\),]+)\s*=>/);                   // a=> ...

	if (!m) return info;

	const raw = (m[1] ?? "").trim();
	if (!raw) {
	    info.params = [];
	    return info;
	}

	// Split on commas, but keep it simple; this won’t perfectly handle nested commas in destructuring.
	info.params = raw.split(",").map(s => s.trim()).filter(Boolean);
	return info;
    }

    // ---- buffer helpers ----
    _resetOut() { this._out = ""; }
    _logLine(text) { this._out += text + "\n"; }
    _flushOut() {
	const out = this._out;
	this._out = "";
	return out;
    }
    // ---- print/dump parse tree (validation) ----
    dump({
	node = this.tree,
	icons = TreeInspector.ICONS,
	toConsole = true,
    } = {}) {
	this._resetOut();
	this._dumpNode(node, { indent: "", isLast: true, icons });
	const out = this._flushOut();
	if (toConsole) console.log("%s", out);
	else return out;
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

	this._logLine(`${indent}${branch}${icon} ${node.name}`);

	const kids = node.children || [];
	for (let i = 0; i < kids.length; i++) {
	    this._dumpNode(kids[i], {
		indent: nextIndent,
		isLast: i === kids.length - 1,
		icons,
	    });
	}
    }


    // --------- INSPECT ----------
    /**
     * Inspect a target in the parse tree.
     * @param {string|any} target - dot path ("utils.hash.merge") OR the actual ref (function/object/etc)
     * @param {object} [opts]
     * @returns {object|null} payload describing the node + useful context
     */
    inspect(target, opts = {}) {
	const {
	    rootName = "root",
	    reparseIfMissing = true,
	    childrenPreview = 25,     // how many child names to preview
	    includeChildren = false,  // include full children array (can be big)
	    includeRef = true,        // include the raw ref in payload
	    show = false,             // if true, console.log a friendly summary
	} = opts;

	if (!this.tree && reparseIfMissing) this.parse({ name: rootName });
	if (!this.tree) return null;

	let hit = null;

	if (typeof target === "string") {
	    const path = this._normalizePath(target, rootName);
	    hit = this._findByPath(path);
	} else {
	    hit = this._findByRef(target);
	}

	if (!hit) return null;

	const { node, path, parent } = hit;

	const payload = {
	    type: node.type,
	    name: node.name,
	    path,
	    signature: node.signature ?? null,
	    parentPath: parent ? parent.path : null,
	    childCount: Array.isArray(node.children) ? node.children.length : 0,
	    childrenPreview: Array.isArray(node.children)
		? node.children.slice(0, childrenPreview).map(c => ({ name: c.name, type: c.type }))
		: [],
	};

	if (includeChildren) payload.children = node.children || [];
	if (includeRef) payload.ref = node.ref;

	if (show) {
	    const icon = TreeInspector.ICONS[node.type] ?? TreeInspector.ICONS.scalar;
	    console.log(`${icon} ${path}`);
	    if (payload.signature) console.log(payload.signature);
	    if (payload.childCount) console.log(`children: ${payload.childCount}`);
	}

	return payload;
    }

    _normalizePath(p, rootName) {
	// allow "root.utils.hash" or "utils.hash"
	const s = String(p).trim().replace(/^\.+|\.+$/g, "");
	if (!s) return rootName;
	return s.startsWith(rootName + ".") ? s : `${rootName}.${s}`;
    }

    _findByPath(fullPath) {
	// If you later build this.index.byPath, this becomes O(1). For now: DFS.
	const parts = fullPath.split(".").filter(Boolean);
	if (!parts.length) return null;
	if (parts[0] !== this.tree.name) return null;

	let node = this.tree;
	let parent = null;
	let path = node.name;

	for (let i = 1; i < parts.length; i++) {
	    const key = parts[i];
	    if (!node.children) return null;
	    const next = node.children.find(c => c.name === key);
	    if (!next) return null;
	    parent = { node, path };
	    node = next;
	    path += "." + key;
	}

	return { node, path, parent };
    }

    _findByRef(ref) {
	// If you later populate this.index.byRef, this becomes near O(1). For now: DFS.
	const stack = [{ node: this.tree, path: this.tree.name, parent: null }];
	while (stack.length) {
	    const cur = stack.pop();
	    if (cur.node && cur.node.ref === ref) return cur;

	    const kids = cur.node?.children || [];
	    for (let i = kids.length - 1; i >= 0; i--) {
		const child = kids[i];
		stack.push({
		    node: child,
		    path: `${cur.path}.${child.name}`,
		    parent: cur,
		});
	    }
	}
	return null;
    }

    // --------- stubs ----------

    find(partial, opts = {}) {
	const {
	    limit = 50,
	    types = null,          // e.g. ["function","class","hash"]
	    pathsOnly = false,     // return array of paths (strings)
	    includeNode = true,    // include node object
	    includeRef = false,    // include node.ref
	    includeSignature = true,
	    match = "name",        // "name" | "path" | "both"
	    rootName = "root",
	    reparseIfMissing = true,
	} = opts;

	if (!this.tree && reparseIfMissing) this.parse({ name: rootName });
	if (!this.tree) return [];

	const typeSet = types ? new Set(types) : null;

	// Build a matcher
	let predicate;
	if (typeof partial === "function") {
	    predicate = partial;
	} else if (partial instanceof RegExp) {
	    predicate = (node, path) => {
		const hay =
		      match === "path" ? path :
		      match === "both" ? `${path} ${node.name}` :
		      node.name;
		return partial.test(hay);
	    };
	} else {
	    const needle = String(partial ?? "").toLowerCase();
	    predicate = (node, path) => {
		const hay =
		      match === "path" ? path :
		      match === "both" ? `${path} ${node.name}` :
		      node.name;
		return String(hay).toLowerCase().includes(needle);
	    };
	}

	const results = [];
	const stack = [{ node: this.tree, path: this.tree.name, parentPath: null }];

	while (stack.length && results.length < limit) {
	    const { node, path, parentPath } = stack.pop();
	    if (!node) continue;

	    if (!typeSet || typeSet.has(node.type)) {
		let ok = false;
		try {
		    ok = !!predicate(node, path);
		} catch {
		    ok = false;
		}

		if (ok) {
		    if (pathsOnly) {
			results.push(path);
		    } else {
			const hit = {
			    type: node.type,
			    name: node.name,
			    path,
			    parentPath,
			    childCount: Array.isArray(node.children) ? node.children.length : 0,
			};

			if (includeNode) hit.node = node;
			if (includeRef) hit.ref = node.ref;
			if (includeSignature && node.signature) hit.signature = node.signature;

			results.push(hit);
		    }
		}
	    }

	    // DFS: push children
	    const kids = node.children || [];
	    for (let i = kids.length - 1; i >= 0; i--) {
		const child = kids[i];
		stack.push({
		    node: child,
		    path: `${path}.${child.name}`,
		    parentPath: path,
		});
	    }
	}

	return results;
    }   
}

function factory(...args){
    return new TreeInspector(...args);
}
const console = treeConsole.console;
treeConsole.install(TreeInspector);
export { TreeInspector as cls, factory as inspector , console};
export default { cls: TreeInspector, inspector: factory , console};
