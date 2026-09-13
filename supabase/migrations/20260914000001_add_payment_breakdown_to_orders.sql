-- Migration: Add payment breakdown columns to orders table
-- Supports Cash, Online (UPI/Card), and Split payments

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'CASH',
ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS online_amount NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN public.orders.payment_mode IS 'Payment mode: CASH, ONLINE, or SPLIT';
COMMENT ON COLUMN public.orders.cash_amount IS 'Cash amount collected for this order';
COMMENT ON COLUMN public.orders.online_amount IS 'Online/UPI amount collected for this order';
