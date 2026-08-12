import { db, ensureDatabase, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const doctorId = Number(req.query.doctor_id); const date = String(req.query.date || '');
    if (!doctorId || !date) return json(res, 400, { error: 'doctor_id and date are required' });
    await ensureDatabase();
    json(res, 200, { slots: await db()`SELECT id, doctor_id, date::text AS date, time, status FROM slots WHERE doctor_id = ${doctorId} AND date = ${date}::date ORDER BY time` });
  } catch (error) { json(res, 500, { error: error.message }); }
}
