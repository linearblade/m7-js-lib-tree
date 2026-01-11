// ClassInspector.js
//
// TreeInspector mixin traits for class expansion.
// Produces "statics" and "prototype" children under a class node.
//
// Conventions:
// - Children are addressable via:
//   - <ClassPath>.<staticName>
//   - <ClassPath>.prototype.<methodName>
// - We mark generated nodes with `synthetic: true`
// - We avoid built-in noise by default (configurable)
// being instance shit
function getInstanceMeta(obj) {
    if (!obj || typeof obj !== "object") return null;

    const proto = Object.getPrototypeOf(obj);
    if (!proto) return null;

    // ignore plain objects
    if (proto === Object.prototype || proto === null) return null;

    const Ctor = proto.constructor;
    if (typeof Ctor !== "function") return null;

    // only treat actual `class` constructors as “instances”
    if (!isClassDefinition(Ctor)) return null;

    return {
	ctor: Ctor,
	className: Ctor.name || "(anonymous)",
    };
}

function getProtoChain(obj) {
  const out = [];
  let p = Object.getPrototypeOf(obj);
  while (p && p !== Object.prototype) {
    out.push(p);
    p = Object.getPrototypeOf(p);
  }
  return out;
}

function getProtoMembers(obj, { includeSymbols = true } = {}) {
  const chain = getProtoChain(obj);
  const out = [];

  for (const proto of chain) {
    const names = Object.getOwnPropertyNames(proto);
    for (const n of names) out.push({ key: n, proto });

    if (includeSymbols) {
      const syms = Object.getOwnPropertySymbols(proto);
      for (const s of syms) out.push({ key: s, proto });
    }
  }

  return out;
}
//end instance shit


function isCtorFunction(x) {
    return typeof x === "function";
}

function isClassLike(fn) {
  if (typeof fn !== "function") return false;

  // true classes
  if (isClassDefinition(fn)) return true;

  // Heuristic: functions with a prototype that has methods (non-enumerable)
  const proto = fn.prototype;
  if (proto && typeof proto === "object") {
    const names = Object.getOwnPropertyNames(proto).filter(n => n !== "constructor");
    const syms = Object.getOwnPropertySymbols(proto);
    if (names.length || syms.length) return true;
  }

  // Heuristic: constructor has interesting own props (statics)
  const own = Object.getOwnPropertyNames(fn).filter(n => !["length", "name", "prototype"].includes(n));
  if (own.length) return true;

  return false;
}

// "class Foo {}" => toString starts with "class "
function isClassDefinition(fn) {
    if (!isCtorFunction(fn)) return false;
    try {
	const s = Function.prototype.toString.call(fn);
	return /^\s*class\s/.test(s);
    } catch {
	return false;
    }
}

function getOwnKeys(obj, { includeSymbols = false } = {}) {
    const names = Object.getOwnPropertyNames(obj);
    if (!includeSymbols) return names;
    return names.concat(Object.getOwnPropertySymbols(obj));
}

function shouldSkipKey(key, { skipBuiltins = true } = {}) {
    if (!skipBuiltins) return false;
    // common noise
    return key === "length" || key === "name" || key === "prototype" || key === "caller" || key === "arguments";
}

// small helper for "type" classification of descriptors
function typeFromDescriptor(desc) {
    if (!desc) return "unknown";
    if ("value" in desc) {
	const v = desc.value;
	if (typeof v === "function") return "function";
	if (v === null) return "null";
	if (Array.isArray(v)) return "array";
	if (typeof v === "object") return "hash";
	return typeof v; // string/number/boolean/undefined/symbol/bigint
    }
    // accessor
    return "accessor";
}

