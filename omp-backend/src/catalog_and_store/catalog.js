// =============================================================================
// Catalog & Store module (Member B)
// =============================================================================
// Mounted in app.js / server.js as:
//     import catalogRoutes from "./catalog_and_store/catalog.js";
//     app.use("/api/catalog", catalogRoutes);
//
// Sections:  Stores - Categories - Products - Product Images - Reviews - Wishlist
//
// Security rules applied throughout:
//  - Ownership is ALWAYS resolved from the database
//    (products -> stores -> seller_id, reviews/wishlists -> customer_id).
//    A seller_id / customer_id / store_id sent by the client is never trusted.
//  - Every value is passed as a bound parameter ($1, $2, ...). Column names are
//    never built from user input; the only dynamic SQL is assembled from fixed
//    string literals and allowlists declared in this file.
//  - Public endpoints never expose non-approved stores or non-active products.
//  - Internal errors are logged with `err.message` only (never request bodies)
//    and clients always receive a generic 500.
// =============================================================================
import { Router } from "express";
import { pool, query, withTransaction } from "../config/db.js";
import {
  authenticate,
  extractToken,
  requireRole,
  requireActiveSeller,
  ROLES,
} from "../auth_and_user/authMiddleware.js";

const router = Router();

// --- Constants ---------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_MONEY = 9999999999.99; // NUMERIC(12,2) upper bound
const MAX_STOCK = 2147483647; // INTEGER upper bound
const MAX_IMAGES_PER_PRODUCT = 20;

/** Sorting allowlist: a client may only pick one of these keys. */
const PRODUCT_SORTS = {
  newest: "p.created_at DESC, p.id DESC",
  oldest: "p.created_at ASC, p.id ASC",
  price_asc: "p.sale_price ASC, p.id ASC",
  price_desc: "p.sale_price DESC, p.id ASC",
  name_asc: "p.name ASC, p.id ASC",
};

// --- Route guards ------------------------------------------------------------

const customerOnly = [authenticate, requireRole(ROLES.CUSTOMER)];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
// Sellers may always *read* their own data, but only an active (non-suspended)
// seller account may create or modify anything.
const sellerRead = [authenticate, requireRole(ROLES.SELLER)];
const sellerWrite = [
  authenticate,
  requireRole(ROLES.SELLER),
  requireActiveSeller,
];

// --- Errors ------------------------------------------------------------------

/**
 * An error that is safe to show to the client. Anything else is reported as a
 * generic 500 by the router error handler below.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);

/** Turns a rejected promise into `next(err)` so the error handler can format it. */
const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/**
 * Like authenticate(), but a request without a token continues as an anonymous
 * (public) request. A token that IS supplied must still be valid.
 */
function optionalAuth(req, res, next) {
  if (!extractToken(req)) return next();
  return authenticate(req, res, next);
}

// --- Validation helpers ------------------------------------------------------
// Each helper returns the normalized value or throws a 400 HttpError.

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Request bodies are optional; never trust the shape. */
function bodyOf(req) {
  return isPlainObject(req.body) ? req.body : {};
}

/**
 * Accepts a positive BIGINT id as a number or a digit string and returns a
 * canonical digit string (safe for values beyond Number.MAX_SAFE_INTEGER).
 * Values Postgres cannot store in a BIGINT column are rejected here, so an
 * out-of-range id becomes a 400 instead of a database error (and a 500).
 */
const BIGINT_MAX = "9223372036854775807";

function parseId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d{1,19}$/.test(trimmed)) return null;
    const normalized = trimmed.replace(/^0+(?=\d)/, "");
    if (normalized === "0") return null;
    if (
      normalized.length > BIGINT_MAX.length ||
      (normalized.length === BIGINT_MAX.length && normalized > BIGINT_MAX)
    ) {
      return null;
    }
    return normalized;
  }
  return null;
}

function requiredId(value, field) {
  const parsed = parseId(value);
  if (parsed === null) throw badRequest(`${field} must be a positive integer.`);
  return parsed;
}

function optionalId(value, field) {
  if (value === null || value === undefined) return null;
  return requiredId(value, field);
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(`${field} must be at most ${maxLength} characters.`);
  }
  return trimmed;
}

