/* main.js v5 */
function closeModal(id){const e=document.getElementById(id);if(e)e.classList.remove('open');}
const APP=(() => {
  let view='single',nextP=1;
  function getView(){return view;}
  function getNextPanel(){for(let p=1;p<=4;p++)if(!CHART.getSymbol(p))return p;const p=nextP;nextP=nextP>=4?1:nextP+1;return p;}
  function switchView(v){
    view=v;
    ['single','quad','seven'].forEach(x=>{
      document.getElementById(`vbtn-${x}`)?.classList.toggle('active',x===v);
      document.getElementById(`${x}-view`)?.classList.toggle('active',x===v);
    });
    CHART.updateSelectionStyles();
    setTimeout(()=>{CHART.resizeAll();if(v==='seven')SEVENCHART.resizeAll();},80);
  }
  function toast(msg,type='ok'){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.className=`toast show ${type}`;clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3500);}
  async function init(){
    console.log('🚀 Binance Futures Pro v5');
    LAYOUT.initResize();
    COINLIST.init();
    await INDICATORS.loadFromDB();
    await TG.loadCfg();
    WS.connect();
    TICKER.init();
    console.log('✅ Hazır');
  }
  return {init,getView,getNextPanel,switchView,toast};
})();
window.addEventListener('resize',()=>{CHART.resizeAll();if(APP.getView()==='seven')SEVENCHART.resizeAll();});
document.addEventListener('DOMContentLoaded',()=>APP.init());
