import { db, ensureDatabase, json } from './_lib.js';

export default async function handler(_req, res) {
  try {
    await ensureDatabase();
    json(res, 200, { doctors: await db()`SELECT * FROM doctors ORDER BY id` });
  } catch (error) { json(res, 500, { error: error.message }); }
}
