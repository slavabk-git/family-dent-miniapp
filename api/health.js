import { ensureDatabase, json } from './_lib.js';
export default async function handler(_req, res) { try { await ensureDatabase(); json(res, 200, { ok: true }); } catch (error) { json(res, 500, { ok: false, error: error.message }); } }
