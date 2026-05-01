import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'futures_pro.db')

class Database:
    def __init__(self):
        self._init_db()

    def _conn(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._conn() as c:
            c.executescript("""
                CREATE TABLE IF NOT EXISTS layouts (
                    slot INTEGER PRIMARY KEY,
                    data TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS scripts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    url TEXT,
                    code TEXT,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS indicators (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    params TEXT NOT NULL,
                    color TEXT DEFAULT '#667eea',
                    panel TEXT DEFAULT 'all',
                    enabled INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS telegram_config (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    bot_token TEXT,
                    chat_id TEXT,
                    notify_select INTEGER DEFAULT 0,
                    notify_rsi INTEGER DEFAULT 0,
                    notify_funding INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT UNIQUE NOT NULL,
                    note TEXT,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

    # ── LAYOUTS ──────────────────────────────────────────────────────────────
    def save_layout(self, slot, layout_data):
        with self._conn() as c:
            c.execute("""
                INSERT OR REPLACE INTO layouts (slot, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            """, (slot, json.dumps(layout_data)))

    def load_layout(self, slot):
        with self._conn() as c:
            row = c.execute("SELECT data FROM layouts WHERE slot=?", (slot,)).fetchone()
            return json.loads(row['data']) if row else None

    def get_all_layouts(self):
        with self._conn() as c:
            rows = c.execute("SELECT slot, data, updated_at FROM layouts ORDER BY slot").fetchall()
            result = [None] * 5
            for row in rows:
                if 0 <= row['slot'] < 5:
                    data = json.loads(row['data'])
                    data['_updated'] = row['updated_at']
                    result[row['slot']] = data
            return result

    # ── SCRIPTS ──────────────────────────────────────────────────────────────
    def save_script(self, data):
        sid = data.get('id')
        with self._conn() as c:
            if sid:
                c.execute("""
                    UPDATE scripts SET name=?, url=?, code=?, note=?
                    WHERE id=?
                """, (data['name'], data.get('url',''), data.get('code',''), data.get('note',''), sid))
                return sid
            else:
                cur = c.execute("""
                    INSERT INTO scripts (name, url, code, note)
                    VALUES (?, ?, ?, ?)
                """, (data['name'], data.get('url',''), data.get('code',''), data.get('note','')))
                return cur.lastrowid

    def delete_script(self, sid):
        with self._conn() as c:
            c.execute("DELETE FROM scripts WHERE id=?", (sid,))

    def get_all_scripts(self):
        with self._conn() as c:
            rows = c.execute("SELECT * FROM scripts ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]

    # ── INDICATORS ───────────────────────────────────────────────────────────
    def save_indicator(self, data):
        iid = data.get('id')
        with self._conn() as c:
            if iid:
                c.execute("""
                    UPDATE indicators SET name=?, type=?, params=?, color=?, panel=?, enabled=?
                    WHERE id=?
                """, (data['name'], data['type'], json.dumps(data.get('params',{})),
                      data.get('color','#667eea'), data.get('panel','all'),
                      1 if data.get('enabled', True) else 0, iid))
            else:
                c.execute("""
                    INSERT INTO indicators (name, type, params, color, panel, enabled)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (data['name'], data['type'], json.dumps(data.get('params',{})),
                      data.get('color','#667eea'), data.get('panel','all'),
                      1 if data.get('enabled', True) else 0))

    def delete_indicator(self, iid):
        with self._conn() as c:
            c.execute("DELETE FROM indicators WHERE id=?", (iid,))

    def get_all_indicators(self):
        with self._conn() as c:
            rows = c.execute("SELECT * FROM indicators ORDER BY type, name").fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d['params'] = json.loads(d['params'])
                result.append(d)
            return result

    # ── TELEGRAM ─────────────────────────────────────────────────────────────
    def save_telegram(self, data):
        with self._conn() as c:
            c.execute("""
                INSERT OR REPLACE INTO telegram_config
                (id, bot_token, chat_id, notify_select, notify_rsi, notify_funding, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (data.get('bot_token',''), data.get('chat_id',''),
                  1 if data.get('notify_select') else 0,
                  1 if data.get('notify_rsi') else 0,
                  1 if data.get('notify_funding') else 0))

    def load_telegram(self):
        with self._conn() as c:
            row = c.execute("SELECT * FROM telegram_config WHERE id=1").fetchone()
            if row:
                return {
                    'bot_token': row['bot_token'],
                    'chat_id': row['chat_id'],
                    'notify_select': bool(row['notify_select']),
                    'notify_rsi': bool(row['notify_rsi']),
                    'notify_funding': bool(row['notify_funding'])
                }
            return {'bot_token': '', 'chat_id': '', 'notify_select': False, 'notify_rsi': False, 'notify_funding': False}
