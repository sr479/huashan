export type GarmentState = 'available' | 'rented' | 'cleaning' | 'maintenance';
export type BookingStatus =
  'pending' | 'confirmed' | 'rented' | 'returned' | 'completed' | 'cancelled';
export type DayStatus = 'available' | 'reserved' | 'rented' | 'cleaning' | 'maintenance';
export type PaymentKind =
  'rent' | 'rent_refund' | 'deposit' | 'deposit_refund' | 'deposit_deduction';
export interface Settings {
  storeName: string;
  phone: string;
  wechat: string;
  address: string;
  hours: string;
  introduction: string;
  notice: string;
  cleaningDays: number;
  returnTime: string;
  rentalRules: string;
  icp: string;
}
export interface Garment {
  id: string;
  sku: string;
  name: string;
  category: string;
  size: string;
  measurements: string;
  description: string;
  accessories: string[];
  images: string[];
  dailyPrice: number;
  deposit: number;
  state: GarmentState;
  listed: boolean;
  tone: string;
  cleaningUntil: string | null;
  demo: boolean;
  createdAt: string;
  currentStatus?: DayStatus;
  expectedReturn?: string | null;
  overdue?: boolean;
  nextAvailable?: string | null;
  available?: boolean;
  unavailableReason?: string;
  activeOrders?: number;
}
export interface Payment {
  id: string;
  bookingId: string;
  kind: PaymentKind;
  amount: number;
  method: string;
  note: string;
  createdAt: string;
}
export interface Booking {
  id: string;
  orderNo: string;
  garmentId: string;
  garmentName: string;
  sku: string;
  guestName: string;
  phone: string;
  startDate: string;
  endDate: string;
  note: string;
  status: BookingStatus;
  dailyPrice: number;
  rentalTotal: number;
  depositRequired: number;
  cleaningDays: number;
  source: 'online' | 'store';
  createdAt: string;
  pickedAt: string | null;
  returnedAt: string | null;
  inspection: string;
  cancellationReason: string;
  rentPaid: number;
  depositBalance: number;
  depositDeducted: number;
  overdue: boolean;
  payments?: Payment[];
  demo: boolean;
}
export interface CalendarDay {
  date: string;
  status: DayStatus;
  canStart: boolean;
}
export interface Catalog {
  garments: Garment[];
  settings: Settings;
  today: string;
}
export interface Dashboard {
  today: string;
  counts: {
    pending: number;
    rented: number;
    cleaning: number;
    overdue: number;
    pickupToday: number;
    returnToday: number;
  };
  money: { monthRevenue: number; depositHeld: number };
  bookings: Booking[];
  cleaning: Garment[];
}
export interface Audit {
  id: number;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}
