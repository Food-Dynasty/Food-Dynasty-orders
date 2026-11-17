/*
  FOOD DYNASTY ORDERS: THE APP (screens and what happens when you tap things)
  ---------------------------------------------------------------------------
  Sections:
    1. Helpers (money, dates, phone numbers, safe HTML)
    2. Catering menu lookup
    3. Router: shows the right screen for the address after "#"
    4. Screen: Orders list
    5. Screen: Order details (status, print, reorder)
    6. Screen: New order (customer, type, items, totals, save)
    7. Screens: Customers list + one customer
    8. Screen: Sign in
    9. Start-up

  Pattern used everywhere: each screen is a function that builds HTML as text,
  puts it in <main id="view">, and then reacts to taps with "event delegation"
  (one listener on the whole view that checks data-action="..." on the tapped thing).
*/
"use strict";


/* ============ 1. HELPERS ============ */

const view = document.getElementById("view");
const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function money(amount) {
  return moneyFormat.format(Number(amount) || 0);
}

function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}

// Makes typed text safe to put inside HTML (stops <script> tricks)
function esc(text) {
  return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

// "7185550123" -> "(718) 555-0123"
function prettyPhone(phone) {
  const d = digitsOnly(phone);
  if (d.length === 10) return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  if (d.length === 11 && d[0] === "1") return prettyPhone(d.slice(1));
  return phone || "";
}

// Date objects <-> the "2026-11-20" / "13:30" text used by date and time inputs
function dateValue(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function timeValue(date) {
  return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
}

// "2026-11-20" + "13:30" (local time) -> ISO text the database understands
function toISO(dateText, timeText) {
  return new Date(dateText + "T" + timeText).toISOString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function prettyWhen(iso) {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (day.getTime() === today.getTime()) return "Today " + time;
  if (day.getTime() === addDays(today, 1).getTime()) return "Tomorrow " + time;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " " + time;
}

function fullAddress(c) {
  if (!c || !c.address) return "";
  return [c.address, c.apt, c.city].filter(Boolean).join(", ") + (c.zip ? " " + c.zip : "");
}

function toast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { box.hidden = true; }, 2500);
}

function showError(error) {
  view.insertAdjacentHTML("afterbegin", '<p class="error" role="alert">' + esc(error.message || error) + "</p>");
  view.scrollIntoView({ block: "start" });
}

const STATUS_LABEL = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled"
};

// The next step for the big "status" button.
// Deliveries go straight from Preparing to Completed (no "out for delivery" step).
// Pickups get a "Ready for pickup" step so the counter knows it's waiting.
// ("out_for_delivery" stays in STATUS_LABEL so older orders still display correctly.)
function nextStatus(order) {
  const flow = order.fulfillment === "delivery"
    ? ["new", "preparing", "completed"]
    : ["new", "preparing", "ready", "completed"];
  const i = flow.indexOf(order.status);
  return (i >= 0 && i < flow.length - 1) ? flow[i + 1] : null;
}

function badges(order) {
  return (order.source === "online" ? '<span class="badge badge-online">' + icon("globe") + " Online</span>" : "") +
         (order.source === "instore" ? '<span class="badge badge-instore">' + icon("bag") + " In-store</span>" : "") +
         '<span class="badge badge-' + order.kind + '">' + (order.kind === "catering" ? "Catering" : "Grocery") + "</span>" +
         '<span class="badge">' + (order.fulfillment === "delivery" ? "Delivery" : "Pickup") + "</span>" +
         '<span class="status status-' + order.status + '">' + STATUS_LABEL[order.status] + "</span>" +
         (order.status !== "cancelled" && amountOwed(order) > 0 ? '<span class="badge badge-unpaid">Unpaid</span>' : "");
}

// How much is still owed on an order.
//   Grocery: the whole total until a payment method other than "Not paid yet" is chosen.
//   Catering: total minus the deposit/payments recorded.
function amountOwed(order) {
  if (order.kind === "grocery") {
    const paid = order.payment_method && order.payment_method !== "Not paid yet";
    return paid ? 0 : Number(order.total) || 0;
  }
  return Math.max(0, roundCents(Number(order.total) - Number(order.deposit_paid || 0)));
}


/* ============ 2. CATERING MENU LOOKUP ============ */
// Same idea as the website: give every menu item an ID and fill in its sizes.

