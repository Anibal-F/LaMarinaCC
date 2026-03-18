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
const ALMACEN_OPTIONS = ["Oficina", "1er Piso", "2do Piso"];

function createPieceRow(overrides = {}) {
  return {
    rowId: overrides.rowId || `piece-${Math.random().toString(36).slice(2, 10)}`,
    bitacoraPiezaId: overrides.bitacoraPiezaId || null,
    descripcion: overrides.descripcion || "",
    cantidad: overrides.cantidad ?? 1,
    cantidadRecibida: overrides.cantidadRecibida ?? 0,
    recibida: overrides.recibida || false,
    fechaRecepcion: overrides.fechaRecepcion || null,
    almacen: overrides.almacen || "",
    numeroParte: overrides.numeroParte || "",
  };
}

function normalizePieceRows(relaciones = []) {
  const rows = Array.isArray(relaciones)
    ? relaciones
        .map((item) =>
          createPieceRow({
            bitacoraPiezaId: item?.bitacora_pieza_id || null,
            descripcion: item?.nombre_pieza || "",
            cantidad: item?.cantidad ?? 1,
            cantidadRecibida: item?.cantidad_recibida ?? 0,
            recibida: item?.recibida || false,
            fechaRecepcion: item?.fecha_recepcion || null,
            almacen: item?.almacen || "",
            numeroParte: item?.numero_parte || "",
          })
        )
        .filter((item) => item.descripcion || item.numeroParte || item.almacen || item.cantidad)
    : [];

  return rows.length ? rows : [createPieceRow()];
}

function serializePieceRows(rows = []) {
  return JSON.stringify(
    rows.map((item) => ({
      descripcion: String(item?.descripcion || "").trim(),
      cantidad: Number(item?.cantidad || 0),
      recibida: Boolean(item?.recibida),
      almacen: String(item?.almacen || "").trim(),
      numeroParte: String(item?.numeroParte || "").trim(),
    }))
  );
}

const EMPTY_FORM = {
  reporte: "",
  piezas: [createPieceRow()],
  comentarios: "",
  estado: "Generado",
};

const STATUS_STYLES = {
  Generado: "bg-alert-amber/15 text-alert-amber border-alert-amber/30",
  Parcial: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Completado: "bg-alert-green/15 text-alert-green border-alert-green/30",
};

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "completado" || normalized === "recibido") return "Completado";
  if (normalized === "parcial" || normalized === "en recepcion") return "Parcial";
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
  const piezas = (form.piezas || [])
    .map((pieza) => ({
      bitacora_pieza_id: pieza.bitacoraPiezaId || null,
      nombre_pieza: String(pieza.descripcion || "").trim(),
      numero_parte: String(pieza.numeroParte || "").trim() || null,
      cantidad: Math.max(1, Number(pieza.cantidad || 1)),
      cantidad_recibida: Math.max(0, Number(pieza.cantidadRecibida || pieza.cantidad || 0)),
      recibida: Boolean(pieza.recibida),
      fecha_recepcion: pieza.recibida ? new Date().toISOString() : null,
      almacen: String(pieza.almacen || "").trim() || null,
      estatus: form.estado,
    }))
    .filter((pieza) => pieza.nombre_pieza);

  // Calcular estatus automáticamente basado en piezas recibidas
  const totalPiezas = piezas.length;
  const piezasRecibidas = piezas.filter(p => p.recibida).length;
  let estatusCalculado = "Generado";
  if (piezasRecibidas === totalPiezas && totalPiezas > 0) {
    estatusCalculado = "Completado";
  } else if (piezasRecibidas > 0) {
    estatusCalculado = "Parcial";
  }

  return {
    numero_reporte_siniestro: form.reporte.trim(),
    estatus: estatusCalculado,
    comentarios: form.comentarios.trim() || null,
    relaciones: piezas,
  };
}

