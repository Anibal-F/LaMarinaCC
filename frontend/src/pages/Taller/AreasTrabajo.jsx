import { useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const stationGroups = [
  {
    id: "paint",
    icon: "format_paint",
    iconClass: "text-violet-400",
    title: "Cabinas de Pintura",
    capacity: "3/4",
    stations: [
      {
        id: "cabina-01",
        name: "Cabina 01 - Pro",
        subtitle: "Horneado alta temp",
        status: "occupied",
        order: "OT #4385",
        vehicle: "Mazda CX-5 Pearl",
        task: "Progreso de pintura",
        progress: 65,
        tech: "Pat Glen"
      },
      {
        id: "cabina-02",
        name: "Cabina 02 - Eco",
        subtitle: "Secado ambiente",
        status: "delayed",
        order: "OT #4402",
        vehicle: "Toyota Corolla",
        task: "Progreso de pintura",
        progress: 92,
        tech: "Marco Polo",
        delay: "+45m"
      },
      {
        id: "cabina-03",
        name: "Cabina 03 - Detail",
        subtitle: "Detallado final",
        status: "occupied",
        order: "OT #4398",
        vehicle: "Ford Raptor F-150",
        task: "Barnizado",
        progress: 15,
        tech: "Juan Lopez"
      },
      {
        id: "cabina-04",
        name: "Cabina 04",
        subtitle: "Disponible para asignacion",
        status: "free"
      }
    ]
  },
  {
    id: "body",
    icon: "construction",
    iconClass: "text-blue-400",
    title: "Bancos de Enderezado",
    capacity: "2/2",
    stations: [
      {
        id: "banco-a",
        name: "Banco Hidraulico A",
        subtitle: "Estructura pesada",
        status: "occupied",
        order: "OT #4405",
        vehicle: "Toyota Hilux 2023",
        task: "Enderezado chasis",
        progress: 40,
        tech: "Robert Henderson"
      },
      {
        id: "banco-b",
        name: "Banco Hidraulico B",
        subtitle: "Estructura ligera",
        status: "occupied",
        order: "OT #4404",
        vehicle: "BMW 320i M-Sport",
        task: "Alineacion",
        progress: 85,
        tech: "Alice Thompson"
      }
    ]
  },
  {
    id: "detail",
    icon: "auto_fix_high",
    iconClass: "text-amber-400",
    title: "Estaciones de Detallado",
    capacity: "1/6",
    stations: [
      {
        id: "bahia-01",
        name: "Bahia 01",
        subtitle: "Pulido y encerado",
        status: "occupied",
        order: "OT #4350",
        vehicle: "Tesla Model 3",
        task: "Pulido exterior",
        progress: 20,
        tech: "Elon M."
      },
      { id: "bahia-02", name: "Bahia 02", subtitle: "Disponible para asignacion", status: "free" },
      { id: "bahia-03", name: "Bahia 03", subtitle: "Disponible para asignacion", status: "free" },
      { id: "bahia-04", name: "Bahia 04", subtitle: "Disponible para asignacion", status: "free" }
    ]
  }
];

function statusBadge(status) {
  if (status === "delayed") return "bg-alert-red text-white";
  if (status === "occupied") return "bg-alert-green/20 text-alert-green";
  return "bg-slate-500/20 text-slate-300";
}

export default function AreasTrabajo() {
  const [viewMode, setViewMode] = useState("malla");

  const totals = useMemo(() => {
    let occupied = 0;
    let free = 0;
    stationGroups.forEach((group) => {
      group.stations.forEach((station) => {
        if (station.status === "free") free += 1;
        else occupied += 1;
      });
    });
    return { occupied, free };
  }, []);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            showSearch
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
                <button className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nueva OT
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
                      <span>Gestión de Taller</span>
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                      <span className="text-primary font-semibold">Áreas de Trabajo</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Áreas de Trabajo</h2>
                  </div>
                  <div className="px-4 py-2 bg-surface-dark border border-border-dark rounded-lg flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-alert-green animate-pulse"></span>
                      <span>
                        <span className="font-bold text-white">{String(totals.occupied).padStart(2, "0")}</span> Ocupadas
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-slate-500"></span>
                      <span>
                        <span className="font-bold text-white">{String(totals.free).padStart(2, "0")}</span> Libres
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Eficiencia global</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">88.4%</span>
                      <span className="text-xs text-alert-green font-bold mb-1">+2.4%</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Tiempo promedio</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">4.2</span>
                      <span className="text-xs text-slate-400 mb-1">Dias/Vehiculo</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Listos hoy</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">05</span>
                      <span className="text-xs text-slate-400 mb-1">Entregas programadas</span>
                    </div>
                  </article>
                  <article className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Retrasos criticos</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-black text-white">03</span>
                      <span className="text-xs text-alert-red mb-1 font-bold">Accion requerida</span>
                    </div>
                  </article>
                </div>

                {stationGroups.map((group) => (
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

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
                              <button className="text-[10px] uppercase font-bold border border-border-dark px-3 py-1 rounded-full text-slate-300 hover:text-white hover:border-primary transition-colors">
                                Asignar OT
                              </button>
                            </div>
                          ) : (
                            <div className="p-4 space-y-3">
                              <div className="flex items-center gap-3">
                                <div className="size-9 rounded-lg bg-background-dark border border-border-dark flex items-center justify-center text-slate-500">
                                  <span className="material-symbols-outlined text-sm">directions_car</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] text-slate-400 font-bold">{station.order}</p>
                                  <p className="text-sm font-bold text-white truncate">{station.vehicle}</p>
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
                                <span>Tecnico: <span className="text-white font-semibold">{station.tech}</span></span>
                                {station.delay ? <span className="text-alert-red font-bold">{station.delay}</span> : null}
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
                    {[60, 45, 88, 55, 40].map((height, idx) => (
                      <div key={`bar-${idx}`} className="flex-1 rounded-t bg-background-dark relative overflow-hidden">
                        <div
                          className={`absolute bottom-0 left-0 w-full rounded-t ${idx === 2 ? "bg-primary" : "bg-slate-600"}`}
                          style={{ height: `${height}%` }}
                        ></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-bold">
                    <span>L</span><span>M</span><span className="text-primary">M</span><span>J</span><span>V</span>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-alert-red">bolt</span>
                    Accion Requerida
                  </h3>
                  <article className="p-3 rounded-xl border border-alert-red/30 bg-alert-red/10">
                    <p className="text-xs font-bold text-alert-red">Retraso en Cabina 02</p>
                    <p className="text-[11px] text-slate-300 mt-1">Falta componente de mezcla para pintura tricapa.</p>
                    <button className="mt-3 w-full py-1.5 rounded-lg bg-alert-red text-white text-[10px] font-bold uppercase">Notificar almacen</button>
                  </article>
                  <article className="p-3 rounded-xl border border-alert-amber/30 bg-alert-amber/10">
                    <p className="text-xs font-bold text-alert-amber">Mantenimiento Banco A</p>
                    <p className="text-[11px] text-slate-300 mt-1">Programado para manana 08:00 AM. Evitar OTs pesadas.</p>
                  </article>
                </section>

                <section className="bg-surface-dark border border-border-dark rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Proximas entregas</p>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">BMW 320i M-Sport</p>
                        <p className="text-slate-500">Hoy, 16:30</p>
                      </div>
                      <span className="text-slate-500 font-bold">OT#4404</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white">Toyota Hilux</p>
                        <p className="text-slate-500">Manana, 10:00</p>
                      </div>
                      <span className="text-slate-500 font-bold">OT#4405</span>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
