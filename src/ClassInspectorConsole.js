/**
 * classInspector.js
 *
 * Purpose:
 * - Provide class/constructor introspection WITHOUT relying on globals.
 * - Synthesize a stable "tree view" of classes:
 *     <Class>
 *       ├─ [[static]]
 *       └─ prototype
 *
 * HARD expectations:
 * - ctx is a normal ctx object with:
 *   - ctx.TreeInspector (for icons/types elsewhere, optional here)
 *   - ctx.lib.helpers.escapeHtml (optional elsewhere; not used here)
 *
 * Notes:
 * - This file does NOT render DOM.
 * - This file does NOT mutate the inspected target/class.
 * - This file DOES "synthesize" children nodes for classes.
 */

// ------------------------------------------------------------
// Small utils
// ------------------------------------------------------------
function isFn(x) {
    return typeof x === "function";
}

function isObj(x) {
    return x !== null && (typeof x === "object" || typeof x === "function");
}

/**
 * Best-effort class detection:
 * - native/compiled classes: Function + "class " prefix
 * - user-defined ES classes: same
 *
 * This will NOT treat plain functions as classes unless they look like classes,
 * but you can override by calling expand on any function if you want.
 */
function isClassLike(fn) {
    if (!isFn(fn)) return false;
    const src = Function.prototype.toString.call(fn);
    return /^\s*class\b/.test(src);
}

/**
 * Some libraries export constructor functions (not ES class syntax).
 * If you want to treat those as "class-like", use this predicate.
 */
function isConstructorLike(fn) {
    if (!isFn(fn)) return false;
    // Heuristic: has a prototype with at least 1 own prop besides constructor
    const p = fn.prototype;
    if (!p || !isObj(p)) return false;
    const names = Object.getOwnPropertyNames(p);
    return names.some((n) => n !== "constructor");
}

function safeGetOwnPropertyDescriptor(obj, key) {
    try {
	return Object.getOwnPropertyDescriptor(obj, key);
    } catch {
	return null;
    }
}

function safeGetOwnPropertyNames(obj) {
    try {
	return Object.getOwnPropertyNames(obj) || [];
    } catch {
	return [];
    }
}

function safeGetOwnPropertySymbols(obj) {
    try {
	return Object.getOwnPropertySymbols(obj) || [];
    } catch {
	return [];
    }
}

function toKeyString(key) {
    if (typeof key === "symbol") {
	// Symbol(desc)
	return key.toString();
    }
    return String(key);
}

// ------------------------------------------------------------
// Descriptor -> "node record" mapping
// ------------------------------------------------------------
function classifyDescriptor(desc) {
    if (!desc) return { type: "unknown" };

    // accessors
    const hasGet = typeof desc.get === "function";
    const hasSet = typeof desc.set === "function";
    if (hasGet || hasSet) {
	return { type: "accessor", hasGet, hasSet };
    }

    // value property
    const v = desc.value;
    if (typeof v === "function") return { type: "function" };
    if (Array.isArray(v)) return { type: "array" };
    if (v === null) return { type: "null" };
    return { type: typeof v === "object" ? "hash" : typeof v };
}

function buildSignatureForFunction(fn, name) {
    try {
	return {
	    name: name || fn?.name || "(anonymous)",
	    arity: typeof fn?.length === "number" ? fn.length : 0,
	    params: null,
	    isNative: /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(fn)),
	    sourcePreview: Function.prototype.toString.call(fn).slice(0, 240),
	};
    } catch {
	return {
	    name: name || "(anonymous)",
	    arity: 0,
	    params: null,
	    isNative: true,
	    sourcePreview: "",
	};
    }
}