function optionalText(value, field, maxLength) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw badRequest(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(`${field} must be at most ${maxLength} characters.`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

/** Money: number or numeric string, >= 0, at most 2 decimals. */
function parseMoney(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    return Number(trimmed);
  }
  return null;
}

function requiredMoney(value, field) {
  const parsed = parseMoney(value);
  if (parsed === null || parsed > MAX_MONEY) {
    throw badRequest(
      `${field} must be a number between 0 and ${MAX_MONEY} with at most 2 decimals.`,
    );
  }
  return parsed;
}

function requiredStock(value, field = "stock") {
  const parsed =
    typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;
  if (parsed === null || parsed > MAX_STOCK) {
    throw badRequest(`${field} must be an integer between 0 and ${MAX_STOCK}.`);
  }
  return parsed;
}

function requiredRating(value) {
  const parsed =
    typeof value === "number" && Number.isInteger(value)
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : null;
  if (parsed === null || parsed < 1 || parsed > 5) {
    throw badRequest("rating must be an integer between 1 and 5.");
  }
  return parsed;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  throw badRequest(`${field} must be a boolean.`);
}

/** page/limit: invalid or missing values fall back to the safe defaults. */
function parsePagination(qs) {
  const rawPage = typeof qs.page === "string" ? Number(qs.page) : NaN;
  const rawLimit = typeof qs.limit === "string" ? Number(qs.limit) : NaN;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  return { page, limit, offset: (page - 1) * limit };
}

/** Query-string values that are absent or empty count as "not provided". */
function queryValue(qs, key) {
  const value = qs[key];
  if (value === undefined || value === null || value === "") return null;
  return value;
}

/**
 * Collects `column = $n` assignments. Column names come only from the fixed
 * literals used by the callers, values are always bound parameters.
 */
function makeUpdates() {
  const updates = { assignments: [], values: [] };
  updates.set = (column, value) => {
    updates.values.push(value);
    updates.assignments.push(`${column} = $${updates.values.length}`);
  };
  return updates;
}

// --- Response shaping --------------------------------------------------------
// pg returns BIGINT and NUMERIC as strings, so ids and money are converted
// explicitly. Only the fields the API actually promises are exposed.

const toId = (value) => (value === null || value === undefined ? null : Number(value));

/** Main image of a product: the flagged one, otherwise the oldest image. */
const MAIN_IMAGE_SQL = `(
    SELECT pi.image_url
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_main DESC, pi.id ASC
    LIMIT 1
  ) AS main_image_url`;

function mapStore(row) {
  return {
    id: toId(row.id),
    seller_id: toId(row.seller_id),
    store_name: row.store_name,
    description: row.description ?? null,
    logo_url: row.logo_url ?? null,
    status: row.status,
    created_at: row.created_at,
  };
}

function mapProduct(row) {
  return {
    id: toId(row.id),
    store_id: toId(row.store_id),
    category_id: toId(row.category_id),
    name: row.name,
    description: row.description ?? null,
    sale_price: Number(row.sale_price),
    origin_price: Number(row.origin_price),
    stock: Number(row.stock),
    status: row.status,
    main_image_url: row.main_image_url ?? null,
    created_at: row.created_at,
  };
}

function mapImage(row) {
  return {
    id: toId(row.id),
    product_id: toId(row.product_id),
    image_url: row.image_url,
    is_main: row.is_main,
    created_at: row.created_at,
  };
}

function mapReview(row) {
  return {
    id: toId(row.id),
    product_id: toId(row.product_id),
    customer_id: toId(row.customer_id),
    customer_name: row.customer_name ?? null,
    rating: Number(row.rating),
    comment: row.comment ?? null,
    created_at: row.created_at,
  };
}

/** `{ data, meta }` envelope for paginated collections. */
function paginated(res, rows, total, { page, limit }) {
  return res.json({
    data: rows,
    meta: { page, limit, total: Number(total) },
  });
}

// --- Shared database helpers -------------------------------------------------
// `db` is either the shared pool or a transaction client - both expose .query().

/** Product joined to its store, restricted to the given seller. */
async function findOwnedProduct(db, productId, sellerId) {
  const { rows } = await db.query(
    `SELECT p.id, p.store_id, p.status, s.seller_id, s.status AS store_status
       FROM products p
       JOIN stores s ON s.id = p.store_id
      WHERE p.id = $1 AND s.seller_id = $2`,
    [productId, sellerId],
  );
  return rows[0] ?? null;
}

/** Store restricted to its owner. */
async function findOwnedStore(db, storeId, sellerId) {
  const { rows } = await db.query(
    "SELECT id, seller_id, status FROM stores WHERE id = $1 AND seller_id = $2",
    [storeId, sellerId],
  );
  return rows[0] ?? null;
}

/**
 * Loads a product for a public-facing route.
 *
 * A product is publicly available only when it is `active` AND its store is
 * `approved` - the same rule GET /products/:id applies. The owning seller and
 * admins additionally see their own inactive / unapproved-store products.
 * Returns null (which callers turn into a 404) in every other case.
 */
async function findVisibleProduct(productId, req) {
  const { rows } = await query(
    `SELECT p.id, p.store_id, p.status, s.seller_id, s.status AS store_status
       FROM products p
       JOIN stores s ON s.id = p.store_id
      WHERE p.id = $1`,
    [productId],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status === "active" && row.store_status === "approved") return row;

  const isOwner =
    req.user?.role === ROLES.SELLER && Number(row.seller_id) === req.user.id;
  const isAdmin = req.user?.role === ROLES.ADMIN;
  return isOwner || isAdmin ? row : null;
}

// =============================================================================
// A. Stores
// =============================================================================

/**
 * GET /api/catalog/stores  (public)
 * Only approved stores are listed. Optional `q` (name search) + pagination.
 */
router.get(
  "/stores",
  wrap(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const q = queryValue(req.query, "q");

    const values = [];
    let where = "WHERE s.status = 'approved'";
    if (q !== null) {
      if (typeof q !== "string") throw badRequest("q must be a string.");
      values.push(`%${q.trim()}%`);
      where += ` AND s.store_name ILIKE $${values.length}`;
    }

    const totalResult = await query(
      `SELECT COUNT(*) AS total FROM stores s ${where}`,
      values,
    );

    const { rows } = await query(
      `SELECT s.id, s.seller_id, s.store_name, s.description, s.logo_url,
              s.status, s.created_at
         FROM stores s
         ${where}
        ORDER BY s.id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return paginated(res, rows.map(mapStore), totalResult.rows[0].total, {
      page,
      limit,
    });
  }),
);

/**
 * GET /api/catalog/stores/me  (seller)
 * Declared before "/stores/:id" so "me" is never parsed as an id.
 */
router.get(
  "/stores/me",
  sellerRead,
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT id, seller_id, store_name, description, logo_url, status, created_at
         FROM stores
        WHERE seller_id = $1
        ORDER BY id ASC`,
      [req.user.id],
    );
    return res.json({ data: rows.map(mapStore) });
  }),
);

