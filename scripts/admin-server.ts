/**
 * admin-server.ts — Lightweight Express admin for reviewing product matches.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... ADMIN_PASSWORD=secret npx tsx scripts/admin-server.ts
 */

import express, { Request, Response, NextFunction } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://sycfaajrlnkyczrauusx.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
const PORT = 3001;
const AUTH_COOKIE = "admin_auth";
const COOKIE_VALUE = Buffer.from(ADMIN_PASSWORD).toString("base64");
const PAGE_SIZE = 50;

if (!SUPABASE_SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_KEY environment variable is required.");
  console.error(
    "Usage: SUPABASE_SERVICE_KEY=<key> ADMIN_PASSWORD=secret npx tsx scripts/admin-server.ts"
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(score: number): string {
  if (score >= 0.85) return "#27ae60";
  if (score >= 0.6) return "#f39c12";
  return "#e74c3c";
}

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Auth middleware — skip for /login
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/login") return next();
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[AUTH_COOKIE] === COOKIE_VALUE) return next();
  res.redirect("/login");
}
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// GET /login
// ---------------------------------------------------------------------------

app.get("/login", (_req: Request, res: Response) => {
  res.send(loginPage());
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

app.post("/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (password === ADMIN_PASSWORD) {
    res.setHeader(
      "Set-Cookie",
      `${AUTH_COOKIE}=${encodeURIComponent(COOKIE_VALUE)}; Path=/; HttpOnly; SameSite=Lax`
    );
    res.redirect("/");
  } else {
    res.send(loginPage("Invalid password."));
  }
});

// ---------------------------------------------------------------------------
// GET / — Main dashboard
// ---------------------------------------------------------------------------

