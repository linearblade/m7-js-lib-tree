const NODE_ENRICHERS = {
    function: v => ({ signature: getFunctionSignature(v) }),
    class:    v => ({ signature: getFunctionSignature(v) }),
};
// ---- 1) Build an enriched parse tree ----
function buildParseTree(
    value,
    {
	name = "root",
	seen = new WeakMap(), // value -> node (preserve shared refs, prevent cycles)
	maxDepth = Infinity,
	depth = 0,
    } = {}
) {
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
    if (value && t === "object") {
	if (seen.has(value)) {
	    return { type: "ref", name, ref: value };
	}
    }

    const node = { type, name, ref: value  };
    Object.assign(node, NODE_ENRICHERS[type]?.(value));
    
    const isNonTerminal = type === "hash" || type === "array";
    if (!isNonTerminal) return node;

    seen.set(value, node);

    if (depth >= maxDepth) {
	node.children = [];
	return node;
    }

    node.children = [];

    if (type === "hash") {
	for (const [k, v] of Object.entries(value)) {
	    node.children.push(
		buildParseTree(v, { name: k, seen, maxDepth, depth: depth + 1 })
	    );
	}
    } else {
	for (let i = 0; i < value.length; i++) {
	    node.children.push(
		buildParseTree(value[i], { name: String(i), seen, maxDepth, depth: depth + 1 })
	    );
	}
    }

    return node;
}

// ---- 2) Print the parse tree (validation) ----
function printParseTree(
    node,
    {
	indent = "",
	isLast = true,
	icons = {
	    hash: "📁",
	    array: "🔗",
	    function: "ƒ",
	    class: "🏛️",
	    ref: "♻️",
	    scalar: "❓",
	    null: "∅",
	},
	log = {},
	top = true
    } = {}
) {
    const branch = indent ? (isLast ? "└─ " : "├─ ") : "";
    const nextIndent = indent + (isLast ? "   " : "│  ");

    const icon =
	  icons[node.type] ??
	  (node.type === "string" ||
	   node.type === "number" ||
	   node.type === "boolean" ||
	   node.type === "undefined" ||
	   node.type === "symbol" ||
	   node.type === "bigint"
	   ? icons.scalar
	   : icons.scalar);

    logLine(log,`${indent}${branch}${icon} ${node.name}`);

    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) {
	printParseTree(kids[i], {
	    indent: nextIndent,
	    isLast: i === kids.length - 1,
	    icons,
	    log ,
	    top : false
	});
    }
    if(top)
	console.log(log.text);

}


function getFunctionSignature(fn) {
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