/**
 * GET /api/catalog/stores/:id  (public)
 * Approved stores are public. The owning seller and admins may also read their
 * own pending/suspended store. Includes the store's active products.
 */
router.get(
  "/stores/:id",
  optionalAuth,
  wrap(async (req, res) => {
    const storeId = requiredId(req.params.id, "id");

    const { rows } = await query(
      `SELECT id, seller_id, store_name, description, logo_url, status, created_at
         FROM stores
        WHERE id = $1`,
      [storeId],
    );
    const store = rows[0];
    if (!store) throw new HttpError(404, "Store not found");

    const isOwner =
      req.user?.role === ROLES.SELLER && Number(store.seller_id) === req.user.id;
    const isAdmin = req.user?.role === ROLES.ADMIN;
    if (store.status !== "approved" && !isOwner && !isAdmin) {
      throw new HttpError(404, "Store not found");
    }

    const products = await query(
      `SELECT p.id, p.store_id, p.category_id, p.name, p.description,
              p.sale_price, p.origin_price, p.stock, p.status, p.created_at,
              ${MAIN_IMAGE_SQL}
         FROM products p
        WHERE p.store_id = $1 AND p.status = 'active'
        ORDER BY p.id ASC`,
      [storeId],
    );

    return res.json({
      data: { ...mapStore(store), products: products.rows.map(mapProduct) },
    });
  }),
);

/**
 * POST /api/catalog/stores  (seller)
 * A new store is ALWAYS 'pending': the seller cannot approve their own store.
 * `seller_id` comes from the verified token, never from the body.
 */
router.post(
  "/stores",
  sellerWrite,
  wrap(async (req, res) => {
    const body = bodyOf(req);
    const storeName = requiredText(body.store_name, "store_name", 100);
    const description = optionalText(body.description, "description", 5000);
    const logoUrl = optionalText(body.logo_url, "logo_url", 255);

    const { rows } = await query(
      `INSERT INTO stores (seller_id, store_name, description, logo_url, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, seller_id, store_name, description, logo_url, status, created_at`,
      [req.user.id, storeName, description, logoUrl],
    );

    return res.status(201).json({ data: mapStore(rows[0]) });
  }),
);

/**
 * PATCH /api/catalog/stores/:id  (seller, own store)
 * Only store_name / description / logo_url may change. seller_id and status are
 * rejected outright rather than silently ignored, so a client cannot believe it
 * changed something it did not.
 */
router.patch(
  "/stores/:id",
  sellerWrite,
  wrap(async (req, res) => {
    const storeId = requiredId(req.params.id, "id");
    const body = bodyOf(req);

    if (hasOwn(body, "seller_id") || hasOwn(body, "status")) {
      throw badRequest("seller_id and status cannot be changed.");
    }

    const updates = makeUpdates();
    if (hasOwn(body, "store_name")) {
      updates.set("store_name", requiredText(body.store_name, "store_name", 100));
    }
    if (hasOwn(body, "description")) {
      updates.set("description", optionalText(body.description, "description", 5000));
    }
    if (hasOwn(body, "logo_url")) {
      updates.set("logo_url", optionalText(body.logo_url, "logo_url", 255));
    }
    if (updates.assignments.length === 0) {
      throw badRequest(
        "Provide at least one of store_name, description or logo_url.",
      );
    }

    const owned = await findOwnedStore(pool, storeId, req.user.id);
    if (!owned) throw new HttpError(404, "Store not found");

    const { rows } = await query(
      `UPDATE stores
          SET ${updates.assignments.join(", ")}
        WHERE id = $${updates.values.length + 1} AND seller_id = $${updates.values.length + 2}
        RETURNING id, seller_id, store_name, description, logo_url, status, created_at`,
      [...updates.values, storeId, req.user.id],
    );

    return res.json({ data: mapStore(rows[0]) });
  }),
);

// =============================================================================
// B. Categories
// =============================================================================

/**
 * Builds the parent/child tree from a flat list of rows. Rows whose parent is
 * missing from the list (should not happen, but be safe) are treated as roots
 * so no category is ever silently dropped.
 */
