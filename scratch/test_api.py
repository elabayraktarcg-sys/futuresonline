from modules.binance import BinanceAPI
import time

api = BinanceAPI()
syms = api.get_futures_symbols()[:5]
print(f"Testing with: {syms}")

for s in syms:
    for tf in ['5m', '15m']:
        print(f"Fetching {s} {tf}...")
        res = api.get_klines(s, tf, limit=10)
        print(f"Result: {res['ok']} (Candles: {len(res.get('candles', []))})")
        time.sleep(1)
