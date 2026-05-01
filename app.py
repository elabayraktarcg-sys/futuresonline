"""Binance Futures Pro - Flask App v4"""

from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import os
import time
import threading

from modules.binance     import BinanceAPI
from modules.telegram    import TelegramAPI
from modules.database    import Database
from modules.market_data import get_global, get_fear_greed, get_premium_index_bulk, get_tv_quotes
from modules.strategy    import get_signals

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

binance = BinanceAPI()
db      = Database()

# ── WEBSOCKET STRATEGY SCANNER ───────────────────────────────────────
from modules.scanner_ws import BinanceWSScanner

# Tüm Binance Futures sembollerini WS ile dinleyelim (600+ coin)
all_futures = binance.get_futures_symbols()
SCAN_SYMBOLS = all_futures # Sınır kaldırıldı, tümü taranıyor
SCAN_INTERVALS = ['5m', '15m', '30m', '1h', '4h']

print(f"[Scanner] Toplam {len(SCAN_SYMBOLS)} coin taranacak. Zaman dilimleri: {SCAN_INTERVALS}")

# Scanner objesini oluşturalım ama henüz başlatmayalım
ws_scanner = BinanceWSScanner(SCAN_SYMBOLS, SCAN_INTERVALS)
scanner_started = False

# ── PAGES ─────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/strategy')
def strategy_page():
    return render_template('strategy.html')

@app.route('/multi-chart/<symbol>')
def multi_chart(symbol):
    return render_template('multi_chart.html', symbol=symbol)

@app.route('/api/strategy/start')
def start_scanner_api():
    global scanner_started
    if not scanner_started:
        threading.Thread(target=ws_scanner.start, daemon=True).start()
        scanner_started = True
        return jsonify({'ok': True, 'msg': 'Scanner başlatıldı'})
    return jsonify({'ok': True, 'msg': 'Scanner zaten çalışıyor'})

@app.route('/api/strategy/stop')
def stop_scanner_api():
    global scanner_started
    try:
        ws_scanner.stop()
    except:
        pass
    scanner_started = False
    return jsonify({'ok': True, 'msg': 'Scanner durduruldu'})

@app.route('/api/strategy/status')
def scanner_status():
    return jsonify({
        'started': scanner_started,
        'results_count': len(ws_scanner.get_latest_results())
    })

@app.route('/api/strategy/scanner')
def strategy_scanner_api():
    # WebSocket scanner'dan sonuçları çek
    results = ws_scanner.get_latest_results()
    return jsonify({
        'ok': True,
        'results': results
    })

# ── BINANCE ───────────────────────────────────────────────────────────
@app.route('/api/spot-symbols')
def spot_symbols():
    return jsonify(binance.get_spot_symbols())

@app.route('/api/funding/<symbol>')
def funding(symbol):
    return jsonify(binance.get_funding(symbol))

@app.route('/api/funding/bulk')
def funding_bulk():
    return jsonify(get_premium_index_bulk())

@app.route('/api/oi/<symbol>')
def open_interest(symbol):
    return jsonify(binance.get_oi(symbol))

@app.route('/api/klines/<symbol>/<interval>')
def klines(symbol, interval):
    limit = request.args.get('limit', 500, type=int)
    return jsonify(binance.get_klines(symbol, interval, limit))

@app.route('/api/ticker/all')
def all_tickers():
    return jsonify(binance.get_all_tickers())

# ── MARKET DATA (proxy — CORS bypass) ────────────────────────────────
@app.route('/api/market/global')
def market_global():
    return jsonify(get_global())

@app.route('/api/market/feargreed')
def market_feargreed():
    return jsonify(get_fear_greed())

@app.route('/api/market/tv-quotes')
def market_tv_quotes():
    return jsonify(get_tv_quotes())


# ── DATABASE ──────────────────────────────────────────────────────────
@app.route('/api/db/save-layout', methods=['POST'])
def save_layout():
    db.save_layout(request.json.get('slot', 0), request.json.get('layout', {}))
    return jsonify({'ok': True})

@app.route('/api/db/load-layout/<int:slot>')
def load_layout(slot):
    return jsonify({'ok': True, 'layout': db.load_layout(slot)})

@app.route('/api/db/all-layouts')
def all_layouts():
    return jsonify(db.get_all_layouts())

@app.route('/api/db/save-script', methods=['POST'])
def save_script():
    return jsonify({'ok': True, 'id': db.save_script(request.json)})

@app.route('/api/db/delete-script/<int:sid>', methods=['DELETE'])
def delete_script(sid):
    db.delete_script(sid); return jsonify({'ok': True})

@app.route('/api/db/all-scripts')
def all_scripts():
    return jsonify(db.get_all_scripts())

@app.route('/api/db/save-indicator', methods=['POST'])
def save_indicator():
    db.save_indicator(request.json); return jsonify({'ok': True})

@app.route('/api/db/all-indicators')
def all_indicators():
    return jsonify(db.get_all_indicators())

@app.route('/api/db/delete-indicator/<int:iid>', methods=['DELETE'])
def delete_indicator(iid):
    db.delete_indicator(iid); return jsonify({'ok': True})

@app.route('/api/db/save-telegram', methods=['POST'])
def save_telegram():
    db.save_telegram(request.json); return jsonify({'ok': True})

@app.route('/api/db/load-telegram')
def load_telegram():
    return jsonify(db.load_telegram())

# ── TELEGRAM ──────────────────────────────────────────────────────────
@app.route('/api/telegram/send', methods=['POST'])
def telegram_send():
    d = request.json
    return jsonify(TelegramAPI.send(d.get('bot_token',''), d.get('chat_id',''), d.get('message','')))

if __name__ == '__main__':
    import webbrowser
    print("Binance Futures Pro v4")
    print("http://127.0.0.1:5000")
    print(f"DB: {os.path.abspath('futures_pro.db')}")
    
    # Otomatik sayfa açma
    threading.Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)
