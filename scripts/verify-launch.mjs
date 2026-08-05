// read-only launch check against the live supabase project.
//
// selects only. it never writes, so it is safe to run against production while
// the truck is trading. run with:
//   node --env-file=.env.local scripts/verify-launch.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or a supabase key");
  process.exit(1);
}

async function select(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!response.ok) {
    return { error: `${response.status} ${await response.text()}` };
  }

  return { data: await response.json() };
}

function line(label, value) {
  console.log(`${label.padEnd(26)} ${value}`);
}

const checks = [];

// the settings row the whole operating mode hangs off
const settings = await select("app_settings?select=*&id=eq.global");
if (settings.error) {
  checks.push(["app_settings", `FAIL ${settings.error}`]);
} else if (settings.data.length === 0) {
  checks.push(["app_settings", "FAIL no global row"]);
} else {
  const row = settings.data[0];
  checks.push([
    "app_settings",
    `ok  kds=${row.kds_enabled} mode=${row.inventory_mode} copies=${row.receipt_copies}`,
  ]);
}

// the seven fusions
const products = await select(
  "products?select=name,base_price,is_available,category_id&order=sort_order",
);
if (products.error) {
  checks.push(["products", `FAIL ${products.error}`]);
} else {
  const live = products.data.filter((p) => p.is_available);
  const retired = products.data.length - live.length;
  checks.push(["products", `ok  ${live.length} live, ${retired} retired`]);
}

const categories = await select("categories?select=name,color&order=sort_order");
if (categories.error) {
  checks.push(["categories", `FAIL ${categories.error}`]);
} else {
  const coloured = categories.data.filter((c) => c.color).length;
  checks.push([
    "categories",
    `ok  ${categories.data.length} total, ${coloured} with a brand colour`,
  ]);
}

// one null product_id means one reusable price on the whole menu
const extras = await select(
  "modifiers?select=name,extra_price,product_id,is_active&order=created_at",
);
if (extras.error) {
  checks.push(["global_extras", `FAIL ${extras.error}`]);
} else {
  const active = extras.data.filter((extra) => extra.is_active);
  const global = active.filter((extra) => extra.product_id === null);
  checks.push([
    "global_extras",
    global.length === active.length
      ? `ok  ${global.length} active, all shared`
      : `FAIL ${active.length - global.length} active extras still product-only`,
  ]);
}

// finished-goods stock rows must exist for every sellable product
const stock = await select("product_stock?select=product_id,current_stock");
if (stock.error) {
  checks.push(["product_stock", `FAIL ${stock.error}`]);
} else {
  checks.push(["product_stock", `ok  ${stock.data.length} rows`]);
}

const counters = await select(
  "daily_ticket_counters?select=business_date,next_number&order=business_date.desc&limit=3",
);
if (counters.error) {
  checks.push(["daily_ticket_counters", `FAIL ${counters.error}`]);
} else {
  checks.push([
    "daily_ticket_counters",
    counters.data.length
      ? `ok  latest ${counters.data[0].business_date} next=${counters.data[0].next_number}`
      : "ok  no sales yet today",
  ]);
}

const staff = await select("profiles?select=name,role,is_active");
if (staff.error) {
  checks.push(["profiles", `FAIL ${staff.error}`]);
} else {
  const active = staff.data.filter((p) => p.is_active).length;
  const byRole = staff.data.reduce((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});
  checks.push([
    "profiles",
    `ok  ${staff.data.length} accounts (${active} active) ${JSON.stringify(byRole)}`,
  ]);
}

console.log("");
for (const [label, value] of checks) {
  line(label, value);
}
console.log("");

if (!products.error) {
  console.log("live menu:");
  const nameByCategory = new Map();
  if (!categories.error) {
    const cats = await select("categories?select=id,name");
    if (!cats.error) {
      for (const c of cats.data) nameByCategory.set(c.id, c.name);
    }
  }
  for (const p of products.data.filter((p) => p.is_available)) {
    console.log(
      `  ${(nameByCategory.get(p.category_id) ?? "-").padEnd(12)} ${p.name.padEnd(28)} ${p.base_price}`,
    );
  }
}

const failed = checks.filter(([, value]) => value.startsWith("FAIL"));
console.log("");
console.log(failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`);
