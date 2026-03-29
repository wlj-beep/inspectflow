// Auto-extracted from InspectFlowApp.jsx
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1017;--surface:#141820;--panel:#1a1f2c;--panel2:#1f2535;
  --border:#252d40;--border2:#2e3a52;--text:#c8d0e4;--muted:#5a6480;
  --accent:#d4891a;--accent2:#f0a830;--ok:#27c76a;--warn:#e03535;
  --info:#2e88d4;--draft:#9b6fd4;--incomplete:#d4a017;
  --mono:'Share Tech Mono',monospace;--sans:'Barlow',sans-serif;--cond:'Barlow Condensed',sans-serif;
  /* spacing rhythm: 4/8/16/24/32px */
  --sp-1:0.25rem;--sp-2:0.5rem;--sp-3:1rem;--sp-4:1.5rem;--sp-5:2rem;
  /* typography scale: 12/14/16/20/24px */
  --fs-xs:0.75rem;--fs-sm:0.875rem;--fs-md:1rem;--fs-lg:1.25rem;--fs-xl:1.5rem;
  /* semantic chrome tokens (never reuse status colors for chrome) */
  --chrome-border:var(--accent);--chrome-header:var(--surface);
  /* role-context accent tokens */
  --role-accent-operator:#1a5c38;--role-accent-quality:#1e4a6e;
  --role-accent-supervisor:#5a4010;--role-accent-admin:var(--accent);
}
html,body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;font-size:15px}
.app-header{background:var(--chrome-header);border-bottom:2px solid var(--chrome-border);padding:0 1.75rem;display:flex;align-items:center;gap:var(--sp-4);height:54px;position:sticky;top:0;z-index:200}
/* role-context header tint: a subtle left-side accent stripe keyed to current role */
.app-header.role-ctx-operator{border-bottom-color:var(--ok)}
.app-header.role-ctx-quality{border-bottom-color:var(--info)}
.app-header.role-ctx-supervisor{border-bottom-color:var(--incomplete)}
.app-header.role-ctx-admin{border-bottom-color:var(--accent)}
.logo{font-family:var(--cond);font-size:var(--fs-lg);font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent2);display:flex;align-items:center;gap:var(--sp-2)}
.logo-icon{width:22px;height:22px;position:relative;flex-shrink:0}
.logo-icon::before{content:"";position:absolute;inset:2px;border:2px solid var(--accent);border-radius:2px}
.logo-icon::after{content:"";position:absolute;width:8px;height:8px;background:var(--accent);top:50%;left:50%;transform:translate(-50%,-50%)}
.header-sep{width:1px;height:22px;background:var(--border2)}
.header-sub{font-size:var(--fs-xs);color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.header-right{margin-left:auto;display:flex;align-items:center;gap:var(--sp-3)}
.user-ctrl{display:flex;flex-direction:column;gap:var(--sp-1);min-width:220px}
.user-ctrl-label{font-size:var(--fs-xs);color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.user-ctrl-row{display:flex;align-items:center;gap:var(--sp-2)}
.role-chip{font-family:var(--mono);font-size:var(--fs-xs);padding:var(--sp-1) var(--sp-2);border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;background:#1b2434;border:1px solid var(--border2);color:var(--text)}
.role-operator{color:var(--ok);border-color:var(--role-accent-operator)}
.role-quality{color:var(--info);border-color:var(--role-accent-quality)}
.role-supervisor{color:var(--incomplete);border-color:var(--role-accent-supervisor)}
.role-admin{color:var(--accent2);border-color:var(--role-accent-admin)}
/* data-chip: chrome-only status; uses neutral palette not semantic status colors */
.data-chip{font-family:var(--mono);font-size:var(--fs-xs);padding:var(--sp-1) var(--sp-2);border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;border:1px solid var(--border2);background:var(--panel2);color:var(--muted)}
.data-live{color:var(--ok);border-color:#1a5c38;background:#0b2318}
.data-loading{color:var(--info);border-color:#1e4a6e;background:#0d1f2e}
.data-fallback{color:var(--incomplete);border-color:#5a4010;background:#1a1208}
.user-ctrl-hint{font-size:var(--fs-xs);color:var(--muted)}
.nav{display:flex}
.nav-btn{background:none;border:none;cursor:pointer;font-family:var(--cond);font-size:var(--fs-sm);font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:var(--sp-2) var(--sp-3);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.nav-btn:hover{color:var(--text)}.nav-btn.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.page{padding:var(--sp-4);max-width:1100px;margin:0 auto}
.transition-banner{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);margin:0 auto var(--sp-3);border:1px solid var(--border2);border-left-width:3px;border-radius:3px;font-size:var(--fs-sm)}
.transition-banner .transition-label{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.transition-loading{background:#0d1f2e;border-color:#1e4a6e;color:var(--info)}
.transition-success{background:#0b2318;border-color:#1a5c38;color:var(--ok)}
.transition-error{background:#2a0d0d;border-color:#6b2020;color:var(--warn)}
.toast-stack{position:fixed;right:var(--sp-3);bottom:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-2);z-index:950;max-width:min(92vw,420px)}
.toast-card{display:flex;align-items:flex-start;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);border:1px solid var(--border2);border-left-width:3px;border-radius:4px;box-shadow:0 12px 24px rgba(0,0,0,.35);background:var(--panel)}
.toast-card .transition-label{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.toast-msg{font-size:var(--fs-sm);line-height:1.4;color:inherit;flex:1}
.toast-close{border:none;background:transparent;color:inherit;font-size:var(--fs-sm);line-height:1;cursor:pointer;padding:var(--sp-1) var(--sp-1)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:3px;margin-bottom:var(--sp-3)}
.card-head{padding:var(--sp-2) var(--sp-3);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--panel);border-radius:3px 3px 0 0}
.card-title{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.card-body{padding:var(--sp-3)}
.field{display:flex;flex-direction:column;gap:var(--sp-1)}
.field label{font-size:var(--fs-xs);color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
input,select,textarea{width:100%;background:var(--panel2);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:var(--fs-sm);padding:var(--sp-2) var(--sp-2);border-radius:2px;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
textarea{resize:vertical;min-height:68px;font-size:var(--fs-sm)}
select option{background:var(--panel2)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3)}
.ac-wrap{position:relative}
.ac-list{position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid var(--accent);border-top:none;border-radius:0 0 3px 3px;z-index:400;max-height:200px;overflow-y:auto}
.ac-item{padding:.45rem .75rem;font-size:.84rem;cursor:pointer;transition:background .1s}
.ac-item:hover,.ac-item.hi{background:var(--panel2);color:var(--accent2)}
.ac-sub{font-size:.7rem;color:var(--muted);margin-top:.1rem;font-family:var(--mono)}
.btn{display:inline-flex;align-items:center;gap:var(--sp-2);font-family:var(--cond);font-size:var(--fs-sm);font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:var(--sp-2) var(--sp-4);border-radius:2px;cursor:pointer;border:none;transition:all .15s;white-space:nowrap}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#000}.btn-primary:not(:disabled):hover{background:var(--accent2)}
.btn-ghost{background:var(--panel2);color:var(--text);border:1px solid var(--border2)}.btn-ghost:hover{border-color:var(--accent);color:var(--accent2)}
.btn-draft{background:var(--panel2);color:var(--draft);border:1px solid var(--draft)}.btn-draft:hover{background:#1e1530}
.btn-partial{background:var(--panel2);color:var(--incomplete);border:1px solid var(--incomplete)}.btn-partial:hover{background:#1e1a0a}
.btn-danger{background:transparent;color:var(--warn);border:1px solid #6b2020}.btn-danger:hover{background:#2a0d0d}
.btn-sm{padding:var(--sp-1) var(--sp-2);font-size:var(--fs-xs)}
.btn-xs{padding:var(--sp-1) var(--sp-2);font-size:var(--fs-xs)}
.job-strip{background:var(--panel);border:1px solid var(--border2);border-left:3px solid var(--accent);border-radius:3px;padding:var(--sp-2) var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-5);align-items:center;margin-bottom:var(--sp-3)}
.strip-field{display:flex;flex-direction:column;gap:var(--sp-1)}
.strip-label{font-size:var(--fs-xs);color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.strip-val{font-family:var(--mono);font-size:var(--fs-sm);color:var(--accent2)}
.meas-scroll{overflow-x:auto}
.meas-table{border-collapse:collapse;font-size:.82rem;table-layout:fixed}
.meas-table .rl{width:118px;background:var(--panel);border-right:2px solid var(--border2);font-family:var(--cond);font-size:.67rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:.42rem .85rem;white-space:nowrap;text-align:right;vertical-align:middle}
.meas-table .dc{width:160px;border-right:1px solid var(--border);vertical-align:top;overflow:hidden}
.meas-table .dc:last-child{border-right:none}
.meas-table .hrow td{border-bottom:1px solid var(--border);vertical-align:top}
.meas-table .spec-row td{position:sticky;top:0;background:var(--surface);z-index:6}
.meas-table .active-cell{outline:2px solid #2f5d84;outline-offset:-2px}
.meas-table .active-row-td{background:rgba(47,93,132,.12)}
.meas-table .active-col-td{background:rgba(47,93,132,.08)}
.dim-hdr{padding:.55rem .7rem .35rem}
.dim-hdr-name{font-family:var(--cond);font-size:.8rem;font-weight:700;color:var(--text);letter-spacing:.04em;word-break:break-word}
.dim-hdr-spec{font-family:var(--mono);font-size:.68rem;color:var(--muted);margin-top:.15rem}
.hdr-cell{padding:.3rem .6rem;vertical-align:middle}
.hdr-inp{width:100%;background:var(--panel);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:.78rem;padding:.32rem .5rem;border-radius:2px;outline:none;transition:border-color .15s}
.hdr-inp:focus{border-color:var(--accent)}
.hdr-inp.mf{font-family:var(--mono);font-size:.75rem}
.tag-cell{padding:.32rem .6rem;vertical-align:middle}
.sample-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:var(--panel2);border:1px solid var(--border2);color:var(--info);padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-right:.2rem;margin-bottom:.2rem}
.gauge-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:#1a0d2e;border:1px solid #5a3080;color:#b080f0;padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem}
.range-tag{display:inline-block;font-family:var(--mono);font-size:.62rem;background:#0d1f2e;border:1px solid #1e4a6e;color:#6fb0f0;padding:.1rem .35rem;border-radius:2px;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem}
.meas-table .div-row td{border-bottom:2px solid var(--accent) !important;padding:0 !important;height:2px;line-height:0;font-size:0}
.meas-table .pr td{padding:.26rem .4rem;border-bottom:1px solid var(--border);vertical-align:middle}
.meas-table .pr:last-child td{border-bottom:none}
.meas-table .pr:hover td{background:rgba(255,255,255,.018)}
.meas-table .pr.mr td{background:#180d0d}
.meas-table .pr.oot-row td{background:rgba(107,32,32,.12)}
.meas-table .row-oot-note td{padding:.4rem .6rem;border-bottom:1px solid var(--border);background:#190d0d}
.row-oot-copy{font-size:.72rem;color:#d28a8a;line-height:1.45}
.vi{font-family:var(--mono) !important;font-size:.86rem !important;text-align:center !important;padding:.28rem .3rem !important;background:var(--panel2) !important;width:100%;display:block}
.vi.ok{border-color:var(--ok) !important;color:var(--ok)}
.vi.oot{border-color:var(--warn) !important;color:var(--warn)}
.vi.ux{border-color:var(--info) !important;border-style:dashed !important}
.na-btn{display:block;width:100%;background:none;border:1px dashed var(--border2);color:var(--border2);border-radius:2px;padding:.24rem .3rem;font-family:var(--mono);font-size:.78rem;cursor:pointer;transition:all .15s;text-align:center}
.na-btn:hover{border-color:var(--info);color:var(--info)}
.ue-wrap{display:flex;align-items:center;gap:.2rem}
.ue-wrap .vi{flex:1}
.relock-btn{background:none;border:none;cursor:pointer;color:var(--muted);font-size:.85rem;line-height:1;padding:.1rem;flex-shrink:0}.relock-btn:hover{color:var(--warn)}
.pf-wrap{display:flex;gap:.2rem}
.pf-btn{flex:1;padding:.24rem .1rem;border-radius:2px;font-family:var(--cond);font-size:.67rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid var(--border2);background:var(--panel2);color:var(--muted);transition:all .15s}
.pf-btn.pass-on{background:#0b2318;border-color:var(--ok);color:var(--ok)}
.pf-btn.fail-on{background:#2a0d0d;border-color:var(--warn);color:var(--warn)}
.mp-tag{display:inline-flex;align-items:center;font-size:.6rem;color:var(--warn);font-family:var(--mono);background:#2a0d0d;border:1px solid #6b2020;border-radius:2px;padding:.08rem .3rem;margin-top:.15rem;white-space:nowrap}
.tbadge{display:inline-block;font-family:var(--mono);font-size:.65rem;padding:.12rem .4rem;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.tbadge-var{background:#0d1f2e;color:var(--info);border:1px solid #1e4a6e}
.tbadge-gng{background:#1a0d2e;color:#b080f0;border:1px solid #5a3080}
.tbadge-attr{background:#1a1208;color:var(--incomplete);border:1px solid #5a4010}
.tool-search-wrap{position:relative}
.tool-popover{position:absolute;top:calc(100% + 4px);left:0;min-width:290px;background:var(--surface);border:1px solid var(--accent);border-radius:3px;z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.55);padding:.65rem}
.tool-pop-filters{display:flex;gap:.35rem;margin-bottom:.5rem;flex-wrap:wrap}
.tpf-btn{background:var(--panel2);border:1px solid var(--border2);color:var(--muted);font-family:var(--cond);font-size:.65rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:.2rem .55rem;border-radius:2px;cursor:pointer;transition:all .15s}
.tpf-btn.on{border-color:var(--accent);color:var(--accent2);background:var(--panel)}
.tool-pop-list{max-height:175px;overflow-y:auto;display:flex;flex-direction:column;gap:.22rem}
.tool-pop-item{display:flex;align-items:center;justify-content:space-between;padding:.3rem .5rem;background:var(--panel);border:1px solid var(--border2);border-radius:2px;cursor:pointer;transition:background .1s}
.tool-pop-item:hover{background:var(--panel2)}
.tool-pop-item.added{border-color:#1a5c38;cursor:default}
.tpi-name{font-size:.8rem;color:var(--text)}
.tpi-it{font-family:var(--mono);font-size:.68rem;color:var(--muted)}
.dim-tool-list{display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:.4rem;min-height:10px}
.dim-tool-tag{display:inline-flex;align-items:center;gap:.3rem;background:var(--panel2);border:1px solid var(--border2);border-radius:2px;padding:.15rem .45rem;font-size:.75rem;color:var(--text)}
.dim-tool-tag .rm{background:none;border:none;cursor:pointer;color:var(--muted);font-size:.78rem;line-height:1}.dim-tool-tag .rm:hover{color:var(--warn)}
.badge{display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:var(--fs-xs);letter-spacing:.05em;padding:var(--sp-1) var(--sp-2);border-radius:2px;text-transform:uppercase;white-space:nowrap}
/* status badges: semantic status colors are appropriate here (these represent actual state) */
.badge-ok{background:#0b2318;color:var(--ok);border:1px solid #1a5c38}
.badge-oot{background:#2a0d0d;color:var(--warn);border:1px solid #6b2020}
.badge-open{background:#0d1f2e;color:var(--info);border:1px solid #1e4a6e}
.badge-closed{background:var(--panel2);color:var(--muted);border:1px solid var(--border2)}
.badge-draft{background:#1a1030;color:var(--draft);border:1px solid var(--draft)}
.badge-incomplete{background:#1e1a0a;color:var(--incomplete);border:1px solid var(--incomplete)}
.badge-pend{background:var(--panel2);color:var(--muted);border:1px solid var(--border)}
/* alert banners: semantic status colors appropriate for actual status conditions */
.oot-banner{background:#200e0e;border:1px solid #6b2020;border-left:3px solid var(--warn);border-radius:3px;padding:var(--sp-2) var(--sp-3);display:flex;gap:var(--sp-3);align-items:flex-start;margin-bottom:var(--sp-3)}
.oot-icon{color:var(--warn);font-size:var(--fs-md);flex-shrink:0}
.oot-title{font-family:var(--cond);font-size:var(--fs-sm);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--warn)}
.oot-body{font-size:var(--fs-xs);color:#a07070;margin-top:var(--sp-1);line-height:1.5}
.inc-banner{background:#1a1208;border:1px solid #5a4010;border-left:3px solid var(--incomplete);border-radius:3px;padding:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-3)}
.inc-title{font-family:var(--cond);font-size:var(--fs-sm);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--incomplete);margin-bottom:var(--sp-2)}
/* .banner: chrome/info use only — uses neutral border, NOT status colors */
.banner{padding:var(--sp-2) var(--sp-3);border-radius:3px;border:1px solid var(--border2);font-size:var(--fs-sm)}
/* .banner.warn: retains amber only because it signals an actual incomplete/advisory state */
.banner.warn{background:#1a1208;border-color:#5a4010;color:#d6b16c}
.crumbs{display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap;margin-bottom:var(--sp-2)}
.crumb{font-family:var(--mono);font-size:var(--fs-xs);color:var(--muted);background:var(--panel);border:1px solid var(--border2);padding:var(--sp-1) var(--sp-2);border-radius:2px}
.crumb-sep{font-size:var(--fs-xs);color:var(--muted)}
.chip-row{display:flex;flex-wrap:wrap;gap:var(--sp-1)}
.chip-btn{border:1px solid var(--border2);background:var(--panel2);color:var(--text);padding:var(--sp-1) var(--sp-2);border-radius:999px;font-size:var(--fs-sm);cursor:pointer}
.chip-btn.active{border-color:#1e4a6e;background:#0d1f2e;color:var(--accent2)}
.seg-btn{border:1px solid var(--border2);background:var(--panel2);color:var(--text);padding:var(--sp-1) var(--sp-2);border-radius:3px;font-size:var(--fs-sm);cursor:pointer}
.seg-btn.active{border-color:#1e4a6e;background:#0d1f2e;color:var(--accent2)}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{
  outline:2px solid #58a6ff;
  outline-offset:2px;
}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:600;display:flex;align-items:center;justify-content:center;padding:var(--sp-3)}
.modal{background:var(--surface);border:1px solid var(--border2);border-top:2px solid var(--accent);border-radius:4px;width:100%;max-width:500px;padding:var(--sp-4);max-height:90vh;overflow-y:auto}
.modal-title{font-family:var(--cond);font-size:var(--fs-md);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent2);margin-bottom:var(--sp-4)}
.success-card{background:#0a1e12;border:1px solid #1a5c38;border-left:3px solid var(--ok);border-radius:3px;padding:var(--sp-5);text-align:center;display:flex;flex-direction:column;align-items:center;gap:var(--sp-3)}
.success-title{font-family:var(--cond);font-size:var(--fs-lg);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ok)}
.draft-card{background:#120e1e;border:1px solid var(--draft);border-left:3px solid var(--draft);border-radius:3px;padding:var(--sp-5);text-align:center;display:flex;flex-direction:column;align-items:center;gap:var(--sp-3)}
.draft-title{font-family:var(--cond);font-size:var(--fs-lg);font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--draft)}
.sub-tabs{display:flex;border-bottom:1px solid var(--border2);margin-bottom:var(--sp-4)}
.sub-tab{background:none;border:none;cursor:pointer;font-family:var(--cond);font-size:var(--fs-sm);font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:var(--sp-2) var(--sp-3);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s,border-color .15s}
.sub-tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.sub-tab:hover:not(.active){color:var(--text)}
.admin-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:var(--sp-3)}
.admin-sidebar{background:var(--panel);border:1px solid var(--border2);border-radius:3px;padding:var(--sp-2)}
.admin-nav-group{margin-bottom:var(--sp-2)}
.admin-nav-title{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 var(--sp-1)}
.admin-nav-btn{width:100%;text-align:left;background:none;border:1px solid transparent;color:var(--text);padding:var(--sp-1) var(--sp-2);border-radius:3px;cursor:pointer;font-family:var(--sans);font-size:var(--fs-sm)}
.admin-nav-btn:hover{background:var(--panel2);border-color:var(--border2)}
.admin-nav-btn.active{background:#0d1f2e;border-color:#1e4a6e;color:var(--accent2)}
.admin-main{min-width:0}
.data-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}
.data-table thead th{font-family:var(--cond);font-size:var(--fs-xs);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:var(--sp-2) var(--sp-3);text-align:left;border-bottom:1px solid var(--border2);background:var(--panel)}
.data-table tbody tr{border-bottom:1px solid var(--border);transition:background .1s}
.data-table tbody tr:hover{background:var(--panel)}
.data-table tbody td{padding:var(--sp-2) var(--sp-3);vertical-align:middle}
.edit-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}
.edit-table th{font-family:var(--cond);font-size:var(--fs-xs);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:var(--sp-1) var(--sp-2);text-align:left;border-bottom:1px solid var(--border2);background:var(--panel);white-space:nowrap}
.edit-table td{padding:var(--sp-1) var(--sp-1);border-bottom:1px solid var(--border);vertical-align:middle}
.edit-table tr:last-child td{border-bottom:none}
.edit-table input,.edit-table select{padding:var(--sp-1) var(--sp-2);font-size:var(--fs-sm);background:var(--panel);border:1px solid var(--border2)}
.mt1{margin-top:var(--sp-2)}.mt2{margin-top:var(--sp-4)}
.gap1{display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap}
.text-muted{color:var(--muted);font-size:var(--fs-sm)}
.text-warn{color:var(--warn)}.text-ok{color:var(--ok)}
.mono{font-family:var(--mono) !important}.accent-text{color:var(--accent2) !important}
.section-label{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--info);margin-bottom:var(--sp-2)}
.empty-state{padding:var(--sp-5);text-align:center;color:var(--muted);font-size:var(--fs-sm)}
.skeleton-line{display:block;height:var(--sp-2);border-radius:3px;background:linear-gradient(90deg,rgba(120,138,157,.2),rgba(120,138,157,.36),rgba(120,138,157,.2));background-size:220% 100%;animation:skeletonPulse 1.4s ease-in-out infinite}
.skeleton-line.sm{width:38%}
.skeleton-line.md{width:62%}
.skeleton-line.lg{width:84%}
@keyframes skeletonPulse{
  0%{background-position:180% 0}
  100%{background-position:-40% 0}
}
.tr-click{cursor:pointer}
.err-text{color:var(--warn);font-size:var(--fs-xs);margin-top:var(--sp-1)}
.search-inp{background:var(--panel2);border:1px solid var(--border2);color:var(--text);font-family:var(--sans);font-size:var(--fs-sm);padding:var(--sp-1) var(--sp-2);border-radius:2px;outline:none;transition:border-color .15s;width:100%}
.search-inp:focus{border-color:var(--accent)}
.rec-modal{background:var(--surface);border:1px solid var(--border2);border-top:2px solid var(--accent);border-radius:4px;width:100%;max-width:820px;padding:0;max-height:92vh;overflow:hidden;display:flex;flex-direction:column}
.rec-modal-head{padding:var(--sp-3) var(--sp-4);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.rec-modal-body{overflow-y:auto;padding:var(--sp-3) var(--sp-4);flex:1}
.rec-strip{display:flex;flex-wrap:wrap;gap:var(--sp-4);padding:var(--sp-2) var(--sp-3);background:var(--panel);border:1px solid var(--border2);border-left:3px solid var(--accent);border-radius:3px;margin-bottom:var(--sp-3)}
.rec-field{display:flex;flex-direction:column;gap:var(--sp-1)}
.rec-label{font-size:var(--fs-xs);color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.rec-val{font-family:var(--mono);font-size:var(--fs-sm);color:var(--accent2)}
.det-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm)}
.det-table th{font-family:var(--cond);font-size:var(--fs-xs);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:var(--sp-1) var(--sp-2);text-align:left;border-bottom:1px solid var(--border2);background:var(--panel);white-space:nowrap}
.det-table td{padding:var(--sp-1) var(--sp-2);border-bottom:1px solid var(--border);vertical-align:middle}
.det-table tr:last-child td{border-bottom:none}
.det-table .val-ok{font-family:var(--mono);font-size:var(--fs-sm);color:var(--ok)}
.det-table .val-oot{font-family:var(--mono);font-size:var(--fs-sm);color:var(--warn);font-weight:700}
.det-table .val-na{font-family:var(--mono);font-size:var(--fs-xs);color:var(--border2)}
.det-table .val-edit{outline:2px solid var(--accent2);outline-offset:-2px;border-radius:2px}
.det-section{font-family:var(--cond);font-size:var(--fs-xs);font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--info);padding:var(--sp-2) 0 var(--sp-1);border-bottom:1px solid var(--border2);margin-bottom:var(--sp-2)}
.it-reminder{font-family:var(--mono);font-size:var(--fs-xs);color:var(--info);margin-top:var(--sp-1);padding:var(--sp-1) var(--sp-2);background:#0d1f2e;border:1px solid #1e4a6e;border-radius:2px;display:inline-block}
.meas-table .dc{position:relative}
.ux-hint{font-size:var(--fs-sm) !important;line-height:1.45 !important;color:#9eb7cf !important}
.col-resize{position:absolute;top:0;right:0;width:5px;height:100%;cursor:col-resize;z-index:10;background:transparent;user-select:none}
.col-resize:hover,.col-resize.dragging{background:var(--accent)}
@media (max-width: 1024px){
  .app-header{height:auto;min-height:54px;padding:var(--sp-2) var(--sp-3);flex-wrap:wrap;gap:var(--sp-2)}
  .header-right{width:100%;justify-content:space-between}
  .user-ctrl{min-width:0;flex:1}
  .nav{width:100%;overflow-x:auto;padding-bottom:var(--sp-1)}
  .nav-btn{padding:var(--sp-2) var(--sp-3)}
  .page{max-width:none;padding:var(--sp-3)}
  .row2,.row3{grid-template-columns:1fr}
  .job-strip,.rec-strip{gap:var(--sp-2);padding:var(--sp-2)}
  .sub-tabs{overflow-x:auto}
  .sub-tab{white-space:nowrap}
  .admin-layout{grid-template-columns:1fr}
  .admin-sidebar{padding:var(--sp-2);display:grid;gap:var(--sp-2)}
  .admin-nav-group{margin-bottom:0}
  .meas-table .rl{position:sticky;left:0;z-index:2;background:var(--panel);text-align:left;padding:var(--sp-1) var(--sp-2)}
  .meas-table .dc{min-width:190px}
}
@media (max-width: 768px){
  html,body{font-size:16px}
  .logo{font-size:var(--fs-md)}
  .header-sub{display:none}
  .card-head{padding:var(--sp-2) var(--sp-3)}
  .card-body{padding:var(--sp-3)}
  .btn{min-height:42px;padding:var(--sp-2) var(--sp-3)}
  .btn-sm,.btn-xs{min-height:38px}
  input,select,textarea{min-height:42px;font-size:var(--fs-md);padding:var(--sp-2) var(--sp-2)}
  .data-table thead th,.edit-table th,.det-table th{font-size:var(--fs-xs)}
  .data-table tbody td,.edit-table td,.det-table td{padding:var(--sp-1) var(--sp-2)}
  .modal{padding:var(--sp-3);max-height:95vh}
  .rec-modal{max-height:96vh}
}
`;
