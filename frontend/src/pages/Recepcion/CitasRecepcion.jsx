import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const STATUS_OPTIONS = [
  "Programada",
  "Confirmada",
  "Reprogramada",
  "En espera",
  "Demorada",
  "Cancelada",
  "Completada",
  "No show"
];

const STATUS_STYLES = {
  Programada: "bg-alert-amber/20 text-alert-amber border-alert-amber/40",
  Confirmada: "bg-primary/20 text-primary border-primary/40",
  Reprogramada: "bg-sky-500/20 text-sky-300 border-sky-400/40",
  "En espera": "bg-amber-500/20 text-amber-300 border-amber-400/40",
  Demorada: "bg-orange-500/20 text-orange-300 border-orange-400/40",
  Cancelada: "bg-alert-red/20 text-alert-red border-alert-red/40",
  Completada: "bg-alert-green/20 text-alert-green border-alert-green/40",
  "No show": "bg-slate-500/20 text-slate-300 border-slate-400/40"
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function humanDateLabel(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

function monthLabel(date) {
  return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toYmd(start), end: toYmd(end) };
}

function buildCalendarCells(activeMonthDate) {
  const firstOfMonth = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), 1);
  const lastOfMonth = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1, 0);
  const startOffset = firstOfMonth.getDay();
  const totalDays = lastOfMonth.getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    const d = new Date(firstOfMonth);
    d.setDate(d.getDate() - (startOffset - i));
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const d = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), day);
    cells.push({ date: d, inMonth: true, ymd: toYmd(d) });
  }

  while (cells.length < 42) {
    const d = new Date(lastOfMonth);
    d.setDate(d.getDate() + (cells.length - (startOffset + totalDays) + 1));
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }

  return cells;
}