function slugify(text) {
  return text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const MENU_ITEMS = {};
CATERING_MENU.forEach(function (category) {
  category.items = category.items.map(function (raw) {
    const item = (typeof raw === "string") ? { name: raw } : Object.assign({}, raw);
    if (!item.unit && !item.sizes) item.sizes = category.sizes;
    item.id = category.id + "--" + slugify(item.name);
    MENU_ITEMS[item.id] = item;
    return item;
  });
});

// Price of one tray line, using today's menu prices
function cateringUnitPrice(line) {
  const item = MENU_ITEMS[line.id];
  if (!item) return Number(line.unit_price) || 0;   // item no longer on the menu: keep the old price
  return item.unit ? item.price : item.sizes[line.size][1];
}

function cateringLineLabel(line) {
  const item = MENU_ITEMS[line.id];
  if (!item) return line.name + (line.size_label ? " (" + line.size_label + ")" : "");
  if (item.unit) return item.name + " · " + line.qty + " " + (item.unit === "person" ? "people" : "ft");
  return line.qty + " × " + item.name + " (" + item.sizes[line.size][0] + ")";
}


/* ============ 3. ROUTER ============ */
// Reads the part of the address after "#" (like "#/order/12") and shows that screen.

let currentUser = null;

async function route() {
  const hash = location.hash || "#/orders";
  const parts = hash.slice(2).split("/");   // "#/order/12" -> ["order", "12"]
  const page = parts[0];

  // Cloud mode: nobody gets past the sign-in screen without logging in
  if (IS_CLOUD && !currentUser && page !== "login") {
    location.hash = "#/login";
    return;
  }

  // Highlight the current tab
  document.querySelectorAll("#tabbar a").forEach(function (a) {
    a.classList.toggle("active", a.dataset.tab === page || (page === "order" && a.dataset.tab === "orders") ||
                                 (page === "customer" && a.dataset.tab === "customers"));
  });
  document.getElementById("tabbar").hidden = page === "login";

  view.innerHTML = '<p class="loading">Loading…</p>';
  // Forget the previous screen's tap/typing handlers; each screen sets its own
  view.onclick = view.oninput = view.onchange = view.onsubmit = null;
  try {
    if (page === "orders") await showOrders(parts[1] || "today");
    else if (page === "order") await showOrder(parts[1]);
    else if (page === "new") showNewOrder();
    else if (page === "customers") await showCustomers();
    else if (page === "customer") await showCustomer(parts[1]);
    else if (page === "website") await showWebsite();   // in js/website.js
    else if (page === "login") showLogin();
    else location.hash = "#/orders";
  } catch (error) {
    view.innerHTML = "";
    showError(error);
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);


/* ============ 4. SCREEN: ORDERS LIST ============ */

async function showOrders(range) {
  const today = startOfDay(new Date());
  const ranges = {
    today: [today, addDays(today, 1), "Today"],
    upcoming: [addDays(today, 1), addDays(today, 60), "Upcoming"],
    past: [addDays(today, -14), today, "Past"],
    // Website orders waiting to be confirmed, whatever their date
    online: [null, null, icon("globe") + " New" + (onlineWaiting.length ? " (" + onlineWaiting.length + ")" : "")]
  };
  const r = ranges[range] || ranges.today;
  let orders = range === "online"
    ? await Store.listNewOnline()
    : await Store.listOrders(r[0].toISOString(), r[1].toISOString());
  if (range === "past") orders = orders.reverse();   // most recent first

  const open = orders.filter(function (o) { return o.status !== "completed" && o.status !== "cancelled"; });

  view.innerHTML =
    '<div class="screen-head"><h1>Orders</h1>' +
      '<button type="button" class="btn btn-small" data-action="refresh">' + icon("refresh") + ' Refresh</button></div>' +
    '<div class="segmented" role="tablist">' +
      Object.keys(ranges).map(function (key) {
        return '<a role="tab" href="#/orders/' + key + '" class="' + (key === range ? "active" : "") + '">' + ranges[key][2] + "</a>";
      }).join("") +
    "</div>" +
    '<p class="muted">' + orders.length + (orders.length === 1 ? " order · " : " orders · ") + open.length + " still open</p>" +
    (orders.length === 0
      ? '<div class="empty">No orders here yet. <a href="#/new">Take a new order</a></div>'
      : '<ul class="card-list">' + orders.map(orderCardHTML).join("") + "</ul>");

  view.onclick = function (event) {
    if (event.target.closest('[data-action="refresh"]')) route();
  };
}

function orderCardHTML(o) {
  const done = o.status === "completed" || o.status === "cancelled";
  return (
    '<li><a class="card order-card' + (done ? " done" : "") + '" href="#/order/' + o.id + '">' +
      '<div class="card-row"><strong>' + esc(prettyWhen(o.due_at)) + '</strong><span class="order-no">#' + o.id + "</span></div>" +
      '<div class="card-row"><span class="card-name">' + esc(o.customer ? o.customer.name : "(unknown)") + "</span>" +
        "<strong>" + (o.source === "instore" ? "Paid in store" : (Number(o.total) > 0 ? money(o.total) : "Total TBD")) + "</strong></div>" +
      '<div class="badges">' + badges(o) + "</div>" +
    "</a></li>"
  );
}


/* ============ 5. SCREEN: ONE ORDER ============ */

async function showOrder(id) {
  const o = await Store.getOrder(id);
  if (!o) {
    view.innerHTML = '<div class="empty">Order not found. <a href="#/orders">Back to orders</a></div>';
    return;
  }
  const c = o.customer || {};
  const next = nextStatus(o);
  const balance = roundCents(Number(o.total) - Number(o.deposit_paid || 0));

  // Grocery orders: the shopping list as a tap-to-check list.
  // Older orders saved before the checklist existed only have items_text, so build it from that.
  const checklist = o.kind === "grocery"
    ? (Array.isArray(o.items) ? o.items : groceryChecklist(o.items_text))
    : null;

  const itemsHTML = o.kind === "catering"
    ? "<ul class=\"line-list\">" + (o.items || []).map(function (line) {
        return "<li><span>" + esc(line.label || line.name) + (line.note ? '<br><small>Note: ' + esc(line.note) + "</small>" : "") +
               "</span><span>" + money(line.line_total) + "</span></li>";
      }).join("") + "</ul>"
    // In-store deliveries: already shopped and bagged, so just say how many bags
    : (o.source === "instore" ? '<p class="items-text">' + esc(o.items_text) + "</p>" : checklistHTML(checklist));

  view.innerHTML =
    '<p><a href="#/orders" class="back">‹ Orders</a></p>' +
    // Everything in .print-area is what gets printed for the kitchen/driver
    '<section class="print-area">' +
      '<div class="screen-head"><h1>Order #' + o.id + "</h1></div>" +
      '<div class="badges">' + badges(o) + "</div>" +
      '<div class="panel">' +
        '<p class="big-when">' + (o.fulfillment === "delivery" ? "Deliver" : "Pickup") + ": " + esc(prettyWhen(o.due_at)) + "</p>" +
        "<p><strong>" + esc(c.name) + "</strong> · <a href=\"tel:" + esc(digitsOnly(c.phone)) + "\">" + esc(prettyPhone(c.phone)) + "</a></p>" +
        (o.fulfillment === "delivery" ? "<p>" + icon("pin") + " " + esc(o.delivery_address) + "</p>" : "") +
        (c.notes ? '<p class="muted">Customer note: ' + esc(c.notes) + "</p>" : "") +
      "</div>" +
      '<div class="panel"><h2>Items</h2>' + itemsHTML + "</div>" +
      // In-store deliveries were paid at the register: no money box at all
      (o.source === "instore" ? '<div class="panel"><p class="pay-state paid">' + icon("check") + " Paid in store</p></div>" :
      '<div class="panel totals">' +
        (o.kind === "catering" ? row("Subtotal", money(o.subtotal)) : "") +
        (Number(o.delivery_fee) ? row("Delivery fee", money(o.delivery_fee)) : "") +
        (o.kind === "catering" ? row("Tax", money(o.tax)) : "") +
        row(o.kind === "catering" ? "Total" : "Register total",
            (o.kind === "grocery" && !(Number(o.total) > 0)) ? "Not entered yet" : money(o.total), "grand") +
        (Number(o.deposit_paid)
          ? row(Number(o.deposit_paid) >= Number(o.total) ? "Amount paid" : "Deposit paid", money(o.deposit_paid)) +
            row("Balance due", money(Math.max(0, balance)), "grand")
          : "") +
        (o.payment_method ? row("Payment", esc(o.payment_method)) : "") +
      "</div>") +
      (o.notes ? '<div class="panel"><h2>Notes</h2><p class="items-text">' + esc(o.notes) + "</p></div>" : "") +
    "</section>" +

    // The customer's copy: hidden on screen, only shown when printing it (see printCopy)
    (o.kind === "catering" ? customerCopyHTML(o, balance) : "") +

    // Action buttons (not printed)
    // ONLINE ORDERS: reminder to call, plus a price check against the real menu
    (o.source === "online" ? onlinePanelHTML(o) : "") +

    // PAYMENT: change it any time, e.g. a "Not paid yet" order paid at the door
    (o.status !== "cancelled" && o.source !== "instore" ? paymentPanelHTML(o) : "") +

    '<div class="actions no-print">' +
      (next ? '<button type="button" class="btn btn-primary btn-block" data-action="status" data-status="' + next + '">Mark as ' + STATUS_LABEL[next] + "</button>" : "") +
      // Shortcut: finish the order in one tap instead of stepping through every status
      (next && next !== "completed"
        ? '<button type="button" class="btn btn-block complete-now" data-action="status" data-status="completed">' + icon("check") + ' Complete now</button>'
        : "") +
      '<div class="btn-row">' +
        (o.kind === "catering"
          ? '<button type="button" class="btn btn-primary" data-action="print" data-copy="customer">' + icon("receipt") + ' Customer copy</button>' +
            '<button type="button" class="btn" data-action="print" data-copy="kitchen">' + icon("printer") + ' Kitchen copy</button>'
          : '<button type="button" class="btn" data-action="print" data-copy="kitchen">' + icon("printer") + ' Print</button>') +
        '<button type="button" class="btn" data-action="reorder">' + icon("refresh") + ' Reorder</button>' +
        '<a class="btn" href="#/customer/' + esc(c.id) + '">' + icon("user") + ' Customer</a>' +
      "</div>" +
      (o.status !== "cancelled" && o.status !== "completed"
        ? '<button type="button" class="link-btn danger" data-action="status" data-status="cancelled">Cancel this order</button>'
        : (o.status === "cancelled" ? '<button type="button" class="link-btn" data-action="status" data-status="new">Restore this order</button>' : "")) +
    "</div>";

  view.onclick = async function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === "status") {
        const status = button.dataset.status;
        if (status === "cancelled" && !confirm("Cancel order #" + o.id + "?")) return;
        await Store.updateOrder(o.id, { status: status });
        toast("Order #" + o.id + ": " + STATUS_LABEL[status]);
        if (o.source === "online") checkOnlineOrders();   // update the "new online" count
        route();
      }
      if (action === "print") printCopy(button.dataset.copy);
      if (action === "reorder") startReorder(o);
      if (action === "pick") await togglePicked(o, checklist, Number(button.dataset.index), button);
      if (action === "pay") await recordPayment(o, button.dataset.method);
      if (action === "set-total") await saveRegisterTotal(o, document.getElementById("register-total").value);
      if (action === "change-total") {
        const value = prompt("New register total for order #" + o.id + ":", Number(o.total).toFixed(2));
        if (value !== null) await saveRegisterTotal(o, value);
      }
    } catch (error) {
      showError(error);
    }
  };
}

