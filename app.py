#!/usr/bin/env python3
import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.db"


def load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def set_env_value(key, value):
    env_path = ROOT / ".env"
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    updated = False
    next_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            updated = True
        else:
            next_lines.append(line)
    if not updated:
        next_lines.append(f"{key}={value}")
    env_path.write_text("\n".join(next_lines) + "\n")
    os.environ[key] = str(value)


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    with db_connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS doctors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                description TEXT NOT NULL,
                accent TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'free',
                FOREIGN KEY (doctor_id) REFERENCES doctors(id)
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                patient_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                service TEXT NOT NULL,
                comment TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (slot_id) REFERENCES slots(id),
                FOREIGN KEY (doctor_id) REFERENCES doctors(id)
            );
            """
        )

        doctors_count = conn.execute("SELECT COUNT(*) AS count FROM doctors").fetchone()["count"]
        if doctors_count == 0:
            conn.executemany(
                "INSERT INTO doctors (name, role, description, accent) VALUES (?, ?, ?, ?)",
                [
                    (
                        "Анна Смирнова",
                        "стоматолог-терапевт",
                        "Лечение кариеса, консультации, профилактика",
                        "#2d8f8f",
                    ),
                    (
                        "Дмитрий Волков",
                        "стоматолог-ортопед",
                        "Коронки, виниры, восстановление улыбки",
                        "#356d9a",
                    ),
                ],
            )

        slots_count = conn.execute("SELECT COUNT(*) AS count FROM slots").fetchone()["count"]
        if slots_count == 0:
            doctors = conn.execute("SELECT id FROM doctors ORDER BY id").fetchall()
            times_by_doctor = {
                0: ["09:30", "11:00", "13:30", "16:00"],
                1: ["10:00", "12:30", "15:00", "18:00"],
            }
            start = date.today()
            rows = []
            working_days = []
            cursor = start
            while len(working_days) < 14:
                if cursor.weekday() < 6:
                    working_days.append(cursor)
                cursor += timedelta(days=1)

            for day_index, day in enumerate(working_days):
                for doctor_index, doctor in enumerate(doctors):
                    for time_index, slot_time in enumerate(times_by_doctor[doctor_index]):
                        status = "busy" if (day_index + doctor_index + time_index) % 5 == 0 else "free"
                        rows.append((doctor["id"], day.isoformat(), slot_time, status))
            conn.executemany(
                "INSERT INTO slots (doctor_id, date, time, status) VALUES (?, ?, ?, ?)",
                rows,
            )


def json_response(handler, data, status=200):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class AppHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print("[web]", format % args)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            return json_response(self, {"ok": True})
        if path == "/api/doctors":
            return self.handle_doctors()
        if path == "/api/dates":
            return self.handle_dates(parsed.query)
        if path == "/api/slots":
            return self.handle_slots(parsed.query)
        return self.serve_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/bookings":
            return self.handle_booking()
        return json_response(self, {"error": "Not found"}, 404)

    def serve_static(self, path):
        if path in ("/", ""):
            file_path = WEB_DIR / "index.html"
        else:
            safe_path = path.lstrip("/")
            file_path = WEB_DIR / safe_path
        if not file_path.exists() or not file_path.is_file():
            return json_response(self, {"error": "Not found"}, 404)
        content_type = "text/plain; charset=utf-8"
        if file_path.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif file_path.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif file_path.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_doctors(self):
        with db_connect() as conn:
            doctors = [dict(row) for row in conn.execute("SELECT * FROM doctors ORDER BY id")]
        return json_response(self, {"doctors": doctors})

    def handle_dates(self, query):
        params = urllib.parse.parse_qs(query)
        doctor_id = params.get("doctor_id", [""])[0]
        if not doctor_id:
            return json_response(self, {"error": "doctor_id is required"}, 400)
        with db_connect() as conn:
            rows = conn.execute(
                """
                SELECT date,
                       SUM(CASE WHEN status = 'free' THEN 1 ELSE 0 END) AS free_count,
                       COUNT(*) AS total_count
                FROM slots
                WHERE doctor_id = ?
                GROUP BY date
                ORDER BY date
                """,
                (doctor_id,),
            ).fetchall()
        return json_response(self, {"dates": [dict(row) for row in rows]})

    def handle_slots(self, query):
        params = urllib.parse.parse_qs(query)
        doctor_id = params.get("doctor_id", [""])[0]
        selected_date = params.get("date", [""])[0]
        if not doctor_id or not selected_date:
            return json_response(self, {"error": "doctor_id and date are required"}, 400)
        with db_connect() as conn:
            slots = [
                dict(row)
                for row in conn.execute(
                    "SELECT id, doctor_id, date, time, status FROM slots WHERE doctor_id = ? AND date = ? ORDER BY time",
                    (doctor_id, selected_date),
                )
            ]
        return json_response(self, {"slots": slots})

    def handle_booking(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return json_response(self, {"error": "Invalid JSON"}, 400)

        required = ["doctor_id", "slot_id", "patient_name", "phone", "service"]
        missing = [field for field in required if not str(payload.get(field, "")).strip()]
        if missing:
            return json_response(self, {"error": "Missing fields", "fields": missing}, 400)

        with db_connect() as conn:
            slot = conn.execute(
                "SELECT id, status FROM slots WHERE id = ? AND doctor_id = ?",
                (payload["slot_id"], payload["doctor_id"]),
            ).fetchone()
            if not slot:
                return json_response(self, {"error": "Slot not found"}, 404)
            if slot["status"] != "free":
                return json_response(self, {"error": "Slot is already busy"}, 409)
            conn.execute(
                """
                INSERT INTO bookings (slot_id, doctor_id, patient_name, phone, service, comment)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["slot_id"],
                    payload["doctor_id"],
                    payload["patient_name"].strip(),
                    payload["phone"].strip(),
                    payload["service"].strip(),
                    payload.get("comment", "").strip(),
                ),
            )
            conn.execute("UPDATE slots SET status = 'busy' WHERE id = ?", (payload["slot_id"],))
            booking_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]

        booking = get_booking_by_id(booking_id)
        notification_sent = send_booking_confirmation(payload.get("telegram_user_id"), booking)
        admin_notification_sent = send_admin_booking_notification(booking)
        return json_response(
            self,
            {
                "ok": True,
                "booking_id": booking_id,
                "notification_sent": notification_sent,
                "admin_notification_sent": admin_notification_sent,
                "booking": booking,
            },
        )


