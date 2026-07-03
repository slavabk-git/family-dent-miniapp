# Family Dent Mini App — Project Notes

## Purpose
Portfolio Telegram bot + Mini App for a private dental clinic. The app lets users choose a doctor/time and submit an appointment request. Admin notifications go to Telegram.

## Local Project
- Local path: `/Users/vyacheslavbabenko/Documents/Codex/My Landing Portfolio/Family_Dent_MiniApp`
- Main stack: Python backend, local SQLite/data folder, Telegram bot integration, Docker on server
- Keep secrets only in `.env`. Do not commit or print token values.

## Public Deployment
- Public URL: `https://family-dent.186.246.8.84.sslip.io`
- Server project path: `/opt/family-dent-miniapp`
- Server access key on Mac: `~/.ssh/family_dent_deploy`
- Caddy reverse proxy: `family-dent.186.246.8.84.sslip.io -> 127.0.0.1:8000`
- Docker compose project: `/opt/family-dent-miniapp/docker-compose.yml`

## Telegram
- Bot username: `FamilyDentzZapis_bot`
- `.env` keys used: `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID`, `APP_DOMAIN`, `WEBAPP_URL`, `HOST`, `PORT`
- Telegram API on server may need `extra_hosts` mapping for `api.telegram.org`.

## Common Server Commands
```bash
ssh -i ~/.ssh/family_dent_deploy root@186.246.8.84
cd /opt/family-dent-miniapp
docker compose ps
docker compose logs --tail=100 app
docker compose up -d --build
systemctl status caddy --no-pager
```

## Notes
- Do not delete or overwrite `/opt/family-dent-miniapp/.env`.
- The app was deployed successfully and tested with Telegram notifications.
- If updating code, avoid changing unrelated user files and keep bot tokens out of chat/logs.

## Update — 3 July 2026
- Replaced the short horizontal date strip with a full monthly calendar.
- Added previous/next month controls and availability labels for every day.
- The backend now maintains appointment slots for 12 months ahead without changing existing bookings.
- Verified 314 working dates across 13 partial/full calendar months.
- Playwright checks passed at desktop and Telegram mobile widths with no horizontal overflow.
