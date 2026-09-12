-- Migration: 20260912000002_add_menu_image_url.sql
-- Description: Adds image_url column to public.menu_items if not already present

ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.menu_items.image_url IS 'Relative or absolute URL to the menu item photo';
