export const WORKSHOP_DRAFTS_KEY = "lmcc_taller_gestion_v1";

export const WORKSHOP_STAGES = [
  { id: "recepcionado", label: "Recepcionado", icon: "assignment_turned_in", targetTime: "00:30:00" },
  { id: "carroceria", label: "Carroceria", icon: "directions_car", targetTime: "04:00:00" },
  { id: "pintura", label: "Pintura", icon: "format_paint", targetTime: "05:00:00" },
  { id: "pulido", label: "Pulido", icon: "auto_fix_high", targetTime: "02:00:00" },
  { id: "armado", label: "Armado", icon: "build", targetTime: "03:00:00" },
  { id: "lavado", label: "Lavado", icon: "local_car_wash", targetTime: "01:00:00" },
  { id: "entrega", label: "Entrega", icon: "key", targetTime: "00:30:00" }
];

export const TECHNICIAN_OPTIONS = [
  "Carlos Mendez (Pintura)",
  "Juan Perez (Carroceria)",
  "Roberto Diaz (Mecanica)",
  "Equipo pendiente"
];

export const BAY_OPTIONS = [
  "Bahia de Pintura 2",
  "Banco de Enderezado A",
  "Bahia de Armado 1",
  "Patio de Lavado",
  "Sin asignar"
];

const STAGE_TASK_LIBRARY = {
  recepcionado: [
    { label: "Validar expediente digital", detail: "Confirmar que reporte y OT quedaron ligados." },
    { label: "Confirmar evidencia inicial", detail: "Revisar fotos de ingreso y danos visibles." },
    { label: "Liberar unidad a taller", detail: "Asignar tecnico y bahia inicial." }
  ],
  carroceria: [
    { label: "Inspeccion de chasis", detail: "Verificacion de alineacion estructural." },
    { label: "Desmontaje de paneles", detail: "Remocion de puertas, fascia o capot." },
    { label: "Preparacion de superficie", detail: "Lijado y nivelacion previa al proceso." }
  ],
  pintura: [
    { label: "Empapelado y proteccion", detail: "Cubrir areas sensibles antes de pintar." },
    { label: "Aplicacion de base", detail: "Validar tono y distribucion uniforme." },
    { label: "Secado y pulido", detail: "Revisar acabado final y brillo." }
  ],
  armado: [
    { label: "Montaje de piezas", detail: "Instalar componentes y herrajes." },
    { label: "Ajustes de claros", detail: "Verificar separaciones y alineacion." },
    { label: "Revision electrica", detail: "Probar faros, sensores y conexiones." }
  ],
  lavado: [
    { label: "Lavado exterior", detail: "Retirar polvo de proceso y residuos." },
    { label: "Detalle interior", detail: "Aspirado y limpieza fina." },
    { label: "Inspeccion final", detail: "Confirmar presentacion para entrega." }
  ],
  entrega: [
    { label: "Confirmar documentos", detail: "Orden, valuacion y conformidad del cliente." },
    { label: "Explicar reparacion", detail: "Compartir trabajos realizados y garantias." },
    { label: "Cerrar orden", detail: "Marcar OT como entregada." }
  ]
};

function buildStageTaskEntries(stageId, existingEntries = []) {
  const baseEntries = STAGE_TASK_LIBRARY[stageId] || [];
  return baseEntries.map((item, index) => {
    const match = existingEntries.find((entry) => entry.label === item.label || entry.id === `${stageId}-${index}`);
    return {
      id: match?.id || `${stageId}-${index}`,
      label: item.label,
      detail: item.detail,
      done: Boolean(match?.done)
    };
  });
}

export function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(String(value).replace(" ", "T"));
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

