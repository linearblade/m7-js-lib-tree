function buildConsole(ctx){
    const {el,title} = ctx;
    const { escapeHtml, btnCss } = ctx.lib.helpers;
    el.style.cssText = `
           position: fixed; right: 12px; bottom: 12px;
           width: 780px; height: 520px;
           background: rgba(20,20,20,0.92);
           color: #eee; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
           border: 1px solid rgba(255,255,255,0.15);
           border-radius: 10px;
           box-shadow: 0 10px 30px rgba(0,0,0,0.35);
           overflow: hidden;
           z-index: 999999;
        `;

    el.innerHTML = `
           <!-- HEADER -->
           <div data-head
              style="display:flex; align-items:center; gap:10px; padding:10px 12px;
              border-bottom:1px solid rgba(255,255,255,0.12);">
              <div style="font-weight:700;">${escapeHtml(title)}</div>
                <button data-treeview title="tree view" style="${btnCss()}">🌳</button>
                <button data-setroot title="use input as root" style="${btnCss()}">🎯</button> <!-- set target -->
                <button data-reparse style="${btnCss()}">🔄</button> <!-- reparse -->

                <input data-q placeholder="find… (name or path)" style="
                  flex:1; min-width:200px; background: rgba(255,255,255,0.08); color:#fff;
                  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
                  padding: 6px 8px; outline: none;
                "/>

                <button data-search style="${btnCss()}">🔍</button>
                <button data-close style="${btnCss()}">×</button>
              </div>

           <!-- BODY -->
           <div data-body
              style="display:grid; grid-template-columns: 1.1fr 1fr;
              height: calc(100% - 46px);">
              <div data-tree
                 style="overflow:auto; padding:10px 12px; max-height:80vh;
                 border-right:1px solid rgba(255,255,255,0.12);">
              </div>
              <div data-detail
                   style="overflow:auto; padding:10px 12px;">
             </div>
          </div>
        `;
}


export {buildConsole};
export default {buildConsole};