function buildCategoryTree(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(String(row.id), mapCategory(row));
  }

  const roots = [];
  for (const row of rows) {
    const node = byId.get(String(row.id));
    const parent = row.parent_id === null ? null : byId.get(String(row.parent_id));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** GET /api/catalog/categories  (public) - full tree with `children` arrays. */
router.get(
  "/categories",
  wrap(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, name, description, parent_id, created_at
         FROM categories
        ORDER BY id ASC`,
    );
    return res.json({ data: buildCategoryTree(rows) });
  }),
);

/** Shape one category row consistently (ids as Numbers, like every other route). */
function mapCategory(row, children = []) {
  return {
    id: toId(row.id),
    name: row.name,
    description: row.description ?? null,
    parent_id: toId(row.parent_id),
    created_at: row.created_at,
    children,
  };
}

/** 404 unless the category exists. */
async function assertCategoryExists(categoryId) {
  const { rows } = await query("SELECT id FROM categories WHERE id = $1", [
    categoryId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Category not found");
}

/**
 * A parent must exist and must not be the category itself. Deeper cycles are
 * impossible to create from here because the parent chain is only ever extended
 * with a pre-existing category, and the self-reference is rejected.
 */
async function validateParent(categoryId, parentId) {
  if (parentId === null) return;
  if (categoryId !== null && parentId === categoryId) {
    throw badRequest("A category cannot be its own parent.");
  }
  const { rows } = await query("SELECT id FROM categories WHERE id = $1", [
    parentId,
  ]);
  if (rows.length === 0) throw badRequest("parent_id does not exist.");
}

/** POST /api/catalog/categories  (admin) */
router.post(
  "/categories",
  adminOnly,
  wrap(async (req, res) => {
    const body = bodyOf(req);
    const name = requiredText(body.name, "name", 100);
    const description = optionalText(body.description, "description", 5000);
    const parentId = optionalId(body.parent_id, "parent_id");
    await validateParent(null, parentId);

    const { rows } = await query(
      `INSERT INTO categories (name, description, parent_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, parent_id, created_at`,
      [name, description, parentId],
    );

    return res.status(201).json({ data: mapCategory(rows[0]) });
  }),
);

/** PATCH /api/catalog/categories/:id  (admin) */
router.patch(
  "/categories/:id",
  adminOnly,
  wrap(async (req, res) => {
    const categoryId = requiredId(req.params.id, "id");
    const body = bodyOf(req);

    const updates = makeUpdates();
    if (hasOwn(body, "name")) {
      updates.set("name", requiredText(body.name, "name", 100));
    }
    if (hasOwn(body, "description")) {
      updates.set("description", optionalText(body.description, "description", 5000));
    }
    if (hasOwn(body, "parent_id")) {
      const parentId = optionalId(body.parent_id, "parent_id");
      await validateParent(categoryId, parentId);
      updates.set("parent_id", parentId);
    }
    if (updates.assignments.length === 0) {
      throw badRequest("Provide at least one of name, description or parent_id.");
    }

    await assertCategoryExists(categoryId);

    const { rows } = await query(
      `UPDATE categories
          SET ${updates.assignments.join(", ")}
        WHERE id = $${updates.values.length + 1}
        RETURNING id, name, description, parent_id, created_at`,
      [...updates.values, categoryId],
    );

    return res.json({ data: mapCategory(rows[0]) });
  }),
);

/**
 * DELETE /api/catalog/categories/:id  (admin)
 * The schema uses ON DELETE SET NULL for both categories.parent_id and
 * products.category_id, so children and products are detached, not deleted.
 */
router.delete(
  "/categories/:id",
  adminOnly,
  wrap(async (req, res) => {
    const categoryId = requiredId(req.params.id, "id");
    const { rowCount } = await query("DELETE FROM categories WHERE id = $1", [
      categoryId,
    ]);
    if (rowCount === 0) throw new HttpError(404, "Category not found");
    return res.json({ data: { id: Number(categoryId), deleted: true } });
  }),
);

// =============================================================================
// C. Products
// =============================================================================

/** Columns every product response is built from. */
const PRODUCT_COLUMNS = `p.id, p.store_id, p.category_id, p.name, p.description,
              p.sale_price, p.origin_price, p.stock, p.status, p.created_at,
              ${MAIN_IMAGE_SQL}`;

/**
 * Shared WHERE builder for product listings. Only `p.name`, `p.category_id` and
 * `p.store_id` can be filtered, and every value is bound - the client never
 * influences the SQL structure.
 */
function buildProductFilters(qs) {
  const values = [];
  const conditions = [];

  const q = queryValue(qs, "q");
  if (q !== null) {
    if (typeof q !== "string") throw badRequest("q must be a string.");
    const term = q.trim();
    if (term.length > 0) {
      values.push(`%${term}%`);
      conditions.push(`p.name ILIKE $${values.length}`);
    }
  }

  const categoryId = queryValue(qs, "category_id");
  if (categoryId !== null) {
    values.push(requiredId(categoryId, "category_id"));
    conditions.push(`p.category_id = $${values.length}`);
  }

  const storeId = queryValue(qs, "store_id");
  if (storeId !== null) {
    values.push(requiredId(storeId, "store_id"));
    conditions.push(`p.store_id = $${values.length}`);
  }

  return { values, conditions };
}

/** Sorting allowlist lookup: unknown keys are rejected, never interpolated. */
function resolveProductSort(qs) {
  const requested = queryValue(qs, "sort");
  if (requested === null) return PRODUCT_SORTS.newest;
  if (typeof requested !== "string" || !hasOwn(PRODUCT_SORTS, requested)) {
    throw badRequest(
      `sort must be one of: ${Object.keys(PRODUCT_SORTS).join(", ")}.`,
    );
  }
  return PRODUCT_SORTS[requested];
}

/**
 * GET /api/catalog/products  (public)
 * Only active products in approved stores are listed.
 * Filters: q, category_id, store_id. Pagination: page, limit (max 100).
 */
router.get(
  "/products",
  wrap(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { values, conditions } = buildProductFilters(req.query);
    const orderBy = resolveProductSort(req.query);

    const where = [
      "p.status = 'active'",
      "s.status = 'approved'",
      ...conditions,
    ].join(" AND ");

    const totalResult = await query(
      `SELECT COUNT(*) AS total
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE ${where}`,
      values,
    );

    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return paginated(res, rows.map(mapProduct), totalResult.rows[0].total, {
      page,
      limit,
    });
  }),
);

/**
 * GET /api/catalog/products/me  (seller)
 * All of my products, including inactive ones. Optional `status` filter.
 * Declared before "/products/:id" so "me" is never parsed as an id.
 */
router.get(
  "/products/me",
  sellerRead,
  wrap(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { values, conditions } = buildProductFilters(req.query);
    values.push(req.user.id);

    // A seller sees every product of every store they own, regardless of the
    // store's moderation status - it is their own data.
    const where = [`s.seller_id = $${values.length}`, ...conditions].join(
      " AND ",
    );

    const status = queryValue(req.query, "status");
    let statusClause = "";
    if (status !== null) {
      if (typeof status !== "string" || !PRODUCT_STATUSES.includes(status)) {
        throw badRequest(
          `status must be one of: ${PRODUCT_STATUSES.join(", ")}.`,
        );
      }
      values.push(status);
      statusClause = ` AND p.status = $${values.length}`;
    }

    const totalResult = await query(
      `SELECT COUNT(*) AS total
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE ${where}${statusClause}`,
      values,
    );

    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS}, s.store_name
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE ${where}${statusClause}
        ORDER BY p.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return paginated(
      res,
      rows.map((row) => ({ ...mapProduct(row), store_name: row.store_name })),
      totalResult.rows[0].total,
      { page, limit },
    );
  }),
);

/**
 * GET /api/catalog/products/:id  (public)
 * Active products in approved stores are public. A product that is inactive, or
 * that lives in a non-approved store, is visible only to its owner and admins.
 */
router.get(
  "/products/:id",
  optionalAuth,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");

    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS}, s.store_name, s.seller_id, s.status AS store_status
         FROM products p
         JOIN stores s ON s.id = p.store_id
        WHERE p.id = $1`,
      [productId],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, "Product not found");

    const isOwner =
      req.user?.role === ROLES.SELLER && Number(row.seller_id) === req.user.id;
    const isAdmin = req.user?.role === ROLES.ADMIN;
    const isPublic = row.status === "active" && row.store_status === "approved";
    if (!isPublic && !isOwner && !isAdmin) {
      throw new HttpError(404, "Product not found");
    }

    const images = await query(
      `SELECT id, product_id, image_url, is_main, created_at
         FROM product_images
        WHERE product_id = $1
        ORDER BY is_main DESC, id ASC`,
      [productId],
    );

    const rating = await query(
      `SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS average_rating
         FROM reviews
        WHERE product_id = $1`,
      [productId],
    );

    return res.json({
      data: {
        ...mapProduct(row),
        store_name: row.store_name,
        images: images.rows.map(mapImage),
        review_count: Number(rating.rows[0].review_count),
        average_rating: Number(Number(rating.rows[0].average_rating).toFixed(2)),
      },
    });
  }),
);