export function formatAbsoluteDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function relativeTime(value) {
  const date = parseDate(value);
  if (!date) return "";
  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `Iniciado hace ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `Iniciado hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Iniciado hace ${days} d`;
}

export function loadDrafts() {
  try {
    const raw = window.localStorage.getItem(WORKSHOP_DRAFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDraft(recordId, draft) {
  const drafts = loadDrafts();
  drafts[recordId] = draft;
  window.localStorage.setItem(WORKSHOP_DRAFTS_KEY, JSON.stringify(drafts));
}

export function normalizeChecklist(parts) {
  if (Array.isArray(parts)) {
    return parts
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((label, index) => ({ id: `part-${index}-${label}`, label, done: false }));
  }

  if (typeof parts === "string" && parts.trim()) {
    return parts
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label, index) => ({ id: `part-${index}-${label}`, label, done: false }));
  }

  return [
    { id: "check-1", label: "Validar refacciones pendientes", done: false },
    { id: "check-2", label: "Inspeccion de pintura", done: false },
    { id: "check-3", label: "Revision de armado final", done: false }
  ];
}

export function inferStage(record) {
  const status = String(record?.estatus || "").toLowerCase();
  if (status.includes("entrega")) return "entrega";
  if (status.includes("lavado")) return "lavado";
  if (status.includes("armado")) return "armado";
  if (status.includes("pintura") || status.includes("taller")) return "pintura";
  if (status.includes("valuacion") || status.includes("autorizacion") || status.includes("carroceria")) {
    return "carroceria";
  }
  return "recepcionado";
}

export function buildDraft(record, existingDraft) {
  const baseChecklist = normalizeChecklist(record?.partes_siniestro);
  const existingChecklist = Array.isArray(existingDraft?.checklist) ? existingDraft.checklist : [];
  const mergedChecklist = baseChecklist.map((item) => {
    const match = existingChecklist.find((entry) => entry.label === item.label || entry.id === item.id);
    return match ? { ...item, done: Boolean(match.done) } : item;
  });

  const stageTasks = Object.fromEntries(
    WORKSHOP_STAGES.map((stage) => [
      stage.id,
      buildStageTaskEntries(stage.id, Array.isArray(existingDraft?.stageTasks?.[stage.id]) ? existingDraft.stageTasks[stage.id] : [])
    ])
  );

  return {
    currentStage: existingDraft?.currentStage || inferStage(record),
    assignedTech: existingDraft?.assignedTech || TECHNICIAN_OPTIONS[0],
    assignedBay: existingDraft?.assignedBay || BAY_OPTIONS[0],
    checklist: mergedChecklist,
    stageTasks,
    stageNotes: existingDraft?.stageNotes && typeof existingDraft.stageNotes === "object" ? existingDraft.stageNotes : {},
    updatedAt: existingDraft?.updatedAt || null
  };
}

export function statusPill(stageId) {
  if (stageId === "entrega") return "bg-alert-green/15 text-alert-green border border-alert-green/30";
  return "bg-alert-amber/15 text-alert-amber border border-alert-amber/30";
}

export function isRecepcionCompleted(record) {
  if (record?.recepcionado_completado) return true;
  return Boolean(String(record?.folio_seguro || "").trim() && String(record?.folio_ot || record?.folio_recep || "").trim());
}

export function insurerTagClasses(seguro) {
  const normalized = String(seguro || "").toLowerCase();
  if (normalized.includes("qualitas")) return "bg-violet-500/10 text-violet-300 border-violet-500/30";
  if (normalized.includes("axa")) return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  if (normalized.includes("mapfre")) return "bg-red-500/10 text-red-300 border-red-500/30";
  if (normalized.includes("hdi")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  return "bg-primary/10 text-primary border-primary/30";
}

export function getStageMeta(stageId) {
  return WORKSHOP_STAGES.find((stage) => stage.id === stageId) || WORKSHOP_STAGES[0];
}

export function getVehicleTitle(record) {
  return (
    [record?.vehiculo_marca, record?.vehiculo_modelo, record?.vehiculo_anio].filter(Boolean).join(" ") ||
    record?.vehiculo ||
    "Vehiculo en taller"
  );
}