def mask_phone(phone):
    digits = ''.join(ch for ch in phone if ch.isdigit())
    if len(digits) < 4:
        return phone
    return f"***{digits[-4:]}"


def get_recent_bookings(limit=10):
    with db_connect() as conn:
        rows = conn.execute(
            """
            SELECT b.id,
                   b.patient_name,
                   b.phone,
                   b.service,
                   b.comment,
                   b.created_at,
                   d.name AS doctor_name,
                   s.date,
                   s.time
            FROM bookings b
            JOIN doctors d ON d.id = b.doctor_id
            JOIN slots s ON s.id = b.slot_id
            ORDER BY b.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_booking_by_id(booking_id):
    with db_connect() as conn:
        row = conn.execute(
            """
            SELECT b.id,
                   b.patient_name,
                   b.phone,
                   b.service,
                   b.comment,
                   b.created_at,
                   d.name AS doctor_name,
                   s.date,
                   s.time
            FROM bookings b
            JOIN doctors d ON d.id = b.doctor_id
            JOIN slots s ON s.id = b.slot_id
            WHERE b.id = ?
            """,
            (booking_id,),
        ).fetchone()
    return dict(row) if row else None


def send_booking_confirmation(telegram_user_id, booking):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = str(telegram_user_id or "").strip()
    if not token or not chat_id or not booking:
        return False
    text = "Ваша запись в Family Dent создана.\n\n" + format_booking(booking)
    try:
        telegram_api(token, "sendMessage", {"chat_id": chat_id, "text": text})
        return True
    except Exception as error:
        print(f"[bot] Could not send booking confirmation: {error}")
        return False


def send_admin_booking_notification(booking):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    admin_chat_id = os.environ.get("ADMIN_CHAT_ID", "").strip()
    if not token or not admin_chat_id or not booking:
        return False
    text = "Новая заявка Family Dent.\n\n" + format_booking(booking, mask=False)
    try:
        telegram_api(token, "sendMessage", {"chat_id": admin_chat_id, "text": text})
        return True
    except Exception as error:
        print(f"[bot] Could not send admin notification: {error}")
        return False


def format_booking(row, mask=True):
    phone = mask_phone(row['phone']) if mask else row['phone']
    lines = [
        f"Заявка #{row['id']}",
        f"Пациент: {row['patient_name']}",
        f"Телефон: {phone}",
        f"Врач: {row['doctor_name']}",
        f"Дата и время: {row['date']} в {row['time']}",
        f"Услуга: {row['service']}",
    ]
    if row.get('comment'):
        lines.append(f"Комментарий: {row['comment']}")
    return "\n".join(lines)


def format_recent_bookings(limit=10):
    bookings = get_recent_bookings(limit)
    if not bookings:
        return "Пока заявок нет. Сделайте тестовую запись в Mini App, и она появится здесь."
    header = f"Последние заявки Family Dent: {len(bookings)}"
    return header + "\n\n" + "\n\n".join(format_booking(row) for row in bookings)


def telegram_api(token, method, payload=None):
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload else "GET")
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def run_bot(token, webapp_url):
    if not token:
        print("[bot] TELEGRAM_BOT_TOKEN is not set. Bot polling is disabled.")
        return
    offset = 0
    print("[bot] Bot polling started.")
    while True:
        try:
            result = telegram_api(
                token,
                "getUpdates",
                {"offset": offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]},
            )
            for update in result.get("result", []):
                offset = update["update_id"] + 1
                message = update.get("message")
                if not message:
                    continue
                chat_id = message["chat"]["id"]
                text = message.get("text", "")
                if text.startswith("/start"):
                    keyboard = []
                    if webapp_url and webapp_url.startswith("https://"):
                        keyboard.append([{"text": "Открыть запись", "web_app": {"url": webapp_url}}])
                    reply_markup = {"inline_keyboard": keyboard} if keyboard else None
                    answer = (
                        "Здравствуйте! Это тестовый бот Family Dent. "
                        "Нажмите кнопку записи, выберите врача, дату и удобное время.\n\n"
                        "Для проверки тестовых заявок напишите /bookings. "
                        "Чтобы назначить себя админом для уведомлений, напишите /setadmin."
                    )
                    if not reply_markup:
                        answer += "\n\nДля кнопки Mini App укажите HTTPS-ссылку WEBAPP_URL в файле .env."
                    payload = {"chat_id": chat_id, "text": answer}
                    if reply_markup:
                        payload["reply_markup"] = reply_markup
                    telegram_api(token, "sendMessage", payload)
                elif text.startswith("/bookings"):
                    telegram_api(
                        token,
                        "sendMessage",
                        {"chat_id": chat_id, "text": format_recent_bookings(), "disable_web_page_preview": True},
                    )
                elif text.startswith("/setadmin"):
                    set_env_value("ADMIN_CHAT_ID", chat_id)
                    telegram_api(
                        token,
                        "sendMessage",
                        {
                            "chat_id": chat_id,
                            "text": "Готово. Этот чат назначен админом Family Dent. Теперь новые заявки будут приходить сюда.",
                        },
                    )
                elif text.startswith("/myid"):
                    telegram_api(
                        token,
                        "sendMessage",
                        {"chat_id": chat_id, "text": f"Ваш Telegram chat_id: {chat_id}"},
                    )
                else:
                    telegram_api(
                        token,
                        "sendMessage",
                        {"chat_id": chat_id, "text": "Напишите /start, чтобы открыть запись, /bookings, чтобы посмотреть заявки, или /setadmin, чтобы получать уведомления."},
                    )
        except urllib.error.HTTPError as error:
            print(f"[bot] Telegram HTTP error: {error.code} {error.read().decode('utf-8', 'ignore')}")
            time.sleep(5)
        except Exception as error:
            print(f"[bot] {error}")
            time.sleep(5)


def main():
    load_env()
    init_db()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    webapp_url = os.environ.get("WEBAPP_URL", "").strip()

    bot_thread = threading.Thread(target=run_bot, args=(token, webapp_url), daemon=True)
    bot_thread.start()

    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"[web] Mini App: http://{host}:{port}")
    print(f"[web] Project: {ROOT}")
    print("[web] Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[web] Stopped.")


if __name__ == "__main__":
    main()
