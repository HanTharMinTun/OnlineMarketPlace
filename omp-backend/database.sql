-- Multi-vendor E-Commerce Database
-- PostgreSQL | 16 tables | No chat/support messaging system
-- Run in pgAdmin Query Tool on an empty/new database.

BEGIN;

-- 1. Users: Admin, Seller, Customer

CREATE TABLE admin (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    shop_name varchar(20),
    address varchar(50),
    id_card varchar(50),
    kpay_phone varchar(50),
    bank_acc varchar(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    id_card varchar(50),
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);



-- 2. Stores
CREATE TABLE stores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_id BIGINT NOT NULL REFERENCES seller(id) ON DELETE RESTRICT,
    store_name VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Addresses
CREATE TABLE addresses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Categories (parent_id supports subcategories)
CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Products
CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sale_price NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
    origin_price numeric(12,2) not null check (origin_price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Product images
CREATE TABLE product_images (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    is_main BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Carts (one cart per customer in this simple MVP)
CREATE TABLE carts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL UNIQUE REFERENCES customer(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Cart items
CREATE TABLE cart_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, product_id)
);

-- 9. Orders (parent/customer order; no store_id for multi-vendor orders)
CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
    address_id BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (order_status IN
            ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Seller orders: one parent order can be split among multiple stores
CREATE TABLE seller_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN
            ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, store_id),
    UNIQUE (id, order_id)
);

-- 11. Order items: linked to the seller order to identify the correct seller
CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_order_id BIGINT NOT NULL REFERENCES seller_orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Payments
CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('card', 'bank', 'cash', 'wallet')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN
            ('pending', 'paid', 'failed', 'refunded')),
    transaction_id VARCHAR(100),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Shipments / delivery tracking
CREATE TABLE shipments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    tracking_number VARCHAR(100) UNIQUE,
    carrier VARCHAR(100),
    shipping_status VARCHAR(20) NOT NULL DEFAULT 'preparing'
        CHECK (shipping_status IN
            ('preparing', 'shipped', 'in_transit', 'delivered', 'returned')),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Refunds
CREATE TABLE refunds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Reviews
CREATE TABLE reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

-- 16. Wishlists
CREATE TABLE wishlists (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

-- Helpful indexes for common lookups
CREATE INDEX idx_stores_seller_id ON stores(seller_id);
CREATE INDEX idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_seller_orders_order_id ON seller_orders(order_id);
CREATE INDEX idx_order_items_seller_order_id ON order_items(seller_order_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_refunds_order_id ON refunds(order_id);
CREATE INDEX idx_reviews_product_id ON reviews(product_id);

COMMIT;

-- NOTE:
-- 1. During checkout, copy cart items into order_items/seller_orders first,
--    then clear cart_items in the same database transaction.
-- 2. For multi-vendor orders, group items by store and create one seller_orders
--    row per store. order_items links to seller_orders via seller_order_id.
-- 3. Refund approval is not the same as money being returned. Set status
--    to 'refunded' only after the refund has actually been completed.
-- 4. Enforce role/ownership permissions in the FastAPI backend.
