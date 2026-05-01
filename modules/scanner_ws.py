import json
import threading
import time
import websocket
from modules.binance import BinanceAPI
from modules.strategy import get_signals

class BinanceWSScanner:
    def __init__(self, symbols, intervals):
        self.symbols = [s.lower() for s in symbols]
        self.intervals = intervals
        self.binance = BinanceAPI()
        
        # Hafızada tutulacak mum verileri: { 'btcusdt': { '5m': [...], '15m': [...] } }
        self.data = { s: { tf: [] for tf in intervals } for s in self.symbols }
        self.results = []
        self.lock = threading.Lock()
        self.is_running = False
        
        # Her bağlantı max 200 stream taşıyabilir. Bizim 100 coin * 5 interval = 500 stream var.
        # 3 ayrı websocket bağlantısı kuracağız.
        # Her bağlantı max 200 stream taşıyabilir.
        # 600 coin * 5 interval = 3000 stream için yaklaşık 15-18 bağlantı açılacak.
        self.streams_per_connection = 200 
        self.connections = []

    def load_initial_history(self):
        """REST API ile başlangıç geçmişini (150 mum) çeker. (Parallel & Robust)"""
        from concurrent.futures import ThreadPoolExecutor
        import random
        
        print(f"[WS Scanner] {len(self.symbols)} coin için geçmiş yükleniyor (3000+ request)...", flush=True)
        
        total = len(self.symbols) * len(self.intervals)
        count = 0

        def fetch_tf(sym, tf):
            nonlocal count
            success = False
            retries = 0
            
            while not success and retries < 3:
                res = self.binance.get_klines(sym.upper(), tf, limit=150)
                if res['ok']:
                    with self.lock:
                        self.data[sym][tf] = res['candles']
                    success = True
                else:
                    # Rate limit veya hata durumunda bekle ve tekrar dene
                    retries += 1
                    time.sleep(random.uniform(0.5, 2.0))
            
            with self.lock:
                count += 1
                if count % 100 == 0:
                    print(f"[WS Scanner] İlerleme: {count}/{total} (%{int(count/total*100)})", flush=True)

        # 30 worker ile çok daha hızlı yükleme
        with ThreadPoolExecutor(max_workers=30) as executor:
            for sym in self.symbols:
                for tf in self.intervals:
                    executor.submit(fetch_tf, sym, tf)
        
        print("[WS Scanner] Tüm geçmiş verileri başarıyla yüklendi.", flush=True)

    def on_message(self, ws, message):
        msg = json.loads(message)
        if 'data' not in msg: return
        
        d = msg['data']
        sym = d['s'].lower()
        k = d['k']
        tf = k['i']
        
        if sym not in self.data or tf not in self.intervals: return
        
        candle = {
            'time': k['t'] // 1000,
            'open': float(k['o']),
            'high': float(k['h']),
            'low': float(k['l']),
            'close': float(k['c']),
            'volume': float(k['v'])
        }
        
        with self.lock:
            history = self.data[sym][tf]
            if not history:
                history.append(candle)
            else:
                if history[-1]['time'] == candle['time']:
                    history[-1] = candle
                else:
                    history.append(candle)
                    if len(history) > 200: history.pop(0)

    def _calculation_loop(self):
        """Sinyal hesaplamayı periyodik olarak yapar (CPU yükünü azaltmak için)."""
        while self.is_running:
            try:
                new_results = []
                
                # Her sembolü tek tek kilitleyip kopyalayarak kilit süresini minimize et
                for sym in self.symbols:
                    symbol_data = {}
                    with self.lock:
                        for tf in self.intervals:
                            symbol_data[tf] = list(self.data[sym][tf])
                    
                    coin_entry = {'symbol': sym.upper(), 'signals': {}}
                    has_any = False
                    
                    for tf in self.intervals:
                        history = symbol_data[tf]
                        if len(history) >= 100:
                            sig = get_signals(history)
                            if sig:
                                coin_entry['signals'][tf] = sig
                                if sig['signal'] != 'NEUTRAL': has_any = True
                    
                    if has_any:
                        new_results.append(coin_entry)
                
                # Puanlamaya göre sırala
                new_results.sort(key=lambda x: self._get_score(x), reverse=True)
                self.results = new_results
                
            except Exception as e:
                print(f"[WS Scanner] Calculation Error: {e}", flush=True)
            
            time.sleep(4) # 600 coin için 4 saniyede bir tarama idealdir

    def _get_score(self, item):
        score = 0
        for tf in self.intervals:
            if item['signals'].get(tf, {}).get('signal', 'NEUTRAL') != 'NEUTRAL':
                score += 1
        if score == len(self.intervals): score += 100
        return score

    def start(self):
        self.is_running = True
        
        # Hesaplama döngüsünü başlat (Geçmiş yüklenirken de çalışsın)
        threading.Thread(target=self._calculation_loop, daemon=True).start()

        self.load_initial_history()
        
        # Streamleri başlat
        all_streams = []
        for sym in self.symbols:
            for tf in self.intervals:
                all_streams.append(f"{sym}@kline_{tf}")
        
        for i in range(0, len(all_streams), self.streams_per_connection):
            group = all_streams[i : i + self.streams_per_connection]
            threading.Thread(target=self._connect, args=(group,), daemon=True).start()

    def _connect(self, streams):
        stream_url = "wss://fstream.binance.com/stream?streams=" + "/".join(streams)
        
        def run():
            while self.is_running:
                print(f"[WS Scanner] Bağlanıyor: {len(streams)} akış...", flush=True)
                ws = websocket.WebSocketApp(
                    stream_url,
                    on_message=self.on_message,
                    on_error=lambda ws, err: print(f"[WS Error] {err}", flush=True),
                    on_close=lambda ws, st, msg: print("[WS Closed] Yeniden bağlanılıyor...", flush=True)
                )
                ws.run_forever()
                time.sleep(5)
        
        threading.Thread(target=run, daemon=True).start()

    def get_latest_results(self):
        return self.results