app.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Stats — totals
    const [
      { count: totalProducts },
      { count: totalMatched },
      { count: pendingCount },
    ] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase
        .from("product_matches")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved"),
      supabase
        .from("product_matches")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    // Per-retailer match counts (manual aggregation)
    const { data: allMatches } = await supabase
      .from("product_matches")
      .select("retailer_id, status");
    const perRetailer: Record<string, { total: number; approved: number; pending: number }> = {};
    for (const m of allMatches ?? []) {
      if (!perRetailer[m.retailer_id])
        perRetailer[m.retailer_id] = { total: 0, approved: 0, pending: 0 };
      perRetailer[m.retailer_id].total++;
      if (m.status === "approved") perRetailer[m.retailer_id].approved++;
      if (m.status === "pending") perRetailer[m.retailer_id].pending++;
    }

    // Pending matches with product info (paginated)
    const { data: pendingMatches, count: pendingTotal } = await supabase
      .from("product_matches")
      .select(
        "id, product_id, retailer_id, external_id, external_name, external_price, match_score, status, created_at, products!inner(name, brand, ppi_score)",
        { count: "exact" }
      )
      .eq("status", "pending")
      .order("match_score", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    // Retailers for config section
    const { data: retailers } = await supabase
      .from("retailers")
      .select("id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active")
      .order("name");

    const totalPages = Math.ceil((pendingTotal ?? 0) / PAGE_SIZE);

    res.send(
      dashboardPage({
        totalProducts: totalProducts ?? 0,
        totalMatched: totalMatched ?? 0,
        pendingCount: pendingCount ?? 0,
        perRetailer,
        matches: pendingMatches ?? [],
        page,
        totalPages,
        retailers: retailers ?? [],
      })
    );
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// POST /match/:id/approve
// ---------------------------------------------------------------------------

app.post("/match/:id/approve", async (req: Request, res: Response) => {
  try {
    await approveMatch(req.params.id as string);
    res.redirect("/");
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// POST /match/:id/reject
// ---------------------------------------------------------------------------

app.post("/match/:id/reject", async (req: Request, res: Response) => {
  try {
    await supabase
      .from("product_matches")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id as string);
    res.redirect("/");
  } catch (err) {
    console.error("Reject error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// POST /bulk-approve
// ---------------------------------------------------------------------------

app.post("/bulk-approve", async (req: Request, res: Response) => {
  try {
    const threshold = parseFloat(req.body.threshold);
    if (isNaN(threshold)) {
      res.status(400).send("Invalid threshold");
      return;
    }

    const { data: matches } = await supabase
      .from("product_matches")
      .select("id")
      .eq("status", "pending")
      .gte("match_score", threshold);

    let approved = 0;
    for (const m of matches ?? []) {
      try {
        await approveMatch(m.id);
        approved++;
      } catch (e) {
        console.error(`Failed to approve ${m.id}:`, e);
      }
    }
    console.log(`Bulk approved ${approved}/${(matches ?? []).length} matches with score >= ${threshold}`);
    res.redirect("/");
  } catch (err) {
    console.error("Bulk approve error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// POST /amazon-link
// ---------------------------------------------------------------------------

app.post("/amazon-link", async (req: Request, res: Response) => {
  try {
    const { product_id, amazon_url, price } = req.body as {
      product_id?: string;
      amazon_url?: string;
      price?: string;
    };
    if (!product_id || !amazon_url) {
      res.status(400).send("product_id and amazon_url are required");
      return;
    }

    // Extract ASIN from Amazon URL if possible
    const asinMatch = amazon_url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    const externalId = asinMatch ? asinMatch[1] : amazon_url;

    const numericPrice = parseFloat(price ?? "0") || 0;

    // Get Amazon retailer info
    const { data: retailer } = await supabase
      .from("retailers")
      .select("*")
      .eq("id", "amazon")
      .single();

    // Build affiliate URL
    let affiliateUrl = amazon_url;
    if (retailer?.affiliate_url_template && asinMatch) {
      affiliateUrl = retailer.affiliate_url_template
        .replace("{external_id}", externalId)
        .replace("{product_url}", encodeURIComponent(amazon_url))
        .replace("{base_url}", retailer.base_url ?? "https://www.amazon.com")
        .replace("{handle}", externalId);
    } else if (retailer?.affiliate_tag) {
      // Append tag to the URL
      const separator = amazon_url.includes("?") ? "&" : "?";
      affiliateUrl = `${amazon_url}${separator}tag=${retailer.affiliate_tag}`;
    }

    // Upsert product_match
    await supabase.from("product_matches").upsert(
      {
        product_id,
        retailer_id: "amazon",
        external_id: externalId,
        external_name: `Amazon: ${externalId}`,
        external_price: numericPrice,
        match_score: 1.0,
        status: "approved",
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: "product_id,retailer_id" }
    );

    // Upsert price_listing
    await supabase.from("price_listings").upsert(
      {
        product_id,
        retailer_id: "amazon",
        external_id: externalId,
        price: numericPrice,
        in_stock: true,
        product_url: amazon_url,
        affiliate_url: affiliateUrl,
        last_checked: new Date().toISOString(),
      },
      { onConflict: "product_id,retailer_id" }
    );

    // Update product price to lowest
    await updateProductLowestPrice(product_id);

    res.redirect("/");
  } catch (err) {
    console.error("Amazon link error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// POST /retailer/:id/update
// ---------------------------------------------------------------------------

app.post("/retailer/:id/update", async (req: Request, res: Response) => {
  try {
    const { affiliate_tag, is_active } = req.body as {
      affiliate_tag?: string;
      is_active?: string;
    };
    await supabase
      .from("retailers")
      .update({
        affiliate_tag: affiliate_tag || null,
        is_active: is_active === "on",
      })
      .eq("id", req.params.id as string);
    res.redirect("/");
  } catch (err) {
    console.error("Retailer update error:", err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/search?q=...
// ---------------------------------------------------------------------------

app.get("/api/products/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string) ?? "";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const { data } = await supabase
    .from("products")
    .select("id, name, brand, price")
    .ilike("name", `%${q}%`)
    .limit(10);
  res.json(data ?? []);
});

// ---------------------------------------------------------------------------
// Approve logic
// ---------------------------------------------------------------------------

async function approveMatch(matchId: string): Promise<void> {
  // 1. Update match status
  const { data: match, error: matchErr } = await supabase
    .from("product_matches")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("*")
    .single();

  if (matchErr || !match) {
    throw new Error(`Failed to update match ${matchId}: ${matchErr?.message}`);
  }

  // 2. Look up retailer
  const { data: retailer } = await supabase
    .from("retailers")
    .select("*")
    .eq("id", match.retailer_id)
    .single();

  if (!retailer) {
    throw new Error(`Retailer ${match.retailer_id} not found`);
  }

  // 3. Build product_url
  let productUrl: string;
  if (retailer.api_type === "shopify" && retailer.shop_domain) {
    // external_id is the Shopify handle
    productUrl = `https://${retailer.shop_domain}/products/${match.external_id}`;
  } else if (retailer.api_type === "bestbuy") {
    productUrl = `https://www.bestbuy.com/site/${match.external_id}.p`;
  } else {
    productUrl = `${retailer.base_url}/products/${match.external_id}`;
  }

  // 4. Build affiliate_url
  let affiliateUrl: string | null = null;
  if (retailer.affiliate_url_template) {
    affiliateUrl = retailer.affiliate_url_template
      .replace("{product_url}", encodeURIComponent(productUrl))
      .replace("{handle}", match.external_id)
      .replace("{base_url}", retailer.base_url)
      .replace("{external_id}", match.external_id);
  } else {
    affiliateUrl = productUrl;
  }

  // 5. Upsert price_listing
  await supabase.from("price_listings").upsert(
    {
      product_id: match.product_id,
      retailer_id: match.retailer_id,
      external_id: match.external_id,
      price: match.external_price ?? 0,
      in_stock: true,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      last_checked: new Date().toISOString(),
    },
    { onConflict: "product_id,retailer_id" }
  );

  // 6. Update product price to the lowest across all in-stock listings
  await updateProductLowestPrice(match.product_id);
}

async function updateProductLowestPrice(productId: string): Promise<void> {
  const { data: listings } = await supabase
    .from("price_listings")
    .select("price, affiliate_url")
    .eq("product_id", productId)
    .eq("in_stock", true)
    .gt("price", 0)
    .order("price", { ascending: true })
    .limit(1);

  if (listings && listings.length > 0) {
    await supabase
      .from("products")
      .update({
        price: listings[0].price,
        affiliate_url: listings[0].affiliate_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);
  }
}

// ---------------------------------------------------------------------------
// HTML Templates
// ---------------------------------------------------------------------------

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; line-height: 1.5; }
  a { color: #64b5f6; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
  h1 { color: #fff; margin-bottom: 8px; }
  h2 { color: #b0bec5; margin: 24px 0 12px; border-bottom: 1px solid #333; padding-bottom: 6px; }
  .stats-bar { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
  .stat-card { background: #16213e; border-radius: 8px; padding: 14px 20px; min-width: 140px; }
  .stat-card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { font-size: 28px; font-weight: 700; color: #fff; }
  .stat-card .value.green { color: #27ae60; }
  .stat-card .value.yellow { color: #f39c12; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #0f3460; color: #fff; padding: 10px 8px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  td { padding: 8px; font-size: 14px; border-bottom: 1px solid #222; }
  tr:nth-child(even) td { background: #16213e; }
  tr:nth-child(odd) td { background: #1a1a2e; }
  tr:hover td { background: #1f2b47; }
  .btn { display: inline-block; padding: 5px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; color: #fff; text-decoration: none; }
  .btn-green { background: #27ae60; } .btn-green:hover { background: #219a52; }
  .btn-red { background: #e74c3c; } .btn-red:hover { background: #c0392b; }
  .btn-blue { background: #2980b9; } .btn-blue:hover { background: #2471a3; }
  .btn-sm { padding: 3px 10px; font-size: 12px; }
  .score-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-weight: 700; font-size: 13px; color: #fff; }
  .pagination { display: flex; gap: 8px; margin: 16px 0; align-items: center; }
  .pagination a { padding: 6px 12px; background: #16213e; border-radius: 4px; color: #64b5f6; text-decoration: none; }
  .pagination a:hover { background: #0f3460; }
  .pagination .current { padding: 6px 12px; background: #0f3460; border-radius: 4px; color: #fff; font-weight: 700; }
  .form-row { display: flex; gap: 10px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
  input[type="text"], input[type="password"], input[type="number"], input[type="url"] { background: #16213e; border: 1px solid #333; color: #e0e0e0; padding: 8px 12px; border-radius: 4px; font-size: 14px; }
  input:focus { outline: none; border-color: #2980b9; }
  .section { background: #0d1b36; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .bulk-bar { display: flex; gap: 10px; margin: 12px 0; align-items: center; }
  .retailer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 12px; }
  .retailer-card { background: #16213e; border-radius: 8px; padding: 14px; }
  .retailer-card .name { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
  .retailer-card label { font-size: 13px; color: #888; display: block; margin-top: 6px; }
  .retailer-card input[type="text"] { width: 100%; margin-top: 2px; }
  .check-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .check-row input[type="checkbox"] { width: 16px; height: 16px; }
  .product-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ext-name { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions-cell { white-space: nowrap; }
  .actions-cell form { display: inline; }
  .login-box { max-width: 360px; margin: 120px auto; background: #16213e; border-radius: 12px; padding: 40px; text-align: center; }
  .login-box h1 { margin-bottom: 20px; }
  .login-box input { width: 100%; margin: 8px 0; }
  .login-box .btn { width: 100%; margin-top: 12px; padding: 10px; font-size: 15px; }
  .error-msg { color: #e74c3c; font-size: 14px; margin-top: 8px; }
  .amazon-section { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .amazon-section .field { display: flex; flex-direction: column; }
  .amazon-section .field label { font-size: 13px; color: #888; margin-bottom: 2px; }
  .amazon-section .field input { min-width: 250px; }
  #product-search-results { position: absolute; background: #16213e; border: 1px solid #333; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 100; display: none; }
  #product-search-results .result-item { padding: 8px 12px; cursor: pointer; font-size: 14px; }
  #product-search-results .result-item:hover { background: #0f3460; }
  .search-wrapper { position: relative; }
`;

function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Login — AudioL</title>
<style>${STYLES}</style>
</head><body>
<div class="login-box">
  <h1>AudioL Admin</h1>
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit" class="btn btn-blue">Login</button>
  </form>
  ${error ? `<p class="error-msg">${esc(error)}</p>` : ""}
</div>
</body></html>`;
}

interface DashboardData {
  totalProducts: number;
  totalMatched: number;
  pendingCount: number;
  perRetailer: Record<string, { total: number; approved: number; pending: number }>;
  matches: Array<Record<string, unknown>>;
  page: number;
  totalPages: number;
  retailers: Array<Record<string, unknown>>;
}

function dashboardPage(d: DashboardData): string {
  // Stats bar
  const statsHtml = `
    <div class="stats-bar">
      <div class="stat-card"><div class="label">Products</div><div class="value">${d.totalProducts}</div></div>
      <div class="stat-card"><div class="label">Matched</div><div class="value green">${d.totalMatched}</div></div>
      <div class="stat-card"><div class="label">Pending Review</div><div class="value yellow">${d.pendingCount}</div></div>
      ${Object.entries(d.perRetailer)
        .map(
          ([rid, c]) =>
            `<div class="stat-card"><div class="label">${esc(rid)}</div><div class="value">${c.approved}/${c.total}</div></div>`
        )
        .join("")}
    </div>`;

  // Pending matches table
  const matchRows = (d.matches ?? [])
    .map((m) => {
      const prod = m.products as Record<string, unknown> | null;
      const score = Number(m.match_score ?? 0);
      const color = scoreColor(score);
      return `<tr>
        <td class="product-name" title="${esc(prod?.name)}">${esc(prod?.name)}</td>
        <td>${esc(prod?.brand)}</td>
        <td>${prod?.ppi_score != null ? Number(prod.ppi_score).toFixed(2) : "—"}</td>
        <td>${esc(m.retailer_id)}</td>
        <td class="ext-name" title="${esc(m.external_name)}">${esc(m.external_name)}</td>
        <td>$${Number(m.external_price ?? 0).toFixed(2)}</td>
        <td><span class="score-badge" style="background:${color}">${score.toFixed(3)}</span></td>
        <td class="actions-cell">
          <form method="POST" action="/match/${esc(m.id)}/approve"><button class="btn btn-green btn-sm" type="submit">Approve</button></form>
          <form method="POST" action="/match/${esc(m.id)}/reject"><button class="btn btn-red btn-sm" type="submit">Reject</button></form>
        </td>
      </tr>`;
    })
    .join("");

  const matchesTableHtml = `
    <h2>Pending Matches (${d.pendingCount})</h2>
    <div class="bulk-bar">
      <form method="POST" action="/bulk-approve">
        <input type="hidden" name="threshold" value="0.85">
        <button type="submit" class="btn btn-green">Approve all &ge; 0.85</button>
      </form>
      <form method="POST" action="/bulk-approve">
        <input type="hidden" name="threshold" value="0.75">
        <button type="submit" class="btn btn-blue">Approve all &ge; 0.75</button>
      </form>
    </div>
    <table>
      <thead><tr>
        <th>Product</th><th>Brand</th><th>PPI</th><th>Retailer</th><th>External Name</th><th>Price</th><th>Score</th><th>Actions</th>
      </tr></thead>
      <tbody>${matchRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:#888;">No pending matches.</td></tr>'}</tbody>
    </table>`;

  // Pagination
  const paginationHtml =
    d.totalPages > 1
      ? `<div class="pagination">
        ${d.page > 1 ? `<a href="/?page=${d.page - 1}">&laquo; Prev</a>` : ""}
        ${Array.from({ length: d.totalPages }, (_, i) => i + 1)
          .filter(
            (p) =>
              p === 1 ||
              p === d.totalPages ||
              Math.abs(p - d.page) <= 2
          )
          .reduce<{ html: string; last: number }>(
            (acc, p) => {
              const gap = p - acc.last > 1 ? '<span style="color:#555;">...</span>' : "";
              const link =
                p === d.page
                  ? `<span class="current">${p}</span>`
                  : `<a href="/?page=${p}">${p}</a>`;
              return { html: acc.html + gap + link, last: p };
            },
            { html: "", last: 0 }
          ).html}
        ${d.page < d.totalPages ? `<a href="/?page=${d.page + 1}">Next &raquo;</a>` : ""}
      </div>`
      : "";

  // Amazon manual entry
  const amazonHtml = `
    <h2>Amazon Manual Link</h2>
    <div class="section">
      <form method="POST" action="/amazon-link">
        <div class="amazon-section">
          <div class="field search-wrapper">
            <label for="product-search">Product</label>
            <input type="text" id="product-search" placeholder="Search products..." autocomplete="off">
            <input type="hidden" name="product_id" id="amazon-product-id">
            <div id="product-search-results"></div>
          </div>
          <div class="field">
            <label for="amazon-url">Amazon URL</label>
            <input type="url" id="amazon-url" name="amazon_url" placeholder="https://www.amazon.com/dp/B0..." required style="min-width:350px;">
          </div>
          <div class="field">
            <label for="amazon-price">Price ($)</label>
            <input type="number" id="amazon-price" name="price" step="0.01" min="0" placeholder="0.00" style="width:100px;">
          </div>
          <button type="submit" class="btn btn-blue" style="height:38px;">Save</button>
        </div>
      </form>
    </div>`;

  // Retailer config
  const retailerCards = (d.retailers ?? [])
    .map(
      (r) => `
      <div class="retailer-card">
        <div class="name">${esc(r.name)}</div>
        <form method="POST" action="/retailer/${esc(r.id)}/update">
          <label>Affiliate Tag
            <input type="text" name="affiliate_tag" value="${esc(r.affiliate_tag ?? "")}" placeholder="None">
          </label>
          <div class="check-row">
            <input type="checkbox" name="is_active" id="active-${esc(r.id)}" ${r.is_active ? "checked" : ""}>
            <label for="active-${esc(r.id)}" style="display:inline;margin:0;">Active</label>
          </div>
          <button type="submit" class="btn btn-blue btn-sm" style="margin-top:8px;">Update</button>
        </form>
      </div>`
    )
    .join("");

  const retailerHtml = `
    <h2>Retailer Config</h2>
    <div class="retailer-grid">${retailerCards}</div>`;

  // Autocomplete script
  const script = `
  <script>
  (function() {
    const input = document.getElementById('product-search');
    const hidden = document.getElementById('amazon-product-id');
    const dropdown = document.getElementById('product-search-results');
    let debounceTimer;

    input.addEventListener('input', function() {
      clearTimeout(debounceTimer);
      const q = this.value.trim();
      if (q.length < 2) { dropdown.style.display = 'none'; return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch('/api/products/search?q=' + encodeURIComponent(q));
          const products = await res.json();
          if (products.length === 0) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = products.map(p =>
            '<div class="result-item" data-id="' + p.id + '">' +
            (p.brand ? p.brand + ' ' : '') + p.name +
            (p.price ? ' ($' + Number(p.price).toFixed(2) + ')' : '') +
            '</div>'
          ).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';
        } catch(e) { dropdown.style.display = 'none'; }
      }, 250);
    });

    dropdown.addEventListener('click', function(e) {
      const item = e.target.closest('.result-item');
      if (!item) return;
      hidden.value = item.dataset.id;
      input.value = item.textContent;
      dropdown.style.display = 'none';
    });

    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target) && e.target !== input) {
        dropdown.style.display = 'none';
      }
    });
  })();
  </script>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AudioL Admin</title>
<style>${STYLES}</style>
</head><body>
<div class="container">
  <h1>AudioL Admin Dashboard</h1>
  ${statsHtml}
  ${matchesTableHtml}
  ${paginationHtml}
  ${amazonHtml}
  ${retailerHtml}
</div>
${script}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  AudioL Admin running at http://localhost:${PORT}\n`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Supabase: ${SUPABASE_URL}\n`);
});
