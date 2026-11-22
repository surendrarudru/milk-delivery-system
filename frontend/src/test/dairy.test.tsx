import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { customerSchema, paymentSchema, validateWithSchema } from '../validation/schemas';
import { dairyApi } from '../api/client';
import { ErrorBoundary } from '../components/ErrorBoundary';

describe('1. Customer & Payment Form Validation', () => {
  it('rejects empty customer name or missing delivery shift', () => {
    const res = validateWithSchema(customerSchema, {
      CustomerName: 'A',
      MobileNumber: '9876543210',
      MilkRate: 70,
      VeenaPusaRate: 600,
      DefaultMilkQuantity: 1,
      MorningDelivery: false,
      EveningDelivery: false,
      OpeningBalance: 0,
    });
    expect(res.success).toBe(false);
  });

  it('accepts a valid customer payload', () => {
    const res = validateWithSchema(customerSchema, {
      CustomerName: 'Madhu',
      MobileNumber: '8639161220',
      MilkRate: 70,
      VeenaPusaRate: 600,
      DefaultMilkQuantity: 1.5,
      MorningDelivery: true,
      EveningDelivery: false,
      OpeningBalance: 0,
    });
    expect(res.success).toBe(true);
  });

  it('rejects ₹0 total payment amount', () => {
    const res = validateWithSchema(paymentSchema, {
      CustomerID: 1,
      PaymentDate: '2026-11-23',
      OpeningBalanceAmount: 0,
      MilkAmount: 0,
      VeenaPusaAmount: 0,
    });
    expect(res.success).toBe(false);
  });
});

describe('2. API Client & Bill Generation Mocking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches monthly bills cleanly via dairyApi.getMonthlyBills', async () => {
    const mockBills = [
      {
        BillID: 101,
        CustomerID: 1,
        CustomerCode: 'CUST001',
        CustomerName: 'Madhu',
        BillYear: 2026,
        BillMonth: 11,
        PreviousBalance: 0,
        TotalMilkLiters: 15,
        MilkAmount: 1050,
        TotalVeenaPusaKg: 0,
        VeenaPusaAmount: 0,
        NetPayable: 1050,
        BillStatus: 'Generated',
      },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBills,
    } as Response);

    const bills = await dairyApi.getMonthlyBills(2026, 11);
    expect(bills).toHaveLength(1);
    expect(bills[0].CustomerCode).toBe('CUST001');
    expect(bills[0].NetPayable).toBe(1050);
  });
});

describe('3. ErrorBoundary & Accessibility Fallback', () => {
  it('catches child render errors and renders accessible Retry button', () => {
    const BrokenComponent = () => {
      throw new Error('Test crash');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary sectionName="Monthly Bills">
        <BrokenComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Monthly Bills encountered an error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Section/i })).toBeInTheDocument();
  });
});