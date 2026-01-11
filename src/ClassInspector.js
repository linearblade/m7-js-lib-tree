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



function isCtorFunction(x) {
    return typeof x === "function";
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


    
    _enrichHashInstance(node, value) {
	const meta = getInstanceMeta(value);
	if (!meta) return;

	node.isInstance = true;
	node.instanceClassName = meta.className;
	node.instanceCtorRef = meta.ctor;

	// Optional: if the class was already indexed somewhere, link it
	const ctorNode = this._findByRef?.(meta.ctor);
	if (ctorNode?.path) node.instanceClassPath = ctorNode.path;
    }

};


export default  ClassInspectorTraits ;