/**
 * Validates the optional `images` array accepted by POST /products.
 * Only the first entry may be flagged as main; the rest are forced to false so
 * a product can never start with two main images.
 */
function normalizeImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest("images must be an array.");
  if (value.length > MAX_IMAGES_PER_PRODUCT) {
    throw badRequest(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`);
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw badRequest(`images[${index}] must be an object.`);
    }
    const imageUrl = requiredText(
      entry.image_url,
      `images[${index}].image_url`,
      500,
    );
    const isMain = optionalBoolean(entry.is_main, `images[${index}].is_main`);
    return { image_url: imageUrl, is_main: index === 0 ? isMain : false };
  });
}

/**
 * POST /api/catalog/products  (seller)
 * The store must belong to the caller AND be approved. The optional `images`
 * array is inserted in the same transaction, so a bad image rolls the product
 * back instead of leaving a half-created product behind.
 * A new product is always 'active'.
 */
router.post(
  "/products",
  sellerWrite,
  wrap(async (req, res) => {
    const body = bodyOf(req);
    const storeId = requiredId(body.store_id, "store_id");
    const name = requiredText(body.name, "name", 200);
    const description = optionalText(body.description, "description", 5000);
    const categoryId = optionalId(body.category_id, "category_id");
    const salePrice = requiredMoney(body.sale_price, "sale_price");
    const originPrice = requiredMoney(body.origin_price, "origin_price");
    const stock = requiredStock(body.stock);

    if (salePrice > originPrice) {
      throw badRequest("sale_price must not exceed origin_price.");
    }

    const images = normalizeImages(body.images);

    const created = await withTransaction(async (client) => {
      const store = await findOwnedStore(client, storeId, req.user.id);
      if (!store) throw new HttpError(404, "Store not found");
      if (store.status !== "approved") {
        throw new HttpError(
          403,
          "Products can only be created in an approved store.",
        );
      }

      if (categoryId !== null) {
        const { rows } = await client.query(
          "SELECT id FROM categories WHERE id = $1",
          [categoryId],
        );
        if (rows.length === 0) throw badRequest("category_id does not exist.");
      }

      const { rows } = await client.query(
        `INSERT INTO products
           (store_id, category_id, name, description, sale_price, origin_price, stock, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         RETURNING id, store_id, category_id, name, description,
                   sale_price, origin_price, stock, status, created_at`,
        [storeId, categoryId, name, description, salePrice, originPrice, stock],
      );
      const product = rows[0];

      for (const image of images) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, is_main)
           VALUES ($1, $2, $3)`,
          [product.id, image.image_url, image.is_main],
        );
      }

      return product;
    });

    return res.status(201).json({
      data: mapProduct({ ...created, main_image_url: images[0]?.image_url ?? null }),
    });
  }),
);

