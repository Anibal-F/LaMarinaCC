import { useEffect, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

export default function CatalogoExpedientes() {
  const [reporte, setReporte] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [expediente, setExpediente] = useState(null);
  const [expedientes, setExpedientes] = useState([]);

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
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Expediente {expediente.expediente?.reporte_siniestro}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Creado: {expediente.expediente?.created_at || "-"}
                  </p>
                </div>
                {archivos.length === 0 ? (
                  <p className="text-sm text-slate-400">No hay archivos registrados.</p>
                ) : (
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
                            <td className="px-4 py-3 text-xs text-slate-200">
                              {file.archivo_nombre || file.archivo_path}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {file.created_at || "-"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {file.archivo_path ? (
                                <a
                                  className="text-primary text-xs font-bold hover:underline"
                                  href={`${import.meta.env.VITE_API_URL}${file.archivo_path}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Descargar
                                </a>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
