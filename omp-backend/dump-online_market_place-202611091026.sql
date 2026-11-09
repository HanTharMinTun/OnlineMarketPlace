--
-- PostgreSQL database dump
--

\restrict zOyEGThnSY7SAmiF5YWZs6OxufwA6lGNDdBhHCTaDMidZztATDnl1CyOMchxlnY

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

-- Started on 2026-11-09 10:26:54 +0630

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 879 (class 1247 OID 83778)
-- Name: gender_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.gender_type AS ENUM (
    'Male',
    'Female'
);


ALTER TYPE public.gender_type OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 92321)
-- Name: addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addresses (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    full_name character varying(100) NOT NULL,
    phone character varying(20) NOT NULL,
    address_line1 character varying(255) NOT NULL,
    address_line2 character varying(255),
    city character varying(100) NOT NULL,
    state character varying(100),
    postal_code character varying(20),
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.addresses OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 92320)
-- Name: addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.addresses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 216 (class 1259 OID 92270)
-- Name: admin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.admin OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 92269)
-- Name: admin_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.admin ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 234 (class 1259 OID 92405)
-- Name: cart_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cart_items (
    id bigint NOT NULL,
    cart_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cart_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.cart_items OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 92404)
-- Name: cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.cart_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cart_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 232 (class 1259 OID 92390)
-- Name: carts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.carts (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.carts OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 92389)
-- Name: carts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.carts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.carts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 92336)
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    parent_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 92335)
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 220 (class 1259 OID 92294)
-- Name: customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    id_card character varying(50),
    password_hash character varying(255) NOT NULL,
    phone character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.customer OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 92293)
-- Name: customer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.customer ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 240 (class 1259 OID 92469)
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    seller_order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    price numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 92468)
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 236 (class 1259 OID 92426)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    address_id bigint,
    order_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_order_status_check CHECK (((order_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'shipped'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 92425)
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 253 (class 1259 OID 100191)
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    role character varying(20) NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT password_reset_tokens_role_check CHECK (((role)::text = ANY ((ARRAY['customer'::character varying, 'seller'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 100190)
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.password_reset_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.password_reset_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 242 (class 1259 OID 92488)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    payment_method character varying(20) NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    transaction_id character varying(100),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['card'::character varying, 'bank'::character varying, 'cash'::character varying, 'wallet'::character varying])::text[]))),
    CONSTRAINT payments_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 92487)
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 92375)
-- Name: product_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_images (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    image_url character varying(500) NOT NULL,
    is_main boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.product_images OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 92374)
-- Name: product_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.product_images ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 228 (class 1259 OID 92350)
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    store_id bigint NOT NULL,
    category_id bigint,
    name character varying(200) NOT NULL,
    description text,
    sale_price numeric(12,2) NOT NULL,
    origin_price numeric(12,2) NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_origin_price_check CHECK ((origin_price >= (0)::numeric)),
    CONSTRAINT products_sale_price_check CHECK ((sale_price >= (0)::numeric)),
    CONSTRAINT products_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),
    CONSTRAINT products_stock_check CHECK ((stock >= 0))
);


ALTER TABLE public.products OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 92349)
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 246 (class 1259 OID 92522)
-- Name: refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refunds (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    reason text NOT NULL,
    amount numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT refunds_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'refunded'::character varying])::text[])))
);


ALTER TABLE public.refunds OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 92521)
-- Name: refunds_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.refunds ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.refunds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 248 (class 1259 OID 92540)
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    product_id bigint NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 92539)
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.reviews ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 254 (class 1259 OID 100202)
-- Name: revoked_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.revoked_tokens (
    jti uuid NOT NULL,
    role character varying(20) NOT NULL,
    user_id bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.revoked_tokens OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 100179)
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 92281)
-- Name: seller; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seller (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone character varying(20),
    shop_name character varying(20),
    address character varying(50),
    id_card character varying(50),
    kpay_phone character varying(50),
    bank_acc character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    token_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT seller_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.seller OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 92280)
-- Name: seller_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.seller ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.seller_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 238 (class 1259 OID 92446)
-- Name: seller_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seller_orders (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    store_id bigint NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seller_orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'shipped'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.seller_orders OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 92445)
-- Name: seller_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.seller_orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.seller_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 244 (class 1259 OID 92504)
-- Name: shipments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shipments (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    tracking_number character varying(100),
    carrier character varying(100),
    shipping_status character varying(20) DEFAULT 'preparing'::character varying NOT NULL,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipments_shipping_status_check CHECK (((shipping_status)::text = ANY ((ARRAY['preparing'::character varying, 'shipped'::character varying, 'in_transit'::character varying, 'delivered'::character varying, 'returned'::character varying])::text[])))
);


