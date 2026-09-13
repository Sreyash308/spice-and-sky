-- Migration: Add missing UPDATE and DELETE RLS policies for order_items
-- Ensures staff can edit bills and modify order item snapshots

DROP POLICY IF EXISTS "Staff can update order items" ON public.order_items;
CREATE POLICY "Staff can update order items"
  ON public.order_items FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete order items" ON public.order_items;
CREATE POLICY "Staff can delete order items"
  ON public.order_items FOR DELETE
  TO authenticated
  USING (public.is_staff());

-- Allow service role and postgres full access
DROP POLICY IF EXISTS "Service role full access on order_items" ON public.order_items;
CREATE POLICY "Service role full access on order_items"
  ON public.order_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
