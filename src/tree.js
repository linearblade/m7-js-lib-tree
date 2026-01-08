const ICONS = {
    object: "📁",     // hash / plain object
    array: "🔗",      // array
    function: "ƒ",    // function
    class: "🏛️",      // class
    scalar: "❓",     // primitive / data
    circular: "♻️",   // circular reference
};

function logLine(log, text){
    if (!log.text)
	log.text = "";
    log.text = log.text + text + "\n" ;
}
function printTree(
    value,
    {
	name = "root",
	indent = "",
	seen = new WeakSet(),
	isLast = true,
	log = {}
    } = {}
) {
    const branch = indent ? (isLast ? "└─ " : "├─ ") : "";
    const nextIndent = indent + (isLast ? "   " : "│  ");
    // Detect type
    let type = typeof value;
    
    // Class detection
    const isClass =
	  type === "function" &&
	  /^class\s/.test(Function.prototype.toString.call(value));

    let icon = ICONS.scalar;

    if (value && type === "object") {
	if (seen.has(value)) {
	    logLine(log,`${indent}${branch}${ICONS.circular} ${name}`);
	    return;
	}
	seen.add(value);

	if (Array.isArray(value)) {
	    icon = ICONS.array;
	} else {
	    icon = ICONS.object;
	}
    } else if (type === "function") {
	icon = isClass ? ICONS.class : ICONS.function;
    }

    logLine(log,`${indent}${branch}${icon} ${name}`);

    // Recurse into objects / arrays
    if (value && type === "object") {
	const entries = Object.entries(value);
	entries.forEach(([key, val], index) => {
	    printTree(val, {
		name: key,
		indent: nextIndent,
		seen,
		isLast: index === entries.length - 1,
		log
	    });
	});
    }

    //console.log(output);
    return log.text
}
