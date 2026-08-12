import { db, ensureDatabase, json, telegram } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (process.env.TELEGRAM_WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return json(res, 401, { error: 'Unauthorized' });
  }
  try {
    await ensureDatabase();
    const message = req.body?.message;
    if (!message?.chat?.id) return json(res, 200, { ok: true });
    const chatId = message.chat.id;
    const text = String(message.text || '');
    const webAppUrl = process.env.WEBAPP_URL;
    if (text.startsWith('/start')) {
      const payload = { chat_id: chatId, text: 'Здравствуйте! Это тестовый бот Family Dent. Нажмите кнопку записи, выберите врача, дату и удобное время.' };
      if (webAppUrl?.startsWith('https://')) payload.reply_markup = { inline_keyboard: [[{ text: 'Открыть запись', web_app: { url: webAppUrl } }]] };
      await telegram('sendMessage', payload);
    } else if (text.startsWith('/bookings')) {
      const rows = await db()`SELECT b.id, b.patient_name, b.service, d.name AS doctor_name, s.date::text AS date, s.time
        FROM bookings b JOIN doctors d ON d.id = b.doctor_id JOIN slots s ON s.id = b.slot_id ORDER BY b.id DESC LIMIT 10`;
      const response = rows.length ? rows.map((booking) => `#${booking.id} — ${booking.patient_name}, ${booking.doctor_name}, ${booking.date} ${booking.time}, ${booking.service}`).join('\n') : 'Пока заявок нет.';
      await telegram('sendMessage', { chat_id: chatId, text: response });
    } else if (text.startsWith('/setadmin')) {
      if (String(chatId) !== String(process.env.ADMIN_CHAT_ID || '')) return json(res, 403, { error: 'Admin chat is configured in Vercel settings' });
      await telegram('sendMessage', { chat_id: chatId, text: 'Этот чат уже получает уведомления о новых заявках.' });
    } else if (text.startsWith('/myid')) {
      await telegram('sendMessage', { chat_id: chatId, text: `Ваш Telegram chat_id: ${chatId}` });
    }
    json(res, 200, { ok: true });
  } catch (error) { json(res, 500, { error: error.message }); }
}
