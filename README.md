# 🌆 Spice & Sky Rooftop Cafe

> **"Rooftop Vibes, Bold Flavors & Cozy Brews"**  
> Complete Production System: Digital QR Customer Menu &bull; Waiter POS Terminal &bull; Owner / Admin Business Intelligence

---

## 📖 System Overview

**Spice & Sky Rooftop Cafe** is built exclusively around the cafe's physical service model:
- **Customers do NOT order food online.** Customers scan a QR code placed on their table to browse the digital menu. There is zero cart, zero customer login, zero online payment, and zero customer checkout.
- **Waiters take orders physically** using the mobile-optimized Waiter POS terminal on their phones for **exactly 9 tables** (Table 1 through Table 9). The server authoritatively validates prices, generates immutable historical price snapshots, and produces clean table bills.
- **The Owner / Admin manages the restaurant** using the real-time business dashboard. The owner can track revenue, monitor live orders, analyze sales by table/category, and perform full CRUD on the menu. All price changes and availability toggles propagate instantly to both the public menu and waiter terminals via **Supabase Realtime**.

---

## 🏛️ Architecture & Routing

```
                    SPICE & SKY ROOFTOP CAFE
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
   PUBLIC MENU            WAITER POS            ADMIN DASHBOARD
     (/menu)            (/waiter/login)         (/admin/login)
  • Mobile-First QR      • 9 Tables Only         • Live Revenue & Orders
  • Read-Only Catalog    • Quick Touch POS       • Table Sales Breakdown
  • Veg/Non-Veg Badges   • Historical Snapshot   • Menu Management CRUD
  • Realtime Availability• Thermal Bill Print    • Owner Verification
        |                      |                      |
        +----------------------+----------------------+
                               |
                               v
                     EXPRESS APPLICATION GATEWAY
                     (Helmet CSP + Clean Routing)
                               |
                               v
                       SUPABASE BACKEND
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
     POSTGRESQL             SUPABASE             SUPABASE
  RELATIONAL DB & RLS         AUTH               REALTIME
```

### Route Structure:
- `/` &rarr; Redirects cleanly to `/menu`
- `/menu` &rarr; **Public Customer Menu** (View-only QR code catalog)
- `/waiter/login` &rarr; Waiter Authentication Screen
- `/waiter` &rarr; **Waiter Order & Billing Terminal** (Protected POS)
- `/admin/login` &rarr; Admin Authentication Screen
- `/admin`, `/admin/orders`, `/admin/menu`, `/admin/tables`, `/admin/analytics`, `/admin/settings` &rarr; **Owner Dashboard**

---

## 💰 Non-Negotiable Billing Rule

There are:
- **NO TAXES**
- **NO GST**
- **NO SERVICE CHARGE**
- **NO CONVENIENCE FEE**
- **NO PAYMENT GATEWAY CHARGES**
- **NO HIDDEN FEES**

The bill is strictly computed server-side as:
$$\text{TOTAL} = \sum (\text{item unit price} \times \text{quantity})$$

*Example:*
- 2 &times; Cappuccino @ ₹219 = ₹438
- 1 &times; Peri Peri Fries @ ₹160 = ₹160
- **TOTAL = ₹598**

---

## 🍽️ Clean Initial Menu (18 Categories, 80+ Items)

