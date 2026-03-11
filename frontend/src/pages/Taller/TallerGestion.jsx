import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";
import {
  WORKSHOP_STAGES,
  buildDraft,
  formatAbsoluteDate,
  formatDateTime,
  getVehicleTitle,
  insurerTagClasses,
  isRecepcionCompleted,
  loadDrafts,
  relativeTime,
  saveDraft,
  statusPill
} from "./tallerShared.js";

function StageActionIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M459.94 53.25a16.06 16.06 0 0 0-23.22-.56L424.35 65a8 8 0 0 0 0 11.31l11.34 11.32a8 8 0 0 0 11.34 0l12.06-12c6.1-6.09 6.67-16.01.85-22.38" />
      <path d="M399.34 90L218.82 270.2a9 9 0 0 0-2.31 3.93L208.16 299a3.91 3.91 0 0 0 4.86 4.86l24.85-8.35a9 9 0 0 0 3.93-2.31L422 112.66a9 9 0 0 0 0-12.66l-9.95-10a9 9 0 0 0-12.71 0" />
      <path d="M386.34 193.66L264.45 315.79A41.1 41.1 0 0 1 247.58 326l-25.9 8.67a35.92 35.92 0 0 1-44.33-44.33l8.67-25.9a41.1 41.1 0 0 1 10.19-16.87l122.13-121.91a8 8 0 0 0-5.65-13.66H104a56 56 0 0 0-56 56v240a56 56 0 0 0 56 56h240a56 56 0 0 0 56-56V199.31a8 8 0 0 0-13.66-5.65" />
    </svg>
  );
}

