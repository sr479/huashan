const DAY = 86400000;
const statusLabels = {
  pending: '待店主确认',
  confirmed: '已确认 · 待取衣',
  rented: '出租中',
  returned: '已归还 · 待结算',
  completed: '已完成',
  cancelled: '已取消',
};
const dayLabels = {
  available: '可租',
  reserved: '已约',
  rented: '租出',
  cleaning: '清洗',
  maintenance: '维护',
};
function todayInChina(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function addDays(value, offset) {
  return new Date(Date.parse(value + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10);
}
function rentalDays(start, end) {
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY) + 1;
}
function money(cents) {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}
function shiftMonth(month, offset) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
function validateRange(start, end, today) {
  if (!validDate(start) || !validDate(end)) return '请选择有效的取还日期';
  if (start < today) return '取衣日期不能早于今天';
  if (end < start) return '归还日期不能早于取衣日期';
  if (rentalDays(start, end) > 90) return '单次租期最多 90 天';
  if (start > addDays(today, 365)) return '请预约未来一年内的取衣日期';
  return '';
}
function datesFromQuery(query, today) {
  const start = query.start || today,
    end = query.end || start;
  return validateRange(start, end, today) ? { start: today, end: today } : { start, end };
}
function garmentView(garment) {
  let currentText = '当前在店 · 可预约到店试穿';
  if (garment.currentStatus === 'rented')
    currentText = garment.overdue
      ? '已逾期未还 · 新档期待确认'
      : `当前已租出 · 预计 ${garment.expectedReturn || '待确认'} 归还`;
  if (garment.currentStatus === 'cleaning') currentText = '当前清洗中 · 检查完成后可取衣';
  if (garment.currentStatus === 'maintenance') currentText = '当前维护中 · 暂停预约';
  if (garment.currentStatus === 'reserved') currentText = '当前在店 · 今日已有预约';
  return {
    ...garment,
    priceText: money(garment.dailyPrice),
    depositText: money(garment.deposit),
    currentText,
    availabilityText: garment.available ? '所选日期可预约' : '所选日期不可租',
  };
}
function calendarCells(days, month, start, end, today) {
  const blanks = (new Date(month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  return Array.from({ length: blanks }, (_, i) => ({ key: `blank-${i}`, blank: true })).concat(
    days.map((day) => ({
      ...day,
      key: day.date,
      number: Number(day.date.slice(8)),
      label: dayLabels[day.status] || '待确认',
      selected: day.date >= start && day.date <= end,
      disabled: !day.canStart || day.date < today || day.date > addDays(today, 365),
    })),
  );
}
function receiptView(booking) {
  return {
    ...booking,
    statusText: statusLabels[booking.status] || '待核实',
    rentalText: money(booking.rentalTotal),
    depositText: money(booking.depositRequired),
    days: rentalDays(booking.startDate, booking.endDate),
    maskedPhone: booking.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
  };
}
function bookingInput(form, garmentId, start, end, today, consent) {
  const error = validateRange(start, end, today);
  if (error) throw new Error(error);
  const guestName = String(form.guestName || '').trim(),
    phone = String(form.phone || '').trim(),
    note = String(form.note || '').trim();
  if (!guestName || guestName.length > 40) throw new Error('请填写 1–40 字的称呼');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请填写有效的 11 位中国大陆手机号');
  if (note.length > 500) throw new Error('备注请控制在 500 字以内');
  if (!consent) throw new Error('请先阅读租赁规则与预约信息说明，并勾选同意');
  return { garmentId, guestName, phone, startDate: start, endDate: end, note };
}
module.exports = {
  todayInChina,
  validDate,
  addDays,
  rentalDays,
  money,
  shiftMonth,
  validateRange,
  datesFromQuery,
  garmentView,
  calendarCells,
  receiptView,
  bookingInput,
};
