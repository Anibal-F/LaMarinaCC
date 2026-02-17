--
-- PostgreSQL database dump
--

\restrict K0NxqcfFCj8uPp8gdclasO4bdtMu52eNWmi7m7jmlCj4qEUQVBHNfRmAKxjrxkj

-- Dumped from database version 16.12
-- Dumped by pg_dump version 16.12

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: 1; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."1" (
);


ALTER TABLE public."1" OWNER TO postgres;

--
-- Name: aseguradoras; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.aseguradoras (
    id integer NOT NULL,
    nb_aseguradora character varying(150) NOT NULL,
    tel_contacto character varying(50),
    email_contacto character varying(255),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.aseguradoras OWNER TO postgres;

--
-- Name: aseguradoras_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.aseguradoras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.aseguradoras_id_seq OWNER TO postgres;

--
-- Name: aseguradoras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.aseguradoras_id_seq OWNED BY public.aseguradoras.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    nb_cliente character varying(150) NOT NULL,
    tel_cliente character varying(30) NOT NULL,
    email_cliente character varying(150),
    direccion text,
    cp character varying(10),
    rfc character varying(20),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.clientes OWNER TO postgres;

--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clientes_id_seq OWNER TO postgres;

--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: estatus_valuacion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.estatus_valuacion (
    id integer NOT NULL,
    nombre_estatus character varying(120) NOT NULL,
    descripcion text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.estatus_valuacion OWNER TO postgres;

--
-- Name: estatus_valuacion_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.estatus_valuacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estatus_valuacion_id_seq OWNER TO postgres;

--
-- Name: estatus_valuacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estatus_valuacion_id_seq OWNED BY public.estatus_valuacion.id;


--
-- Name: expediente_archivos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expediente_archivos (
    id integer NOT NULL,
    expediente_id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    archivo_path text NOT NULL,
    archivo_nombre text,
    archivo_size integer,
    mime_type character varying(120),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.expediente_archivos OWNER TO postgres;

--
-- Name: expediente_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.expediente_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expediente_archivos_id_seq OWNER TO postgres;

--
-- Name: expediente_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.expediente_archivos_id_seq OWNED BY public.expediente_archivos.id;


--
-- Name: expedientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expedientes (
    id integer NOT NULL,
    reporte_siniestro character varying(120) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.expedientes OWNER TO postgres;

--
-- Name: expedientes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.expedientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expedientes_id_seq OWNER TO postgres;

--
-- Name: expedientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.expedientes_id_seq OWNED BY public.expedientes.id;


--
-- Name: grupos_autos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grupos_autos (
    id integer NOT NULL,
    nb_grupo character varying(120) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.grupos_autos OWNER TO postgres;

--
-- Name: grupos_autos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.grupos_autos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.grupos_autos_id_seq OWNER TO postgres;

--
-- Name: grupos_autos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.grupos_autos_id_seq OWNED BY public.grupos_autos.id;


--
-- Name: historical_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.historical_entries (
    id integer NOT NULL,
    fecha_seguro date,
    fecha_recep timestamp without time zone,
    folio_seguro character varying(30),
    folio_recep character varying(20),
    folio_ot character varying(30),
    nb_cliente character varying(150),
    tel_cliente character varying(30),
    seguro character varying(50),
    marca_vehiculo character varying(80),
    modelo_vehiculo character varying(80),
    tipo_carroceria character varying(80),
    color character varying(50),
    placas character varying(20),
    kilometraje integer,
    nivel_gas character varying(30),
    estado_mecanico text,
    observaciones text,
    fecha_entregaestim date,
    estatus character varying(50),
    fecha_entrega date,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.historical_entries OWNER TO postgres;

--
-- Name: historical_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.historical_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.historical_entries_id_seq OWNER TO postgres;

--
-- Name: historical_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.historical_entries_id_seq OWNED BY public.historical_entries.id;


--
-- Name: marcas_autos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marcas_autos (
    id integer NOT NULL,
    gpo_marca character varying(120) NOT NULL,
    nb_marca character varying(120) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.marcas_autos OWNER TO postgres;

--
-- Name: marcas_autos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.marcas_autos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marcas_autos_id_seq OWNER TO postgres;

--
-- Name: marcas_autos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.marcas_autos_id_seq OWNED BY public.marcas_autos.id;


--
-- Name: orden_admision; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orden_admision (
    id integer NOT NULL,
    reporte_siniestro character varying(100),
    fecha_adm date NOT NULL,
    hr_adm time without time zone NOT NULL,
    nb_cliente character varying(150) NOT NULL,
    tel_cliente character varying(30),
    email_cliente character varying(255),
    marca_vehiculo character varying(80),
    tipo_vehiculo character varying(80),
    modelo_anio character varying(20),
    color_vehiculo character varying(60),
    placas character varying(20),
    kilometraje integer,
    danos_siniestro text,
    descripcion_siniestro text,
    danos_preexistentes text,
    created_at timestamp without time zone DEFAULT now(),
    descripcion_danospreex text,
    seguro_comp character varying(120),
    archivo_path text,
    archivo_nombre text,
    archivo_size bigint,
    estatus character varying(50) DEFAULT 'Pendiente Valuacion'::character varying,
    serie_auto character varying(80)
);


ALTER TABLE public.orden_admision OWNER TO postgres;

--
-- Name: orden_admision_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orden_admision_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orden_admision_id_seq OWNER TO postgres;

--
-- Name: orden_admision_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orden_admision_id_seq OWNED BY public.orden_admision.id;


--
-- Name: partes_auto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.partes_auto (
    id integer NOT NULL,
    nb_parte character varying(120) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.partes_auto OWNER TO postgres;

--
-- Name: partes_auto_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.partes_auto_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.partes_auto_id_seq OWNER TO postgres;

--
-- Name: partes_auto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.partes_auto_id_seq OWNED BY public.partes_auto.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id integer NOT NULL,
    profile_name character varying(100) NOT NULL,
    description text,
    status boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.profiles_id_seq OWNER TO postgres;

--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: recepcion_media; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recepcion_media (
    id bigint NOT NULL,
    recepcion_id bigint NOT NULL,
    media_type character varying(20) NOT NULL,
    file_path text NOT NULL,
    original_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recepcion_media OWNER TO postgres;

--
-- Name: recepcion_media_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recepcion_media_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recepcion_media_id_seq OWNER TO postgres;

--
-- Name: recepcion_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recepcion_media_id_seq OWNED BY public.recepcion_media.id;


--
-- Name: recepciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recepciones (
    id integer NOT NULL,
    folio_recep character varying(20) NOT NULL,
    fecha_recep timestamp without time zone NOT NULL,
    nb_cliente character varying(150) NOT NULL,
    vehiculo character varying(200),
    vehiculo_marca character varying(80),
    vehiculo_modelo character varying(80),
    vehiculo_anio integer,
    vehiculo_color character varying(50),
    placas character varying(20),
    seguro character varying(50),
    fecha_entregaestim date,
    estatus character varying(50) DEFAULT 'Recepcionado'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    tel_cliente character varying(30),
    email_cliente character varying(255),
    vehiculo_tipo character varying(120),
    kilometraje integer,
    nivel_gas character varying(50),
    estado_mecanico text,
    observaciones text,
    partes_siniestro text[],
    partes_preexistentes text[],
    observaciones_siniestro text,
    observaciones_preexistentes text
);


ALTER TABLE public.recepciones OWNER TO postgres;

--
-- Name: recepciones_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.recepciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recepciones_id_seq OWNER TO postgres;

--
-- Name: recepciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.recepciones_id_seq OWNED BY public.recepciones.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    user_name character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    profile character varying(50) DEFAULT 'Administrador'::character varying NOT NULL,
    status boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    profile_id integer,
    name character varying(150)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: aseguradoras id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aseguradoras ALTER COLUMN id SET DEFAULT nextval('public.aseguradoras_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: estatus_valuacion id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estatus_valuacion ALTER COLUMN id SET DEFAULT nextval('public.estatus_valuacion_id_seq'::regclass);


--
-- Name: expediente_archivos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expediente_archivos ALTER COLUMN id SET DEFAULT nextval('public.expediente_archivos_id_seq'::regclass);


--
-- Name: expedientes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expedientes ALTER COLUMN id SET DEFAULT nextval('public.expedientes_id_seq'::regclass);


--
-- Name: grupos_autos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupos_autos ALTER COLUMN id SET DEFAULT nextval('public.grupos_autos_id_seq'::regclass);


--
-- Name: historical_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historical_entries ALTER COLUMN id SET DEFAULT nextval('public.historical_entries_id_seq'::regclass);


--
-- Name: marcas_autos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marcas_autos ALTER COLUMN id SET DEFAULT nextval('public.marcas_autos_id_seq'::regclass);


--
-- Name: orden_admision id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_admision ALTER COLUMN id SET DEFAULT nextval('public.orden_admision_id_seq'::regclass);


--
-- Name: partes_auto id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partes_auto ALTER COLUMN id SET DEFAULT nextval('public.partes_auto_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: recepcion_media id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepcion_media ALTER COLUMN id SET DEFAULT nextval('public.recepcion_media_id_seq'::regclass);


--
-- Name: recepciones id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepciones ALTER COLUMN id SET DEFAULT nextval('public.recepciones_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: 1; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."1"  FROM stdin;
\.


--
-- Data for Name: aseguradoras; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.aseguradoras (id, nb_aseguradora, tel_contacto, email_contacto, created_at) FROM stdin;
1	Qualitas	\N	\N	2026-01-26 23:45:36.737336
2	CHUBB	\N	\N	2026-01-26 23:45:41.544351
\.


--
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clientes (id, nb_cliente, tel_cliente, email_cliente, direccion, cp, rfc, created_at) FROM stdin;
1	Anibal Fuentes	6691519608	afa59@live.com.mx	Circuito Don Camilo #154	82154		2026-01-26 07:57:26.967439
2	Jesús Fernando Lugo	6691645258	jf_lugo@hotmail.com	\N	\N	\N	2026-01-30 07:58:44.559037
3	Gabriel Cano Juarez	6673170201	gabo.moro.cano@gmail.com	\N	\N	\N	2026-02-11 18:12:27.23136
4	LUIS OCTAVIO MAGALLON MARROQUIN			\N	\N	\N	2026-02-17 01:03:40.897731
5	LUIS OCTAVIO MAGALLON MARROQUIN	6699868513		\N	\N	\N	2026-02-17 01:16:41.663476
\.


--
-- Data for Name: estatus_valuacion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estatus_valuacion (id, nombre_estatus, descripcion, created_at) FROM stdin;
1	Pendiente de valuación	\N	2026-02-06 00:43:08.675905
2	En Valuación	\N	2026-02-06 00:43:08.675905
3	Valuado	\N	2026-02-06 00:43:08.675905
4	En Taller	\N	2026-02-06 00:43:08.675905
\.


--
-- Data for Name: expediente_archivos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expediente_archivos (id, expediente_id, tipo, archivo_path, archivo_nombre, archivo_size, mime_type, created_at) FROM stdin;
1	1	archivoorden_admision	/media/expedientes/04251889452/archivoorden_admision/archivoorden_admision_1c69c1d8900d4c3ba82662ec09f37b07.jpg	volante.jpg	403183	image/jpeg	2026-02-11 18:48:09.843115
2	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_02fe4c729e7b42d980f97e87108fb32e.jpg	IMG-20251107-WA0134.jpg	61264	image/jpeg	2026-02-13 18:16:49.677087
3	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_a5d94f2c414044878288795543275598.jpg	IMG-20251107-WA0135.jpg	134160	image/jpeg	2026-02-13 18:16:49.680866
4	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_a14de1e8f5aa49afa7f0123f4b002629.jpg	IMG-20251107-WA0136.jpg	175323	image/jpeg	2026-02-13 18:16:49.683515
5	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_6052ea4423ea4fa8ad190637dcf3e2b8.jpg	IMG-20251107-WA0127.jpg	200396	image/jpeg	2026-02-13 18:16:49.686771
6	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_a86b25cec1024b4b9010360af4bd0a26.jpg	IMG-20251107-WA0129.jpg	94738	image/jpeg	2026-02-13 18:16:49.70138
7	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_361324ae6c474cd686aad292d4e1e3f8.jpg	IMG-20251107-WA0130.jpg	232113	image/jpeg	2026-02-13 18:16:49.735928
8	1	archivorecepcion_vehiculo	/media/expedientes/04251889452/archivorecepcion_vehiculo/archivorecepcion_vehiculo_604a91061078443c8f99449cbfc74495.png	firma.png	6122	image/png	2026-02-13 18:16:49.740674
9	1	recepcion_video	/media/expedientes/04251889452/recepcion_video/recepcion_video_5a1b34d17b6547e493b5cf3e683d1d1a.mov	Grabación de pantalla 2026-02-11 a la(s) 11.49.50 a.m..mov	6136908	video/quicktime	2026-02-13 18:16:50.185262
10	1	archivoorden_admision	/media/expedientes/04251889452/archivoorden_admision/archivoorden_admision_d4b543caaef541babc3c22a3146c35d9.jpg	volante.jpg	403183	image/jpeg	2026-02-17 00:00:31.757955
11	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_9715989550094d14aaf7e06ac4f194c6.jpg	IMG-20251107-WA0126.jpg	90371	image/jpeg	2026-02-17 00:02:17.123028
12	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_78d6489939364885b126c718631c6199.jpg	IMG-20251107-WA0129.jpg	94738	image/jpeg	2026-02-17 00:02:17.187344
13	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_84dacd864df04cbe88190c943dd78ca1.jpg	IMG-20251107-WA0132.jpg	166509	image/jpeg	2026-02-17 00:02:17.247639
14	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_663ca46f63044506a94be09bcb8605b2.jpg	IMG-20251107-WA0133.jpg	56878	image/jpeg	2026-02-17 00:02:17.291273
15	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_372bbe4ea672422faa9934a9b680c242.jpg	IMG-20251107-WA0134.jpg	61264	image/jpeg	2026-02-17 00:02:17.339161
16	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_0494bc24eb8044b0aa39f93e4ef1b032.jpg	IMG-20251107-WA0135.jpg	134160	image/jpeg	2026-02-17 00:02:17.392951
17	1	valuacion_foto	/media/expedientes/04251889452/valuacion_foto/valuacion_foto_57ee39f2a9b4432eb90e7c4f7536b796.jpg	IMG-20251107-WA0136.jpg	175323	image/jpeg	2026-02-17 00:02:17.447052
18	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_33ced1092c2c45998cdd18f714b36bac.jpg	IMG-20251107-WA0135.jpg	134160	image/jpeg	2026-02-17 00:39:43.735163
19	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_439912a6d4bc4c7d968346006b5fa470.jpg	IMG-20251107-WA0132.jpg	166509	image/jpeg	2026-02-17 00:39:43.735337
20	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_624fd6b7e4df496c9dfe38aba479a82b.jpg	IMG-20251107-WA0136.jpg	175323	image/jpeg	2026-02-17 00:39:43.735681
21	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_949bbc6a00ac4a1883ab7f657a4d82f1.jpg	IMG-20251107-WA0133.jpg	56878	image/jpeg	2026-02-17 00:39:43.73865
22	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_b83ac66a848a4b7fbc635ca900560587.jpg	IMG-20251107-WA0124.jpg	226822	image/jpeg	2026-02-17 00:39:43.741214
23	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_f79ee61c8afb4775be786f597a15f364.jpg	IMG-20251107-WA0134.jpg	61264	image/jpeg	2026-02-17 00:39:43.74116
24	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_ff2ae480462c4c09ad0dcc219625bc6b.jpg	IMG-20251107-WA0126.jpg	90371	image/jpeg	2026-02-17 00:39:43.766916
25	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_e469203f688a4bf6a506cd4d336e675f.jpg	IMG-20251107-WA0131.jpg	128000	image/jpeg	2026-02-17 00:39:43.768631
26	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_dc662b9b2fe24b74a23ae50eb07a8c8e.jpg	IMG-20251107-WA0137.jpg	118232	image/jpeg	2026-02-17 00:39:43.768752
27	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_e11c62da7f164fac88212d7172fe0a68.jpg	IMG-20251107-WA0138.jpg	175764	image/jpeg	2026-02-17 00:39:43.769164
28	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_8cab581c12c94b5b8e7ead963b913288.jpg	IMG-20251107-WA0128.jpg	203478	image/jpeg	2026-02-17 00:39:43.771487
29	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_f052fd563b884854aeb8f36792a2dc03.jpg	IMG-20251107-WA0129.jpg	94738	image/jpeg	2026-02-17 00:39:43.77383
30	1	archivorecepcion_vehiculo	/media/expedientes/04251889452/archivorecepcion_vehiculo/archivorecepcion_vehiculo_a2b0b5b5e92549aa948a026b2ae39a92.png	firma.png	4707	image/png	2026-02-17 00:39:43.786761
31	1	recepcion_foto	/media/expedientes/04251889452/recepcion_foto/recepcion_foto_1b57293a16fd45cfb2784e8e3ad58380.jpg	IMG-20251107-WA0130.jpg	232113	image/jpeg	2026-02-17 00:39:43.798621
32	2	archivoorden_admision	/media/expedientes/PA25L018013/archivoorden_admision/archivoorden_admision_c36b22f4afa94b5586cf27c11b12ea86.jpg	volante.jpg	260519	image/jpeg	2026-02-17 01:03:40.957283
33	2	archivoorden_admision	/media/expedientes/PA25L018013/archivoorden_admision/archivoorden_admision_7f742e983e024afe8e8c0392904c2c4f.jpg	volante.jpg	260519	image/jpeg	2026-02-17 01:16:41.714583
34	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_bd5d38f0e2404c859cd6b6745a4d64be.jpeg	WhatsApp Image 2025-12-13 at 10.46.39 AM (1).jpeg	148072	image/jpeg	2026-02-17 01:17:59.397288
35	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_7c5f9917250247aeb3846930f9573abd.jpeg	WhatsApp Image 2025-12-13 at 10.46.39 AM.jpeg	157659	image/jpeg	2026-02-17 01:17:59.427701
36	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_f5bf304d79a74f03b102a20027dfab2f.jpeg	WhatsApp Image 2025-12-13 at 10.46.40 AM (1).jpeg	87983	image/jpeg	2026-02-17 01:17:59.448318
37	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_4c13553e0c694fa0a7d0150a5710b03e.jpeg	WhatsApp Image 2025-12-13 at 10.46.40 AM (2).jpeg	82257	image/jpeg	2026-02-17 01:17:59.466934
38	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_13938c7fc0134bbe867f7fb0860774c0.jpeg	WhatsApp Image 2025-12-13 at 10.46.40 AM.jpeg	43029	image/jpeg	2026-02-17 01:17:59.482997
39	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_e24d54524dc142caa1a05244791535d3.jpeg	WhatsApp Image 2025-12-13 at 10.46.41 AM (1).jpeg	145632	image/jpeg	2026-02-17 01:17:59.507023
40	2	valuacion_foto	/media/expedientes/PA25L018013/valuacion_foto/valuacion_foto_895f715b60e445fd9497dd98a720fe5a.jpeg	WhatsApp Image 2025-12-13 at 10.46.41 AM (2).jpeg	105421	image/jpeg	2026-02-17 01:17:59.535698
\.


--
-- Data for Name: expedientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expedientes (id, reporte_siniestro, created_at) FROM stdin;
1	04251889452	2026-02-11 18:48:09.834297
2	PA25L018013	2026-02-17 01:03:40.955458
\.


--
-- Data for Name: grupos_autos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.grupos_autos (id, nb_grupo, created_at) FROM stdin;
1	Stellantis	2026-01-26 22:22:31.99235
2	Volkswagen Group	2026-01-26 22:22:31.99235
3	General Motors	2026-01-26 22:22:31.99235
4	Ford Motor Company	2026-01-26 22:22:31.99235
5	BMW Group	2026-01-26 22:22:31.99235
6	Toyota Group	2026-01-26 22:22:31.99235
7	Nissan Motor Co.	2026-01-26 22:28:50.15195
10	Toyota Motor Corporation	2026-01-26 22:28:50.15195
11	Hyundai Motor Group	2026-01-26 22:28:50.15195
12	Mazda Motor Corporation	2026-01-26 22:28:50.15195
13	Honda Motor Co.	2026-01-26 22:28:50.15195
16	SAIC Motor	2026-01-26 22:28:50.15195
19	Mercedes-Benz Group	2026-01-26 22:33:42.330722
20	BYD Auto	2026-01-26 22:33:42.330722
21	Chery Automobile	2026-01-26 22:33:42.330722
22	Great Wall Motor	2026-01-26 22:33:42.330722
23	Renault Group	2026-01-26 22:33:42.330722
24	Subaru Corporation	2026-01-26 22:33:42.330722
25	Suzuki Motor Corporation	2026-01-26 22:33:42.330722
26	Tesla	2026-01-26 22:33:42.330722
27	Mitsubishi Motors	2026-01-26 22:33:42.330722
\.


--
-- Data for Name: historical_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.historical_entries (id, fecha_seguro, fecha_recep, folio_seguro, folio_recep, folio_ot, nb_cliente, tel_cliente, seguro, marca_vehiculo, modelo_vehiculo, tipo_carroceria, color, placas, kilometraje, nivel_gas, estado_mecanico, observaciones, fecha_entregaestim, estatus, fecha_entrega, created_at) FROM stdin;
2	\N	2026-02-14 14:25:00	\N	4411	\N	Gabriel Cano Juarez	6673170201	Qualitas	BYD	2026	Dolphin Mini	Beige	MPM319D	8990	1/2 Tanque	\N	\N	\N	Recepcionado	\N	2026-02-13 18:16:48.973418
3	\N	2026-02-17 07:31:00	\N	44000	\N	GABRIEL CANO JUAREZ	6673170201	Particular (Sin Seguro)	BYD	2026	DOLPHIN MINI	BEIGE	VPM319D	8990	1/2 Tanque	\N	\N	\N	Recepcionado	\N	2026-02-17 00:39:43.540683
\.


--
-- Data for Name: marcas_autos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.marcas_autos (id, gpo_marca, nb_marca, created_at) FROM stdin;
1	Stellantis	Abarth	2026-01-26 22:22:31.99235
2	Stellantis	Alfa Romeo	2026-01-26 22:22:31.99235
3	Stellantis	Chrysler	2026-01-26 22:22:31.99235
4	Stellantis	Citroën	2026-01-26 22:22:31.99235
5	Stellantis	Dodge	2026-01-26 22:22:31.99235
6	Stellantis	DS Automobiles	2026-01-26 22:22:31.99235
7	Stellantis	Fiat	2026-01-26 22:22:31.99235
8	Stellantis	Jeep	2026-01-26 22:22:31.99235
9	Stellantis	Lancia	2026-01-26 22:22:31.99235
10	Stellantis	Maserati	2026-01-26 22:22:31.99235
11	Stellantis	Opel	2026-01-26 22:22:31.99235
12	Stellantis	Peugeot	2026-01-26 22:22:31.99235
13	Stellantis	Ram	2026-01-26 22:22:31.99235
14	Stellantis	Vauxhall	2026-01-26 22:22:31.99235
15	Volkswagen Group	Volkswagen	2026-01-26 22:22:31.99235
16	Volkswagen Group	Audi	2026-01-26 22:22:31.99235
17	Volkswagen Group	SEAT	2026-01-26 22:22:31.99235
18	Volkswagen Group	CUPRA	2026-01-26 22:22:31.99235
19	Volkswagen Group	Škoda	2026-01-26 22:22:31.99235
20	Volkswagen Group	Porsche	2026-01-26 22:22:31.99235
21	Volkswagen Group	Bentley	2026-01-26 22:22:31.99235
22	Volkswagen Group	Lamborghini	2026-01-26 22:22:31.99235
23	Volkswagen Group	Ducati	2026-01-26 22:22:31.99235
24	Volkswagen Group	Volkswagen Commercial Vehicles	2026-01-26 22:22:31.99235
25	General Motors	Chevrolet	2026-01-26 22:22:31.99235
26	General Motors	Buick	2026-01-26 22:22:31.99235
27	General Motors	GMC	2026-01-26 22:22:31.99235
28	General Motors	Cadillac	2026-01-26 22:22:31.99235
29	Ford Motor Company	Ford	2026-01-26 22:22:31.99235
30	Ford Motor Company	Lincoln	2026-01-26 22:22:31.99235
31	BMW Group	BMW	2026-01-26 22:22:31.99235
32	BMW Group	MINI	2026-01-26 22:22:31.99235
33	BMW Group	Rolls-Royce	2026-01-26 22:22:31.99235
34	BMW Group	BMW Motorrad	2026-01-26 22:22:31.99235
35	Toyota Group	Toyota	2026-01-26 22:22:31.99235
36	Toyota Group	Lexus	2026-01-26 22:22:31.99235
37	Toyota Group	Daihatsu	2026-01-26 22:22:31.99235
38	Toyota Group	Hino	2026-01-26 22:22:31.99235
39	Nissan Motor Co.	Nissan	2026-01-26 22:28:50.15195
48	Toyota Motor Corporation	Toyota	2026-01-26 22:28:50.15195
49	Toyota Motor Corporation	Lexus	2026-01-26 22:28:50.15195
50	Hyundai Motor Group	Hyundai	2026-01-26 22:28:50.15195
51	Hyundai Motor Group	Kia	2026-01-26 22:28:50.15195
52	Mazda Motor Corporation	Mazda	2026-01-26 22:28:50.15195
53	Honda Motor Co.	Honda	2026-01-26 22:28:50.15195
63	SAIC Motor	MG	2026-01-26 22:28:50.15195
64	Honda Motor Co.	Acura	2026-01-26 22:33:42.330722
67	Volkswagen Group	Cupra	2026-01-26 22:33:42.330722
71	BMW Group	Mini	2026-01-26 22:33:42.330722
72	Mercedes-Benz Group	Mercedes Benz	2026-01-26 22:33:42.330722
81	Hyundai Motor Group	KIA	2026-01-26 22:33:42.330722
85	BYD Auto	BYD	2026-01-26 22:33:42.330722
86	Chery Automobile	Chirey	2026-01-26 22:33:42.330722
87	Great Wall Motor	GWM	2026-01-26 22:33:42.330722
88	Mitsubishi Motors	Mitsubishi	2026-01-26 22:33:42.330722
89	Renault Group	Renault	2026-01-26 22:33:42.330722
90	Subaru Corporation	Subaru	2026-01-26 22:33:42.330722
91	Suzuki Motor Corporation	Suzuki	2026-01-26 22:33:42.330722
92	Tesla	Tesla	2026-01-26 22:33:42.330722
\.


--
-- Data for Name: orden_admision; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orden_admision (id, reporte_siniestro, fecha_adm, hr_adm, nb_cliente, tel_cliente, email_cliente, marca_vehiculo, tipo_vehiculo, modelo_anio, color_vehiculo, placas, kilometraje, danos_siniestro, descripcion_siniestro, danos_preexistentes, created_at, descripcion_danospreex, seguro_comp, archivo_path, archivo_nombre, archivo_size, estatus, serie_auto) FROM stdin;
1	04251830235	2025-10-24	18:40:00	Jesús Fernando Lugo	6691645258	jf_lugo@hotmail.com	Mercedes Benz	GLC	2022	Negro	VLE911C	52000	Facia Trasera	Daños en la vista cromada	Faro Izquierdo	2026-01-30 07:58:44.590316	Roto	Qualitas	/media/orden_admision/1/orden_dd7c324588964db09285bd6029447641.jpeg	OrdenQualitas.jpeg	\N	Pendiente Valuacion	W1NOJ5DBXNG054550
3	04251889452	2025-11-03	12:48:00	GABRIEL CANO JUAREZ	6673170201	gabo.moro.cano@gmail.com	BYD	DOLPHIN MINI	2026	BEIGE	VPM319D	8990	Espejo Derecho	ESPEJO LATERAL DERECHO, CANTONERA DERECHA DE SALPICADERA CHECAR SALPICADERA		2026-02-17 00:00:31.476922		Qualitas	/media/orden_admision/3/orden_7ce0a2c74c2c4740afa7ef37e1edc6f8.jpg	volante.jpg	403183	Pendiente Valuacion	LGXCE4CC9T0002901
5	PA25L018013	2025-12-12	10:27:00	LUIS OCTAVIO MAGALLON MARROQUIN	6699868513		MERCEDES BENZ	CLASE G	2021	Gris Plata	VLP406D	\N		Facia, Daños mecánicos		2026-02-17 01:16:41.665232		CHUBB	/media/orden_admision/5/orden_29b3ac6a38b24f7b9fd040b1bb9febd8.jpg	volante.jpg	260519	Pendiente Valuacion	W1NYC6AJ8MX393109
\.


--
-- Data for Name: partes_auto; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.partes_auto (id, nb_parte, created_at) FROM stdin;
26	Facia Delantera	2026-01-30 06:59:51.817862
27	Facia Trasera	2026-01-30 06:59:51.817862
28	Faro Izquierdo	2026-01-30 06:59:51.817862
29	Faro Derecho	2026-01-30 06:59:51.817862
30	Parrilla	2026-01-30 06:59:51.817862
31	Cofre	2026-01-30 06:59:51.817862
32	Salpicadera Izquierda	2026-01-30 06:59:51.817862
33	Salpicadera Derecha	2026-01-30 06:59:51.817862
34	Espejo Izquierdo	2026-01-30 06:59:51.817862
35	Espejo Derecho	2026-01-30 06:59:51.817862
36	Poste Parabrisas Izquierdo	2026-01-30 06:59:51.817862
37	Poste Parabrisas Derecho	2026-01-30 06:59:51.817862
38	Puerta Delantera Izquierda	2026-01-30 06:59:51.817862
39	Puerta Delantera Derecha	2026-01-30 06:59:51.817862
40	Puerta Trasera Izquierda	2026-01-30 06:59:51.817862
41	Puerta Trasera Derecha	2026-01-30 06:59:51.817862
42	Estribo Izquierdo	2026-01-30 06:59:51.817862
43	Estribo Derecho	2026-01-30 06:59:51.817862
44	Toldo	2026-01-30 06:59:51.817862
45	Costado Izquierdo	2026-01-30 06:59:51.817862
46	Costado Derecho	2026-01-30 06:59:51.817862
47	Cajuela	2026-01-30 06:59:51.817862
48	Stop Izquierdo	2026-01-30 06:59:51.817862
49	Stop Derecho	2026-01-30 06:59:51.817862
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, profile_name, description, status, created_at) FROM stdin;
1	Administrador	Acceso total	t	2026-01-26 03:29:36.981453
2	Atención a Clientes	Permisos para recepcionar, entregar y documentación	t	2026-01-26 03:35:09.383155
3	Jefe de Taller	Permisos para Módulo Taller	t	2026-01-26 03:35:47.896592
4	Valuación	Permisos para Módulo Valuación	t	2026-01-26 03:36:06.31562
5	Igualación	Permisos para Módulo Pintura	t	2026-01-26 03:36:28.153892
6	Almacenista	Permisos para recepción de partes y gestión de Inventarios	t	2026-01-26 03:36:54.935636
\.


--
-- Data for Name: recepcion_media; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recepcion_media (id, recepcion_id, media_type, file_path, original_name, created_at) FROM stdin;
2	2	signature	/media/recepcion/2/signature_e296e7bb8be142dd8786221c5dca77b7.png	firma.png	2026-02-13 18:16:49.093578+00
8	2	video	/media/recepcion/2/video_9963fb865b5e4380880ff856d8c56a01.mov	Grabación de pantalla 2026-02-11 a la(s) 11.49.50 a.m..mov	2026-02-13 18:16:49.57532+00
1	2	photo_damage_right	/media/recepcion/2/photo_62348f98dc994542acf2d844252779c8.jpg	IMG-20251107-WA0134.jpg	2026-02-13 18:16:49.082486+00
3	2	photo_damage_right	/media/recepcion/2/photo_e991cc481a1240e5ab0c7c99f20780c2.jpg	IMG-20251107-WA0135.jpg	2026-02-13 18:16:49.093759+00
4	2	photo_damage_right	/media/recepcion/2/photo_6bb304bd335246819272adeec394b2e4.jpg	IMG-20251107-WA0136.jpg	2026-02-13 18:16:49.109786+00
5	2	photo_damage_right	/media/recepcion/2/photo_08a2722266eb40f9b952cfe6d3d7acd7.jpg	IMG-20251107-WA0129.jpg	2026-02-13 18:16:49.157244+00
6	2	photo_preexist_left	/media/recepcion/2/photo_079655a153e841ecb1a4a35b9694b749.jpg	IMG-20251107-WA0127.jpg	2026-02-13 18:16:49.479511+00
7	2	photo_preexist_left	/media/recepcion/2/photo_e09e885212624070892d19bb089d29bb.jpg	IMG-20251107-WA0130.jpg	2026-02-13 18:16:49.503992+00
9	3	photo_damage_right	/media/recepcion/3/photo_damage_right_36b8d0bc668047cda5d9a0340b25bd38.jpg	IMG-20251107-WA0136.jpg	2026-02-17 00:39:43.608959+00
12	3	photo_damage_right	/media/recepcion/3/photo_damage_right_585859ac03dc4414beb3a2f7ad909f7b.jpg	IMG-20251107-WA0132.jpg	2026-02-17 00:39:43.609017+00
13	3	photo_damage_right	/media/recepcion/3/photo_damage_right_763208dc75ac447aae589bc615df54b1.jpg	IMG-20251107-WA0134.jpg	2026-02-17 00:39:43.609999+00
10	3	photo_damage_right	/media/recepcion/3/photo_damage_right_cfc37d85e9444b44a85f0e19d0f5a3b0.jpg	IMG-20251107-WA0135.jpg	2026-02-17 00:39:43.608926+00
11	3	photo_damage_right	/media/recepcion/3/photo_damage_right_0f983c30061543d7a2b2a9008fdb2789.jpg	IMG-20251107-WA0133.jpg	2026-02-17 00:39:43.608286+00
14	3	photo_damage_right	/media/recepcion/3/photo_damage_right_8c333232b13f401899b47ce3e8748e72.jpg	IMG-20251107-WA0124.jpg	2026-02-17 00:39:43.62627+00
16	3	photo_damage_right	/media/recepcion/3/photo_damage_right_70a2a775e4a94afc999d5b17d989a3c7.jpg	IMG-20251107-WA0137.jpg	2026-02-17 00:39:43.659799+00
15	3	photo_damage_left	/media/recepcion/3/photo_damage_left_344cd1a779f7400eb34c5aa8aef72f83.jpg	IMG-20251107-WA0126.jpg	2026-02-17 00:39:43.659878+00
17	3	photo_damage_left	/media/recepcion/3/photo_damage_left_1b9c031a1e054b38999a62b3945a9a79.jpg	IMG-20251107-WA0129.jpg	2026-02-17 00:39:43.667273+00
18	3	photo_damage_left	/media/recepcion/3/photo_damage_left_55449072d3da4736b26ea2f12ed33dc0.jpg	IMG-20251107-WA0130.jpg	2026-02-17 00:39:43.667484+00
19	3	photo_damage_right	/media/recepcion/3/photo_damage_right_b5137a3355fa4c1eb92038e4bb7a7825.jpg	IMG-20251107-WA0138.jpg	2026-02-17 00:39:43.669766+00
20	3	photo_damage_left	/media/recepcion/3/photo_damage_left_0b52e01f7e414abcae9502c4200d335b.jpg	IMG-20251107-WA0128.jpg	2026-02-17 00:39:43.674636+00
21	3	photo_damage_left	/media/recepcion/3/photo_damage_left_b9465c76d5464c429ffcb798bad00ab0.jpg	IMG-20251107-WA0131.jpg	2026-02-17 00:39:43.67971+00
22	3	signature	/media/recepcion/3/signature_73110c11942d410f8cb03ab90711d9d7.png	firma.png	2026-02-17 00:39:43.681966+00
\.


--
-- Data for Name: recepciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recepciones (id, folio_recep, fecha_recep, nb_cliente, vehiculo, vehiculo_marca, vehiculo_modelo, vehiculo_anio, vehiculo_color, placas, seguro, fecha_entregaestim, estatus, created_at, tel_cliente, email_cliente, vehiculo_tipo, kilometraje, nivel_gas, estado_mecanico, observaciones, partes_siniestro, partes_preexistentes, observaciones_siniestro, observaciones_preexistentes) FROM stdin;
2	4411	2026-02-14 14:25:00	Gabriel Cano Juarez	\N	BYD	2026	\N	Beige	MPM319D	Qualitas	\N	Recepcionado	2026-02-13 18:16:48.965645	6673170201	gabo.moro.cano@gmail.com	Dolphin Mini	8990	1/2 Tanque	\N	\N	{SALPICADERA_DER,ESPEJO_DER}	{}	Arañazos en carroceria\n	\N
3	44000	2026-02-17 07:31:00	GABRIEL CANO JUAREZ	\N	BYD	2026	\N	BEIGE	VPM319D	Particular (Sin Seguro)	\N	Recepcionado	2026-02-17 00:39:43.531136	6673170201	gabo.moro.cano@gmail.com	DOLPHIN MINI	8990	1/2 Tanque	\N	\N	{PUERTA_DELANTERA_IZQ,POSTE_PARABRISAS_DERECHO}	{}	\N	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, user_name, password, email, profile, status, created_at, profile_id, name) FROM stdin;
1	afuentes	A355Fu584$	afa59@live.com.mx	Administrador	t	2026-01-26 00:26:13.199286	1	Anibal Fuentes
\.


--
-- Name: aseguradoras_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.aseguradoras_id_seq', 3, true);


--
-- Name: clientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clientes_id_seq', 5, true);


--
-- Name: estatus_valuacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estatus_valuacion_id_seq', 37, true);


--
-- Name: expediente_archivos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.expediente_archivos_id_seq', 40, true);


--
-- Name: expedientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.expedientes_id_seq', 2, true);


--
-- Name: grupos_autos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.grupos_autos_id_seq', 27, true);


--
-- Name: historical_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.historical_entries_id_seq', 3, true);


--
-- Name: marcas_autos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.marcas_autos_id_seq', 93, true);


--
-- Name: orden_admision_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orden_admision_id_seq', 5, true);


--
-- Name: partes_auto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.partes_auto_id_seq', 49, true);


--
-- Name: profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_id_seq', 6, true);


--
-- Name: recepcion_media_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.recepcion_media_id_seq', 22, true);


--
-- Name: recepciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.recepciones_id_seq', 3, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: aseguradoras aseguradoras_nb_aseguradora_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aseguradoras
    ADD CONSTRAINT aseguradoras_nb_aseguradora_key UNIQUE (nb_aseguradora);


--
-- Name: aseguradoras aseguradoras_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aseguradoras
    ADD CONSTRAINT aseguradoras_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_tel_cliente_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_tel_cliente_key UNIQUE (tel_cliente);


--
-- Name: estatus_valuacion estatus_valuacion_nombre_estatus_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estatus_valuacion
    ADD CONSTRAINT estatus_valuacion_nombre_estatus_key UNIQUE (nombre_estatus);


--
-- Name: estatus_valuacion estatus_valuacion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estatus_valuacion
    ADD CONSTRAINT estatus_valuacion_pkey PRIMARY KEY (id);


--
-- Name: expediente_archivos expediente_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expediente_archivos
    ADD CONSTRAINT expediente_archivos_pkey PRIMARY KEY (id);


--
-- Name: expedientes expedientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expedientes
    ADD CONSTRAINT expedientes_pkey PRIMARY KEY (id);


--
-- Name: expedientes expedientes_reporte_siniestro_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expedientes
    ADD CONSTRAINT expedientes_reporte_siniestro_key UNIQUE (reporte_siniestro);


--
-- Name: grupos_autos grupos_autos_nb_grupo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupos_autos
    ADD CONSTRAINT grupos_autos_nb_grupo_key UNIQUE (nb_grupo);


--
-- Name: grupos_autos grupos_autos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grupos_autos
    ADD CONSTRAINT grupos_autos_pkey PRIMARY KEY (id);


--
-- Name: historical_entries historical_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historical_entries
    ADD CONSTRAINT historical_entries_pkey PRIMARY KEY (id);


--
-- Name: marcas_autos marcas_autos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marcas_autos
    ADD CONSTRAINT marcas_autos_pkey PRIMARY KEY (id);


--
-- Name: marcas_autos marcas_autos_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marcas_autos
    ADD CONSTRAINT marcas_autos_unique UNIQUE (gpo_marca, nb_marca);


--
-- Name: orden_admision orden_admision_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orden_admision
    ADD CONSTRAINT orden_admision_pkey PRIMARY KEY (id);


--
-- Name: partes_auto partes_auto_nb_parte_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partes_auto
    ADD CONSTRAINT partes_auto_nb_parte_key UNIQUE (nb_parte);


--
-- Name: partes_auto partes_auto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.partes_auto
    ADD CONSTRAINT partes_auto_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_profile_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_profile_name_key UNIQUE (profile_name);


--
-- Name: recepcion_media recepcion_media_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepcion_media
    ADD CONSTRAINT recepcion_media_pkey PRIMARY KEY (id);


--
-- Name: recepciones recepciones_folio_recep_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepciones
    ADD CONSTRAINT recepciones_folio_recep_key UNIQUE (folio_recep);


--
-- Name: recepciones recepciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepciones
    ADD CONSTRAINT recepciones_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_user_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_name_key UNIQUE (user_name);


--
-- Name: idx_recepcion_media_recepcion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recepcion_media_recepcion_id ON public.recepcion_media USING btree (recepcion_id);


--
-- Name: idx_recepcion_media_recepcion_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recepcion_media_recepcion_type ON public.recepcion_media USING btree (recepcion_id, media_type);


--
-- Name: expediente_archivos expediente_archivos_expediente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expediente_archivos
    ADD CONSTRAINT expediente_archivos_expediente_id_fkey FOREIGN KEY (expediente_id) REFERENCES public.expedientes(id) ON DELETE CASCADE;


--
-- Name: recepcion_media recepcion_media_recepcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recepcion_media
    ADD CONSTRAINT recepcion_media_recepcion_id_fkey FOREIGN KEY (recepcion_id) REFERENCES public.recepciones(id) ON DELETE CASCADE;


--
-- Name: users users_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict K0NxqcfFCj8uPp8gdclasO4bdtMu52eNWmi7m7jmlCj4qEUQVBHNfRmAKxjrxkj

