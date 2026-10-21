export function todayInChina(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function rentalDays(start: string, end: string): number {
  return (
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
  );
}
export function returnDeadlinePassed(
  endDate: string,
  returnTime: string,
  now = new Date(),
): boolean {
  return now.valueOf() > Date.parse(`${endDate}T${returnTime}:00+08:00`);
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export const money = (cents: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(cents / 100);
export const shortDate = (date: string) =>
  date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` : '—';
export const bookingLabels: Record<string, string> = {
  pending: '待确认',
  confirmed: '待取衣',
  rented: '出租中',
  returned: '待结算',
  completed: '已完成',
  cancelled: '已取消',
};
export const stateLabels: Record<string, string> = {
  available: '在店待租',
  reserved: '已预约',
  rented: '出租中',
  cleaning: '清洗中',
  maintenance: '维护中',
};
export const paymentLabels: Record<string, string> = {
  rent: '收取租金',
  rent_refund: '退还租金',
  deposit: '收取押金',
  deposit_refund: '退还押金',
  deposit_deduction: '押金扣款',
};