function row(label, value, extraClass) {
  return '<p class="total-row ' + (extraClass || "") + '"><span>' + label + "</span><span>" + value + "</span></p>";
}

/* ---------- Online orders (sent from the website) ---------- */

// The website calculates its own prices in the customer's browser, which someone
// could tamper with. So for every online catering line we recalculate the price
// from OUR menu file and list anything that doesn't match.
function priceProblems(order) {
  const problems = [];
  (order.items || []).forEach(function (line) {
    const item = MENU_ITEMS[line.id];
    if (!item) {
      problems.push(line.name + ": not on our current menu");
      return;
    }
    const expected = roundCents(cateringUnitPrice(line) * Number(line.qty));
    if (Math.abs(expected - Number(line.line_total)) > 0.01) {
      problems.push(line.name + ": website said " + money(line.line_total) + ", menu price is " + money(expected));
    }
  });
  return problems;
}

function onlinePanelHTML(o) {
  // Grocery lists from the website have no prices: staff shop them, then enter the total
  if (o.kind === "grocery") {
    return (
      '<div class="panel online-panel no-print">' +
        "<h2>" + icon("globe") + " Grocery list from the website</h2>" +
        "<ol class=\"mini-steps\">" +
          "<li>Shop the list, tapping each item as it goes in the basket.</li>" +
          "<li>Enter the <strong>register total</strong> below.</li>" +
          "<li>Call the customer with the total, then deliver.</li>" +
        "</ol>" +
      "</div>"
    );
  }

  const problems = o.kind === "catering" ? priceProblems(o) : [];
  return (
    '<div class="panel online-panel no-print">' +
      "<h2>" + icon("globe") + " Sent from the website</h2>" +
      "<p>Call the customer to confirm the order and take the deposit, then mark it as Preparing.</p>" +
      (problems.length
        ? '<div class="error"><strong>' + icon("alert") + ' Price check failed. Confirm the total by phone:</strong><ul>' +
            problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>"
        : '<p class="pay-state paid">' + icon("check") + " Prices match the menu</p>") +
    "</div>"
  );
}

/* ---------- Payment ---------- */

const PAY_METHODS = ["Cash", "Card", "EBT"];

function paymentPanelHTML(o) {
  // Grocery order without a total yet (sent from the website): ask for it first.
  // (In-store deliveries were rung up already, so the total is optional for them.)
  if (o.kind === "grocery" && o.source !== "instore" && !(Number(o.total) > 0)) {
    return (
      '<div class="panel no-print"><h2>Register total</h2>' +
        '<p class="muted">After shopping, ring it up and enter the total here.</p>' +
        '<div class="total-entry">' +
          '<input id="register-total" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" aria-label="Register total">' +
          '<button type="button" class="btn btn-primary" data-action="set-total">Save total</button>' +
        "</div>" +
      "</div>"
    );
  }

  const owed = amountOwed(o);
  const state = owed > 0
    ? '<p class="pay-state unpaid">Unpaid: ' + money(owed) + " still owed</p>"
    : '<p class="pay-state paid">Paid' + (o.payment_method ? " · " + esc(o.payment_method) : "") + "</p>";

  // Catering can't be paid with EBT (prepared/hot food), so only offer it for groceries
  const methods = o.kind === "grocery" ? PAY_METHODS : ["Cash", "Card"];

  return (
    '<div class="panel no-print"><h2>Payment</h2>' + state +
      (owed > 0
        ? '<p class="muted">Tap how it was paid:</p>' +
          '<div class="btn-row">' +
            methods.map(function (m) {
              return '<button type="button" class="btn" data-action="pay" data-method="' + m + '">' + m + "</button>";
            }).join("") +
          "</div>"
        : '<button type="button" class="link-btn" data-action="pay" data-method="Not paid yet">Mark as not paid</button>') +
      // Grocery totals can be corrected (e.g. an item was added after ringing up)
      (o.kind === "grocery" ? ' <button type="button" class="link-btn" data-action="change-total">Change register total</button>' : "") +
    "</div>"
  );
}

// Saves a grocery order's register total (subtotal = total: the register already added any tax)
async function saveRegisterTotal(order, value) {
  const total = roundCents(Number(value));
  if (!(total > 0)) throw new Error("Enter the register total, for example 64.20");
  await Store.updateOrder(order.id, { subtotal: total, total: total });
  toast("Total saved: " + money(total) +
        (order.fulfillment === "delivery" && total < GROCERY_DELIVERY_MINIMUM ? " (under the $" + GROCERY_DELIVERY_MINIMUM + " delivery minimum)" : ""));
  route();
}

// Grocery: just record the method. Catering: paying means the balance is settled,
// so the amount paid becomes the full total.
async function recordPayment(order, method) {
  const changes = { payment_method: method };
  if (order.kind === "catering") {
    if (method === "Not paid yet") {
      // Undo: back to only the original deposit isn't known anymore, so ask
      const deposit = prompt("Deposit actually paid so far? (0 if none)", "0");
      if (deposit === null) return;
      changes.deposit_paid = roundCents(Number(deposit) || 0);
    } else {
      const owed = amountOwed(order);
      if (!confirm("Mark the balance of " + money(owed) + " as paid by " + method + "?")) return;
      changes.deposit_paid = Number(order.total);
    }
  }
  await Store.updateOrder(order.id, changes);
  toast(method === "Not paid yet" ? "Marked as not paid" : "Paid · " + method);
  route();
}

/* ---------- Grocery checklist ("in the basket") ---------- */

