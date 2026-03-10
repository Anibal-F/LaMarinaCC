import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";

const WORKSHOP_DRAFTS_KEY = "lmcc_taller_gestion_v1";

const WORKSHOP_STAGES = [
  { id: "recepcionado", label: "Recepcionado", icon: "assignment_turned_in" },
  { id: "carroceria", label: "Carroceria", icon: "directions_car" },
  { id: "pintura", label: "Pintura", icon: "format_paint" },
  { id: "armado", label: "Armado", icon: "build" },
  { id: "lavado", label: "Lavado", icon: "local_car_wash" },
  { id: "entrega", label: "Entrega", icon: "key" }
];

const TECHNICIAN_OPTIONS = [
  "Carlos Mendez (Pintura)",
  "Juan Perez (Carroceria)",
  "Roberto Diaz (Mecanica)",
  "Equipo pendiente"
];

const BAY_OPTIONS = [
  "Bahia de Pintura 2",
  "Banco de Enderezado A",
  "Bahia de Armado 1",
  "Patio de Lavado",
  "Sin asignar"
];

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(String(value).replace(" ", "T"));
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function formatAbsoluteDate(value) {
  const date = parseDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function relativeTime(value) {
  const date = parseDate(value);
  if (!date) return "";
  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `Iniciado hace ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `Iniciado hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Iniciado hace ${days} d`;
}

function loadDrafts() {
  try {
    const raw = window.localStorage.getItem(WORKSHOP_DRAFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraft(recordId, draft) {
  const drafts = loadDrafts();
  drafts[recordId] = draft;
  window.localStorage.setItem(WORKSHOP_DRAFTS_KEY, JSON.stringify(drafts));
}

function normalizeChecklist(parts) {
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

function inferStage(record) {
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

function buildDraft(record, existingDraft) {
  const baseChecklist = normalizeChecklist(record?.partes_siniestro);
  const existingChecklist = Array.isArray(existingDraft?.checklist) ? existingDraft.checklist : [];
  const mergedChecklist = baseChecklist.map((item) => {
    const match = existingChecklist.find((entry) => entry.label === item.label || entry.id === item.id);
    return match ? { ...item, done: Boolean(match.done) } : item;
  });

  return {
    currentStage: existingDraft?.currentStage || inferStage(record),
    assignedTech: existingDraft?.assignedTech || TECHNICIAN_OPTIONS[0],
    assignedBay: existingDraft?.assignedBay || BAY_OPTIONS[0],
    checklist: mergedChecklist,
    updatedAt: existingDraft?.updatedAt || null
  };
}

function statusPill(stageId) {
  if (stageId === "entrega") return "bg-alert-green/15 text-alert-green border border-alert-green/30";
  return "bg-alert-amber/15 text-alert-amber border border-alert-amber/30";
}

function isRecepcionCompleted(record) {
  if (record?.recepcionado_completado) return true;
  return Boolean(String(record?.folio_seguro || "").trim() && String(record?.folio_ot || record?.folio_recep || "").trim());
}

function insurerTagClasses(seguro) {
  const normalized = String(seguro || "").toLowerCase();
  if (normalized.includes("qualitas")) return "bg-violet-500/10 text-violet-300 border-violet-500/30";
  if (normalized.includes("axa")) return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  if (normalized.includes("mapfre")) return "bg-red-500/10 text-red-300 border-red-500/30";
  if (normalized.includes("hdi")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  return "bg-primary/10 text-primary border-primary/30";
}

export default function TallerGestion() {
  const navigate = useNavigate();
  const { id } = useParams();
  const uploadInputRef = useRef(null);

  const [record, setRecord] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError("");
      const [recordResponse, mediaResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}`),
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media`)
      ]);

      if (!recordResponse.ok) {
        throw new Error("No se pudo cargar el registro del vehiculo.");
      }

      const recordPayload = await recordResponse.json();
      const mediaPayload = mediaResponse.ok ? await mediaResponse.json() : [];
      const existingDraft = loadDrafts()[id];

      setRecord(recordPayload);
      setDraft(buildDraft(recordPayload, existingDraft));
      setMediaItems(Array.isArray(mediaPayload) ? mediaPayload : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la gestion de taller.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [id]);

  const photoItems = useMemo(
    () =>
      mediaItems.filter((item) => String(item.media_type || "").startsWith("photo")),
    [mediaItems]
  );
  const lastPhotoItem = photoItems.length ? photoItems[photoItems.length - 1] : null;

  const intakePhoto = photoItems[0]?.file_path ? resolveMediaUrl(photoItems[0].file_path) : "";
  const currentPhoto =
    photoItems.length > 1 && lastPhotoItem?.file_path
      ? resolveMediaUrl(lastPhotoItem.file_path)
      : "";

  const currentStageIndex = useMemo(() => {
    const recepcionCompleted = isRecepcionCompleted(record);
    const effectiveStageId =
      recepcionCompleted && draft?.currentStage === "recepcionado" ? "carroceria" : draft?.currentStage;
    const index = WORKSHOP_STAGES.findIndex((stage) => stage.id === effectiveStageId);
    return index >= 0 ? index : 0;
  }, [draft?.currentStage, record]);

  const recepcionCompleted = useMemo(() => isRecepcionCompleted(record), [record]);

  const pendingCount = useMemo(
    () => (draft?.checklist || []).filter((item) => !item.done).length,
    [draft?.checklist]
  );

  const completedCount = useMemo(
    () => (draft?.checklist || []).filter((item) => item.done).length,
    [draft?.checklist]
  );

  const progressValue = useMemo(() => {
    const manualProgress = draft?.checklist?.length
      ? Math.round((completedCount / draft.checklist.length) * 100)
      : 0;
    const stageProgress = Math.round((currentStageIndex / (WORKSHOP_STAGES.length - 1)) * 100);
    return Math.max(manualProgress, stageProgress);
  }, [completedCount, currentStageIndex, draft?.checklist]);

  const vehicleTitle = [
    record?.vehiculo_marca,
    record?.vehiculo_modelo,
    record?.vehiculo_anio
  ]
    .filter(Boolean)
    .join(" ") || record?.vehiculo || "Vehiculo en taller";

  const toggleChecklistItem = (itemId) => {
    setDraft((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item
      )
    }));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setNotice("");
    try {
      const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
      saveDraft(id, nextDraft);
      setDraft(nextDraft);
      setNotice("Cambios de taller guardados localmente.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError("");
      setNotice("");
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media?media_type=photo`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo cargar la foto de avance.");
      }

      setNotice("Foto de avance cargada correctamente.");
      await loadRecord();
    } catch (err) {
      setError(err.message || "No se pudo cargar la foto de avance.");
    } finally {
      event.target.value = "";
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
            <AppHeader title="Gestion de taller" subtitle="Cargando informacion del vehiculo..." showSearch={false} />
            <div className="flex-1 flex items-center justify-center text-slate-400">
              Cargando gestion del vehiculo...
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!record || !draft) {
    return (
      <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
            <AppHeader title="Gestion de taller" subtitle="No se encontro el registro solicitado." showSearch={false} />
            <div className="flex-1 p-6">
              <Link to="/taller/autos-en-sitio" className="text-primary text-sm font-semibold">
                Volver a autos en sitio
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Gestion de taller"
            subtitle="Seguimiento operativo del vehiculo dentro del modulo de taller."
            showSearch={false}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-2 bg-surface-dark hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-border-dark"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  Volver
                </button>
                <a
                  className="flex items-center gap-2 bg-surface-dark hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-border-dark"
                  href={`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Orden
                </a>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="mx-auto max-w-7xl space-y-6">
              <section className="rounded-2xl border border-border-dark bg-gradient-to-r from-background-dark via-background-dark to-primary/10 px-6 py-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-3xl font-black tracking-tight text-white">{vehicleTitle}</h1>
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${statusPill(draft.currentStage)}`}>
                        {draft.currentStage === "entrega" ? "Listo para entrega" : "En proceso"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">badge</span>
                        Placas: <span className="font-semibold text-white">{record.placas || "-"}</span>
                      </span>
                      <span className="h-4 w-px bg-border-dark"></span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        Orden: <span className="font-semibold text-white">#{record.folio_recep || record.id}</span>
                      </span>
                      <span className="h-4 w-px bg-border-dark"></span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">palette</span>
                        Color: <span className="font-semibold text-white">{record.vehiculo_color || "-"}</span>
                      </span>
                      <span className="h-4 w-px bg-border-dark"></span>
                      {record.folio_seguro ? (
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                            Reporte: <span className="font-semibold text-white">{record.folio_seguro}</span>
                          </span>
                          <span className="h-4 w-px bg-border-dark"></span>
                        </>
                      ) : null}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${insurerTagClasses(
                          record.seguro
                        )}`}
                      >
                        {record.seguro || "Sin seguro"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[420px]">
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ingreso</p>
                      <p className="mt-2 text-lg font-bold text-white">{formatAbsoluteDate(record.fecha_recep)}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Etapa actual</p>
                      <p className="mt-2 text-lg font-bold text-white">{WORKSHOP_STAGES[currentStageIndex]?.label}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pendientes</p>
                      <p className="mt-2 text-lg font-bold text-white">{pendingCount}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Avance</p>
                      <p className="mt-2 text-lg font-bold text-white">{progressValue}%</p>
                    </article>
                  </div>
                </div>
                {error ? <p className="mt-4 text-sm text-alert-red">{error}</p> : null}
                {notice ? <p className="mt-4 text-sm text-primary">{notice}</p> : null}
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <section className="xl:col-span-3 space-y-6">
                  <article className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-xl shadow-black/10">
                    <div className="relative aspect-[4/3] overflow-hidden bg-background-dark">
                      {intakePhoto ? (
                        <img src={intakePhoto} alt={vehicleTitle} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-500">
                          <span className="material-symbols-outlined text-5xl">directions_car</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background-dark via-background-dark/70 to-transparent p-4">
                        <div className="rounded-xl border border-alert-red/30 bg-alert-red/15 p-3 backdrop-blur">
                          <p className="text-[11px] font-black uppercase tracking-widest text-alert-red">Alerta critica</p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {record.observaciones_siniestro || "Validar pendientes visuales en la unidad."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-border-dark bg-surface-dark p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-xl font-bold text-white">Piezas requeridas</h3>
                      <span className="text-xs font-semibold text-slate-400">{pendingCount} pendientes</span>
                    </div>
                    <div className="space-y-3">
                      {draft.checklist.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleChecklistItem(item.id)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors ${
                            item.done
                              ? "border-alert-green/30 bg-alert-green/10"
                              : "border-border-dark bg-background-dark hover:border-primary/40"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                item.done
                                  ? "border-alert-green bg-alert-green/20 text-alert-green"
                                  : "border-slate-500 text-transparent"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            </span>
                            <span className={`text-sm font-medium ${item.done ? "text-slate-400 line-through" : "text-white"}`}>
                              {item.label}
                            </span>
                          </span>
                          <span className={`material-symbols-outlined text-[20px] ${item.done ? "text-alert-green" : "text-alert-amber"}`}>
                            {item.done ? "check_circle" : "pending"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </article>
                </section>

                <section className="xl:col-span-6">
                  <article className="rounded-2xl border border-border-dark bg-surface-dark p-5 sm:p-6">
                    <div className="mb-6 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-bold text-white">Linea de tiempo</h3>
                        <p className="mt-1 text-sm text-slate-400">Selecciona la etapa activa para reflejar el avance operativo.</p>
                      </div>
                      <span className="rounded-full border border-border-dark bg-background-dark px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {completedCount} completadas
                      </span>
                    </div>

                    <div className="relative">
                      {WORKSHOP_STAGES.map((stage, index) => {
                        const isRecepcionStep = stage.id === "recepcionado";
                        const isCompleted = index < currentStageIndex || (isRecepcionStep && recepcionCompleted);
                        const isActive = index === currentStageIndex;
                        const isFuture = index > currentStageIndex;

                        return (
                          <div key={stage.id} className="relative flex gap-4 pb-7 last:pb-0">
                            {index < WORKSHOP_STAGES.length - 1 ? (
                              <div
                              className={`absolute left-5 top-10 h-[calc(100%-4px)] w-px ${
                                  isCompleted ? "bg-alert-green/60" : "border-l border-dashed border-border-dark"
                                }`}
                              ></div>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setDraft((prev) => ({ ...prev, currentStage: stage.id }))}
                              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all ${
                                isActive
                                  ? "border-alert-amber bg-alert-amber text-background-dark shadow-[0_0_20px_rgba(242,163,0,0.28)]"
                                  : isCompleted
                                    ? "border-alert-green bg-alert-green/20 text-alert-green"
                                    : "border-border-dark bg-background-dark text-slate-500"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[20px]">{stage.icon}</span>
                            </button>

                            <div
                              className={`flex-1 rounded-2xl border p-4 transition-all ${
                                isActive
                                  ? "border-alert-amber/30 bg-alert-amber/10"
                                  : isCompleted
                                    ? "border-alert-green/30 bg-alert-green/10"
                                    : "border-transparent bg-transparent opacity-70 hover:opacity-100"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className={`text-lg font-bold ${isFuture ? "text-slate-300" : "text-white"}`}>{stage.label}</h4>
                                    {!isActive && isCompleted ? (
                                      <span className="rounded-md bg-alert-green px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-background-dark">
                                        Completado
                                      </span>
                                    ) : null}
                                    {isActive ? (
                                      <span className="rounded-md bg-alert-amber px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-background-dark">
                                        En progreso
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-1 text-sm text-slate-400">
                                    {isCompleted
                                      ? index === 0
                                        ? record.folio_seguro
                                          ? `Completado: ${record.folio_seguro} asignado a OT #${record.folio_ot || record.folio_recep}`
                                          : `Completado ${formatDateTime(record.fecha_recep)}`
                                        : `Etapa completada antes de ${WORKSHOP_STAGES[currentStageIndex]?.label.toLowerCase()}`
                                      : isActive
                                        ? draft.updatedAt
                                          ? relativeTime(draft.updatedAt)
                                          : "Listo para registrar avances"
                                        : "Pendiente por iniciar"}
                                  </p>
                                  {index === 0 ? (
                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                                        <span className="material-symbols-outlined text-[16px]">person</span>
                                      </span>
                                      {record.nb_cliente || "Cliente registrado"}
                                    </div>
                                  ) : null}
                                  {isActive ? (
                                    <div className="mt-4 max-w-xs">
                                      <div className="h-2 overflow-hidden rounded-full bg-background-dark">
                                        <div className="h-full rounded-full bg-alert-amber" style={{ width: `${progressValue}%` }}></div>
                                      </div>
                                      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                                        Progreso estimado
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="text-slate-500 transition-colors hover:text-primary"
                                  title="Notificar progreso"
                                >
                                  <span className="material-symbols-outlined">chat</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                </section>

                <section className="xl:col-span-3 space-y-6">
                  <article className="rounded-2xl border border-border-dark bg-surface-dark p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
                      <span className="material-symbols-outlined text-primary">manage_accounts</span>
                      Asignacion
                    </h3>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Tecnico responsable
                        </span>
                        <select
                          value={draft.assignedTech}
                          onChange={(event) => setDraft((prev) => ({ ...prev, assignedTech: event.target.value }))}
                          className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-primary"
                        >
                          {TECHNICIAN_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Bahia / puesto
                        </span>
                        <select
                          value={draft.assignedBay}
                          onChange={(event) => setDraft((prev) => ({ ...prev, assignedBay: event.target.value }))}
                          className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-primary"
                        >
                          {BAY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={handleSave}
                        className="w-full rounded-xl border border-primary/30 bg-primary/15 px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
                      >
                        Actualizar asignacion
                      </button>
                    </div>
                  </article>

                  <article className="flex min-h-[360px] flex-col rounded-2xl border border-border-dark bg-surface-dark p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                        <span className="material-symbols-outlined text-primary">photo_camera</span>
                        Evidencia
                      </h3>
                      <span className="text-xs text-slate-500">{photoItems.length} fotos</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-2 text-center text-xs font-semibold text-slate-500">Ingreso</p>
                        <div className="aspect-square overflow-hidden rounded-xl border border-border-dark bg-background-dark">
                          {intakePhoto ? (
                            <img src={intakePhoto} alt="Ingreso" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-slate-500">
                              <span className="material-symbols-outlined text-3xl">image</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-center text-xs font-semibold text-slate-500">Actual</p>
                        <div className="aspect-square overflow-hidden rounded-xl border border-dashed border-border-dark bg-background-dark">
                          {currentPhoto ? (
                            <img src={currentPhoto} alt="Avance actual" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-slate-500">
                              <span className="material-symbols-outlined text-3xl">add_a_photo</span>
                              <p className="mt-2 text-[11px] font-semibold">Sin foto actual</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={uploading}
                      className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined text-[18px]">upload</span>
                      {uploading ? "Cargando..." : "Cargar foto de avance"}
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadPhoto}
                    />
                  </article>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
