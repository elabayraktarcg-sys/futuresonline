/* sevenchart.js v8 */
const SEVENCHART = (() => {
  const TFS    = ['5m','15m','30m','1h','4h','1d'];
  const TV_TFS = {'5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'};

  let currentSym = '';
  let widgets    = {};
  let ready      = {};

  function _initWidget(tf, sym) {
    console.log(`[SEVEN] Init: ${tf} - ${sym}`);
    const container = document.getElementById(`sp-body-${tf}`);
    if (!container) return;

    if (widgets[tf]) {
      try { widgets[tf].remove(); } catch(e) {}
    }
    container.innerHTML = '';
    widgets[tf] = null;
    ready[tf]   = false;

    const tvSym = sym ? `BINANCE:${sym}.P` : 'BINANCE:BTCUSDT.P';

    widgets[tf] = new TradingView.widget({
      container_id:      `sp-body-${tf}`,
      symbol:            tvSym,
      interval:          TV_TFS[tf],
      timezone:          'Etc/UTC',
      theme:             'dark',
      style:             '1',
      locale:            'tr',
      toolbar_bg:        '#0d0d12',
      hide_top_toolbar:  false,
      hide_side_toolbar: false,
      hide_legend:       false,
      save_image:        false,
      allow_symbol_change: true,
      studies: ["RSI@tv-basicstudies"],
      studies_overrides: {
        "rsi.rsi.color": "#FFFFFF"
      },
      enabled_features:  [
        'use_localstorage_for_settings',
        'side_toolbar_in_fullscreen_mode',
        'save_chart_properties_to_local_storage',
        'symbol_search'
      ],
      disabled_features: [
        'header_compare','header_undo_redo',
        'header_screenshot','header_fullscreen_button'
      ],
      width:'100%', height:'100%', autosize:true,
    });
  }

  function _waitReady(tf) {
    const w = widgets[tf];
    if (!w) return;
    let tries = 0;
    const check = setInterval(() => {
      tries++;
      try {
        w.activeChart();
        ready[tf] = true;
        clearInterval(check);
        // Bekleyen sembol varsa uygula
        if (currentSym) {
          try {
            w.activeChart().setSymbol(`BINANCE:${currentSym}.P`, () => {});
          } catch(e) {}
        }
      } catch(e) {
        if (tries > 60) clearInterval(check);
      }
    }, 500);
  }

  function loadSymbol(sym) {
    if (!sym) return;
    console.log(`[SEVEN] Loading Symbol: ${sym}`);
    currentSym = sym;

    const nameEl = document.getElementById('seven-coin-name');
    const hintEl = document.querySelector('.seven-hint');
    if (nameEl) nameEl.textContent = sym.replace('USDT','/USDT');
    if (hintEl) hintEl.style.display = 'none';

    TFS.forEach(tf => {
      _initWidget(tf, sym);
    });
  }

  function clear()      { currentSym = ''; }
  function resizeAll()  {}
  function getSymbol()  { return currentSym; }
  function cancelTool() {}
  function clearAll()   {}

  return { loadSymbol, resizeAll, clear, getSymbol, cancelTool, clearAll };
})();