// Typed list -> checklist. One line = one item. Empty lines are skipped, and bullet
// characters people often type at the start ("-", "*", "•", "1.") are removed.
function groceryChecklist(text) {
  return String(text || "")
    .split("\n")
    .map(function (line) { return line.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim(); })
    .filter(function (line) { return line !== ""; })
    .map(function (line) { return { text: line, picked: false }; });
}

function checklistProgress(list) {
  const done = list.filter(function (item) { return item.picked; }).length;
  return done + " of " + list.length + " in basket" + (done === list.length && list.length ? " · done" : "");
}

function checklistHTML(list) {
  if (!list.length) return '<p class="muted">No items listed.</p>';
  return (
    '<p class="pick-progress" id="pick-progress">' + checklistProgress(list) + "</p>" +
    '<ul class="checklist">' +
      list.map(function (item, i) {
        // A <button> (not a checkbox) so the WHOLE row is a big target for thumbs.
        // aria-pressed tells screen readers whether it's checked.
        return '<li><button type="button" class="check-item' + (item.picked ? " picked" : "") +
               '" data-action="pick" data-index="' + i + '" aria-pressed="' + item.picked + '">' +
               '<span class="box" aria-hidden="true">' + (item.picked ? "✓" : "") + "</span>" +
               '<span class="check-text">' + esc(item.text) + "</span></button></li>";
      }).join("") +
    "</ul>"
  );
}

// Tapping an item: update the screen right away, then save to the database.
// (Updating first and saving after is called an "optimistic update": the app feels
// instant. If saving fails, we undo the change on screen and show the error.)
async function togglePicked(order, list, index, button) {
  const item = list[index];
  item.picked = !item.picked;
  button.classList.toggle("picked", item.picked);
  button.setAttribute("aria-pressed", item.picked);
  button.querySelector(".box").textContent = item.picked ? "✓" : "";
  document.getElementById("pick-progress").textContent = checklistProgress(list);

  const changes = { items: list };
  // First item in the basket: the order is clearly being worked on
  if (item.picked && order.status === "new") changes.status = "preparing";

  try {
    await Store.updateOrder(order.id, changes);
    if (changes.status) {
      order.status = changes.status;
      toast("Order #" + order.id + ": Preparing");
      route();   // redraw so the status badge and button update
    }
  } catch (error) {
    item.picked = !item.picked;   // undo
    button.classList.toggle("picked", item.picked);
    button.setAttribute("aria-pressed", item.picked);
    button.querySelector(".box").textContent = item.picked ? "✓" : "";
    document.getElementById("pick-progress").textContent = checklistProgress(list);
    throw error;
  }
}

// PRINTING TWO DIFFERENT COPIES FROM ONE PAGE
// The page holds both the kitchen view (.print-area) and the customer copy (.customer-copy).
// Before printing we put data-print="kitchen" or "customer" on <body>; the print CSS
// (bottom of css/app.css) uses it to show only the matching copy. After the print
// dialog closes, the "afterprint" event removes it again.
function printCopy(which) {
  document.body.dataset.print = which || "kitchen";
  window.addEventListener("afterprint", function cleanup() {
    delete document.body.dataset.print;
    window.removeEventListener("afterprint", cleanup);
  });
  window.print();
}

// The customer's copy of a catering order: logo, store info, what they ordered,
// money owed, and the ordering policies. Plain and printer-friendly.
function customerCopyHTML(o, balance) {
  const c = o.customer || {};
  const isDelivery = o.fulfillment === "delivery";
  const ordered = new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const due = new Date(o.due_at).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    '<section class="customer-copy" aria-hidden="true">' +
      '<header class="cc-head">' +
        '<img src="images/logo.png" alt="Food Dynasty" class="cc-logo">' +
        '<div class="cc-store">' +
          "<strong>Food Dynasty Supermarket</strong><br>" +
          "1071 Bay St, Staten Island, NY 10305<br>" +
          "(718) 816-1100 · food-dynasty.github.io/Food-Dynasty-Website" +
        "</div>" +
      "</header>" +

      '<h1 class="cc-title">Catering Order Confirmation</h1>' +
      '<p class="cc-meta">Order #' + o.id + " · Placed " + esc(ordered) + "</p>" +

      '<div class="cc-two">' +
        "<div><h3>Customer</h3><p>" + esc(c.name) + "<br>" + esc(prettyPhone(c.phone)) + "</p></div>" +
        "<div><h3>" + (isDelivery ? "Delivery" : "Pickup") + "</h3><p>" + esc(due) +
          (isDelivery ? "<br>" + esc(o.delivery_address) : "<br>At the store, 1071 Bay St") + "</p></div>" +
      "</div>" +

      '<table class="cc-items">' +
        "<thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>" +
        (o.items || []).map(function (line) {
          return "<tr><td>" + esc(line.label || line.name) + (line.note ? "<br><small>" + esc(line.note) + "</small>" : "") +
                 "</td><td>" + money(line.line_total) + "</td></tr>";
        }).join("") +
        "</tbody></table>" +

      '<div class="cc-totals">' +
        row("Subtotal", money(o.subtotal)) +
        (Number(o.delivery_fee) ? row("Delivery fee", money(o.delivery_fee)) : "") +
        row("NYC sales tax", money(o.tax)) +
        row("Total", money(o.total), "grand") +
        row("Deposit paid", money(o.deposit_paid)) +
        row("Balance due " + (isDelivery ? "on delivery" : "at pickup"), money(balance), "grand") +
      "</div>" +

      (o.notes ? '<p class="cc-notes"><strong>Notes:</strong> ' + esc(o.notes) + "</p>" : "") +

      '<div class="cc-policy">' +
        "<strong>Good to know</strong>" +
        "<ul>" +
          "<li>Changes or cancellations must be made at least 3 days before " + (isDelivery ? "delivery" : "pickup") + ".</li>" +
          "<li>Cancelled credit card orders have a 10% cancellation fee.</li>" +
          "<li>Hot trays come fully cooked: heat at 350°F for about 30 minutes (2 hours in chafing racks).</li>" +
          "<li>Rack and board deposits are refunded when returned within 1 week.</li>" +
        "</ul>" +
      "</div>" +
      '<p class="cc-thanks">Thank you for choosing Food Dynasty!</p>' +
    "</section>"
  );
}


/* ============ 6. SCREEN: NEW ORDER ============ */

// The order being built. Kept outside the screen so it survives switching tabs.
let draft = emptyDraft();

// The next half hour from now: 2:10 PM -> 2:30 PM (a sensible default for "ASAP")
function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

function emptyDraft() {
  const soon = nextHalfHour();
  return {
    customer: null,
    kind: null,            // "grocery", "catering" or "instore" (shopped in store, we deliver)
    bags: "",              // in-store delivery: how many bags
    fulfillment: "delivery",
    lines: [],             // catering: [{ id, size, qty, note }]
    itemsText: "",         // grocery: the typed list
    registerTotal: "",     // grocery: total from the register
    deliveryAddress: "",
    date: dateValue(soon),
    time: timeValue(soon),
    payment: "",
    deposit: "",
    notes: ""
  };
}