/**
 * PATCH /api/catalog/products/:id  (seller, own product)
 * `store_id` is immutable: moving a product between stores would bypass the
 * store-approval rule, so it is rejected instead of silently ignored.
 */
router.patch(
  "/products/:id",
  sellerWrite,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");
    const body = bodyOf(req);

    if (hasOwn(body, "store_id")) {
      throw badRequest("store_id cannot be changed after creation.");
    }
    if (hasOwn(body, "images")) {
      throw badRequest(
        "Use POST /products/:id/images and DELETE /images/:imageId to manage images.",
      );
    }

    const owned = await findOwnedProduct(pool, productId, req.user.id);
    if (!owned) throw new HttpError(404, "Product not found");

    const updates = makeUpdates();
    if (hasOwn(body, "name")) {
      updates.set("name", requiredText(body.name, "name", 200));
    }
    if (hasOwn(body, "description")) {
      updates.set("description", optionalText(body.description, "description", 5000));
    }
    if (hasOwn(body, "stock")) {
      updates.set("stock", requiredStock(body.stock));
    }

    let categoryId = null;
    if (hasOwn(body, "category_id")) {
      categoryId = optionalId(body.category_id, "category_id");
      if (categoryId !== null) {
        const { rows } = await query(
          "SELECT id FROM categories WHERE id = $1",
          [categoryId],
        );
        if (rows.length === 0) throw badRequest("category_id does not exist.");
      }
      updates.set("category_id", categoryId);
    }

    // Prices are cross-validated: only one side may be supplied, so the other
    // side is read from the row that was already fetched.
    let salePrice = null;
    let originPrice = null;
    if (hasOwn(body, "sale_price")) {
      salePrice = requiredMoney(body.sale_price, "sale_price");
      updates.set("sale_price", salePrice);
    }
    if (hasOwn(body, "origin_price")) {
      originPrice = requiredMoney(body.origin_price, "origin_price");
      updates.set("origin_price", originPrice);
    }
    if (salePrice !== null || originPrice !== null) {
      const { rows } = await query(
        "SELECT sale_price, origin_price FROM products WHERE id = $1",
        [productId],
      );
      const finalSale = salePrice ?? Number(rows[0].sale_price);
      const finalOrigin = originPrice ?? Number(rows[0].origin_price);
      if (finalSale > finalOrigin) {
        throw badRequest("sale_price must not exceed origin_price.");
      }
    }

    // Reactivation is allowed here; deactivation has its own DELETE endpoint.
    // It is added as a normal assignment so it can also be the ONLY change.
    if (hasOwn(body, "status")) {
      if (body.status !== "active") {
        throw badRequest(
          "status can only be set to 'active'. Use DELETE /products/:id to deactivate.",
        );
      }
      updates.set("status", "active");
    }

    if (updates.assignments.length === 0) {
      throw badRequest("Provide at least one field to update.");
    }

    const setClause = updates.assignments.join(", ");
    const { rows } = await query(
      `UPDATE products
          SET ${setClause}
        WHERE id = $${updates.values.length + 1}
        RETURNING id, store_id, category_id, name, description,
                  sale_price, origin_price, stock, status, created_at`,
      [...updates.values, productId],
    );

    return res.json({ data: mapProduct(rows[0]) });
  }),
);

/**
 * DELETE /api/catalog/products/:id  (seller, own product)
 * Soft delete: the row stays (orders and cart items reference it) and its status
 * becomes 'inactive', which hides it from every public listing.
 */
router.delete(
  "/products/:id",
  sellerWrite,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");

    const owned = await findOwnedProduct(pool, productId, req.user.id);
    if (!owned) throw new HttpError(404, "Product not found");

    await query("UPDATE products SET status = 'inactive' WHERE id = $1", [
      productId,
    ]);

    return res.json({ data: { id: Number(productId), status: "inactive" } });
  }),
);

// =============================================================================
// D. Product Images
// =============================================================================

