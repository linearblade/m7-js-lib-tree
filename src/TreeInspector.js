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
    
    constructor(obj, options = {}) {
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
	    this.parse();
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

    
}
