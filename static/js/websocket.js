/* websocket.js v3 — REST polling (Binance WS bloke olduğunda Flask proxy kullanır) */
const WS = (() => {
  let klineWs    = {};
  let klineCBs   = {};
  let klineSyms  = {};
  let klineReconn= {};
  let prices     = {};
  let tickerCBs  = [];
  let pollTimer  = null;
  let wsOK       = false;

  let tickerWs   = null;
  let wsDataTimer= null;

  function connect() { _tryWS(); }

  function _tryWS() {
    if (tickerWs) { try { tickerWs.close(); } catch(e){} }

    tickerWs = new WebSocket('wss://fstream.binance.com/stream?streams=!ticker@arr');

    // 6 saniye içinde gerçek veri gelmezse REST'e geç
    wsDataTimer = setTimeout(() => {
      console.log('[WS] Veri gelmedi, REST polling başlatılıyor...');
      try { tickerWs.close(); } catch(e) {}
      _startREST();
    }, 6000);

    tickerWs.onopen = () => {
      const el = document.getElementById('sdot');
      if (el) el.classList.add('on');
    };

    tickerWs.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.data && Array.isArray(msg.data)) {
          if (!wsOK) {
            wsOK = true;
            clearTimeout(wsDataTimer);
            console.log('[WS] Ticker bağlandı (WebSocket)');
            const el = document.getElementById('sdot');
            if (el) { el.classList.add('on'); el.style.background=''; el.title='WebSocket'; }
          }
          msg.data.forEach(t => {
            if (t.s && t.s.endsWith('USDT')) prices[t.s] = t;
          });
          tickerCBs.forEach(cb => cb(prices));
        }
      } catch(e) {}
    };

    tickerWs.onclose = () => {
      const el = document.getElementById('sdot');
      if (el) el.classList.remove('on');
      if (wsOK) {
        wsOK = false;
        setTimeout(_tryWS, 3000);
      }
    };

    tickerWs.onerror = () => { try { tickerWs.close(); } catch(e){} };
  }

  function _startREST() {
    if (pollTimer) return;
    _fetchREST();
    pollTimer = setInterval(_fetchREST, 3000);
    const el = document.getElementById('sdot');
    if (el) { el.classList.add('on'); el.style.background='#f39c12'; el.title='REST polling'; }
  }

  async function _fetchREST() {
    try {
      const r = await fetch('/api/ticker/all');
      const d = await r.json();
      if (d.ok && d.tickers && d.tickers.length) {
        d.tickers.forEach(t => { if (t.s) prices[t.s] = t; });
        tickerCBs.forEach(cb => cb(prices));
      }
    } catch(e) {
      console.warn('[WS] REST fetch hata:', e.message);
    }
  }

  function subscribeKline(pid, sym, interval, cb) {
    _closeKline(pid);
    klineCBs[pid]  = cb;
    klineSyms[pid] = { sym, interval };
    _connectKline(pid);
  }

  function _connectKline(pid) {
    const info = klineSyms[pid];
    if (!info) return;
    const { sym, interval } = info;
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${sym.toLowerCase()}@kline_${interval}`);
    ws.onopen = () => { const e=document.getElementById(`ld-${pid}`); if(e) e.style.display='inline-block'; clearTimeout(klineReconn[pid]); };
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data);
        if (m.e==='kline' && m.k && klineCBs[pid]) {
          klineCBs[pid]({ time:m.k.t/1000, open:+m.k.o, high:+m.k.h, low:+m.k.l, close:+m.k.c, volume:+m.k.v, isFinal:m.k.x });
        }
      } catch(e) {}
    };
    ws.onclose = () => {
      const e=document.getElementById(`ld-${pid}`); if(e) e.style.display='none';
      if (klineSyms[pid]) { clearTimeout(klineReconn[pid]); klineReconn[pid]=setTimeout(()=>_connectKline(pid),3000); }
    };
    ws.onerror = () => { try { ws.close(); } catch(e){} };
    klineWs[pid] = ws;
  }

  function _closeKline(pid) {
    clearTimeout(klineReconn[pid]);
    if (klineWs[pid]) { try { klineWs[pid].close(); } catch(e){} klineWs[pid]=null; }
    const e=document.getElementById(`ld-${pid}`); if(e) e.style.display='none';
  }

  function unsubscribeKline(pid) { delete klineSyms[pid]; delete klineCBs[pid]; _closeKline(pid); }
  function onTicker(cb) { tickerCBs.push(cb); }
  function getPrices()  { return prices; }
  function getPrice(s)  { return prices[s] || null; }

  return { connect, subscribeKline, unsubscribeKline, onTicker, getPrices, getPrice };
})();
