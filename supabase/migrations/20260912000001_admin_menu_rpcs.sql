-- ============================================================
-- SPICE & SKY ROOFTOP CAFE - ADMIN MENU MANAGEMENT RPC FUNCTIONS
-- ============================================================
-- Run this in your Supabase SQL Editor if you wish to allow
-- admin menu updates (price, name, description, availability)
-- directly from the web client without needing the service_role key.

CREATE OR REPLACE FUNCTION public.admin_update_menu_item(
  p_item_id UUID,
  p_name TEXT DEFAULT NULL,
  p_price NUMERIC(10,2) DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_food_type TEXT DEFAULT NULL,
  p_is_available BOOLEAN DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_verification_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated RECORD;
BEGIN
  UPDATE public.menu_items
  SET
    name = COALESCE(p_name, name),
    price = COALESCE(p_price, price),
    description = COALESCE(p_description, description),
    category_id = COALESCE(p_category_id, category_id),
    food_type = COALESCE(p_food_type, food_type),
    is_available = COALESCE(p_is_available, is_available),
    is_active = COALESCE(p_is_active, is_active),
    verification_note = COALESCE(p_verification_note, verification_note),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_item_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item % not found.', p_item_id;
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

-- Grant execution to public / anon / authenticated
GRANT EXECUTE ON FUNCTION public.admin_update_menu_item TO anon, authenticated;