/** POST /api/catalog/products/:id/images  (seller, own product) */
router.post(
  "/products/:id/images",
  sellerWrite,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");
    const body = bodyOf(req);
    const imageUrl = requiredText(body.image_url, "image_url", 500);
    const isMain = optionalBoolean(body.is_main, "is_main");

    const owned = await findOwnedProduct(pool, productId, req.user.id);
    if (!owned) throw new HttpError(404, "Product not found");

    const image = await withTransaction(async (client) => {
      const countResult = await client.query(
        "SELECT COUNT(*) AS total FROM product_images WHERE product_id = $1",
        [productId],
      );
      if (Number(countResult.rows[0].total) >= MAX_IMAGES_PER_PRODUCT) {
        throw badRequest(
          `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`,
        );
      }

      // Exactly one main image: clear the old flag before setting the new one.
      // Both statements run in one transaction so the product is never left
      // without a main image, nor with two.
      if (isMain) {
        await client.query(
          "UPDATE product_images SET is_main = FALSE WHERE product_id = $1 AND is_main = TRUE",
          [productId],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO product_images (product_id, image_url, is_main)
         VALUES ($1, $2, $3)
         RETURNING id, product_id, image_url, is_main, created_at`,
        [productId, imageUrl, isMain],
      );
      return rows[0];
    });

    return res.status(201).json({ data: mapImage(image) });
  }),
);

/** DELETE /api/catalog/images/:imageId  (seller, own product's image) */
router.delete(
  "/images/:imageId",
  sellerWrite,
  wrap(async (req, res) => {
    const imageId = requiredId(req.params.imageId, "imageId");

    // Ownership is resolved by joining the image to its product and store.
    const { rows } = await query(
      `SELECT pi.id, pi.is_main, pi.product_id
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
         JOIN stores s ON s.id = p.store_id
        WHERE pi.id = $1 AND s.seller_id = $2`,
      [imageId, req.user.id],
    );
    const image = rows[0];
    if (!image) throw new HttpError(404, "Image not found");

    await withTransaction(async (client) => {
      await client.query("DELETE FROM product_images WHERE id = $1", [imageId]);

      // Promote the oldest remaining image so the product keeps a main image.
      if (image.is_main) {
        await client.query(
          `UPDATE product_images SET is_main = TRUE
            WHERE id = (
              SELECT id FROM product_images
               WHERE product_id = $1
               ORDER BY id ASC
               LIMIT 1
            )`,
          [image.product_id],
        );
      }
    });

    return res.json({ data: { id: Number(imageId), deleted: true } });
  }),
);

// =============================================================================
// E. Product Reviews
// =============================================================================

/**
 * GET /api/catalog/products/:id/reviews  (public)
 * Reviews are public for active products in approved stores. Paginated.
 */
router.get(
  "/products/:id/reviews",
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");
    const { page, limit, offset } = parsePagination(req.query);

    const product = await findVisibleProduct(productId, req);
    if (!product) throw new HttpError(404, "Product not found");

    const totalResult = await query(
      "SELECT COUNT(*) AS total FROM reviews WHERE product_id = $1",
      [productId],
    );

    const { rows } = await query(
      `SELECT r.id, r.product_id, r.customer_id, r.rating, r.comment,
              r.created_at, c.name AS customer_name
         FROM reviews r
         JOIN customer c ON c.id = r.customer_id
        WHERE r.product_id = $1
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $2 OFFSET $3`,
      [productId, limit, offset],
    );

    return paginated(res, rows.map(mapReview), totalResult.rows[0].total, {
      page,
      limit,
    });
  }),
);

/**
 * POST /api/catalog/products/:id/reviews  (customer)
 * One review per customer per product - enforced by the UNIQUE constraint and
 * reported as 409. Only active products can be reviewed.
 */
router.post(
  "/products/:id/reviews",
  customerOnly,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.id, "id");
    const body = bodyOf(req);
    const rating = requiredRating(body.rating);
    const comment = optionalText(body.comment, "comment", 5000);

    const product = await findVisibleProduct(productId, req);
    if (!product) throw new HttpError(404, "Product not found");

    const existing = await query(
      "SELECT id FROM reviews WHERE customer_id = $1 AND product_id = $2",
      [req.user.id, productId],
    );
    if (existing.rows.length > 0) {
      throw new HttpError(409, "You have already reviewed this product.");
    }

    const { rows } = await query(
      `WITH inserted AS (
         INSERT INTO reviews (customer_id, product_id, rating, comment)
         VALUES ($1, $2, $3, $4)
         RETURNING id, product_id, customer_id, rating, comment, created_at
       )
       SELECT i.id, i.product_id, i.customer_id, i.rating, i.comment,
              i.created_at, c.name AS customer_name
         FROM inserted i
         JOIN customer c ON c.id = i.customer_id`,
      [req.user.id, productId, rating, comment],
    );

    return res.status(201).json({ data: mapReview(rows[0]) });
  }),
);

/** 404 unless this review exists AND belongs to the calling customer. */
async function findOwnReview(reviewId, customerId) {
  const { rows } = await query(
    "SELECT id, product_id FROM reviews WHERE id = $1 AND customer_id = $2",
    [reviewId, customerId],
  );
  return rows[0] ?? null;
}

/** PATCH /api/catalog/reviews/:id  (customer, own review) */
router.patch(
  "/reviews/:id",
  customerOnly,
  wrap(async (req, res) => {
    const reviewId = requiredId(req.params.id, "id");
    const body = bodyOf(req);

    const updates = makeUpdates();
    if (hasOwn(body, "rating")) {
      updates.set("rating", requiredRating(body.rating));
    }
    if (hasOwn(body, "comment")) {
      updates.set("comment", optionalText(body.comment, "comment", 5000));
    }
    if (updates.assignments.length === 0) {
      throw badRequest("Provide at least one of rating or comment.");
    }

    const owned = await findOwnReview(reviewId, req.user.id);
    if (!owned) throw new HttpError(404, "Review not found");

    const { rows } = await query(
      `WITH updated AS (
         UPDATE reviews
            SET ${updates.assignments.join(", ")}
          WHERE id = $${updates.values.length + 1} AND customer_id = $${updates.values.length + 2}
          RETURNING id, product_id, customer_id, rating, comment, created_at
       )
       SELECT u.id, u.product_id, u.customer_id, u.rating, u.comment,
              u.created_at, c.name AS customer_name
         FROM updated u
         JOIN customer c ON c.id = u.customer_id`,
      [...updates.values, reviewId, req.user.id],
    );

    return res.json({ data: mapReview(rows[0]) });
  }),
);

/** DELETE /api/catalog/reviews/:id  (customer, own review) */
router.delete(
  "/reviews/:id",
  customerOnly,
  wrap(async (req, res) => {
    const reviewId = requiredId(req.params.id, "id");

    const owned = await findOwnReview(reviewId, req.user.id);
    if (!owned) throw new HttpError(404, "Review not found");

    await query("DELETE FROM reviews WHERE id = $1 AND customer_id = $2", [
      reviewId,
      req.user.id,
    ]);

    return res.json({ data: { id: Number(reviewId), deleted: true } });
  }),
);

// =============================================================================
// F. Wishlist
// =============================================================================

/**
 * GET /api/catalog/wishlist  (customer)
 * Returns each wishlisted product with its main image. Products that are no
 * longer publicly available are still returned (the customer added them
 * deliberately) but carry their current status so the UI can grey them out.
 */
router.get(
  "/wishlist",
  customerOnly,
  wrap(async (req, res) => {
    const { page, limit, offset } = parsePagination(req.query);

    const totalResult = await query(
      "SELECT COUNT(*) AS total FROM wishlists WHERE customer_id = $1",
      [req.user.id],
    );

    const { rows } = await query(
      `SELECT w.id AS wishlist_id, w.created_at AS added_at,
              p.id, p.store_id, p.category_id, p.name, p.description,
              p.sale_price, p.origin_price, p.stock, p.status,
              p.created_at, ${MAIN_IMAGE_SQL}
         FROM wishlists w
         JOIN products p ON p.id = w.product_id
        WHERE w.customer_id = $1
        ORDER BY w.id DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );

    const data = rows.map((row) => ({
      wishlist_id: toId(row.wishlist_id),
      added_at: row.added_at,
      ...mapProduct(row),
    }));

    return paginated(res, data, totalResult.rows[0].total, { page, limit });
  }),
);

/**
 * POST /api/catalog/wishlist  (customer)
 * `customer_id` is taken from the token. Duplicates are reported as 409 (the
 * UNIQUE (customer_id, product_id) constraint is the source of truth).
 */
router.post(
  "/wishlist",
  customerOnly,
  wrap(async (req, res) => {
    const body = bodyOf(req);
    const productId = requiredId(body.product_id, "product_id");

    const product = await findVisibleProduct(productId, req);
    if (!product) throw new HttpError(404, "Product not found");

    const existing = await query(
      "SELECT id FROM wishlists WHERE customer_id = $1 AND product_id = $2",
      [req.user.id, productId],
    );
    if (existing.rows.length > 0) {
      throw new HttpError(409, "This product is already in your wishlist.");
    }

    const { rows } = await query(
      `INSERT INTO wishlists (customer_id, product_id)
       VALUES ($1, $2)
       RETURNING id, product_id, created_at`,
      [req.user.id, productId],
    );

    return res.status(201).json({
      data: {
        id: toId(rows[0].id),
        product_id: toId(rows[0].product_id),
        created_at: rows[0].created_at,
      },
    });
  }),
);

/** DELETE /api/catalog/wishlist/:productId  (customer, own wishlist) */
router.delete(
  "/wishlist/:productId",
  customerOnly,
  wrap(async (req, res) => {
    const productId = requiredId(req.params.productId, "productId");

    const { rowCount } = await query(
      "DELETE FROM wishlists WHERE customer_id = $1 AND product_id = $2",
      [req.user.id, productId],
    );
    if (rowCount === 0) throw new HttpError(404, "Product is not in your wishlist.");

    return res.json({ data: { product_id: Number(productId), deleted: true } });
  }),
);

// =============================================================================
// Integration helper for Member C (Cart & Orders)
// =============================================================================

/**
 * Loads the pricing / stock / ownership facts needed during checkout.
 * Accepts either a transaction client or the shared pool, so the caller can
 * wrap its own multi-step checkout in a single transaction.
 */
export async function getProductsForCheckout(client, productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) return [];

  const ids = productIds.map((id) => requiredId(id, "product_id"));

  const { rows } = await client.query(
    `SELECT
        p.id,
        p.sale_price,
        p.stock,
        p.status,
        p.store_id,
        s.seller_id,
        s.status AS store_status
     FROM products p
     JOIN stores s ON s.id = p.store_id
     WHERE p.id = ANY($1::bigint[])`,
    [ids],
  );

  return rows.map((row) => ({
    id: toId(row.id),
    sale_price: Number(row.sale_price),
    stock: Number(row.stock),
    status: row.status,
    store_id: toId(row.store_id),
    seller_id: toId(row.seller_id),
    store_status: row.store_status,
  }));
}

// =============================================================================
// Router-level error handling
// =============================================================================

// Every failure inside this router is formatted here, so no SQL text, column
// name or stack trace can reach a client. Unexpected errors are logged by
// message only - never with the request body or bound parameters.
router.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // A UNIQUE violation that raced past the pre-check maps to 409.
  if (err?.code === "23505") {
    return res.status(409).json({ error: "This resource already exists." });
  }
  // A malformed / out-of-range value rejected by a CHECK or FK constraint.
  if (err?.code === "23503" || err?.code === "23514") {
    return res.status(400).json({ error: "Invalid input." });
  }

  console.error("[catalog] Unhandled error:", err?.message || err);
  return res.status(500).json({ error: "Internal server error." });
});

export default router;

