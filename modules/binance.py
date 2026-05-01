import requests
import time

FAPI = "https://fapi.binance.com/fapi/v1"
SAPI = "https://api.binance.com/api/v3"

class BinanceAPI:
    def __init__(self):
        self._spot_cache = []
        self._spot_ts = 0
        self._ticker_cache = []
        self._ticker_ts = 0

    def get_futures_symbols(self):
        try:
            r = requests.get(f"{FAPI}/exchangeInfo", timeout=10)
            data = r.json()
            # Sadece USDT ile biten Süresiz (PERPETUAL) sözleşmeleri al
            return [
                s['symbol'] for s in data['symbols'] 
                if s['status'] == 'TRADING' and 
                   s['contractType'] == 'PERPETUAL' and 
                   s['symbol'].endswith('USDT')
            ]
        except:
            return []

    def get_spot_symbols(self):
        now = time.time()
        if now - self._spot_ts > 3600:
            try:
                r = requests.get(f"{SAPI}/exchangeInfo", timeout=10)
                data = r.json()
                self._spot_cache = [
                    s['symbol'] for s in data.get('symbols', [])
                    if s['status'] == 'TRADING' and s['quoteAsset'] == 'USDT'
                ]
                self._spot_ts = now
            except Exception as e:
                print(f"Spot symbols error: {e}")
        return self._spot_cache

    def get_funding(self, symbol):
        try:
            r = requests.get(f"{FAPI}/premiumIndex", params={'symbol': symbol}, timeout=8)
            d = r.json()
            rate = float(d.get('lastFundingRate', 0)) * 100
            next_time = int(d.get('nextFundingTime', 0))
            mark_price = float(d.get('markPrice', 0))
            return {
                'ok': True,
                'symbol': symbol,
                'rate': rate,
                'nextTime': next_time,
                'markPrice': mark_price
            }
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    def get_oi(self, symbol):
        try:
            r = requests.get(f"{FAPI}/openInterest", params={'symbol': symbol}, timeout=8)
            d = r.json()
            oi = float(d.get('openInterest', 0))
            return {'ok': True, 'symbol': symbol, 'openInterest': oi}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    def get_klines(self, symbol, interval, limit=500):
        try:
            r = requests.get(
                f"{FAPI}/klines",
                params={'symbol': symbol, 'interval': interval, 'limit': min(limit, 1000)},
                timeout=15
            )
            data = r.json()
            if not isinstance(data, list):
                return {'ok': False, 'error': f"Binance Error: {data}", 'candles': []}

            candles = [{
                'time': k[0] // 1000,
                'open': float(k[1]),
                'high': float(k[2]),
                'low': float(k[3]),
                'close': float(k[4]),
                'volume': float(k[5]),
                'quoteVolume': float(k[7]),
                'trades': int(k[8])
            } for k in data]
            return {'ok': True, 'symbol': symbol, 'interval': interval, 'candles': candles}
        except Exception as e:
            return {'ok': False, 'error': str(e), 'candles': []}

    def get_all_tickers(self):
        try:
            r = requests.get(f"{FAPI}/ticker/24hr", timeout=10)
            tickers = r.json()
            result = []
            for t in tickers:
                if t['symbol'].endswith('USDT'):
                    result.append({
                        's': t['symbol'],
                        'c': t['lastPrice'],
                        'P': t['priceChangePercent'],
                        'q': t['quoteVolume'],
                        'h': t['highPrice'],
                        'l': t['lowPrice'],
                        'v': t['volume'],
                        'n': t['count']
                    })
            return {'ok': True, 'tickers': result}
        except Exception as e:
            return {'ok': False, 'error': str(e), 'tickers': []}
