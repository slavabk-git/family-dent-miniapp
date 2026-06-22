# Family Dent Mini App

Telegram bot + Telegram Mini App for a dental appointment flow.

## Local Run

Create `.env` from `.env.example`, then run:

```bash
python3 app.py
```

Local app URL:

```text
http://127.0.0.1:8000
```

## Docker Run

Create `.env` on the server:

```env
TELEGRAM_BOT_TOKEN=your_botfather_token
ADMIN_CHAT_ID=your_admin_chat_id
APP_DOMAIN=app.example.com
WEBAPP_URL=https://app.example.com
HOST=0.0.0.0
PORT=8000
```

Run:

```bash
docker compose up -d --build
```

Caddy will expose HTTPS for `APP_DOMAIN` and proxy traffic to the Python app.

## Telegram Commands

- `/start` opens the Mini App button.
- `/bookings` shows recent test bookings.
- `/setadmin` saves the current chat as admin for new-booking notifications.
- `/myid` prints the current chat id.

## Security

Do not commit `.env`, `Server.rtf`, local database files, screenshots, or VPN/SSH credentials.
