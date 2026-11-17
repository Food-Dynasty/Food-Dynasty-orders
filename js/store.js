/*
  DATA LAYER ("store")
  --------------------
  Every screen in the app saves and loads data ONLY through the functions below.
  There are two versions with exactly the same functions:

    DemoStore   saves in this browser's localStorage (no account needed; not shared)
    CloudStore  saves in the shared Supabase database (needs config.js filled in)

  The app picks one at start-up. Because both have the same function names, the
  rest of the app never needs to know which one it's using. This idea (one
  "interface", several implementations) is common in professional code.

  Every function is "async": it returns a Promise, and callers use "await".
  (The demo version doesn't need to wait for anything, but it's async anyway so it
  can be swapped with the cloud version, which has to wait for the internet.)
*/
"use strict";

const IS_CLOUD = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// "(718) 555-0123" -> "7185550123"
function digitsOnly(text) {
  return String(text || "").replace(/\D/g, "");
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}


/* ============ DEMO VERSION (this browser only) ============ */

const DemoStore = {
  mode: "demo",

  _read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
      return [];
    }
  },

  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      throw new Error("Couldn't save in this browser (storage is full or blocked).");
    }
  },

  // Attaches each order's customer, like the cloud version's "join"
  _withCustomer(order) {
    const customers = this._read("fd-app-customers");
    return Object.assign({}, order, {
      customer: customers.find(function (c) { return c.id === order.customer_id; }) || null
    });
  },

  async getUser() { return { email: "demo mode" }; },
  async signIn() { return { email: "demo mode" }; },
  async signOut() {},

  async findCustomers(query) {
    const q = String(query || "").trim().toLowerCase();
    const digits = digitsOnly(q);
    let list = this._read("fd-app-customers");
    if (q) {
      list = list.filter(function (c) {
        return (digits && c.phone.includes(digits)) || c.name.toLowerCase().includes(q);
      });
    }
    return list.sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 50);
  },

  async getCustomer(id) {
    return this._read("fd-app-customers").find(function (c) { return c.id === id; }) || null;
  },

  async saveCustomer(customer) {
    const list = this._read("fd-app-customers");
    const phone = digitsOnly(customer.phone);
    const existing = customer.id ? list.find(function (c) { return c.id === customer.id; }) : null;

    // Same rule as the database: one customer per phone number
    const clash = list.find(function (c) { return c.phone === phone && (!existing || c.id !== existing.id); });
    if (clash) throw new Error("Another customer already uses this phone number: " + clash.name);

    const now = new Date().toISOString();
    let saved;
    if (existing) {
      saved = Object.assign(existing, customer, { phone: phone, updated_at: now });
    } else {
      saved = Object.assign({ id: newId(), created_at: now, updated_at: now }, customer, { phone: phone });
      list.push(saved);
    }
    this._write("fd-app-customers", list);
    return saved;
  },

  async listOrders(fromISO, toISO) {
    const self = this;
    return this._read("fd-app-orders")
      .filter(function (o) { return (!fromISO || o.due_at >= fromISO) && (!toISO || o.due_at < toISO); })
      .sort(function (a, b) { return a.due_at.localeCompare(b.due_at); })
      .map(function (o) { return self._withCustomer(o); });
  },

  // Website orders that nobody has confirmed yet (still "new")
  async listNewOnline() {
    const self = this;
    return this._read("fd-app-orders")
      .filter(function (o) { return o.source === "online" && o.status === "new"; })
      .sort(function (a, b) { return a.id - b.id; })
      .map(function (o) { return self._withCustomer(o); });
  },

  async customerOrders(customerId) {
    const self = this;
    return this._read("fd-app-orders")
      .filter(function (o) { return o.customer_id === customerId; })
      .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); })
      .map(function (o) { return self._withCustomer(o); });
  },

  async getOrder(id) {
    const order = this._read("fd-app-orders").find(function (o) { return o.id === Number(id); });
    return order ? this._withCustomer(order) : null;
  },

  async createOrder(order) {
    const list = this._read("fd-app-orders");
    // Order numbers count up: 1, 2, 3... like the database's "identity" column
    const nextNumber = list.reduce(function (max, o) { return Math.max(max, o.id); }, 0) + 1;
    const row = Object.assign({ id: nextNumber, status: "new", created_at: new Date().toISOString() }, order);
    list.push(row);
    this._write("fd-app-orders", list);
    return this._withCustomer(row);
  },

  async updateOrder(id, changes) {
    const list = this._read("fd-app-orders");
    const order = list.find(function (o) { return o.id === Number(id); });
    if (!order) throw new Error("Order not found.");
    Object.assign(order, changes);
    this._write("fd-app-orders", list);
    return this._withCustomer(order);
  },

  // --- Website flyers (weekly sales, holiday menus) ---
  // Demo mode keeps the pictures only until the page is reloaded ("object URLs"),
  // since this browser's storage is too small for real pictures.
  async listFlyers() {
    return this._read("fd-app-flyers").sort(function (a, b) { return b.created_at.localeCompare(a.created_at); });
  },

  async uploadFlyerFile(path, file) {
    return { path: path, url: URL.createObjectURL(file) };
  },

  async createFlyer(flyer) {
    const list = this._read("fd-app-flyers");
    const nextNumber = list.reduce(function (max, f) { return Math.max(max, f.id); }, 0) + 1;
    const row = Object.assign({ id: nextNumber, created_at: new Date().toISOString() }, flyer);
    list.push(row);
    this._write("fd-app-flyers", list);
    return row;
  },

  async updateFlyer(id, changes) {
    const list = this._read("fd-app-flyers");
    const flyer = list.find(function (f) { return f.id === id; });
    if (!flyer) throw new Error("Flyer not found.");
    Object.assign(flyer, changes);
    this._write("fd-app-flyers", list);
    return flyer;
  },

  async removeFlyerFiles() {},   // demo pictures only live until the page reloads

  async deleteFlyer(flyer) {
    this._write("fd-app-flyers", this._read("fd-app-flyers").filter(function (f) { return f.id !== flyer.id; }));
  }
};


