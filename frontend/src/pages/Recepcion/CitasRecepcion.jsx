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

const ACTIVE_STATES = ["Programada", "Confirmada", "Reprogramada", "En espera", "Demorada"];

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

const WEEK_DAYS_SHORT = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseYmd(value) {
  return new Date(`${String(value).slice(0, 10)}T12:00:00`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function monthLabel(date) {
  return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function weekLabel(date) {
  const start = startOfWeekMonday(date);
  const end = addDays(start, 5);
  const monthStart = start.toLocaleDateString("es-MX", { month: "long" });
  const monthEnd = end.toLocaleDateString("es-MX", { month: "long" });
  const year = end.getFullYear();
  if (monthStart === monthEnd) return `${start.getDate()} - ${end.getDate()} de ${monthEnd}, ${year}`;
  return `${start.getDate()} ${monthStart} - ${end.getDate()} ${monthEnd}, ${year}`;
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toYmd(start), end: toYmd(end) };
}

function weekRange(date) {
  const start = startOfWeekMonday(date);
  const end = addDays(start, 5);
  return { start: toYmd(start), end: toYmd(end) };
}

function buildCalendarCells(activeMonthDate) {
  const firstOfMonth = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), 1);
  const lastOfMonth = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1, 0);
  const startOffset = firstOfMonth.getDay();
  const totalDays = lastOfMonth.getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    const d = addDays(firstOfMonth, -(startOffset - i));
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const d = new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), day);
    cells.push({ date: d, inMonth: true, ymd: toYmd(d) });
  }

  while (cells.length < 42) {
    const d = addDays(lastOfMonth, cells.length - (startOffset + totalDays) + 1);
    cells.push({ date: d, inMonth: false, ymd: toYmd(d) });
  }

  return cells;
}

function toMinutes(value) {
  const raw = String(value || "").slice(0, 5);
  const [h, m] = raw.split(":").map((n) => Number(n || 0));
  return h * 60 + m;
}

