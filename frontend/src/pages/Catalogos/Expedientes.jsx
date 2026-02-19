import { useEffect, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const fileTypeOptions = [
  { value: "archivoorden_admision", label: "Orden de admision" },
  { value: "archivo_valuacion", label: "Archivo de valuacion" },
  { value: "valuacion_foto", label: "Foto de valuacion" },
  { value: "archivorecepcion_vehiculo", label: "Archivo recepcion vehiculo" },
  { value: "recepcion_foto", label: "Foto recepcion" },
  { value: "recepcion_video", label: "Video recepcion" }
];

function isImageFile(file) {
  const mime = (file?.mime_type || "").toLowerCase();
  const path = (file?.archivo_path || "").toLowerCase();
  return mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => path.endsWith(ext));
}

function fileUrl(file) {
  const path = file?.archivo_path || "";
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${import.meta.env.VITE_API_URL}${path}`;
}

export default function CatalogoExpedientes() {
  const [reporte, setReporte] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [expediente, setExpediente] = useState(null);
  const [expedientes, setExpedientes] = useState([]);
  const [selectedTipo, setSelectedTipo] = useState("archivo_valuacion");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [detailView, setDetailView] = useState("list");

  const loadExpedientes = async (query = "") => {
    setLoadingList(true);
    setListError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/expedientes?query=${encodeURIComponent(query)}&limit=150`
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los expedientes.");
      }
      const data = await response.json();
      setExpedientes(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err.message || "No se pudieron cargar los expedientes.");
      setExpedientes([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadExpedientes();
  }, []);

  const openExpediente = async (reporteSiniestro) => {
    if (!reporteSiniestro?.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(reporteSiniestro.trim())}`
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se encontró el expediente.");
      }
      const data = await response.json();
      setExpediente(data);
    } catch (err) {
      setExpediente(null);
      setError(err.message || "No se pudo cargar el expediente.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!reporte.trim()) {
      setError("");
      setExpediente(null);
      loadExpedientes("");
      return;
    }
    await Promise.all([openExpediente(reporte.trim()), loadExpedientes(reporte.trim())]);
  };

  const archivos = expediente?.archivos || [];

  const refreshCurrentExpediente = async () => {
    const folio = expediente?.expediente?.reporte_siniestro;
    if (!folio) return;
    await Promise.all([openExpediente(folio), loadExpedientes(reporte.trim())]);
  };

  const handleUploadToExpediente = async () => {
    const folio = expediente?.expediente?.reporte_siniestro;
    if (!folio) {
      setActionError("Selecciona un expediente para cargar archivos.");
      return;
    }
    if (!uploadFiles.length) {
      setActionError("Selecciona al menos un archivo.");
      return;
    }

    setUploading(true);
    setActionError("");
    setActionSuccess("");
    try {
      for (const file of uploadFiles) {
        const formData = new FormData();
        formData.append("tipo", selectedTipo);
        formData.append("file", file);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(folio)}/archivos`,
          { method: "POST", body: formData }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo cargar el archivo.");
        }
      }
      setUploadFiles([]);
      setActionSuccess("Archivo(s) cargado(s) correctamente.");
      await refreshCurrentExpediente();
    } catch (err) {
      setActionError(err.message || "No se pudo cargar el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteArchivo = async (fileId) => {
    if (!fileId) return;
    const confirmDelete = window.confirm("¿Eliminar este archivo del expediente?");
    if (!confirmDelete) return;

    setActionError("");
    setActionSuccess("");
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/expedientes/archivos/${fileId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar el archivo.");
      }
      setActionSuccess("Archivo eliminado.");
      await refreshCurrentExpediente();
    } catch (err) {
      setActionError(err.message || "No se pudo eliminar el archivo.");
    }
  };

  const handleDownloadZip = () => {
    const folio = expediente?.expediente?.reporte_siniestro;
    if (!folio) return;
    const url = `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(folio)}/download`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AppHeader
            title="Expedientes"
            subtitle="Consulta de archivos por reporte/siniestro."
            showSearch={false}
            actions={
              <div className="flex items-center gap-2">
                <input
                  className="w-64 bg-surface-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="Reporte / Siniestro"
                  value={reporte}
                  onChange={(event) => setReporte(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                />
                <button
                  className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold"
                  type="button"
                  onClick={handleSearch}
                >
                  Buscar
                </button>
              </div>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="bg-surface-dark border border-border-dark rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Expedientes registrados</h3>
                <span className="text-xs text-slate-400">{expedientes.length} resultados</span>
              </div>
              {listError ? <p className="text-sm text-alert-red mb-3">{listError}</p> : null}
              {loadingList ? <p className="text-sm text-slate-400">Cargando lista...</p> : null}
              {!loadingList && expedientes.length === 0 ? (
                <p className="text-sm text-slate-400">No hay expedientes para mostrar.</p>
              ) : null}
              {!loadingList && expedientes.length ? (
                <div className="overflow-hidden border border-border-dark rounded-lg">
                  <table className="w-full text-left">
                    <thead className="bg-background-dark/60">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Reporte / Siniestro
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Archivos
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Última actividad
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {expedientes.map((item) => (
                        <tr key={item.id} className="border-t border-border-dark/60">
                          <td className="px-4 py-3 text-xs text-white font-semibold">
                            {item.reporte_siniestro}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            {item.archivos_total || 0}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {item.ultima_actividad || item.created_at || "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              className="text-primary text-xs font-bold hover:underline"
                              type="button"
                              onClick={() => {
                                setReporte(item.reporte_siniestro || "");
                                openExpediente(item.reporte_siniestro);
                              }}
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}
            {loading ? <p className="text-sm text-slate-400">Cargando expediente...</p> : null}
            {!loading && expediente ? (
              <div className="bg-surface-dark border border-border-dark rounded-xl p-6 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Expediente {expediente.expediente?.reporte_siniestro}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Creado: {expediente.expediente?.created_at || "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="bg-surface-dark border border-border-dark hover:border-primary/60 text-white px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                      onClick={() => setDetailView("grid")}
                      title="Vista mosaico"
                    >
                      <span className={`material-symbols-outlined text-base ${detailView === "grid" ? "text-primary" : "text-slate-400"}`}>
                        grid_view
                      </span>
                    </button>
                    <button
                      type="button"
                      className="bg-surface-dark border border-border-dark hover:border-primary/60 text-white px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                      onClick={() => setDetailView("list")}
                      title="Vista lista"
                    >
                      <span className={`material-symbols-outlined text-base ${detailView === "list" ? "text-primary" : "text-slate-400"}`}>
                        view_list
                      </span>
                    </button>
                    <button
                      className="bg-primary hover:bg-primary/90 text-white px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1"
                      type="button"
                      onClick={handleDownloadZip}
                    >
                      <span className="material-symbols-outlined text-base">download</span>
                      Descargar .zip
                    </button>
                  </div>
                </div>

                <div className="bg-background-dark/30 border border-border-dark rounded-lg p-4">
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
                    <div className="xl:col-span-3">
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-1">
                        Tipo de archivo
                      </label>
                      <select
                        className="w-full bg-surface-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={selectedTipo}
                        onChange={(event) => setSelectedTipo(event.target.value)}
                      >
                        {fileTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="xl:col-span-7">
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-1">
                        Seleccionar archivos
                      </label>
                      <input
                        type="file"
                        multiple
                        className="w-full bg-surface-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <button
                        type="button"
                        onClick={handleUploadToExpediente}
                        disabled={uploading}
                        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-3 py-2 rounded-lg text-sm font-bold"
                      >
                        {uploading ? "Cargando..." : "Agregar"}
                      </button>
                    </div>
                  </div>
                  {actionError ? <p className="text-xs text-alert-red mt-2">{actionError}</p> : null}
                  {actionSuccess ? <p className="text-xs text-alert-green mt-2">{actionSuccess}</p> : null}
                </div>

                {archivos.length === 0 ? <p className="text-sm text-slate-400">No hay archivos registrados.</p> : null}

                {archivos.length && detailView === "list" ? (
                  <div className="overflow-hidden border border-border-dark rounded-lg">
                    <table className="w-full text-left">
                      <thead className="bg-background-dark/60">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Tipo
                          </th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Archivo
                          </th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Fecha
                          </th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {archivos.map((file) => (
                          <tr key={file.id} className="border-t border-border-dark/60">
                            <td className="px-4 py-3 text-xs text-slate-300">{file.tipo}</td>
                            <td className="px-4 py-3 text-xs text-slate-200">{file.archivo_nombre || file.archivo_path}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{file.created_at || "-"}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-3">
                                {file.archivo_path ? (
                                  <a
                                    className="text-primary text-xs font-bold hover:underline"
                                    href={fileUrl(file)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Descargar
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  className="text-alert-red text-xs font-bold hover:underline"
                                  onClick={() => handleDeleteArchivo(file.id)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {detailView === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {archivos.map((file) => (
                      <div key={file.id} className="bg-background-dark/40 border border-border-dark rounded-lg overflow-hidden">
                        <div className="aspect-video bg-background-dark/70 flex items-center justify-center">
                          {isImageFile(file) ? (
                            <img src={fileUrl(file)} alt={file.archivo_nombre || "archivo"} className="w-full h-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-3xl text-slate-500">insert_drive_file</span>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400">{file.tipo}</p>
                          <p className="text-xs text-slate-200 line-clamp-2 min-h-8">{file.archivo_nombre || file.archivo_path}</p>
                          <div className="flex items-center justify-between">
                            <a
                              className="text-primary text-xs font-bold hover:underline"
                              href={fileUrl(file)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver
                            </a>
                            <button
                              type="button"
                              className="text-alert-red text-xs font-bold hover:underline"
                              onClick={() => handleDeleteArchivo(file.id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
