import requests
import time

FAPI = "https://fapi.binance.com/fapi/v1"

def get_klines(symbol, interval, limit=10):
    try:
        r = requests.get(
            f"{FAPI}/klines",
            params={'symbol': symbol, 'interval': interval, 'limit': limit},
            timeout=10
        )
        return r.json()
    except Exception as e:
        return str(e)

syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
for s in syms:
    print(f"Testing {s}...")
    res = get_klines(s, '5m')
    print(f"Result type: {type(res)}")
    if isinstance(res, list):
        print(f"Success! Received {len(res)} candles.")
    else:
        print(f"Error: {res}")
    time.sleep(1)
