-- Migration: Restructure Menu Categories & Move Lasagne to Pastas
-- Date: 2026-09-13
-- Author: Antigravity Assistant

BEGIN;

-- 1. Safely handle slug swap for Rice Bowls -> Fried Rice and Specials -> Rice Bowls
UPDATE public.menu_categories 
SET slug = 'temp-fried-rice-trans' 
WHERE slug = 'rice-bowls';

-- Rename old Rice Bowls to Fried Rice (display_order: 11)
UPDATE public.menu_categories 
SET name = 'Fried Rice', 
    slug = 'fried-rice', 
    display_order = 11,
    updated_at = NOW()
WHERE slug = 'temp-fried-rice-trans';

-- Rename old Specials to Rice Bowls (display_order: 3)
UPDATE public.menu_categories 
SET name = 'Rice Bowls', 
    slug = 'rice-bowls', 
    display_order = 3,
    updated_at = NOW()
WHERE slug = 'specials';

-- Rename Extras / Sides to Toasts (display_order: 12)
UPDATE public.menu_categories 
SET name = 'Toasts', 
    slug = 'toasts', 
    display_order = 12,
    updated_at = NOW()
WHERE slug = 'extras-sides';

-- Rename Starters — Veg to Main Course — Veg (display_order: 1)
UPDATE public.menu_categories 
SET name = 'Main Course — Veg', 
    slug = 'main-course-veg', 
    display_order = 1,
    updated_at = NOW()
WHERE slug = 'starters-veg';

-- Rename Starters — Non-Veg to Main Course — Non-Veg (display_order: 2)
UPDATE public.menu_categories 
SET name = 'Main Course — Non-Veg', 
    slug = 'main-course-non-veg', 
    display_order = 2,
    updated_at = NOW()
WHERE slug = 'starters-non-veg';

-- Update all remaining categories display orders to strictly match priority order
UPDATE public.menu_categories SET display_order = 4, updated_at = NOW() WHERE slug = 'pastas-veg';
UPDATE public.menu_categories SET display_order = 5, updated_at = NOW() WHERE slug = 'pastas-non-veg';
UPDATE public.menu_categories SET display_order = 6, updated_at = NOW() WHERE slug = 'french-fries';
UPDATE public.menu_categories SET display_order = 7, updated_at = NOW() WHERE slug = 'pizzas-veg';
UPDATE public.menu_categories SET display_order = 8, updated_at = NOW() WHERE slug = 'pizzas-non-veg';
UPDATE public.menu_categories SET display_order = 9, updated_at = NOW() WHERE slug = 'burgers-veg';
UPDATE public.menu_categories SET display_order = 10, updated_at = NOW() WHERE slug = 'burgers-non-veg';
UPDATE public.menu_categories SET display_order = 13, updated_at = NOW() WHERE slug = 'hot-coffee';
UPDATE public.menu_categories SET display_order = 14, updated_at = NOW() WHERE slug = 'iced-coffee';
UPDATE public.menu_categories SET display_order = 15, updated_at = NOW() WHERE slug = 'coffee-extras';
UPDATE public.menu_categories SET display_order = 16, updated_at = NOW() WHERE slug = 'milkshakes';
UPDATE public.menu_categories SET display_order = 17, updated_at = NOW() WHERE slug = 'signature-coffee-drinks';
UPDATE public.menu_categories SET display_order = 18, updated_at = NOW() WHERE slug = 'mojitos';

-- 2. Move Lasagne to Pastas — Non-Veg
UPDATE public.menu_items
SET category_id = (SELECT id FROM public.menu_categories WHERE slug = 'pastas-non-veg'),
    updated_at = NOW()
WHERE name = 'Lasagne';

COMMIT;
