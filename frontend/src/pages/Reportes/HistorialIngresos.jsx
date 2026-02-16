import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";

export default function HistorialIngresos() {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/reportes/historial`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los registros");
        }
        const payload = await response.json();
        setEntries(payload);
      } catch (err) {
        setError(err.message || "No se pudieron cargar los registros");
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return entries;

    return entries.filter((row) =>
      [
        row.folio_recep,
        row.folio_seguro,
        row.folio_ot,
        row.nb_cliente,
        row.tel_cliente,
        row.marca_vehiculo,
        row.modelo_vehiculo,
        row.placas
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [entries, query]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Historial de Ingresos</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar por folios, cliente, placas..."
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <div className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-dark/50">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Fecha seguro</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Fecha recepción</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Folio seguro</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Folio recepción</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Folio OT</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Cliente</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Teléfono</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Seguro</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Marca</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Modelo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Tipo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Color</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Placas</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Kilometraje</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Nivel gas</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Estado mecánico</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Observaciones</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Entrega estimada</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Estatus</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">Fecha entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-slate-300">{row.fecha_seguro || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.fecha_recep || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.folio_seguro || "-"}</td>
                      <td className="px-4 py-3 text-sm text-primary font-bold">{row.folio_recep || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.folio_ot || "-"}</td>
                      <td className="px-4 py-3 text-sm text-white font-semibold">{row.nb_cliente || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.tel_cliente || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.seguro || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.marca_vehiculo || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.modelo_vehiculo || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.tipo_carroceria || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.color || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.placas || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.kilometraje || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.nivel_gas || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.estado_mecanico || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.observaciones || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.fecha_entregaestim || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.estatus || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.fecha_entrega || "-"}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={20}>
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {filtered.length} de {entries.length} registros</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
