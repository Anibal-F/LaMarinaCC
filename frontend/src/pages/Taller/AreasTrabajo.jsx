import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function statusBadge(status) {
  if (status === "delayed") return "bg-alert-red text-white";
  if (status === "occupied") return "bg-alert-green/20 text-alert-green";
  return "bg-slate-500/20 text-slate-300";
}

export default function AreasTrabajo() {
  const [viewMode, setViewMode] = useState("malla");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState({ areas: [], totals: { occupied: 0, free: 0, stations: 0, delayed: 0 } });

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/dashboard/areas-trabajo`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el tablero de areas.");
      }
      const payload = await response.json();
      setDashboard({
        areas: Array.isArray(payload?.areas) ? payload.areas : [],
        totals: payload?.totals || { occupied: 0, free: 0, stations: 0, delayed: 0 }
      });
    } catch (err) {
      setError(err.message || "No se pudo cargar el tablero de areas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const filteredAreas = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return dashboard.areas;
    return dashboard.areas
      .map((area) => ({
        ...area,
        stations: area.stations.filter((station) => {
          return [area.title, station.name, station.vehicle, station.tech, station.order]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalized));
        })
      }))
      .filter((area) => area.stations.length > 0 || String(area.title).toLowerCase().includes(normalized));
  }, [dashboard.areas, query]);

  const occupiedRate = useMemo(() => {
    if (!dashboard.totals.stations) return 0;
    return Math.round((dashboard.totals.occupied / dashboard.totals.stations) * 1000) / 10;
  }, [dashboard.totals]);

  const averageProgress = useMemo(() => {
    const allStations = filteredAreas.flatMap((area) => area.stations || []).filter((station) => station.status !== "free");
    if (!allStations.length) return 0;
    return Math.round(allStations.reduce((sum, station) => sum + Number(station.progress || 0), 0) / allStations.length);
  }, [filteredAreas]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            showSearch
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar OT, vehiculo o tecnico..."
            actions={
              <>
                <div className="flex items-center gap-1 bg-surface-dark border border-border-dark p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setViewMode("malla")}
                    className={`px-3 py-1.5 text-xs font-bold rounded ${
                      viewMode === "malla" ? "bg-background-dark text-white" : "text-slate-400"
                    }`}
                  >
                    Malla
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("lista")}
                    className={`px-3 py-1.5 text-xs font-bold rounded ${
                      viewMode === "lista" ? "bg-background-dark text-white" : "text-slate-400"
                    }`}
                  >
                    Lista
                  </button>
                </div>
                <button
                  type="button"
                  onClick={loadDashboard}
                  className="bg-surface-dark hover:bg-primary/20 text-white p-2.5 rounded-lg border border-border-dark transition-colors"
                  title="Actualizar tablero"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <section className="xl:col-span-9 space-y-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <span>Gestion de Taller</span>
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                      <span className="text-primary font-semibold">Areas de Trabajo</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Areas de Trabajo</h2>
                  </div>
                  <div className="px-4 py-2 bg-surface-dark border border-border-dark rounded-lg flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-alert-green animate-pulse"></span>
                      <span>
                        <span className="font-bold text-white">{String(dashboard.totals.occupied).padStart(2, "0")}</span> Ocupadas
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-slate-500"></span>
                      <span>
                        <span className="font-bold text-white">{String(dashboard.totals.free).padStart(2, "0")}</span> Libres
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Eficiencia global</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{occupiedRate}%</span>
                      <span className="text-xs text-alert-green font-bold mb-1">ocupacion</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Tiempo promedio</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{averageProgress}</span>
                      <span className="text-xs text-slate-400 mb-1">% progreso</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Estaciones</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{String(dashboard.totals.stations).padStart(2, "0")}</span>
                      <span className="text-xs text-slate-400 mb-1">activas</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Retrasos criticos</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{String(dashboard.totals.delayed).padStart(2, "0")}</span>
                      <span className="text-xs text-alert-red mb-1 font-bold">accion requerida</span>
                    </div>
                  </article>
                </div>

                {error ? <p className="text-sm text-alert-red">{error}</p> : null}

                {loading ? (
                  <div className="rounded-xl border border-border-dark bg-surface-dark p-5 text-sm text-slate-400">
                    Cargando areas de trabajo...
                  </div>
                ) : null}

                {!loading && filteredAreas.map((group) => (
                  <div key={group.id} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className={`material-symbols-outlined ${group.iconClass}`}>{group.icon}</span>
                        {group.title}
                      </h3>
                      <span className="px-2 py-0.5 bg-surface-dark border border-border-dark rounded text-[10px] font-bold text-slate-500 uppercase">
                        Capacidad: {group.capacity}
                      </span>
                    </div>

                    <div className={`grid gap-4 ${viewMode === "lista" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"}`}>
                      {group.stations.map((station) => (
                        <article
                          key={station.id}
                          className={`rounded-xl border overflow-hidden ${
                            station.status === "delayed"
                              ? "bg-surface-dark border-alert-red/40"
                              : "bg-surface-dark border-border-dark"
                          }`}
                        >
                          <div className="p-3 border-b border-border-dark flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-white">{station.name}</p>
                              <p className="text-[10px] text-slate-500 uppercase">{station.subtitle}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusBadge(station.status)}`}>
                              {station.status === "occupied" ? "OCUPADO" : station.status === "delayed" ? "RETRASADO" : "LIBRE"}
                            </span>
                          </div>

                          {station.status === "free" ? (
                            <div className="p-6 text-center">
                              <div className="mx-auto mb-3 size-11 rounded-full border border-border-dark bg-background-dark flex items-center justify-center text-slate-500">
                                <span className="material-symbols-outlined">add</span>
                              </div>
                              <p className="text-xs text-slate-500 mb-3">Disponible para asignacion</p>
                            </div>
                          ) : (
                            <div className="p-4 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-lg bg-background-dark border border-border-dark flex items-center justify-center text-slate-500">
                                  <span className="material-symbols-outlined text-sm">directions_car</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] text-slate-400 font-bold">{station.order}</p>
                                  <p className="text-sm font-bold text-white truncate">{station.vehicle || "Vehiculo asignado"}</p>
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
                                  <span className="text-slate-500">{station.task}</span>
                                  <span className={station.status === "delayed" ? "text-alert-red" : "text-alert-green"}>{station.progress}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-background-dark overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${station.status === "delayed" ? "bg-alert-red" : "bg-alert-green"}`}
                                    style={{ width: `${station.progress}%` }}
                                  ></div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>
                                  Tecnico: <span className="text-white font-semibold">{station.tech || "Sin asignar"}</span>
                                </span>
                                {station.status === "delayed" ? <span className="text-alert-red font-bold">Atencion</span> : null}
                              </div>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              <aside className="hidden xl:block xl:col-span-3 space-y-6">
                <section className="bg-surface-dark border border-border-dark rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">insights</span>
                    Rendimiento de Hoy
                  </h3>
                  <div className="h-32 flex items-end gap-2">
                    {[dashboard.totals.occupied, dashboard.totals.free, dashboard.totals.stations, dashboard.totals.delayed, averageProgress].map((value, idx) => {
                      const maxValue = Math.max(dashboard.totals.stations || 1, 100);
                      const height = Math.max(10, Math.round((Number(value || 0) / maxValue) * 100));
                      return (
                        <div key={`bar-${idx}`} className="flex-1 rounded-t bg-background-dark relative overflow-hidden">
                          <div
                            className={`absolute bottom-0 left-0 w-full rounded-t ${idx === 4 ? "bg-primary" : "bg-slate-600"}`}
                            style={{ height: `${height}%` }}
                          ></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-bold">
                    <span>O</span><span>L</span><span>E</span><span>R</span><span>P</span>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-alert-red">bolt</span>
                    Accion Requerida
                  </h3>
                  <article className="p-3 rounded-xl border border-alert-red/30 bg-alert-red/10">
                    <p className="text-xs font-bold text-alert-red">Retrasos detectados</p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {dashboard.totals.delayed} estaciones requieren seguimiento inmediato.
                    </p>
                  </article>
                  <article className="p-3 rounded-xl border border-alert-amber/30 bg-alert-amber/10">
                    <p className="text-xs font-bold text-alert-amber">Capacidad disponible</p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {dashboard.totals.free} estaciones libres para nuevas asignaciones.
                    </p>
                  </article>
                </section>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