ALTER TABLE public.shipments OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 92503)
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.shipments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 222 (class 1259 OID 92305)
-- Name: stores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stores (
    id bigint NOT NULL,
    seller_id bigint NOT NULL,
    store_name character varying(100) NOT NULL,
    description text,
    logo_url character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stores_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'suspended'::character varying])::text[])))
);


ALTER TABLE public.stores OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 92304)
-- Name: stores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.stores ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 250 (class 1259 OID 92562)
-- Name: wishlists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wishlists (
    id bigint NOT NULL,
    customer_id bigint NOT NULL,
    product_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wishlists OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 92561)
-- Name: wishlists_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.wishlists ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wishlists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 3698 (class 0 OID 92321)
-- Dependencies: 224
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.addresses (id, customer_id, full_name, phone, address_line1, address_line2, city, state, postal_code, is_default, created_at) FROM stdin;
\.


--
-- TOC entry 3690 (class 0 OID 92270)
-- Dependencies: 216
-- Data for Name: admin; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin (id, name, email, password_hash, phone, created_at, token_version) FROM stdin;
26	admin	admin@gmail.com	$2b$12$VT3Aioc29G5COt/NhX2jwe7kWsX4Efftv4uUJ8kZLmgWQCGIpK4w2	09123456789	2026-10-31 22:51:00+06:30	1
\.


--
-- TOC entry 3708 (class 0 OID 92405)
-- Dependencies: 234
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cart_items (id, cart_id, product_id, quantity, price, created_at) FROM stdin;
\.


--
-- TOC entry 3706 (class 0 OID 92390)
-- Dependencies: 232
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.carts (id, customer_id, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3700 (class 0 OID 92336)
-- Dependencies: 226
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, description, parent_id, created_at) FROM stdin;
\.


--
-- TOC entry 3694 (class 0 OID 92294)
-- Dependencies: 220
-- Data for Name: customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer (id, name, email, id_card, password_hash, phone, created_at, token_version) FROM stdin;
4	New Name	customer@example.com	\N	$2b$12$r3Nnd0SlWtAAk6XBpmJvieapnavHc1Cs1rRNWq1e46i9EsmvGfWLq	09999999999	2026-10-31 20:55:01.11841+06:30	1
7	Escalate	esc.1793457902820@example.com	\N	$2b$12$x4zIrLK0cr52UWwF3mp0He2yj5Tku2vHguUzAkLnpJ91OpMVzuhXu	\N	2026-10-31 21:15:03.652885+06:30	1
10	Escalate	esc.1793458136734@example.com	\N	$2b$12$z4cvAtJAbyOLSgA6TZcOn.1up5JgL9RzlX.HtefkK3Cfl3kro5ic6	\N	2026-10-31 21:18:57.59684+06:30	1
38	HanTharMinTun	hhaann13579@gmail.com	\N	$2b$12$t4uSCZdjSUV3hSsm4HWPNOOS5184XjaWCaoSX2HguxXHb8PsGDz1G	+959760516745	2026-10-31 22:44:12.86912+06:30	1
\.


--
-- TOC entry 3714 (class 0 OID 92469)
-- Dependencies: 240
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, seller_order_id, product_id, quantity, price, created_at) FROM stdin;
\.


--
-- TOC entry 3710 (class 0 OID 92426)
-- Dependencies: 236
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, customer_id, address_id, order_status, total_amount, created_at) FROM stdin;
\.


--
-- TOC entry 3727 (class 0 OID 100191)
-- Dependencies: 253
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (id, user_id, role, token_hash, expires_at, used_at, created_at) FROM stdin;
\.


--
-- TOC entry 3716 (class 0 OID 92488)
-- Dependencies: 242
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, payment_method, amount, payment_status, transaction_id, paid_at, created_at) FROM stdin;
\.


--
-- TOC entry 3704 (class 0 OID 92375)
-- Dependencies: 230
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_images (id, product_id, image_url, is_main, created_at) FROM stdin;
\.


--
-- TOC entry 3702 (class 0 OID 92350)
-- Dependencies: 228
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, store_id, category_id, name, description, sale_price, origin_price, stock, status, created_at) FROM stdin;
\.


