/* chart.js v8 */
const CHART = (() => {
  const state = {
    widgets:  {},
    symbols:  { single:'', 1:'', 2:'', 3:'', 4:'' },
    intervals:{ single:'1', 1:'1', 2:'1', 3:'1', 4:'1' },
    ready:    {},
    drawingsEnabled: true,
    charts:{}, cSeries:{}, rsiCharts:{}, overlaySeries:{}, candleData:{}
  };

  const IV_MAP = {
    '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
    '1h':'60','2h':'120','4h':'240','6h':'360','12h':'720',
    '1d':'D','3d':'3D','1w':'W'
  };

  function getSymbol(pid)   { return state.symbols[pid]||''; }
  function getInterval(pid) { return state.intervals[pid]||'1'; }

  function _initWidget(pid, sym, iv) {
    const containerId = `chart-div-${pid}`;
    const container   = document.getElementById(containerId);
    if (!container) return;

    // Önceki widget'ı temizle
    if (state.widgets[pid]) {
      try { state.widgets[pid].remove(); } catch(e) {}
    }
    container.innerHTML = '';
    state.widgets[pid] = null;
    state.ready[pid]   = false;

    const tvSym = `BINANCE:${sym}.P`;

    const widget = new TradingView.widget({
      container_id:      containerId,
      symbol:            tvSym,
      interval:          iv || '60',
      timezone:          'Etc/UTC',
      theme:             'dark',
      style:             '1',
      locale:            'tr',
      toolbar_bg:        '#141414',
      hide_top_toolbar:  false,
      hide_side_toolbar: !(state.drawingsEnabled || false),
      hide_legend:       false,
      save_image:        true,
      allow_symbol_change: true,
      container_id:      containerId,
      studies: [
        "RSI@tv-basicstudies"
      ],
      studies_overrides: {
        "rsi.rsi.color": "#FFFFFF"
      },
      enabled_features: ["header_widget_dom_node", "header_resolutions", "header_settings", "header_indicator_dialog"],
      disabled_features: ["use_localstorage_for_settings_save"],
      width:'100%', height:'100%', autosize:true,
    });

    state.widgets[pid] = widget;

    // onChartReady — widget instance üzerinden değil, polling ile
    _waitReady(pid);
  }

  // Widget hazır olana kadar bekle (polling)
  function _waitReady(pid) {
    const w = state.widgets[pid];
    if (!w) return;
    let tries = 0;
    const check = setInterval(() => {
      tries++;
      try {
        w.activeChart(); // hata vermezse hazır
        state.ready[pid] = true;
        clearInterval(check);

        // Bekleyen sembol değişikliği varsa uygula
        const pendingSym = state.symbols[pid];
        const pendingIv  = state.intervals[pid];
        if (pendingSym) {
          _applySymbol(pid, pendingSym, pendingIv);
          // İndikatörleri de yükle
          setTimeout(() => redrawIndicators(pid), 1000);
        }
      } catch(e) {
        if (tries > 60) clearInterval(check); // 30sn timeout
      }
    }, 500);
  }

  function _applySymbol(pid, sym, iv) {
    const w = state.widgets[pid];
    if (!w || !state.ready[pid]) return;
    try {
      const chart = w.activeChart();
      chart.setSymbol(`BINANCE:${sym}.P`, () => {
        try { chart.setResolution(iv || '60', () => {}); } catch(e) {}
      });
    } catch(e) {
      console.warn('[CHART] setSymbol hata:', e.message);
    }
  }

  // ── Coin yükle ────────────────────────────────────────────────────
  async function load(pid, sym) {
    state.symbols[pid]  = sym;
    const iv = state.intervals[pid] || '60';

    _showCtrl(pid, true);
    _updateTitle(pid, sym);
    if (pid === 'single') _updateInfoStrip(sym);

    const esEl = document.getElementById(`es-${pid}`);
    const cdEl = document.getElementById(`chart-div-${pid}`);
    if (esEl) esEl.style.display = 'none';
    if (cdEl) cdEl.style.display = 'block';

    if (pid === 'single') {
      // Pro-Grafik Başlat
      _initWidget(pid, sym, iv);
    } else {
      // TradingView Başlat
      if (!state.widgets[pid] || !state.ready[pid]) {
        _initWidget(pid, sym, iv);
      } else {
        _applySymbol(pid, sym, iv);
      }
    }

    updateSelectionStyles();
    try { TG.notifyCoinSelect(sym, pid); } catch(e) {}
  }

  // ── Interval değiştir ─────────────────────────────────────────────
  function setInterval(pid, intervalStr, btn) {
    const tvInterval = IV_MAP[intervalStr] || intervalStr;
    state.intervals[pid] = tvInterval;

    const ctrlId = pid === 'single' ? 'ctrl-single' : `ctrl-${pid}`;
    const ctrl = document.getElementById(ctrlId);
    if (ctrl) ctrl.querySelectorAll('.ibtn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (state.widgets[pid] && state.ready[pid]) {
      try {
        state.widgets[pid].activeChart().setResolution(tvInterval, () => {});
      } catch(e) {}
    }
  }

  // ── Temizle ───────────────────────────────────────────────────────
  function clear(pid) {
    WS.unsubscribeKline(pid);
    state.symbols[pid] = '';

    const cdEl = document.getElementById(`chart-div-${pid}`);
    if (cdEl) cdEl.style.display = 'none';

    const ico = pid === 'single' ? '📈' : `${pid}️⃣`;
    const msg = pid === 'single' ? 'Sol listeden coin seçin' : 'Coin seçin';
    const esEl = document.getElementById(`es-${pid}`);
    if (esEl) { esEl.style.display=''; esEl.innerHTML=`<div class="es-ico">${ico}</div><div>${msg}</div>`; }

    if (pid === 'single') {
      const strip = document.getElementById('is-single');
      if (strip) strip.style.display = 'none';
      const t = document.getElementById('pt-single');
      if (t) t.textContent = '📈 Coin seçin';
      const b = document.getElementById('pb-single');
      if (b) b.innerHTML = '';
    } else {
      const t = document.getElementById(`pt-${pid}`);
      if (t) t.textContent = 'Seçilmedi';
    }
    _showCtrl(pid, false);
    updateSelectionStyles();
  }

  function _updateTitle(pid, sym) {
    const el = document.getElementById(`pt-${pid}`);
    if (!el) return;
    const isSpot = COINLIST.isSpot(sym);
    const badge = `<span class="tag ${isSpot?'spot':'fut'}" style="font-size:9px;padding:1px 4px;border-radius:2px">${isSpot?'SPOT':'F'}</span>`;
    if (pid === 'single') {
      el.textContent = sym.replace('USDT','/USDT');
      const b = document.getElementById('pb-single');
      if (b) b.innerHTML = badge;
    } else {
      el.innerHTML = `${sym.replace('USDT','/USDT')} <span class="ldot" id="ld-${pid}" style="display:none"></span>`;
    }
  }

  async function _updateInfoStrip(sym) {
    const strip = document.getElementById('is-single');
    const ctrl  = document.getElementById('ctrl-single');
    if (strip) strip.style.display = 'flex';
    if (ctrl)  ctrl.style.display  = 'flex';
    const d   = WS.getPrices()[sym] || {};
    const chg = parseFloat(d.P || 0);
    const fp  = COINLIST.fmtP, fv = COINLIST.fmtV;
    const _s  = (id,v,c) => { const e=document.getElementById(id); if(!e)return; e.textContent=v; if(c) e.style.color=c; };
    _s('isv-price-single','$'+fp(parseFloat(d.c||0)),'#2ecc71');
    _s('isv-high-single', '$'+fp(parseFloat(d.h||0)));
    _s('isv-low-single',  '$'+fp(parseFloat(d.l||0)));
    _s('isv-vol-single',  '$'+fv(parseFloat(d.q||0)));
    const chgEl = document.getElementById('isv-chg-single');
    if (chgEl) { chgEl.textContent=(chg>=0?'+':'')+chg.toFixed(2)+'%'; chgEl.style.color=chg>=0?'#2ecc71':'#e74c3c'; }
    try {
      const [fr,oiRes] = await Promise.all([
        COINLIST.loadFunding(sym),
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`).then(r=>r.ok?r.json():null).catch(()=>null)
      ]);
      if (fr) _s('isv-fr-single',(fr.rate>=0?'+':'')+fr.rate.toFixed(4)+'%',fr.rate>=0?'#2ecc71':'#e74c3c');
      if (oiRes?.openInterest) _s('isv-oi-single','$'+fv(parseFloat(oiRes.openInterest)*parseFloat(WS.getPrice(sym)?.c||1)));
    } catch(e) {}
  }

  function _showCtrl(pid, show) {
    const ctrl = document.getElementById(pid==='single'?'ctrl-single':`ctrl-${pid}`);
    const cb   = document.getElementById(`clbtn-${pid}`);
    if (ctrl) ctrl.style.display = show?'flex':'none';
    if (cb)   cb.style.display   = show?'inline-block':'none';
  }

  function resizeChart()      {}
  function resizeAll()        {}
  async function redrawIndicators(pid) {
    if (!state.widgets[pid] || !state.ready[pid]) return;
    
    try {
      const widget = state.widgets[pid];
      const chart = widget.activeChart();
      const activeInds = INDICATORS.getIndicatorsForPanel(pid);
      
      // Önce mevcut tüm çalışmaları (studies) temizleyelim ki üst üste binmesin
      // Not: Ücretsiz sürümde toplu temizleme kısıtlı olabilir, bu yüzden 
      // her indikatörü ismine göre kontrol edip ekleyeceğiz.
      
      activeInds.forEach(ind => {
        const params = ind.params || {};
        if (ind.type === 'RSI') {
          chart.createStudy('Relative Strength Index', false, false, [params.period || 14], { "plot.color": ind.color });
        } else if (ind.type === 'EMA') {
          chart.createStudy('Moving Average Exponential', false, false, [params.period || 21], { "plot.color": ind.color });
        } else if (ind.type === 'SMA') {
          chart.createStudy('Moving Average', false, false, [params.period || 20], { "plot.color": ind.color });
        } else if (ind.type === 'BBANDS') {
          chart.createStudy('Bollinger Bands', false, false, [params.period || 20, params.stddev || 2], { "median.color": ind.color });
        }
      });
    } catch(e) {
      console.warn('[CHART] RedrawIndicators hata:', e);
    }
  }

  function updateSelectionStyles() {
    document.querySelectorAll('.coin-row').forEach(e=>e.classList.remove('selected','sel-1','sel-2','sel-3','sel-4'));
    try {
      const v = APP.getView();
      if (v==='single') {
        document.querySelector(`[data-sym="${state.symbols.single}"]`)?.classList.add('selected');
      } else {
        [1,2,3,4].forEach(p=>document.querySelector(`[data-sym="${state.symbols[p]}"]`)?.classList.add(`sel-${p}`));
      }
    } catch(e) {}
  }

  return { load, clear, setInterval, resizeAll, resizeChart, redrawIndicators, updateSelectionStyles, getSymbol, getInterval, getState:()=>state };
})();

window.addEventListener('resize', ()=>CHART.resizeAll());
