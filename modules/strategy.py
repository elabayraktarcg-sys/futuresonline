import numpy as np

def calculate_rsi(prices, period=14):
    if len(prices) <= period:
        return [50.0] * len(prices)
    
    deltas = np.diff(prices)
    seed = deltas[:period]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / down if down != 0 else 100
    rsi = np.zeros_like(prices)
    rsi[:period] = 100. - 100. / (1. + rs)

    for i in range(period, len(prices)):
        delta = deltas[i - 1]
        if delta > 0:
            up_val = delta
            down_val = 0.
        else:
            up_val = 0.
            down_val = -delta

        up = (up * (period - 1) + up_val) / period
        down = (down * (period - 1) + down_val) / period

        rs = up / down if down != 0 else 100
        rsi[i] = 100. - 100. / (1. + rs)

    return rsi.tolist()

def get_signals(candles):
    """
    RSI 4, 14, 100 hesaplar ve kesişim sinyalleri döner.
    """
    if len(candles) < 101:
        return None

    closes = [c['close'] for c in candles]
    
    rsi4   = calculate_rsi(closes, 4)
    rsi14  = calculate_rsi(closes, 14)
    rsi100 = calculate_rsi(closes, 100)

    # Son iki değer (kesişim kontrolü için)
    curr4, prev4 = rsi4[-1], rsi4[-2]
    curr14, prev14 = rsi14[-1], rsi14[-2]
    curr100 = rsi100[-1]

    signal = "NEUTRAL"
    # RSI 4'ün RSI 14'ü yukarı kesmesi (LONG)
    if prev4 <= prev14 and curr4 > curr14:
        signal = "LONG"
    # RSI 4'ün RSI 14'ü aşağı kesmesi (SHORT)
    elif prev4 >= prev14 and curr4 < curr14:
        signal = "SHORT"

    return {
        'signal': signal,
        'rsi4': round(curr4, 2),
        'rsi14': round(curr14, 2),
        'rsi100': round(curr100, 2),
        'close': closes[-1]
    }