--
-- TOC entry 3720 (class 0 OID 92522)
-- Dependencies: 246
-- Data for Name: refunds; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refunds (id, order_id, reason, amount, status, requested_at, processed_at, created_at) FROM stdin;
\.


--
-- TOC entry 3722 (class 0 OID 92540)
-- Dependencies: 248
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, customer_id, product_id, rating, comment, created_at) FROM stdin;
\.


--
-- TOC entry 3728 (class 0 OID 100202)
-- Dependencies: 254
-- Data for Name: revoked_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.revoked_tokens (jti, role, user_id, expires_at, revoked_at) FROM stdin;
\.


--
-- TOC entry 3725 (class 0 OID 100179)
-- Dependencies: 251
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_migrations (filename, applied_at) FROM stdin;
001_auth_hardening.sql	2026-10-31 21:51:19.608767+06:30
\.


--
-- TOC entry 3692 (class 0 OID 92281)
-- Dependencies: 218
-- Data for Name: seller; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.seller (id, name, email, password_hash, phone, shop_name, address, id_card, kpay_phone, bank_acc, status, created_at, token_version) FROM stdin;
3	Seller Name	seller@example.com	$2b$12$gkgAbwPNt5GFKQjFj.SrRu/gP/8vWSeTHWZSS8/DXPXl8JoGvYr12	09123456789	My Online Shop	Magway, Myanmar	\N	\N	\N	pending	2026-10-31 20:55:01.384227+06:30	1
24	HanTharMinTun	hhaann13579@gmail.com	$2b$12$hzTFquCOyyU08ccBlENwUeDsnnyg2uDPUGr.OvyrNM4k9eN5igS26	+959760516745	Toy	hhaann13579@gmail.com	\N	09665394015	\N	pending	2026-10-31 22:46:59.294395+06:30	1
\.


--
-- TOC entry 3712 (class 0 OID 92446)
-- Dependencies: 238
-- Data for Name: seller_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.seller_orders (id, order_id, store_id, status, created_at) FROM stdin;
\.


--
-- TOC entry 3718 (class 0 OID 92504)
-- Dependencies: 244
-- Data for Name: shipments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shipments (id, order_id, tracking_number, carrier, shipping_status, shipped_at, delivered_at, created_at) FROM stdin;
\.


--
-- TOC entry 3696 (class 0 OID 92305)
-- Dependencies: 222
-- Data for Name: stores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stores (id, seller_id, store_name, description, logo_url, status, created_at) FROM stdin;
\.


--
-- TOC entry 3724 (class 0 OID 92562)
-- Dependencies: 250
-- Data for Name: wishlists; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wishlists (id, customer_id, product_id, created_at) FROM stdin;
\.


--
-- TOC entry 3734 (class 0 OID 0)
-- Dependencies: 223
-- Name: addresses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.addresses_id_seq', 1, false);


--
-- TOC entry 3735 (class 0 OID 0)
-- Dependencies: 215
-- Name: admin_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admin_id_seq', 37, true);


--
-- TOC entry 3736 (class 0 OID 0)
-- Dependencies: 233
-- Name: cart_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cart_items_id_seq', 1, false);


--
-- TOC entry 3737 (class 0 OID 0)
-- Dependencies: 231
-- Name: carts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.carts_id_seq', 1, false);


--
-- TOC entry 3738 (class 0 OID 0)
-- Dependencies: 225
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 27, true);


--
-- TOC entry 3739 (class 0 OID 0)
-- Dependencies: 219
-- Name: customer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.customer_id_seq', 58, true);


--
-- TOC entry 3740 (class 0 OID 0)
-- Dependencies: 239
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 1, false);


--
-- TOC entry 3741 (class 0 OID 0)
-- Dependencies: 235
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- TOC entry 3742 (class 0 OID 0)
-- Dependencies: 252
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 227, true);


--
-- TOC entry 3743 (class 0 OID 0)
-- Dependencies: 241
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- TOC entry 3744 (class 0 OID 0)
-- Dependencies: 229
-- Name: product_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_images_id_seq', 36, true);


--
-- TOC entry 3745 (class 0 OID 0)
-- Dependencies: 227
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 27, true);


--
-- TOC entry 3746 (class 0 OID 0)
-- Dependencies: 245
-- Name: refunds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.refunds_id_seq', 1, false);


--
-- TOC entry 3747 (class 0 OID 0)
-- Dependencies: 247
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reviews_id_seq', 28, true);


