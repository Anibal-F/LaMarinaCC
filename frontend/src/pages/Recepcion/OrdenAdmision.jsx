import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { getSession } from "../../utils/auth.js";

const STOPWORDS = new Set([
  "DE",
  "DEL",
  "LA",
  "EL",
  "LOS",
  "LAS",
  "Y",
  "AL",
  "EN",
  "POR",
  "PARA",
  "CON",
  "SE",
  "A",
  "CHECAR",
  "REVISION",
  "REVISAR"
]);

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) =>
  normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));

const COLUMN_DEFS = [
  { key: "aseguradora_1", label: "Aseguradora", cellClass: "text-slate-300", getValue: (r) => r.seguro_comp || "-" },
  { key: "reporte", label: "Reporte/Siniestro", cellClass: "text-primary font-bold", getValue: (r) => r.reporte_siniestro || "-" },
  { key: "fecha", label: "Fecha admision", cellClass: "text-slate-300", getValue: (r) => r.fecha_adm || "-" },
  { key: "hora", label: "Hora admision", cellClass: "text-slate-300", getValue: (r) => r.hr_adm || "-" },
  { key: "cliente", label: "Cliente", cellClass: "text-white font-semibold", getValue: (r) => r.nb_cliente || "-" },
  { key: "aseguradora_2", label: "Aseguradora", cellClass: "text-slate-300", getValue: (r) => r.seguro_comp || "-" },
  { key: "telefono", label: "Telefono", cellClass: "text-slate-300", getValue: (r) => r.tel_cliente || "-" },
  { key: "email", label: "Email", cellClass: "text-slate-300", getValue: (r) => r.email_cliente || "-" },
  {
    key: "vehiculo",
    label: "Vehiculo",
    cellClass: "text-slate-300",
    getValue: (r) => [r.marca_vehiculo, r.tipo_vehiculo, r.modelo_anio].filter(Boolean).join(" ")
  },
  { key: "placas", label: "Placas", cellClass: "text-slate-300 font-mono uppercase text-xs", getValue: (r) => r.placas || "-" },
  { key: "kilometraje", label: "Kilometraje", cellClass: "text-slate-300", getValue: (r) => r.kilometraje || "-" },
  { key: "transmision", label: "Transmisión", cellClass: "text-slate-300", getValue: (r) => r.transmision || "-" },
  { key: "danos_siniestro", label: "Danos siniestro", cellClass: "text-slate-300", getValue: (r) => r.danos_siniestro || "-" },
  { key: "descripcion_siniestro", label: "Descripcion siniestro", cellClass: "text-slate-300", getValue: (r) => r.descripcion_siniestro || "-" },
  { key: "danos_preexistentes", label: "Danos preexistentes", cellClass: "text-slate-300", getValue: (r) => r.danos_preexistentes || "-" },
  { key: "descripcion_preexistentes", label: "Descripcion danos preexistentes", cellClass: "text-slate-300", getValue: (r) => r.descripcion_danospreex || "-" },
  { key: "registro", label: "Registro", cellClass: "text-slate-300", getValue: (r) => r.created_at || "-" }
];

const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map((column) => column.key);
const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, "150px"]));