function previewScalar(v) {
    try {
	if (typeof v === "string") return JSON.stringify(v);
	if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
	if (v === null) return "null";
	if (typeof v === "undefined") return "undefined";
	if (typeof v === "symbol") return v.toString();
	return null;
    } catch {
	return null;
    }
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Returns true if `ref` is something we can treat as a class node.
 * By default: ES class syntax OR constructor-like functions.
 */
function isInspectableClass(ref, { allowConstructorFunctions = true } = {}) {
    if (!isFn(ref)) return false;
    if (isClassLike(ref)) return true;
    if (allowConstructorFunctions && isConstructorLike(ref)) return true;
    return false;
}

/**
 * Generate the two synthetic top-level children for a class:
 * - [[static]]
 * - prototype
 *
 * These are "container nodes" whose ref points at:
 * - the class function itself
 * - the prototype object
 */
function getSyntheticRoots(ctx, { classRef, classPath }) {
  if (!ctx) throw new Error("[classInspector.getSyntheticRoots] ctx required");
  if (!isFn(classRef)) throw new Error("[classInspector.getSyntheticRoots] classRef must be function");
  if (!classPath) throw new Error("[classInspector.getSyntheticRoots] classPath required");

  const protoPath = `${classPath}.prototype`;

  return [
    {
      type: "hash",
      name: "prototype",
      ref: classRef.prototype,
      path: protoPath,
      pathParts: protoPath.split("."),
      parentPath: classPath,
      depth: null,
      children: [],
      synthetic: true,
      isPrototype: true,
    },
  ];
}
/*
function getSyntheticRoots(ctx, { classRef, classPath }) {
    if (!ctx) throw new Error("[classInspector.getSyntheticRoots] ctx required");
    if (!isFn(classRef)) throw new Error("[classInspector.getSyntheticRoots] classRef must be function");
    if (!classPath) throw new Error("[classInspector.getSyntheticRoots] classPath required");

    const staticPath = `${classPath}.[[static]]`;
    const protoPath = `${classPath}.prototype`;

    return [
	{
	    type: "hash",
	    name: "[[static]]",
	    ref: classRef,
	    path: staticPath,
	    pathParts: staticPath.split("."),
	    parentPath: classPath,
	    depth: null,
	    children: [], // optional; can be filled by expand step
	    synthetic: true,
	},
	{
	    type: "hash",
	    name: "prototype",
	    ref: classRef.prototype,
	    path: protoPath,
	    pathParts: protoPath.split("."),
	    parentPath: classPath,
	    depth: null,
	    children: [],
	    synthetic: true,
	},
    ];
}
*/
/**
 * Enumerate members of:
 * - the class itself (static)
 * - the prototype (instance)
 *
 * Produces child node records that "look like" TreeInspector nodes.
 */
function enumerateMembers(ctx, {
    ownerRef,
    ownerPath,
    includeSymbols = true,
    includeNonEnumerable = true, // we use getOwnPropertyNames, so yes by default
    skipBuiltins = true,
    kind, // "static" | "prototype"
}) {
    if (!ctx) throw new Error("[classInspector.enumerateMembers] ctx required");
    if (!ownerRef) throw new Error("[classInspector.enumerateMembers] ownerRef required");
    if (!ownerPath) throw new Error("[classInspector.enumerateMembers] ownerPath required");

    // keys
    const names = includeNonEnumerable ? safeGetOwnPropertyNames(ownerRef) : Object.keys(ownerRef);
    const syms = includeSymbols ? safeGetOwnPropertySymbols(ownerRef) : [];
    const keys = [...names, ...syms];

    const rows = [];

    for (const key of keys) {
	// skip noisy builtins
	if (skipBuiltins && typeof key !== "symbol") {
	    const k = String(key);
	    if (kind === "static") {
		// common function/class builtins
		if (k === "length" || k === "name" || k === "prototype") continue;
		if (k === "caller" || k === "arguments") continue;
	    }
	    if (kind === "prototype") {
		if (k === "constructor") continue;
	    }
	}

	const desc = safeGetOwnPropertyDescriptor(ownerRef, key);
	if (!desc) continue;

	const keyStr = toKeyString(key);
	const path = `${ownerPath}.${keyStr}`;

	const cls = classifyDescriptor(desc);

	// Accessors: create a node representing the property, but keep signature info for get/set
	if (cls.type === "accessor") {
	    const sigParts = [];
	    if (desc.get) sigParts.push("get");
	    if (desc.set) sigParts.push("set");
	    const label = keyStr;

	    rows.push({
		type: "accessor",
		name: label,
		ref: null,
		path,
		pathParts: path.split("."),
		parentPath: ownerPath,
		depth: null,
		signature: {
		    name: `${sigParts.join("/") || "accessor"} ${label}`,
		    arity: 0,
		    params: null,
		    isNative: false,
		    sourcePreview: "",
		},
		accessor: {
		    hasGet: !!desc.get,
		    hasSet: !!desc.set,
		    getSignature: desc.get ? buildSignatureForFunction(desc.get, `get ${label}`) : null,
		    setSignature: desc.set ? buildSignatureForFunction(desc.set, `set ${label}`) : null,
		},
		synthetic: true,
	    });

	    continue;
	}

	// Regular value property
	const v = desc.value;

	const rec = {
	    type: cls.type === "null" ? "hash" : cls.type, // keep existing UI stable
	    name: keyStr,
	    ref: v,
	    path,
	    pathParts: path.split("."),
	    parentPath: ownerPath,
	    depth: null,
	    synthetic: true,
	};

	if (typeof v === "function") {
	    rec.signature = buildSignatureForFunction(v, keyStr);
	} else {
	    const pv = previewScalar(v);
	    if (pv != null) {
		rec.valuePreview = pv;
		rec.valueKind = typeof v;
	    }
	}

	rows.push(rec);
    }

    return rows;
}

/**
 * Expand a TreeInspector "class" info object with synthetic children.
 *
 * Expected input:
 * - info: result from ctx.inspector.inspect(path, ...)
 * - info.ref should be the actual class function (or constructor)
 * - info.path is absolute
 *
 * Output:
 * - newInfo: same object (cloned shallow) with children[] filled (synthetic)
 */




function expandClassInfo(ctx, info, opts = {}) {
    if (!ctx) throw new Error("[classInspector.expandClassInfo] ctx required");
    if (!info) throw new Error("[classInspector.expandClassInfo] info required");

    const classRef = info.ref;
    const classPath = info.path;

    if (!isInspectableClass(classRef, opts)) {
	// return as-is if not treatable
	return info;
    }

    const includeSymbols = opts.includeSymbols ?? true;
    const skipBuiltins = opts.skipBuiltins ?? false; // you said "get it all" for now

    // 1) enumerate statics directly under the class path
const staticMembers = enumerateMembers(ctx, {
  ownerRef: classRef,
  ownerPath: classPath,       // <- direct
  includeSymbols,
  skipBuiltins,
  kind: "static",
}).map((n) => ({ ...n, isStatic: true }));

// 2) prototype root container
const [protoRoot] = getSyntheticRoots(ctx, { classRef, classPath });

const protoMembers = enumerateMembers(ctx, {
  ownerRef: classRef.prototype,
  ownerPath: protoRoot.path,
  includeSymbols,
  skipBuiltins,
  kind: "prototype",
});

protoRoot.children = protoMembers;

// 3) attach to info
const out = { ...info };
out.children = [...staticMembers, protoRoot];
out.childCount = out.children.length;

out.classInspector = {
  synthetic: true,
  staticCount: staticMembers.length,
  protoCount: protoMembers.length,
};

return out;
}
/*
  
function expandClassInfo(ctx, info, opts = {}) {
    if (!ctx) throw new Error("[classInspector.expandClassInfo] ctx required");
    if (!info) throw new Error("[classInspector.expandClassInfo] info required");

    const classRef = info.ref;
    const classPath = info.path;

    if (!isInspectableClass(classRef, opts)) {
	// return as-is if not treatable
	return info;
    }

    const includeSymbols = opts.includeSymbols ?? true;
    const skipBuiltins = opts.skipBuiltins ?? false; // you said "get it all" for now

    // 1) synthetic root containers
    const [staticRoot, protoRoot] = getSyntheticRoots(ctx, { classRef, classPath });

    // 2) fill their children lists
    const staticMembers = enumerateMembers(ctx, {
	ownerRef: classRef,
	ownerPath: staticRoot.path,
	includeSymbols,
	skipBuiltins,
	kind: "static",
    });

    const protoMembers = enumerateMembers(ctx, {
	ownerRef: classRef.prototype,
	ownerPath: protoRoot.path,
	includeSymbols,
	skipBuiltins,
	kind: "prototype",
    });

    staticRoot.children = staticMembers;
    protoRoot.children = protoMembers;

    // 3) attach to info
    const out = { ...info };
    out.children = [staticRoot, protoRoot];
    out.childCount = out.children.length;

    // optional metadata
    out.classInspector = {
	synthetic: true,
	staticCount: staticMembers.length,
	protoCount: protoMembers.length,
    };

    return out;
    }
    */

export {
    isInspectableClass,
    getSyntheticRoots,
    enumerateMembers,
    expandClassInfo,
};

export default {
    isInspectableClass,
    getSyntheticRoots,
    enumerateMembers,
    expandClassInfo,
};