function PackageModal({
  isOpen,
  mode,
  form,
  reportValidation,
  isValidatingReport,
  autofillInfo,
  onChange,
  onPieceChange,
  onAddPieceRow,
  onRemovePieceRow,
  onToggleAllReceived,
  onClose,
  onSave,
  photos,
  onCameraClick,
  onUploadClick,
  onRemovePhoto,
  isSaving,
  isLoading,
  saveDisabled,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-7xl max-h-[90vh] rounded-2xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden flex flex-col">
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
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid items-stretch gap-6 p-6 xl:grid-cols-[1.55fr_0.85fr]">
                <section className="space-y-5">
                <div className="grid gap-4 md:grid-cols-1">
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
                    {isValidatingReport ? (
                      <p className="text-xs text-slate-500">Validando reporte/siniestro...</p>
                    ) : null}
                    {!isValidatingReport && reportValidation?.reportMissing ? (
                      <p className="text-xs text-slate-500">
                        Este dato vincula automáticamente el paquete con la orden de admisión.
                      </p>
                    ) : null}
                    {!isValidatingReport && reportValidation?.reportProvided && reportValidation?.orderFound ? (
                      <p className="text-xs text-alert-green">
                        Orden de admisión encontrada para este reporte/siniestro.
                      </p>
                    ) : null}
                    {!isValidatingReport && reportValidation?.reportProvided && !reportValidation?.orderFound ? (
                      <p className="text-xs text-alert-red">
                        No existe una orden de admisión con ese reporte/siniestro.
                      </p>
                    ) : null}
                    {!isValidatingReport && reportValidation?.duplicatePackage ? (
                      <p className="text-xs text-alert-amber">
                        Este reporte/siniestro ya está asignado al paquete {reportValidation.duplicatePackage.folio}.
                      </p>
                    ) : null}
                  </label>
                  <label className="space-y-2 pb-3">
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

                <label className="space-y-2 pt-5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Piezas incluidas
                  </span>
                  <div className="overflow-hidden rounded-xl border border-border-dark bg-background-dark">
                    <div className="max-h-[300px] overflow-x-auto overflow-y-auto custom-scrollbar">
                      <table className="min-w-full text-left">
                        <thead className="border-b border-border-dark bg-surface-dark/70">
                          <tr>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">No.</th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Descripción</th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Cantidad</th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                              <div className="flex items-center justify-center gap-2">
                                <span>Recibida</span>
                                {(form.piezas || []).length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const allReceived = (form.piezas || []).every(p => p.recibida);
                                      onToggleAllReceived(!allReceived);
                                    }}
                                    className="group relative inline-flex items-center justify-center"
                                    title={(form.piezas || []).every(p => p.recibida) ? "Desmarcar todas" : "Marcar todas como recibidas"}
                                  >
                                    <span className="material-symbols-outlined text-[14px] text-slate-400 group-hover:text-primary transition-colors">
                                      {(form.piezas || []).every(p => p.recibida) ? "check_box" : "check_box_outline_blank"}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Almacén</th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dark">
                          {(form.piezas || []).map((pieza, index) => (
                            <tr key={pieza.rowId} className={pieza.recibida ? "bg-alert-green/5" : ""}>
                              <td className="px-3 py-3 text-sm font-semibold text-slate-300">{index + 1}</td>
                              <td className="px-3 py-3">
                                <input
                                  type="text"
                                  value={pieza.descripcion}
                                  onChange={(event) => onPieceChange(pieza.rowId, "descripcion", event.target.value)}
                                  className="w-full rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                                  placeholder="Descripción de la pieza"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min="1"
                                  value={pieza.cantidad}
                                  onChange={(event) => onPieceChange(pieza.rowId, "cantidad", event.target.value)}
                                  className="w-20 rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={pieza.recibida || false}
                                  onChange={(event) => onPieceChange(pieza.rowId, "recibida", event.target.checked)}
                                  className="h-5 w-5 rounded border-border-dark bg-surface-dark text-primary focus:ring-primary cursor-pointer"
                                  title={pieza.recibida ? "Pieza recibida" : "Marcar como recibida"}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <select
                                  value={pieza.almacen}
                                  onChange={(event) => onPieceChange(pieza.rowId, "almacen", event.target.value)}
                                  className="w-full rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                                >
                                  <option value="">Selecciona almacén</option>
                                  {ALMACEN_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  onClick={() => onRemovePieceRow(pieza.rowId)}
                                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-alert-red/15 hover:text-alert-red"
                                  title="Eliminar fila"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-border-dark px-3 py-3">
                      <button
                        type="button"
                        onClick={onAddPieceRow}
                        className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/15"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Agregar fila
                      </button>
                    </div>
                  </div>
                  
                  {/* Indicador de progreso de recepción */}
                  {form.piezas && form.piezas.length > 0 && (
                    <div className="flex items-center gap-3 px-1">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-400">
                            Progreso de recepción
                          </span>
                          <span className="text-xs font-bold text-white">
                            {form.piezas.filter(p => p.recibida).length} / {form.piezas.length} piezas
                          </span>
                        </div>
                        <div className="h-2 bg-surface-dark rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${(form.piezas.filter(p => p.recibida).length / form.piezas.length) * 100}%` }}
                          />
                        </div>
                      </div>
                      {form.piezas.filter(p => p.recibida).length === form.piezas.length && form.piezas.length > 0 && (
                        <span className="material-symbols-outlined text-alert-green text-xl">check_circle</span>
                      )}
                    </div>
                  )}
                  
                  {autofillInfo?.fetched ? (
                    autofillInfo.count ? (
                      <p className="text-xs text-primary">
                        Se autocompletaron {autofillInfo.count} pieza{autofillInfo.count === 1 ? "" : "s"} desde Bitácora de Piezas para este reporte/siniestro.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No se encontraron piezas en Bitácora para este reporte/siniestro.
                      </p>
                    )
                  ) : null}
                </label>

                <label className="space-y-2 pt-4">
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

              <aside className="flex h-full">
                <div className="flex h-full w-full flex-col rounded-2xl border border-border-dark bg-background-dark/70 p-5">
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

                  <div className="mt-5 grid flex-1 grid-cols-2 gap-3 auto-rows-fr content-start">
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
                      <div className="col-span-2 flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border-dark bg-surface-dark/50 px-5 text-center">
                        <span className="material-symbols-outlined text-5xl text-slate-600">inventory_2</span>
                        <p className="mt-3 text-sm font-semibold text-slate-300">Sin evidencia capturada</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Toma o sube fotografías del paquete, etiquetas y contenido recibido.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </aside>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border-dark px-6 py-4 bg-surface-dark">
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
                disabled={isSaving || saveDisabled}
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
  const [autofillInfo, setAutofillInfo] = useState({
    report: "",
    signature: serializePieceRows(EMPTY_FORM.piezas),
    count: 0,
    fetched: false,
  });
  const [reportValidation, setReportValidation] = useState({
    reportMissing: true,
    reportProvided: false,
    orderFound: false,
    duplicatePackage: null,
  });
  const [validatingReport, setValidatingReport] = useState(false);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
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
    const parciales = packages.filter((item) => item.estado === "Parcial").length;
    const completados = packages.filter((item) => item.estado === "Completado").length;
    return { generados, parciales, completados };
  }, [packages]);

  const totalPages = Math.max(1, Math.ceil(packages.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedPackages = packages.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const resetModal = () => {
    revokeDraftUrls(draftPhotos);
    setModalMode("create");
    setActiveId(null);
    setForm(EMPTY_FORM);
    setDraftPhotos([]);
    setModalLoading(false);
    setAutofillInfo({
      report: "",
      signature: serializePieceRows(EMPTY_FORM.piezas),
      count: 0,
      fetched: false,
    });
    setReportValidation({
      reportMissing: true,
      reportProvided: false,
      orderFound: false,
      duplicatePackage: null,
    });
    setValidatingReport(false);
  };

  const hydrateModalFromDetail = (detail, mode) => {
    setModalMode(mode);
    setActiveId(detail?.id || null);
    setForm({
      reporte: detail?.numero_reporte_siniestro || "",
      piezas: normalizePieceRows(detail?.relaciones || []),
      comentarios: detail?.comentarios || "",
      estado: normalizeStatus(detail?.estatus),
    });
    setDraftPhotos((detail?.media || []).map(mapMediaItem));
    const pieceRows = normalizePieceRows(detail?.relaciones || []);
    setAutofillInfo({
      report: detail?.numero_reporte_siniestro || "",
      signature: serializePieceRows(pieceRows),
      count: (detail?.relaciones || []).length,
      fetched: true,
    });
  };

  useEffect(() => {
    if (!modalOpen || modalLoading) return;

    const report = String(form.reporte || "").trim();
    if (report && report !== autofillInfo.report && autofillInfo.fetched) {
      setAutofillInfo({
        report,
        signature: autofillInfo.signature,
        count: 0,
        fetched: false,
      });
    }
    if (!report) {
      setValidatingReport(false);
      setAutofillInfo({
        report: "",
        signature: serializePieceRows(EMPTY_FORM.piezas),
        count: 0,
        fetched: false,
      });
      setReportValidation({
        reportMissing: true,
        reportProvided: false,
        orderFound: false,
        duplicatePackage: null,
      });
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setValidatingReport(true);
        const params = new URLSearchParams({ numero_reporte_siniestro: report });
        if (activeId) params.set("exclude_paquete_id", String(activeId));

        const response = await fetch(`${API_BASE}/inventario/paquetes/validate-report?${params.toString()}`);
        if (!response.ok) {
          throw new Error("No se pudo validar el reporte/siniestro.");
        }

        const payload = await response.json();
        setReportValidation({
          reportMissing: false,
          reportProvided: true,
          orderFound: Boolean(payload?.orden_admision_encontrada),
          duplicatePackage: payload?.paquete_existente || null,
        });
      } catch (err) {
        setReportValidation({
          reportMissing: false,
          reportProvided: true,
          orderFound: false,
          duplicatePackage: null,
        });
        setError((prev) => prev || err.message || "No se pudo validar el reporte/siniestro.");
      } finally {
        setValidatingReport(false);
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [modalOpen, modalLoading, form.reporte, activeId, autofillInfo.report, autofillInfo.fetched]);

  useEffect(() => {
    if (!modalOpen || modalLoading) return;
    if (!reportValidation.reportProvided || !reportValidation.orderFound || reportValidation.duplicatePackage) return;

    const report = String(form.reporte || "").trim();
    if (!report) return;
    if (autofillInfo.report === report && autofillInfo.fetched) return;

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE}/inventario/paquetes/suggest-relaciones?${new URLSearchParams({
            numero_reporte_siniestro: report,
          }).toString()}`
        );
        if (!response.ok) {
          throw new Error("No se pudieron consultar las piezas de bitácora para ese reporte.");
        }

        const payload = await response.json();
        const suggestions = Array.isArray(payload?.sugerencias) ? payload.sugerencias : [];
        const nextRows = suggestions.length
          ? suggestions.map((item) =>
              createPieceRow({
                bitacoraPiezaId: item?.bitacora_pieza_id || null,
                descripcion: item?.nombre_pieza || "",
                cantidad: item?.cantidad ?? 1,
                numeroParte: item?.numero_parte || "",
              })
            )
          : [createPieceRow()];
        const nextSignature = serializePieceRows(nextRows);

        setAutofillInfo((prev) => ({
          ...prev,
          report,
          signature: nextSignature,
          count: suggestions.length,
          fetched: true,
        }));

        setForm((prev) => {
          const currentSignature = serializePieceRows(prev.piezas || []);
          const canReplace =
            !(prev.piezas || []).some((item) => String(item?.descripcion || "").trim()) ||
            currentSignature === autofillInfo.signature;
          if (!canReplace) return prev;
          return { ...prev, piezas: nextRows };
        });
      } catch (err) {
        setError((prev) => prev || err.message || "No se pudieron sugerir piezas desde bitácora.");
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    modalOpen,
    modalLoading,
    form.reporte,
    reportValidation.reportProvided,
    reportValidation.orderFound,
    reportValidation.duplicatePackage,
    autofillInfo.report,
    autofillInfo.fetched,
    autofillInfo.signature,
  ]);

  const reportHasBlockingIssue =
    reportValidation.reportProvided &&
    (!reportValidation.orderFound || Boolean(reportValidation.duplicatePackage));

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
  
  const handleConfirmComplete = async () => {
    setConfirmCompleteOpen(false);
    setForm(prev => ({ ...prev, estado: "Completado" }));
    // Llamar al endpoint especial para completar
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE}/inventario/paquetes/${activeId}/completar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "No se pudo completar el paquete.");
      }
      await loadPackages(search);
      closeModal();
    } catch (err) {
      setError(err.message || "Error al completar el paquete.");
    } finally {
      setSaving(false);
    }
  };
  
  const handleCancelComplete = () => {
    setConfirmCompleteOpen(false);
    // Guardar normalmente sin completar
    executeSave();
  };
  
  const executeSave = async () => {
    // Esta función contiene la lógica original de guardado
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
        headers: { "Content-Type": "application/json" },
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

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePieceChange = (rowId, field, value) => {
    setForm((prev) => ({
      ...prev,
      piezas: (prev.piezas || []).map((pieza) =>
        pieza.rowId === rowId
          ? {
              ...pieza,
              [field]: field === "cantidad" ? Math.max(1, Number(value || 1)) : value,
            }
          : pieza
      ),
    }));
  };

  const handleAddPieceRow = () => {
    setForm((prev) => ({
      ...prev,
      piezas: [...(prev.piezas || []), createPieceRow()],
    }));
  };

  const handleRemovePieceRow = (rowId) => {
    setForm((prev) => {
      const nextRows = (prev.piezas || []).filter((pieza) => pieza.rowId !== rowId);
      return {
        ...prev,
        piezas: nextRows.length ? nextRows : [createPieceRow()],
      };
    });
  };

  const handleToggleAllReceived = (checked) => {
    setForm((prev) => ({
      ...prev,
      piezas: (prev.piezas || []).map((pieza) => ({
        ...pieza,
        recibida: checked,
      })),
    }));
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
    const piezas = (form.piezas || []).filter((pieza) => String(pieza.descripcion || "").trim());

    if (!form.reporte.trim() || !piezas.length) {
      window.alert("Completa el reporte y al menos una pieza.");
      return;
    }
    if (validatingReport) {
      window.alert("Espera a que termine la validación del reporte/siniestro.");
      return;
    }
    if (!reportValidation.orderFound) {
      window.alert("El reporte/siniestro no existe en Orden de Admisión.");
      return;
    }
    if (reportValidation.duplicatePackage) {
      window.alert(`El reporte/siniestro ya está asignado al paquete ${reportValidation.duplicatePackage.folio}.`);
      return;
    }
    
    // Verificar si todas las piezas están recibidas y no está ya completado
    const totalPiezas = piezas.length;
    const piezasRecibidas = piezas.filter(p => p.recibida).length;
    const estaCompletado = form.estado === "Completado";
    
    if (piezasRecibidas === totalPiezas && totalPiezas > 0 && !estaCompletado && !confirmCompleteOpen) {
      // Mostrar modal de confirmación
      setConfirmCompleteOpen(true);
      return;
    }

    // Guardar normalmente
    await executeSave();
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  <div className="rounded-xl bg-amber-500/15 p-3 text-amber-500">
                    <span className="material-symbols-outlined">hourglass_top</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Parciales</div>
                    <div className="text-2xl font-bold text-white">{metrics.parciales}</div>
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

      {/* Modal de confirmación para completar paquete */}
      {confirmCompleteOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-dark bg-surface-dark shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-3xl text-alert-amber">warning</span>
              <h3 className="text-xl font-bold text-white">¿Confirmar recepción completa?</h3>
            </div>
            
            <p className="text-slate-300 mb-2">
              Todas las piezas ({form.piezas?.length || 0}) han sido marcadas como recibidas.
            </p>
            
            <p className="text-slate-400 text-sm mb-6">
              Una vez marcado como <strong className="text-alert-green">Completado</strong>, el paquete no podrá modificarse. 
              Asegúrate de que todas las piezas han sido recepcionadas correctamente.
            </p>
            
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelComplete}
                className="rounded-xl border border-border-dark px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-background-dark transition-colors"
              >
                Guardar sin completar
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={saving}
                className="rounded-xl bg-alert-green px-5 py-2.5 text-sm font-bold text-white hover:bg-alert-green/90 transition-colors disabled:opacity-60"
              >
                {saving ? "Completando..." : "Sí, completar recepción"}
              </button>
            </div>
          </div>
        </div>
      )}

      <PackageModal
        isOpen={modalOpen}
        mode={modalMode}
        form={form}
        reportValidation={reportValidation}
        isValidatingReport={validatingReport}
        autofillInfo={autofillInfo}
        photos={draftPhotos}
        onChange={handleFormChange}
        onPieceChange={handlePieceChange}
        onAddPieceRow={handleAddPieceRow}
        onRemovePieceRow={handleRemovePieceRow}
        onToggleAllReceived={handleToggleAllReceived}
        onClose={closeModal}
        onSave={handleSave}
        onCameraClick={() => cameraInputRef.current?.click()}
        onUploadClick={() => uploadInputRef.current?.click()}
        onRemovePhoto={removeDraftPhoto}
        isSaving={saving}
        isLoading={modalLoading}
        saveDisabled={validatingReport || reportHasBlockingIssue}
      />
    </div>
  );
}
