const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const state = {
  doctors: [],
  dates: [],
  slots: [],
  doctorId: null,
  date: null,
  slotId: null,
};

const doctorGrid = document.querySelector('#doctorGrid');
const dateStrip = document.querySelector('#dateStrip');
const slotGrid = document.querySelector('#slotGrid');
const dateHint = document.querySelector('#dateHint');
const slotHint = document.querySelector('#slotHint');
const bookingHint = document.querySelector('#bookingHint');
const bookingForm = document.querySelector('#bookingForm');
const resultBox = document.querySelector('#resultBox');

const ruWeekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const ruMonths = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

async function api(path, options) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Ошибка запроса');
  }
  return data;
}

function formatDate(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  return {
    day: String(date.getDate()),
    label: `${ruWeekdays[date.getDay()]}, ${date.getDate()} ${ruMonths[date.getMonth()]}`,
  };
}

function renderDoctors() {
  doctorGrid.innerHTML = '';
  state.doctors.forEach((doctor) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `doctor-card ${doctor.id === state.doctorId ? 'active' : ''}`;
    button.innerHTML = `
      <strong>${doctor.name}</strong>
      <span>${doctor.role}</span>
      <small>${doctor.description}</small>
    `;
    button.addEventListener('click', () => selectDoctor(doctor.id));
    doctorGrid.append(button);
  });
}

function renderDates() {
  dateStrip.innerHTML = '';
  state.dates.forEach((item) => {
    const formatted = formatDate(item.date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `date-button ${item.free_count === 0 ? 'busy' : ''} ${item.date === state.date ? 'active' : ''}`;
    button.innerHTML = `
      <strong>${formatted.day}</strong>
      <span>${formatted.label}</span>
      <span>${item.free_count > 0 ? `${item.free_count} окна` : 'занято'}</span>
    `;
    button.addEventListener('click', () => selectDate(item.date));
    dateStrip.append(button);
  });
}

function renderSlots() {
  slotGrid.innerHTML = '';
  state.slots.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slot-button ${slot.status === 'busy' ? 'busy' : ''} ${slot.id === state.slotId ? 'active' : ''}`;
    button.textContent = slot.status === 'free' ? `${slot.time} свободно` : `${slot.time} занято`;
    button.disabled = slot.status !== 'free';
    button.addEventListener('click', () => {
      state.slotId = slot.id;
      bookingHint.textContent = `Выбрано ${slot.date}, ${slot.time}`;
      renderSlots();
    });
    slotGrid.append(button);
  });
}

async function selectDoctor(doctorId) {
  state.doctorId = doctorId;
  state.slotId = null;
  renderDoctors();
  const data = await api(`/api/dates?doctor_id=${doctorId}`);
  state.dates = data.dates;
  state.date = state.dates.find((item) => item.free_count > 0)?.date || state.dates[0]?.date || null;
  renderDates();
  if (state.date) await selectDate(state.date);
}

async function selectDate(date) {
  state.date = date;
  state.slotId = null;
  dateHint.textContent = formatDate(date).label;
  renderDates();
  const data = await api(`/api/slots?doctor_id=${state.doctorId}&date=${date}`);
  state.slots = data.slots;
  slotHint.textContent = state.slots.some((slot) => slot.status === 'free') ? 'Есть свободные окна' : 'Все окна заняты';
  bookingHint.textContent = 'Выберите свободное время';
  renderSlots();
}

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  resultBox.hidden = true;
  if (!state.doctorId || !state.date || !state.slotId) {
    resultBox.hidden = false;
    resultBox.textContent = 'Сначала выберите врача, дату и свободное время.';
    return;
  }
  const formData = new FormData(bookingForm);
  const payload = Object.fromEntries(formData.entries());
  payload.doctor_id = state.doctorId;
  payload.slot_id = state.slotId;
  payload.telegram_user_id = tg?.initDataUnsafe?.user?.id || null;
  try {
    const result = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const booking = result.booking || {};
    const notificationText = result.notification_sent
      ? 'Подтверждение отправлено вам в чат Telegram.'
      : 'Заявка сохранена. В Telegram-чат подтверждение не отправилось: откройте бота через /start и попробуйте еще раз.';
    resultBox.hidden = false;
    resultBox.className = 'result result-success';
    resultBox.textContent = [
      `Запись создана. Номер заявки: #${result.booking_id}`,
      `${booking.doctor_name || 'Врач'}: ${booking.date || state.date} в ${booking.time || ''}`,
      notificationText,
    ].join('\n');
    try {
      tg?.HapticFeedback?.notificationOccurred?.('success');
      if (tg?.showPopup) {
        tg.showPopup({
          title: 'Запись создана',
          message: `Номер заявки: #${result.booking_id}. ${notificationText}`,
          buttons: [{ type: 'ok' }],
        });
      } else {
        tg?.showAlert?.(`Запись создана. Номер заявки: #${result.booking_id}`);
      }
    } catch (error) {
      console.info('Telegram popup is unavailable outside Telegram.');
    }
    bookingForm.reset();
    await selectDate(state.date);
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    resultBox.hidden = false;
    resultBox.className = 'result result-error';
    resultBox.textContent = error.message;
  }
});

async function init() {
  const data = await api('/api/doctors');
  state.doctors = data.doctors;
  state.doctorId = state.doctors[0]?.id || null;
  renderDoctors();
  if (state.doctorId) await selectDoctor(state.doctorId);
}

init().catch((error) => {
  resultBox.hidden = false;
  resultBox.textContent = error.message;
});