The complete initial menu normalized from physical cafe menu cards is seeded into the database:
1. **Rice Bowls** (Veg Fried Rice, Schezwan Chicken Fried Rice, Mix Fried Rice, etc.)
2. **Extras / Sides** (Cheddar Cheese Slices, Cheesy Garlic Bread, Tossed Avocado salads)
3. **Specials** (Grilled Chicken with Brown Sauce, Lemon Butter Sauce, Lasagne)
4. **Starters &mdash; Veg** (Chilli Potato, Chilli Paneer, Jalapeño Stick, Paneer 65, Loaded Fries, Broccoli Cheesey Stick)
5. **Pizzas &mdash; Veg** with Selectable Variants (Classic, Basil Margherita, Veg Pizza, Paneer, Mushroom &bull; **6 inch** and **12 inch**)
6. **Starters &mdash; Non-Veg** (Chilli Chicken, Lemon Garlic Chicken, Popcorn Chicken, Crispy Chicken)
7. **Pizzas &mdash; Non-Veg** with Selectable Variants (Chicken Pepperoni, Smoked Chicken, Chicken Tikka, BBQ Chicken, Basil Chicken &bull; **9 inch** and **12 inch**)
8. **Pastas &mdash; Veg** (White Sauce, Pesto Penne, Pink Sauce, Aglio-Olio)
9. **Pastas &mdash; Non-Veg** (White Sauce, Pesto Penne, Pink Sauce, Aglio-Olio, Butter Chicken Sauce)
10. **French Fries** (Peri Peri, Classic, Spice & Sky Special, Cheesy)
11. **Burgers &mdash; Veg** (Veg Patty, Crispy Paneer, Double Patty)
12. **Burgers &mdash; Non-Veg** (Chicken Patty, Crispy Chicken, Double Patty)
13. **Hot Coffee** (Espresso, Americano, Long Black, Cappuccino, Flat White, Latte, Spanish Latte, Mocha, etc.)
14. **Iced Coffee** (Iced Latte, Cranberry Espresso, Classic Cold Coffee, Vietnamese Latte, Orange Espresso, etc.)
15. **Coffee Extras** (Whipped Cream, Oat Milk, Almond Milk)
16. **Milkshakes** (Oreo, Banana, Hazelnut, Pistachio)
17. **Signature Coffee Drinks** (Salted Vietnamese Iced Coffee, Biscoff Frappe, Pistachio Cream, Hot Chocolate)
18. **Mojitos** (Blueberry, Mint, Strawberry, Blue Curacao)

### Owner Verification Badges:
Items flagged from OCR with ambiguous wording (such as *Broccoli Cheesey Stick* described with shredded chicken under Veg Starters) are labeled with `NEEDS_CONFIRMATION` and display an admin verification alert so the owner can confirm the exact description without code modification.

---

## 🔒 Supabase Architecture & Setup

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=8000
NODE_ENV=development
TIMEZONE=Asia/Kolkata

# Supabase Credentials (Project Settings -> API)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: Direct PostgreSQL URI for migration runner
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### 2. Database Migrations
Execute the migration and seed scripts directly in the Supabase SQL Editor, or run:
```bash
# Run schema migration
npm run db:migrate

# Seed all 18 categories and 80+ items
npm run db:seed
```

Migration File: `supabase/migrations/20260912000000_spice_sky_schema.sql`
- Creates tables: `profiles`, `menu_categories`, `menu_items`, `menu_item_variants`, `orders`, `order_items`
- Enables Row Level Security (RLS) on all tables with granular policies for Public, Waiter, and Admin
- Adds tables to `supabase_realtime` publication with `REPLICA IDENTITY FULL`
- Implements `create_order_atomic` RPC for transactional, server-authoritative order creation and historical price snapshots

---

## ⚡ Realtime Synchronization

When an admin modifies an item (e.g. Latte ₹220 &rarr; ₹240 or marks Cappuccino unavailable):
1. PostgreSQL updates the record.
2. Supabase Realtime emits the change via WebSockets (`public-menu-changes`).
3. Both the **Public Menu** and **Waiter POS** receive the event and update prices/availability live on the customer's phone without requiring page reloads.

---

## 🧪 Testing

Run the automated test suite:
```bash
# Unit and Invariant Tests
npm test

# End-to-End API & Business Flow Simulation
node tests/e2e_integration_test.js
```

All 18 tests pass with 100% coverage across billing math, historical snapshots, table limits, and security boundaries.

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit in browser:
- Public Customer Menu: `http://localhost:8000/menu`
- Waiter POS Terminal: `http://localhost:8000/waiter` (Sign in: `waiter@spiceandsky.com` / any password)
- Owner Admin Dashboard: `http://localhost:8000/admin` (Sign in: `admin@spiceandsky.com` / any password)
