# FD Orders

A phone-friendly staff app for **Food Dynasty Supermarket** (Staten Island, NY). It replaces paper slips and phone notes for catering orders, grocery deliveries and website orders, and lets staff update the store's website without touching code.

**Live app (staff login required):** https://food-dynasty.github.io/Food-Dynasty-orders/
**Public website:** [Food-Dynasty-Website](https://github.com/Food-Dynasty/Food-Dynasty-Website)

## What staff can do

- **Customers:** find someone by phone number or name, or add them in seconds. Every order is saved to the customer's history.
- **Phone grocery orders:** type the list and enter the register total. The $50 delivery minimum is enforced.
- **In-store deliveries:** a customer shops in person and we deliver the bags. Staff enter only the bags, address and time.
- **Catering:** pick from the full menu, with pickup or delivery, tax, deposit and balance. Holiday dinners require their side and pie choices.
- **Website orders:** a banner, a sound and a badge appear within 15 seconds when an order arrives. Every online price is checked against the real menu.
- **Order tracking:** New → Preparing → Ready → Completed, a grocery checklist ticked off while shopping, payments, reorder in one tap, and printable kitchen and customer copies.
- **Website tab:** upload the weekly ad and holiday menus as a PDF or photos, choose the homepage deals, and turn the homepage holiday section on or off.

## Decisions I made (and why)

- **Security first.** The app's code is public, so the database does the protecting. Row-level security means only signed-in staff can read anything, public sign-ups are off, and staff accounts are created by hand. The public website reaches the database through two insert-only functions and a read-only flyer table, and nothing else.
- **A swappable data layer.** `js/store.js` has a demo version (saves in the browser) and a cloud version (Supabase) with the same functions. I can test every feature without touching real customer data.
- **No framework.** It's a small single-page app in plain JavaScript: hash routing and one click handler per screen. It loads instantly on the store's phones and can be installed to the home screen.
- **Built around how the store works.** In-store deliveries skip the register total because the cashier already handled payment. EBT is offered only for groceries, not prepared food. Website orders stay "new" until a staff member calls the customer.

## How it's built

| Part | Technology |
|---|---|
| App | JavaScript single-page app, HTML, CSS, SVG icons |
| Data | Supabase Postgres with row-level security and RPC functions |
| Files | Supabase Storage (flyer uploads), pdf.js for turning PDFs into images |
| Login | Supabase Auth (email and password, sign-ups disabled) |
| Hosting | GitHub Pages, installable as a PWA |

## Setup

1. Create a Supabase project. In the SQL editor, run these in order: `supabase/schema.sql`, `supabase/online-orders.sql`, `supabase/online-grocery.sql`, `supabase/website-flyers.sql`.
2. In **Authentication → Sign In / Providers**, turn off "Allow new users to sign up". Then add each staff member under **Authentication → Users**.
3. Put the project URL and publishable key in `js/config.js`. Leave the URL empty to run in demo mode.

## Privacy

Customer names, phone numbers and addresses are stored only in the store's Supabase database, behind staff logins and row-level security. None of it is in this code.
