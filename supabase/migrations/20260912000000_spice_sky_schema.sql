-- ============================================================
-- SPICE & SKY ROOFTOP CAFE - SUPABASE DATABASE SCHEMA
-- ============================================================
-- Complete Relational Schema, RLS, Indexes, Realtime & Atomic Order RPC

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. PROFILES (Staff & Admin Roles linked to auth.users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'WAITER')),
  display_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- 2. MENU CATEGORIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- 3. MENU ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  food_type TEXT NOT NULL CHECK (food_type IN ('VEG', 'NON_VEG', 'DRINK', 'OTHER', 'NEEDS_CONFIRMATION')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  verification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- 4. MENU ITEM VARIANTS (e.g. Pizza Sizes: 6", 12", 9")
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_item_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- 5. ORDERS (Strict 9-Table POS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL UNIQUE,
  table_number INTEGER NOT NULL CHECK (table_number >= 1 AND table_number <= 9),
  waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  waiter_name_snapshot TEXT NOT NULL DEFAULT 'Staff',
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- 6. ORDER ITEMS (Immutable Historical Price Snapshots)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  unit_price_snapshot NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------
-- INDEXES FOR PERFORMANCE
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_menu_categories_order ON public.menu_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON public.menu_items(is_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON public.menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_menu_variants_item ON public.menu_item_variants(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table_number ON public.orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_waiter_id ON public.orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON public.order_items(menu_item_id);

-- ------------------------------------------------------------
-- REALTIME PUBLICATION SETUP
-- ------------------------------------------------------------
-- Enable Realtime for instant menu and order propagation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_item_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Set replica identity to FULL for proper realtime payload transmission
ALTER TABLE public.menu_categories REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.menu_item_variants REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Helper functions to check roles securely
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN', 'WAITER')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "Profiles readable by authenticated staff" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated staff"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Profiles editable by Admin or self" ON public.profiles;
CREATE POLICY "Profiles editable by Admin or self"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- 2. Menu Categories Policies
DROP POLICY IF EXISTS "Public can read categories" ON public.menu_categories;
CREATE POLICY "Public can read categories"
  ON public.menu_categories FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin full control on categories" ON public.menu_categories;
CREATE POLICY "Admin full control on categories"
  ON public.menu_categories FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Menu Items Policies
DROP POLICY IF EXISTS "Public can read active menu items" ON public.menu_items;
CREATE POLICY "Public can read active menu items"
  ON public.menu_items FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin full control on menu items" ON public.menu_items;
CREATE POLICY "Admin full control on menu items"
  ON public.menu_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Menu Item Variants Policies
DROP POLICY IF EXISTS "Public can read active variants" ON public.menu_item_variants;
CREATE POLICY "Public can read active variants"
  ON public.menu_item_variants FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin full control on variants" ON public.menu_item_variants;
CREATE POLICY "Admin full control on variants"
  ON public.menu_item_variants FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Orders Policies
DROP POLICY IF EXISTS "Staff can read orders" ON public.orders;
CREATE POLICY "Staff can read orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
CREATE POLICY "Staff can insert orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update order status" ON public.orders;
CREATE POLICY "Staff can update order status"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Admin can delete orders" ON public.orders;
CREATE POLICY "Admin can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 6. Order Items Policies
DROP POLICY IF EXISTS "Staff can read order items" ON public.order_items;
CREATE POLICY "Staff can read order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert order items" ON public.order_items;
CREATE POLICY "Staff can insert order items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());

-- ------------------------------------------------------------
-- ATOMIC ORDER CREATION RPC (create_order_atomic)
-- ------------------------------------------------------------
-- This function executes server-side, validates table number (1..9),
-- verifies availability, fetches authoritative prices, creates historical
-- snapshots, and calculates total: SUM(unit_price * quantity)
-- NO GST, NO TAX, NO SERVICE CHARGE, NO HIDDEN FEES.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_table_number INT,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_waiter_id UUID DEFAULT NULL,
  p_waiter_name TEXT DEFAULT 'Staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_number INT;
  v_total NUMERIC(10,2) := 0;
  v_item RECORD;
  v_item_id UUID;
  v_variant_id UUID;
  v_qty INT;
  v_db_item RECORD;
  v_db_variant RECORD;
  v_unit_price NUMERIC(10,2);
  v_item_name TEXT;
  v_variant_name TEXT;
  v_line_total NUMERIC(10,2);
  v_result JSONB;
BEGIN
  -- 1. Validate Table Number
  IF p_table_number < 1 OR p_table_number > 9 THEN
    RAISE EXCEPTION 'Invalid table number: %. Must be between 1 and 9.', p_table_number;
  END IF;

  -- 2. Validate Items Array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order cannot be empty.';
  END IF;

  -- 3. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT id, order_number, total INTO v_order_id, v_order_number, v_total
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'table_number', p_table_number,
        'total', v_total,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- 4. Create Order Record Shell
  INSERT INTO public.orders (
    table_number,
    waiter_id,
    waiter_name_snapshot,
    status,
    subtotal,
    total,
    notes,
    idempotency_key
  ) VALUES (
    p_table_number,
    p_waiter_id,
    COALESCE(p_waiter_name, 'Staff'),
    'CONFIRMED',
    0,
    0,
    p_notes,
    p_idempotency_key
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- 5. Process Each Item Authoritatively
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item.value->>'menu_item_id')::UUID;
    v_variant_id := NULLIF(v_item.value->>'variant_id', '')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be at least 1.';
    END IF;

    -- Fetch Authoritative Menu Item
    SELECT id, name, price, is_available, is_active
    INTO v_db_item
    FROM public.menu_items
    WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found.', v_item_id;
    END IF;

    IF NOT v_db_item.is_active THEN
      RAISE EXCEPTION 'Item "%" is no longer on the menu.', v_db_item.name;
    END IF;

    IF NOT v_db_item.is_available THEN
      RAISE EXCEPTION 'Item "%" is currently unavailable.', v_db_item.name;
    END IF;

    v_item_name := v_db_item.name;

    -- Handle Variants (e.g. Pizza size)
    IF v_variant_id IS NOT NULL THEN
      SELECT id, name, price, is_available
      INTO v_db_variant
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND menu_item_id = v_item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % for item "%" not found.', v_variant_id, v_item_name;
      END IF;

      IF NOT v_db_variant.is_available THEN
        RAISE EXCEPTION 'Variant "%" for item "%" is currently unavailable.', v_db_variant.name, v_item_name;
      END IF;

      v_unit_price := v_db_variant.price;
      v_variant_name := v_db_variant.name;
    ELSE
      v_unit_price := v_db_item.price;
      v_variant_name := NULL;
    END IF;

    -- Authoritative Line Total = Unit Price * Quantity
    v_line_total := v_unit_price * v_qty;
    v_total := v_total + v_line_total;

    -- Insert Order Item Snapshot
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      item_name_snapshot,
      variant_name_snapshot,
      unit_price_snapshot,
      quantity,
      line_total
    ) VALUES (
      v_order_id,
      v_item_id,
      v_item_name,
      v_variant_name,
      v_unit_price,
      v_qty,
      v_line_total
    );
  END LOOP;

  -- 6. Update Final Order Total (NO TAX, NO GST, NO SERVICE CHARGE)
  UPDATE public.orders
  SET subtotal = v_total, total = v_total, updated_at = timezone('utc'::text, now())
  WHERE id = v_order_id;

  -- 7. Build and Return Order Summary
  v_result := jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'table_number', p_table_number,
    'waiter_name', COALESCE(p_waiter_name, 'Staff'),
    'subtotal', v_total,
    'total', v_total,
    'status', 'CONFIRMED',
    'created_at', timezone('utc'::text, now())
  );

  RETURN v_result;
END;
$$;
