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
  visibleMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
};

const doctorGrid = document.querySelector('#doctorGrid');
const dateStrip = document.querySelector('#dateStrip');
const slotGrid = document.querySelector('#slotGrid');
const dateHint = document.querySelector('#dateHint');
const slotHint = document.querySelector('#slotHint');
const bookingHint = document.querySelector('#bookingHint');
const bookingForm = document.querySelector('#bookingForm');
const resultBox = document.querySelector('#resultBox');
const monthLabel = document.querySelector('#monthLabel');
const previousMonth = document.querySelector('#previousMonth');
const nextMonth = document.querySelector('#nextMonth');

const ruWeekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const ruMonths = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const calendarWeekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  return date.getFullYear() * 12 + date.getMonth();
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
  calendarWeekdays.forEach((weekday) => {
    const label = document.createElement('span');
    label.className = 'calendar-weekday';
    label.textContent = weekday;
    dateStrip.append(label);
  });

  const formattedMonth = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(state.visibleMonth);
  monthLabel.textContent = formattedMonth.charAt(0).toUpperCase() + formattedMonth.slice(1);

  const dateMap = new Map(state.dates.map((item) => [item.date, item]));
  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  for (let index = 0; index < cellCount; index += 1) {
    const day = index - firstWeekday + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'date-button';

    if (day < 1 || day > daysInMonth) {
      button.classList.add('muted');
      button.textContent = day < 1 ? previousMonthDays + day : day - daysInMonth;
      button.disabled = true;
      dateStrip.append(button);
      continue;
    }

    const date = new Date(year, month, day, 12);
    const dateKey = toDateKey(date);
    const item = dateMap.get(dateKey);
    const freeCount = Number(item?.free_count || 0);
    button.dataset.date = dateKey;
    button.setAttribute('aria-label', formatDate(dateKey).label);
    button.innerHTML = `<strong>${day}</strong><span>${freeCount > 0 ? `${freeCount} св.` : 'занято'}</span>`;

    if (!item || freeCount === 0) {
      button.classList.add('busy');
      button.disabled = true;
    } else {
      button.addEventListener('click', () => selectDate(dateKey));
    }
    if (dateKey === state.date) button.classList.add('active');
    dateStrip.append(button);
  }

  const firstAvailable = state.dates.find((item) => Number(item.free_count) > 0);
  const lastAvailable = [...state.dates].reverse().find((item) => Number(item.free_count) > 0);
  previousMonth.disabled = !firstAvailable
    || monthKey(state.visibleMonth) <= monthKey(new Date(`${firstAvailable.date}T12:00:00`));
  nextMonth.disabled = !lastAvailable
    || monthKey(state.visibleMonth) >= monthKey(new Date(`${lastAvailable.date}T12:00:00`));
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
  if (state.date) {
    const selected = new Date(`${state.date}T12:00:00`);
    state.visibleMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  }
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

previousMonth.addEventListener('click', () => {
  state.visibleMonth = new Date(
    state.visibleMonth.getFullYear(),
    state.visibleMonth.getMonth() - 1,
    1,
  );
  renderDates();
});

nextMonth.addEventListener('click', () => {
  state.visibleMonth = new Date(
    state.visibleMonth.getFullYear(),
    state.visibleMonth.getMonth() + 1,
    1,
  );
  renderDates();
});

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
