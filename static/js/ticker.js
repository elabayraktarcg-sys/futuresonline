/* ticker.js v6
   BTC.D / TOTAL3 / USDT.D → TradingView REST API (doğru endpoint)
   BTC / ETH → Binance WebSocket (anlık)
   Yedek: 60 sn'de bir REST ile güncelle
*/
const TICKER = (() => {
  let prevVals = {};

  function fmt(v) {
    v = parseFloat(v) || 0;
    if (v >= 1e12) return (v / 1e12).toFixed(3) + 'T';
    if (v >= 1e9)  return (v / 1e9).toFixed(3)  + 'B';
    if (v >= 1e6)  return (v / 1e6).toFixed(2)  + 'M';
    return v.toFixed(4);
  }

  function setEl(id, val, chg, isPct) {
    const vEl = document.getElementById(id);
    const cEl = document.getElementById(id.replace('-val', '-chg'));
    if (!vEl) return;
    const txt  = isPct ? val.toFixed(2) + '%' : fmt(val);
    const prev = prevVals[id];
    const up   = prev !== undefined ? val >= prev : null;
    prevVals[id] = val;
    if (vEl.textContent !== txt) {
      vEl.textContent = txt;
      if (up !== null) {
        vEl.style.color = up ? '#2ecc71' : '#e74c3c';
        clearTimeout(vEl._t);
        vEl._t = setTimeout(() => vEl.style.color = '', 2000);
      }
    }
    if (cEl && chg != null) {
      const c = parseFloat(chg) || 0;
      cEl.textContent = (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
      cEl.style.color = c >= 0 ? '#2ecc71' : '#e74c3c';
    }
  }

  // ── TradingView Verileri (Backend Proxy) ────────────────────────────
  // Backend üzerinden TradingView global scanner API çağrılır — CORS sorunu yok
  async function loadTVQuotes() {
    try {
      const r = await fetch('/api/market/tv-quotes');
      if (!r.ok) throw new Error('tv-quotes ' + r.status);
      const d = await r.json();
      if (!d.ok) throw new Error('TV data not ok');

      setEl('tb-btcd-val',   d.btcD,     d.btcDChg,     true);
      setEl('tb-total3-val', d.total3,   d.total3Chg,   false);
      setEl('tb-usdtd-val',  d.usdtD,    d.usdtDChg,    true);

      console.log('[TICKER] TV quotes OK — BTC.D=' + d.btcD.toFixed(2) + '% USDT.D=' + d.usdtD.toFixed(2) + '% TOTAL3=$' + (d.total3/1e9).toFixed(2) + 'B');
      return true;
    } catch (e) {
      console.warn('[TICKER] TV quotes hatası:', e.message);
      return false;
    }
  }

  // ── BTC + ETH anlık fiyat (Binance WS'den) ───────────────────────
  function updateFromWS(prices) {
    const btc = prices['BTCUSDT'];
    const eth = prices['ETHUSDT'];
    if (btc) setEl('tb-btc-val', parseFloat(btc.c), parseFloat(btc.P), false);
    if (eth) setEl('tb-eth-val', parseFloat(eth.c), parseFloat(eth.P), false);
  }

  // ── Fear & Greed ──────────────────────────────────────────────────
  async function loadFearGreed() {
    try {
      const r = await fetch('https://api.alternative.me/fng/?limit=1');
      const d = await r.json();
      const val = parseInt(d.data?.[0]?.value || 50);
      const lbl = d.data?.[0]?.value_classification || '';
      const el  = document.getElementById('tb-fg-val');
      const le  = document.getElementById('tb-fg-lbl');
      if (el) { el.textContent = val; el.style.color = val >= 60 ? '#2ecc71' : val <= 30 ? '#e74c3c' : '#f39c12'; }
      if (le) le.textContent = lbl;
    } catch (e) {}
  }

  async function _refresh() {
    await loadTVQuotes();
  }

  function init() {
    WS.onTicker(p => updateFromWS(p));
    setTimeout(_refresh,    1000);
    setTimeout(loadFearGreed, 2000);
    setInterval(_refresh,    2000);    // ✅ 5 saniye (değişen satır)
    setInterval(loadFearGreed, 600000);
  }

  return { init };
})();
