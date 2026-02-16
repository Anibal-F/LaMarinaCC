import { useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

export default function CatalogoExpedientes() {
  const [reporte, setReporte] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expediente, setExpediente] = useState(null);

  const handleSearch = async () => {
    if (!reporte.trim()) {
      setError("Escribe un reporte/siniestro.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(reporte.trim())}`
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
