"""market_data.py - Global market verileri: BTC.D, TOTAL, TOTALALT, Fear&Greed"""
import requests, time, threading

_cache = {}
_lock  = threading.Lock()

HEADERS = {'User-Agent': 'Mozilla/5.0 FuturesPro/1.0'}

def _get(key):
    with _lock:
        c = _cache.get(key)
        return c if c and time.time() - c['ts'] < c['ttl'] else None

def _set(key, val, ttl=60):
    with _lock:
        _cache[key] = {'val': val, 'ts': time.time(), 'ttl': ttl}

# ── Global market cap (CoinGecko) ────────────────────────────────────
def get_global():
    cached = _get('global')
    if cached: return cached['val']
    
    result = {'ok': False, 'total': 0, 'btcDom': 0, 'altcap': 0, 'totalChg': 0}
    
    # 1. CoinGecko dene
    try:
        r = requests.get(
            'https://api.coingecko.com/api/v3/global',
            headers=HEADERS, timeout=10
        )
        if r.status_code == 200:
            d = r.json().get('data', {})
            total    = d.get('total_market_cap', {}).get('usd', 0)
            btcPct   = d.get('market_cap_percentage', {}).get('btc', 0)
            ethPct   = d.get('market_cap_percentage', {}).get('eth', 0)
            totalChg = d.get('market_cap_change_percentage_24h_usd', 0)
            altcap   = total * (1 - (btcPct + ethPct) / 100)
            result   = {'ok': True, 'total': total, 'btcDom': btcPct,
                        'altcap': altcap, 'totalChg': totalChg, 'source': 'coingecko'}
            _set('global', result, ttl=90)
            return result
    except Exception as e:
        print(f'[MarketData] CoinGecko hatası: {e}')

    # 2. Fallback: Binance futures 24hr ticker toplamı
    try:
        r = requests.get(
            'https://fapi.binance.com/fapi/v1/ticker/24hr',
            headers=HEADERS, timeout=10
        )
        if r.status_code == 200:
            tickers = r.json()
            total_vol = sum(float(t.get('quoteVolume', 0)) for t in tickers if t['symbol'].endswith('USDT'))
            btc_vol   = next((float(t.get('quoteVolume', 0)) for t in tickers if t['symbol'] == 'BTCUSDT'), 0)
            eth_vol   = next((float(t.get('quoteVolume', 0)) for t in tickers if t['symbol'] == 'ETHUSDT'), 0)
            btcDom    = (btc_vol / total_vol * 100) if total_vol > 0 else 0
            ethDom    = (eth_vol / total_vol * 100) if total_vol > 0 else 0
            altcap_vol= total_vol * (1 - (btcDom + ethDom) / 100)
            result    = {'ok': True, 'total': total_vol, 'btcDom': btcDom,
                         'altcap': altcap_vol, 'totalChg': 0, 'source': 'binance_vol'}
            _set('global', result, ttl=60)
            return result
    except Exception as e:
        print(f'[MarketData] Binance fallback hatası: {e}')

    return result

# ── Fear & Greed ──────────────────────────────────────────────────────
def get_fear_greed():
    cached = _get('fg')
    if cached: return cached['val']
    
    result = {'ok': False, 'value': 50, 'label': 'Neutral'}
    try:
        r = requests.get(
            'https://api.alternative.me/fng/?limit=1',
            headers=HEADERS, timeout=8
        )
        if r.status_code == 200:
            d = r.json()
            item = d.get('data', [{}])[0]
            result = {
                'ok': True,
                'value': int(item.get('value', 50)),
                'label': item.get('value_classification', 'Neutral')
            }
            _set('fg', result, ttl=3600)  # 1 saat cache
    except Exception as e:
        print(f'[MarketData] Fear&Greed hatası: {e}')
    
    return result

# ── Binance Futures Top tickers (funding dahil) ───────────────────────
def get_premium_index_bulk():
    """Tüm USDT paritelerinin funding rate ve mark price'ını döner"""
    cached = _get('premium_bulk')
    if cached: return cached['val']
    
    try:
        r = requests.get(
            'https://fapi.binance.com/fapi/v1/premiumIndex',
            headers=HEADERS, timeout=10
        )
        if r.status_code == 200:
            data = r.json()
            result = {
                d['symbol']: {
                    'rate': float(d.get('lastFundingRate', 0)) * 100,
                    'nextTime': int(d.get('nextFundingTime', 0)),
                    'markPrice': float(d.get('markPrice', 0))
                }
                for d in data if d.get('symbol', '').endswith('USDT')
            }
            _set('premium_bulk', result, ttl=30)
            return result
    except Exception as e:
        print(f'[MarketData] Premium index hatası: {e}')
    
    return {}

# ── TradingView Global Scanner (BTC.D, USDT.D, TOTAL3) ──────────────
def get_tv_quotes():
    """TradingView scanner API üzerinden BTC.D, USDT.D, TOTAL3 verilerini çeker.
    Server-side çağrı — CORS sorunu yok."""
    cached = _get('tv_quotes')
    if cached: return cached['val']
    
    result = {'ok': False, 'btcD': 0, 'btcDChg': 0, 'usdtD': 0, 'usdtDChg': 0,
              'total3': 0, 'total3Chg': 0}
    try:
        r = requests.post(
            'https://scanner.tradingview.com/global/scan',
            json={
                'symbols': {
                    'tickers': ['CRYPTOCAP:BTC.D', 'CRYPTOCAP:TOTAL3', 'CRYPTOCAP:USDT.D']
                },
                'columns': ['close', 'change']
            },
            headers=HEADERS,
            timeout=10
        )
        if r.status_code == 200:
            data = r.json().get('data', [])
            for row in data:
                sym = row.get('s', '')
                vals = row.get('d', [])
                if len(vals) < 2:
                    continue
                close = float(vals[0]) if vals[0] is not None else 0
                chg = float(vals[1]) if vals[1] is not None else 0
                if sym == 'CRYPTOCAP:BTC.D':
                    result['btcD'] = close
                    result['btcDChg'] = chg
                elif sym == 'CRYPTOCAP:USDT.D':
                    result['usdtD'] = close
                    result['usdtDChg'] = chg
                elif sym == 'CRYPTOCAP:TOTAL3':
                    result['total3'] = close
                    result['total3Chg'] = chg
            result['ok'] = True
            result['source'] = 'tradingview'
            _set('tv_quotes', result, ttl=30)  # 30 saniye cache
            print(f'[MarketData] TV quotes OK — BTC.D={result["btcD"]:.2f}% USDT.D={result["usdtD"]:.2f}% TOTAL3=${result["total3"]/1e9:.2f}B')
            return result
    except Exception as e:
        print(f'[MarketData] TV quotes hatası: {e}')
    
    return result
