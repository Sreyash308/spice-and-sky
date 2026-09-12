-- ============================================================
-- SPICE & SKY ROOFTOP CAFE - SEED DATA
-- ============================================================
-- Normalized initial menu containing all 18 categories, 80+ items,
-- pizza variant sizes, and owner verification flags.
-- Idempotent (safe to re-run).

DO $$
DECLARE
  v_cat_rice UUID;
  v_cat_extras UUID;
  v_cat_specials UUID;
  v_cat_starters_veg UUID;
  v_cat_pizzas_veg UUID;
  v_cat_starters_nonveg UUID;
  v_cat_pizzas_nonveg UUID;
  v_cat_pastas_veg UUID;
  v_cat_pastas_nonveg UUID;
  v_cat_fries UUID;
  v_cat_burgers_veg UUID;
  v_cat_burgers_nonveg UUID;
  v_cat_hot_coffee UUID;
  v_cat_iced_coffee UUID;
  v_cat_coffee_extras UUID;
  v_cat_milkshakes UUID;
  v_cat_signature_drinks UUID;
  v_cat_mojitos UUID;

  v_item_id UUID;
BEGIN
  -- ----------------------------------------------------------
  -- 1. INSERT / UPSERT CATEGORIES
  -- ----------------------------------------------------------
  INSERT INTO public.menu_categories (name, slug, display_order)
  VALUES
    ('Rice Bowls', 'rice-bowls', 1),
    ('Extras / Sides', 'extras-sides', 2),
    ('Specials', 'specials', 3),
    ('Starters — Veg', 'starters-veg', 4),
    ('Pizzas — Veg', 'pizzas-veg', 5),
    ('Starters — Non-Veg', 'starters-non-veg', 6),
    ('Pizzas — Non-Veg', 'pizzas-non-veg', 7),
    ('Pastas — Veg', 'pastas-veg', 8),
    ('Pastas — Non-Veg', 'pastas-non-veg', 9),
    ('French Fries', 'french-fries', 10),
    ('Burgers — Veg', 'burgers-veg', 11),
    ('Burgers — Non-Veg', 'burgers-non-veg', 12),
    ('Hot Coffee', 'hot-coffee', 13),
    ('Iced Coffee', 'iced-coffee', 14),
    ('Coffee Extras', 'coffee-extras', 15),
    ('Milkshakes', 'milkshakes', 16),
    ('Signature Coffee Drinks', 'signature-coffee-drinks', 17),
    ('Mojitos', 'mojitos', 18)
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

  -- Cache Category IDs
  SELECT id INTO v_cat_rice FROM public.menu_categories WHERE slug = 'rice-bowls';
  SELECT id INTO v_cat_extras FROM public.menu_categories WHERE slug = 'extras-sides';
  SELECT id INTO v_cat_specials FROM public.menu_categories WHERE slug = 'specials';
  SELECT id INTO v_cat_starters_veg FROM public.menu_categories WHERE slug = 'starters-veg';
  SELECT id INTO v_cat_pizzas_veg FROM public.menu_categories WHERE slug = 'pizzas-veg';
  SELECT id INTO v_cat_starters_nonveg FROM public.menu_categories WHERE slug = 'starters-non-veg';
  SELECT id INTO v_cat_pizzas_nonveg FROM public.menu_categories WHERE slug = 'pizzas-non-veg';
  SELECT id INTO v_cat_pastas_veg FROM public.menu_categories WHERE slug = 'pastas-veg';
  SELECT id INTO v_cat_pastas_nonveg FROM public.menu_categories WHERE slug = 'pastas-non-veg';
  SELECT id INTO v_cat_fries FROM public.menu_categories WHERE slug = 'french-fries';
  SELECT id INTO v_cat_burgers_veg FROM public.menu_categories WHERE slug = 'burgers-veg';
  SELECT id INTO v_cat_burgers_nonveg FROM public.menu_categories WHERE slug = 'burgers-non-veg';
  SELECT id INTO v_cat_hot_coffee FROM public.menu_categories WHERE slug = 'hot-coffee';
  SELECT id INTO v_cat_iced_coffee FROM public.menu_categories WHERE slug = 'iced-coffee';
  SELECT id INTO v_cat_coffee_extras FROM public.menu_categories WHERE slug = 'coffee-extras';
  SELECT id INTO v_cat_milkshakes FROM public.menu_categories WHERE slug = 'milkshakes';
  SELECT id INTO v_cat_signature_drinks FROM public.menu_categories WHERE slug = 'signature-coffee-drinks';
  SELECT id INTO v_cat_mojitos FROM public.menu_categories WHERE slug = 'mojitos';

  -- ----------------------------------------------------------
  -- CATEGORY 1: RICE BOWLS
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Veg Fried Rice', 'Traditional wok-tossed fried rice with fresh garden vegetables.', 140, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Veg Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Veg Schezwan Fried Rice', 'Spicy wok-tossed rice flavored with fiery Schezwan chili paste.', 150, 'VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Veg Schezwan Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Brown Garlic Fried Rice', 'Fragrant fried rice infused with golden toasted brown garlic.', 160, 'VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Brown Garlic Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Schezwan Veg Fried Rice', 'Authentic spicy Schezwan rice with seasonal greens.', 160, 'VEG', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Schezwan Veg Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Egg Fried Rice', 'Scrambled eggs wok-tossed with aromatic seasoned rice.', 158, 'NON_VEG', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Egg Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Chicken Fried Rice', 'Tender chicken chunks tossed with vegetables and spiced rice.', 165, 'NON_VEG', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Chicken Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Schezwan Egg Fried Rice', 'Spicy Schezwan egg fried rice with aromatic scallions.', 170, 'NON_VEG', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Schezwan Egg Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Schezwan Chicken Fried Rice', 'Zesty Schezwan fried rice with tender spiced chicken pieces.', 180, 'NON_VEG', 8
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Schezwan Chicken Fried Rice');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_rice, 'Schezwan Mix Fried Rice', 'Egg & Chicken.', 180, 'NON_VEG', 9
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_rice AND name = 'Schezwan Mix Fried Rice');

  -- ----------------------------------------------------------
  -- CATEGORY 2: EXTRAS / SIDES
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_extras, 'Cheddar Cheese Slices', '2 pcs.', 120, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_extras AND name = 'Cheddar Cheese Slices');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_extras, 'Cheesy Garlic Bread', '2 pcs. Warm toasted garlic bread with melted cheese.', 150, 'VEG', 'Normalized from OCR "Pasta Cheese Garlic Bread". Owner to confirm exact name.', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_extras AND name = 'Cheesy Garlic Bread');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_extras, 'Tossed Avocado Toss', 'Fresh avocado chunks tossed with greens and light seasoning.', 170, 'VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_extras AND name = 'Tossed Avocado Toss');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_extras, 'Avocado Mango Toss', 'Refreshing combination of ripe avocado, sweet mango cubes, and citrus glaze.', 180, 'VEG', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_extras AND name = 'Avocado Mango Toss');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_extras, 'Avocado Strawberry Toss', 'Vibrant tossed salad with creamy avocado and sweet strawberries.', 190, 'VEG', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_extras AND name = 'Avocado Strawberry Toss');

  -- ----------------------------------------------------------
  -- CATEGORY 3: SPECIALS
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_specials, 'Grilled Chicken with Brown Sauce', 'Rice, vegetables, salsa, cashews and brownies.', 320, 'NON_VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_specials AND name = 'Grilled Chicken with Brown Sauce');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_specials, 'Grilled Chicken with Lemon Butter Sauce', 'Mashed potatoes, vegetables, grilled chicken and lemon butter sauce.', 360, 'NON_VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_specials AND name = 'Grilled Chicken with Lemon Butter Sauce');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_specials, 'Lasagne', 'A dish made with multiple layers of pasta sheets, filled with vegetables or mixed chicken, baked and served with a combination of white and red sauce.', 355, 'NON_VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_specials AND name = 'Lasagne');

  -- ----------------------------------------------------------
  -- CATEGORY 4: STARTERS — VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Chilli Potato', 'Potatoes blended in honey and chilli sauce.', 199, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Chilli Potato');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Chilli Paneer', 'Paneer tossed in a traditional spicy red chilli flavour.', 249, 'VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Chilli Paneer');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Jalapeño Stick', 'A mix of potato and jalapeño with a blend of cheese.', 260, 'VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Jalapeño Stick');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Paneer Popcorn', 'Crunchy bite-sized vegetarian snack featuring cubes of paneer coated in spiced batter and breadcrumbs.', 229, 'VEG', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Paneer Popcorn');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Paneer 65', 'Spicy, crispy and flavorful paneer appetizer made by deep-frying paneer and tossing it with curry leaves, ginger, garlic and tangy spices.', 299, 'VEG', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Paneer 65');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_veg, 'Loaded Fries', 'French fries, paneer, jalapeño and peri peri dip.', 299, 'VEG', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Loaded Fries');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_starters_veg, 'Broccoli Cheesey Stick', 'Chopped broccoli with shredded chicken.', 299, 'NEEDS_CONFIRMATION', 'IMPORTANT: Original physical menu listed under Veg but description specifies shredded chicken. Owner confirmation required.', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_veg AND name = 'Broccoli Cheesey Stick');

  -- ----------------------------------------------------------
  -- CATEGORY 5: PIZZAS — VEG (Variants: 6 inch & 12 inch)
  -- ----------------------------------------------------------
  -- Classic Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_veg AND name = 'Classic Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_veg, 'Classic Pizza', 'Classic cheese pizza.', 199, 'VEG', 1)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '6 inch', 199, 1), (v_item_id, '12 inch', 249, 2);
  END IF;

  -- Basil Margherita
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_veg AND name = 'Basil Margherita';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_veg, 'Basil Margherita', 'Fresh tomato, basil and cheese.', 239, 'VEG', 2)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '6 inch', 239, 1), (v_item_id, '12 inch', 299, 2);
  END IF;

  -- Vegetable Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_veg AND name = 'Vegetable Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_veg, 'Vegetable Pizza', 'Black olive, corn, yellow capsicum, bell pepper and onion.', 289, 'VEG', 3)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '6 inch', 289, 1), (v_item_id, '12 inch', 329, 2);
  END IF;

  -- Paneer Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_veg AND name = 'Paneer Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_veg, 'Paneer Pizza', 'Paneer and green capsicum.', 299, 'VEG', 4)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '6 inch', 299, 1), (v_item_id, '12 inch', 349, 2);
  END IF;

  -- Mushroom Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_veg AND name = 'Mushroom Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_veg, 'Mushroom Pizza', 'Served with mushrooms.', 329, 'VEG', 5)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '6 inch', 329, 1), (v_item_id, '12 inch', 369, 2);
  END IF;

  -- ----------------------------------------------------------
  -- CATEGORY 6: STARTERS — NON-VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Chilli Chicken', 'Dry / Wet. Tender chicken bites tossed in a bold, tangy and spicy Indo-Chinese gravy or dry glaze.', 279, 'NON_VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Chilli Chicken');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Lemon Garlic Chicken', 'Chicken cooked with lemon, garlic and a rich buttery, tangy sauce.', 269, 'NON_VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Lemon Garlic Chicken');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Honey Chicken', 'Chicken bites pan-seared and tossed in a sticky, sweet and savory glaze.', 289, 'NON_VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Honey Chicken');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Chicken Loaded Fries', 'French fries, chicken, jalapeño and peri peri dip.', 299, 'NON_VEG', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Chicken Loaded Fries');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Spice & Sky Special Popcorn Chicken', 'Crunchy bite-sized chicken pieces coated in spiced batter and breadcrumbs with special spices.', 329, 'NON_VEG', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Spice & Sky Special Popcorn Chicken');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Chicken Popcorn', 'Crunchy bite-sized chicken pieces coated in spiced batter and breadcrumbs with special spices.', 199, 'NON_VEG', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Chicken Popcorn');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_starters_nonveg, 'Crispy Chicken', 'Tender chicken marinated and fried in crispy breadcrumbs.', 279, 'NON_VEG', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_starters_nonveg AND name = 'Crispy Chicken');

  -- ----------------------------------------------------------
  -- CATEGORY 7: PIZZAS — NON-VEG (Variants: 9 inch & 12 inch)
  -- ----------------------------------------------------------
  -- Chicken Pepperoni Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_nonveg AND name = 'Chicken Pepperoni Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
    VALUES (v_cat_pizzas_nonveg, 'Chicken Pepperoni Pizza', 'Chicken pepperoni slices.', 299, 'NON_VEG', 'Normalized from OCR wording. Owner to confirm exact topping description.', 1)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '9 inch', 299, 1), (v_item_id, '12 inch', 349, 2);
  END IF;

  -- Smoked Chicken Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_nonveg AND name = 'Smoked Chicken Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_nonveg, 'Smoked Chicken Pizza', 'Smoky-flavored chicken pizza.', 329, 'NON_VEG', 2)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '9 inch', 329, 1), (v_item_id, '12 inch', 379, 2);
  END IF;

  -- Chicken Tikka Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_nonveg AND name = 'Chicken Tikka Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_nonveg, 'Chicken Tikka Pizza', 'Black olive, corn, yellow capsicum, bell pepper and onion with chicken tikka.', 349, 'NON_VEG', 3)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '9 inch', 349, 1), (v_item_id, '12 inch', 399, 2);
  END IF;

  -- Barbecue Chicken Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_nonveg AND name = 'Barbecue Chicken Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_nonveg, 'Barbecue Chicken Pizza', 'Served with barbecue chicken.', 349, 'NON_VEG', 4)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '9 inch', 349, 1), (v_item_id, '12 inch', 399, 2);
  END IF;

  -- Basil Chicken Pizza
  SELECT id INTO v_item_id FROM public.menu_items WHERE category_id = v_cat_pizzas_nonveg AND name = 'Basil Chicken Pizza';
  IF v_item_id IS NULL THEN
    INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
    VALUES (v_cat_pizzas_nonveg, 'Basil Chicken Pizza', 'Basil and chicken.', 269, 'NON_VEG', 5)
    RETURNING id INTO v_item_id;

    INSERT INTO public.menu_item_variants (menu_item_id, name, price, display_order)
    VALUES (v_item_id, '9 inch', 269, 1), (v_item_id, '12 inch', 299, 2);
  END IF;

  -- ----------------------------------------------------------
  -- CATEGORY 8: PASTAS — VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_pastas_veg, 'White Sauce Pasta', 'A blend of vegetables with white sauce, cheese and spaghetti pasta.', 249, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_veg AND name = 'White Sauce Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_pastas_veg, 'Pesto Penne Pasta', 'Penne pasta with green pesto sauce and cheese.', 259, 'VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_veg AND name = 'Pesto Penne Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_pastas_veg, 'Pink Sauce Pasta', 'Pink sauce pasta.', 279, 'VEG', 'Original description was inconsistent. Owner to confirm exact description.', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_veg AND name = 'Pink Sauce Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_pastas_veg, 'Aglio-Olio Pasta', 'Aglio-olio pasta.', 269, 'VEG', 'Original description was inconsistent with Aglio-Olio. Owner to confirm.', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_veg AND name = 'Aglio-Olio Pasta');

  -- ----------------------------------------------------------
  -- CATEGORY 9: PASTAS — NON-VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_pastas_nonveg, 'White Sauce Pasta', 'Chicken with white sauce, cheese and penne/spaghetti pasta.', 279, 'NON_VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_nonveg AND name = 'White Sauce Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_pastas_nonveg, 'Pesto Penne Pasta', 'Penne pasta with green pesto sauce, cheese and chicken.', 275, 'NON_VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_nonveg AND name = 'Pesto Penne Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_pastas_nonveg, 'Pink Sauce Pasta', 'Pink sauce pasta.', 289, 'NON_VEG', 'Original description was inconsistent. Owner to confirm exact description.', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_nonveg AND name = 'Pink Sauce Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, verification_note, display_order)
  SELECT v_cat_pastas_nonveg, 'Aglio-Olio Pasta', 'Aglio-olio pasta.', 295, 'NON_VEG', 'Original description was inconsistent. Owner to confirm exact description.', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_nonveg AND name = 'Aglio-Olio Pasta');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_pastas_nonveg, 'Butter Chicken Sauce Pasta', 'Penne pasta served with traditional butter chicken gravy sauce.', 349, 'NON_VEG', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_pastas_nonveg AND name = 'Butter Chicken Sauce Pasta');

  -- ----------------------------------------------------------
  -- CATEGORY 10: FRENCH FRIES
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_fries, 'Peri Peri Fries', 'Crispy golden fries tossed in fiery Peri Peri spice blend.', 160, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_fries AND name = 'Peri Peri Fries');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_fries, 'Classic Fries', 'Lightly salted, golden crunchy potato fries.', 169, 'VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_fries AND name = 'Classic Fries');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_fries, 'Spice & Sky Special Fries', 'Signature loaded fries with rooftop spiced seasoning and house dips.', 229, 'VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_fries AND name = 'Spice & Sky Special Fries');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_fries, 'Cheesy Fries', 'Golden French fries smothered in warm, velvety melted cheese sauce.', 199, 'VEG', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_fries AND name = 'Cheesy Fries');

  -- ----------------------------------------------------------
  -- CATEGORY 11: BURGERS — VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_veg, 'Veg Patty Burger', 'Served with a vegetarian patty.', 129, 'VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_veg AND name = 'Veg Patty Burger');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_veg, 'Crispy Paneer Burger', 'Paneer coated with crispy batter and served between two buns.', 135, 'VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_veg AND name = 'Crispy Paneer Burger');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_veg, 'Double Patty Burger', 'Double patty with vegetables.', 155, 'VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_veg AND name = 'Double Patty Burger');

  -- ----------------------------------------------------------
  -- CATEGORY 12: BURGERS — NON-VEG
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_nonveg, 'Chicken Patty Burger', 'Served with a chicken patty.', 169, 'NON_VEG', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_nonveg AND name = 'Chicken Patty Burger');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_nonveg, 'Crispy Chicken Burger', 'Crispy chicken between two buns.', 149, 'NON_VEG', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_nonveg AND name = 'Crispy Chicken Burger');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_burgers_nonveg, 'Double Patty Burger', 'Double patty with vegetables and cheese slices.', 175, 'NON_VEG', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_burgers_nonveg AND name = 'Double Patty Burger');

  -- ----------------------------------------------------------
  -- CATEGORY 13: HOT COFFEE
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Espresso', 'Rich single/double shot of concentrated specialty coffee.', 170, 'DRINK', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Espresso');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Americano', 'Espresso diluted with hot water for a clean, bold cup.', 190, 'DRINK', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Americano');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Long Black', 'Double espresso extracted over hot water, preserving the crema.', 235, 'DRINK', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Long Black');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Cappuccino', 'Equal parts espresso, silky steamed milk and dense velvety microfoam.', 219, 'DRINK', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Cappuccino');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Cortado', 'Equal parts espresso and warm steamed milk to reduce acidity.', 230, 'DRINK', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Cortado');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Flat White', 'Smooth double espresso blended with micro-foamed steamed milk.', 240, 'DRINK', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Flat White');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Latte', 'Mild and creamy espresso with steamed milk and a thin foam cap.', 220, 'DRINK', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Spanish Latte', 'Espresso balanced with steamed milk and sweetened condensed milk.', 242, 'DRINK', 8
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Spanish Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Vanilla Latte', 'Classic latte sweetened with delicate Madagascar vanilla.', 280, 'DRINK', 9
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Vanilla Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Hazelnut Latte', 'Rich espresso and steamed milk infused with roasted hazelnut.', 280, 'DRINK', 10
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Hazelnut Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Mocha', 'Espresso combined with artisanal dark chocolate and steamed milk.', 280, 'DRINK', 11
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Mocha');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_hot_coffee, 'Vietnamese Latte', 'Intense dark roast coffee combined with sweetened condensed milk.', 245, 'DRINK', 12
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_hot_coffee AND name = 'Vietnamese Latte');

  -- ----------------------------------------------------------
  -- CATEGORY 14: ICED COFFEE
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Americano', 'Chilled espresso poured over ice and cold filtered water.', 220, 'DRINK', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Americano');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Cappuccino', 'Chilled espresso shaken with cold milk and topped with creamy foam.', 250, 'DRINK', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Cappuccino');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Long Black', 'Bold iced double espresso over chilled water.', 235, 'DRINK', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Long Black');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Latte', 'Refreshing iced espresso gently mixed with cold milk.', 220, 'DRINK', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Hazelnut Latte', 'Chilled latte layered with roasted hazelnut syrup.', 245, 'DRINK', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Hazelnut Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Vanilla Latte', 'Iced latte flavored with sweet vanilla bean.', 280, 'DRINK', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Vanilla Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Spanish Latte', 'Chilled espresso and milk with sweet condensed milk over ice.', 240, 'DRINK', 7
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Spanish Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Cranberry Espresso', 'Sparkling tart cranberry juice crowned with a bold espresso float.', 235, 'DRINK', 8
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Cranberry Espresso');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Classic Cold Coffee', 'Rich blended cold coffee with milk and sugar, cafe style.', 220, 'DRINK', 9
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Classic Cold Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Caramel Macchiato', 'Cold milk marked with rich espresso and salted caramel drizzle.', 240, 'DRINK', 10
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Caramel Macchiato');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Iced Latte', 'Crisp iced espresso and fresh whole milk.', 220, 'DRINK', 11
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Iced Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Mocha Coffee', 'Chilled espresso, dark chocolate sauce and cold milk over ice.', 245, 'DRINK', 12
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Mocha Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Vietnamese Latte', 'Iced robusta brew layered over thick sweetened condensed milk.', 240, 'DRINK', 13
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Vietnamese Latte');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Orange Espresso', 'Zesty fresh orange citrus paired with an aromatic espresso shot.', 235, 'DRINK', 14
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Orange Espresso');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_iced_coffee, 'Pineapple Espresso', 'Tropical sweet pineapple juice topped with chilled espresso.', 229, 'DRINK', 15
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_iced_coffee AND name = 'Pineapple Espresso');

  -- ----------------------------------------------------------
  -- CATEGORY 15: COFFEE EXTRAS
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_coffee_extras, 'Whipped Cream', 'Fluffy sweet whipped cream topping.', 39, 'OTHER', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_coffee_extras AND name = 'Whipped Cream');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_coffee_extras, 'Oat Milk', 'Dairy-free creamy oat milk substitution.', 69, 'OTHER', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_coffee_extras AND name = 'Oat Milk');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_coffee_extras, 'Almond Milk', 'Silky roasted almond milk substitution.', 79, 'OTHER', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_coffee_extras AND name = 'Almond Milk');

  -- ----------------------------------------------------------
  -- CATEGORY 16: MILKSHAKES
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_milkshakes, 'Oreo Shake', 'Thick creamy milkshake blended with Oreo cookies and chocolate.', 149, 'DRINK', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_milkshakes AND name = 'Oreo Shake');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_milkshakes, 'Banana Shake', 'Smooth milkshake made with sweet ripe bananas and fresh cream.', 150, 'DRINK', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_milkshakes AND name = 'Banana Shake');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_milkshakes, 'Hazelnut Shake', 'Decadent shake blended with roasted hazelnut paste.', 169, 'DRINK', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_milkshakes AND name = 'Hazelnut Shake');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_milkshakes, 'Pistachio Shake', 'Nutty rich milkshake flavored with real green pistachios.', 155, 'DRINK', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_milkshakes AND name = 'Pistachio Shake');

  -- ----------------------------------------------------------
  -- CATEGORY 17: SIGNATURE COFFEE DRINKS
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Salted Vietnamese Iced Coffee', 'Traditional Vietnamese coffee topped with salted cream cheese foam.', 269, 'DRINK', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Salted Vietnamese Iced Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Hazelnut Cream Iced Coffee', 'Iced coffee layered with silky whipped hazelnut cream.', 279, 'DRINK', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Hazelnut Cream Iced Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Biscoff Cream Iced Frappe', 'Blended iced coffee loaded with spiced Lotus Biscoff biscuit and cream.', 275, 'DRINK', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Biscoff Cream Iced Frappe');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Mocha Cream Iced Coffee', 'Chilled mocha with dark chocolate fudge and velvety cream head.', 279, 'DRINK', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Mocha Cream Iced Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Pistachio Cream Iced Coffee', 'Chilled espresso crowned with delicate sweet pistachio foam.', 277, 'DRINK', 5
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Pistachio Cream Iced Coffee');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_signature_drinks, 'Hot Chocolate', 'Rich molten Belgian chocolate blended with warm whole milk.', 250, 'DRINK', 6
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_signature_drinks AND name = 'Hot Chocolate');

  -- ----------------------------------------------------------
  -- CATEGORY 18: MOJITOS
  -- ----------------------------------------------------------
  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_mojitos, 'Blueberry Mojito', 'Muddled fresh blueberries, mint leaves, lime juice and sparkling soda.', 175, 'DRINK', 1
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_mojitos AND name = 'Blueberry Mojito');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_mojitos, 'Mint Mojito', 'Classic rooftop refresher with crushed mint sprigs, lime wedges and soda.', 169, 'DRINK', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_mojitos AND name = 'Mint Mojito');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_mojitos, 'Strawberry Mojito', 'Sweet crushed strawberries infused with garden mint and fizzy soda.', 165, 'DRINK', 3
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_mojitos AND name = 'Strawberry Mojito');

  INSERT INTO public.menu_items (category_id, name, description, price, food_type, display_order)
  SELECT v_cat_mojitos, 'Blue Curacao Mojito', 'Vibrant citrus blue curacao with fresh mint, lime and sparkling soda.', 180, 'DRINK', 4
  WHERE NOT EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = v_cat_mojitos AND name = 'Blue Curacao Mojito');

END $$;
