# Food Dynasty Orders

A phone-friendly staff app for **Food Dynasty Supermarket** (Staten Island, NY) that replaces paper slips and phone notes for in-person and phone orders.

## What staff can do

- **Look up customers** by phone number or name, or add a new one in seconds
- **Phone grocery deliveries:** type the list, enter the register total; the app enforces the $50 delivery minimum
- **Catering orders:** pick from the full catering menu (160 items), with pickup or delivery ($15), NYC sales tax (8.875%), deposit and balance due
- **Track status:** New → Preparing → Ready / Out for delivery → Completed (or Cancelled)
- **Reorder** a customer's past order in one tap, at today's prices
- **Print** any order for the kitchen or driver
- **Install it on a phone** like an app (Add to Home Screen)

## How it's built

| Part | Technology |
|---|---|
| Screens | Vanilla JavaScript single-page app (hash routing, event delegation), HTML, CSS |
| Data | [Supabase](https://supabase.com) (Postgres) with **Row Level Security**: only signed-in staff can read or write |
| Login | Supabase Auth (email + password; public sign-ups turned off) |
| Install | Web app manifest (PWA) |
| Hosting | GitHub Pages |

`js/store.js` has two interchangeable data layers with the same functions: **DemoStore** (saves in the browser, for testing) and **CloudStore** (Supabase). The app runs in **demo mode** until `js/config.js` has the Supabase URL and key.

## Setup

1. Create a Supabase project and run, in its SQL Editor and in this order: `supabase/schema.sql`, `supabase/online-orders.sql`, `supabase/online-grocery.sql`, `supabase/website-flyers.sql` (website flyers + in-store deliveries).
2. In Supabase: **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up", then add each staff member under **Authentication → Users**.
3. Put the project's URL and anon (public) key in `js/config.js`.

## Privacy

Customer names, phone numbers and addresses are stored only in the store's Supabase database, protected by Row Level Security and staff logins. Nothing is stored in this code.