// Reorder: copy a past order into the draft (with today's prices), then open New order
function startReorder(order) {
  draft = emptyDraft();
  draft.customer = order.customer;
  draft.kind = order.source === "instore" ? "instore" : order.kind;
  draft.fulfillment = order.fulfillment;
  draft.deliveryAddress = order.delivery_address || fullAddress(order.customer);
  draft.notes = order.notes || "";
  if (order.kind === "catering") {
    draft.lines = (order.items || [])
      .filter(function (line) { return MENU_ITEMS[line.id]; })   // skip items no longer on the menu
      .map(function (line) { return { id: line.id, size: line.size || 0, qty: line.qty, note: line.note || "" }; });
  } else {
    draft.itemsText = order.items_text || "";
  }
  toast("Copied order #" + order.id + ". Check the date and total.");
  location.hash = "#/new";
}

function draftTotals() {
  if (draft.kind === "catering") {
    const subtotal = roundCents(draft.lines.reduce(function (sum, line) { return sum + cateringUnitPrice(line) * line.qty; }, 0));
    const fee = (draft.fulfillment === "delivery" && draft.lines.length) ? CATERING_DELIVERY_FEE : 0;
    const tax = roundCents((subtotal + fee) * TAX_RATE);
    return { subtotal: subtotal, fee: fee, tax: tax, total: roundCents(subtotal + fee + tax) };
  }
  // In-store delivery: rung up and paid at the register, nothing to total here
  if (draft.kind === "instore") return { subtotal: 0, fee: 0, tax: 0, total: 0 };
  // Grocery: the register total already includes tax
  const registerTotal = roundCents(Number(draft.registerTotal) || 0);
  const fee = draft.fulfillment === "delivery" ? GROCERY_DELIVERY_FEE : 0;
  return { subtotal: registerTotal, fee: fee, tax: 0, total: roundCents(registerTotal + fee) };
}

function showNewOrder() {
  const c = draft.customer;

  view.innerHTML =
    '<div class="screen-head"><h1>New order</h1>' +
      '<button type="button" class="link-btn" data-action="clear">Start over</button></div>' +

    // STEP 1: CUSTOMER
    '<section class="panel"><h2><span class="step">1</span> Customer</h2>' +
      (c
        ? '<div class="chosen"><div><strong>' + esc(c.name) + "</strong><br>" + esc(prettyPhone(c.phone)) +
            (c.address ? '<br><small>' + esc(fullAddress(c)) + "</small>" : "") +
          '</div><button type="button" class="link-btn" data-action="change-customer">Change</button></div>'
        : customerPickerHTML()) +
    "</section>" +

    // STEP 2: TYPE (only after a customer is chosen)
    (c
      ? '<section class="panel"><h2><span class="step">2</span> Type of order</h2>' +
          '<div class="choice-row">' +
            choiceButton("kind", "grocery", icon("cart") + " Grocery (phone order)", draft.kind) +
            choiceButton("kind", "catering", icon("utensils") + " Catering", draft.kind) +
            choiceButton("kind", "instore", icon("bag") + " In-store delivery", draft.kind) +
          "</div>" +
          // Catering can be pickup or delivery. Phone grocery orders are always
          // delivery (free over the $50 minimum), so there's no choice to make.
          (draft.kind === "catering"
            ? '<div class="choice-row">' +
                choiceButton("fulfillment", "delivery", icon("truck") + " Delivery", draft.fulfillment) +
                choiceButton("fulfillment", "pickup", icon("store") + " Pickup", draft.fulfillment) +
              "</div>"
            : (draft.kind === "grocery"
                ? '<p class="hint">' + icon("truck") + ' Phone grocery orders are delivered free (minimum ' + money(GROCERY_DELIVERY_MINIMUM) + ").</p>"
                : (draft.kind === "instore"
                    ? '<p class="hint">' + icon("bag") + ' The customer already paid at the register. We bring the bags home.</p>'
                    : ""))) +
        "</section>"
      : "") +

    // STEP 3: DETAILS
    (c && draft.kind ? detailsHTML() : "");

  view.onclick = handleNewOrderClick;
  view.oninput = handleNewOrderInput;
  view.onchange = handleNewOrderChange;
  view.onsubmit = handleNewOrderSubmit;

  // The catering picker's item and size dropdowns depend on the chosen category
  if (document.getElementById("pick-cat")) fillItemSelect();

  // Customer search starts empty: focus it so staff can type right away
  const search = document.getElementById("cust-search");
  if (search) search.focus();
}

function choiceButton(field, value, label, current) {
  return '<button type="button" class="choice' + (current === value ? " selected" : "") +
         '" data-action="choose" data-field="' + field + '" data-value="' + value + '" aria-pressed="' + (current === value) + '">' +
         label + "</button>";
}

// --- Step 1: find or add a customer ---
function customerPickerHTML() {
  return (
    '<label for="cust-search">Search by phone or name</label>' +
    '<input id="cust-search" type="search" inputmode="search" autocomplete="off" placeholder="718 555 0123 or Maria">' +
    '<ul class="pick-list" id="cust-results"></ul>' +
    '<details class="new-customer" id="new-customer"><summary>' + icon("plus") + ' New customer</summary>' +
      '<form id="customer-form" class="stack" novalidate>' +
        customerFieldsHTML({}) +
        '<button class="btn btn-primary" type="submit">Save customer</button>' +
      "</form>" +
    "</details>"
  );
}

function customerFieldsHTML(c) {
  return (
    '<label>Name<input name="name" required value="' + esc(c.name) + '" autocomplete="off"></label>' +
    '<label>Phone<input name="phone" type="tel" inputmode="tel" required value="' + esc(prettyPhone(c.phone)) + '" autocomplete="off"></label>' +
    '<label>Street address <small>(for delivery)</small><input name="address" value="' + esc(c.address) + '" autocomplete="off"></label>' +
    '<div class="two-col">' +
      '<label>Apt / floor<input name="apt" value="' + esc(c.apt) + '" autocomplete="off"></label>' +
      '<label>ZIP<input name="zip" inputmode="numeric" maxlength="5" value="' + esc(c.zip) + '" autocomplete="off"></label>' +
    "</div>" +
    '<label>City<input name="city" value="' + esc(c.city || "Staten Island") + '" autocomplete="off"></label>' +
    '<label>Notes <small>(gate code, allergies…)</small><textarea name="notes" rows="2">' + esc(c.notes) + "</textarea></label>"
  );
}

async function searchCustomers(query) {
  const list = document.getElementById("cust-results");
  if (!list) return;
  if (query.trim().length < 2) {
    list.innerHTML = "";
    return;
  }
  const results = await Store.findCustomers(query);
  list.innerHTML = results.length
    ? results.map(function (c) {
        return '<li><button type="button" data-action="pick-customer" data-id="' + esc(c.id) + '">' +
               "<strong>" + esc(c.name) + "</strong> · " + esc(prettyPhone(c.phone)) +
               (c.address ? "<br><small>" + esc(fullAddress(c)) + "</small>" : "") + "</button></li>";
      }).join("")
    : '<li class="muted">No match. Add them as a new customer below.</li>';

  // If they typed a phone number with no match, pre-fill it in the new-customer form
  const digits = digitsOnly(query);
  if (!results.length && digits.length >= 7) {
    document.getElementById("new-customer").open = true;
    document.querySelector('#customer-form [name="phone"]').value = query;
  }
}

