-- ============================================================
-- SPICE & SKY ROOFTOP CAFE - EXPLICIT TABLE ACCESS GRANTS
-- ============================================================
-- Supabase Data API (PostgREST) Breaking Change Update (Effective Oct 30)
-- Starting October 30, Supabase requires explicit GRANT statements
-- on all tables in public schema for anon, authenticated, and service_role.
-- This migration ensures all Spice & Sky tables and sequences are accessible.

-- 1. Menu Categories (Public read, authenticated staff full control)
GRANT SELECT ON TABLE public.menu_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_categories TO authenticated;
GRANT ALL ON TABLE public.menu_categories TO service_role;

-- 2. Menu Items (Public read, authenticated staff full control)
GRANT SELECT ON TABLE public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;

-- 3. Menu Item Variants (Public read, authenticated staff full control)
GRANT SELECT ON TABLE public.menu_item_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_item_variants TO authenticated;
GRANT ALL ON TABLE public.menu_item_variants TO service_role;

-- 4. User Profiles (Authenticated staff read/update own, service_role full control)
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- 5. Orders (Authenticated staff & service_role POS operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

-- 6. Order Items (Authenticated staff & service_role operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;

-- 7. Sequences (For order_number SERIAL auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- 8. Stored Procedures / RPC Functions
GRANT EXECUTE ON FUNCTION public.create_order_atomic TO authenticated, service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_update_menu_item') THEN
    GRANT EXECUTE ON FUNCTION public.admin_update_menu_item TO authenticated, service_role;
  END IF;
END $$;