--
-- TOC entry 3748 (class 0 OID 0)
-- Dependencies: 217
-- Name: seller_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.seller_id_seq', 44, true);


--
-- TOC entry 3749 (class 0 OID 0)
-- Dependencies: 237
-- Name: seller_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.seller_orders_id_seq', 1, false);


--
-- TOC entry 3750 (class 0 OID 0)
-- Dependencies: 243
-- Name: shipments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.shipments_id_seq', 1, false);


--
-- TOC entry 3751 (class 0 OID 0)
-- Dependencies: 221
-- Name: stores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stores_id_seq', 45, true);


--
-- TOC entry 3752 (class 0 OID 0)
-- Dependencies: 249
-- Name: wishlists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wishlists_id_seq', 19, true);


--
-- TOC entry 3460 (class 2606 OID 92329)
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- TOC entry 3445 (class 2606 OID 92279)
-- Name: admin admin_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_email_key UNIQUE (email);


--
-- TOC entry 3447 (class 2606 OID 92277)
-- Name: admin admin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_pkey PRIMARY KEY (id);


--
-- TOC entry 3475 (class 2606 OID 92414)
-- Name: cart_items cart_items_cart_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_product_id_key UNIQUE (cart_id, product_id);


--
-- TOC entry 3477 (class 2606 OID 92412)
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- TOC entry 3471 (class 2606 OID 92398)
-- Name: carts carts_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_customer_id_key UNIQUE (customer_id);


--
-- TOC entry 3473 (class 2606 OID 92396)
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- TOC entry 3463 (class 2606 OID 92343)
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- TOC entry 3453 (class 2606 OID 92303)
-- Name: customer customer_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_email_key UNIQUE (email);


--
-- TOC entry 3455 (class 2606 OID 92301)
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (id);


--
-- TOC entry 3491 (class 2606 OID 92476)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- TOC entry 3481 (class 2606 OID 92434)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 3518 (class 2606 OID 100197)
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- TOC entry 3520 (class 2606 OID 100199)
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 3494 (class 2606 OID 92497)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 3469 (class 2606 OID 92383)
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- TOC entry 3467 (class 2606 OID 92363)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- TOC entry 3503 (class 2606 OID 92533)
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- TOC entry 3506 (class 2606 OID 92550)
-- Name: reviews reviews_customer_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_customer_id_product_id_key UNIQUE (customer_id, product_id);


--
-- TOC entry 3508 (class 2606 OID 92548)
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- TOC entry 3523 (class 2606 OID 100207)
-- Name: revoked_tokens revoked_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.revoked_tokens
    ADD CONSTRAINT revoked_tokens_pkey PRIMARY KEY (jti);


--
-- TOC entry 3514 (class 2606 OID 100186)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- TOC entry 3449 (class 2606 OID 92292)
-- Name: seller seller_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller
    ADD CONSTRAINT seller_email_key UNIQUE (email);


--
-- TOC entry 3484 (class 2606 OID 92457)
-- Name: seller_orders seller_orders_id_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller_orders
    ADD CONSTRAINT seller_orders_id_order_id_key UNIQUE (id, order_id);


--
-- TOC entry 3486 (class 2606 OID 92455)
-- Name: seller_orders seller_orders_order_id_store_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller_orders
    ADD CONSTRAINT seller_orders_order_id_store_id_key UNIQUE (order_id, store_id);


--
-- TOC entry 3488 (class 2606 OID 92453)
-- Name: seller_orders seller_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller_orders
    ADD CONSTRAINT seller_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 3451 (class 2606 OID 92290)
-- Name: seller seller_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller
    ADD CONSTRAINT seller_pkey PRIMARY KEY (id);


--
-- TOC entry 3496 (class 2606 OID 92513)
-- Name: shipments shipments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_key UNIQUE (order_id);


--
-- TOC entry 3498 (class 2606 OID 92511)
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- TOC entry 3500 (class 2606 OID 92515)
-- Name: shipments shipments_tracking_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_tracking_number_key UNIQUE (tracking_number);


--
-- TOC entry 3458 (class 2606 OID 92314)
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- TOC entry 3510 (class 2606 OID 92569)
-- Name: wishlists wishlists_customer_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_customer_id_product_id_key UNIQUE (customer_id, product_id);


--
-- TOC entry 3512 (class 2606 OID 92567)
-- Name: wishlists wishlists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_pkey PRIMARY KEY (id);


