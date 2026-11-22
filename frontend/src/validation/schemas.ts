import { z } from 'zod';

export const customerSchema = z
  .object({
    CustomerName: z.string().trim().min(2, 'Customer name must be at least 2 characters'),
    MobileNumber: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || /^[6-9]\d{9}$/.test(val.replace(/\D/g, '').slice(-10)), {
        message: 'Enter a valid 10-digit mobile number',
      }),
    MilkRate: z.coerce.number().positive('Milk rate per liter must be greater than ₹0'),
    VeenaPusaRate: z.coerce.number().min(0, 'VeenaPusa rate cannot be negative'),
    DefaultMilkQuantity: z.coerce.number().min(0, 'Default milk quantity cannot be negative'),
    MorningDelivery: z.boolean(),
    EveningDelivery: z.boolean(),
    OpeningBalance: z.coerce.number(),
  })
  .refine((data) => data.MorningDelivery || data.EveningDelivery, {
    message: 'Select at least Morning or Evening delivery shift',
    path: ['MorningDelivery'],
  });

export const paymentSchema = z
  .object({
    CustomerID: z.coerce.number().int().positive('Please select a customer'),
    PaymentDate: z.string().min(1, 'Payment date is required'),
    OpeningBalanceAmount: z.coerce.number().min(0, 'Amount cannot be negative'),
    MilkAmount: z.coerce.number().min(0, 'Amount cannot be negative'),
    VeenaPusaAmount: z.coerce.number().min(0, 'Amount cannot be negative'),
  })
  .refine(
    (data) => data.OpeningBalanceAmount + data.MilkAmount + data.VeenaPusaAmount > 0,
    {
      message: 'Total payment amount must be greater than ₹0',
      path: ['MilkAmount'],
    }
  );

export const deliveryEntrySchema = z.object({
  DeliveryStatus: z.enum(['Delivered', 'Undelivered']),
  MilkQuantity: z.coerce.number().min(0, 'Milk quantity cannot be negative'),
  VeenaPusaQuantity: z.coerce.number().min(0, 'VeenaPusa quantity cannot be negative'),
});

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string>; firstError: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] || 'form');
    if (!errors[key]) errors[key] = issue.message;
  }
  const firstError = result.error.issues[0]?.message || 'Please check form inputs';
  return { success: false, errors, firstError };
}