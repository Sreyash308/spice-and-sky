-- Migration: Add payment_status column to orders table
-- Supports PENDING, PAID, and CANCELLED statuses

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';

COMMENT ON COLUMN public.orders.payment_status IS 'Payment status: PENDING, PAID, or CANCELLED';
