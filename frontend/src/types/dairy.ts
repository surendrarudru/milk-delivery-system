export type UserRole = 'Admin' | 'User' | 'Co-Owner';
export type DeliverySessionType = 'Morning' | 'Evening';
export type DeliveryStatus = 'Delivered' | 'Undelivered';

export interface AccountBalances {
  OpeningBalance: number;
  Milk: number;
  VeenaPusa: number;
}

export interface Customer {
  CustomerID: number;
  CustomerCode: string;
  CustomerName: string;
  ReferenceName?: string | null;
  MobileNumber?: string | null;
  Address?: string | null;
  MilkRate: number;
  VeenaPusaRate: number;
  DefaultMilkQuantity: number;
  MorningDelivery: boolean;
  EveningDelivery: boolean;
  RouteOrder: number;
  OpeningBalance: number;
  IsActive: boolean;
  AccountBalances?: AccountBalances;
  TotalDue?: number;
}

export interface DeliveryCustomerRow extends Customer {
  DeliveryDetailID?: number | null;
  SessionID?: number | null;
  DeliveryStatus: DeliveryStatus;
  MilkQuantity: number;
  VeenaPusaQuantity: number;
  Notes?: string | null;
}

export interface MonthlyBill {
  BillID: number;
  CustomerID: number;
  CustomerCode: string;
  CustomerName: string;
  ReferenceName?: string | null;
  MobileNumber?: string | null;
  BillYear: number;
  BillMonth: number;
  PreviousBalance: number;
  TotalMilkLiters: number;
  MilkAmount: number;
  TotalVeenaPusaKg: number;
  VeenaPusaAmount: number;
  NetPayable: number;
  BillStatus: 'Generated' | 'Finalized';
}

export interface CustomerPayment {
  PaymentID: number;
  CustomerID: number;
  PaymentDate: string;
  PaymentMode: 'Cash' | 'UPI' | 'Bank Transfer';
  OpeningBalanceAmount: number;
  MilkAmount: number;
  VeenaPusaAmount: number;
  TotalAmount: number;
  Notes?: string | null;
}