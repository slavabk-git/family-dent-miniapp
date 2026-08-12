import { db, ensureDatabase, ensureFutureSlots, json } from './_lib.js';

export default async function handler(req, res) {
  try {
    const doctorId = Number(req.query.doctor_id);
    if (!doctorId) return json(res, 400, { error: 'doctor_id is required' });
    await ensureDatabase(); await ensureFutureSlots();
    const dates = await db()`SELECT date::text AS date,
      COUNT(*) FILTER (WHERE status = 'free')::int AS free_count, COUNT(*)::int AS total_count
      FROM slots WHERE doctor_id = ${doctorId} AND date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '366 days'
      GROUP BY date ORDER BY date`;
    json(res, 200, { dates });
  } catch (error) { json(res, 500, { error: error.message }); }
}
