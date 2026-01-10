// toggles minimize/restore on `~` / backtick
function enable(ctx, {
    hotkey = ["Backquote"],     // ` and ~ share the same physical key on US keyboards
    minimizeHeight = "44px",    // header-ish height
    ignoreWhenTyping = true,
} = {}) {
    const el =    ctx.el;
    if (!el) throw new Error("[tree.console] enableToggle: missing el");

    // don't double-bind
    if (el.__m7Toggle?.enabled) return;

    const header = el.querySelector('[data-head]') || el.firstElementChild; // prefer data-head if you add it
    const body   = el.querySelector('[data-body]') || el.querySelector('[data-tree]')?.parentElement; // your grid wrapper
    const input  = el.querySelector("[data-q]");

    const state = {
	enabled: true,
	minimized: false,
	prev: {
	    height: el.style.height,
	    minHeight: el.style.minHeight,
	},
	handler: null,
    };

    function setMinimized(on) {
	state.minimized = !!on;

	if (state.minimized) {
	    // keep element visible, hide main body
	    if (body) body.style.display = "none";
	    el.style.height = minimizeHeight;
	    el.style.minHeight = minimizeHeight;
	    el.style.overflow = "hidden";
	    el.setAttribute("data-minimized", "1");
	} else {
	    if (body) body.style.display = "";
	    el.style.height = state.prev.height || "";
	    el.style.minHeight = state.prev.minHeight || "";
	    el.style.overflow = "";
	    el.removeAttribute("data-minimized");
	    // optional: focus search when re-opened
	    if (input) input.focus?.();
	}
    }

    state.handler = (e) => {
	// only toggle on chosen key (Backquote)
	if (!hotkey.includes(e.code)) return;
	/*
	// don't toggle if user is typing in an input/textarea/contenteditable
	if (ignoreWhenTyping) {
	const t = e.target;
	const typing =
	t &&
	(t.tagName === "INPUT" ||
	t.tagName === "TEXTAREA" ||
	t.isContentEditable);
	if (typing) return;
	}
	*/
	// avoid weird combos
	if (e.ctrlKey || e.metaKey || e.altKey) return;

	e.preventDefault();
	setMinimized(!state.minimized);
    };

    ctx.eventScope.addEventListener("keydown", state.handler, true);

    // expose controls on the element for other code paths
    el.__m7Toggle = {
	enabled: true,
	minimize: () => setMinimized(true),
	restore: () => setMinimized(false),
	toggle: () => setMinimized(!state.minimized),
	get minimized() { return state.minimized; },
	_state: state,
    };
}



function disable(ctx) {
    const el = ctx.el;
    if (!el?.__m7Toggle?.enabled) return;

    const state = el.__m7Toggle._state;
    try {
	ctx.eventScope.removeEventListener("keydown", state.handler, true);
    } catch {}

    // restore if minimized
    if (el.__m7Toggle.minimized) {
	el.__m7Toggle.restore();
    }

    el.__m7Toggle.enabled = false;
    delete el.__m7Toggle;
}


export {disable, enable} ;
export default  {disable, enable} ;
