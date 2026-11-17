/*
  CATERING MENU DATA
  ------------------
  Every catering item and price lives here, in ONE place, as plain JavaScript data.
  The order page (order.html + js/order.js) builds itself from this list.
  To change a price or add a dish, edit this file only.

  (The catering.html page is still written by hand. If you change a price here,
  change it there too. A future version could build both pages from this file.)

  How a category is described:
    id     a short code, used in links and as part of each item's ID
    name   what customers see
    note   small text under the category name (optional)
    sizes  the size/price options shared by every item in the category, as
           [label, price] pairs, e.g. [["Half tray", 50], ["Full tray", 80]]
    items  the dishes. A dish can be:
           - just a name ("Baked Ziti"): it uses the category's sizes
           - an object with its OWN sizes: { name, sizes: [[...], [...]] }
           - an object priced PER UNIT: { name, unit: "person", price: 15, min: 20 }
             (the customer types how many people / feet, starting at the minimum)
           Any object can also have a "hint": extra info shown under the name.

  Prices come from the store's printed catering menu. Confirm with the store
  before taking real orders.
*/

// Small helper so platters with small/large prices are short to write:
// platter("Chicken Wings", 60, 100) -> { name: "Chicken Wings", sizes: [["Small", 60], ["Large", 100]] }
function platter(name, small, large) {
  return { name: name, sizes: [["Small", small], ["Large", large]] };
}

// SEASONAL CATEGORIES: a category with season: "thanksgiving" only shows on the
// website's order page from Nov 1 until 3 days before Thanksgiving (orders need
// 3 days' notice). Thanksgiving is the 4th Thursday of November, so the dates
// move every year on their own. The staff app always shows every category.
function thanksgivingDate(year) {
  const nov1 = new Date(year, 10, 1);                  // months count from 0: 10 = November
  const firstThursday = 1 + ((4 - nov1.getDay() + 7) % 7);
  return new Date(year, 10, firstThursday + 21);      // + 3 weeks = 4th Thursday
}

function categoryInSeason(category, today) {
  if (category.season !== "thanksgiving") return true;
  const day = today || new Date();
  const lastOrderDay = thanksgivingDate(day.getFullYear());
  lastOrderDay.setDate(lastOrderDay.getDate() - 3);
  return day >= new Date(day.getFullYear(), 10, 1) && day <= new Date(lastOrderDay.getFullYear(), lastOrderDay.getMonth(), lastOrderDay.getDate(), 23, 59);
}

