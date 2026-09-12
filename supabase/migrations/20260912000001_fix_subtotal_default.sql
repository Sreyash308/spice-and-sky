-- ============================================================
-- Migration: Ensure subtotal and total have DEFAULT 0 on public.orders
-- ============================================================

ALTER TABLE public.orders ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN total SET DEFAULT 0;

-- Update create_order_atomic to explicitly provide 0 for subtotal and total
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

  -- 4. Create Order Record Shell with Explicit 0 Subtotal
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