--
-- TOC entry 3461 (class 1259 OID 92581)
-- Name: idx_addresses_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_customer_id ON public.addresses USING btree (customer_id);


--
-- TOC entry 3478 (class 1259 OID 92584)
-- Name: idx_cart_items_cart_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cart_items_cart_id ON public.cart_items USING btree (cart_id);


--
-- TOC entry 3489 (class 1259 OID 92587)
-- Name: idx_order_items_seller_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_seller_order_id ON public.order_items USING btree (seller_order_id);


--
-- TOC entry 3479 (class 1259 OID 92585)
-- Name: idx_orders_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_customer_id ON public.orders USING btree (customer_id);


--
-- TOC entry 3515 (class 1259 OID 100200)
-- Name: idx_password_reset_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_reset_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- TOC entry 3516 (class 1259 OID 100201)
-- Name: idx_password_reset_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_password_reset_user ON public.password_reset_tokens USING btree (role, user_id);


--
-- TOC entry 3492 (class 1259 OID 92588)
-- Name: idx_payments_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_order_id ON public.payments USING btree (order_id);


--
-- TOC entry 3464 (class 1259 OID 92583)
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- TOC entry 3465 (class 1259 OID 92582)
-- Name: idx_products_store_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_store_id ON public.products USING btree (store_id);


--
-- TOC entry 3501 (class 1259 OID 92589)
-- Name: idx_refunds_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refunds_order_id ON public.refunds USING btree (order_id);


--
-- TOC entry 3504 (class 1259 OID 92590)
-- Name: idx_reviews_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reviews_product_id ON public.reviews USING btree (product_id);


--
-- TOC entry 3521 (class 1259 OID 100208)
-- Name: idx_revoked_tokens_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_revoked_tokens_expires_at ON public.revoked_tokens USING btree (expires_at);


--
-- TOC entry 3482 (class 1259 OID 92586)
-- Name: idx_seller_orders_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_seller_orders_order_id ON public.seller_orders USING btree (order_id);


--
-- TOC entry 3456 (class 1259 OID 92580)
-- Name: idx_stores_seller_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stores_seller_id ON public.stores USING btree (seller_id);


--
-- TOC entry 3525 (class 2606 OID 92330)
-- Name: addresses addresses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;


--
-- TOC entry 3531 (class 2606 OID 92415)
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- TOC entry 3532 (class 2606 OID 92420)
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- TOC entry 3530 (class 2606 OID 92399)
-- Name: carts carts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;


--
-- TOC entry 3526 (class 2606 OID 92344)
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- TOC entry 3537 (class 2606 OID 92482)
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- TOC entry 3538 (class 2606 OID 92477)
-- Name: order_items order_items_seller_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_seller_order_id_fkey FOREIGN KEY (seller_order_id) REFERENCES public.seller_orders(id) ON DELETE CASCADE;


--
-- TOC entry 3533 (class 2606 OID 92440)
-- Name: orders orders_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE SET NULL;


--
-- TOC entry 3534 (class 2606 OID 92435)
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE RESTRICT;


--
-- TOC entry 3539 (class 2606 OID 92498)
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- TOC entry 3529 (class 2606 OID 92384)
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 3527 (class 2606 OID 92369)
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- TOC entry 3528 (class 2606 OID 92364)
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- TOC entry 3541 (class 2606 OID 92534)
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- TOC entry 3542 (class 2606 OID 92551)
-- Name: reviews reviews_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;


--
-- TOC entry 3543 (class 2606 OID 92556)
-- Name: reviews reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- TOC entry 3535 (class 2606 OID 92458)
-- Name: seller_orders seller_orders_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller_orders
    ADD CONSTRAINT seller_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 3536 (class 2606 OID 92463)
-- Name: seller_orders seller_orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller_orders
    ADD CONSTRAINT seller_orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- TOC entry 3540 (class 2606 OID 92516)
-- Name: shipments shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- TOC entry 3524 (class 2606 OID 92315)
-- Name: stores stores_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.seller(id) ON DELETE RESTRICT;


--
-- TOC entry 3544 (class 2606 OID 92570)
-- Name: wishlists wishlists_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;


--
-- TOC entry 3545 (class 2606 OID 92575)
-- Name: wishlists wishlists_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


-- Completed on 2026-11-09 10:26:55 +0630

--
-- PostgreSQL database dump complete
--

\unrestrict zOyEGThnSY7SAmiF5YWZs6OxufwA6lGNDdBhHCTaDMidZztATDnl1CyOMchxlnY

