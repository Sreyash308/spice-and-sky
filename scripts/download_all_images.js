/**
 * Spice & Sky Rooftop Cafe - Menu Image Asset Pipeline
 * Downloads, optimizes and verifies all 105 menu item images + 6 category fallbacks.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MENU_ITEMS_MAPPING = [
  // --- Rice Bowls (9 items) ---
  { id: "e10d29ae-4c6e-44cb-bf63-ebbf6e8557b7", name: "Veg Fried Rice", category: "Rice Bowls", food_type: "VEG", slug: "veg-fried-rice", photoId: "photo-1603133872878-684f208fb84b" },
  { id: "88bfdc0e-1144-46fd-abf6-bdf8ff6c406b", name: "Veg Schezwan Fried Rice", category: "Rice Bowls", food_type: "VEG", slug: "veg-schezwan-fried-rice", photoId: "photo-1645177628172-a94c1f96e6db" },
  { id: "e17a3a60-a436-4d04-b903-7cb57a536967", name: "Brown Garlic Fried Rice", category: "Rice Bowls", food_type: "VEG", slug: "brown-garlic-fried-rice", photoId: "photo-1596797038530-2c107229654b" },
  { id: "6fe32194-c31e-4d52-8613-35bd9feac6b6", name: "Schezwan Veg Fried Rice", category: "Rice Bowls", food_type: "VEG", slug: "schezwan-veg-fried-rice", photoId: "photo-1512058564366-18510be2db19" },
  { id: "cf196038-548b-4aea-b039-69017379e1fe", name: "Egg Fried Rice", category: "Rice Bowls", food_type: "NON_VEG", slug: "egg-fried-rice", photoId: "photo-1563379091339-03b21ab4a4f8" },
  { id: "54d164f8-3209-4fe4-9a46-98946935d1b4", name: "Chicken Fried Rice", category: "Rice Bowls", food_type: "NON_VEG", slug: "chicken-fried-rice", photoId: "photo-1564834724105-918b73d1b9e0" },
  { id: "f528b05f-9853-456a-abe6-53d9b35fe66c", name: "Schezwan Egg Fried Rice", category: "Rice Bowls", food_type: "NON_VEG", slug: "schezwan-egg-fried-rice", photoId: "photo-1546069901-ba9599a7e63c" },
  { id: "850fb759-92a6-4f01-9b70-2a9c90603934", name: "Schezwan Chicken Fried Rice", category: "Rice Bowls", food_type: "NON_VEG", slug: "schezwan-chicken-fried-rice", photoId: "photo-1585032226651-759b368d7246" },
  { id: "086d39af-e4a7-4004-bae7-3b6ff80de9d0", name: "Schezwan Mix Fried Rice", category: "Rice Bowls", food_type: "NON_VEG", slug: "schezwan-mix-fried-rice", photoId: "photo-1626082927389-6cd097cdc6ec" },

  // --- Starters — Veg (7 items) ---
  { id: "c460f38a-02be-49dc-8a62-636402fc7ee0", name: "Chilli Potato", category: "Starters — Veg", food_type: "VEG", slug: "chilli-potato", photoId: "photo-1576107232684-1279f3908594" },
  { id: "983ea92d-9473-4537-b71a-e8d120a11c0f", name: "Chilli Paneer", category: "Starters — Veg", food_type: "VEG", slug: "chilli-paneer", photoId: "photo-1567188040759-fb8a883dc6d8" },
  { id: "374f39c2-db4f-4d56-821f-cb707bbd5e27", name: "Jalapeño Stick", category: "Starters — Veg", food_type: "VEG", slug: "jalapeno-stick", photoId: "photo-1534422298391-e4f8c172dddb" },
  { id: "9049a4dc-3392-4f30-8025-a1851e309062", name: "Paneer Popcorn", category: "Starters — Veg", food_type: "VEG", slug: "paneer-popcorn", photoId: "photo-1565557623262-b51c2513a641" },
  { id: "b98d214f-3c27-4ba9-a4ce-42a3c08fc8ff", name: "Paneer 65", category: "Starters — Veg", food_type: "VEG", slug: "paneer-65", photoId: "photo-1589301760014-d929f3979dbc" },
  { id: "64fc08b5-cc41-4722-b882-057d8102e700", name: "Loaded Fries", category: "Starters — Veg", food_type: "VEG", slug: "loaded-fries-veg", photoId: "photo-1585109649139-366815a0d713" },
  { id: "aa589809-9afa-41da-93f8-f4a44a21f9e0", name: "Broccoli Cheesey Stick", category: "Starters — Veg", food_type: "VEG", slug: "broccoli-cheesey-stick", photoId: "photo-1540420773420-3366772f4999" },

  // --- Starters — Non-Veg (7 items) ---
  { id: "7a256247-c035-467f-94ad-73775199859f", name: "Chilli Chicken", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "chilli-chicken", photoId: "photo-1562967914-608f82629710" },
  { id: "3541ce1f-ca00-4b0d-9b16-621f37e4ba39", name: "Lemon Garlic Chicken", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "lemon-garlic-chicken", photoId: "photo-1604908176997-125f25cc6f3d" },
  { id: "f2c58908-6228-4ef6-ac15-1811fa133db5", name: "Honey Chicken", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "honey-chicken", photoId: "photo-1527477245898-dda3c33f7690" },
  { id: "fff2bd68-39c0-499e-8637-2bd8b2511843", name: "Chicken Loaded Fries", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "chicken-loaded-fries", photoId: "photo-1586190848861-99aa4a171e90" },
  { id: "1b072f47-a00e-4b06-b660-fabafa968108", name: "Spice & Sky Special Popcorn Chicken", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "spice-sky-special-popcorn-chicken", photoId: "photo-1569058242253-92a9c755a0ec" },
  { id: "9f852660-568d-470a-91f3-91e0852b97fa", name: "Chicken Popcorn", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "chicken-popcorn", photoId: "photo-1626082927389-6cd097cdc6ec" },
  { id: "bb768e2e-2a91-4b43-bfa0-856bfd77d5b0", name: "Crispy Chicken", category: "Starters — Non-Veg", food_type: "NON_VEG", slug: "crispy-chicken", photoId: "photo-1587593810167-a84920ea0781" },

  // --- Pizzas — Veg (5 items) ---
  { id: "7ce274a4-bc09-408c-b0ae-6b2a095ff597", name: "Classic Pizza", category: "Pizzas — Veg", food_type: "VEG", slug: "classic-pizza", photoId: "photo-1513104890138-7c749659a591" },
  { id: "ea6fc3c8-040b-4171-aa31-e1f4861614f1", name: "Basil Margherita", category: "Pizzas — Veg", food_type: "VEG", slug: "basil-margherita", photoId: "photo-1604382354936-07c5d9983bd3" },
  { id: "a43e49e2-ca9b-449e-bc43-24765d7ae227", name: "Vegetable Pizza", category: "Pizzas — Veg", food_type: "VEG", slug: "vegetable-pizza", photoId: "photo-1574071318508-1cdbab80d002" },
  { id: "6f65a45e-d342-4bcb-8917-ea7f5413f6fb", name: "Paneer Pizza", category: "Pizzas — Veg", food_type: "VEG", slug: "paneer-pizza", photoId: "photo-1565299624946-b28f40a0ae38" },
  { id: "56651237-73f6-4152-8ab3-b2b8be1d8f1a", name: "Mushroom Pizza", category: "Pizzas — Veg", food_type: "VEG", slug: "mushroom-pizza", photoId: "photo-1506354666786-959d6d497f1a" },

  // --- Pizzas — Non-Veg (5 items) ---
  { id: "1b31a1dc-b118-47fb-9eb5-8e390c50b571", name: "Chicken Pepperoni Pizza", category: "Pizzas — Non-Veg", food_type: "NON_VEG", slug: "chicken-pepperoni-pizza", photoId: "photo-1628840042765-356cda07504e" },
  { id: "e05c866e-db1b-4f51-b0be-bbab94b4bdf9", name: "Smoked Chicken Pizza", category: "Pizzas — Non-Veg", food_type: "NON_VEG", slug: "smoked-chicken-pizza", photoId: "photo-1534308983496-4fabb1a015ee" },
  { id: "9812b1d6-d306-4ba2-bd17-914979e2a7e7", name: "Chicken Tikka Pizza", category: "Pizzas — Non-Veg", food_type: "NON_VEG", slug: "chicken-tikka-pizza", photoId: "photo-1593560708920-61dd98c46a4e" },
  { id: "cf3011b5-9478-4ff5-95ce-a0d335ca1e7b", name: "Barbecue Chicken Pizza", category: "Pizzas — Non-Veg", food_type: "NON_VEG", slug: "barbecue-chicken-pizza", photoId: "photo-1565299585323-38d6b0865b47" },
  { id: "464840e8-fd79-4ed3-9c93-ffe15645a8ac", name: "Basil Chicken Pizza", category: "Pizzas — Non-Veg", food_type: "NON_VEG", slug: "basil-chicken-pizza", photoId: "photo-1571407970349-bc81e7e96d47" },

  // --- Pastas — Veg (4 items) ---
  { id: "f24ee38f-a7fe-4fa6-84ec-6b19a1db6d1c", name: "White Sauce Pasta", category: "Pastas — Veg", food_type: "VEG", slug: "white-sauce-pasta-veg", photoId: "photo-1645112411341-6c4fd023714a" },
  { id: "2eb4c90e-b851-4ae9-a038-a73c1d457635", name: "Pesto Penne Pasta", category: "Pastas — Veg", food_type: "VEG", slug: "pesto-penne-pasta-veg", photoId: "photo-1551183053-bf91a1d81141" },
  { id: "28e75db7-30ae-4e31-8ae4-07d0f4d38c11", name: "Pink Sauce Pasta", category: "Pastas — Veg", food_type: "VEG", slug: "pink-sauce-pasta-veg", photoId: "photo-1621996346565-e3d5d628169e" },
  { id: "53b0e27a-e97c-4eff-8977-bd355d374fb1", name: "Aglio-Olio Pasta", category: "Pastas — Veg", food_type: "VEG", slug: "aglio-olio-pasta-veg", photoId: "photo-1608897013039-887f21d8c804" },

  // --- Pastas — Non-Veg (5 items) ---
  { id: "0d075678-b118-47ee-9975-d16c90b0c678", name: "White Sauce Pasta", category: "Pastas — Non-Veg", food_type: "NON_VEG", slug: "white-sauce-pasta-nonveg", photoId: "photo-1633337474565-12c293774883" },
  { id: "a7620253-ab01-49e0-8263-8ef439c2c621", name: "Pesto Penne Pasta", category: "Pastas — Non-Veg", food_type: "NON_VEG", slug: "pesto-penne-pasta-nonveg", photoId: "photo-1556761223-4c4282c73f77" },
  { id: "6c2438b4-8ae9-42b7-83eb-56832db44d18", name: "Pink Sauce Pasta", category: "Pastas — Non-Veg", food_type: "NON_VEG", slug: "pink-sauce-pasta-nonveg", photoId: "photo-1563379926898-05f4575a45d8" },
  { id: "db9a778b-e3e2-4766-8cda-b8ec8e4e2ffb", name: "Aglio-Olio Pasta", category: "Pastas — Non-Veg", food_type: "NON_VEG", slug: "aglio-olio-pasta-nonveg", photoId: "photo-1546549032-9571cd6b27df" },
  { id: "6de3d910-859e-4d8f-984f-76979ed5ba37", name: "Butter Chicken Sauce Pasta", category: "Pastas — Non-Veg", food_type: "NON_VEG", slug: "butter-chicken-sauce-pasta", photoId: "photo-1589301760014-d929f3979dbc" },

  // --- Burgers — Veg (3 items) ---
  { id: "73f0bc83-bc2a-4384-9ff9-01121d2345d1", name: "Veg Patty Burger", category: "Burgers — Veg", food_type: "VEG", slug: "veg-patty-burger", photoId: "photo-1585238342024-78d387f4a707" },
  { id: "0d54fa57-25e2-4fec-a3ae-94a211993478", name: "Crispy Paneer Burger", category: "Burgers — Veg", food_type: "VEG", slug: "crispy-paneer-burger", photoId: "photo-1550547660-d9450f859349" },
  { id: "3051bc73-d023-44bb-ba52-404f8615ef54", name: "Double Patty Burger", category: "Burgers — Veg", food_type: "VEG", slug: "double-patty-burger-veg", photoId: "photo-1520072959219-c595dc870360" },

  // --- Burgers — Non-Veg (3 items) ---
  { id: "0e2d53ef-1e24-4f01-92be-6c19a9dbd489", name: "Chicken Patty Burger", category: "Burgers — Non-Veg", food_type: "NON_VEG", slug: "chicken-patty-burger", photoId: "photo-1568901346375-23c9450c58cd" },
  { id: "f26c0683-bc2b-4573-b295-88a44d18ef62", name: "Crispy Chicken Burger", category: "Burgers — Non-Veg", food_type: "NON_VEG", slug: "crispy-chicken-burger", photoId: "photo-1625813506062-0aeb1d7a094b" },
  { id: "b24479e0-ba32-47df-88c9-041d8e1763ef", name: "Double Patty Burger", category: "Burgers — Non-Veg", food_type: "NON_VEG", slug: "double-patty-burger-nonveg", photoId: "photo-1586190848861-99aa4a171e90" },

  // --- French Fries (4 items) ---
  { id: "986ec3cb-a9af-4d5c-9c98-1e428df1234a", name: "Peri Peri Fries", category: "French Fries", food_type: "VEG", slug: "peri-peri-fries", photoId: "photo-1576107232684-1279f3908594" },
  { id: "28e1d532-6a45-42bb-91a9-d6e401995874", name: "Classic Fries", category: "French Fries", food_type: "VEG", slug: "classic-fries", photoId: "photo-1573080496219-bb080dd4f877" },
  { id: "39487c06-da24-44b2-a42e-a5796df104d8", name: "Spice & Sky Special Fries", category: "French Fries", food_type: "VEG", slug: "spice-sky-special-fries", photoId: "photo-1630384060421-cb20d0e0649d" },
  { id: "80d3111c-46f8-4451-9f31-f80c0b3186b1", name: "Cheesy Fries", category: "French Fries", food_type: "VEG", slug: "cheesy-fries", photoId: "photo-1585109649139-366815a0d713" },

  // --- Hot Coffee (12 items) ---
  { id: "ef1295b7-7e61-45a8-9289-4bc783c129e0", name: "Espresso", category: "Hot Coffee", food_type: "DRINK", slug: "espresso-hot", photoId: "photo-1510591509098-f4fdc6d0ff04" },
  { id: "46f82725-d918-4a99-b1d5-2e680a79cfc4", name: "Americano", category: "Hot Coffee", food_type: "DRINK", slug: "americano-hot", photoId: "photo-1514432324607-a09d9b4aefdd" },
  { id: "2f32a768-45ee-4613-bc70-49ec5dc1a498", name: "Long Black", category: "Hot Coffee", food_type: "DRINK", slug: "long-black-hot", photoId: "photo-1509042239860-f550ce710b93" },
  { id: "783e29eb-5c70-48f3-a286-8b3e51a93a41", name: "Cappuccino", category: "Hot Coffee", food_type: "DRINK", slug: "cappuccino-hot", photoId: "photo-1572442388796-11668a67e53d" },
  { id: "1b1f1d12-78a2-4af0-8294-e5fbc000f4e7", name: "Cortado", category: "Hot Coffee", food_type: "DRINK", slug: "cortado-hot", photoId: "photo-1517256064527-09c73fc73e38" },
  { id: "706c0715-c224-47bb-b55f-32af9168142f", name: "Flat White", category: "Hot Coffee", food_type: "DRINK", slug: "flat-white-hot", photoId: "photo-1577968897966-3d4325b36b61" },
  { id: "5805654d-4289-4016-8d64-df70f0c17f35", name: "Latte", category: "Hot Coffee", food_type: "DRINK", slug: "latte-hot", photoId: "photo-1561047029-3000c68339ca" },
  { id: "9b5e5a8d-508b-4d8e-a7e0-8be9cc7a2904", name: "Spanish Latte", category: "Hot Coffee", food_type: "DRINK", slug: "spanish-latte-hot", photoId: "photo-1541167760496-1628856ab772" },
  { id: "69b10607-2821-4e82-b8f6-3452423ff625", name: "Vanilla Latte", category: "Hot Coffee", food_type: "DRINK", slug: "vanilla-latte-hot", photoId: "photo-1570968915860-54d5c301fa9f" },
  { id: "fedcc046-63f4-44a2-9c50-ce3b16407585", name: "Hazelnut Latte", category: "Hot Coffee", food_type: "DRINK", slug: "hazelnut-latte-hot", photoId: "photo-1534687941688-6a1ae67c793d" },
  { id: "4efee9e1-bc1a-478c-a4b6-4188f709ad15", name: "Mocha", category: "Hot Coffee", food_type: "DRINK", slug: "mocha-hot", photoId: "photo-1578314675249-a6910f80cc4e" },
  { id: "5dfc5fa7-3bc0-484f-8362-c70be78c548a", name: "Vietnamese Latte", category: "Hot Coffee", food_type: "DRINK", slug: "vietnamese-latte-hot", photoId: "photo-1517701550927-30cf4ba1dba5" },

  // --- Iced Coffee (15 items) ---
  { id: "4e963bc2-ef08-4171-8bc4-95d11823cd02", name: "Americano", category: "Iced Coffee", food_type: "DRINK", slug: "americano-iced", photoId: "photo-1517701604599-bb29b565090c" },
  { id: "e10a7479-da01-4475-8025-a1c6a6de4df2", name: "Cappuccino", category: "Iced Coffee", food_type: "DRINK", slug: "cappuccino-iced", photoId: "photo-1461023058943-07fcbe16d735" },
  { id: "6c20573e-3245-4c07-b3ab-1296c05d76d4", name: "Long Black", category: "Iced Coffee", food_type: "DRINK", slug: "long-black-iced", photoId: "photo-1556742521-971352c40f99" },
  { id: "32e8e354-b318-4ef9-9458-8d3d53096db0", name: "Latte", category: "Iced Coffee", food_type: "DRINK", slug: "latte-iced", photoId: "photo-1517701550927-30cf4ba1dba5" },
  { id: "73ce3f00-0ff0-4ec3-bd9d-902ca9d8a010", name: "Hazelnut Latte", category: "Iced Coffee", food_type: "DRINK", slug: "hazelnut-latte-iced", photoId: "photo-1578314675249-a6910f80cc4e" },
  { id: "b9d58b12-1315-4f69-bbf5-5d30959cc845", name: "Vanilla Latte", category: "Iced Coffee", food_type: "DRINK", slug: "vanilla-latte-iced", photoId: "photo-1553909489-cd47e0907980" },
  { id: "01173ce5-a553-4213-8f97-9a019c81e9f7", name: "Spanish Latte", category: "Iced Coffee", food_type: "DRINK", slug: "spanish-latte-iced", photoId: "photo-1572442388796-11668a67e53d" },
  { id: "e33cceab-4157-49fe-bd0f-c1db8cef15a4", name: "Cranberry Espresso", category: "Iced Coffee", food_type: "DRINK", slug: "cranberry-espresso", photoId: "photo-1513558161293-cdaf765ed2fd" },
  { id: "4ab16987-a980-4329-87db-9e2b9b238a13", name: "Classic Cold Coffee", category: "Iced Coffee", food_type: "DRINK", slug: "classic-cold-coffee", photoId: "photo-1517701604599-bb29b565090c" },
  { id: "10cd7b59-e8f9-4f59-bd29-a39bcc14aeae", name: "Caramel Macchiato", category: "Iced Coffee", food_type: "DRINK", slug: "caramel-macchiato", photoId: "photo-1485808191679-5f86510681a2" },
  { id: "6962baf8-54c9-4e91-91db-5ea3d9712c7b", name: "Iced Latte", category: "Iced Coffee", food_type: "DRINK", slug: "iced-latte-drink", photoId: "photo-1521302080334-4bebac2763a6" },
  { id: "b4da3fd5-99ba-42f8-8677-0d4f53fca3dc", name: "Mocha Coffee", category: "Iced Coffee", food_type: "DRINK", slug: "mocha-coffee-iced", photoId: "photo-1578314675249-a6910f80cc4e" },
  { id: "e994bd62-d104-49f6-a9bc-51cf6ed1185c", name: "Vietnamese Latte", category: "Iced Coffee", food_type: "DRINK", slug: "vietnamese-latte-iced", photoId: "photo-1517701550927-30cf4ba1dba5" },
  { id: "5fc58ccb-7a39-4786-b2f6-69cdb5f67fc5", name: "Orange Espresso", category: "Iced Coffee", food_type: "DRINK", slug: "orange-espresso", photoId: "photo-1551024709-8f23befc6f87" },
  { id: "9477b2af-d333-4aac-8c0e-21fdd0eb3257", name: "Pineapple Espresso", category: "Iced Coffee", food_type: "DRINK", slug: "pineapple-espresso", photoId: "photo-1513558161293-cdaf765ed2fd" },

  // --- Signature Coffee Drinks (6 items) ---
  { id: "04bc53cb-e80b-4171-8975-d148e6c406b2", name: "Salted Vietnamese Iced Coffee", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "salted-vietnamese-iced-coffee", photoId: "photo-1514432324607-a09d9b4aefdd" },
  { id: "0a83cb2b-75e1-4560-84a2-1147a46de552", name: "Hazelnut Cream Iced Coffee", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "hazelnut-cream-iced-coffee", photoId: "photo-1461023058943-07fcbe16d735" },
  { id: "46d0a79c-c045-42cb-b1b7-d1838634e402", name: "Biscoff Cream Iced Frappe", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "biscoff-cream-iced-frappe", photoId: "photo-1572490122747-3968b75cc699" },
  { id: "c87a543b-31de-4416-a795-01e4db627192", name: "Mocha Cream Iced Coffee", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "mocha-cream-iced-coffee", photoId: "photo-1578314675249-a6910f80cc4e" },
  { id: "1cc0692d-4eae-440d-b37d-dc786a36ffb6", name: "Pistachio Cream Iced Coffee", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "pistachio-cream-iced-coffee", photoId: "photo-1553909489-cd47e0907980" },
  { id: "f7243478-adbc-4e70-b0fe-2da6daa56213", name: "Hot Chocolate", category: "Signature Coffee Drinks", food_type: "DRINK", slug: "hot-chocolate", photoId: "photo-1542990253-0d0f5be5f0ed" },

  // --- Milkshakes (4 items) ---
  { id: "d6a0149d-3c24-49ab-b565-d018ef62c415", name: "Oreo Shake", category: "Milkshakes", food_type: "DRINK", slug: "oreo-shake", photoId: "photo-1572490122747-3968b75cc699" },
  { id: "48206cd2-4e67-4632-9cb7-1428f53a4794", name: "Banana Shake", category: "Milkshakes", food_type: "DRINK", slug: "banana-shake", photoId: "photo-1553787499-6f9133860278" },
  { id: "28e75db7-30ae-4e31-8ae4-07d0f4d38c12", name: "Hazelnut Shake", category: "Milkshakes", food_type: "DRINK", slug: "hazelnut-shake", photoId: "photo-1579954115545-a95591f28bfc" },
  { id: "f0da6e5d-2c51-479a-bad8-ac76ffa924c7", name: "Pistachio Shake", category: "Milkshakes", food_type: "DRINK", slug: "pistachio-shake", photoId: "photo-1588767764782-b7b51e4431f9" },

  // --- Mojitos (4 items) ---
  { id: "1c28fa46-5b32-47d0-a892-e461a29cd678", name: "Blueberry Mojito", category: "Mojitos", food_type: "DRINK", slug: "blueberry-mojito", photoId: "photo-1551024709-8f23befc6f87" },
  { id: "3051b8c2-404f-4d32-9fb9-12e09ab43589", name: "Mint Mojito", category: "Mojitos", food_type: "DRINK", slug: "mint-mojito", photoId: "photo-1513558161293-cdaf765ed2fd" },
  { id: "348c08db-4e1b-4171-8bc3-04a29cf65421", name: "Strawberry Mojito", category: "Mojitos", food_type: "DRINK", slug: "strawberry-mojito", photoId: "photo-1546173159-315724a31696" },
  { id: "e8793f4a-dd42-45f0-a514-70516d9441f3", name: "Blue Curacao Mojito", category: "Mojitos", food_type: "DRINK", slug: "blue-curacao-mojito", photoId: "photo-1551024709-8f23befc6f87" },

  // --- Specials (3 items) ---
  { id: "53eb49dc-3240-4c12-9c17-4ef853a12904", name: "Grilled Chicken with Brown Sauce", category: "Specials", food_type: "NON_VEG", slug: "grilled-chicken-with-brown-sauce", photoId: "photo-1532550907401-a500c9a57435" },
  { id: "d24cb5e0-38ae-41d3-a417-0e6945a27891", name: "Grilled Chicken with Lemon Butter Sauce", category: "Specials", food_type: "NON_VEG", slug: "grilled-chicken-with-lemon-butter-sauce", photoId: "photo-1604908176997-125f25cc6f3d" },
  { id: "89c0253b-e174-45fb-8263-8ef44199c432", name: "Lasagne", category: "Specials", food_type: "NON_VEG", slug: "lasagne", photoId: "photo-1574894709920-11b28e7367e3" },

  // --- Extras / Sides (6 items) ---
  { id: "049cb2e0-da01-4475-8025-a1851e309063", name: "Water Bottle", category: "Extras / Sides", food_type: "DRINK", slug: "water-bottle", photoId: "photo-1523362628745-0c100150b504" },
  { id: "1b08c4e0-7e61-45a8-9289-4bc783c129e1", name: "Cheddar Cheese Slices", category: "Extras / Sides", food_type: "VEG", slug: "cheddar-cheese-slices", photoId: "photo-1618164436241-4473940d1f5c" },
  { id: "7a256247-c035-467f-94ad-73775199859e", name: "Pasta Cheese Garlic Bread", category: "Extras / Sides", food_type: "VEG", slug: "pasta-cheese-garlic-bread", photoId: "photo-1573140247632-f8fd74997d5c" },
  { id: "f2c58908-6228-4ef6-ac15-1811fa133db6", name: "Tossed Avocado Toss", category: "Extras / Sides", food_type: "VEG", slug: "tossed-avocado-toss", photoId: "photo-1540420773420-3366772f4999" },
  { id: "4e23e79b-8e6a-40f7-803e-ce9d9c29b3bf", name: "Avocado Mango Toss", category: "Extras / Sides", food_type: "VEG", slug: "avocado-mango-toss", photoId: "photo-1546069901-ba9599a7e63c" },
  { id: "376848b5-70a3-450e-8922-488d35cbbef5", name: "Avocado Strawberry Toss", category: "Extras / Sides", food_type: "VEG", slug: "avocado-strawberry-toss", photoId: "photo-1512621776951-a57141f2eefd" },

  // --- Coffee Extras (3 items) ---
  { id: "374f39c2-db4f-4d56-821f-cb707bbd5e28", name: "Whipped Cream", category: "Coffee Extras", food_type: "OTHER", slug: "whipped-cream", photoId: "photo-1587314168485-3236d6710814" },
  { id: "9049a4dc-3392-4f30-8025-a1851e309063", name: "Oat Milk", category: "Coffee Extras", food_type: "OTHER", slug: "oat-milk", photoId: "photo-1550583724-b2692b85b150" },
  { id: "b98d214f-3c27-4ba9-a4ce-42a3c08fc8fe", name: "Almond Milk", category: "Coffee Extras", food_type: "OTHER", slug: "almond-milk", photoId: "photo-1568651318250-e763b65261bb" }
];

const FALLBACK_MAPPING = [
  { slug: "fallbacks/food", photoId: "photo-1546069901-ba9599a7e63c" },
  { slug: "fallbacks/pizza", photoId: "photo-1604382354936-07c5d9983bd3" },
  { slug: "fallbacks/pasta", photoId: "photo-1621996346565-e3d5d628169e" },
  { slug: "fallbacks/coffee", photoId: "photo-1572442388796-11668a67e53d" },
  { slug: "fallbacks/drink", photoId: "photo-1551024709-8f23befc6f87" },
  { slug: "fallbacks/burger", photoId: "photo-1568901346375-23c9450c58cd" }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // If already exists and valid size, skip
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      return resolve({ cached: true, size: fs.statSync(dest).size });
    }

    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(dest);
          resolve({ cached: false, size: stats.size });
        });
      } else if (res.statusCode === 301 || res.statusCode === 302) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
    }).on('error', err => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log(`🚀 Starting Spice & Sky Image Pipeline...`);
  console.log(`Total Menu Items: ${MENU_ITEMS_MAPPING.length}`);
  console.log(`Total Fallbacks: ${FALLBACK_MAPPING.length}`);

  const baseDir = path.join(__dirname, '..', 'public', 'images', 'menu');
  fs.mkdirSync(path.join(baseDir, 'fallbacks'), { recursive: true });

  const audit = [];
  let successCount = 0;
  let failCount = 0;

  // Process Fallbacks First
  for (const fb of FALLBACK_MAPPING) {
    const dest = path.join(baseDir, `${fb.slug}.webp`);
    const url = `https://images.unsplash.com/${fb.photoId}?auto=format&fit=crop&w=450&h=450&q=80&fm=webp`;
    try {
      const res = await downloadFile(url, dest);
      console.log(`🛡️ Fallback: ${fb.slug}.webp (${Math.round(res.size / 1024)} KB)`);
    } catch (err) {
      console.error(`❌ Fallback error for ${fb.slug}:`, err.message);
    }
  }

  // Process 105 Items
  for (let i = 0; i < MENU_ITEMS_MAPPING.length; i++) {
    const item = MENU_ITEMS_MAPPING[i];
    const dest = path.join(baseDir, `${item.slug}.webp`);
    const url = `https://images.unsplash.com/${item.photoId}?auto=format&fit=crop&w=450&h=450&q=80&fm=webp`;

    try {
      const res = await downloadFile(url, dest);
      successCount++;
      audit.push({
        id: item.id,
        name: item.name,
        category: item.category,
        food_type: item.food_type,
        slug: item.slug,
        image_url: `/images/menu/${item.slug}.webp`,
        file_size_kb: Math.round(res.size / 1024),
        status: 'VERIFIED'
      });
      if ((i + 1) % 15 === 0 || i === MENU_ITEMS_MAPPING.length - 1) {
        console.log(`📸 Progress: ${i + 1}/${MENU_ITEMS_MAPPING.length} items processed`);
      }
    } catch (err) {
      failCount++;
      console.error(`❌ Error downloading ${item.name} (${item.slug}):`, err.message);
      audit.push({
        id: item.id,
        name: item.name,
        category: item.category,
        food_type: item.food_type,
        slug: item.slug,
        image_url: `/images/menu/${item.slug}.webp`,
        error: err.message,
        status: 'FAILED'
      });
    }
  }

  fs.writeFileSync(path.join(__dirname, 'image_audit.json'), JSON.stringify(audit, null, 2));
  console.log(`\n🎉 Image Pipeline Finished!`);
  console.log(`✅ Success: ${successCount} items`);
  console.log(`❌ Failures: ${failCount}`);
  console.log(`📋 Audit written to scripts/image_audit.json`);
}

main().catch(console.error);
