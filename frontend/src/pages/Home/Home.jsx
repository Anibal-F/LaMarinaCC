import { useState } from "react";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import RPAExecutor from "../../components/RPAExecutor.jsx";
import QualitasIndicators from "../../components/QualitasIndicators.jsx";

export default function Home() {
  const [activeView, setActiveView] = useState("local"); // "local" | "qualitas"
  const [isUpdating, setIsUpdating] = useState(false);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            showSearch
            searchPlaceholder="Buscar OT, Vehículo o Cliente..."
            actions={
              <>
                <RPAExecutor />
                <div className="h-8 w-[1px] bg-border-dark mx-2"></div>
                <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10">
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nueva OT
                </button>
                <div className="h-8 w-[1px] bg-border-dark mx-2"></div>
              </>
            }
            rightExtras={
              <button className="p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all">
                <span className="material-symbols-outlined">grid_view</span>
              </button>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {/* Switch de vistas */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-surface-dark border border-border-dark rounded-lg p-1">
                <button
                  onClick={() => setActiveView("local")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    activeView === "local"
                      ? "bg-primary text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">home_repair_service</span>
                  Taller
                </button>
                <button
                  onClick={() => setActiveView("qualitas")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
                    activeView === "qualitas"
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <img src="/assets/Qualitas_profile.jpg" alt="Qualitas" className="w-5 h-5 rounded object-cover" />
                  Qualitas
                </button>
              </div>

              {isUpdating && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <span className="material-symbols-outlined animate-spin">refresh</span>
                  Actualizando datos...
                </div>
              )}
            </div>

            {/* Contenido según vista activa */}
            {activeView === "local" ? (
              // Vista Local - Indicadores del Taller
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      OTs Activas
                    </span>
                    <span className="material-symbols-outlined text-primary text-xl">directions_car</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">42</span>
                    <span className="text-xs font-bold text-alert-green">+12%</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-alert-red/30 p-5 rounded-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-alert-red/5 pointer-events-none"></div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-alert-red uppercase tracking-widest">
                      OTs Atrasadas
                    </span>
                    <span className="material-symbols-outlined text-alert-red text-xl">timer_off</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">08</span>
                    <span className="text-xs font-bold text-alert-red">-4%</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Listas para Entrega
                    </span>
                    <span className="material-symbols-outlined text-alert-green text-xl">check_circle</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">15</span>
                    <span className="text-xs font-bold text-slate-400">Estable</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Tiempo Promedio
                    </span>
                    <span className="material-symbols-outlined text-slate-400 text-xl">schedule</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">4.2</span>
                    <span className="text-xs font-medium text-slate-400">Días</span>
                  </div>
                </div>
                <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Alertas Críticas
                    </span>
                    <span className="material-symbols-outlined text-alert-amber text-xl">warning</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">03</span>
                    <span className="text-xs font-bold text-alert-amber">Alta</span>
                  </div>
                </div>
              </div>
            ) : (
              // Vista Qualitas - Indicadores de Qualitas
              <QualitasIndicators onRefresh={setIsUpdating} />
            )}

            {/* Resto del contenido (Kanban, etc) - solo visible en vista local */}
            {activeView === "local" && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">view_kanban</span>
                      Flujo Operativo
                    </h2>
                    <div className="flex gap-2">
                      <button className="text-xs font-bold bg-surface-dark text-slate-300 px-3 py-1.5 rounded border border-border-dark hover:text-white transition-colors">
                        Filtros
                      </button>
                      <button className="text-xs font-bold bg-surface-dark text-slate-300 px-3 py-1.5 rounded border border-border-dark hover:text-white transition-colors">
                        Vista Compacta
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-slate-500"></span>
                          Recepción (4)
                        </span>
                        <span className="material-symbols-outlined text-slate-500 cursor-pointer">more_horiz</span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all cursor-grab active:cursor-grabbing overflow-hidden">
                        <div className="status-strip bg-alert-green"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4405</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 2h</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Toyota Hilux 2023</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Robert Henderson</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-background-dark rounded">
                            NORMAL
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">0 Días</span>
                        </div>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-green"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4404</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 4h</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">BMW 320i M-Sport</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Alice Thompson</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-background-dark rounded">
                            NORMAL
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">0 Días</span>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-blue-500"></span>
                          Valuación (2)
                        </span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-amber"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4398</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 1d</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Ford Raptor F-150</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Sierra Logistics</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-alert-amber px-2 py-0.5 bg-alert-amber/10 rounded">
                            PRESUPUESTO PENDIENTE
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">1 Día</span>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-primary"></span>
                          Taller (8)
                        </span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-red"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4390</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 5d</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Honda Civic Type-R</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Sarah Smith</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-alert-red px-2 py-0.5 bg-alert-red/10 rounded">
                            RETRASO: REFACCIONES
                          </span>
                          <span className="text-[10px] font-bold text-alert-red">5 Días</span>
                        </div>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-green"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4392</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 3d</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Nissan Patrol</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: James O'Connor</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-background-dark rounded">
                            EN PROCESO
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">3 Días</span>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-purple-500"></span>
                          Pintura (3)
                        </span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-green"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4385</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 6d</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Mazda CX-5 Pearl</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Pat Glen</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 bg-background-dark rounded">
                            ACABADO
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">6 Días</span>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-orange-500"></span>
                          Control Calidad (5)
                        </span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden">
                        <div className="status-strip bg-alert-amber"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4370</span>
                          <span className="text-[10px] font-medium text-slate-500">hace 8d</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Chevy Silverado</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Alex Hall</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-alert-amber px-2 py-0.5 bg-alert-amber/10 rounded">
                            REPROCESO REQ
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">8 Días</span>
                        </div>
                      </div>
                    </div>
                    <div className="kanban-column flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="size-2 rounded-full bg-alert-green"></span>
                          Listas (15)
                        </span>
                      </div>
                      <div className="relative bg-surface-dark border border-border-dark p-4 rounded-lg group hover:border-primary transition-all overflow-hidden opacity-80">
                        <div className="status-strip bg-alert-green"></div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[11px] font-bold text-primary">OT #4350</span>
                          <span className="text-[10px] font-medium text-slate-500">Listo</span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">Tesla Model 3</p>
                        <p className="text-[11px] text-slate-400 mb-3">Cliente: Elon M.</p>
                        <div className="flex items-center justify-between border-t border-border-dark/50 pt-3 mt-1">
                          <span className="text-[10px] font-bold text-alert-green px-2 py-0.5 bg-alert-green/10 rounded">
                            LISTO ENTREGA
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">4 Días</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
                  <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-alert-red">notification_important</span>
                      Centro de Acción y Tareas Pendientes
                    </h2>
                    <div className="bg-surface-dark border border-border-dark rounded-xl divide-y divide-border-dark overflow-hidden">
                      <div className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="size-8 rounded-full bg-alert-red/20 flex items-center justify-center text-alert-red">
                            <span className="material-symbols-outlined text-xl">payments</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Presupuesto no aprobado - OT #4402</p>
                            <p className="text-xs text-slate-400">
                              Toyota Corolla | Esperando autorización de aseguradora por 48h+
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider">
                            Contactar Aseguradora
                          </button>
                          <button className="px-3 py-1.5 bg-surface-dark border border-border-dark text-slate-400 text-[10px] font-bold rounded uppercase tracking-wider">
                            Descartar
                          </button>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="size-8 rounded-full bg-alert-amber/20 flex items-center justify-center text-alert-amber">
                            <span className="material-symbols-outlined text-xl">shopping_cart</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Esperando Refacciones - OT #4390</p>
                            <p className="text-xs text-slate-400">Facia delantera - ETA: Sept 24</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider">
                            Ver Orden
                          </button>
                          <button className="px-3 py-1.5 bg-surface-dark border border-border-dark text-slate-400 text-[10px] font-bold rounded uppercase tracking-wider">
                            Actualizar ETA
                          </button>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="size-8 rounded-full bg-alert-green/20 flex items-center justify-center text-alert-green">
                            <span className="material-symbols-outlined text-xl">fact_check</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">Control de Calidad Final - OT #4385</p>
                            <p className="text-xs text-slate-400">
                              Mazda CX-5 | Espesor de pintura verificado, limpieza interior pendiente
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider">
                            Finalizar QC
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">analytics</span>
                      Rendimiento
                    </h2>
                    <div className="space-y-4">
                      <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                        <div className="flex justify-between items-center mb-6">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                            Productividad del Taller
                          </p>
                          <span className="text-sm font-bold text-alert-green">88%</span>
                        </div>
                        <div className="h-24 flex items-end gap-1.5">
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "60%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "40%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "75%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "90%" }}
                          ></div>
                          <div className="flex-1 bg-primary rounded-t" style={{ height: "88%" }}></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "65%" }}
                          ></div>
                          <div
                            className="flex-1 bg-border-dark rounded-t hover:bg-primary/50 transition-colors"
                            style={{ height: "50%" }}
                          ></div>
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          <span>Lun</span>
                          <span>Mar</span>
                          <span>Mié</span>
                          <span>Jue</span>
                          <span>Hoy</span>
                          <span>Sáb</span>
                          <span>Dom</span>
                        </div>
                      </div>
                      <div className="bg-surface-dark border border-border-dark p-5 rounded-xl">
                        <div className="flex justify-between items-center mb-4">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                            % Entrega a Tiempo
                          </p>
                          <span className="text-sm font-bold text-white">92.4%</span>
                        </div>
                        <div className="relative pt-1">
                          <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-background-dark">
                            <div
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary"
                              style={{ width: "92.4%" }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                            <span>Meta: 90%</span>
                            <span className="text-alert-green">+2.4% vs Mes Anterior</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
