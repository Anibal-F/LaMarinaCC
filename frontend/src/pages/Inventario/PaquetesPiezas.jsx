import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";

const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    return envUrl.replace(/\/$/, "");
  }
  return "";
};

const API_BASE = getApiUrl();

const EMPTY_FORM = {
  proveedor: "",
  reporte: "",
  piezasText: "",
  comentarios: "",
  estado: "Generado",
};

const STATUS_STYLES = {
  Generado: "bg-alert-amber/15 text-alert-amber border-alert-amber/30",
  Completado: "bg-alert-green/15 text-alert-green border-alert-green/30",
};

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "completado" || normalized === "recibido") return "Completado";
  return "Generado";
}

function formatArribo(dateTime) {
  if (!dateTime) return "-";
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return String(dateTime);
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatHour(dateTime) {
  if (!dateTime) return "-";
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function splitPieces(piezasText) {
  return String(piezasText || "")
    .split(/\n|,/)
    .map((pieza) => pieza.trim())
    .filter(Boolean);
}

function buildMediaUrl(filePath) {
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${API_BASE}${filePath}`;
}

function mapPackageSummary(item) {
  return {
    id: item.id,
    folio: item.folio,
    proveedor: item.proveedor_nombre || "",
    ot: item.folio_ot || "",
    reporte: item.numero_reporte_siniestro || "",
    estado: normalizeStatus(item.estatus),
    arribo: item.fecha_arribo,
    piezasCount: item.piezas_count || 0,
    mediaCount: item.media_count || 0,
    portadaPath: item.portada_path || "",
    comentarios: item.comentarios || "",
  };
}

function mapMediaItem(item) {
  return {
    id: item.id,
    name: item.original_name || `archivo-${item.id}`,
    url: buildMediaUrl(item.file_path),
    mediaType: item.media_type || "photo",
    mimeType: item.mime_type || "",
    persisted: true,
  };
}

function buildPayload(form) {
  const piezas = splitPieces(form.piezasText);
  return {
    numero_reporte_siniestro: form.reporte.trim(),
    proveedor_nombre: form.proveedor.trim(),
    estatus: form.estado,
    comentarios: form.comentarios.trim() || null,
    relaciones: piezas.map((pieza) => ({
      nombre_pieza: pieza,
      cantidad: 1,
      estatus: form.estado,
    })),
  };
}

function PackageModal({
  isOpen,
  mode,
  form,
  providerOptions,
  onChange,
  onClose,
  onSave,
  photos,
  onCameraClick,
  onUploadClick,
  onRemovePhoto,
  isSaving,
  isLoading,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border-dark px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
              Inventario
            </p>
            <h2 className="text-2xl font-bold text-white">
              {mode === "create" ? "Nuevo Paquete de Piezas" : "Editar Paquete de Piezas"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Vincula el paquete con la orden de admisión por reporte/siniestro y registra contenido, evidencia y observaciones.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-background-dark hover:text-white transition-colors"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex min-h-[460px] items-center justify-center px-6 py-16">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-slate-500">progress_activity</span>
              <p className="mt-3 text-sm text-slate-400">Cargando detalle del paquete...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr_0.9fr]">
              <section className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <SearchableSelect
                    label="Proveedor"
                    value={form.proveedor}
                    onChange={(value) => onChange("proveedor", value)}
                    options={providerOptions}
                    placeholder="Selecciona un proveedor"
                    emptyLabel="Sin proveedores disponibles"
                  />
                  <label className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Reporte / Siniestro
                    </span>
                    <input
                      type="text"
                      value={form.reporte}
                      onChange={(event) => onChange("reporte", event.target.value)}
                      className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="04251889452"
                    />
                    <p className="text-xs text-slate-500">
                      Este dato vincula automáticamente el paquete con la orden de admisión.
                    </p>
                  </label>
                  <label className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Estado
                    </span>
                    <select
                      value={form.estado}
                      onChange={(event) => onChange("estado", event.target.value)}
                      className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="Generado">Generado</option>
                      <option value="Completado">Completado</option>
                    </select>
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Piezas incluidas
                  </span>
                  <textarea
                    value={form.piezasText}
                    onChange={(event) => onChange("piezasText", event.target.value)}
                    className="min-h-[140px] w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Captura una pieza por línea o separa por comas."
                  />
                  <div className="flex flex-wrap gap-2">
                    {splitPieces(form.piezasText)
                      .slice(0, 12)
                      .map((pieza) => (
                        <span
                          key={pieza}
                          className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                        >
                          {pieza}
                        </span>
                      ))}
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Comentarios
                  </span>
                  <textarea
                    value={form.comentarios}
                    onChange={(event) => onChange("comentarios", event.target.value)}
                    className="min-h-[160px] w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Observaciones del arribo, daños al empaque, discrepancias o notas de almacén."
                  />
                </label>
              </section>

              <aside className="space-y-5">
                <div className="rounded-2xl border border-border-dark bg-background-dark/70 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Evidencia
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-white">
                        {photos.length} archivo{photos.length === 1 ? "" : "s"}
                      </h3>
                    </div>
                    <div className="rounded-xl bg-primary/15 p-3 text-primary">
                      <span className="material-symbols-outlined text-[28px]">photo_library</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <button
                      type="button"
                      onClick={onCameraClick}
                      className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/15 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                      Tomar foto
                    </button>
                    <button
                      type="button"
                      onClick={onUploadClick}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border-dark bg-surface-dark px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700/70 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">upload_file</span>
                      Subir archivo
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {photos.length ? (
                      photos.map((photo) => {
                        const isImage =
                          photo.mediaType === "photo" ||
                          String(photo.mimeType || "").startsWith("image/");

                        return (
                          <div
                            key={photo.id}
                            className="group relative overflow-hidden rounded-xl border border-border-dark bg-surface-dark"
                          >
                            {isImage ? (
                              <img src={photo.url} alt={photo.name} className="h-28 w-full object-cover" />
                            ) : (
                              <div className="flex h-28 w-full items-center justify-center bg-background-dark text-slate-500">
                                <span className="material-symbols-outlined text-4xl">description</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => onRemovePhoto(photo.id)}
                              className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                              title="Eliminar evidencia"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                            <div className="border-t border-border-dark px-3 py-2 text-[11px] text-slate-400 truncate">
                              {photo.name}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-2 flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border-dark bg-surface-dark/50 px-5 text-center">
                        <span className="material-symbols-outlined text-5xl text-slate-600">inventory_2</span>
                        <p className="mt-3 text-sm font-semibold text-slate-300">Sin evidencia capturada</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Toma o sube fotografías del paquete, etiquetas y contenido recibido.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-dark bg-background-dark/70 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Recomendación operativa
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-slate-400">
                    <div className="flex gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3">
                      <span className="material-symbols-outlined text-primary">qr_code_2</span>
                      <span>El paquete se vincula automáticamente con la orden de admisión usando el reporte/siniestro.</span>
                    </div>
                    <div className="flex gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3">
                      <span className="material-symbols-outlined text-alert-amber">rule</span>
                      <span>Documenta en comentarios cualquier faltante, daño o diferencia de proveedor.</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border-dark px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border-dark px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-background-dark transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSaving ? "Guardando..." : mode === "create" ? "Guardar paquete" : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaquetesPiezas() {
  const [packages, setPackages] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [draftPhotos, setDraftPhotos] = useState([]);
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const revokeDraftUrls = (photos) => {
    photos.forEach((photo) => {
      if (photo.persisted || !photo.url?.startsWith("blob:")) return;
      try {
        URL.revokeObjectURL(photo.url);
      } catch {
        // noop
      }
    });
  };

  const loadPackages = async (searchValue = search) => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (searchValue.trim()) params.set("search", searchValue.trim());

      const response = await fetch(`${API_BASE}/inventario/paquetes?${params.toString()}`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los paquetes.");
      }

      const payload = await response.json();
      setPackages(Array.isArray(payload) ? payload.map(mapPackageSummary) : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los paquetes.");
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      loadPackages(search);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const metrics = useMemo(() => {
    const generados = packages.filter((item) => item.estado === "Generado").length;
    const completados = packages.filter((item) => item.estado === "Completado").length;
    return { generados, completados };
  }, [packages]);

  const totalPages = Math.max(1, Math.ceil(packages.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedPackages = packages.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const providerOptions = useMemo(() => {
    const options = new Set(providers);
    if (form.proveedor?.trim()) {
      options.add(form.proveedor.trim());
    }
    return Array.from(options);
  }, [providers, form.proveedor]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await fetch(`${API_BASE}/inventario/proveedores`);
        if (!response.ok) {
          throw new Error("No se pudo cargar el catálogo de proveedores.");
        }
        const payload = await response.json();
        const providerNames = Array.isArray(payload)
          ? payload
              .map((item) => String(item?.nombre || "").trim())
              .filter(Boolean)
          : [];
        setProviders(Array.from(new Set(providerNames)));
      } catch (err) {
        setError((prev) => prev || err.message || "No se pudo cargar el catálogo de proveedores.");
      }
    };

    loadProviders();
  }, []);

  const resetModal = () => {
    revokeDraftUrls(draftPhotos);
    setModalMode("create");
    setActiveId(null);
    setForm(EMPTY_FORM);
    setDraftPhotos([]);
    setModalLoading(false);
  };

  const hydrateModalFromDetail = (detail, mode) => {
    setModalMode(mode);
    setActiveId(detail?.id || null);
    setForm({
      proveedor: detail?.proveedor_nombre || "",
      reporte: detail?.numero_reporte_siniestro || "",
      piezasText: (detail?.relaciones || []).map((item) => item.nombre_pieza).join("\n"),
      comentarios: detail?.comentarios || "",
      estado: normalizeStatus(detail?.estatus),
    });
    setDraftPhotos((detail?.media || []).map(mapMediaItem));
  };

  const openCreateModal = () => {
    resetModal();
    setModalMode("create");
    setModalOpen(true);
  };

  const fetchPackageDetail = async (packageId) => {
    const response = await fetch(`${API_BASE}/inventario/paquetes/${packageId}`);
    if (!response.ok) {
      throw new Error("No se pudo cargar el detalle del paquete.");
    }
    return response.json();
  };

  const openEditModal = async (pkg, triggerCamera = false) => {
    try {
      setError("");
      setModalOpen(true);
      setModalLoading(true);
      const detail = await fetchPackageDetail(pkg.id);
      hydrateModalFromDetail(detail, "edit");
      if (triggerCamera) {
        requestAnimationFrame(() => cameraInputRef.current?.click());
      }
    } catch (err) {
      setError(err.message || "No se pudo abrir el paquete.");
      setModalOpen(false);
      resetModal();
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    resetModal();
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const uploadFilesToPackage = async (packageId, files) => {
    const uploaded = [];

    for (const file of Array.from(files || [])) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/inventario/paquetes/${packageId}/media?media_type=photo`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`No se pudo subir ${file.name}.`);
      }

      const payload = await response.json();
      uploaded.push(mapMediaItem(payload));
    }

    return uploaded;
  };

  const handleFilesSelected = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    try {
      setError("");

      if (modalMode === "edit" && activeId) {
        const uploaded = await uploadFilesToPackage(activeId, selectedFiles);
        setDraftPhotos((prev) => [...prev, ...uploaded]);
        await loadPackages(search);
        return;
      }

      const nextPhotos = selectedFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
        mediaType: "photo",
        mimeType: file.type,
        persisted: false,
      }));
      setDraftPhotos((prev) => [...prev, ...nextPhotos]);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los archivos.");
    }
  };

  const handleSave = async () => {
    const piezas = splitPieces(form.piezasText);

    if (!form.reporte.trim() || !form.proveedor.trim() || !piezas.length) {
      window.alert("Completa proveedor, reporte y al menos una pieza.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = buildPayload(form);
      const endpoint =
        modalMode === "create"
          ? `${API_BASE}/inventario/paquetes`
          : `${API_BASE}/inventario/paquetes/${activeId}`;

      const response = await fetch(endpoint, {
        method: modalMode === "create" ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(modalMode === "create" ? "No se pudo guardar el paquete." : "No se pudo actualizar el paquete.");
      }

      const savedPackage = await response.json();
      const pendingPhotos = draftPhotos.filter((photo) => !photo.persisted && photo.file);

      if (pendingPhotos.length) {
        await uploadFilesToPackage(
          savedPackage.id,
          pendingPhotos.map((photo) => photo.file)
        );
      }

      await loadPackages(search);
      closeModal();
      setPage(1);
    } catch (err) {
      setError(err.message || "No se pudo guardar el paquete.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pkg) => {
    const confirmed = window.confirm(`Eliminar ${pkg.folio} y su evidencia asociada?`);
    if (!confirmed) return;

    try {
      setError("");
      const response = await fetch(`${API_BASE}/inventario/paquetes/${pkg.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar el paquete.");
      }

      await loadPackages(search);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el paquete.");
    }
  };

  const removeDraftPhoto = async (photoId) => {
    const targetPhoto = draftPhotos.find((photo) => photo.id === photoId);
    if (!targetPhoto) return;

    if (!targetPhoto.persisted) {
      revokeDraftUrls([targetPhoto]);
      setDraftPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      return;
    }

    try {
      setError("");
      const response = await fetch(`${API_BASE}/inventario/paquetes/media/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la evidencia.");
      }

      setDraftPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
      await loadPackages(search);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la evidencia.");
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            searchPlaceholder="Buscar folio, OT, reporte o proveedor..."
            searchValue={search}
            onSearchChange={setSearch}
            rightExtras={
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[20px]">add_box</span>
                Nuevo paquete
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                  <span className="material-symbols-outlined text-[16px]">package_2</span>
                  Control de logística
                </div>
                <h1 className="text-3xl font-extrabold text-white">Gestión de Paquetes de Piezas</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Recepción y trazabilidad de paquetes vinculados a OT y siniestros
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-4 rounded-2xl border border-border-dark bg-surface-dark px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                  <div className="rounded-xl bg-primary/15 p-3 text-primary">
                    <span className="material-symbols-outlined">pending_actions</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Generados</div>
                    <div className="text-2xl font-bold text-white">{metrics.generados}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-border-dark bg-surface-dark px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                  <div className="rounded-xl bg-alert-green/15 p-3 text-alert-green">
                    <span className="material-symbols-outlined">task_alt</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Completados</div>
                    <div className="text-2xl font-bold text-white">{metrics.completados}</div>
                  </div>
                </div>
              </div>
            </section>

            {error ? (
              <section className="rounded-2xl border border-alert-red/30 bg-alert-red/10 px-4 py-3 text-sm text-alert-red">
                {error}
              </section>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-[1100px] w-full text-left">
                  <thead className="border-b border-border-dark bg-background-dark/40">
                    <tr>
                      {[
                        "Folio",
                        "Arribo",
                        "Proveedor",
                        "OT Relacionada",
                        "No. Reporte / Siniestro",
                        "Estatus",
                        "Acciones",
                      ].map((label) => (
                        <th
                          key={label}
                          className="px-4 py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-14 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-500">
                            <span className="material-symbols-outlined text-5xl">progress_activity</span>
                            <p className="text-base font-semibold text-slate-300">Cargando paquetes...</p>
                          </div>
                        </td>
                      </tr>
                    ) : pagedPackages.length ? (
                      pagedPackages.map((pkg) => (
                        <tr key={pkg.id} className="transition-colors hover:bg-white/5">
                          <td className="px-4 py-4 text-sm font-bold text-primary">{pkg.folio}</td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <div className="font-semibold">{formatArribo(pkg.arribo)}</div>
                            <div className="text-xs italic text-slate-500">{formatHour(pkg.arribo)}</div>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-200">{pkg.proveedor || "-"}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-lg bg-background-dark px-3 py-1.5 text-xs font-bold text-white border border-border-dark">
                              {pkg.ot || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">{pkg.reporte || "-"}</td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                                STATUS_STYLES[pkg.estado] || "border-border-dark text-slate-400"
                              }`}
                            >
                              {pkg.estado}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(pkg, true)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-primary/15 hover:text-primary"
                                title="Tomar foto"
                              >
                                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(pkg)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-alert-amber/15 hover:text-alert-amber"
                                title="Ver detalle"
                              >
                                <span className="material-symbols-outlined text-[20px]">list_alt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(pkg)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-alert-red/15 hover:text-alert-red"
                                title="Eliminar"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-14 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-500">
                            <span className="material-symbols-outlined text-5xl">package_2</span>
                            <p className="text-base font-semibold text-slate-300">No hay paquetes registrados</p>
                            <p className="text-sm text-slate-500">
                              Ajusta tu búsqueda o registra el primer paquete del día.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-border-dark bg-background-dark/20 px-4 py-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
                <div>
                  Mostrando <span className="font-bold text-white">{pagedPackages.length}</span> de{" "}
                  <span className="font-bold text-white">{packages.length}</span> paquetes registrados
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-lg border border-border-dark px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-dark"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .slice(0, 5)
                    .map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`min-w-10 rounded-lg px-3 py-1.5 font-bold ${
                          pageNumber === pageSafe
                            ? "bg-primary text-white"
                            : "border border-border-dark text-slate-300 hover:bg-surface-dark"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    className="rounded-lg border border-border-dark px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-dark"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          handleFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />

      <PackageModal
        isOpen={modalOpen}
        mode={modalMode}
        form={form}
        providerOptions={providerOptions}
        photos={draftPhotos}
        onChange={handleFormChange}
        onClose={closeModal}
        onSave={handleSave}
        onCameraClick={() => cameraInputRef.current?.click()}
        onUploadClick={() => uploadInputRef.current?.click()}
        onRemovePhoto={removeDraftPhoto}
        isSaving={saving}
        isLoading={modalLoading}
      />
    </div>
  );
}