function matchCatalogPartsFromDescription(description, catalogParts = []) {
  if (!description || !catalogParts.length) return [];

  const segments = String(description)
    .split(/[,\n;/]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const indexedParts = catalogParts
    .map((item) => {
      const name = String(item.nb_parte || "").trim();
      if (!name) return null;
      const norm = normalizeText(name);
      const tokens = tokenize(name);
      return { name, norm, tokens };
    })
    .filter(Boolean);

  const matches = new Set();
  for (const segment of segments) {
    const segNorm = normalizeText(segment);
    const segTokens = new Set(tokenize(segment));
    if (!segTokens.size) continue;

    let best = null;
    let bestScore = 0;
    for (const part of indexedParts) {
      if (!part.tokens.length) continue;
      if (segNorm.includes(part.norm) || part.norm.includes(segNorm)) {
        best = part;
        bestScore = 10;
        break;
      }

      const hits = part.tokens.filter((token) => segTokens.has(token)).length;
      if (!hits) continue;

      const coverage = hits / part.tokens.length;
      const score = coverage + hits * 0.2;
      if (score > bestScore) {
        best = part;
        bestScore = score;
      }
    }

    if (best && bestScore >= 0.6) {
      matches.add(best.name);
    }
  }

  return Array.from(matches);
}

export default function OrdenAdmision() {
  const navigate = useNavigate();
  const session = getSession();
  const userKey = String(session?.id || session?.user_name || session?.email || "anon").toLowerCase();
  const sessionKey = String(session?.session_started_at || "no-session");
  const storageKey = `lmcc:ordenes:columns:${userKey}`;
  const sessionStorageKey = `lmcc:ordenes:columns:${userKey}:${sessionKey}`;
  const [records, setRecords] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelosAutos, setModelosAutos] = useState([]);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [partesAuto, setPartesAuto] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState("");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [draggingColumnKey, setDraggingColumnKey] = useState(null);
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [resizingColumn, setResizingColumn] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [filters, setFilters] = useState({
    fechaInicio: "",
    fechaFin: "",
    reporte: "",
    aseguradora: "",
    cliente: "",
    marca: "",
    tipo: "",
    modelo: "",
    anio: "",
    placas: "",
    serie: ""
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [marcaSaving, setMarcaSaving] = useState(false);
  const [marcaError, setMarcaError] = useState("");
  const [modeloSaving, setModeloSaving] = useState(false);
  const [modeloError, setModeloError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [danosSiniestroParts, setDanosSiniestroParts] = useState([]);
  const [danosPreexistParts, setDanosPreexistParts] = useState([]);
  const [danosSiniestroSelect, setDanosSiniestroSelect] = useState("");
  const [danosPreexistSelect, setDanosPreexistSelect] = useState("");
  const [adjuntoOrden, setAdjuntoOrden] = useState(null);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [extractInfo, setExtractInfo] = useState("");
  
  // Estados para RPA de adjudicación Qualitas
  const [adjudicacionModal, setAdjudicacionModal] = useState(null);
  const [adjudicando, setAdjudicando] = useState(false);
  const [adjudicacionResult, setAdjudicacionResult] = useState(null);
  const [estatusExp, setEstatusExp] = useState("1"); // 1=Piso, 2=Tránsito
  const [ingresoGrua, setIngresoGrua] = useState("0"); // 0=No, 1=Sí
  
  const [form, setForm] = useState({
    reporte_siniestro: "",
    fecha_adm: "",
    hr_adm: "",
    nb_cliente: "",
    seguro_comp: "",
    tel_cliente: "",
    email_cliente: "",
    marca_vehiculo: "",
    tipo_vehiculo: "",
    modelo_anio: "",
    color_vehiculo: "",
    serie_auto: "",
    placas: "",
    kilometraje: "",
    transmision: "",
    danos_siniestro: "",
    danos_preexistentes: "",
    descripcion_siniestro: "",
    descripcion_danospreex: ""
  });

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/ordenes`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar las ordenes de admision");
        }
        const payload = await response.json();
        setRecords(payload);
      } catch (err) {
        setError(err.message || "No se pudieron cargar las ordenes de admision");
      }
    };

    load();
  }, []);

  useEffect(() => {
    const loadCatalogos = async () => {
      try {
        const [gruposRes, marcasRes, modelosRes, aseguradorasRes, partesRes, clientesRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/grupos-autos`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/marcas-autos`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/modelos-autos`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`),
          fetch(`${import.meta.env.VITE_API_URL}/clientes`)
        ]);
        if (gruposRes.ok) {
          setGrupos(await gruposRes.json());
        }
        if (marcasRes.ok) {
          setMarcas(await marcasRes.json());
        }
        if (modelosRes.ok) {
          setModelosAutos(await modelosRes.json());
        }
        if (aseguradorasRes.ok) {
          setAseguradoras(await aseguradorasRes.json());
        }
        if (partesRes.ok) {
          setPartesAuto(await partesRes.json());
        }
        if (clientesRes.ok) {
          setClientes(await clientesRes.json());
        }
      } catch {
        // ignore catalog load errors
      }
    };

    loadCatalogos();
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(60, resizeStartWidth + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: `${newWidth}px` }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  useEffect(() => {
    const parsePrefs = (raw) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const orderCandidate = Array.isArray(parsed.order) ? parsed.order.filter((key) => DEFAULT_COLUMN_ORDER.includes(key)) : [];
        const hiddenCandidate = Array.isArray(parsed.hidden) ? parsed.hidden.filter((key) => DEFAULT_COLUMN_ORDER.includes(key)) : [];
        const fullOrder = [...orderCandidate, ...DEFAULT_COLUMN_ORDER.filter((key) => !orderCandidate.includes(key))];
        const savedWidths = parsed.widths || {};
        const mergedWidths = { ...DEFAULT_COLUMN_WIDTHS, ...savedWidths };
        return { order: fullOrder, hidden: hiddenCandidate, widths: mergedWidths };
      } catch {
        return null;
      }
    };

    const sessionPrefs = parsePrefs(sessionStorage.getItem(sessionStorageKey));
    const localPrefs = parsePrefs(localStorage.getItem(storageKey));
    const prefs = sessionPrefs || localPrefs;
    if (!prefs) return;
    setColumnOrder(prefs.order);
    setHiddenColumns(prefs.hidden);
    setColumnWidths(prefs.widths || DEFAULT_COLUMN_WIDTHS);
  }, [sessionStorageKey, storageKey]);

  useEffect(() => {
    const payload = JSON.stringify({ order: columnOrder, hidden: hiddenColumns, widths: columnWidths });
    sessionStorage.setItem(sessionStorageKey, payload);
    localStorage.setItem(storageKey, payload);
  }, [columnOrder, hiddenColumns, columnWidths, sessionStorageKey, storageKey]);

  useEffect(() => {
    if (!form.descripcion_siniestro || danosSiniestroParts.length || !partesAuto.length) return;
    const matched = matchCatalogPartsFromDescription(form.descripcion_siniestro, partesAuto);
    if (matched.length) {
      setDanosSiniestroParts(matched);
    }
  }, [form.descripcion_siniestro, danosSiniestroParts.length, partesAuto]);

  useEffect(() => {
    if (!previewModal?.archivo_path) return;
    setPreviewLoading(true);
    const fileUrl = `${import.meta.env.VITE_API_URL}${previewModal.archivo_path}`;
    let active = true;
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el archivo");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setPreviewType(blob.type || "");
      })
      .catch(() => {
        if (!active) return;
        setPreviewUrl("");
        setPreviewType("");
      })
      .finally(() => {
        if (!active) return;
        setPreviewLoading(false);
      });

    return () => {
      active = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal]);

  const resetForm = () => {
    setForm({
      reporte_siniestro: "",
      fecha_adm: "",
      hr_adm: "",
      nb_cliente: "",
      seguro_comp: "",
      tel_cliente: "",
      email_cliente: "",
      marca_vehiculo: "",
      tipo_vehiculo: "",
      modelo_anio: "",
      color_vehiculo: "",
      serie_auto: "",
      placas: "",
      kilometraje: "",
      transmision: "",
      danos_siniestro: "",
      danos_preexistentes: "",
      descripcion_siniestro: "",
      descripcion_danospreex: ""
    });
    setDanosSiniestroParts([]);
    setDanosPreexistParts([]);
    setDanosSiniestroSelect("");
    setDanosPreexistSelect("");
    setAdjuntoOrden(null);
    setExtractInfo("");
  };

  const openModal = () => {
    setError("");
    setFieldErrors({});
    resetForm();
    setGrupoSeleccionado("");
    setMarcaError("");
    setIsModalOpen(true);
  };

  const openEdit = (record) => {
    setError("");
    setFieldErrors({});
    setEditingId(record.id);
    setForm({
      reporte_siniestro: record.reporte_siniestro || "",
      fecha_adm: record.fecha_adm ? String(record.fecha_adm).slice(0, 10) : "",
      hr_adm: record.hr_adm || "",
      nb_cliente: record.nb_cliente || "",
      seguro_comp: record.seguro_comp || "",
      tel_cliente: record.tel_cliente || "",
      email_cliente: record.email_cliente || "",
      marca_vehiculo: record.marca_vehiculo || "",
      tipo_vehiculo: record.tipo_vehiculo || "",
      modelo_anio: record.modelo_anio || "",
      color_vehiculo: record.color_vehiculo || "",
      serie_auto: record.serie_auto || "",
      placas: record.placas || "",
      kilometraje: record.kilometraje ? String(record.kilometraje) : "",
      transmision: record.transmision || "",
      danos_siniestro: record.danos_siniestro || "",
      danos_preexistentes: record.danos_preexistentes || "",
      descripcion_siniestro: record.descripcion_siniestro || "",
      descripcion_danospreex: record.descripcion_danospreex || ""
    });
    setDanosSiniestroParts(
      record.danos_siniestro
        ? String(record.danos_siniestro)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    );
    setDanosPreexistParts(
      record.danos_preexistentes
        ? String(record.danos_preexistentes)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    );
    setGrupoSeleccionado("");
    if (record.marca_vehiculo) {
      const selected = marcas.find((marca) => marca.nb_marca === record.marca_vehiculo);
      if (selected?.gpo_marca) {
        setGrupoSeleccionado(selected.gpo_marca);
      }
    }
    setAdjuntoOrden(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  // Campos críticos que siempre deben reemplazarse si el OCR los detecta
  const CRITICAL_OCR_FIELDS = [
    "reporte_siniestro",
    "fecha_adm", 
    "hr_adm",
    "nb_cliente",
    "placas"
  ];
  
  // Campos que solo se reemplazan si están vacíos (no críticos)
  const OPTIONAL_OCR_FIELDS = [
    "seguro_comp",
    "tel_cliente",
    "email_cliente",
    "color_vehiculo",
    "transmision",
    "descripcion_siniestro"
  ];

  const applyExtractedFields = (campos, fieldDebug = {}) => {
    if (!campos || typeof campos !== "object") return;
    
    // Contador de campos aplicados para feedback
    let appliedCount = 0;
    let skippedCount = 0;
    
    setForm((prev) => {
      const next = { ...prev };
      
      // Mapeo de campos del OCR a campos del formulario
      const map = {
        reporte_siniestro: "reporte_siniestro",
        fecha_adm: "fecha_adm",
        hr_adm: "hr_adm",
        nb_cliente: "nb_cliente",
        seguro_comp: "seguro_comp",
        tel_cliente: "tel_cliente",
        email_cliente: "email_cliente",
        marca_vehiculo: "marca_vehiculo",
        tipo_vehiculo: "tipo_vehiculo",
        modelo_anio: "modelo_anio",
        color_vehiculo: "color_vehiculo",
        serie_auto: "serie_auto",
        placas: "placas",
        kilometraje: "kilometraje",
        transmision: "transmision",
        descripcion_siniestro: "descripcion_siniestro"
      };
      
      for (const [target, source] of Object.entries(map)) {
        const incoming = String(campos[source] || "").trim();
        if (!incoming) continue;
        
        const current = String(next[target] || "").trim();
        const debugMethod = fieldDebug[source];
        
        // Lógica de aplicación según tipo de campo
        if (CRITICAL_OCR_FIELDS.includes(target)) {
          // Campos críticos: siempre reemplazar si hay nuevo valor
          next[target] = source === "kilometraje" ? incoming.replace(/[^\d]/g, "") : incoming;
          appliedCount++;
        } else if (OPTIONAL_OCR_FIELDS.includes(target)) {
          // Campos opcionales: solo reemplazar si está vacío
          if (!current) {
            next[target] = incoming;
            appliedCount++;
          } else {
            skippedCount++;
          }
        } else {
          // Campos de vehículo: reemplazar si está vacío o si el método de extracción es confiable
          if (!current || debugMethod?.startsWith("kv:") || debugMethod === "flexible_kv") {
            next[target] = source === "kilometraje" ? incoming.replace(/[^\d]/g, "") : incoming;
            appliedCount++;
          } else {
            skippedCount++;
          }
        }
      }
      return next;
    });
    
    return { applied: appliedCount, skipped: skippedCount };
  };

  const handleAdjuntoChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setAdjuntoOrden(file);
    setExtractInfo("");
    if (!file) return;
    try {
      setExtractingDoc(true);
      
      // Limpiar formulario anterior para evitar datos mezclados
      resetForm();
      
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/ordenes/extract-fields`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo extraer información del archivo");
      }
      const payload = await response.json();
      const campos = payload?.campos || {};
      const fieldDebug = payload?.field_debug || {};
      const ocrLines = payload?.ocr_lines || [];
      
      // Debug: mostrar en consola lo que recibimos del backend
      if (import.meta.env.DEV) {
        console.log("OCR Response:", { campos, fieldDebug, rawText: payload?.raw_text?.substring(0, 500) });
      }
      
      // Aplicar campos extraídos con información de debug
      const applyResult = applyExtractedFields(campos, fieldDebug);

      // ========== FUZZY MATCHING PARA TIPO DE VEHÍCULO ==========
      // Si el OCR detectó un tipo, intentar encontrar el mejor match en el catálogo
      if (campos?.tipo_vehiculo && modelosAutos.length > 0) {
        const tipoOcr = String(campos.tipo_vehiculo).toUpperCase().trim();
        const marcaOcr = String(campos.marca_vehiculo || "").toUpperCase().trim();
        
        // Filtrar modelos por marca si está disponible
        const modelosFiltrados = marcaOcr
          ? modelosAutos.filter(m => String(m.nb_marca || "").toUpperCase() === marcaOcr)
          : modelosAutos;
        
        if (modelosFiltrados.length > 0) {
          // Función de distancia de Levenshtein simplificada
          const levenshteinDistance = (a, b) => {
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
              for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                  ? matrix[i - 1][j - 1]
                  : Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
              }
            }
            return matrix[b.length][a.length];
          };
          
          // Calcular score de similitud (0-1, donde 1 es exacto)
          const similarity = (a, b) => {
            const aClean = a.replace(/[^A-Z0-9]/gi, "");
            const bClean = b.replace(/[^A-Z0-9]/gi, "");
            if (!aClean || !bClean) return 0;
            const dist = levenshteinDistance(aClean, bClean);
            const maxLen = Math.max(aClean.length, bClean.length);
            return 1 - dist / maxLen;
          };
          
          // Encontrar el mejor match
          let bestMatch = null;
          let bestScore = 0;
          const SIMILARITY_THRESHOLD = 0.5; // Mínimo 50% de similitud (subido de 0.4)
          
          for (const modelo of modelosFiltrados) {
            const nombreModelo = String(modelo.nb_modelo || "").toUpperCase().trim();
            if (!nombreModelo) continue;
            
            const nombreModeloClean = nombreModelo.replace(/[^A-Z0-9]/gi, "");
            const tipoOcrClean = tipoOcr.replace(/[^A-Z0-9]/gi, "");
            
            let score = similarity(tipoOcr, nombreModelo);
            
            // Bonus si hay coincidencia exacta o contenida
            if (tipoOcr === nombreModelo) {
              // Coincidencia exacta - máximo bonus
              score = 1.0;
            } else if (tipoOcrClean === nombreModeloClean) {
              // Coincidencia exacta después de limpiar
              score = 0.95;
            } else if (tipoOcr.includes(nombreModelo)) {
              // OCR contiene exactamente el modelo del catálogo
              const bonus = 0.25;
              score = Math.min(score + bonus, 1);
            } else if (nombreModelo.includes(tipoOcr)) {
              // El modelo del catálogo contiene el OCR
              // Penalizar si el catálogo es mucho más largo
              const lengthRatio = tipoOcr.length / nombreModelo.length;
              const bonus = 0.15 * lengthRatio; // Menos bonus si el catálogo es mucho más largo
              score = Math.min(score + bonus, 0.9); // Máximo 0.9 para contenidos
            }
            
            // Penalizar si la longitud del catálogo es mucho mayor que el OCR
            // Esto evita que "COROLLA BASE" matchee con "COROLLA BASE 4 PTAS"
            if (nombreModelo.length > tipoOcr.length * 1.5) {
              const penalty = (nombreModelo.length - tipoOcr.length) * 0.02;
              score = Math.max(0, score - penalty);
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = modelo;
            }
          }
          
          // Aplicar el mejor match si supera el umbral
          if (bestMatch && bestScore >= SIMILARITY_THRESHOLD) {
            setForm(prev => ({
              ...prev,
              tipo_vehiculo: bestMatch.nb_modelo
            }));
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log("Fuzzy match tipo:", {
                original: campos.tipo_vehiculo,
                matched: bestMatch.nb_modelo,
                score: bestScore.toFixed(2)
              });
            }
          }
        }
      }

      // Procesar daños del siniestro si están presentes
      if (campos?.danos_siniestro) {
        setDanosSiniestroParts((prev) => {
          const list = String(campos.danos_siniestro)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!list.length || prev.length) return prev;
          return list;
        });
      } else if (campos?.descripcion_siniestro && partesAuto.length) {
        // Extraer partes automáticamente de la descripción
        setDanosSiniestroParts((prev) => {
          if (prev.length) return prev;
          const matched = matchCatalogPartsFromDescription(campos.descripcion_siniestro, partesAuto);
          return matched.length ? matched : prev;
        });
      }
      
      // Procesar daños preexistentes
      if (campos?.danos_preexistentes) {
        setDanosPreexistParts((prev) => {
          const list = String(campos.danos_preexistentes)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!list.length || prev.length) return prev;
          return list;
        });
      }

      // Actualizar grupo de marca si se detectó marca
      if (campos?.marca_vehiculo) {
        const selected = marcas.find((marca) => marca.nb_marca === campos.marca_vehiculo);
        if (selected?.gpo_marca) {
          setGrupoSeleccionado(selected.gpo_marca);
        }
      }
      
      const aseguradoraDetectada = payload?.aseguradora_detectada;
      
      // Definir campos requeridos para revisión
      const requiredForReview = [
        ["reporte_siniestro", "Reporte/Siniestro"],
        ["fecha_adm", "Fecha admisión"],
        ["hr_adm", "Hora admisión"],
        ["nb_cliente", "Nombre cliente"],
        ["marca_vehiculo", "Marca"],
        ["tipo_vehiculo", "Tipo"],
        ["modelo_anio", "Año"],
        ["placas", "Placas"]
      ];
      
      // Campos opcionales que son útiles pero no críticos
      const optionalFields = [
        ["tel_cliente", "Teléfono"],
        ["email_cliente", "Email"],
        ["serie_auto", "Serie"],
        ["kilometraje", "Kilometraje"],
        ["color_vehiculo", "Color"],
        ["transmision", "Transmisión"]
      ];
      
      // Calcular campos faltantes
      const missingCritical = requiredForReview
        .filter(([key]) => !String(campos?.[key] || "").trim())
        .map(([, label]) => label);
        
      const missingOptional = optionalFields
        .filter(([key]) => !String(campos?.[key] || "").trim())
        .map(([, label]) => label);
      
      // Log para debugging (solo en desarrollo)
      if (Object.keys(fieldDebug).length && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("OCR Debug:", { campos, fieldDebug, ocrLines: ocrLines.slice(0, 20) });
      }
      
      // Construir mensaje informativo
      let infoMessage = "";
      
      // Verificar si faltan datos del cliente específicamente
      const missingClientData = [];
      if (!campos?.nb_cliente) missingClientData.push("Nombre");
      if (!campos?.tel_cliente) missingClientData.push("Teléfono");
      if (!campos?.email_cliente) missingClientData.push("Email");
      
      // Verificar si los datos fueron rechazados (son del taller/aseguradora)
      const rejectedClientData = [];
      if (fieldDebug?.tel_cliente === "rejected_taller_phone") rejectedClientData.push("Teléfono");
      if (!campos?.tel_cliente && !fieldDebug?.tel_cliente) rejectedClientData.push("Teléfono");
      if (!campos?.email_cliente) rejectedClientData.push("Email");
      
      if (aseguradoraDetectada) {
        infoMessage = `✓ ${aseguradoraDetectada} detectado. `;
        infoMessage += `${applyResult.applied} campo(s) aplicado(s). `;
        
        if (missingCritical.length) {
          infoMessage += `⚠️ Revisar: ${missingCritical.join(", ")}.`;
        } else {
          infoMessage += "✓ Campos críticos completos.";
        }
        
        // Mensaje específico para datos del cliente
        if (missingClientData.length > 0 || rejectedClientData.length > 0) {
          const clientFields = [...new Set([...missingClientData, ...rejectedClientData])];
          infoMessage += ` 📋 Faltan datos del cliente: ${clientFields.join(", ")} (agregar manualmente).`;
        }
      } else {
        infoMessage = "No se detectó aseguradora. Revisa los campos manualmente.";
      }
      
      setExtractInfo(infoMessage);
    } catch (err) {
      setExtractInfo(`❌ Error: ${err.message || "No se pudo leer el documento"}`);
    } finally {
      setExtractingDoc(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.reporte_siniestro.trim()) errors.reporte_siniestro = "Requerido";
    if (!form.fecha_adm) errors.fecha_adm = "Requerido";
    if (!form.hr_adm) errors.hr_adm = "Requerido";
    if (!form.nb_cliente.trim()) errors.nb_cliente = "Requerido";
    if (!form.marca_vehiculo) errors.marca = "Selecciona una marca";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Completa los campos requeridos.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        ...form,
        kilometraje: form.kilometraje ? Number(form.kilometraje) : null,
        danos_siniestro: danosSiniestroParts.join(", "),
        danos_preexistentes: danosPreexistParts.join(", ")
      };
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${editingId}`
          : `${import.meta.env.VITE_API_URL}/recepcion/ordenes`,
        {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar la orden");
      }

      const created = await response.json().catch(() => ({}));
      const ordenId = editingId || created.id;

      const uploadExpedienteArchivo = async (file, tipo) => {
        if (!form.reporte_siniestro) return null;
        const formData = new FormData();
        formData.append("tipo", tipo);
        formData.append("file", file);
        const expedienteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            form.reporte_siniestro
          )}/archivos`,
          { method: "POST", body: formData }
        );
        if (!expedienteResponse.ok) {
          const payload = await expedienteResponse.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir el archivo al expediente");
        }
        return expedienteResponse.json().catch(() => null);
      };

      let archivoPayload = null;
      if (ordenId && adjuntoOrden) {
        const formData = new FormData();
        formData.append("file", adjuntoOrden);
        const fileResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${ordenId}/archivo`,
          { method: "POST", body: formData }
        );
        if (!fileResponse.ok) {
          const payload = await fileResponse.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir el archivo");
        }
        archivoPayload = await fileResponse.json().catch(() => null);
        try {
          await uploadExpedienteArchivo(adjuntoOrden, "archivoorden_admision");
        } catch (err) {
          setError(err.message || "No se pudo subir el archivo al expediente");
        }
      }

      const existingRecord = editingId
        ? records.find((item) => item.id === ordenId)
        : null;
      const updatedRecord = {
        id: ordenId,
        created_at: created.created_at || existingRecord?.created_at,
        reporte_siniestro: form.reporte_siniestro,
        fecha_adm: form.fecha_adm,
        hr_adm: form.hr_adm,
        nb_cliente: form.nb_cliente,
        seguro_comp: form.seguro_comp,
        tel_cliente: form.tel_cliente,
        email_cliente: form.email_cliente,
        marca_vehiculo: form.marca_vehiculo,
        tipo_vehiculo: form.tipo_vehiculo,
        modelo_anio: form.modelo_anio,
        color_vehiculo: form.color_vehiculo,
        serie_auto: form.serie_auto,
        placas: form.placas,
        kilometraje: form.kilometraje,
        transmision: form.transmision,
        danos_siniestro: danosSiniestroParts.join(", "),
        danos_preexistentes: danosPreexistParts.join(", "),
        descripcion_siniestro: form.descripcion_siniestro,
        descripcion_danospreex: form.descripcion_danospreex,
        archivo_path: archivoPayload?.path || existingRecord?.archivo_path,
        archivo_nombre: archivoPayload?.name || existingRecord?.archivo_nombre,
        archivo_size: archivoPayload?.size || existingRecord?.archivo_size
      };

      setRecords((prev) => {
        if (editingId) {
          return prev.map((item) => (item.id === ordenId ? { ...item, ...updatedRecord } : item));
        }
        return [updatedRecord, ...prev];
      });
      setIsModalOpen(false);
      setEditingId(null);
      resetForm();
    } catch (err) {
      setError(err.message || "No se pudo guardar la orden");
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const report = String(record.reporte_siniestro || "").toLowerCase();
      const cliente = String(record.nb_cliente || "").toLowerCase();
      const telefono = String(record.tel_cliente || "").toLowerCase();
      const placas = String(record.placas || "").toLowerCase();
      const seguro = String(record.seguro_comp || "").toLowerCase();
      const marca = String(record.marca_vehiculo || "").toLowerCase();
      const tipo = String(record.tipo_vehiculo || "").toLowerCase();
      const modelo = String(record.modelo_anio || "").toLowerCase();
      const serie = String(record.serie_auto || "").toLowerCase();
      const fechaAdm = String(record.fecha_adm || "").slice(0, 10);

      const matchesGlobal =
        !normalizedQuery ||
        report.includes(normalizedQuery) ||
        cliente.includes(normalizedQuery) ||
        telefono.includes(normalizedQuery) ||
        placas.includes(normalizedQuery);
      if (!matchesGlobal) return false;

      const filterReporte = String(filters.reporte || "").trim().toLowerCase();
      if (filterReporte && !report.includes(filterReporte)) return false;

      if (filters.aseguradora && seguro !== String(filters.aseguradora).toLowerCase()) return false;

      if (filters.cliente && cliente !== String(filters.cliente).toLowerCase()) return false;

      if (filters.fechaInicio && fechaAdm < filters.fechaInicio) return false;
      if (filters.fechaFin && fechaAdm > filters.fechaFin) return false;

      const filterMarca = String(filters.marca || "").trim().toLowerCase();
      if (filterMarca && !marca.includes(filterMarca)) return false;

      const filterTipo = String(filters.tipo || "").trim().toLowerCase();
      if (filterTipo && !tipo.includes(filterTipo)) return false;

      const filterModelo = String(filters.modelo || "").trim().toLowerCase();
      if (filterModelo && !modelo.includes(filterModelo)) return false;

      const filterAnio = String(filters.anio || "").trim();
      if (filterAnio && !modelo.includes(filterAnio)) return false;

      const filterPlacas = String(filters.placas || "").trim().toLowerCase();
      if (filterPlacas && !placas.includes(filterPlacas)) return false;

      const filterSerie = String(filters.serie || "").trim().toLowerCase();
      if (filterSerie && !serie.includes(filterSerie)) return false;

      return true;
    });
  }, [records, query, filters]);

  const aseguradoraOptions = useMemo(
    () =>
      Array.from(
        new Set(
          aseguradoras
            .map((item) => String(item.nb_aseguradora || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "es-MX")),
    [aseguradoras]
  );

  const clienteOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clientes
            .map((item) => String(item.nb_cliente || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "es-MX")),
    [clientes]
  );
  const marcaFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          marcas
            .map((item) => String(item.nb_marca || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "es-MX")),
    [marcas]
  );
  const tipoFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .map((item) => String(item.tipo_vehiculo || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "es-MX")),
    [records]
  );

  const activeFilterCount = useMemo(
    () =>
      Object.values(filters).reduce(
        (count, value) => (String(value || "").trim() ? count + 1 : count),
        0
      ),
    [filters]
  );

  const columnDefMap = useMemo(
    () => Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, column])),
    []
  );
  const visibleColumns = useMemo(
    () => columnOrder.filter((key) => !hiddenColumns.includes(key)).map((key) => columnDefMap[key]).filter(Boolean),
    [columnOrder, hiddenColumns, columnDefMap]
  );

  const moveColumn = (dragKey, targetKey) => {
    if (!dragKey || !targetKey || dragKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(dragKey);
      const toIndex = next.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleResizeStart = (e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    setResizeStartX(e.clientX);
    setResizeStartWidth(parseInt(columnWidths[columnKey] || '150', 10));
  };

  const toggleColumnVisibility = (key) => {
    setHiddenColumns((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      const currentlyVisible = DEFAULT_COLUMN_ORDER.filter((columnKey) => !prev.includes(columnKey));
      if (currentlyVisible.length <= 1) return prev;
      return [...prev, key];
    });
  };

  const marcasFiltradas = useMemo(() => {
    if (!grupoSeleccionado) return marcas;
    return marcas.filter((marca) => marca.gpo_marca === grupoSeleccionado);
  }, [marcas, grupoSeleccionado]);

  const modelosFiltrados = useMemo(() => {
    const marcaSeleccionada = String(form.marca_vehiculo || "").trim().toLowerCase();
    const modelosBase = !marcaSeleccionada
      ? modelosAutos
      : modelosAutos.filter(
          (modelo) => String(modelo.nb_marca || "").trim().toLowerCase() === marcaSeleccionada
        );

    return Array.from(
      new Set(
        modelosBase
          .map((item) => String(item.nb_modelo || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "es-MX", { sensitivity: "base" }));
  }, [form.marca_vehiculo, modelosAutos]);

  const handleCreateMarca = async (nombreMarca) => {
    setMarcaError("");
    if (!nombreMarca.trim()) {
      setMarcaError("Escribe la nueva marca.");
      return;
    }

    try {
      setMarcaSaving(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/marcas-autos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpo_marca: grupoSeleccionado || "Otros",
          nb_marca: nombreMarca.trim()
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la marca");
      }
      const created = await response.json();
      setMarcas((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, marca_vehiculo: created.nb_marca, tipo_vehiculo: "" }));
      setGrupoSeleccionado(created.gpo_marca || "Otros");
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la marca");
    } finally {
      setMarcaSaving(false);
    }
  };

  const handleCreateModelo = async (nombreModelo) => {
    setModeloError("");
    const marcaSeleccionada = marcas.find((marca) => marca.nb_marca === form.marca_vehiculo);
    if (!marcaSeleccionada?.id) {
      setModeloError("Selecciona primero una marca para registrar el tipo.");
      return;
    }
    if (!nombreModelo.trim()) {
      setModeloError("Escribe el tipo/modelo a registrar.");
      return;
    }

    try {
      setModeloSaving(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/modelos-autos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca_id: Number(marcaSeleccionada.id),
          nb_modelo: nombreModelo.trim()
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear el tipo");
      }
      const created = await response.json();
      setModelosAutos((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, tipo_vehiculo: created.nb_modelo }));
    } catch (err) {
      setModeloError(err.message || "No se pudo crear el tipo");
    } finally {
      setModeloSaving(false);
    }
  };

  const handleCreateGrupo = async (nombreGrupo) => {
    if (!nombreGrupo.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/grupos-autos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_grupo: nombreGrupo.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear el grupo");
      }
      const created = await response.json();
      setGrupos((prev) => [...prev, created]);
      setGrupoSeleccionado(created.nb_grupo);
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear el grupo");
    }
  };

  const handleCreateAseguradora = async (nombre) => {
    if (!nombre.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_aseguradora: nombre.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la aseguradora");
      }
      const created = await response.json();
      setAseguradoras((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, seguro_comp: created.nb_aseguradora }));
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la aseguradora");
    }
  };

  const lookupPlacas = async (placas) => {
    if (!placas.trim()) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/lookup-placas?placas=${encodeURIComponent(placas)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.source) return;
      setForm((prev) => ({
        ...prev,
        nb_cliente: prev.nb_cliente || data.nb_cliente || "",
        tel_cliente: prev.tel_cliente || data.tel_cliente || "",
        email_cliente: prev.email_cliente || data.email_cliente || "",
        marca_vehiculo: prev.marca_vehiculo || data.vehiculo_marca || "",
        tipo_vehiculo: prev.tipo_vehiculo || data.vehiculo_tipo || "",
        modelo_anio: prev.modelo_anio || (data.vehiculo_anio ? String(data.vehiculo_anio) : data.vehiculo_modelo || ""),
        color_vehiculo: prev.color_vehiculo || data.vehiculo_color || "",
        serie_auto: prev.serie_auto || data.serie_auto || "",
        kilometraje: prev.kilometraje || (data.kilometraje ? String(data.kilometraje) : ""),
        transmision: prev.transmision || data.transmision || "",
        seguro_comp: prev.seguro_comp || data.seguro || ""
      }));
      if (data.vehiculo_marca) {
        const selected = marcas.find((marca) => marca.nb_marca === data.vehiculo_marca);
        if (selected?.gpo_marca) {
          setGrupoSeleccionado(selected.gpo_marca);
        }
      }
    } catch {
      // ignore lookup failures
    }
  };

  const handleCreateParte = async (nombre) => {
    if (!nombre.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_parte: nombre.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la parte");
      }
      const created = await response.json();
      setPartesAuto((prev) => [...prev, created]);
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la parte");
    }
  };

  const handleFilterChange = (field) => (event) => {
    setFilters((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const clearFilters = () => {
    setFilters({
      fechaInicio: "",
      fechaFin: "",
      reporte: "",
      aseguradora: "",
      cliente: "",
      marca: "",
      tipo: "",
      modelo: "",
      anio: "",
      placas: "",
      serie: ""
    });
  };

  // Función para ejecutar el RPA de adjudicación en Qualitas
  const ejecutarAdjudicacion = async (record) => {
    if (!record.reporte_siniestro) {
      setError("La orden no tiene número de reporte/siniestro");
      return;
    }
    
    setAdjudicando(true);
    setAdjudicacionResult(null);
    setError("");
    
    try {
      // Preparar datos para la adjudicación
      const datos = {
        num_reporte: record.reporte_siniestro,
        nombre: record.nb_cliente?.split(" ")[0] || record.nb_cliente || "",
        apellidos: record.nb_cliente?.split(" ").slice(1).join(" ") || "",
        celular: record.tel_cliente?.replace(/\D/g, "") || "",
        email_cliente: record.email_cliente || "",
        marca_qualitas_codigo: obtenerCodigoMarcaQualitas(record.marca_vehiculo),
        modelo_id: "",
        modelo_texto: record.tipo_vehiculo || "",
        anio_vehiculo: record.modelo_anio || "",
        color_vehiculo: record.color_vehiculo || "",
        placa: record.placas || "",
        kilometraje: record.kilometraje ? String(record.kilometraje) : "",
        nro_serie: record.serie_auto || "",
        estatus_exp_id: estatusExp, // Valor seleccionado por el usuario
        ingreso_grua: ingresoGrua, // Valor seleccionado por el usuario
        ubicacion: "Taller Principal",
        contratante: record.nb_cliente || "",
        vehiculo_referencia: `${record.marca_vehiculo || ""} ${record.tipo_vehiculo || ""} ${record.modelo_anio || ""}`.trim(),
        headless: true
      };
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/rpa/qualitas/adjudicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
      });
      
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "Error al iniciar la adjudicación");
      }
      
      const result = await response.json();
      
      setAdjudicacionResult({
        exito: true,
        job_id: result.job_id,
        mensaje: "Adjudicación iniciada correctamente"
      });
      
    } catch (err) {
      setAdjudicacionResult({
        exito: false,
        mensaje: err.message || "Error al ejecutar la adjudicación"
      });
    } finally {
      setAdjudicando(false);
    }
  };
  
  // Función auxiliar para obtener el código de marca Qualitas
  const obtenerCodigoMarcaQualitas = (marca) => {
    if (!marca) return "BS"; // Otro
    
    const marcasMap = {
      "ACURA": "AC",
      "AUDI": "AI",
      "BMW": "BW",
      "BUICK": "BK",
      "CADILLAC": "CC",
      "CHEVROLET": "CT",
      "CHRYSLER": "CR",
      "DODGE": "DE",
      "FIAT": "FT",
      "FORD": "FD",
      "GM": "GS",
      "HONDA": "HA",
      "HYUNDAI": "HI",
      "INFINITI": "II",
      "JAC": "JC",
      "JAGUAR": "JR",
      "JEEP": "JP",
      "KIA": "KA",
      "LAMBORGHINI": "LA",
      "LAND ROVER": "LR",
      "LEXUS": "LX",
      "MAZDA": "MA",
      "MERCEDES": "MZ",
      "MERCEDES BENZ": "MZ",
      "MITSUBISHI": "MI",
      "NISSAN": "NN",
      "PEUGEOT": "PT",
      "PORSCHE": "PE",
      "RENAULT": "RT",
      "SEAT": "ST",
      "SMART": "SM",
      "SUBARU": "SU",
      "SUZUKI": "SI",
      "TESLA": "TE",
      "TOYOTA": "TY",
      "VOLKSWAGEN": "VW",
      "VOLVO": "VO",
      "BYD": "BD",
      "CHANGAN": "CN",
      "GEELY": "GY",
      "GWM": "GW",
      "MASERATI": "MT",
      "MG": "MG",
      "OMODA": "OM",
      "JETOUR": "JT",
      "DFSK": "DK"
    };
    
    const marcaUpper = marca.toUpperCase().trim();
    return marcasMap[marcaUpper] || "BS";
  };
  
  // Función auxiliar para obtener el código de color
  const obtenerCodigoColor = (color) => {
    if (!color) return "";
    
    const coloresMap = {
      "NEGRO": "000000",
      "BLANCO": "FFFFFF",
      "GRIS": "BEBEBE",
      "PLATA": "D3D3D3",
      "ROJO": "FF0000",
      "AZUL": "0000FF",
      "AZUL MARINO": "0000A8",
      "VERDE": "008000",
      "AMARILLO": "FFFF00",
      "NARANJA": "FFA500",
      "CAFE": "CD853F",
      "MARRON": "CD853F",
      "BEIGE": "F5F5DC",
      "DORADO": "FFD700",
      "VINO": "990000",
      "TINTO": "A52A2A",
      "GRAFITO": "1c1c1c",
      "ACERO": "b0b0b0"
    };
    
    const colorUpper = color.toUpperCase().trim();
    return coloresMap[colorUpper] || "";
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Ordenes de admision"
            showSearch
            searchPlaceholder="Buscar por reporte, cliente, telefono o placas..."
            searchValue={query}
            onSearchChange={setQuery}
            actions={
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                type="button"
                onClick={openModal}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nueva orden
              </button>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <section className="bg-surface-dark border border-border-dark rounded-xl overflow-visible relative z-20">
              <div className="px-4 py-3 border-b border-border-dark flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Filtros avanzados</h3>
                  <p className="text-xs text-slate-400">
                    Refina por fecha, aseguradora, cliente y datos del vehiculo.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg border border-border-dark text-slate-300 hover:text-white flex items-center gap-1"
                    onClick={() => setShowColumnManager((prev) => !prev)}
                    aria-expanded={showColumnManager}
                    aria-controls="column-manager-panel"
                  >
                    <span className="material-symbols-outlined text-base">view_column</span>
                    Columnas
                  </button>
                  <span
                    className="text-xs text-slate-300"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {filtered.length} resultado(s)
                  </span>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs rounded-lg border border-border-dark text-slate-300 hover:text-white"
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg border border-border-dark text-slate-300 hover:text-white flex items-center gap-1"
                    aria-expanded={showFilters}
                    aria-controls="ordenes-filtros-panel"
                    onClick={() => setShowFilters((prev) => !prev)}
                  >
                    <span className="material-symbols-outlined text-base">
                      {showFilters ? "expand_less" : "expand_more"}
                    </span>
                    {showFilters ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>
              {showFilters ? (
                <div id="ordenes-filtros-panel" className="p-4 space-y-5" role="region" aria-label="Panel de filtros de ordenes">
                  <fieldset className="space-y-3">
                    <legend className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                      Filtros generales
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="filtro-fecha-inicio" className="text-[10px] text-slate-400 uppercase">Fecha inicio</label>
                        <input
                          id="filtro-fecha-inicio"
                          type="date"
                          className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                          value={filters.fechaInicio}
                          onChange={handleFilterChange("fechaInicio")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="filtro-fecha-fin" className="text-[10px] text-slate-400 uppercase">Fecha fin</label>
                        <input
                          id="filtro-fecha-fin"
                          type="date"
                          className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                          value={filters.fechaFin}
                          onChange={handleFilterChange("fechaFin")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="filtro-reporte" className="text-[10px] text-slate-400 uppercase">No. Reporte/Siniestro</label>
                        <input
                          id="filtro-reporte"
                          type="text"
                          className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                          placeholder="Ej. 0425..."
                          value={filters.reporte}
                          onChange={handleFilterChange("reporte")}
                        />
                      </div>
                      <SearchableSelect
                        label="Aseguradora"
                        value={filters.aseguradora}
                        onChange={(value) => setFilters((prev) => ({ ...prev, aseguradora: value }))}
                        options={aseguradoraOptions}
                        placeholder="Seleccionar aseguradora"
                        emptyLabel="Sin aseguradoras"
                      />
                      <SearchableSelect
                        label="Cliente"
                        value={filters.cliente}
                        onChange={(value) => setFilters((prev) => ({ ...prev, cliente: value }))}
                        options={clienteOptions}
                        placeholder="Seleccionar cliente"
                        emptyLabel="Sin clientes"
                      />
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3">
                    <legend className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                      Filtros de vehiculo
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                      <SearchableSelect
                        label="Marca"
                        value={filters.marca}
                        onChange={(value) => setFilters((prev) => ({ ...prev, marca: value }))}
                        options={marcaFilterOptions}
                        placeholder="Seleccionar marca"
                        emptyLabel="Sin marcas"
                      />
                      <SearchableSelect
                        label="Tipo"
                        value={filters.tipo}
                        onChange={(value) => setFilters((prev) => ({ ...prev, tipo: value }))}
                        options={tipoFilterOptions}
                        placeholder="Seleccionar tipo"
                        emptyLabel="Sin tipos"
                      />
                      <div className="space-y-1">
                        <label htmlFor="filtro-modelo" className="text-[10px] text-slate-400 uppercase">Modelo</label>
                        <input id="filtro-modelo" type="text" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={filters.modelo} onChange={handleFilterChange("modelo")} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="filtro-anio" className="text-[10px] text-slate-400 uppercase">Año</label>
                        <input id="filtro-anio" type="text" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={filters.anio} onChange={handleFilterChange("anio")} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="filtro-placas" className="text-[10px] text-slate-400 uppercase">Placas</label>
                        <input id="filtro-placas" type="text" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase" value={filters.placas} onChange={handleFilterChange("placas")} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="filtro-serie" className="text-[10px] text-slate-400 uppercase">No. Serie</label>
                        <input id="filtro-serie" type="text" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase" value={filters.serie} onChange={handleFilterChange("serie")} />
                      </div>
                    </div>
                  </fieldset>
                </div>
              ) : null}
            </section>

            {showColumnManager ? (
              <section
                id="column-manager-panel"
                className="bg-surface-dark border border-border-dark rounded-xl p-4"
                role="region"
                aria-label="Configuración de columnas"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-sm font-bold text-white">Configurar columnas</h3>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg border border-border-dark text-slate-300 hover:text-white"
                    onClick={() => {
                      setColumnOrder(DEFAULT_COLUMN_ORDER);
                      setHiddenColumns([]);
                      setColumnWidths(DEFAULT_COLUMN_WIDTHS);
                    }}
                  >
                    Restaurar por defecto
                  </button>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Arrastra para cambiar orden. Arrastra el borde derecho de los headers para redimensionar. Marca/desmarca para ocultar o mostrar.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {columnOrder.map((columnKey) => {
                    const column = columnDefMap[columnKey];
                    if (!column) return null;
                    const visible = !hiddenColumns.includes(columnKey);
                    return (
                      <div
                        key={`col-config-${columnKey}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border-dark bg-background-dark px-3 py-2"
                        draggable
                        onDragStart={() => setDraggingColumnKey(columnKey)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          moveColumn(draggingColumnKey, columnKey);
                          setDraggingColumnKey(null);
                        }}
                        onDragEnd={() => setDraggingColumnKey(null)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-slate-500 text-base">drag_indicator</span>
                          <span className="text-sm text-slate-200 truncate">{column.label}</span>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={() => toggleColumnVisibility(columnKey)}
                          />
                          Visible
                        </label>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="overflow-x-auto custom-scrollbar bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-[1200px] w-full text-left border-collapse">
                <caption className="sr-only">
                  Tabla de ordenes de admision filtrada por criterios de busqueda y filtros avanzados
                </caption>
                <thead>
                  <tr className="bg-background-dark/50">
                    {visibleColumns.map((column) => (
                      <th
                        key={`th-${column.key}`}
                        className="relative px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark cursor-move select-none"
                        style={{ width: columnWidths[column.key] || '150px', minWidth: columnWidths[column.key] || '150px' }}
                        draggable
                        onDragStart={() => setDraggingColumnKey(column.key)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          moveColumn(draggingColumnKey, column.key);
                          setDraggingColumnKey(null);
                        }}
                        onDragEnd={() => setDraggingColumnKey(null)}
                        title="Arrastra para reordenar. Arrastra el borde derecho para redimensionar."
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-slate-600">drag_indicator</span>
                          {column.label}
                        </span>
                        {/* Resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, column.key)}
                          onClick={(e) => e.stopPropagation()}
                          title="Arrastra para redimensionar"
                        />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={visibleColumns.length + 1}>
                        No hay ordenes de admision para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((record) => (
                      <tr key={record.id} className="border-b border-border-dark/50 hover:bg-white/5">
                        {visibleColumns.map((column) => {
                          const value = column.getValue(record);
                          const cellStyle = { width: columnWidths[column.key] || '150px', minWidth: columnWidths[column.key] || '150px' };
                          return (
                            <td key={`td-${record.id}-${column.key}`} className={`px-4 py-3 text-sm ${column.cellClass || "text-slate-300"}`} style={cellStyle}>
                              {column.key === "vehiculo" ? (
                                <>
                                  {value || "-"}
                                  {record.color_vehiculo ? (
                                    <span className="text-[10px] text-slate-500 block">{record.color_vehiculo}</span>
                                  ) : null}
                                </>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                              title="Ver archivo"
                              type="button"
                              onClick={() => {
                                if (record.archivo_path) {
                                  setPreviewModal(record);
                                  setPreviewZoom(1);
                                }
                              }}
                              disabled={!record.archivo_path}
                            >
                              <span className="material-symbols-outlined text-lg">visibility</span>
                            </button>
                            <button
                              className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                              title="Agendar cita"
                              type="button"
                              onClick={() =>
                                navigate(`/recepcion/citas?orderId=${encodeURIComponent(record.id)}`)
                              }
                            >
                              <span className="material-symbols-outlined text-lg">event</span>
                            </button>
                            {record.seguro_comp?.toUpperCase().includes("QUALITAS") ? (
                              <button
                                className="p-1.5 hover:bg-purple-500/20 hover:text-purple-400 rounded text-slate-400 transition-colors"
                                title="Adjudicar en Qualitas"
                                type="button"
                                onClick={() => {
                                  setAdjudicacionModal(record);
                                  setAdjudicando(false);
                                  setAdjudicacionResult(null);
                                  setError("");
                                }}
                              >
                                <span className="material-symbols-outlined text-lg">robot</span>
                              </button>
                            ) : null}
                            <button
                              className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                              title="Editar"
                              type="button"
                              onClick={() => openEdit(record)}
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button
                              className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                              title="Eliminar"
                              type="button"
                              onClick={() => setDeleteTarget(record)}
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60">
          <div className="w-full max-w-4xl max-h-[90vh] bg-surface-dark border border-border-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Nueva orden de admisión</h3>
                <p className="text-xs text-slate-400">
                  Captura rápida de la orden antes de registrar la recepción.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <form
              id="orden-admision-form"
              className="p-6 space-y-6 overflow-y-auto"
              onSubmit={handleSubmit}
            >
              {error ? <p className="text-sm text-alert-red">{error}</p> : null}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                    Datos del siniestro
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Reporte/Siniestro *</label>
                      <input
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.reporte_siniestro
                            ? "border border-alert-red"
                            : "border border-border-dark"
                        }`}
                        value={form.reporte_siniestro}
                        onChange={handleChange("reporte_siniestro")}
                        placeholder="04251630235"
                      />
                      {fieldErrors.reporte_siniestro ? (
                        <span className="text-[10px] text-alert-red">
                          {fieldErrors.reporte_siniestro}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <SearchableSelect
                        label="Aseguradora"
                        value={form.seguro_comp}
                        onChange={(value) => setForm((prev) => ({ ...prev, seguro_comp: value }))}
                        options={aseguradoras.map((item) => item.nb_aseguradora)}
                        placeholder="Seleccionar"
                        onAdd={handleCreateAseguradora}
                        addLabel="Agregar aseguradora"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha admisión *</label>
                      <input
                        type="date"
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.fecha_adm ? "border border-alert-red" : "border border-border-dark"
                        }`}
                        value={form.fecha_adm}
                        onChange={handleChange("fecha_adm")}
                        placeholder="dd/mm/aaaa"
                      />
                      {fieldErrors.fecha_adm ? (
                        <span className="text-[10px] text-alert-red">{fieldErrors.fecha_adm}</span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Hora admisión *</label>
                      <input
                        type="time"
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.hr_adm ? "border border-alert-red" : "border border-border-dark"
                        }`}
                        value={form.hr_adm}
                        onChange={handleChange("hr_adm")}
                        placeholder="18:40"
                      />
                      {fieldErrors.hr_adm ? (
                        <span className="text-[10px] text-alert-red">{fieldErrors.hr_adm}</span>
                      ) : null}
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest pt-2">
                    Cliente
                  </h4>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre *</label>
                    <input
                      className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                        fieldErrors.nb_cliente ? "border border-alert-red" : "border border-border-dark"
                      }`}
                      value={form.nb_cliente}
                      onChange={handleChange("nb_cliente")}
                      placeholder="Jesús Fernando Lugo"
                    />
                    {fieldErrors.nb_cliente ? (
                      <span className="text-[10px] text-alert-red">{fieldErrors.nb_cliente}</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.tel_cliente}
                        onChange={handleChange("tel_cliente")}
                        placeholder="669-164-5258"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                      <input
                        type="email"
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.email_cliente}
                        onChange={handleChange("email_cliente")}
                        placeholder="cliente@correo.com"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                    Vehículo
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SearchableSelect
                      label="Grupo"
                      value={grupoSeleccionado}
                      onChange={(value) => {
                        setGrupoSeleccionado(value);
                        setForm((prev) => ({ ...prev, marca_vehiculo: "" }));
                      }}
                      options={grupos.map((grupo) => grupo.nb_grupo)}
                      placeholder="Selecciona grupo"
                      onAdd={handleCreateGrupo}
                      addLabel="Agregar grupo"
                    />
                    <SearchableSelect
                      label="Marca"
                      value={form.marca_vehiculo}
                      onChange={(value) => {
                        setMarcaError("");
                        setModeloError("");
                        setForm((prev) => ({ ...prev, marca_vehiculo: value, tipo_vehiculo: "" }));
                        const selected = marcas.find((marca) => marca.nb_marca === value);
                        if (selected?.gpo_marca) {
                          setGrupoSeleccionado(selected.gpo_marca);
                        }
                      }}
                      options={marcas.map((marca) => marca.nb_marca)}
                      placeholder="Selecciona marca"
                      error={fieldErrors.marca || marcaError}
                      onAdd={handleCreateMarca}
                      addLabel="Agregar marca"
                    />
                    <SearchableSelect
                      label="Tipo"
                      value={form.tipo_vehiculo}
                      onChange={(value) => {
                        setModeloError("");
                        setForm((prev) => ({ ...prev, tipo_vehiculo: value }));
                      }}
                      options={modelosFiltrados}
                      placeholder={
                        form.marca_vehiculo ? "Selecciona tipo" : "Selecciona primero una marca"
                      }
                      error={modeloError}
                      onAdd={handleCreateModelo}
                      addLabel={modeloSaving ? "Agregando tipo" : "Agregar tipo"}
                      disabled={!form.marca_vehiculo}
                      emptyLabel={
                        form.marca_vehiculo
                          ? "Sin tipos registrados para esta marca"
                          : "Selecciona una marca para ver tipos"
                      }
                    />
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Año</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.modelo_anio}
                        onChange={handleChange("modelo_anio")}
                        placeholder="2022"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.color_vehiculo}
                        onChange={handleChange("color_vehiculo")}
                        placeholder="Negro"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Serie</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase"
                        value={form.serie_auto}
                        onChange={handleChange("serie_auto")}
                        placeholder="1HGCM82633A004352"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Placas</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase"
                        value={form.placas}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, placas: event.target.value.toUpperCase() }))
                        }
                        onBlur={(event) => lookupPlacas(event.target.value)}
                        placeholder="VLE-911C"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Kilometraje</label>
                      <input
                        type="number"
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.kilometraje}
                        onChange={handleChange("kilometraje")}
                        placeholder="45000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Transmisión</label>
                      <select
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.transmision}
                        onChange={handleChange("transmision")}
                      >
                        <option value="">Seleccionar</option>
                        <option value="Automatica">Automática</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                  Documentos
                </h4>
                <div className="rounded-xl border border-border-dark bg-background-dark/60 p-4">
                  <label
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-dark px-4 py-6 text-center text-sm text-slate-400 hover:border-primary/60 hover:text-slate-200 transition-colors cursor-pointer"
                    htmlFor="orden-admision-adjunto"
                  >
                    <span className="material-symbols-outlined text-3xl">upload_file</span>
                    <span className="text-xs font-bold uppercase tracking-widest">
                      Arrastra el archivo o haz clic para cargar
                    </span>
                    <span className="text-[10px] text-slate-500">
                      PDF, JPG, JPEG o PNG
                    </span>
                    <input
                      id="orden-admision-adjunto"
                      className="hidden"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleAdjuntoChange}
                    />
                  </label>
                  {adjuntoOrden ? (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-border-dark bg-background-dark/70 px-3 py-2">
                      <span className="text-xs text-slate-300">{adjuntoOrden.name}</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-white"
                        onClick={() => setAdjuntoOrden(null)}
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  ) : null}
                  {extractingDoc ? (
                    <p className="mt-2 text-xs text-slate-400">Extrayendo datos del documento...</p>
                  ) : null}
                  {extractInfo ? (
                    <p className="mt-2 text-xs text-slate-400">{extractInfo}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                  Daños
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Daños siniestro</label>
                    <SearchableSelect
                      value={danosSiniestroSelect}
                      onChange={(value) => {
                        setDanosSiniestroSelect("");
                        setDanosSiniestroParts((prev) =>
                          prev.includes(value) ? prev : [...prev, value]
                        );
                      }}
                      options={partesAuto.map((item) => item.nb_parte)}
                      placeholder="Buscar parte..."
                      onAdd={handleCreateParte}
                      addLabel="Agregar parte"
                    />
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border-dark bg-background-dark/40 p-3">
                      {danosSiniestroParts.length ? (
                        danosSiniestroParts.map((part) => (
                          <span
                            key={part}
                            className="inline-flex items-center gap-1 rounded-full border border-alert-red/40 bg-alert-red/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-red"
                          >
                            {part}
                            <button
                              type="button"
                              className="ml-1 text-xs text-current hover:opacity-80"
                              onClick={() =>
                                setDanosSiniestroParts((prev) => prev.filter((item) => item !== part))
                              }
                              aria-label={`Quitar ${part}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Descripción siniestro
                    </label>
                    <textarea
                      className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white h-24"
                      value={form.descripcion_siniestro}
                      onChange={handleChange("descripcion_siniestro")}
                      placeholder="Detalle de las áreas dañadas y observaciones"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Daños preexistentes
                    </label>
                    <SearchableSelect
                      value={danosPreexistSelect}
                      onChange={(value) => {
                        setDanosPreexistSelect("");
                        setDanosPreexistParts((prev) =>
                          prev.includes(value) ? prev : [...prev, value]
                        );
                      }}
                      options={partesAuto.map((item) => item.nb_parte)}
                      placeholder="Buscar parte..."
                      onAdd={handleCreateParte}
                      addLabel="Agregar parte"
                    />
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border-dark bg-background-dark/40 p-3">
                      {danosPreexistParts.length ? (
                        danosPreexistParts.map((part) => (
                          <span
                            key={part}
                            className="inline-flex items-center gap-1 rounded-full border border-alert-amber/40 bg-alert-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-amber"
                          >
                            {part}
                            <button
                              type="button"
                              className="ml-1 text-xs text-current hover:opacity-80"
                              onClick={() =>
                                setDanosPreexistParts((prev) => prev.filter((item) => item !== part))
                              }
                              aria-label={`Quitar ${part}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Descripción daños preexistentes
                    </label>
                    <textarea
                      className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white h-24"
                      value={form.descripcion_danospreex}
                      onChange={handleChange("descripcion_danospreex")}
                      placeholder="Descripción detallada de daños anteriores"
                    />
                  </div>
                </div>
              </div>
            </form>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-dark/60 bg-surface-dark/95">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="orden-admision-form"
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10 disabled:opacity-60"
                disabled={isSaving}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                {isSaving ? "Guardando..." : "Guardar orden"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-alert-red">delete</span>
              <h3 className="text-lg font-bold text-white">Eliminar orden</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Seguro que deseas eliminar la orden "{deleteTarget.reporte_siniestro}"?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-alert-red text-white"
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${deleteTarget.id}`,
                      { method: "DELETE" }
                    );
                    if (!response.ok) {
                      const payload = await response.json().catch(() => null);
                      throw new Error(payload?.detail || "No se pudo eliminar la orden");
                    }
                    setRecords((prev) => prev.filter((item) => item.id !== deleteTarget.id));
                    setDeleteTarget(null);
                  } catch (err) {
                    setError(err.message || "No se pudo eliminar la orden");
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {previewModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-4xl bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Vista previa</h3>
                <p className="text-xs text-slate-400">{previewModal.archivo_nombre}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom((prev) => Math.max(0.5, prev - 0.1))}
                  title="Zoom -"
                >
                  <span className="material-symbols-outlined">zoom_out</span>
                </button>
                <span className="text-xs text-slate-400">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom((prev) => Math.min(2, prev + 0.1))}
                  title="Zoom +"
                >
                  <span className="material-symbols-outlined">zoom_in</span>
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom(1)}
                  title="Reset zoom"
                >
                  <span className="material-symbols-outlined">center_focus_strong</span>
                </button>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white transition-colors"
                onClick={() => setPreviewModal(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-background-dark">
              {previewLoading ? (
                <div className="w-full h-[70vh] flex items-center justify-center text-slate-400 text-sm">
                  Cargando archivo...
                </div>
              ) : previewUrl ? (
                previewType.includes("pdf") ? (
                  <div className="w-full h-[70vh] overflow-auto">
                    <iframe
                      title="Vista previa PDF"
                      className="w-full h-full border-0"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: "top left" }}
                      src={previewUrl}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[70vh] overflow-auto flex items-center justify-center">
                    <img
                      className="object-contain"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: "center" }}
                      src={previewUrl}
                      alt={previewModal.archivo_nombre || "Archivo"}
                    />
                  </div>
                )
              ) : (
                <div className="w-full h-[70vh] flex items-center justify-center text-slate-400 text-sm">
                  No se pudo previsualizar el archivo.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-dark">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setPreviewModal(null)}
              >
                Cerrar
              </button>
              <a
                className="px-4 py-2 rounded-lg bg-primary text-white font-bold"
                href={`${import.meta.env.VITE_API_URL}${previewModal.archivo_path}`}
                download={previewModal.archivo_nombre || "archivo"}
              >
                Descargar
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-alert-amber">warning</span>
              <h3 className="text-lg font-bold text-white">Reestablecer formulario</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Seguro que deseas limpiar todos los campos? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-alert-amber text-black font-bold"
                onClick={() => {
                  resetForm();
                  setGrupoSeleccionado("");
                  setMarcaError("");
                  setFieldErrors({});
                  setShowResetConfirm(false);
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* Modal de Adjudicación Qualitas */}
      {adjudicacionModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-purple-400">robot</span>
              <h3 className="text-lg font-bold text-white">Adjudicar en Qualitas</h3>
            </div>
            
            <div className="space-y-3">
              <div className="bg-background-dark rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Orden</p>
                <p className="text-sm text-white font-medium">{adjudicacionModal.reporte_siniestro}</p>
              </div>
              
              <div className="bg-background-dark rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-sm text-white">{adjudicacionModal.nb_cliente}</p>
              </div>
              
              <div className="bg-background-dark rounded-lg p-3">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Vehículo</p>
                <p className="text-sm text-white">
                  {adjudicacionModal.marca_vehiculo} {adjudicacionModal.tipo_vehiculo} {adjudicacionModal.modelo_anio}
                </p>
                <p className="text-xs text-slate-400">Placas: {adjudicacionModal.placas}</p>
              </div>
              
              {/* Campos adicionales requeridos por Qualitas */}
              {!adjudicando && !adjudicacionResult && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Estatus del Expediente *
                    </label>
                    <select
                      className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                      value={estatusExp}
                      onChange={(e) => setEstatusExp(e.target.value)}
                    >
                      <option value="1">Piso</option>
                      <option value="2">Tránsito</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Ingreso por Grúa *
                    </label>
                    <select
                      className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                      value={ingresoGrua}
                      onChange={(e) => setIngresoGrua(e.target.value)}
                    >
                      <option value="0">No</option>
                      <option value="1">Sí</option>
                    </select>
                  </div>
                </>
              )}
              
              {adjudicando ? (
                <div className="flex items-center gap-3 py-4">
                  <span className="material-symbols-outlined text-2xl text-primary animate-spin">refresh</span>
                  <p className="text-sm text-slate-300">Ejecutando RPA de adjudicación...</p>
                </div>
              ) : adjudicacionResult ? (
                <div className={`rounded-lg p-4 ${adjudicacionResult.exito ? 'bg-green-500/10 border border-green-500/30' : 'bg-alert-red/10 border border-alert-red/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`material-symbols-outlined ${adjudicacionResult.exito ? 'text-green-400' : 'text-alert-red'}`}>
                      {adjudicacionResult.exito ? 'check_circle' : 'error'}
                    </span>
                    <p className={`text-sm font-bold ${adjudicacionResult.exito ? 'text-green-400' : 'text-alert-red'}`}>
                      {adjudicacionResult.exito ? 'Adjudicación iniciada' : 'Error'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-300">
                    {adjudicacionResult.mensaje}
                  </p>
                  {adjudicacionResult.job_id ? (
                    <p className="text-[10px] text-slate-400 mt-2 font-mono">
                      Job ID: {adjudicacionResult.job_id}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                onClick={() => {
                  setAdjudicacionModal(null);
                  setAdjudicacionResult(null);
                  setEstatusExp("1");
                  setIngresoGrua("0");
                }}
                disabled={adjudicando}
              >
                {adjudicacionResult ? "Cerrar" : "Cancelar"}
              </button>
              
              {!adjudicacionResult && (
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-2"
                  onClick={() => ejecutarAdjudicacion(adjudicacionModal)}
                  disabled={adjudicando}
                >
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  {adjudicando ? "Ejecutando..." : "Adjudicar"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