export const ClassInspectorTraits = {
    // ---- public-ish helpers (callable from detail.js later if you want) ----
    isInspectableClass(ref) {
	return isClassDefinition(ref);
    },


    // ---- TreeInspector hook: expand class node children ----
//
// Desired shape:
//   MyClass
//     - y              (static)
//     - static_method  (static)
//     - prototype
//         - instance_method
//
_classChildren(node, { includeSymbols = true, skipBuiltins = true } = {}) {
  const Ctor = node?.ref;
  if (!isClassDefinition(Ctor)) return [];

  const out = [];

  // --- statics on the ctor (addressable: <ClassPath>.<key>) ---
  for (const key of getOwnKeys(Ctor, { includeSymbols })) {
    const name = typeof key === "symbol" ? key.toString() : String(key);
    if (shouldSkipKey(name, { skipBuiltins })) continue;

    const desc = Object.getOwnPropertyDescriptor(Ctor, key);
    const type = typeFromDescriptor(desc);

    const childPath = `${node.path}.${name}`;

    out.push({
      type,
      name,
      ref: desc?.value, // accessors => undefined here (ok)
      path: childPath,
      pathParts: childPath.split("."),
      parentPath: node.path,
      depth: node.depth + 1,
      synthetic: true,      // derived via reflection
      isStatic: true,       // <- enrichment you asked for
      ownerKind: "static",  // optional, useful in UI later
    });
  }

  // --- prototype folder (addressable: <ClassPath>.prototype.<key>) ---
  const protoPath = `${node.path}.prototype`;
  const protoFolder = {
    type: "hash",
    name: "prototype",
    ref: Ctor.prototype,
    path: protoPath,
    pathParts: protoPath.split("."),
    parentPath: node.path,
    depth: node.depth + 1,
    synthetic: true,
    isPrototype: true,
    // children are filled by TreeInspector's normal object parsing (with non-enum enabled in TreeInspector.js patch)
  };

  out.push(protoFolder);
  return out;
},
    
    // ---- TreeInspector hook: expand class node children ----
    //
    // Returns an array of "child nodes" in the TreeInspector node format:
    // { type, name, path, pathParts, parentPath, depth, ref, children?, synthetic? }
    //
    _oldclassChildren(node, { includeSymbols = true, skipBuiltins = false } = {}) {
	const Ctor = node?.ref;
	console.log('IN CLASS CHILDREN',node,Ctor);
	if (!isClassDefinition(Ctor)) return [];

	const out = [];

	// We add two synthetic folders: statics + prototype
	const staticsPath = `${node.path}.statics`;
	const protoPath = `${node.path}.prototype`;

	const staticsFolder = {
	    type: "hash",
	    name: "statics",
	    ref: Ctor, // folder is conceptual; ref points at ctor
	    path: staticsPath,
	    pathParts: staticsPath.split("."),
	    parentPath: node.path,
	    depth: node.depth + 1,
	    synthetic: true,
	    children: [],
	};

	const protoFolder = {
	    type: "hash",
	    name: "prototype",
	    ref: Ctor.prototype,
	    path: protoPath,
	    pathParts: protoPath.split("."),
	    parentPath: node.path,
	    depth: node.depth + 1,
	    synthetic: true,
	    children: [],
	};

	// --- statics ---
	for (const key of getOwnKeys(Ctor, { includeSymbols })) {
	    const name = typeof key === "symbol" ? key.toString() : String(key);
	    if (shouldSkipKey(name, { skipBuiltins })) continue;

	    const desc = Object.getOwnPropertyDescriptor(Ctor, key);
	    const type = typeFromDescriptor(desc);

	    // addressable: <ClassPath>.<key>
	    const childPath = `${node.path}.${name}`;

	    staticsFolder.children.push({
		type,
		name,
		ref: desc?.value, // for accessor this will be undefined; ok for now
		path: childPath,
		pathParts: childPath.split("."),
		parentPath: staticsFolder.path,
		depth: staticsFolder.depth + 1,
		synthetic: true,
	    });
	}

	// --- prototype (instance methods/accessors live here) ---
	const proto = Ctor.prototype;
	if (proto && typeof proto === "object") {
	    for (const key of getOwnKeys(proto, { includeSymbols })) {
		const name = typeof key === "symbol" ? key.toString() : String(key);
		if (name === "constructor") continue;
		if (shouldSkipKey(name, { skipBuiltins })) continue;

		const desc = Object.getOwnPropertyDescriptor(proto, key);
		const type = typeFromDescriptor(desc);

		// addressable: <ClassPath>.prototype.<key>
		const childPath = `${node.path}.prototype.${name}`;

		protoFolder.children.push({
		    type,
		    name,
		    ref: desc?.value,
		    path: childPath,
		    pathParts: childPath.split("."),
		    parentPath: protoFolder.path,
		    depth: protoFolder.depth + 1,
		    synthetic: true,
		});
	    }
	}

	
	//out.push(staticsFolder, protoFolder);
	out.push(protoFolder);
	for (const item of staticsFolder.children){
	    out.push(item);
	}
	return out;
    },


    // detect if its an instance of a class
    _enrichHashInstance(node, value) {
	const meta = getInstanceMeta(value);
	if (!meta) return;
	//console.log('ENRICHING INSTANCE CLASS INFO', node.name);
	node.isInstance = true;
	node.instanceClassName = meta.className;
	node.instanceCtorRef = meta.ctor;

	// Optional: if the class was already indexed somewhere, link it
	const ctorNode = this._findByRef?.(meta.ctor);
	if (ctorNode?.path) node.instanceClassPath = ctorNode.path;
    },


    _appendInstanceProtoChildren(node, value, parseOpts, opts = {}) {
	const {
	    includeSymbols = true,
	    skipBuiltins = true,
	} = opts;

	const {
	    pathParts,
	    depth,
	    seen,
	    maxDepth,
	    includeNonEnumerable,
	    includeClasses,
	} = parseOpts;

	if (!node?.path || !value) return;
	if (!node.isInstance) return;

	const own = new Set(Reflect.ownKeys(value).map(k => String(k)));

	const already = new Set();
	if (Array.isArray(node.children)) {
	    for (const c of node.children) {
		if (c?.name) already.add(String(c.name));
	    }
	}

	// add constructor link (addressable: <instPath>.constructor)
if (!already.has("constructor")) {
  const Ctor = value?.constructor;

  if (typeof Ctor === "function") {
    const ctorNode = this._parseNode({
      value: Ctor,
      name: "constructor",
      pathParts: pathParts.concat(["constructor"]),
      parentPath: node.path,
      depth: depth + 1,
      seen,
      maxDepth,
      includeNonEnumerable,
      includeClasses,
    });

    ctorNode.synthetic = true;
    ctorNode.inherited = true;
    ctorNode.ownerKind = "constructor";

    node.children.push(ctorNode);
    already.add("constructor");
  }
}

// append static members as <instPath>.constructor.<name>
const Ctor = value?.constructor;
if (typeof Ctor === "function") {
  const staticKeys = Reflect.ownKeys(Ctor);

  for (const k of staticKeys) {
    const name = typeof k === "symbol" ? k.toString() : String(k);

    // skip builtins for constructor itself
    if (name === "length" || name === "name" || name === "prototype") continue;
    if (skipBuiltins && shouldSkipKey(name, { skipBuiltins })) continue;

    // avoid duplicates (instance might already have same-named prop)
    if (own.has(name)) continue;

    // IMPORTANT: these are different pathParts (constructor namespace)
    const childPathParts = pathParts.concat(["constructor", name]);

    const desc = Object.getOwnPropertyDescriptor(Ctor, k);
    const v = desc?.value;

    const childNode = this._parseNode({
      value: v,
      name,
      pathParts: childPathParts,
      parentPath: `${node.path}.constructor`,
      depth: depth + 2,
      seen,
      maxDepth,
      includeNonEnumerable,
      includeClasses,
    });

    childNode.synthetic = true;
    childNode.isStatic = true;
    childNode.ownerKind = "static";
    childNode.via = "constructor"; // optional flag

    // Note: to keep UI clean, you may want these AFTER prototype methods
    node.children.push(childNode);
  }
}
	
	for (const { key, proto } of getProtoMembers(value, { includeSymbols })) {
	    const name = typeof key === "symbol" ? key.toString() : String(key);

	    if (name === "constructor") continue;
	    if (skipBuiltins && shouldSkipKey(name, { skipBuiltins })) continue;

	    // never shadow own props
	    if (own.has(name)) continue;
	    if (already.has(name)) continue;

	    // IMPORTANT: use the same pipeline as normal nodes
	    const desc = Object.getOwnPropertyDescriptor(proto, key);
	    const v = desc?.value;

	    const childNode = this._parseNode({
		value: v,
		name,
		pathParts: pathParts.concat([name]),
		parentPath: node.path,
		depth: depth + 1,
		seen,
		maxDepth,
		includeNonEnumerable,
		includeClasses,
	    });

	    childNode.synthetic = true;
	    childNode.inherited = true;
	    childNode.ownerKind = "prototype";

	    node.children.push(childNode);
	    already.add(name);
	}
    }
};


export default  ClassInspectorTraits ;
