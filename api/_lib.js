import { neon } from '@neondatabase/serverless';

const doctorSeed = [
  ['Анна Смирнова', 'стоматолог-терапевт', 'Лечение кариеса, консультации, профилактика', '#2d8f8f'],
  ['Дмитрий Волков', 'стоматолог-ортопед', 'Коронки, виниры, восстановление улыбки', '#356d9a'],
];

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

export function json(res, status, data) {
  res.status(status).json(data);
}

export async function ensureDatabase() {
  const sql = db();
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS doctors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      accent TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS slots (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id),
      date DATE NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'busy')),
      UNIQUE (doctor_id, date, time)
    )`,
    sql`CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      doctor_id INTEGER NOT NULL REFERENCES doctors(id),
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE INDEX IF NOT EXISTS slots_doctor_date_idx ON slots (doctor_id, date)`,
    sql`CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at DESC)`,
  ]);
  const rows = await sql`SELECT COUNT(*)::int AS count FROM doctors`;
  if (rows[0].count === 0) {
    for (const [name, role, description, accent] of doctorSeed) {
      await sql`INSERT INTO doctors (name, role, description, accent) VALUES (${name}, ${role}, ${description}, ${accent})`;
    }
  }
}

export async function ensureFutureSlots() {
  const sql = db();
  await sql`INSERT INTO slots (doctor_id, date, time, status)
    SELECT d.id, calendar.day::date, schedule.time, 'free'
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS position FROM doctors
    ) d
    CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 366, INTERVAL '1 day') AS calendar(day)
    CROSS JOIN LATERAL unnest(
      CASE WHEN d.position % 2 = 0
        THEN ARRAY['09:30', '11:00', '13:30', '16:00']
        ELSE ARRAY['10:00', '12:30', '15:00', '18:00']
      END
    ) WITH ORDINALITY AS schedule(time, position)
    WHERE EXTRACT(DOW FROM calendar.day) <> 0
    ON CONFLICT (doctor_id, date, time) DO NOTHING`;
}

export async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Telegram request failed: ${response.status}`);
  return response.json();
}

export function bookingText(booking) {
  return [
    `Заявка #${booking.id}`,
    `Пациент: ${booking.patient_name}`,
    `Телефон: ${booking.phone}`,
    `Врач: ${booking.doctor_name}`,
    `Дата и время: ${booking.date} в ${booking.time}`,
    `Услуга: ${booking.service}`,
    booking.comment ? `Комментарий: ${booking.comment}` : null,
  ].filter(Boolean).join('\n');
}