function useCustomer(customer) {
  draft.customer = customer;
  if (!draft.deliveryAddress) draft.deliveryAddress = fullAddress(customer);
  showNewOrder();
}

// --- Step 3: order details ---
function detailsHTML() {
  const isCatering = draft.kind === "catering";
  const isInstore = draft.kind === "instore";
  const t = draftTotals();
  const isDelivery = draft.fulfillment === "delivery";

  return (
    '<form id="order-form" class="panel stack" novalidate>' +
      '<h2><span class="step">3</span> ' + (isCatering ? "Catering items" : (isInstore ? "Delivery details" : "Grocery list")) + "</h2>" +

      (isCatering ? cateringPickerHTML() :
       isInstore
        // In-store: already rung up and paid at the register, so no total, payment or minimum
        ? '<label>Number of bags<input name="bags" type="number" inputmode="numeric" min="1" step="1" value="' + esc(draft.bags) + '" placeholder="4"></label>' :
        '<label>Items <small>(one per line)</small>' +
          '<textarea name="itemsText" rows="6" placeholder="2 gal whole milk&#10;5 lb chicken thighs&#10;1 dozen eggs">' + esc(draft.itemsText) + "</textarea></label>" +
        '<label>Register total (incl. tax)' +
          '<input name="registerTotal" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(draft.registerTotal) + '" placeholder="0.00"></label>') +

      (isDelivery
        ? '<label>Delivery address<input name="deliveryAddress" value="' + esc(draft.deliveryAddress) + '" autocomplete="off"></label>'
        : "") +

      '<div class="two-col">' +
        '<label>' + (isDelivery ? "Delivery" : "Pickup") + ' date<input name="date" type="date" value="' + esc(draft.date) + '"></label>' +
        '<label>Time<input name="time" type="time" step="900" value="' + esc(draft.time) + '"></label>' +
      "</div>" +

      (isInstore ? "" :
        '<div class="two-col">' +
          '<label>Payment<select name="payment">' +
            (isCatering ? ["", "Cash", "Card", "Not paid yet"] : ["", "Cash", "Card", "EBT", "Not paid yet"]).map(function (p) {
              return '<option value="' + p + '"' + (draft.payment === p ? " selected" : "") + ">" + (p || "Choose…") + "</option>";
            }).join("") +
          "</select></label>" +
          (isCatering
            ? '<label>Deposit paid<input name="deposit" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(draft.deposit) + '" placeholder="0.00"></label>'
            : "<span></span>") +
        "</div>") +

      '<label>Notes<textarea name="notes" rows="2" placeholder="Ring bell twice, leave with doorman…">' + esc(draft.notes) + "</textarea></label>" +

      '<div class="totals" id="totals"' + (isInstore ? " hidden" : "") + ">" + totalsHTML(t) + "</div>" +
      '<p class="error" id="order-error" role="alert" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Save order</button>' +
    "</form>"
  );
}

function totalsHTML(t) {
  const isCatering = draft.kind === "catering";
  const half = roundCents(t.total / 2);
  return (
    (isCatering ? row("Subtotal", money(t.subtotal)) : "") +
    (t.fee ? row("Delivery fee", money(t.fee)) : "") +
    (isCatering ? row("Tax (" + (TAX_RATE * 100).toFixed(3).replace(/\.?0+$/, "") + "%)", money(t.tax)) : "") +
    row("Total", money(t.total), "grand") +
    (isCatering && t.total ? row("50% deposit", money(half)) : "")
  );
}

// Catering: category -> item -> size -> Add, then the list of trays
function cateringPickerHTML() {
  return (
    '<div class="picker">' +
      '<label>Category<select id="pick-cat">' +
        CATERING_MENU.map(function (cat, i) { return '<option value="' + i + '">' + esc(cat.name) + "</option>"; }).join("") +
      "</select></label>" +
      '<label>Item<select id="pick-item"></select></label>' +
      '<label id="pick-size-label">Size<select id="pick-size"></select></label>' +
      '<button type="button" class="btn btn-primary" data-action="add-line">Add to order</button>' +
    "</div>" +
    '<ul class="line-list editable" id="lines">' + linesHTML() + "</ul>"
  );
}

function fillItemSelect() {
  const cat = CATERING_MENU[Number(document.getElementById("pick-cat").value)];
  document.getElementById("pick-item").innerHTML = cat.items.map(function (item) {
    return '<option value="' + item.id + '">' + esc(item.name) + "</option>";
  }).join("");
  fillSizeSelect();
}

function fillSizeSelect() {
  const item = MENU_ITEMS[document.getElementById("pick-item").value];
  const sizeSelect = document.getElementById("pick-size");
  const label = document.getElementById("pick-size-label");
  if (item.unit) {
    label.hidden = true;
    sizeSelect.innerHTML = '<option value="0">-</option>';
  } else {
    label.hidden = false;
    sizeSelect.innerHTML = item.sizes.map(function (s, i) {
      return '<option value="' + i + '">' + esc(s[0]) + " · " + money(s[1]) + "</option>";
    }).join("");
  }
}

function linesHTML() {
  if (!draft.lines.length) return '<li class="muted">No items yet.</li>';
  return draft.lines.map(function (line, i) {
    const item = MENU_ITEMS[line.id];
    const min = item.unit ? item.min : 1;
    return (
      '<li data-index="' + i + '">' +
        '<div class="line-top"><span>' + esc(cateringLineLabel(line)) + "</span><strong>" + money(cateringUnitPrice(line) * line.qty) + "</strong></div>" +
        '<div class="line-controls">' +
          '<button type="button" class="qty" data-action="qty" data-step="-1" aria-label="Less">−</button>' +
          '<input class="qty-input" type="number" inputmode="numeric" min="' + min + '" value="' + line.qty + '" aria-label="Quantity">' +
          '<button type="button" class="qty" data-action="qty" data-step="1" aria-label="More">+</button>' +
          (item.unit ? '<small>' + (item.unit === "person" ? "people" : "feet") + " (min " + item.min + ")</small>" : "") +
          '<button type="button" class="link-btn danger" data-action="remove-line">Remove</button>' +
        "</div>" +
        '<input class="line-note" placeholder="Note (e.g. buffet choices)" value="' + esc(line.note) + '">' +
      "</li>"
    );
  }).join("");
}

function refreshLinesAndTotals() {
  const lines = document.getElementById("lines");
  if (lines) lines.innerHTML = linesHTML();
  document.getElementById("totals").innerHTML = totalsHTML(draftTotals());
}

// --- New order: taps ---
async function handleNewOrderClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "clear") {
    if (confirm("Clear this order and start over?")) {
      draft = emptyDraft();
      showNewOrder();
    }
  }
  if (action === "change-customer") {
    draft.customer = null;
    draft.deliveryAddress = "";
    showNewOrder();
  }
  if (action === "pick-customer") {
    useCustomer(await Store.getCustomer(target.dataset.id));
  }
  if (action === "choose") {
    draft[target.dataset.field] = target.dataset.value;
    // Grocery and in-store orders are always deliveries
    if (draft.kind === "grocery" || draft.kind === "instore") draft.fulfillment = "delivery";
    showNewOrder();
  }
  if (action === "add-line") {
    const id = document.getElementById("pick-item").value;
    const size = Number(document.getElementById("pick-size").value) || 0;
    const item = MENU_ITEMS[id];
    const existing = draft.lines.find(function (l) { return l.id === id && l.size === size; });
    if (existing && !item.unit) existing.qty += 1;
    else if (!existing) draft.lines.push({ id: id, size: size, qty: item.unit ? item.min : 1, note: "" });
    refreshLinesAndTotals();
    toast("Added " + item.name);
  }
  if (action === "qty" || action === "remove-line") {
    const index = Number(target.closest("li").dataset.index);
    const line = draft.lines[index];
    const item = MENU_ITEMS[line.id];
    if (action === "remove-line") draft.lines.splice(index, 1);
    else line.qty = Math.max(item.unit ? item.min : 1, line.qty + Number(target.dataset.step));
    refreshLinesAndTotals();
  }
}

