/*
  APP SETTINGS
  ------------
  SUPABASE_URL and SUPABASE_ANON_KEY come from your Supabase project:
  Dashboard -> Project Settings -> API (or "Data API").

  Leave them EMPTY to run in DEMO MODE: everything works, but data is only saved
  in this browser (not shared between phones). Good for testing and practice.

  The anon key is meant to be public. The data is protected by the database's
  Row Level Security rules (see supabase/schema.sql), which only let signed-in
  staff read or change anything.
*/
const SUPABASE_URL = "https://hemdteagkpjodrnsiecw.supabase.co";
// The PUBLISHABLE key (public by design). NEVER put the "secret" / service_role key here.
const SUPABASE_ANON_KEY = "sb_publishable_Obe832C66r7F-T-cmZxs7Q_XSJQw9EI";

// Prices and rules (keep in sync with the public website's js/order.js)
const TAX_RATE = 0.08875;            // NYC sales tax on catering (8.875%)
const CATERING_DELIVERY_FEE = 15;    // flat catering delivery fee, taxed with the order
const GROCERY_DELIVERY_MINIMUM = 50; // phone grocery deliveries need at least $50
const GROCERY_DELIVERY_FEE = 0;      // phone grocery orders: always delivery, free over the minimum