export default function TallerGestion() {
  const navigate = useNavigate();
  const { id } = useParams();
  const uploadInputRef = useRef(null);

  const [record, setRecord] = useState(null);
  const [draft, setDraft] = useState(null);
  const [catalogs, setCatalogs] = useState(null);
  const [otStages, setOtStages] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError("");
      const [recordResponse, mediaResponse, bootstrapResponse, stagesResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}`),
        fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${id}/media`),
        fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/bootstrap`),
        fetch(`${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas`)
      ]);

      if (!recordResponse.ok) {
        throw new Error("No se pudo cargar el registro del vehiculo.");
      }
      if (!bootstrapResponse.ok) {
        throw new Error("No se pudieron cargar los catalogos de taller.");
      }
      if (!stagesResponse.ok) {
        throw new Error("No se pudieron cargar las etapas operativas.");
      }

      const recordPayload = await recordResponse.json();
      const mediaPayload = mediaResponse.ok ? await mediaResponse.json() : [];
      const bootstrapPayload = await bootstrapResponse.json();
      const stagePayload = await stagesResponse.json();
      let expedientePayload = [];
      if (recordPayload?.folio_seguro) {
        const expedienteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(recordPayload.folio_seguro)}`
        );
        if (expedienteResponse.ok) {
          const expedienteData = await expedienteResponse.json();
          expedientePayload = Array.isArray(expedienteData?.archivos) ? expedienteData.archivos : [];
        }
      }
      const existingDraft = loadDrafts()[id];
      const localDraft = buildDraft(recordPayload, existingDraft);
      const stageItems = Array.isArray(stagePayload) ? stagePayload : [];
      const recepcionCompleted = isRecepcionCompleted(recordPayload);
      const activeStage =
        stageItems.find((item) => String(item.estatus || "").toUpperCase() === "EN_PROCESO") ||
        stageItems.find((item) => String(item.estatus || "").toUpperCase() === "COMPLETADO") ||
        stageItems[0] ||
        null;
      const derivedStageId =
        recepcionCompleted && activeStage?.clave === "recepcionado"
          ? "carroceria"
          : activeStage?.clave || localDraft.currentStage;
      const selectedStage =
        stageItems.find((item) => item.clave === derivedStageId) ||
        stageItems.find((item) => item.clave === activeStage?.clave) ||
        null;

      setRecord(recordPayload);
      setDraft({
        currentStage: derivedStageId,
        checklist: localDraft.checklist,
        assignedTechId: selectedStage?.personal_id_responsable ? String(selectedStage.personal_id_responsable) : "",
        assignedBayId: selectedStage?.estacion_id ? String(selectedStage.estacion_id) : "",
        updatedAt: selectedStage?.updated_at || localDraft.updatedAt || null
      });
      setCatalogs(bootstrapPayload);
      setOtStages(stageItems);
      setMediaItems(Array.isArray(mediaPayload) ? mediaPayload : []);
      setExpedienteFiles(expedientePayload);
    } catch (err) {
      setError(err.message || "No se pudo cargar la gestion de taller.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [id]);

  const stageMap = useMemo(() => {
    return new Map(otStages.map((stage) => [stage.clave, stage]));
  }, [otStages]);

  const photoItems = useMemo(
    () =>
      mediaItems.filter((item) => String(item.media_type || "").startsWith("photo")),
    [mediaItems]
  );
  const expedientePhotoItems = useMemo(
    () =>
      expedienteFiles.filter((item) => {
        const tipo = String(item.tipo || "").toLowerCase();
        const mime = String(item.mime_type || "").toLowerCase();
        const path = String(item.archivo_path || "").toLowerCase();
        return (
          (tipo === "recepcion_foto" || tipo === "valuacion_foto" || tipo === "archivorecepcion_vehiculo") &&
          (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => path.endsWith(ext)))
        );
      }),
    [expedienteFiles]
  );
  const lastPhotoItem = photoItems.length ? photoItems[photoItems.length - 1] : null;
  const expedienteFirstPhoto = expedientePhotoItems.length ? expedientePhotoItems[0] : null;
  const expedienteLastPhoto = expedientePhotoItems.length ? expedientePhotoItems[expedientePhotoItems.length - 1] : null;

  const intakePhoto = photoItems[0]?.file_path
    ? resolveMediaUrl(photoItems[0].file_path)
    : expedienteFirstPhoto?.archivo_path
      ? resolveMediaUrl(expedienteFirstPhoto.archivo_path)
      : "";
  const currentPhoto =
    photoItems.length > 1 && lastPhotoItem?.file_path
      ? resolveMediaUrl(lastPhotoItem.file_path)
      : expedienteLastPhoto?.archivo_path
        ? resolveMediaUrl(expedienteLastPhoto.archivo_path)
      : "";
  const evidenceCount = photoItems.length || expedientePhotoItems.length;

  const currentStageIndex = useMemo(() => {
    const recepcionCompleted = isRecepcionCompleted(record);
    const effectiveStageId =
      recepcionCompleted && draft?.currentStage === "recepcionado" ? "carroceria" : draft?.currentStage;
    const index = WORKSHOP_STAGES.findIndex((stage) => stage.id === effectiveStageId);
    return index >= 0 ? index : 0;
  }, [draft?.currentStage, record]);

  const currentOtStage = useMemo(() => {
    return stageMap.get(draft?.currentStage) || otStages.find((item) => item.clave === draft?.currentStage) || null;
  }, [draft?.currentStage, otStages, stageMap]);

  const areasById = useMemo(() => {
    const rows = Array.isArray(catalogs?.areas) ? catalogs.areas : [];
    return new Map(rows.map((item) => [item.id, item]));
  }, [catalogs?.areas]);

  const availableTechnicians = useMemo(() => {
    const rows = Array.isArray(catalogs?.personal) ? catalogs.personal : [];
    const filtered = rows.filter((item) => item.clave === draft?.currentStage);
    return filtered.length ? filtered : rows;
  }, [catalogs?.personal, draft?.currentStage]);

  const availableStations = useMemo(() => {
    const rows = Array.isArray(catalogs?.estaciones) ? catalogs.estaciones : [];
    const filtered = rows.filter((item) => areasById.get(item.area_id)?.clave === draft?.currentStage);
    return filtered.length ? filtered : rows;
  }, [catalogs?.estaciones, areasById, draft?.currentStage]);

  const selectedStation = useMemo(() => {
    if (!draft?.assignedBayId) return null;
    return availableStations.find((item) => String(item.id) === String(draft.assignedBayId)) || null;
  }, [availableStations, draft?.assignedBayId]);

  const recepcionCompleted = useMemo(() => isRecepcionCompleted(record), [record]);

  const pendingCount = useMemo(
    () => (draft?.checklist || []).filter((item) => !item.done).length,
    [draft?.checklist]
  );

  const completedCount = useMemo(() => {
    return otStages.filter((item) => String(item.estatus || "").toUpperCase() === "COMPLETADO").length;
  }, [otStages]);

  const progressValue = useMemo(() => {
    const manualProgress = Number(currentOtStage?.progreso || 0);
    const stageProgress = Math.round((currentStageIndex / (WORKSHOP_STAGES.length - 1)) * 100);
    return Math.max(manualProgress, stageProgress);
  }, [currentOtStage?.progreso, currentStageIndex]);

  const vehicleTitle = getVehicleTitle(record);

  const toggleChecklistItem = (itemId) => {
    setDraft((prev) => {
      const nextDraft = {
        ...prev,
        checklist: prev.checklist.map((item) =>
          item.id === itemId ? { ...item, done: !item.done } : item
        )
      };
      const existingDraft = loadDrafts()[id] || {};
      saveDraft(id, { ...existingDraft, checklist: nextDraft.checklist, updatedAt: new Date().toISOString() });
      return nextDraft;
    });
  };

  const selectStage = (stageId) => {
    const targetStage = stageMap.get(stageId);
    setDraft((prev) => ({
      ...prev,
      currentStage: stageId,
      assignedTechId: targetStage?.personal_id_responsable ? String(targetStage.personal_id_responsable) : "",
      assignedBayId: targetStage?.estacion_id ? String(targetStage.estacion_id) : "",
      updatedAt: targetStage?.updated_at || prev.updatedAt
    }));
    setNotice("");
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const selectedStageIndex = WORKSHOP_STAGES.findIndex((stage) => stage.id === draft.currentStage);
      const updates = otStages.map((stage) => {
        const stageIndex = WORKSHOP_STAGES.findIndex((item) => item.id === stage.clave);
        let nextStatus = stage.estatus;
        let nextProgress = Number(stage.progreso || 0);

        if (stage.clave === "recepcionado" && recepcionCompleted) {
          nextStatus = "COMPLETADO";
          nextProgress = 100;
        } else if (stageIndex < selectedStageIndex) {
          nextStatus = "COMPLETADO";
          nextProgress = 100;
        } else if (stageIndex === selectedStageIndex) {
          nextStatus = "EN_PROCESO";
          nextProgress = Math.max(nextProgress, 10);
        } else if (String(stage.estatus || "").toUpperCase() !== "COMPLETADO") {
          nextStatus = "PENDIENTE";
          nextProgress = 0;
        }

        const payload = {
          estatus: nextStatus,
          progreso: nextProgress
        };

        if (stage.clave === draft.currentStage) {
          payload.personal_id_responsable = draft.assignedTechId ? Number(draft.assignedTechId) : null;
          payload.estacion_id = draft.assignedBayId ? Number(draft.assignedBayId) : null;
          payload.area_id = selectedStation?.area_id || null;
          payload.fecha_inicio = stage.fecha_inicio || new Date().toISOString();
        }

        return fetch(`${import.meta.env.VITE_API_URL}/taller/ordenes/${id}/etapas/${stage.etapa_id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(async (response) => {
          if (!response.ok) {
            const payloadError = await response.json().catch(() => null);
            throw new Error(payloadError?.detail || "No se pudo guardar la etapa operativa.");
          }
          return response.json();
        });
      });

      await Promise.all(updates);
      const existingDraft = loadDrafts()[id] || {};
      saveDraft(id, { ...existingDraft, checklist: draft.checklist, updatedAt: new Date().toISOString() });
      setNotice("Cambios de taller guardados en backend.");
      await loadRecord();
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
              <section className="rounded-2xl border border-border-dark bg-gradient-to-r from-background-dark via-background-dark to-primary/10 px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div className="space-y-3 2xl:flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{vehicleTitle}</h1>
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${statusPill(draft.currentStage)}`}>
                        {draft.currentStage === "entrega" ? "Listo para entrega" : "En proceso"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">badge</span>
                        Placas: <span className="font-semibold text-white">{record.placas || "-"}</span>
                      </span>
                      <span className="hidden h-4 w-px bg-border-dark sm:block"></span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        Orden: <span className="font-semibold text-white">#{record.folio_recep || record.id}</span>
                      </span>
                      <span className="hidden h-4 w-px bg-border-dark sm:block"></span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">palette</span>
                        Color: <span className="font-semibold text-white">{record.vehiculo_color || "-"}</span>
                      </span>
                      <span className="hidden h-4 w-px bg-border-dark sm:block"></span>
                      {record.folio_seguro ? (
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                            Reporte: <span className="font-semibold text-white">{record.folio_seguro}</span>
                          </span>
                          <span className="hidden h-4 w-px bg-border-dark sm:block"></span>
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
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:min-w-[520px] 2xl:max-w-[560px]">
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4 lg:min-h-[112px]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ingreso</p>
                      <p className="mt-2 text-lg font-bold text-white">{formatAbsoluteDate(record.fecha_recep)}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4 lg:min-h-[112px]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Etapa actual</p>
                      <p className="mt-2 text-lg font-bold text-white">{WORKSHOP_STAGES[currentStageIndex]?.label}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4 lg:min-h-[112px]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pendientes</p>
                      <p className="mt-2 text-lg font-bold text-white">{pendingCount}</p>
                    </article>
                    <article className="rounded-xl border border-border-dark bg-surface-dark/70 p-4 lg:min-h-[112px]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Avance</p>
                      <p className="mt-2 text-lg font-bold text-white">{progressValue}%</p>
                    </article>
                  </div>
                </div>
                {error ? <p className="mt-4 text-sm text-alert-red">{error}</p> : null}
                {notice ? <p className="mt-4 text-sm text-primary">{notice}</p> : null}
              </section>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <section className="space-y-6 lg:col-span-4 xl:col-span-3 lg:space-y-0">
                  <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 lg:grid-cols-1">
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
                  </div>
                  <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 lg:grid-cols-1 lg:pt-6">
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
                          value={draft.assignedTechId || ""}
                          onChange={(event) => setDraft((prev) => ({ ...prev, assignedTechId: event.target.value }))}
                          className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-primary"
                        >
                          <option value="">Sin asignar</option>
                          {availableTechnicians.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.nb_personal}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Bahia / puesto
                        </span>
                        <select
                          value={draft.assignedBayId || ""}
                          onChange={(event) => setDraft((prev) => ({ ...prev, assignedBayId: event.target.value }))}
                          className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-primary"
                        >
                          <option value="">Sin asignar</option>
                          {availableStations.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.nb_estacion}
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
                      <span className="text-xs text-slate-500">{evidenceCount} fotos</span>
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
                  </div>
                </section>

                <section className="lg:col-span-8 xl:col-span-9">
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
                        const stageData = stageMap.get(stage.id);
                        const isRecepcionStep = stage.id === "recepcionado";
                        const isCompleted =
                          String(stageData?.estatus || "").toUpperCase() === "COMPLETADO" ||
                          (isRecepcionStep && recepcionCompleted);
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
                              onClick={() => selectStage(stage.id)}
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
                                        : stageData?.updated_at
                                          ? `Etapa completada ${formatDateTime(stageData.updated_at)}`
                                          : `Etapa completada antes de ${WORKSHOP_STAGES[currentStageIndex]?.label.toLowerCase()}`
                                      : isActive
                                        ? stageData?.updated_at
                                          ? relativeTime(stageData.updated_at)
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
                                        <div
                                          className="h-full rounded-full bg-alert-amber"
                                          style={{ width: `${Number(stageData?.progreso ?? progressValue)}%` }}
                                        ></div>
                                      </div>
                                      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                                        Progreso estimado
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/taller/autos-en-sitio/${id}/etapas/${stage.id}`)}
                                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-background-dark hover:text-primary"
                                  title={`Abrir etapa ${stage.label}`}
                                  aria-label={`Abrir etapa ${stage.label}`}
                                >
                                  <StageActionIcon className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