function humanDateLabel(value) {
  const date = parseYmd(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

export default function CitasRecepcion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId");

  const [orders, setOrders] = useState([]);
  const [citas, setCitas] = useState([]);
  const [resumenByDate, setResumenByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [viewMode, setViewMode] = useState("Mes");
  const [search, setSearch] = useState("");
  const [animDirection, setAnimDirection] = useState("next");
  const [rangeAnimKey, setRangeAnimKey] = useState(0);

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

  const activeRange = useMemo(
    () => (viewMode === "Semana" ? weekRange(cursorDate) : monthRange(cursorDate)),
    [cursorDate, viewMode]
  );

  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(cursorDate);
    return Array.from({ length: 6 }).map((_, index) => {
      const date = addDays(start, index);
      return { date, ymd: toYmd(date), label: WEEK_DAYS_SHORT[index], day: date.getDate() };
    });
  }, [cursorDate]);

  const calendarCells = useMemo(() => buildCalendarCells(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1)), [cursorDate]);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/ordenes`);
        if (!response.ok) throw new Error("No se pudieron cargar órdenes.");
        setOrders((await response.json()) || []);
      } catch (err) {
        setError(err.message || "No se pudieron cargar órdenes.");
      }
    };
    loadOrders();
  }, []);

  useEffect(() => {
    const loadCitas = async () => {
      try {
        setLoading(true);
        setError("");
        const [citasRes, resumenRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas?from=${activeRange.start}&to=${activeRange.end}`),
          fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/resumen?from=${activeRange.start}&to=${activeRange.end}`)
        ]);
        if (!citasRes.ok) throw new Error("No se pudieron cargar citas.");
        if (!resumenRes.ok) throw new Error("No se pudo cargar resumen de citas.");
        const citasPayload = await citasRes.json();
        const resumenPayload = await resumenRes.json();
        setCitas(citasPayload || []);
        setResumenByDate(Object.fromEntries((resumenPayload || []).map((item) => [String(item.fecha_cita), item])));
        setRangeAnimKey((value) => value + 1);
      } catch (err) {
        setError(err.message || "No se pudieron cargar citas.");
      } finally {
        setLoading(false);
      }
    };
    loadCitas();
  }, [activeRange.start, activeRange.end]);

  useEffect(() => {
    if (!preselectedOrderId || !orders.length) return;
    const match = orders.find((item) => String(item.id) === String(preselectedOrderId));
    if (!match) return;
    setIsModalOpen(true);
    setEditingId(null);
    setForm((prev) => ({ ...prev, orden_admision_id: String(match.id), fecha_cita: selectedDate || toYmd(new Date()) }));
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("orderId");
      return next;
    });
  }, [preselectedOrderId, orders, selectedDate, setSearchParams]);

  const filteredCitas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return citas;
    return citas.filter((item) =>
      [item.nb_cliente, item.reporte_siniestro, item.placas, item.marca_vehiculo, item.tipo_vehiculo]
        .map((val) => String(val || "").toLowerCase())
        .some((val) => val.includes(q))
    );
  }, [citas, search]);

  const citasDelDia = useMemo(
    () =>
      filteredCitas
        .filter((item) => String(item.fecha_cita).slice(0, 10) === selectedDate)
        .sort((a, b) => String(a.hora_cita).localeCompare(String(b.hora_cita))),
    [filteredCitas, selectedDate]
  );

  const weekCitasByDay = useMemo(() => {
    const map = Object.fromEntries(weekDays.map((day) => [day.ymd, []]));
    filteredCitas.forEach((item) => {
      const key = String(item.fecha_cita).slice(0, 10);
      if (map[key]) map[key].push(item);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => String(a.hora_cita).localeCompare(String(b.hora_cita))));
    return map;
  }, [filteredCitas, weekDays]);

  const totals = useMemo(() => {
    const today = toYmd(new Date());
    let pendientes = 0;
    let completadas = 0;
    let canceladas = 0;
    let citasHoy = 0;

    filteredCitas.forEach((item) => {
      const estado = String(item.estado || "");
      const fecha = String(item.fecha_cita || "").slice(0, 10);
      if (ACTIVE_STATES.includes(estado)) pendientes += 1;
      if (estado === "Completada") completadas += 1;
      if (estado === "Cancelada") canceladas += 1;
      if (fecha === today) citasHoy += 1;
    });

    const totalActivas = filteredCitas.length - canceladas;
    const capacidad = viewMode === "Semana" ? 6 * 8 : 26 * 6;
    const ocupacion = capacidad ? Math.min(100, Math.round((totalActivas / capacidad) * 100)) : 0;

    return { citasHoy, pendientes, completadas, canceladas, ocupacion };
  }, [filteredCitas, viewMode]);

  const weeklyCapacity = useMemo(() => {
    const capByDay = {};
    weekDays.forEach((day) => {
      const citasDia = weekCitasByDay[day.ymd] || [];
      const activeCount = citasDia.filter((item) => item.estado !== "Cancelada").length;
      capByDay[day.ymd] = {
        label: day.label,
        day: day.day,
        used: activeCount,
        pct: Math.min(100, Math.round((activeCount / 8) * 100))
      };
    });
    return capByDay;
  }, [weekDays, weekCitasByDay]);

  const openNewModal = (dateYmd) => {
    setEditingId(null);
    setForm({ orden_admision_id: "", fecha_cita: dateYmd || selectedDate || toYmd(new Date()), hora_cita: "09:00", estado: "Programada", notas: "" });
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

  const moveRange = (delta) => {
    setAnimDirection(delta < 0 ? "prev" : "next");
    setCursorDate((prev) => {
      if (viewMode === "Semana") return addDays(prev, delta * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
    });
  };

  const goToday = () => {
    const today = new Date();
    setSelectedDate(toYmd(today));
    setAnimDirection("next");
    setCursorDate(viewMode === "Semana" ? today : new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const refreshData = async () => {
    const [citasRes, resumenRes] = await Promise.all([
      fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas?from=${activeRange.start}&to=${activeRange.end}`),
      fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/resumen?from=${activeRange.start}&to=${activeRange.end}`)
    ]);
    if (!citasRes.ok || !resumenRes.ok) throw new Error("No se pudo refrescar agenda.");
    setCitas((await citasRes.json()) || []);
    const resumenPayload = await resumenRes.json();
    setResumenByDate(Object.fromEntries((resumenPayload || []).map((item) => [String(item.fecha_cita), item])));
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
        editingId ? `${import.meta.env.VITE_API_URL}/recepcion/citas/${editingId}` : `${import.meta.env.VITE_API_URL}/recepcion/citas`,
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

      await refreshData();
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/citas/${citaId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar la cita.");
      }
      await refreshData();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la cita.");
    }
  };

  const weekHours = useMemo(() => Array.from({ length: 11 }).map((_, idx) => 8 + idx), []);
  const rowHeight = 72;
  const weekBodyHeight = weekHours.length * rowHeight;

  const currentTimeLine = useMemo(() => {
    const now = new Date();
    const currentYmd = toYmd(now);
    const dayIndex = weekDays.findIndex((day) => day.ymd === currentYmd);
    if (dayIndex === -1) return null;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const min = 8 * 60;
    const max = 19 * 60;
    if (minutes < min || minutes > max) return null;
    const top = ((minutes - min) / 60) * rowHeight;
    return { top, hhmm: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
  }, [weekDays, rowHeight]);

  const StatCard = ({ label, value }) => (
    <article className="bg-surface-dark/90 border border-border-dark rounded-xl p-4 shadow-sm motion-safe:animate-[fadeUp_.35s_ease-out]">
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <span className="text-2xl font-black text-white">{value}</span>
    </article>
  );

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeInSoft { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInFromRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInFromLeft { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader title="Agenda de recepciones" subtitle="Control de citas para ingreso de unidades autorizadas." showSearch={false} />

          <div className="px-6 py-3 border-b border-border-dark bg-background-dark/70 backdrop-blur-sm flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 bg-surface-dark border border-border-dark p-1 rounded-lg w-fit">
              {["Mes", "Semana", "Día"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={mode === "Día"}
                  onClick={() => {
                    if (mode === "Día") return;
                    setViewMode(mode);
                    setCursorDate(mode === "Semana" ? parseYmd(selectedDate) : new Date(parseYmd(selectedDate).getFullYear(), parseYmd(selectedDate).getMonth(), 1));
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                    viewMode === mode
                      ? "bg-primary text-white"
                      : mode === "Día"
                        ? "text-slate-500 cursor-not-allowed"
                        : "text-slate-300 hover:bg-background-dark"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                <input
                  className="w-64 bg-surface-dark border border-border-dark rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:ring-primary focus:border-primary"
                  placeholder="Buscar orden o cliente..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <button type="button" onClick={goToday} className="px-3 py-2 rounded-lg border border-border-dark text-xs font-bold text-slate-300 hover:text-white">Hoy</button>
              <button type="button" onClick={() => openNewModal(selectedDate)} className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold">
                <span className="material-symbols-outlined text-sm">add</span>
                Nueva cita
              </button>
            </div>
          </div>

          <section className="grid grid-cols-2 md:grid-cols-5 gap-3 p-6 border-b border-border-dark bg-background-dark/40">
            <StatCard label="Citas Hoy" value={totals.citasHoy} />
            <StatCard label="Pendientes" value={totals.pendientes} />
            <StatCard label="Completadas" value={totals.completadas} />
            <StatCard label="Canceladas" value={totals.canceladas} />
            <StatCard label="% Ocupación" value={`${totals.ocupacion}%`} />
          </section>

          {viewMode === "Mes" ? (
            <div className="flex-1 min-h-0 grid grid-cols-12">
              <section className="col-span-12 xl:col-span-9 p-6 overflow-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-white capitalize">{monthLabel(cursorDate)}</h3>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveRange(-1)} className="size-9 rounded-lg border border-border-dark text-slate-300 hover:text-white"><span className="material-symbols-outlined">chevron_left</span></button>
                    <button type="button" onClick={() => moveRange(1)} className="size-9 rounded-lg border border-border-dark text-slate-300 hover:text-white"><span className="material-symbols-outlined">chevron_right</span></button>
                  </div>
                </div>

                <div key={rangeAnimKey} className={`border border-border-dark rounded-xl overflow-hidden ${animDirection === "prev" ? "motion-safe:animate-[slideInFromLeft_.24s_ease-out]" : "motion-safe:animate-[slideInFromRight_.24s_ease-out]"}`}>
                  <div className="grid grid-cols-7 bg-surface-dark/60 border-b border-border-dark">
                    {["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"].map((label) => (
                      <div key={label} className="px-3 py-2 text-[10px] font-black tracking-widest text-slate-400 border-r border-border-dark last:border-r-0 text-center">{label}</div>
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
                        <button key={`${cell.ymd}-${index}`} type="button" onClick={() => setSelectedDate(cell.ymd)} className={`h-28 p-2 border-r border-b border-border-dark last:border-r-0 text-left transition-all duration-200 hover:-translate-y-[1px] ${selected ? "bg-primary/10" : cell.inMonth ? "bg-background-dark hover:bg-surface-dark/40" : "bg-background-dark/40 text-slate-500"}`}>
                          <div className="flex items-center justify-between mb-2">
                            {isToday ? <span className="size-6 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center">{cell.date.getDate()}</span> : <span className={`text-xs font-bold ${cell.inMonth ? "text-white" : "text-slate-500"}`}>{cell.date.getDate()}</span>}
                            {daySummary?.total_citas ? <span className="text-[10px] font-black text-primary">{daySummary.total_citas}</span> : null}
                          </div>
                          <div className="space-y-1">
                            {lines.slice(0, 3).map((line) => <div key={line.key} className={`h-1 rounded-full ${line.cls}`} />)}
                            {daySummary?.total_citas > 3 ? <p className="text-[9px] text-primary font-bold">+{daySummary.total_citas - 3} más</p> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <aside className="col-span-12 xl:col-span-3 border-l border-border-dark bg-background-dark/70 flex flex-col min-h-0">
                <div className="px-5 py-4 border-b border-border-dark"><h4 className="text-base font-black text-white">Citas del día</h4><p className="text-xs text-slate-400 capitalize">{humanDateLabel(selectedDate)}</p></div>
                <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                  {loading ? <p className="text-sm text-slate-400">Cargando agenda...</p> : null}
                  {!loading && !citasDelDia.length ? <p className="text-sm text-slate-500">No hay citas para la fecha seleccionada.</p> : null}
                  {citasDelDia.map((cita, index) => {
                    const chipClass = STATUS_STYLES[cita.estado] || "bg-slate-600/20 text-slate-300 border-slate-500/40";
                    return (
                      <article key={cita.id} className="bg-surface-dark border border-border-dark rounded-xl p-3 motion-safe:animate-[fadeUp_.28s_ease-out]" style={{ animationDelay: `${index * 35}ms` }}>
                        <div className="flex items-start justify-between gap-2 mb-2"><span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${chipClass}`}>{cita.estado}</span><span className="text-xs font-black text-white">{String(cita.hora_cita).slice(0, 5)}</span></div>
                        <p className="text-sm font-black text-white truncate">{cita.nb_cliente || "Sin cliente"}</p>
                        <p className="text-[11px] text-slate-400 truncate">{cita.marca_vehiculo} {cita.tipo_vehiculo} {cita.placas ? `- ${cita.placas}` : ""}</p>
                        {cita.notas ? <div className="mt-2 p-2 bg-background-dark/60 rounded text-[10px] text-slate-400 italic">{cita.notas}</div> : null}
                        <div className="mt-3 flex items-center justify-end gap-3"><button type="button" onClick={() => openEditModal(cita)} className="text-xs text-slate-300 hover:text-white">Editar</button><button type="button" onClick={() => handleDelete(cita.id)} className="text-xs text-alert-red hover:text-red-300">Eliminar</button></div>
                      </article>
                    );
                  })}
                </div>
              </aside>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-12">
              <section className="col-span-12 xl:col-span-9 flex flex-col min-h-0">
                <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => moveRange(-1)} className="size-8 rounded border border-border-dark text-slate-400 hover:text-white"><span className="material-symbols-outlined text-base">chevron_left</span></button>
                    <h3 className="text-sm font-black text-white min-w-[220px] text-center">{weekLabel(cursorDate)}</h3>
                    <button type="button" onClick={() => moveRange(1)} className="size-8 rounded border border-border-dark text-slate-400 hover:text-white"><span className="material-symbols-outlined text-base">chevron_right</span></button>
                  </div>
                  <div className="text-xs text-slate-400">
                    Disponibilidad <span className="text-primary font-bold">{Math.max(0, 100 - totals.ocupacion)}% libre</span>
                  </div>
                </div>

                <div key={rangeAnimKey} className={`flex-1 min-h-0 overflow-auto ${animDirection === "prev" ? "motion-safe:animate-[slideInFromLeft_.24s_ease-out]" : "motion-safe:animate-[slideInFromRight_.24s_ease-out]"}`}>
                  <div className="grid grid-cols-[80px_repeat(6,minmax(140px,1fr))] sticky top-0 z-20 bg-background-dark border-b border-border-dark">
                    <div className="border-r border-border-dark" />
                    {weekDays.map((day) => {
                      const isToday = day.ymd === toYmd(new Date());
                      return (
                        <div key={day.ymd} className={`px-2 py-3 border-r border-border-dark text-center ${isToday ? "bg-primary/10" : ""}`}>
                          <div className={`text-[10px] font-black tracking-widest ${isToday ? "text-primary" : "text-slate-400"}`}>{day.label}</div>
                          <div className={`text-xl font-black ${isToday ? "text-primary" : "text-white"}`}>{day.day}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="relative">
                    {currentTimeLine ? (
                      <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top: `${currentTimeLine.top}px` }}>
                        <div className="w-[80px] text-right pr-2"><span className="text-[10px] font-bold text-alert-red bg-alert-red/10 px-1 rounded">{currentTimeLine.hhmm}</span></div>
                        <div className="flex-1 h-px bg-alert-red" />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-[80px_repeat(6,minmax(140px,1fr))]" style={{ minHeight: `${weekBodyHeight}px` }}>
                      <div className="border-r border-border-dark">
                        {weekHours.map((hour) => (
                          <div key={hour} className="border-b border-border-dark px-2 pt-1 text-right text-[10px] text-slate-500 font-bold" style={{ height: `${rowHeight}px` }}>
                            {`${pad(hour)}:00`}
                          </div>
                        ))}
                      </div>

                      {weekDays.map((day) => {
                        const dayCitas = weekCitasByDay[day.ymd] || [];
                        return (
                          <div key={day.ymd} className={`relative border-r border-border-dark ${day.ymd === toYmd(new Date()) ? "bg-primary/5" : ""}`}>
                            {weekHours.map((hour) => (
                              <button
                                key={`${day.ymd}-${hour}`}
                                type="button"
                                onClick={() => {
                                  setSelectedDate(day.ymd);
                                  openNewModal(day.ymd);
                                  setForm((prev) => ({ ...prev, hora_cita: `${pad(hour)}:00` }));
                                }}
                                className="w-full border-b border-border-dark hover:bg-white/5 transition-colors"
                                style={{ height: `${rowHeight}px` }}
                                title={`Agendar ${day.label} ${pad(hour)}:00`}
                              />
                            ))}

                            {dayCitas.map((cita) => {
                              const top = ((toMinutes(cita.hora_cita) - 8 * 60) / 60) * rowHeight;
                              const safeTop = Math.max(2, Math.min(weekBodyHeight - rowHeight + 2, top));
                              const chipClass = STATUS_STYLES[cita.estado] || "bg-slate-600/20 text-slate-300 border-slate-500/40";
                              return (
                                <button
                                  key={cita.id}
                                  type="button"
                                  onClick={() => openEditModal(cita)}
                                  className={`absolute left-1 right-1 h-[64px] rounded-lg border p-2 text-left ${chipClass} hover:brightness-110 transition-all`}
                                  style={{ top: `${safeTop}px` }}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black uppercase tracking-widest">{cita.estado}</span>
                                    <span className="text-[9px] font-bold">{String(cita.hora_cita).slice(0, 5)}</span>
                                  </div>
                                  <p className="text-[11px] font-black text-white truncate">{cita.nb_cliente || "Sin cliente"}</p>
                                  <p className="text-[10px] text-slate-200 truncate">{cita.marca_vehiculo || "Vehículo"}</p>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="col-span-12 xl:col-span-3 border-l border-border-dark bg-background-dark p-6 overflow-y-auto custom-scrollbar">
                <h4 className="text-sm font-black text-white mb-4">Capacidad del taller</h4>
                <div className="space-y-4 mb-8">
                  {weekDays.map((day) => {
                    const item = weeklyCapacity[day.ymd];
                    const high = item?.pct >= 100;
                    return (
                      <div key={day.ymd} className="space-y-1">
                        <div className="flex justify-between text-xs"><span className="text-slate-400 font-bold">{day.label}</span><span className={`font-bold ${high ? "text-alert-amber" : "text-primary"}`}>{item?.pct || 0}%</span></div>
                        <div className="h-2 rounded-full bg-surface-dark overflow-hidden"><div className={`h-full rounded-full ${high ? "bg-alert-amber" : "bg-primary"}`} style={{ width: `${item?.pct || 0}%` }} /></div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-surface-dark p-4 rounded-xl border border-border-dark">
                  <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-300 mb-3">Acciones rápidas</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="p-3 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary"><span className="material-symbols-outlined text-base">print</span></button>
                    <button className="p-3 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary"><span className="material-symbols-outlined text-base">mail</span></button>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 motion-safe:animate-[fadeInSoft_.18s_ease-out]">
          <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden motion-safe:animate-[scaleIn_.2s_ease-out]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <h3 className="text-lg font-bold text-white">{editingId ? "Editar cita" : "Nueva cita"}</h3>
              <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
            </div>

            <form className="p-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Orden de admisión</label>
                <select className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={form.orden_admision_id} onChange={(event) => setForm((prev) => ({ ...prev, orden_admision_id: event.target.value }))} required>
                  <option value="">Selecciona orden</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>{order.reporte_siniestro} | {order.nb_cliente} | {order.placas || "-"}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label>
                  <input type="date" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={form.fecha_cita} onChange={(event) => setForm((prev) => ({ ...prev, fecha_cita: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Hora</label>
                  <input type="time" className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={form.hora_cita} onChange={(event) => setForm((prev) => ({ ...prev, hora_cita: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Estado</label>
                  <select className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={form.estado} onChange={(event) => setForm((prev) => ({ ...prev, estado: event.target.value }))}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Notas</label>
                <textarea rows={4} className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white" value={form.notas} onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))} placeholder="Demoras, estatus de piezas, observaciones para recepción..." />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="px-4 py-2 rounded border border-border-dark text-slate-300 hover:text-white" onClick={() => !saving && setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-60">{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear cita"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
