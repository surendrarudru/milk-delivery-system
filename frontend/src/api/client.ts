import type {
  Customer,
  DeliveryCustomerRow,
  DeliverySessionType,
  MonthlyBill,
  CustomerPayment,
} from '../types/dairy';

export const API_URL: string =
  import.meta.env.VITE_API_URL || 'https://' + 'milk-delivery-api-bn26' + '.onrender.com';

export async function typedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const dairyApi = {
  getCustomers: () => typedFetch<Customer[]>('/customers'),
  getCustomersSummary: () => typedFetch<Customer[]>('/customers-summary'),
  getSessionCustomers: (session: DeliverySessionType, date?: string) =>
    typedFetch<DeliveryCustomerRow[]>(
      `/delivery/customers/${session}${date ? `?delivery_date=${date}` : ''}`
    ),
  getMonthlyBills: (year: number, month: number) =>
    typedFetch<MonthlyBill[]>(`/billing/${year}/${month}`),
  getCustomerPayments: (customerId: number) =>
    typedFetch<CustomerPayment[]>(`/customers/${customerId}/payments`),
};