// --- New order: typing (save into the draft as you type, without redrawing) ---
let searchTimer = null;
function handleNewOrderInput(event) {
  const el = event.target;
  if (el.id === "cust-search") {
    // Wait until typing pauses for 250ms before searching ("debouncing"),
    // so we don't ask the database on every single keystroke.
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchCustomers(el.value).catch(showError);
    }, 250);
    return;
  }
  if (el.classList.contains("line-note")) {
    draft.lines[Number(el.closest("li").dataset.index)].note = el.value;
    return;
  }
  if (el.form && el.form.id === "order-form" && el.name) {
    draft[el.name] = el.value;
    if (el.name === "registerTotal") document.getElementById("totals").innerHTML = totalsHTML(draftTotals());
  }
}

function handleNewOrderChange(event) {
  const el = event.target;
  if (el.id === "pick-cat") fillItemSelect();
  if (el.id === "pick-item") fillSizeSelect();
  if (el.classList.contains("qty-input")) {
    const index = Number(el.closest("li").dataset.index);
    const item = MENU_ITEMS[draft.lines[index].id];
    draft.lines[index].qty = Math.max(item.unit ? item.min : 1, parseInt(el.value, 10) || 1);
    refreshLinesAndTotals();
  }
}

// --- New order: saving (both the customer form and the order form) ---
async function handleNewOrderSubmit(event) {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === "customer-form") {
      const data = Object.fromEntries(new FormData(form));   // all fields -> { name: "...", phone: "...", ... }
      if (!data.name.trim()) throw new Error("Please enter the customer's name.");
      if (digitsOnly(data.phone).length < 10) throw new Error("Please enter a 10-digit phone number.");
      const saved = await Store.saveCustomer(data);
      toast("Saved " + saved.name);
      useCustomer(saved);
    }
    if (form.id === "order-form") {
      await saveOrder();
    }
  } catch (error) {
    const box = document.getElementById("order-error");
    if (form.id === "order-form" && box) {
      box.textContent = error.message;
      box.hidden = false;
    } else {
      showError(error);
    }
  }
}

async function saveOrder() {
  const isCatering = draft.kind === "catering";
  const isInstore = draft.kind === "instore";
  const isPhoneGrocery = draft.kind === "grocery";
  const isDelivery = draft.fulfillment === "delivery";
  const t = draftTotals();
  const bags = parseInt(draft.bags, 10) || 0;

  // Checks before saving
  if (isCatering && !draft.lines.length) throw new Error("Add at least one catering item.");
  if (isInstore && bags < 1) throw new Error("Enter how many bags.");
  if (isPhoneGrocery && !draft.itemsText.trim()) throw new Error("Type the grocery list.");
  if (isPhoneGrocery && !(t.subtotal > 0)) throw new Error("Enter the register total.");
  if (isPhoneGrocery && isDelivery && t.subtotal < GROCERY_DELIVERY_MINIMUM) {
    throw new Error("Phone deliveries need at least " + money(GROCERY_DELIVERY_MINIMUM) + ". This order is " + money(t.subtotal) + ".");
  }
  if (isDelivery && !draft.deliveryAddress.trim()) throw new Error("Enter the delivery address.");
  if (!draft.date || !draft.time) throw new Error("Choose the date and time.");

  const order = {
    customer_id: draft.customer.id,
    // In-store deliveries are saved as grocery deliveries marked source "instore"
    kind: isInstore ? "grocery" : draft.kind,
    source: isInstore ? "instore" : "staff",
    fulfillment: draft.fulfillment,
    due_at: toISO(draft.date, draft.time),
    // Catering lines are saved with their name and price AT THE TIME OF ORDER,
    // so old orders still show what was charged even if the menu changes later.
    items: isCatering ? draft.lines.map(function (line) {
      const item = MENU_ITEMS[line.id];
      const unitPrice = cateringUnitPrice(line);
      return {
        id: line.id, name: item.name, size: line.size,
        size_label: item.unit ? null : item.sizes[line.size][0],
        qty: line.qty, unit_price: unitPrice, line_total: roundCents(unitPrice * line.qty),
        label: cateringLineLabel(line), note: line.note
      };
    }) : (isInstore ? [] : groceryChecklist(draft.itemsText)),   // grocery: [{ text, picked }] for the in-basket checklist
    items_text: isCatering ? null : (isInstore ? bags + (bags === 1 ? " bag" : " bags") + " · shopped in store" : draft.itemsText.trim()),
    subtotal: t.subtotal,
    delivery_fee: t.fee,
    tax: t.tax,
    total: t.total,
    deposit_paid: roundCents(Number(draft.deposit) || 0),
    payment_method: isInstore ? "Paid in store" : (draft.payment || null),
    delivery_address: isDelivery ? draft.deliveryAddress.trim() : null,
    notes: draft.notes.trim() || null
  };

  const saved = await Store.createOrder(order);

  // First delivery for a customer with no address on file? Save it to their profile.
  if (isDelivery && !draft.customer.address) {
    await Store.saveCustomer(Object.assign({}, draft.customer, { address: draft.deliveryAddress.trim() }));
  }

  draft = emptyDraft();
  toast("Order #" + saved.id + " saved");
  location.hash = "#/order/" + saved.id;
}


/* ============ 7. SCREENS: CUSTOMERS ============ */

async function showCustomers() {
  view.innerHTML =
    '<div class="screen-head"><h1>Customers</h1></div>' +
    '<input id="all-cust-search" type="search" placeholder="Search by phone or name" aria-label="Search customers">' +
    '<ul class="card-list" id="cust-list"></ul>';

  async function load(query) {
    const list = await Store.findCustomers(query);
    document.getElementById("cust-list").innerHTML = list.length
      ? list.map(function (c) {
          return '<li><a class="card" href="#/customer/' + esc(c.id) + '"><strong>' + esc(c.name) + "</strong><br>" +
                 esc(prettyPhone(c.phone)) + (c.address ? " · " + esc(c.address) : "") + "</a></li>";
        }).join("")
      : '<li class="empty">No customers yet. They\'re added when you take a <a href="#/new">new order</a>.</li>';
  }

  let timer = null;
  view.oninput = function (event) {
    if (event.target.id !== "all-cust-search") return;
    clearTimeout(timer);
    timer = setTimeout(function () { load(event.target.value).catch(showError); }, 250);
  };
  view.onclick = null;
  view.onchange = null;
  view.onsubmit = null;
  await load("");
}