const CATERING_MENU = [
  {
    id: "thanksgiving",
    name: "Thanksgiving Dinner Specials",
    season: "thanksgiving",
    note: "Plus tax. Write your choices in the item's note: 1 stuffing, 1 pasta, 1 vegetable, 1 potato and your pie. " +
          "Stuffing: Traditional Vegetable, Sausage, or Cranberry & Vegetables. " +
          "Pasta: Baked Ziti, Penne Vodka, Penne Alfredo, or Mac & Cheese. " +
          "Vegetable: Broccoli Oreganata, Stuffed Mushrooms, String Beans, or Grilled Vegetables. " +
          "Potato: Mashed, Roasted, Seasoned Wedges, Candied Yams, Buttery Mashed, Garlic Mashed, Caramelized Onion, or Sweet Potato.",
    items: [
      { name: "Thanksgiving Dinner for 8–10", sizes: [["12–14 lb turkey, half trays", 299]],
        hint: "Cooked turkey with half trays of stuffing, pasta, vegetable and potato. Includes turkey gravy, cranberry sauce, dinner rolls and 1 pie." },
      { name: "Thanksgiving Dinner for 15–20", sizes: [["18–20 lb turkey, full trays", 399]],
        hint: "Cooked turkey with full trays of stuffing, pasta, vegetable and potato. Includes prosciutto bread, turkey gravy, cranberry sauce, dinner rolls and 2 pies." }
    ]
  },
  {
    id: "packages",
    name: "Buffet Packages",
    note: "Priced per person, plus tax. Minimum 20 people.",
    items: [
      { name: "Hot Buffet", unit: "person", price: 15, min: 20,
        hint: "Choose 1 pasta, 3 entrées and 1 eggplant dish. Write your picks in the notes." },
      { name: "Deluxe Hot Buffet", unit: "person", price: 17, min: 20,
        hint: "Choose 2 pastas, 1 side, 3 entrées and 1 eggplant dish. Write your picks in the notes." },
      { name: "Cold Buffet", unit: "person", price: 11.99, min: 20,
        hint: "Choose 4 meats and 2 cheeses. Includes rolls, breads, salads and condiments." },
      { name: "Breakfast Buffet", unit: "person", price: 14, min: 20,
        hint: "Choose 1 of home fries/bacon/sausage and 2 of French toast/pancakes/eggs/wraps." },
      { name: "Continental Breakfast", unit: "person", price: 10, min: 20,
        hint: "Muffins, danishes, bagels, croissants, fruit, coffee, tea and orange juice." }
    ]
  },
  {
    id: "heroes",
    name: "Giant Heroes",
    sizes: [["3 ft", 75], ["4 ft", 100], ["5 ft", 125], ["6 ft", 140]],
    items: [
      "Grilled Chicken Hero",
      "American Hero",
      "Italian Hero",
      "Chicken Cutlet Hero",
      "Vegetarian Delight Hero",
      "Eggplant Hero",
      { name: "Build Your Own Hero", unit: "foot", price: 29.99, min: 3,
        hint: "Priced per foot. Write your fillings in the notes. Prosciutto not included." }
    ]
  },
  {
    id: "hot-platters",
    name: "Hot Platters",
    items: [
      platter("Chicken Wings", 60, 100),
      platter("Boneless Wings", 60, 100),
      platter("Hot Antipasto", 70, 100),
      platter("Deluxe Hot Antipasto", 80, 120),
      platter("Mini Fried Finger Foods", 60, 90),
      platter("Mini Quesadillas", 60, 90),
      platter("Pigs in a Blanket", 60, 80),
      platter("Stuffed Mushrooms", 50, 80),
      platter("Mini Sliders", 60, 100)
    ]
  },
  {
    id: "cold-platters",
    name: "Cold Platters",
    items: [
      platter("Grilled Vegetables", 60, 80),
      platter("Cold Antipasto", 70, 100),
      platter("Premium Antipasto", 80, 120),
      platter("Fresh Vegetables & Dip", 50, 70),
      platter("Caprese", 60, 90),
      platter("Finger Sandwiches", 60, 100),
      platter("Assorted Wraps", 70, 100),
      platter("International Cheese", 60, 90),
      platter("Fresh Fruit Bowl", 60, 80),
      platter("Shrimp Cocktail", 80, 120),
      platter("Artisan Sandwiches", 80, 110),
      platter("Cold Cut Platter", 70, 100),
      platter("Panini Platter", 70, 120),
      { name: "Guacamole & Tortilla Chips", sizes: [["One size", 40]] },
      { name: "Spinach & Artichoke Dip", sizes: [["One size", 40]] }
    ]
  },
  {
    id: "pasta",
    name: "Pasta",
    sizes: [["Half tray", 50], ["Full tray", 80]],
    items: [
      "Linguine & Clams", "Stuffed Shells", "Baked Ziti", "Meat Lasagna", "Cheese Lasagna",
      "Rigatoni alla Vodka", "Penne alla Vodka", "Rigatoni di Pomodoro", "Pasta Primavera",
      "Bowtie Pasta", "Penne with Broccoli Rabe", "Penne with Broccoli",
      "Penne with Wild Mushrooms", "Rigatoni Bolognese", "Rigatoni Confetti",
      "Cavatelli with Broccoli", "Tricolor Tortellini", "Ravioli Marinara", "Orecchiette",
      "Linguine with Garlic & Oil", "Four-Cheese Baked Mac & Cheese"
    ]
  },
  {
    id: "eggplant",
    name: "Eggplant",
    sizes: [["Half tray", 50], ["Full tray", 70]],
    items: [
      "Eggplant Parmigiana", "Eggplant Rollatini", "Eggplant Rolled with Spinach",
      "Eggplant with White Sauce"
    ]
  },
  {
    id: "chicken",
    name: "Chicken",
    sizes: [["Half tray", 70], ["Full tray", 100]],
    items: [
      "Chicken Fingers", "Chicken Cutlet Parmesan", "Chicken Francaise", "Chicken Marsala",
      "Chicken Rollatini", "Chicken Oreganato", "Chicken & Broccoli", "Stuffed Chicken Breast",
      "Chicken Cordon Bleu", "Chicken Sorrentino", "Chicken Teriyaki",
      "Grilled Chicken & Vegetables", "Chicken & Artichokes", "Chicken Bianco",
      "Chicken Arrabiata", "Sesame Chicken", "Bacon-Wrapped Chicken",
      "Stuffed Chicken in Fig Sauce", "Chicken Cacciatore"
    ]
  },
  {
    id: "beef",
    name: "Beef",
    sizes: [["Half tray", 70], ["Full tray", 100]],
    items: [
      "Pepper Steak", "Meatballs in Sauce", "Roast Beef with Mushroom Gravy", "Beef Teriyaki",
      "Beef & Broccoli", "Beef Rollatini",
      { name: "Braised Short Ribs", sizes: [["Half tray", 80], ["Full tray", 110]] },
      { name: "Beef Medallions", sizes: [["Half tray", 90], ["Full tray", 160]] },
      { name: "Grilled Skirt Steak", sizes: [["Half tray", 100], ["Full tray", 180]] }
    ]
  },
  {
    id: "pork",
    name: "Pork",
    sizes: [["Half tray", 70], ["Full tray", 100]],
    items: [
      "Sausage & Peppers", "Sausage & Broccoli Rabe", "Baked Virginia Ham", "Stuffed Loin of Pork",
      "Pork Rollatini", "Hawaiian Roast Pork", "Pork & Mushrooms", "BBQ Ribs",
      "Boneless Pork Chops", "Pork Cutlet Parmesan", "Pork Filet Marsala"
    ]
  },
  {
    id: "seafood",
    name: "Seafood",
    note: "Lobster Fra Diavolo is market price: ask for it in the notes and we'll call you with a price.",
    sizes: [["Half tray", 80], ["Full tray", 120]],
    items: [
      "Calamari Marinara", "Fried Calamari", "Sweet & Sour Calamari", "Zuppa di Mussels",
      "Shrimp in Butter Sauce", "Shrimp Parmesan", "Panko-Crusted Shrimp", "Stuffed Fillet of Sole",
      "Spicy Tomato Glazed Salmon", "Tilapia & Broccoli Rabe", "Beer-Battered Fried Tilapia"
    ]
  },
  {
    id: "gluten-free",
    name: "Gluten-Free",
    items: [
      { name: "GF Penne alla Vodka", sizes: [["Half tray", 60], ["Full tray", 90]] },
      { name: "GF Rigatoni di Pomodoro", sizes: [["Half tray", 60], ["Full tray", 90]] },
      { name: "GF Chicken Francaise", sizes: [["Half tray", 80], ["Full tray", 110]] },
      { name: "GF Chicken Cutlet Parmigiana", sizes: [["Half tray", 80], ["Full tray", 110]] },
      { name: "GF Grilled Chicken", sizes: [["Half tray", 80], ["Full tray", 110]] },
      { name: "GF Eggplant Parmigiana", sizes: [["Half tray", 60], ["Full tray", 90]] },
      { name: "GF Sausage & Peppers", sizes: [["Half tray", 80], ["Full tray", 110]] },
      { name: "GF Pepper Steak", sizes: [["Half tray", 80], ["Full tray", 100]] },
      { name: "GF Grilled Skirt Steak", sizes: [["Half tray", 100], ["Full tray", 180]] },
      { name: "GF String Bean Almondine", sizes: [["Half tray", 60], ["Full tray", 90]] },
      { name: "GF Broccoli Rabe", sizes: [["Half tray", 60], ["Full tray", 90]] }
    ]
  },
  {
    id: "sides",
    name: "Side Dishes",
    sizes: [["Half tray", 50], ["Full tray", 80]],
    items: [
      "Broccoli Oreganato", "Broccoli with Garlic & Oil", "Broccoli Rabe",
      "Baby Carrots in Butter Sauce", "String Bean Almondine", "Sautéed Spinach",
      "Sautéed Peas & Mushrooms", "Wild Mushrooms", "Whipped Potatoes", "Roasted Potatoes",
      "Mashed Sweet Potatoes", "Roasted Vegetables", "Pearl Couscous",
      { name: "Mini Rice Balls / Prosciutto Balls / Croquettes",
        hint: "Mix & match: write your choice in the notes." }
    ]
  },
  {
    id: "breakfast",
    name: "Breakfast Trays",
    items: [
      { name: "Breakfast Bar", sizes: [["One size", 50]],
        hint: "Yogurt, granola, berries, almonds and chocolate chips." },
      { name: "Breakfast Basket", sizes: [["One size", 60]],
        hint: "Muffins, croissants and crumb cake danishes." }
    ]
  },
  {
    id: "salads",
    name: "Salads",
    note: "Dressing served on the side.",
    sizes: [["Small bowl", 40], ["Large bowl", 70]],
    items: [
      "Tossed Salad", "Caesar Salad", "Arugula & Orange Salad", "House Special Salad",
      "Waldorf Salad", "Chef Salad", "Arugula, Pear & Fig Salad", "Mediterranean Salad",
      "Mediterranean Pasta Salad", "Cavatelli Pesto Salad", "Gentleman's Bowtie",
      "Tri-Color Tortellini Salad", "Farfalle with Prosciutto & Basil", "Southwest Bowtie Salad"
    ]
  },
  {
    id: "kids",
    name: "Kids Corner",
    sizes: [["Half tray", 40], ["Full tray", 70]],
    items: ["Chicken Fingers (Kids)", "Mac & Cheese", "French Fries", "Spaghetti & Meatballs", "Mozzarella Sticks"]
  },
  {
    id: "bakery",
    name: "Bakery",
    items: [
      platter("Brownie & Cannoli Platter", 70, 100),
      platter("Cookie Tray", 70, 90),
      platter("Assorted Mini Pastries", 80, 100)
    ]
  }
];