/* ============ CLOUD VERSION (shared Supabase database) ============ */

// Supabase answers every request with { data, error }. This returns the data,
// or throws the error so the screen can show it.
function unwrap(result) {
  if (result.error) {
    // 23505 = Postgres's code for "this value must be unique and already exists"
    if (result.error.code === "23505") throw new Error("Another customer already uses this phone number.");
    throw new Error(result.error.message);
  }
  return result.data;
}

// The columns to load for an order, plus its customer (a "join" through customer_id)
const ORDER_COLUMNS = "*, customer:customers(*)";

const CloudStore = {
  mode: "cloud",
  client: null,

  init() {
    // window.supabase comes from the Supabase library loaded in index.html
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  },

  async getUser() {
    const result = await this.client.auth.getSession();
    return result.data.session ? result.data.session.user : null;
  },

  async signIn(email, password) {
    const result = await this.client.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw new Error("Wrong email or password.");
    return result.data.user;
  },

  async signOut() {
    await this.client.auth.signOut();
  },

  async findCustomers(query) {
    let request = this.client.from("customers").select("*").order("name").limit(50);
    const q = String(query || "").trim();
    if (q) {
      // Characters like , ( ) % * have special meaning in Supabase filters,
      // so they're removed from what the user typed before searching.
      const safe = q.replace(/[,()%*\\]/g, " ").trim();
      const digits = digitsOnly(q);
      const filters = [];
      if (safe) filters.push("name.ilike.%" + safe + "%");       // ilike = case-insensitive "contains"
      if (digits) filters.push("phone.ilike.%" + digits + "%");
      if (filters.length) request = request.or(filters.join(","));
    }
    return unwrap(await request);
  },

  async getCustomer(id) {
    return unwrap(await this.client.from("customers").select("*").eq("id", id).maybeSingle());
  },

  async saveCustomer(customer) {
    const row = {
      name: customer.name,
      phone: digitsOnly(customer.phone),
      address: customer.address || null,
      apt: customer.apt || null,
      city: customer.city || null,
      zip: customer.zip || null,
      notes: customer.notes || null
    };
    const table = this.client.from("customers");
    const request = customer.id
      ? table.update(row).eq("id", customer.id).select().single()
      : table.insert(row).select().single();
    return unwrap(await request);
  },

  async listOrders(fromISO, toISO) {
    let request = this.client.from("orders").select(ORDER_COLUMNS).order("due_at");
    if (fromISO) request = request.gte("due_at", fromISO);   // gte = greater than or equal
    if (toISO) request = request.lt("due_at", toISO);        // lt  = less than
    return unwrap(await request);
  },

  // Website orders that nobody has confirmed yet (still "new")
  async listNewOnline() {
    return unwrap(await this.client.from("orders").select(ORDER_COLUMNS)
      .eq("source", "online").eq("status", "new").order("id"));
  },

  async customerOrders(customerId) {
    return unwrap(await this.client.from("orders").select(ORDER_COLUMNS)
      .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50));
  },

  async getOrder(id) {
    return unwrap(await this.client.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle());
  },

  async createOrder(order) {
    return unwrap(await this.client.from("orders").insert(order).select(ORDER_COLUMNS).single());
  },

  async updateOrder(id, changes) {
    return unwrap(await this.client.from("orders").update(changes).eq("id", id).select(ORDER_COLUMNS).single());
  },

  // --- Website flyers (weekly sales, holiday menus) ---
  // The files go in the "flyers" storage bucket; a row in the "flyers" table lists
  // them. The public website reads that table (see supabase/website-flyers.sql).
  async listFlyers() {
    return unwrap(await this.client.from("flyers").select("*").order("created_at", { ascending: false }).limit(30));
  },

  // Uploads one file and returns its public address
  async uploadFlyerFile(path, file) {
    const bucket = this.client.storage.from("flyers");
    unwrap(await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false }));
    return { path: path, url: bucket.getPublicUrl(path).data.publicUrl };
  },

  async createFlyer(flyer) {
    return unwrap(await this.client.from("flyers").insert(flyer).select().single());
  },

  async updateFlyer(id, changes) {
    return unwrap(await this.client.from("flyers").update(changes).eq("id", id).select().single());
  },

  // Deletes files from the "flyers" bucket, given their public addresses
  async removeFlyerFiles(urls) {
    const marker = "/object/public/flyers/";
    const paths = (urls || [])
      .map(function (url) { const i = url.indexOf(marker); return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null; })
      .filter(Boolean);
    if (paths.length) unwrap(await this.client.storage.from("flyers").remove(paths));
  },

  // Deletes the row AND its files, so old flyers don't pile up in storage
  async deleteFlyer(flyer) {
    await this.removeFlyerFiles([].concat(flyer.pages || [], flyer.deal_images || [], flyer.pdf_url ? [flyer.pdf_url] : []));
    unwrap(await this.client.from("flyers").delete().eq("id", flyer.id));
  }
};


// Pick the version to use
const Store = IS_CLOUD ? CloudStore : DemoStore;
if (IS_CLOUD) CloudStore.init();
