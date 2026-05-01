/* coinlist.js v5 */
const COINLIST = (() => {
  let spotSyms    = new Set();
  let fundCache   = {};  // sym → {rate, nextTime, markPrice, at}
  let oiCache     = {};  // sym → {oi, at}
  let prevPrices  = {};
  let prevOI      = {};
  let sortMode    = 'vol';
  let sortAsc     = {vol:false, chg:false, oi:false, fr:false, price:false};
  let activeTab   = 'all';
  let favs        = new Set(JSON.parse(localStorage.getItem('pf_favs')||'[]'));
  let expandedSym = null;
  let frTimerInt  = null;
  let detailTimer = null;
  let searchQ     = '';
  let renderTimer = null;
  let listBuilt   = false;

  // ── FORMAT ────────────────────────────────────────────────────────
  function fmtP(p) {
    p=parseFloat(p)||0;
    if(p>=1000)  return p.toFixed(2);
    if(p>=1)     return p.toFixed(4);
    if(p>=0.01)  return p.toFixed(6);
    return p.toFixed(8);
  }
  function fmtShort(v) {
    v=parseFloat(v)||0;
    if(v>=1e12) return (v/1e12).toFixed(2)+'T';
    if(v>=1e9)  return (v/1e9).toFixed(2)+'B';
    if(v>=1e6)  return (v/1e6).toFixed(2)+'M';
    if(v>=1e3)  return (v/1e3).toFixed(1)+'K';
    return v.toFixed(2);
  }
  function fmtFull(v) { return Math.round(parseFloat(v)||0).toLocaleString('tr-TR'); }
  function frLeft(ms) {
    const d=Math.max(0,ms-Date.now());
    const h=Math.floor(d/3600000), m=Math.floor((d%3600000)/60000), s=Math.floor((d%60000)/1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  const fmtV = fmtShort;

  // ── API ───────────────────────────────────────────────────────────
  async function loadSpot() {
    // Try Binance spot exchange info directly
    try {
      const r = await fetch('https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT');
      if (r.ok) {
        const d = await r.json();
        d.symbols?.forEach(s => { if(s.status==='TRADING' && s.quoteAsset==='USDT') spotSyms.add(s.symbol); });
        return;
      }
    } catch(e) {}
    // Fallback: server endpoint
    try { const r=await fetch('/api/spot-symbols'); (await r.json()).forEach(s=>spotSyms.add(s)); } catch(e){}
  }
  async function loadFunding(sym) {
    const c=fundCache[sym]; if(c && Date.now()-c.at<60000) return c;
    try {
      const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`);
      if(r.ok) {
        const d=await r.json();
        const v={rate:parseFloat(d.lastFundingRate||0)*100,nextTime:parseInt(d.nextFundingTime||0),markPrice:parseFloat(d.markPrice||0),at:Date.now()};
        fundCache[sym]=v; return v;
      }
    } catch(e){}
    return null;
  }
  async function loadOI(sym) {
    const c=oiCache[sym]; if(c && Date.now()-c.at<30000) return c.oi;
    try {
      const r=await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`);
      if(r.ok) {
        const d=await r.json();
        oiCache[sym]={oi:parseFloat(d.openInterest||0),at:Date.now()};
        return oiCache[sym].oi;
      }
    } catch(e){}
    return null;
  }

  // ── FAVS ──────────────────────────────────────────────────────────
  function saveFavs() { localStorage.setItem('pf_favs',JSON.stringify([...favs])); _updFavCnt(); }
  function toggleFav(sym,e) {
    if(e){e.stopPropagation();e.preventDefault();}
    favs.has(sym)?favs.delete(sym):favs.add(sym);
    saveFavs();
    const btn=document.getElementById(`fav-${sym}`); if(btn) btn.textContent=favs.has(sym)?'⭐':'☆';
    if(activeTab==='fav'){listBuilt=false;renderList();}
  }
  function _updFavCnt() { const e=document.getElementById('fav-count'); if(e) e.textContent=favs.size; }
  function setTab(tab,btn) {
    activeTab=tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    listBuilt=false; renderList();
  }

  // ── FR TIMER ──────────────────────────────────────────────────────
  function startFrTimer() {
    if(frTimerInt) clearInterval(frTimerInt);
    frTimerInt=setInterval(()=>{
      const sym=CHART.getSymbol('single');
      if(sym && fundCache[sym]) { const e=document.getElementById('fr-clock-single'); if(e) e.textContent=frLeft(fundCache[sym].nextTime); }
      if(expandedSym && fundCache[expandedSym]) { const e=document.getElementById(`cdt-${expandedSym}`); if(e) e.textContent=frLeft(fundCache[expandedSym].nextTime); }
    },1000);
  }

  // ── RENDER ────────────────────────────────────────────────────────
  function renderList() {
    const prices=WS.getPrices();
    const listEl=document.getElementById('coin-list');
    if(!listEl) return;

    let pairs=Object.entries(prices).filter(([s])=>s.endsWith('USDT'));
    if(activeTab==='fav') { pairs=pairs.filter(([s])=>favs.has(s)); }
    if(searchQ) { const q=searchQ.toUpperCase(); pairs=pairs.filter(([s])=>s.includes(q)||s.replace('USDT','').includes(q)); }

    // Sort
    const asc=sortAsc[sortMode];
    pairs.sort((a,b)=>{
      let va,vb;
      if     (sortMode==='vol')   {va=parseFloat(a[1].q||0);  vb=parseFloat(b[1].q||0);}
      else if(sortMode==='chg')   {va=Math.abs(parseFloat(a[1].P||0)); vb=Math.abs(parseFloat(b[1].P||0));}
      else if(sortMode==='oi')    {va=(oiCache[a[0]]?.oi||0)*parseFloat(a[1].c||1); vb=(oiCache[b[0]]?.oi||0)*parseFloat(b[1].c||1);}
      else if(sortMode==='fr')    {va=Math.abs(fundCache[a[0]]?.rate||0); vb=Math.abs(fundCache[b[0]]?.rate||0);}
      else if(sortMode==='price') {va=parseFloat(a[1].c||0); vb=parseFloat(b[1].c||0);}
      else {va=parseFloat(a[1].q||0); vb=parseFloat(b[1].q||0);}
      return asc?va-vb:vb-va;
    });

    document.getElementById('tcnt').textContent=pairs.length;

    if(activeTab==='fav' && !pairs.length) {
      listEl.innerHTML='<div class="list-loading"><span>⭐ Favori yok. Coin yanındaki ☆ tıkla.</span></div>';
      return;
    }
    if(!pairs.length && searchQ) {
      listEl.innerHTML='<div class="list-loading"><span>🔍 Sonuç bulunamadı</span></div>';
      return;
    }

    const existingSyms=[...listEl.querySelectorAll('.coin-row')].map(e=>e.dataset.sym);
    const newSyms=pairs.map(([s])=>s);
    const orderChanged=JSON.stringify(existingSyms)!==JSON.stringify(newSyms);

    if(!listBuilt||orderChanged) {
      listEl.innerHTML=pairs.map(([sym,d])=>_buildRow(sym,d)).join('');
      listBuilt=true;
      if(expandedSym) {
        document.getElementById(`cr-${expandedSym}`)?.classList.add('expanded');
        const dr=document.getElementById(`cdr-${expandedSym}`);
        if(dr){dr.classList.add('open');_renderDetail(expandedSym);}
      }
    } else {
      pairs.forEach(([sym,d])=>_updateRow(sym,d));
    }
    _applySelStyles();
  }

  function _buildRow(sym,d) {
    const chg=parseFloat(d.P||0), price=parseFloat(d.c||0), vol=parseFloat(d.q||0);
    const isSpot=spotSyms.has(sym), isFav=favs.has(sym);
    const fr=fundCache[sym];
    const frTxt=fr?(fr.rate>=0?'+':'')+fr.rate.toFixed(3)+'%':'—';
    const frCls=fr?(fr.rate>=0?'pos':'neg'):'';
    const oi=oiCache[sym];
    const oiUSD=oi?oi.oi*price:0;

    let selClass='';
    try {
      const v=APP.getView();
      if(v==='single'&&CHART.getSymbol('single')===sym) selClass=' selected';
      else for(let p=1;p<=4;p++) if(CHART.getSymbol(p)===sym){selClass=` sel-${p}`;break;}
    } catch(e){}

    return `<div class="coin-row${selClass}" id="cr-${sym}" data-sym="${sym}" onclick="COINLIST.rowClick('${sym}')">
  <div class="cr-col-sym">
    <div class="cr-sym-top">
      <button class="fav-btn" id="fav-${sym}" onclick="COINLIST.toggleFav('${sym}',event)">${isFav?'⭐':'☆'}</button>
      <span class="cr-sym-name">${sym.replace('USDT','/USDT')}</span>
      <span class="tag ${isSpot?'spot':'fut'}">${isSpot?'S':'F'}</span>
    </div>
    <div class="cr-price-row"><span class="cr-price" id="crp-${sym}">$${fmtP(price)}</span></div>
  </div>
  <div class="cr-chg ${chg>=0?'pos':'neg'}" id="crchg-${sym}">${chg>=0?'+':''}${chg.toFixed(2)}%</div>
  <div class="cr-vol" id="crvol-${sym}">${fmtShort(vol)}</div>
  <div class="cr-oi ${oiUSD>0?(oiUSD>=(prevOI[sym]||oiUSD)?'pos':'neg'):''}" id="croi-${sym}">${oiUSD>0?fmtShort(oiUSD):'—'}</div>
  <div class="cr-fr-col ${frCls}" id="crfr-${sym}">${frTxt}</div>
</div>
<div class="coin-detail-row" id="cdr-${sym}"></div>`;
  }

  function _updateRow(sym,d) {
    const price=parseFloat(d.c||0), prev=prevPrices[sym]||price;
    const chg=parseFloat(d.P||0), vol=parseFloat(d.q||0);
    const oi=oiCache[sym], oiUSD=oi?oi.oi*price:0, prevOIv=prevOI[sym]||oiUSD;
    const fr=fundCache[sym];

    // Price
    const pEl=document.getElementById(`crp-${sym}`);
    if(pEl){const t='$'+fmtP(price);if(pEl.textContent!==t){pEl.textContent=t;pEl.classList.remove('flash-up','flash-dn');void pEl.offsetWidth;pEl.classList.add(price>=prev?'flash-up':'flash-dn');}}
    // Change
    const cEl=document.getElementById(`crchg-${sym}`);
    if(cEl){cEl.textContent=(chg>=0?'+':'')+chg.toFixed(2)+'%';cEl.className=`cr-chg ${chg>=0?'pos':'neg'}`;}
    // Volume
    const vEl=document.getElementById(`crvol-${sym}`);
    if(vEl){const t=fmtShort(vol);if(vEl.textContent!==t)vEl.textContent=t;}
    // OI
    const oEl=document.getElementById(`croi-${sym}`);
    if(oEl&&oiUSD>0){const t=fmtShort(oiUSD);if(oEl.textContent!==t){oEl.textContent=t;oEl.className=`cr-oi ${oiUSD>=prevOIv?'pos':'neg'}`;}}
    // FR
    if(fr){const frEl=document.getElementById(`crfr-${sym}`);if(frEl){const t=(fr.rate>=0?'+':'')+fr.rate.toFixed(3)+'%';if(frEl.textContent!==t){frEl.textContent=t;frEl.className=`cr-fr-col ${fr.rate>=0?'pos':'neg'}`;}}}
    // Detail
    if(expandedSym===sym) _updateDetailVals(sym,d);
    prevPrices[sym]=price;
    if(oiUSD>0) prevOI[sym]=oiUSD;
  }

  function rowClick(sym) {
    if(APP.getView()==='seven') { 
      SEVENCHART.loadSymbol(sym); 
    } else {
      CHART.load(APP.getView()==='single'?'single':APP.getNextPanel(), sym);
    }
    
    if(expandedSym===sym){_collapse();}
    else {
      if(expandedSym) _collapse();
      expandedSym=sym;
      document.getElementById(`cr-${sym}`)?.classList.add('expanded');
      const dr=document.getElementById(`cdr-${sym}`);
      if(dr){dr.classList.add('open');_renderDetail(sym);}
      _startDetailTimer(sym);
    }
    _applySelStyles();
  }

  function _collapse() {
    if(!expandedSym) return;
    document.getElementById(`cr-${expandedSym}`)?.classList.remove('expanded');
    document.getElementById(`cdr-${expandedSym}`)?.classList.remove('open');
    if(detailTimer){clearInterval(detailTimer);detailTimer=null;}
    expandedSym=null;
  }

  function _renderDetail(sym) {
    const el=document.getElementById(`cdr-${sym}`); if(!el) return;
    const d=WS.getPrices()[sym]||{}, chg=parseFloat(d.P||0), price=parseFloat(d.c||0);
    const isSpot=spotSyms.has(sym);
    el.innerHTML=`
<div class="cdr-fr">
  <div class="cdr-fr-col"><div class="cdrf-lbl">Funding Rate</div><div class="cdrf-val" id="cdv-fr-${sym}" style="color:var(--text2)">⏳</div></div>
  <div class="cdr-fr-col"><div class="cdrf-lbl">FR Kalan</div><div class="cdrf-val" style="color:#f39c12;font-size:13px" id="cdt-${sym}">--:--:--</div></div>
  <div class="cdr-fr-col"><div class="cdrf-lbl">Mark Fiyat</div><div class="cdrf-val" id="cdv-mark-${sym}">⏳</div></div>
</div>
<div class="cdr-grid">
  <div class="cdr-item"><div class="cdri-lbl">Anlık Fiyat</div><div class="cdri-val" style="color:#2ecc71" id="cdv-price-${sym}">$${fmtP(price)}</div></div>
  <div class="cdr-item"><div class="cdri-lbl">24s Değişim</div><div class="cdri-val" id="cdv-chg-${sym}" style="color:${chg>=0?'#2ecc71':'#e74c3c'}">${chg>=0?'▲ +':'▼ '}${Math.abs(chg).toFixed(2)}%</div></div>
  <div class="cdr-item"><div class="cdri-lbl">24s Hacim</div><div class="cdri-val" id="cdv-vol-${sym}">$${fmtFull(parseFloat(d.q||0))}</div></div>
  <div class="cdr-item"><div class="cdri-lbl">I.O (USD)</div><div class="cdri-val" id="cdv-oi-${sym}">⏳</div></div>
  <div class="cdr-item"><div class="cdri-lbl">24s Yüksek</div><div class="cdri-val" style="color:#3498db" id="cdv-high-${sym}">$${fmtP(parseFloat(d.h||0))}</div></div>
  <div class="cdr-item"><div class="cdri-lbl">24s Düşük</div><div class="cdri-val" style="color:#e74c3c" id="cdv-low-${sym}">$${fmtP(parseFloat(d.l||0))}</div></div>
  <div class="cdr-item" style="grid-column:1/-1"><div class="cdri-lbl">Spot</div><div class="cdri-val" style="color:${isSpot?'#2ecc71':'#e74c3c'}">${isSpot?'✅ Spotta mevcut':'❌ Yalnızca Futures'}</div></div>
</div>
<div class="cdr-links">
  <a class="cdrl bn" href="https://www.binance.com/tr/futures/${sym}" target="_blank">🔶 Binance</a>
  <a class="cdrl tv" href="https://www.tradingview.com/chart/?symbol=BINANCE:${sym}.P" target="_blank">📊 TV</a>
  <span class="cdrl fav-detail" onclick="COINLIST.toggleFav('${sym}',event)">${favs.has(sym)?'⭐ Çıkar':'☆ Ekle'}</span>
</div>`;
    _loadDetailAsync(sym);
  }

  async function _loadDetailAsync(sym) {
    const [fr,oi]=await Promise.all([loadFunding(sym),loadOI(sym)]);
    const frEl=document.getElementById(`cdv-fr-${sym}`), markEl=document.getElementById(`cdv-mark-${sym}`), oiEl=document.getElementById(`cdv-oi-${sym}`);
    if(frEl&&fr){frEl.textContent=(fr.rate>=0?'+':'')+fr.rate.toFixed(4)+'%';frEl.style.color=fr.rate>=0?'#2ecc71':'#e74c3c';}
    if(markEl&&fr){markEl.textContent='$'+fmtP(fr.markPrice);markEl.style.color='';}
    if(oiEl&&oi!==null){const price=parseFloat(WS.getPrices()[sym]?.c||1);oiEl.textContent='$'+fmtFull(oi*price);oiEl.dataset.raw=oi*price;}
  }

  function _updateDetailVals(sym,d) {
    const price=parseFloat(d.c||0), prev=prevPrices[sym]||price, chg=parseFloat(d.P||0), vol=parseFloat(d.q||0);
    const pEl=document.getElementById(`cdv-price-${sym}`);
    if(pEl){const t='$'+fmtP(price);if(pEl.textContent!==t){pEl.textContent=t;pEl.classList.remove('flash-up','flash-dn');void pEl.offsetWidth;pEl.classList.add(price>=prev?'flash-up':'flash-dn');}}
    const cEl=document.getElementById(`cdv-chg-${sym}`); if(cEl){cEl.textContent=(chg>=0?'▲ +':'▼ ')+Math.abs(chg).toFixed(2)+'%';cEl.style.color=chg>=0?'#2ecc71':'#e74c3c';}
    const vEl=document.getElementById(`cdv-vol-${sym}`);
    if(vEl){const nv='$'+fmtFull(vol),ov=parseFloat(vEl.dataset.raw||vol);if(vEl.textContent!==nv){vEl.textContent=nv;vEl.dataset.raw=vol;vEl.style.color=vol>=ov?'#2ecc71':'#e74c3c';}}
    const hEl=document.getElementById(`cdv-high-${sym}`); if(hEl) hEl.textContent='$'+fmtP(parseFloat(d.h||0));
    const lEl=document.getElementById(`cdv-low-${sym}`);  if(lEl) lEl.textContent='$'+fmtP(parseFloat(d.l||0));
    const oEl=document.getElementById(`cdv-oi-${sym}`);
    if(oEl&&oiCache[sym]){const oiUSD=oiCache[sym].oi*price,no='$'+fmtFull(oiUSD),oo=parseFloat(oEl.dataset.raw||oiUSD);if(oEl.textContent!==no){oEl.textContent=no;oEl.dataset.raw=oiUSD;oEl.style.color=oiUSD>=oo?'#2ecc71':'#e74c3c';}}
  }

  function _startDetailTimer(sym) {
    if(detailTimer) clearInterval(detailTimer);
    detailTimer=setInterval(()=>{
      if(expandedSym!==sym) return;
      fundCache[sym]=null; oiCache[sym]=null;
      _loadDetailAsync(sym);
    },30000);
  }

  function _applySelStyles() {
    document.querySelectorAll('.coin-row').forEach(e=>e.classList.remove('selected','sel-1','sel-2','sel-3','sel-4'));
    try {
      const v=APP.getView();
      if(v==='single') document.querySelector(`[data-sym="${CHART.getSymbol('single')}"]`)?.classList.add('selected');
      else [1,2,3,4].forEach(p=>document.querySelector(`[data-sym="${CHART.getSymbol(p)}"]`)?.classList.add(`sel-${p}`));
    } catch(e){}
  }

  function filter(q) {
    searchQ=q.trim();
    document.getElementById('search-clear').style.display=searchQ?'block':'none';
    listBuilt=false; clearTimeout(renderTimer); renderTimer=setTimeout(renderList,100);
  }
  function clearSearch() { const i=document.getElementById('search-input'); if(i) i.value=''; filter(''); }

  function sort(mode,btn) {
    if(sortMode===mode) sortAsc[mode]=!sortAsc[mode]; else{sortMode=mode;sortAsc[mode]=false;}
    document.querySelectorAll('.sbtn').forEach(b=>b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    ['vol','chg','oi','fr','price'].forEach(m=>{const e=document.getElementById(`arr-${m}`);if(e)e.textContent=m===sortMode?(sortAsc[m]?'↑':'↓'):'';});
    listBuilt=false; renderList();
  }

  // Bulk OI + FR prefetch — açılışta top 50 için hemen yükle
  let _pfDone=false;
  async function _prefetchOIandFR(prices) {
    const syms=Object.entries(prices)
      .filter(([s])=>s.endsWith('USDT'))
      .sort((a,b)=>parseFloat(b[1].q||0)-parseFloat(a[1].q||0))
      .map(([s])=>s);

    // İlk açılışta bulk yükle
    if(!_pfDone) {
      _pfDone=true;
      // Tüm funding rate'leri tek istekle al
      try {
        const r=await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
        if(r.ok) {
          const data=await r.json();
          data.forEach(d=>{
            if(!d.symbol.endsWith('USDT')) return;
            fundCache[d.symbol]={rate:parseFloat(d.lastFundingRate||0)*100,nextTime:parseInt(d.nextFundingTime||0),markPrice:parseFloat(d.markPrice||0),at:Date.now()};
          });
          listBuilt=false; renderList();
        }
      } catch(e) {}
      // Top 50 OI paralel yükle
      for(let i=0;i<Math.min(50,syms.length);i+=10) {
        await Promise.all(syms.slice(i,i+10).map(s=>loadOI(s)));
        listBuilt=false; renderList();
      }
    }

    // Sonraki çağrılarda eksikleri tamamla
    const needOI=syms.filter(s=>!oiCache[s]).slice(0,8);
    const needFR=syms.filter(s=>!fundCache[s]).slice(0,8);
    if(needOI.length||needFR.length) {
      await Promise.all([...needOI.map(s=>loadOI(s)),...needFR.map(s=>loadFunding(s))]);
      listBuilt=false; renderList();
    }
  }

  function init() {
    loadSpot();
    startFrTimer();
    _updFavCnt();
    let prefetchTimer=null;
    WS.onTicker(prices=>{
      clearTimeout(renderTimer); renderTimer=setTimeout(renderList,80);
      clearTimeout(prefetchTimer); prefetchTimer=setTimeout(()=>_prefetchOIandFR(prices),1000);
    });
  }

  function isSpot(sym) { return spotSyms.has(sym); }

  return { init, filter, clearSearch, sort, setTab, toggleFav, rowClick, isSpot, loadFunding, fmtP, fmtV };
})();
