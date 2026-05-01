import requests

class TelegramAPI:
    @staticmethod
    def send(bot_token, chat_id, message):
        if not bot_token or not chat_id or not message:
            return {'ok': False, 'error': 'Eksik parametre'}
        try:
            r = requests.post(
                f'https://api.telegram.org/bot{bot_token}/sendMessage',
                json={'chat_id': chat_id, 'text': message, 'parse_mode': 'HTML'},
                timeout=10
            )
            return r.json()
        except Exception as e:
            return {'ok': False, 'error': str(e)}