export default function CitasRecepcion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId");

  const [orders, setOrders] = useState([]);
  const [citas, setCitas] = useState([]);
  const [resumenByDate, setResumenByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [viewMode, setViewMode] = useState("Mes");
  const [search, setSearch] = useState("");
  const [monthAnimKey, setMonthAnimKey] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    orden_admision_id: "",
    fecha_cita: toYmd(new Date()),
    hora_cita: "09:00",
    estado: "Programada",
    notas: ""
  });

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/ordenes`);
        if (!response.ok) throw new Error("No se pudieron cargar órdenes.");
        const payload = await response.json();
        setOrders(payload || []);
      } catch (err) {
        setError(err.message || "No se pudieron cargar órdenes.");
      }
    };
    loadOrders();
  }, []);

  useEffect(() => {
    const loadCitas = async () => {
      const { start, end } = monthRange(monthCursor);
      try {
        setLoading(true);
        setError("");
        const [citasRes, resumenRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas?from=${start}&to=${end}`),
          fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/resumen?from=${start}&to=${end}`)
        ]);
        if (!citasRes.ok) throw new Error("No se pudieron cargar citas.");
        if (!resumenRes.ok) throw new Error("No se pudo cargar resumen de citas.");
        const citasPayload = await citasRes.json();
        const resumenPayload = await resumenRes.json();
        setCitas(citasPayload || []);
        setResumenByDate(
          Object.fromEntries((resumenPayload || []).map((item) => [String(item.fecha_cita), item]))
        );
      } catch (err) {
        setError(err.message || "No se pudieron cargar citas.");
      } finally {
        setLoading(false);
      }
    };
    loadCitas();
    setMonthAnimKey((value) => value + 1);
  }, [monthCursor]);

  useEffect(() => {
    if (!preselectedOrderId || !orders.length) return;
    const match = orders.find((item) => String(item.id) === String(preselectedOrderId));
    if (!match) return;
    setIsModalOpen(true);
    setEditingId(null);
    setForm((prev) => ({
      ...prev,
      orden_admision_id: String(match.id),
      fecha_cita: selectedDate || toYmd(new Date())
    }));
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("orderId");
      return next;
    });
  }, [preselectedOrderId, orders, selectedDate, setSearchParams]);

  const calendarCells = useMemo(() => buildCalendarCells(monthCursor), [monthCursor]);

  const citasDelDia = useMemo(
    () =>
      citas
        .filter((item) => String(item.fecha_cita).slice(0, 10) === selectedDate)
        .filter((item) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return [item.nb_cliente, item.reporte_siniestro, item.placas, item.marca_vehiculo, item.tipo_vehiculo]
            .map((val) => String(val || "").toLowerCase())
            .some((val) => val.includes(q));
        })
        .sort((a, b) => String(a.hora_cita).localeCompare(String(b.hora_cita))),
    [citas, selectedDate, search]
  );

  const monthTotals = useMemo(() => {
    const today = toYmd(new Date());
    let pendientes = 0;
    let completadas = 0;
    let canceladas = 0;
    let citasHoy = 0;

    citas.forEach((item) => {
      const estado = String(item.estado || "");
      const fecha = String(item.fecha_cita || "").slice(0, 10);
      if (["Programada", "Confirmada", "Reprogramada", "En espera", "Demorada"].includes(estado)) pendientes += 1;
      if (estado === "Completada") completadas += 1;
      if (estado === "Cancelada") canceladas += 1;
      if (fecha === today) citasHoy += 1;
    });

    const totalActivas = citas.length - canceladas;
    const capacidadMes = 26 * 6;
    const ocupacion = capacidadMes ? Math.round((totalActivas / capacidadMes) * 100) : 0;

    return {
      citasHoy,
      pendientes,
      completadas,
      canceladas,
      ocupacion
    };
  }, [citas]);

  const openNewModal = (dateYmd) => {
    setEditingId(null);
    setForm({
      orden_admision_id: "",
      fecha_cita: dateYmd || selectedDate || toYmd(new Date()),
      hora_cita: "09:00",
      estado: "Programada",
      notas: ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (cita) => {
    setEditingId(cita.id);
    setForm({
      orden_admision_id: String(cita.orden_admision_id || ""),
      fecha_cita: String(cita.fecha_cita || "").slice(0, 10),
      hora_cita: String(cita.hora_cita || "").slice(0, 5),
      estado: cita.estado || "Programada",
      notas: cita.notas || ""
    });
    setIsModalOpen(true);
  };

  const refreshMonthData = async () => {
    const { start, end } = monthRange(monthCursor);
    const [citasRes, resumenRes] = await Promise.all([
      fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas?from=${start}&to=${end}`),
      fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/resumen?from=${start}&to=${end}`)
    ]);
    if (!citasRes.ok || !resumenRes.ok) throw new Error("No se pudo refrescar agenda.");
    setCitas((await citasRes.json()) || []);
    const resumenPayload = await resumenRes.json();
    setResumenByDate(
      Object.fromEntries((resumenPayload || []).map((item) => [String(item.fecha_cita), item]))
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.orden_admision_id || !form.fecha_cita || !form.hora_cita) {
      setError("Selecciona orden, fecha y hora para guardar la cita.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const payload = {
        orden_admision_id: Number(form.orden_admision_id),
        fecha_cita: form.fecha_cita,
        hora_cita: form.hora_cita,
        estado: form.estado || "Programada",
        notas: form.notas || null
      };
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/recepcion/citas/${editingId}`
          : `${import.meta.env.VITE_API_URL}/recepcion/citas`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar la cita.");
      }
      await refreshMonthData();
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err) {
      setError(err.message || "No se pudo guardar la cita.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (citaId) => {
    if (!window.confirm("¿Eliminar esta cita?")) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/${citaId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar la cita.");
      }
      await refreshMonthData();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la cita.");
    }
  };

  const StatCard = ({ label, value, trend, trendPositive = true }) => (
    <article className="bg-surface-dark/90 border border-border-dark rounded-xl p-4 shadow-sm motion-safe:animate-[fadeUp_.35s_ease-out]">
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-black text-white">{value}</span>
        <span className={`text-[10px] font-bold ${trendPositive ? "text-alert-green" : "text-alert-red"}`}>
          {trend}
        </span>
      </div>
    </article>
  );

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInSoft {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Agenda de recepciones"
            subtitle="Control de citas para ingreso de unidades autorizadas."
            showSearch={false}
          />

          <div className="px-6 py-3 border-b border-border-dark bg-background-dark/70 backdrop-blur-sm flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 bg-surface-dark border border-border-dark p-1 rounded-lg w-fit">
              {[
                { id: "Mes", enabled: true },
                { id: "Semana", enabled: false },
                { id: "Día", enabled: false }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.enabled}
                  onClick={() => setViewMode(item.id)}
                  className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                    viewMode === item.id
                      ? "bg-primary text-white"
                      : item.enabled
                        ? "text-slate-300 hover:bg-background-dark"
                        : "text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {item.id}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                  search
                </span>
                <input
                  className="w-64 bg-surface-dark border border-border-dark rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:ring-primary focus:border-primary"
                  placeholder="Buscar cita..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                  setSelectedDate(toYmd(today));
                }}
                className="px-3 py-2 rounded-lg border border-border-dark text-xs font-bold text-slate-300 hover:text-white"
              >
                Hoy
              </button>
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold"
                type="button"
                onClick={() => openNewModal(selectedDate)}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nueva cita
              </button>
            </div>
          </div>

          <section className="grid grid-cols-2 md:grid-cols-5 gap-3 p-6 border-b border-border-dark bg-background-dark/40">
            <div className="motion-safe:animate-[fadeUp_.35s_ease-out]" style={{ animationDelay: "0ms" }}><StatCard label="Citas Hoy" value={monthTotals.citasHoy} trend="+0%" /></div>
            <div className="motion-safe:animate-[fadeUp_.35s_ease-out]" style={{ animationDelay: "40ms" }}><StatCard label="Pendientes" value={monthTotals.pendientes} trend="-0%" trendPositive={false} /></div>
            <div className="motion-safe:animate-[fadeUp_.35s_ease-out]" style={{ animationDelay: "80ms" }}><StatCard label="Completadas" value={monthTotals.completadas} trend="+0%" /></div>
            <div className="motion-safe:animate-[fadeUp_.35s_ease-out]" style={{ animationDelay: "120ms" }}><StatCard label="Canceladas" value={monthTotals.canceladas} trend="-0%" trendPositive={false} /></div>
            <div className="motion-safe:animate-[fadeUp_.35s_ease-out]" style={{ animationDelay: "160ms" }}><StatCard label="% Ocupación" value={`${monthTotals.ocupacion}%`} trend="+0%" /></div>
          </section>

          <div className="flex-1 min-h-0 grid grid-cols-12">
            <section className="col-span-12 xl:col-span-9 p-6 overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-white capitalize">{monthLabel(monthCursor)}</h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="size-9 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="size-9 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              </div>

              <div
                key={monthAnimKey}
                className="border border-border-dark rounded-xl overflow-hidden motion-safe:animate-[fadeInSoft_.22s_ease-out]"
              >
                <div className="grid grid-cols-7 bg-surface-dark/60 border-b border-border-dark">
                  {[
                    "DOM",
                    "LUN",
                    "MAR",
                    "MIÉ",
                    "JUE",
                    "VIE",
                    "SÁB"
                  ].map((label) => (
                    <div key={label} className="px-3 py-2 text-[10px] font-black tracking-widest text-slate-400 border-r border-border-dark last:border-r-0 text-center">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {calendarCells.map((cell, index) => {
                    const daySummary = resumenByDate[cell.ymd] || null;
                    const selected = selectedDate === cell.ymd;
                    const isToday = cell.ymd === toYmd(new Date());
                    const lines = [
                      { key: "pendientes", value: daySummary?.pendientes || 0, cls: "bg-primary" },
                      { key: "completadas", value: daySummary?.completadas || 0, cls: "bg-alert-green" },
                      { key: "canceladas", value: daySummary?.canceladas || 0, cls: "bg-alert-red" }
                    ].filter((line) => line.value > 0);

                    return (
                      <button
                        key={`${cell.ymd}-${index}`}
                        type="button"
                        onClick={() => setSelectedDate(cell.ymd)}
                        className={`h-28 p-2 border-r border-b border-border-dark last:border-r-0 text-left transition-all duration-200 hover:-translate-y-[1px] ${
                          selected
                            ? "bg-primary/10"
                            : cell.inMonth
                              ? "bg-background-dark hover:bg-surface-dark/40"
                              : "bg-background-dark/40 text-slate-500"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          {isToday ? (
                            <span className="size-6 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center">
                              {cell.date.getDate()}
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${cell.inMonth ? "text-white" : "text-slate-500"}`}>
                              {cell.date.getDate()}
                            </span>
                          )}
                          {daySummary?.total_citas ? (
                            <span className="text-[10px] font-black text-primary">{daySummary.total_citas}</span>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          {lines.slice(0, 3).map((line) => (
                            <div key={line.key} className={`h-1 rounded-full ${line.cls}`} />
                          ))}
                          {daySummary?.total_citas > 3 ? (
                            <p className="text-[9px] text-primary font-bold">+{daySummary.total_citas - 3} más</p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="col-span-12 xl:col-span-3 border-l border-border-dark bg-background-dark/70 flex flex-col min-h-0">
              <div className="px-5 py-4 border-b border-border-dark">
                <h4 className="text-base font-black text-white">Citas del día</h4>
                <p className="text-xs text-slate-400 capitalize">{humanDateLabel(selectedDate)}</p>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                {loading ? <p className="text-sm text-slate-400">Cargando agenda...</p> : null}
                {!loading && !citasDelDia.length ? (
                  <p className="text-sm text-slate-500">No hay citas para la fecha seleccionada.</p>
                ) : null}
                {citasDelDia.map((cita, index) => {
                  const chipClass = STATUS_STYLES[cita.estado] || "bg-slate-600/20 text-slate-300 border-slate-500/40";
                  return (
                    <article
                      key={cita.id}
                      className="bg-surface-dark border border-border-dark rounded-xl p-3 motion-safe:animate-[fadeUp_.28s_ease-out]"
                      style={{ animationDelay: `${index * 35}ms` }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${chipClass}`}>
                          {cita.estado}
                        </span>
                        <span className="text-xs font-black text-white">{String(cita.hora_cita).slice(0, 5)}</span>
                      </div>
                      <p className="text-sm font-black text-white truncate">{cita.nb_cliente || "Sin cliente"}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {cita.marca_vehiculo} {cita.tipo_vehiculo} {cita.placas ? `- ${cita.placas}` : ""}
                      </p>
                      {cita.notas ? (
                        <div className="mt-2 p-2 bg-background-dark/60 rounded text-[10px] text-slate-400 italic">
                          {cita.notas}
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(cita)}
                          className="text-xs text-slate-300 hover:text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cita.id)}
                          className="text-xs text-alert-red hover:text-red-300"
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>
          </div>
        </main>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 motion-safe:animate-[fadeInSoft_.18s_ease-out]">
          <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden motion-safe:animate-[scaleIn_.2s_ease-out]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <h3 className="text-lg font-bold text-white">{editingId ? "Editar cita" : "Nueva cita"}</h3>
              <button
                type="button"
                onClick={() => !saving && setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Orden de admisión</label>
                <select
                  className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                  value={form.orden_admision_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, orden_admision_id: event.target.value }))}
                  required
                >
                  <option value="">Selecciona orden</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.reporte_siniestro} | {order.nb_cliente} | {order.placas || "-"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label>
                  <input
                    type="date"
                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                    value={form.fecha_cita}
                    onChange={(event) => setForm((prev) => ({ ...prev, fecha_cita: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                  <input
                    type="time"
                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                    value={form.hora_cita}
                    onChange={(event) => setForm((prev) => ({ ...prev, hora_cita: event.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Estado</label>
                  <select
                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                    value={form.estado}
                    onChange={(event) => setForm((prev) => ({ ...prev, estado: event.target.value }))}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Notas</label>
                <textarea
                  rows={4}
                  className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                  value={form.notas}
                  onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))}
                  placeholder="Demoras, estatus de piezas, observaciones para recepción..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded border border-border-dark text-slate-300 hover:text-white"
                  onClick={() => !saving && setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear cita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
