import { request } from '../http';
import { HolidaysResponse, HolidayStateToday, HolidayItem, DlsStatus } from '../../types/api';

export type { HolidaysResponse, HolidayStateToday, HolidayItem, DlsStatus };


const mockToday: Record<string, HolidayStateToday> = {
  ACT: { date: '2026-08-14', state: 'ACT', is_working_day: true, holiday_name: null, weekday: 5 },
  NSW: { date: '2026-08-14', state: 'NSW', is_working_day: true, holiday_name: null, weekday: 5 },
  QLD: { date: '2026-08-14', state: 'QLD', is_working_day: true, holiday_name: null, weekday: 5 },
};

const mockUpcoming: HolidayItem[] = [
  { date: '2026-09-28', name: 'Family & Community Day', state: 'ACT', display: 'ACT · Family & Community Day' },
  { date: '2026-10-05', name: 'Labour Day', state: 'NSW', display: 'NSW · Labour Day' },
  { date: '2026-10-05', name: 'King\'s Birthday', state: 'QLD', display: 'QLD · King\'s Birthday' },
  { date: '2026-12-25', name: 'Christmas Day', state: 'ALL', display: '澳洲全国 · 圣诞节' },
  { date: '2026-12-26', name: 'Boxing Day', state: 'ALL', display: '澳洲全国 · 节礼日' },
];

const mockNext: HolidayItem = {
  date: '2026-09-28',
  name: 'Family & Community Day',
  state: 'ACT',
  display: 'ACT · Family & Community Day',
};

const mockDls: Record<string, DlsStatus> = {
  sydney: { utc_offset_hours: 10, dls_active: false },
  brisbane: { utc_offset_hours: 10, dls_active: false },
};

const mockChina: HolidayItem[] = [
  { date: '2026-10-01', name: '国庆节', state: 'CN', display: '中国 · 国庆节' },
  { date: '2027-02-06', name: '春节', state: 'CN', display: '中国 · 春节' },
];

const mockNextChina: HolidayItem = {
  date: '2026-10-01',
  name: '国庆节',
  state: 'CN',
  display: '中国 · 国庆节',
};

export const MOCK_HOLIDAYS_RESPONSE: HolidaysResponse = {
  today: mockToday,
  upcoming: mockUpcoming,
  next: mockNext,
  dls: mockDls,
  china: mockChina,
  next_china: mockNextChina,
};

export async function getHolidays(state?: string, limit?: number): Promise<HolidaysResponse> {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (limit) params.set('limit', limit.toString());
  const query = params.toString() ? `?${params.toString()}` : '';

  try {
    const res = await request<HolidaysResponse>(`/api/holidays${query}`);
    return res || MOCK_HOLIDAYS_RESPONSE;
  } catch (err) {
    return MOCK_HOLIDAYS_RESPONSE;
  }
}
