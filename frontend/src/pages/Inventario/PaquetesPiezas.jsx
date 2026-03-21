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
        .filter((item) => item.descripcion?.trim() || item.numeroParte?.trim() || item.almacen?.trim())
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
    piezaAsignadaId: item.pieza_asignada_id || null,
    esGlobal: item.es_global || false,
  };
}

// Helper para obtener piezas válidas (con descripción no vacía)
function getValidPiezas(piezas) {
  return (piezas || []).filter((pieza) => String(pieza.descripcion || "").trim().length > 0);
}

function buildPayload(form) {
  const piezas = getValidPiezas(form.piezas)
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
    }));

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
  onAssignPhoto,
  onUnassignPhoto,
  photoGalleryOpen,
  selectedPieceForPhoto,
  onOpenPhotoGallery,
  onClosePhotoGallery,
  assigningPhoto,
  getSuggestedPhotos,
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

                <div className="space-y-2 pt-5">
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
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 relative">
                              <div className="inline-flex items-center gap-2">
                                <span>Recibida</span>
                                {(form.piezas || []).length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const allReceived = (form.piezas || []).every(p => p.recibida);
                                      onToggleAllReceived(!allReceived);
                                    }}
                                    className="group inline-flex items-center justify-center w-5 h-5 rounded hover:bg-surface-dark"
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
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Evidencia</th>
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
                              {/* Columna Evidencia */}
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  {pieza.fotoAsignadaId ? (
                                    // Tiene foto asignada - mostrar miniatura
                                    pieza.fotoUrl ? (
                                      <div className="relative group">
                                        <img 
                                          src={pieza.fotoUrl} 
                                          alt="Foto asignada"
                                          className="w-12 h-12 rounded-lg object-cover border-2 border-alert-green cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                                          onClick={() => onOpenPhotoGallery(pieza)}
                                          onError={(e) => {
                                            console.error("[Table] Error cargando imagen:", pieza.fotoUrl);
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                          }}
                                        />
                                        <div className="hidden items-center gap-1 px-2 py-1 bg-alert-green/20 rounded text-alert-green text-xs">
                                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                          <span>Asignada</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onUnassignPhoto(pieza.fotoAsignadaId, pieza.rowId);
                                          }}
                                          className="absolute -top-2 -right-2 w-6 h-6 bg-alert-red rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                          title="Quitar foto"
                                        >
                                          <span className="material-symbols-outlined text-[14px] text-white">close</span>
                                        </button>
                                      </div>
                                    ) : (
                                      // Sin URL pero marcada como asignada
                                      <button
                                        type="button"
                                        onClick={() => onOpenPhotoGallery(pieza)}
                                        className="flex items-center gap-1 px-3 py-2 bg-alert-green/20 rounded-lg text-alert-green text-xs hover:bg-alert-green/30 transition-colors"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                        <span>Asignada</span>
                                      </button>
                                    )
                                  ) : (
                                    // No tiene foto - botón para asignar
                                    <button
                                      type="button"
                                      onClick={() => onOpenPhotoGallery(pieza)}
                                      className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs"
                                      title="Asignar foto"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
                                      <span>Sin foto</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                              
                              {/* Columna Acciones */}
                              <td className="px-3 py-3 text-center">
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
                  {(() => {
                    const piezasValidas = getValidPiezas(form.piezas);
                    const piezasRecibidas = piezasValidas.filter(p => p.recibida).length;
                    const totalPiezas = piezasValidas.length;
                    return totalPiezas > 0 ? (
                      <div className="flex items-center gap-3 px-1">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-400">
                              Progreso de recepción
                            </span>
                            <span className="text-xs font-bold text-white">
                              {piezasRecibidas} / {totalPiezas} piezas
                            </span>
                          </div>
                          <div className="h-2 bg-surface-dark rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${(piezasRecibidas / totalPiezas) * 100}%` }}
                            />
                          </div>
                        </div>
                        {piezasRecibidas === totalPiezas && (
                          <span className="material-symbols-outlined text-alert-green text-xl">check_circle</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                  
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
                </div>

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
      
      {/* Modal de Galería para Asignar Fotos */}
      {photoGalleryOpen && selectedPieceForPhoto && (
        <PhotoGalleryModal
          isOpen={photoGalleryOpen}
          piece={selectedPieceForPhoto}
          photos={photos || []}
          onClose={onClosePhotoGallery}
          onAssign={onAssignPhoto}
          onUnassign={onUnassignPhoto}
          assigning={assigningPhoto}
          getSuggestedPhotos={getSuggestedPhotos}
        />
      )}
    </div>
  );
}

function PhotoGalleryModal({ isOpen, piece, photos, onClose, onAssign, onUnassign, assigning, getSuggestedPhotos }) {
  if (!isOpen) return null;
  
  // Asegurar que photos sea un array
  const photosArray = Array.isArray(photos) ? photos : [];
  
  const suggestedPhotos = getSuggestedPhotos && piece ? getSuggestedPhotos(piece, photosArray) : [];
  const availablePhotos = photosArray.filter(p => 
    p?.mediaType === 'photo' && (!p?.piezaAsignadaId || p?.piezaAsignadaId === piece?.bitacoraPiezaId)
  );
  const otherPhotos = availablePhotos.filter(p => !suggestedPhotos.find(s => s?.id === p?.id));
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-dark px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              Asignar foto a pieza
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              <span className="text-primary font-medium">{piece?.descripcion || "Sin descripción"}</span>
              {piece?.almacen && <span className="ml-2 text-slate-500">({piece.almacen})</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-background-dark hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Estado de procesamiento */}
          {assigning && (
            <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary animate-spin">refresh</span>
                <p className="text-sm font-medium text-white">Procesando asignación...</p>
              </div>
            </div>
          )}
          
          {piece?.fotoAsignadaId && !assigning && (
            <div className="mb-6 p-4 bg-alert-green/10 border border-alert-green/30 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-alert-green">check_circle</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Foto asignada actualmente</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUnassign(piece?.fotoAsignadaId, piece?.rowId)}
                  disabled={assigning}
                  className="px-3 py-1.5 text-xs font-medium text-alert-red border border-alert-red/30 rounded-lg hover:bg-alert-red/10 transition-colors disabled:opacity-50"
                >
                  Quitar asignación
                </button>
              </div>
            </div>
          )}
          
          {/* Sugerencias IA */}
          {suggestedPhotos.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-primary mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                Sugerencias IA
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {suggestedPhotos.map((photo) => (
                  <PhotoGalleryItem
                    key={photo?.id || Math.random()}
                    photo={photo}
                    isAssigned={photo?.piezaAsignadaId === piece?.bitacoraPiezaId}
                    isOtherAssigned={photo?.piezaAsignadaId && photo?.piezaAsignadaId !== piece?.bitacoraPiezaId}
                    onClick={() => onAssign(photo?.id, piece?.rowId)}
                    disabled={assigning || photo?.piezaAsignadaId}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Todas las fotos disponibles */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">
              Todas las fotos {otherPhotos.length > 0 && `(${otherPhotos.length})`}
            </h4>
            {otherPhotos.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {otherPhotos.map((photo) => (
                  <PhotoGalleryItem
                    key={photo?.id || Math.random()}
                    photo={photo}
                    isAssigned={photo?.piezaAsignadaId === piece?.bitacoraPiezaId}
                    isOtherAssigned={photo?.piezaAsignadaId && photo?.piezaAsignadaId !== piece?.bitacoraPiezaId}
                    onClick={() => onAssign(photo?.id, piece?.rowId)}
                    disabled={assigning || photo?.piezaAsignadaId}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <span className="material-symbols-outlined text-4xl mb-2">photo_library</span>
                <p className="text-sm">No hay más fotos disponibles</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border-dark px-6 py-4 bg-surface-dark">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-dark px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-background-dark transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoGalleryItem({ photo, isAssigned, isOtherAssigned, onClick, disabled }) {
  if (!photo) return null;
  
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative group overflow-hidden rounded-xl border transition-all ${
        isAssigned 
          ? "border-alert-green ring-2 ring-alert-green/50" 
          : isOtherAssigned
            ? "border-slate-600 opacity-50 cursor-not-allowed"
            : disabled
              ? "border-border-dark opacity-70 cursor-wait"
              : "border-border-dark hover:border-primary hover:ring-2 hover:ring-primary/30"
      }`}
    >
      <div className="aspect-square">
        <img 
          src={photo.url || ''} 
          alt={photo.name || 'Foto'}
          className={`w-full h-full object-cover ${disabled && !isAssigned ? 'opacity-50' : ''}`}
        />
      </div>
      
      {/* Spinner de carga */}
      {disabled && !isAssigned && !isOtherAssigned && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-white animate-spin">refresh</span>
        </div>
      )}
      
      {/* Badge de estado */}
      {isAssigned && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-alert-green rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-[14px] text-white">check</span>
        </div>
      )}
      {isOtherAssigned && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-700 rounded text-[10px] text-slate-300">
          Asignada
        </div>
      )}
      
      {/* Overlay al hover */}
      {!isAssigned && !isOtherAssigned && (
        <div className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-white">add_circle</span>
        </div>
      )}
      
      {/* Nombre truncado */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
        <p className="text-[10px] text-white truncate">{photo.name}</p>
      </div>
    </button>
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
  const [pdfModal, setPdfModal] = useState(null);
  const [openingPdfId, setOpeningPdfId] = useState(null);
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [selectedPieceForPhoto, setSelectedPieceForPhoto] = useState(null);
  const [assigningPhoto, setAssigningPhoto] = useState(false);
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

  // Cerrar modales con tecla ESC
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        if (confirmCompleteOpen) {
          setConfirmCompleteOpen(false);
        } else if (pdfModal) {
          closePdfModal();
        } else if (photoGalleryOpen) {
          setPhotoGalleryOpen(false);
        } else if (selectedPieceForPhoto) {
          setSelectedPieceForPhoto(null);
        } else if (modalOpen) {
          closeModal();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [confirmCompleteOpen, pdfModal, photoGalleryOpen, selectedPieceForPhoto, modalOpen]);

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
    
    // Mapear fotos con sus asignaciones
    const photosWithAssignments = (detail?.media || []).map(mapMediaItem);
    
    // Crear un mapa de pieza_id -> foto para lookup rápido
    const fotoPorPieza = {};
    photosWithAssignments.forEach(photo => {
      if (photo.piezaAsignadaId) {
        fotoPorPieza[photo.piezaAsignadaId] = photo;
      }
    });
    
    // Normalizar piezas y asignar fotos si existen
    const piezasNormalizadas = normalizePieceRows(detail?.relaciones || []).map(pieza => {
      const fotoAsignada = fotoPorPieza[pieza.bitacoraPiezaId];
      if (fotoAsignada) {
        return {
          ...pieza,
          fotoAsignadaId: fotoAsignada.id,
          fotoUrl: fotoAsignada.url,
        };
      }
      return pieza;
    });
    
    setForm({
      reporte: detail?.numero_reporte_siniestro || "",
      piezas: piezasNormalizadas,
      comentarios: detail?.comentarios || "",
      estado: normalizeStatus(detail?.estatus),
    });
    setDraftPhotos(photosWithAssignments);
    setAutofillInfo({
      report: detail?.numero_reporte_siniestro || "",
      signature: serializePieceRows(piezasNormalizadas),
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

  // Cleanup del PDF modal
  useEffect(() => {
    return () => {
      if (pdfModal?.objectUrl) {
        URL.revokeObjectURL(pdfModal.objectUrl);
      }
    };
  }, [pdfModal]);

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
    
    try {
      setSaving(true);
      setError("");
      
      // Paso 1: Primero guardar las piezas actualizadas
      const payload = buildPayload({ ...form, estado: "Completado" });
      const saveResponse = await fetch(`${API_BASE}/inventario/paquetes/${activeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!saveResponse.ok) {
        const error = await saveResponse.json().catch(() => null);
        throw new Error(error?.detail || "No se pudieron guardar las piezas.");
      }
      
      // Paso 2: Luego llamar al endpoint para completar
      const response = await fetch(`${API_BASE}/inventario/paquetes/${activeId}/completar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || "No se pudo completar el paquete.");
      }
      
      await loadPackages(search);
      closeModal();
    } catch (err) {
      setError(err.message || "Error al completar el paquete.");
      // Reabrir el modal de confirmación para que el usuario vea el error y pueda reintentar
      setConfirmCompleteOpen(true);
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

  // Funciones para asignación de fotos a piezas
  const openPhotoGallery = (pieza) => {
    setSelectedPieceForPhoto(pieza);
    setPhotoGalleryOpen(true);
  };

  const closePhotoGallery = () => {
    setPhotoGalleryOpen(false);
    setSelectedPieceForPhoto(null);
  };

  const assignPhotoToPiece = async (photoId, piezaRowId) => {
    console.log("[assignPhotoToPiece] Iniciando asignación:", { photoId, piezaRowId, activeId });
    
    if (!activeId || !photoId) {
      setError("No se puede asignar: falta información del paquete o foto");
      return;
    }
    
    try {
      setAssigningPhoto(true);
      setError("");
      
      // Encontrar el bitacora_pieza_id de la pieza seleccionada
      const pieza = form.piezas.find(p => p.rowId === piezaRowId);
      console.log("[assignPhotoToPiece] Pieza encontrada:", pieza);
      
      const bitacoraPiezaId = pieza?.bitacoraPiezaId;
      
      if (!bitacoraPiezaId) {
        console.error("[assignPhotoToPiece] No hay bitacoraPiezaId para la pieza:", pieza);
        throw new Error("La pieza no está vinculada a la bitácora de piezas. Guarda el paquete primero.");
      }
      
      console.log("[assignPhotoToPiece] Enviando request:", { photoId, bitacoraPiezaId });
      
      const response = await fetch(
        `${API_BASE}/inventario/paquetes/media/${photoId}/asignar-pieza?pieza_id=${bitacoraPiezaId}`,
        { method: "PATCH" }
      );
      
      console.log("[assignPhotoToPiece] Response status:", response.status);
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("[assignPhotoToPiece] Error response:", errData);
        throw new Error(errData.detail || `Error ${response.status}: No se pudo asignar la foto`);
      }
      
      // Actualizar el estado local de las fotos
      const updatedPhoto = await response.json();
      console.log("[assignPhotoToPiece] Foto actualizada:", updatedPhoto);
      
      const photoUrl = buildMediaUrl(updatedPhoto.file_path);
      console.log("[assignPhotoToPiece] URL construida:", photoUrl);
      
      setDraftPhotos(prev => {
        const newPhotos = prev.map(p => 
          p.id === photoId 
            ? { ...p, piezaAsignadaId: bitacoraPiezaId, piezaRowId: piezaRowId }
            : p
        );
        console.log("[assignPhotoToPiece] Fotos actualizadas:", newPhotos);
        return newPhotos;
      });
      
      // Actualizar la pieza con la foto asignada
      setForm(prev => {
        const newPiezas = prev.piezas.map(p => 
          p.rowId === piezaRowId 
            ? { ...p, fotoAsignadaId: photoId, fotoUrl: photoUrl }
            : p
        );
        console.log("[assignPhotoToPiece] Piezas actualizadas:", newPiezas);
        return { ...prev, piezas: newPiezas };
      });
      
      // Cerrar modal
      closePhotoGallery();
      
    } catch (err) {
      console.error("[assignPhotoToPiece] Error:", err);
      setError(err.message || "Error al asignar foto. Intenta de nuevo.");
    } finally {
      setAssigningPhoto(false);
    }
  };

  const unassignPhotoFromPiece = async (photoId, piezaRowId) => {
    if (!photoId) return;
    
    try {
      setAssigningPhoto(true);
      setError("");
      
      const response = await fetch(
        `${API_BASE}/inventario/paquetes/media/${photoId}/asignar-pieza`,
        { method: "PATCH" }
      );
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Error al quitar la asignación de la foto");
      }
      
      // Actualizar estado local
      setDraftPhotos(prev => prev.map(p => 
        p.id === photoId 
          ? { ...p, piezaAsignadaId: null, piezaRowId: null }
          : p
      ));
      
      setForm(prev => ({
        ...prev,
        piezas: prev.piezas.map(p => 
          p.rowId === piezaRowId 
            ? { ...p, fotoAsignadaId: null, fotoUrl: null }
            : p
        )
      }));
    } catch (err) {
      console.error("Error al desasignar foto:", err);
      setError(err.message || "Error al quitar la asignación. Intenta de nuevo.");
    } finally {
      setAssigningPhoto(false);
    }
  };

  // Función de IA simple para sugerir fotos basadas en keywords
  const getSuggestedPhotosForPiece = (pieza, allPhotos) => {
    if (!pieza?.descripcion || !Array.isArray(allPhotos)) return [];
    
    const desc = pieza.descripcion.toLowerCase();
    const keywords = desc.split(/\s+/).filter(w => w.length > 2);
    
    return allPhotos
      .filter(photo => photo && (!photo.piezaAsignadaId || photo.piezaRowId === pieza.rowId))
      .map(photo => {
        const photoName = (photo?.originalName || photo?.name || "").toLowerCase();
        let score = 0;
        
        // Puntaje por coincidencia de keywords
        keywords.forEach(keyword => {
          if (photoName.includes(keyword)) score += 2;
        });
        
        // Bonus si la foto ya está asignada a esta pieza
        if (photo?.piezaRowId === pieza?.rowId) score += 10;
        
        return { photo, score };
      })
      .filter(item => item && (item.score > 0 || item.photo?.piezaRowId === pieza?.rowId))
      .sort((a, b) => (b?.score || 0) - (a?.score || 0))
      .slice(0, 6)
      .map(item => item?.photo)
      .filter(Boolean);
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
    const piezasValidas = getValidPiezas(form.piezas);

    if (!form.reporte.trim() || !piezasValidas.length) {
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
    const totalPiezas = piezasValidas.length;
    const piezasRecibidas = piezasValidas.filter(p => p.recibida).length;
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

  const closePdfModal = () => {
    if (pdfModal?.objectUrl) {
      URL.revokeObjectURL(pdfModal.objectUrl);
    }
    setPdfModal(null);
  };

  const openPdfPreview = async (pkg) => {
    if (!pkg?.id) return;
    setOpeningPdfId(pkg.id);
    setPdfModal({
      pkg,
      loading: true,
      error: "",
      fileName: "",
      objectUrl: ""
    });
    
    try {
      const response = await fetch(`${API_BASE}/inventario/paquetes/${pkg.id}/pdf-inventario`, {
        method: "GET",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "No se pudo generar el PDF.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const fileNameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
      const fileName = fileNameMatch?.[1] || `Inventario_${pkg.folio}.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      
      setPdfModal((prev) => {
        if (prev?.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }
        return {
          ...prev,
          loading: false,
          error: "",
          fileName,
          objectUrl
        };
      });
    } catch (err) {
      setPdfModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "No se pudo generar el PDF"
      }));
    } finally {
      setOpeningPdfId(null);
    }
  };

  const handleDownloadPDF = async (pkg) => {
    try {
      setError("");
      const response = await fetch(`${API_BASE}/inventario/paquetes/${pkg.id}/pdf-inventario`, {
        method: "GET",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "No se pudo generar el PDF.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `Inventario_${pkg.folio}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Error al descargar el PDF.");
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
            searchPlaceholder="Buscar folio, OT o reporte..."
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
                        <td colSpan={6} className="px-4 py-14 text-center">
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
                                onClick={() => openPdfPreview(pkg)}
                                disabled={openingPdfId === pkg.id}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-500/15 hover:text-blue-400 disabled:opacity-50"
                                title="Vista previa del PDF"
                              >
                                <span className="material-symbols-outlined text-[20px]">{openingPdfId === pkg.id ? 'refresh' : 'visibility'}</span>
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
                        <td colSpan={6} className="px-4 py-14 text-center">
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
              Todas las piezas ({getValidPiezas(form.piezas).length}) han sido marcadas como recibidas.
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
        onAssignPhoto={assignPhotoToPiece}
        onUnassignPhoto={unassignPhotoFromPiece}
        photoGalleryOpen={photoGalleryOpen}
        selectedPieceForPhoto={selectedPieceForPhoto}
        onOpenPhotoGallery={openPhotoGallery}
        onClosePhotoGallery={closePhotoGallery}
        assigningPhoto={assigningPhoto}
        getSuggestedPhotos={getSuggestedPhotosForPiece}
        isSaving={saving}
        isLoading={modalLoading}
        saveDisabled={validatingReport || reportHasBlockingIssue}
      />

      {/* Modal de Vista Previa del PDF */}
      {pdfModal ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="w-[95vw] max-w-6xl h-[90vh] bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Vista previa de PDF</h3>
                <p className="text-xs text-slate-400">{pdfModal.fileName || "Generando documento..."}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Descargar"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  disabled={!pdfModal.objectUrl}
                  onClick={() => {
                    if (!pdfModal.objectUrl) return;
                    const link = document.createElement("a");
                    link.href = pdfModal.objectUrl;
                    link.download = pdfModal.fileName || `Inventario_${pdfModal.pkg?.folio || pdfModal.pkg?.id}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  }}
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                </button>
                <button
                  type="button"
                  title="Abrir en nueva ventana"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  disabled={!pdfModal.objectUrl}
                  onClick={() => {
                    if (!pdfModal.objectUrl) return;
                    window.open(pdfModal.objectUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <span className="material-symbols-outlined text-lg">open_in_new</span>
                </button>
                <button
                  type="button"
                  title="Enviar por correo"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  onClick={() => {
                    const folio = pdfModal.pkg?.folio || pdfModal.pkg?.id;
                    const subject = encodeURIComponent(`Inventario de refacciones #${folio}`);
                    const body = encodeURIComponent(`Te comparto el inventario de refacciones #${folio}.\n\nNota: adjunta el PDF descargado desde la vista previa.`);
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                >
                  <span className="material-symbols-outlined text-lg">mail</span>
                </button>
                <button
                  className="text-slate-400 hover:text-white"
                  type="button"
                  onClick={closePdfModal}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black/30">
              {pdfModal.loading ? (
                <div className="h-full flex items-center justify-center text-slate-300">
                  <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                  Generando PDF...
                </div>
              ) : pdfModal.error ? (
                <div className="h-full flex items-center justify-center text-alert-red">
                  <span className="material-symbols-outlined mr-2">error</span>
                  {pdfModal.error}
                </div>
              ) : (
                <iframe
                  src={pdfModal.objectUrl}
                  title="Vista previa PDF inventario"
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
