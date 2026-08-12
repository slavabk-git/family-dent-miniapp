import { bookingText, db, ensureDatabase, json, telegram } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const data = req.body || {}; const required = ['doctor_id', 'slot_id', 'patient_name', 'phone', 'service'];
    const missing = required.filter((key) => !String(data[key] || '').trim());
    if (missing.length) return json(res, 400, { error: 'Missing fields', fields: missing });
    await ensureDatabase(); const sql = db();
    const claimed = await sql`UPDATE slots SET status = 'busy'
      WHERE id = ${Number(data.slot_id)} AND doctor_id = ${Number(data.doctor_id)} AND status = 'free' RETURNING id`;
    if (!claimed.length) throw new Error('Выбранное время уже занято. Выберите другое.');
    const inserted = await sql`INSERT INTO bookings (slot_id, doctor_id, patient_name, phone, service, comment)
      VALUES (${claimed[0].id}, ${Number(data.doctor_id)}, ${String(data.patient_name).trim()}, ${String(data.phone).trim()}, ${String(data.service).trim()}, ${String(data.comment || '').trim() || null}) RETURNING id`;
    const result = inserted[0].id;
    const booking = (await sql`SELECT b.id, b.patient_name, b.phone, b.service, b.comment, d.name AS doctor_name, s.date::text AS date, s.time
      FROM bookings b JOIN doctors d ON d.id = b.doctor_id JOIN slots s ON s.id = b.slot_id WHERE b.id = ${result}`)[0];
    const text = `Новая заявка Family Dent.\n\n${bookingText(booking)}`;
    const targets = [data.telegram_user_id, process.env.ADMIN_CHAT_ID].filter(Boolean);
    await Promise.allSettled(targets.map((chat_id) => telegram('sendMessage', { chat_id, text })));
    json(res, 201, { ok: true, booking_id: result, booking, notification_sent: Boolean(data.telegram_user_id), admin_notification_sent: Boolean(process.env.ADMIN_CHAT_ID) });
  } catch (error) { json(res, error.message.includes('занято') ? 409 : 500, { error: error.message }); }
}
