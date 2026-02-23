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

function pad(value) {
  return String(value).padStart(2, "0");
}

function toYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  while (cells.length % 7 !== 0) {
    const d = new Date(lastOfMonth);
    d.setDate(d.getDate() + (cells.length % 7));
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
        .sort((a, b) => String(a.hora_cita).localeCompare(String(b.hora_cita))),
    [citas, selectedDate]
  );

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

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Agenda de recepciones"
            subtitle="Programa citas de ingreso una vez autorizado y con piezas disponibles."
            showSearch={false}
            actions={
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                type="button"
                onClick={() => openNewModal(selectedDate)}
              >
                <span className="material-symbols-outlined text-sm">event_available</span>
                Nueva cita
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}
            <section className="grid grid-cols-12 gap-4">
              <div className="col-span-12 xl:col-span-8 border border-border-dark rounded-xl bg-surface-dark p-4">
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                    }
                    className="px-3 py-2 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary/60 text-xs font-bold uppercase"
                  >
                    Mes anterior
                  </button>
                  <h3 className="text-lg font-black text-white uppercase tracking-wide">
                    {monthLabel(monthCursor)}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                    }
                    className="px-3 py-2 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary/60 text-xs font-bold uppercase"
                  >
                    Mes siguiente
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">
                  {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((label) => (
                    <div key={label} className="px-2 py-1">{label}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {calendarCells.map((cell) => {
                    const daySummary = resumenByDate[cell.ymd] || null;
                    const selected = selectedDate === cell.ymd;
                    const isToday = cell.ymd === toYmd(new Date());
                    return (
                      <button
                        key={cell.ymd}
                        type="button"
                        onClick={() => setSelectedDate(cell.ymd)}
                        className={`min-h-[92px] rounded-lg border p-2 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/20"
                            : cell.inMonth
                              ? "border-border-dark bg-background-dark/50 hover:border-primary/60"
                              : "border-border-dark/40 bg-background-dark/20 text-slate-500"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-white"}`}>
                            {cell.date.getDate()}
                          </span>
                          {daySummary?.total_citas ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary text-white">
                              {daySummary.total_citas}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 space-y-1 text-[10px]">
                          {daySummary?.pendientes ? (
                            <div className="text-amber-300">Pendientes: {daySummary.pendientes}</div>
                          ) : null}
                          {daySummary?.completadas ? (
                            <div className="text-emerald-300">Completadas: {daySummary.completadas}</div>
                          ) : null}
                          {daySummary?.canceladas ? (
                            <div className="text-rose-300">Canceladas: {daySummary.canceladas}</div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="col-span-12 xl:col-span-4 border border-border-dark rounded-xl bg-surface-dark p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Citas del {selectedDate}
                  </h3>
                  <button
                    type="button"
                    className="text-xs font-bold uppercase px-2 py-1 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary/60"
                    onClick={() => openNewModal(selectedDate)}
                  >
                    Agendar
                  </button>
                </div>
                {loading ? <p className="text-sm text-slate-400">Cargando agenda...</p> : null}
                {!loading && !citasDelDia.length ? (
                  <p className="text-sm text-slate-500">No hay citas para esta fecha.</p>
                ) : null}
                <div className="space-y-3">
                  {citasDelDia.map((cita) => (
                    <article
                      key={cita.id}
                      className="border border-border-dark rounded-lg p-3 bg-background-dark/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-white">{String(cita.hora_cita).slice(0, 5)}</p>
                          <p className="text-sm text-primary font-bold">
                            {cita.reporte_siniestro || `Orden ${cita.orden_admision_id}`}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-300 bg-slate-700/70 px-2 py-0.5 rounded-full">
                          {cita.estado}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 mt-2">{cita.nb_cliente || "Sin cliente"}</p>
                      <p className="text-[11px] text-slate-400">
                        {[cita.marca_vehiculo, cita.tipo_vehiculo, cita.modelo_anio].filter(Boolean).join(" ")}
                      </p>
                      {cita.notas ? <p className="text-[11px] text-slate-400 mt-2">{cita.notas}</p> : null}
                      <div className="mt-3 flex justify-end gap-2">
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
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </aside>
            </section>
          </div>
        </main>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60">
          <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <h3 className="text-lg font-bold text-white">
                {editingId ? "Editar cita" : "Nueva cita"}
              </h3>
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
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, orden_admision_id: event.target.value }))
                  }
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
                      <option key={status} value={status}>{status}</option>
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