async function showCustomer(id) {
  const c = await Store.getCustomer(id);
  if (!c) {
    view.innerHTML = '<div class="empty">Customer not found. <a href="#/customers">Back</a></div>';
    return;
  }
  const orders = await Store.customerOrders(id);

  view.innerHTML =
    '<p><a href="#/customers" class="back">‹ Customers</a></p>' +
    '<div class="screen-head"><h1>' + esc(c.name) + "</h1></div>" +
    '<div class="panel">' +
      '<p><a href="tel:' + esc(c.phone) + '">' + icon("phone") + " " + esc(prettyPhone(c.phone)) + "</a></p>" +
      (c.address ? "<p>" + icon("pin") + " " + esc(fullAddress(c)) + "</p>" : "") +
      (c.notes ? '<p class="muted">' + esc(c.notes) + "</p>" : "") +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" data-action="new-for">' + icon("plus") + ' New order</button>' +
      "</div>" +
      '<details class="new-customer"><summary>Edit details</summary>' +
        '<form id="edit-customer" class="stack" novalidate>' + customerFieldsHTML(c) +
          '<button class="btn btn-primary" type="submit">Save changes</button></form>' +
      "</details>" +
    "</div>" +
    "<h2>Order history (" + orders.length + ")</h2>" +
    (orders.length
      ? '<ul class="card-list">' + orders.map(function (o) {
          return orderCardHTML(o).replace("</a></li>",
            "</a>" + '<button type="button" class="btn btn-small reorder-btn" data-action="reorder" data-id="' + o.id + '">' + icon("refresh") + ' Reorder</button></li>');
        }).join("") + "</ul>"
      : '<p class="muted">No orders yet.</p>');

  view.onclick = function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "new-for") {
      draft = emptyDraft();
      draft.customer = c;
      draft.deliveryAddress = fullAddress(c);
      location.hash = "#/new";
    }
    if (target.dataset.action === "reorder") {
      startReorder(orders.find(function (o) { return o.id === Number(target.dataset.id); }));
    }
  };
  view.oninput = null;
  view.onchange = null;
  view.onsubmit = async function (event) {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target));
      if (!data.name.trim()) throw new Error("Name can't be empty.");
      if (digitsOnly(data.phone).length < 10) throw new Error("Please enter a 10-digit phone number.");
      await Store.saveCustomer(Object.assign({ id: c.id }, data));
      toast("Customer updated");
      route();
    } catch (error) {
      showError(error);
    }
  };
}


/* ============ 8. SCREEN: SIGN IN ============ */

function showLogin() {
  view.innerHTML =
    '<form class="panel stack login" id="login-form" novalidate>' +
      "<h1>Staff sign in</h1>" +
      '<label>Email<input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<p class="error" id="login-error" role="alert" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Sign in</button>' +
    "</form>";

  view.onclick = null;
  view.oninput = null;
  view.onchange = null;
  view.onsubmit = async function (event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      currentUser = await Store.signIn(form.email.value.trim(), form.password.value);
      updateHeader();
      checkOnlineOrders();   // start counting website orders right after signing in
      location.hash = "#/orders";
    } catch (error) {
      const box = document.getElementById("login-error");
      box.textContent = error.message;
      box.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
}

function updateHeader() {
  document.getElementById("who").textContent = currentUser ? currentUser.email : "";
  document.getElementById("sign-out").hidden = !(IS_CLOUD && currentUser);
}


/* ============ 8b. LIVE ALERTS FOR WEBSITE ORDERS ============ */
// While the app is open, it checks for new website orders every 15 seconds.
// A brand-new one triggers: a banner at the top, a two-tone chime, a vibration
// (on phones that support it), and a count on the Orders tab.

const CHECK_EVERY_MS = 15000;
let onlineWaiting = [];        // website orders still "new" (not confirmed yet)
let knownOnlineIds = null;     // order numbers we've already seen (null = first check)
let checking = false;          // stops two checks from running at the same time

async function checkOnlineOrders() {
  if (checking || (IS_CLOUD && !currentUser)) return;
  checking = true;
  try {
    const list = await Store.listNewOnline();
    onlineWaiting = list;
    updateOnlineBadge();

    // The first check after opening the app only remembers what's already there;
    // after that, anything we haven't seen before is NEW and gets announced.
    if (knownOnlineIds !== null) {
      const fresh = list.filter(function (o) { return !knownOnlineIds.has(o.id); });
      if (fresh.length) announce(fresh[fresh.length - 1], fresh.length);
    }
    knownOnlineIds = new Set([].concat(Array.from(knownOnlineIds || []), list.map(function (o) { return o.id; })));
  } catch (error) {
    // No internet for a moment: just try again on the next check
  } finally {
    checking = false;
  }
}

// Count bubble on the Orders tab + the count in the browser tab's title
function updateOnlineBadge() {
  const badge = document.getElementById("online-badge");
  const n = onlineWaiting.length;
  badge.textContent = n;
  badge.hidden = n === 0;
  document.title = (n ? "(" + n + ") " : "") + "Food Dynasty Orders";
}

function announce(order, count) {
  const name = order.customer ? order.customer.name : "a customer";
  const banner = document.getElementById("alert-banner");
  document.getElementById("alert-text").textContent =
    "New online order #" + order.id + " from " + name +
    " · " + (order.fulfillment === "delivery" ? "Delivery " : "Pickup ") + prettyWhen(order.due_at) +
    (count > 1 ? " (+" + (count - 1) + " more)" : "");
  document.getElementById("alert-link").href = count > 1 ? "#/orders/online" : "#/order/" + order.id;
  banner.hidden = false;
  chime();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  // If staff are looking at the orders list, refresh it so the new order appears
  if ((location.hash || "#/orders").indexOf("#/orders") === 0) route();
}

// A two-note chime made with the Web Audio API (no sound file needed).
// Browsers only allow sound after someone has tapped the page once, so the audio
// is "unlocked" on the first tap after the app opens.
let audio = null;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch (error) { /* no sound support: the banner still shows */ }
}

function chime() {
  if (!audio) return;
  const start = audio.currentTime;
  [880, 1175].forEach(function (freq, i) {   // two notes, the second one higher
    const t = start + i * 0.25;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);    // quick fade in
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); // gentle fade out
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}


/* ============ 9. START-UP ============ */

(async function start() {
  document.getElementById("demo-banner").hidden = IS_CLOUD;

  document.getElementById("sign-out").addEventListener("click", async function () {
    await Store.signOut();
    currentUser = null;
    updateHeader();
    location.hash = "#/login";
  });

  try {
    currentUser = await Store.getUser();
  } catch (error) {
    currentUser = null;
  }
  updateHeader();

  // Live alerts: unlock sound on the first tap, hide the banner when it's tapped,
  // check right away, then every 15 seconds, and again whenever the app comes
  // back to the front (e.g. after switching apps on a phone).
  document.addEventListener("pointerdown", unlockAudio);
  document.getElementById("alert-link").addEventListener("click", function () {
    document.getElementById("alert-banner").hidden = true;
  });
  document.getElementById("alert-close").addEventListener("click", function () {
    document.getElementById("alert-banner").hidden = true;
  });
  setInterval(checkOnlineOrders, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkOnlineOrders();
  });

  await checkOnlineOrders();
  await route();
})();
