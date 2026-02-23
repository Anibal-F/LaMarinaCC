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
const OCCUPIED_STATES = ["Programada", "Confirmada"];
const TENTATIVE_STATES = ["Reprogramada", "En espera", "Demorada"];

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
function dayRange(date) {
  const day = toYmd(date);
  return { start: day, end: day };
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

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

function humanDateLabel(value) {
  const date = parseYmd(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function formatOrderLabel(order) {
  if (!order) return "";
  return `#${order.id} - ${order.reporte_siniestro || "SIN REPORTE"} - ${order.nb_cliente || "SIN CLIENTE"}`;
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
  const [modalMonthCursor, setModalMonthCursor] = useState(() => new Date());
  const [modalDayCitas, setModalDayCitas] = useState([]);
  const [loadingModalDayCitas, setLoadingModalDayCitas] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);
  const [form, setForm] = useState({
    orden_admision_id: "",
    fecha_cita: toYmd(new Date()),
    hora_cita: "09:00",
    estado: "Programada",
    notas: ""
  });

  const activeRange = useMemo(() => {
    if (viewMode === "Semana") return weekRange(cursorDate);
    if (viewMode === "Día") return dayRange(cursorDate);
    return monthRange(cursorDate);
  }, [cursorDate, viewMode]);

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

  useEffect(() => {
    if (viewMode !== "Día") return;
    const ymd = toYmd(cursorDate);
    setSelectedDate((prev) => (prev === ymd ? prev : ymd));
  }, [viewMode, cursorDate]);

  const filteredCitas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return citas;
    return citas.filter((item) =>
      [item.nb_cliente, item.reporte_siniestro, item.placas, item.marca_vehiculo, item.tipo_vehiculo]
        .map((val) => String(val || "").toLowerCase())
        .some((val) => val.includes(q))
    );
  }, [citas, search]);

  const selectedOrder = useMemo(
    () => orders.find((order) => String(order.id) === String(form.orden_admision_id || "")) || null,
    [orders, form.orden_admision_id]
  );
  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return orders.slice(0, 50);
    return orders
      .filter((order) =>
        [order.id, order.reporte_siniestro, order.nb_cliente, order.placas, order.marca_vehiculo, order.tipo_vehiculo]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(q))
      )
      .slice(0, 50);
  }, [orders, orderQuery]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (!form.orden_admision_id) {
      setOrderQuery("");
      return;
    }
    setOrderQuery(formatOrderLabel(selectedOrder));
  }, [isModalOpen, form.orden_admision_id, selectedOrder]);

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
    const capacidad = viewMode === "Semana" ? 6 * 8 : viewMode === "Día" ? 8 : 26 * 6;
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
    const targetDate = parseYmd(dateYmd || selectedDate || toYmd(new Date()));
    setEditingId(null);
    setModalMonthCursor(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setForm({
      orden_admision_id: "",
      fecha_cita: toYmd(targetDate),
      hora_cita: "09:00",
      estado: "Programada",
      notas: ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (cita) => {
    setEditingId(cita.id);
    const targetDate = parseYmd(String(cita.fecha_cita || "").slice(0, 10));
    setModalMonthCursor(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    setForm({
      orden_admision_id: String(cita.orden_admision_id || ""),
      fecha_cita: String(cita.fecha_cita || "").slice(0, 10),
      hora_cita: String(cita.hora_cita || "").slice(0, 5),
      estado: cita.estado || "Programada",
      notas: cita.notas || ""
    });
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen || !form.fecha_cita) return;
    const d = parseYmd(form.fecha_cita);
    if (Number.isNaN(d.getTime())) return;
    setModalMonthCursor((prev) => {
      if (prev.getFullYear() === d.getFullYear() && prev.getMonth() === d.getMonth()) return prev;
      return new Date(d.getFullYear(), d.getMonth(), 1);
    });
  }, [isModalOpen, form.fecha_cita]);

  useEffect(() => {
    if (!isModalOpen || !form.fecha_cita) return;
    const loadDayCitas = async () => {
      try {
        setLoadingModalDayCitas(true);
        const ymd = String(form.fecha_cita).slice(0, 10);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/recepcion/citas?from=${ymd}&to=${ymd}`
        );
        if (!response.ok) return;
        const payload = await response.json();
        setModalDayCitas(payload || []);
      } catch {
        // ignore
      } finally {
        setLoadingModalDayCitas(false);
      }
    };
    loadDayCitas();
  }, [isModalOpen, form.fecha_cita]);

  const moveRange = (delta) => {
    setAnimDirection(delta < 0 ? "prev" : "next");
    setCursorDate((prev) => {
      if (viewMode === "Día") return addDays(prev, delta);
      if (viewMode === "Semana") return addDays(prev, delta * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
    });
  };

  const goToday = () => {
    const today = new Date();
    setSelectedDate(toYmd(today));
    setAnimDirection("next");
    if (viewMode === "Semana" || viewMode === "Día") {
      setCursorDate(today);
      return;
    }
    setCursorDate(new Date(today.getFullYear(), today.getMonth(), 1));
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
    if (selectedTimeIsBlocked) {
      setError("El horario seleccionado está ocupado. Elige otro horario disponible.");
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
  const modalTimeSlots = useMemo(() => {
    const slots = [];
    for (let minutes = 8 * 60; minutes <= 18 * 60; minutes += 30) {
      slots.push(minutesToTime(minutes));
    }
    return slots;
  }, []);
  const modalSlotStatus = useMemo(() => {
    const excludedId = editingId ? String(editingId) : "";
    const byTime = {};
    modalTimeSlots.forEach((slot) => {
      byTime[slot] = "Disponible";
    });
    modalDayCitas.forEach((cita) => {
      if (excludedId && String(cita.id) === excludedId) return;
      const slot = String(cita.hora_cita || "").slice(0, 5);
      if (!byTime[slot]) return;
      const state = String(cita.estado || "");
      if (OCCUPIED_STATES.includes(state)) {
        byTime[slot] = "Ocupado";
      } else if (byTime[slot] !== "Ocupado" && TENTATIVE_STATES.includes(state)) {
        byTime[slot] = "Tentativo";
      }
    });
    return byTime;
  }, [modalDayCitas, modalTimeSlots, editingId]);
  const modalAvailabilityCounts = useMemo(() => {
    return modalTimeSlots.reduce(
      (acc, slot) => {
        const status = modalSlotStatus[slot] || "Disponible";
        if (status === "Ocupado") acc.ocupado += 1;
        else if (status === "Tentativo") acc.tentativo += 1;
        else acc.disponible += 1;
        return acc;
      },
      { disponible: 0, ocupado: 0, tentativo: 0 }
    );
  }, [modalTimeSlots, modalSlotStatus]);
  const selectedTimeStatus = modalSlotStatus[String(form.hora_cita || "").slice(0, 5)] || "Disponible";
  const selectedTimeIsBlocked = selectedTimeStatus === "Ocupado";
  const selectedTimeStatusClass =
    selectedTimeStatus === "Ocupado"
      ? "border-alert-red/60"
      : selectedTimeStatus === "Tentativo"
        ? "border-alert-amber/60"
        : "border-alert-green/60";
  const modalCalendarCells = useMemo(
    () => buildCalendarCells(new Date(modalMonthCursor.getFullYear(), modalMonthCursor.getMonth(), 1)),
    [modalMonthCursor]
  );
  const rowHeight = 72;
  const weekBodyHeight = weekHours.length * rowHeight;
  const dayHours = useMemo(() => Array.from({ length: 12 }).map((_, idx) => 8 + idx), []);
  const dayRowHeight = 96;
  const dayBodyHeight = dayHours.length * dayRowHeight;
  const selectedDateObj = useMemo(() => parseYmd(selectedDate), [selectedDate]);
  const dayHeaderLabel = useMemo(
    () => selectedDateObj.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }),
    [selectedDateObj]
  );
  const dayStats = useMemo(() => {
    let confirmadas = 0;
    let demoras = 0;
    let canceladas = 0;
    citasDelDia.forEach((item) => {
      const status = String(item.estado || "");
      if (status === "Confirmada") confirmadas += 1;
      if (status === "Demorada" || status === "En espera" || status === "Reprogramada") demoras += 1;
      if (status === "Cancelada") canceladas += 1;
    });
    return { total: citasDelDia.length, confirmadas, demoras, canceladas };
  }, [citasDelDia]);
  const dayConflicts = useMemo(() => {
    const active = citasDelDia.filter((item) => String(item.estado || "") !== "Cancelada");
    const bySlot = active.reduce((acc, item) => {
      const key = String(item.hora_cita || "").slice(0, 5);
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
    return Object.values(bySlot).filter((list) => list.length > 1).flat();
  }, [citasDelDia]);
  const upcomingDayCitas = useMemo(() => {
    const now = new Date();
    const isToday = selectedDate === toYmd(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return citasDelDia
      .filter((item) => !isToday || toMinutes(item.hora_cita) >= nowMinutes)
      .slice(0, 5);
  }, [citasDelDia, selectedDate]);

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
  const dayCurrentTimeLine = useMemo(() => {
    const now = new Date();
    if (selectedDate !== toYmd(now)) return null;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const min = 8 * 60;
    const max = 20 * 60;
    if (minutes < min || minutes > max) return null;
    const top = ((minutes - min) / 60) * dayRowHeight;
    return { top, hhmm: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
  }, [selectedDate, dayRowHeight]);

  useEffect(() => {
    if (!isModalOpen || loadingModalDayCitas) return;
    const currentSlot = String(form.hora_cita || "").slice(0, 5);
    if (!currentSlot || (modalSlotStatus[currentSlot] || "Disponible") !== "Ocupado") return;
    const firstAvailable = modalTimeSlots.find((slot) => (modalSlotStatus[slot] || "Disponible") !== "Ocupado");
    if (!firstAvailable || firstAvailable === currentSlot) return;
    setForm((prev) => ({ ...prev, hora_cita: firstAvailable }));
  }, [isModalOpen, loadingModalDayCitas, form.hora_cita, modalSlotStatus, modalTimeSlots]);

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
        .glass-effect {
          background: rgba(43, 49, 56, 0.72);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
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
                  onClick={() => {
                    setViewMode(mode);
                    if (mode === "Semana" || mode === "Día") {
                      setCursorDate(parseYmd(selectedDate));
                      return;
                    }
                    setCursorDate(new Date(parseYmd(selectedDate).getFullYear(), parseYmd(selectedDate).getMonth(), 1));
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                    viewMode === mode
                      ? "bg-primary text-white"
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
          ) : viewMode === "Semana" ? (
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
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-12">
              <section className="col-span-12 xl:col-span-9 flex flex-col min-h-0 border-r border-border-dark">
                <div className="px-6 py-3 border-b border-border-dark bg-background-dark/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => moveRange(-1)} className="size-8 rounded-lg border border-border-dark text-slate-400 hover:text-white">
                      <span className="material-symbols-outlined text-base">chevron_left</span>
                    </button>
                    <div>
                      <h3 className="text-lg font-black text-white capitalize leading-tight">{dayHeaderLabel}</h3>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-primary">{selectedDate === toYmd(new Date()) ? "Hoy" : "Agenda diaria"}</p>
                    </div>
                    <button type="button" onClick={() => moveRange(1)} className="size-8 rounded-lg border border-border-dark text-slate-400 hover:text-white">
                      <span className="material-symbols-outlined text-base">chevron_right</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-5 text-xs">
                    <div><p className="text-slate-500 uppercase tracking-widest font-bold text-[10px]">Total Citas</p><p className="text-white text-xl font-black">{dayStats.total}</p></div>
                    <div><p className="text-primary uppercase tracking-widest font-bold text-[10px]">Confirmadas</p><p className="text-primary text-xl font-black">{dayStats.confirmadas}</p></div>
                    <div><p className="text-alert-amber uppercase tracking-widest font-bold text-[10px]">Demoras</p><p className="text-alert-amber text-xl font-black">{dayStats.demoras}</p></div>
                    <div><p className="text-alert-red uppercase tracking-widest font-bold text-[10px]">Canceladas</p><p className="text-alert-red text-xl font-black">{dayStats.canceladas}</p></div>
                  </div>
                </div>

                <div key={rangeAnimKey} className={`flex-1 min-h-0 overflow-auto custom-scrollbar ${animDirection === "prev" ? "motion-safe:animate-[slideInFromLeft_.24s_ease-out]" : "motion-safe:animate-[slideInFromRight_.24s_ease-out]"}`}>
                  <div className="grid grid-cols-[92px_minmax(0,1fr)]">
                    <div className="border-r border-border-dark bg-background-dark/70">
                      {dayHours.map((hour) => (
                        <div key={`day-hour-${hour}`} className="border-b border-border-dark/70 pt-3 text-center text-[11px] font-bold text-slate-500" style={{ height: `${dayRowHeight}px` }}>
                          {`${pad(hour)}:00`}
                        </div>
                      ))}
                    </div>

                    <div className="relative bg-[radial-gradient(circle_at_1px_1px,rgba(71,85,105,0.22)_1px,transparent_0)] [background-size:10px_10px]">
                      {dayHours.map((hour) => (
                        <button
                          key={`day-slot-${hour}`}
                          type="button"
                          onClick={() => {
                            setSelectedDate(toYmd(cursorDate));
                            openNewModal(toYmd(cursorDate));
                            setForm((prev) => ({ ...prev, hora_cita: `${pad(hour)}:00` }));
                          }}
                          className="w-full border-b border-border-dark/60 hover:bg-white/5 transition-colors"
                          style={{ height: `${dayRowHeight}px` }}
                          title={`Agendar ${pad(hour)}:00`}
                        />
                      ))}

                      {dayCurrentTimeLine ? (
                        <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: `${dayCurrentTimeLine.top}px` }}>
                          <div className="flex-1 h-[2px] bg-alert-red shadow-[0_0_10px_rgba(239,68,68,0.75)]" />
                          <span className="ml-2 px-2 py-0.5 rounded bg-alert-red text-white text-[10px] font-black">{dayCurrentTimeLine.hhmm}</span>
                        </div>
                      ) : null}

                      {citasDelDia.map((cita, index) => {
                        const status = String(cita.estado || "");
                        const accentClass =
                          status === "Confirmada"
                            ? "border-primary/60"
                            : status === "Demorada" || status === "Reprogramada" || status === "En espera"
                              ? "border-alert-amber/60"
                              : status === "Cancelada"
                                ? "border-alert-red/60"
                                : status === "Completada"
                                  ? "border-alert-green/60"
                                  : "border-slate-500/50";
                        const stripeClass =
                          status === "Confirmada"
                            ? "bg-primary"
                            : status === "Demorada" || status === "Reprogramada" || status === "En espera"
                              ? "bg-alert-amber"
                              : status === "Cancelada"
                                ? "bg-alert-red"
                                : status === "Completada"
                                  ? "bg-alert-green"
                                  : "bg-slate-500";
                        const top = ((toMinutes(cita.hora_cita) - 8 * 60) / 60) * dayRowHeight + 8;
                        const cardHeight = 84;
                        const safeTop = Math.max(6, Math.min(dayBodyHeight - cardHeight - 8, top));
                        return (
                          <article
                            key={cita.id}
                            className={`absolute left-4 right-4 rounded-xl border ${accentClass} bg-surface-dark/90 shadow-lg overflow-hidden motion-safe:animate-[fadeUp_.25s_ease-out]`}
                            style={{ top: `${safeTop}px`, minHeight: `${cardHeight}px`, animationDelay: `${index * 35}ms` }}
                          >
                            <div className="flex">
                              <div className={`w-1.5 ${stripeClass}`} />
                              <div className="flex-1 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-white">{String(cita.hora_cita || "").slice(0, 5)}</span>
                                    <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${STATUS_STYLES[cita.estado] || "bg-slate-600/20 text-slate-300 border-slate-500/40"}`}>{cita.estado}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => openEditModal(cita)} className="size-8 rounded border border-border-dark text-slate-300 hover:text-white hover:border-primary"><span className="material-symbols-outlined text-sm">edit</span></button>
                                    <button type="button" onClick={() => handleDelete(cita.id)} className="size-8 rounded border border-border-dark text-slate-300 hover:text-alert-red hover:border-alert-red"><span className="material-symbols-outlined text-sm">delete</span></button>
                                  </div>
                                </div>
                                <p className="mt-1 text-lg font-black text-white truncate">{cita.nb_cliente || "Sin cliente"}</p>
                                <p className="text-xs text-slate-400 truncate">
                                  {cita.marca_vehiculo} {cita.tipo_vehiculo} {cita.placas ? `- ${cita.placas}` : ""}
                                </p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <footer className="px-4 py-2 border-t border-border-dark bg-background-dark/85 text-[10px] text-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="uppercase tracking-widest font-bold">Leyenda</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-slate-500" />Programada</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />Confirmada</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-alert-amber" />Demora</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-alert-red" />Cancelada</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-alert-green" />Completada</span>
                  </div>
                  <span>Actualizado: {new Date().toLocaleTimeString("es-MX")}</span>
                </footer>
              </section>

              <aside className="col-span-12 xl:col-span-3 bg-background-dark p-5 space-y-5 overflow-y-auto custom-scrollbar">
                <div className={`rounded-xl border p-4 ${dayConflicts.length ? "border-alert-red/40 bg-alert-red/10" : "border-border-dark bg-surface-dark/60"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`material-symbols-outlined text-base ${dayConflicts.length ? "text-alert-red" : "text-slate-400"}`}>warning</span>
                    <h4 className="text-sm font-black text-white">Conflictos de horario</h4>
                  </div>
                  {dayConflicts.length ? (
                    <p className="text-xs text-slate-300">
                      Se detectaron {dayConflicts.length} citas encimadas en {selectedDate}.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">Sin traslapes detectados para esta fecha.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-black text-white mb-3">Próximas recepciones</h4>
                  <div className="space-y-2">
                    {!upcomingDayCitas.length ? (
                      <p className="text-xs text-slate-500">No hay próximas recepciones para esta fecha.</p>
                    ) : null}
                    {upcomingDayCitas.map((cita) => (
                      <button key={`up-${cita.id}`} type="button" onClick={() => openEditModal(cita)} className="w-full text-left p-3 rounded-lg border border-border-dark bg-surface-dark hover:border-primary/40 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-primary">{String(cita.hora_cita || "").slice(0, 5)}</span>
                          <span className="text-[10px] text-slate-500">ADM-{cita.orden_admision_id}</span>
                        </div>
                        <p className="text-sm font-bold text-white truncate">{cita.nb_cliente || "Sin cliente"}</p>
                        <p className="text-[11px] text-slate-500 truncate">{cita.marca_vehiculo} {cita.tipo_vehiculo}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 motion-safe:animate-[fadeInSoft_.18s_ease-out]">
          <div className="w-full max-w-3xl glass-effect border border-border-dark rounded-2xl shadow-2xl overflow-hidden motion-safe:animate-[scaleIn_.2s_ease-out]">
            <div className="flex items-center justify-between px-8 py-6 border-b border-border-dark bg-background-dark/40">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">
                  {editingId ? "Editar cita" : "Nueva / Editar Cita"}
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  Complete los detalles para la agenda de colisión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="max-h-[80vh] overflow-y-auto custom-scrollbar" onSubmit={handleSubmit}>
              <div className="p-8 space-y-7">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Orden de Admisión
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-3.5 text-slate-500">search</span>
                    <input
                      type="text"
                      className="w-full pl-12 pr-10 py-3.5 bg-background-dark/70 border border-border-dark rounded-lg text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      placeholder="Buscar por ID o Nombre de Cliente..."
                      value={orderQuery}
                      onFocus={() => setOrderDropdownOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setOrderDropdownOpen(false);
                          if (form.orden_admision_id) {
                            setOrderQuery(formatOrderLabel(selectedOrder));
                          }
                        }, 120);
                      }}
                      onChange={(event) => {
                        setOrderQuery(event.target.value);
                        setOrderDropdownOpen(true);
                        if (form.orden_admision_id) {
                          setForm((prev) => ({ ...prev, orden_admision_id: "" }));
                        }
                      }}
                    />
                    <span className="material-symbols-outlined absolute right-4 top-3.5 text-slate-500 pointer-events-none">expand_more</span>
                    {orderDropdownOpen ? (
                      <div className="absolute z-40 mt-2 w-full max-h-56 overflow-auto rounded-lg border border-border-dark bg-background-dark shadow-2xl custom-scrollbar">
                        {!filteredOrders.length ? (
                          <p className="px-4 py-3 text-sm text-slate-400">Sin resultados.</p>
                        ) : (
                          filteredOrders.map((order) => {
                            const isSelected = String(order.id) === String(form.orden_admision_id || "");
                            return (
                              <button
                                key={order.id}
                                type="button"
                                className={`w-full text-left px-4 py-2.5 text-sm border-b border-border-dark last:border-b-0 transition-colors ${
                                  isSelected ? "bg-primary/15 text-white" : "text-slate-200 hover:bg-surface-dark"
                                }`}
                                onMouseDown={() => {
                                  setForm((prev) => ({ ...prev, orden_admision_id: String(order.id) }));
                                  setOrderQuery(formatOrderLabel(order));
                                  setOrderDropdownOpen(false);
                                }}
                              >
                                {formatOrderLabel(order)}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  {!form.orden_admision_id ? <p className="text-[11px] text-slate-500">Selecciona una orden para continuar.</p> : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                      Fecha de Cita
                    </label>
                    <div className="bg-background-dark/50 p-4 rounded-xl border border-border-dark">
                      <div className="flex items-center justify-between mb-4">
                        <button
                          type="button"
                          className="p-1 hover:bg-surface-dark rounded-full transition-colors"
                          onClick={() =>
                            setModalMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                          }
                        >
                          <span className="material-symbols-outlined text-sm">chevron_left</span>
                        </button>
                        <span className="text-sm font-bold text-white capitalize">{monthLabel(modalMonthCursor)}</span>
                        <button
                          type="button"
                          className="p-1 hover:bg-surface-dark rounded-full transition-colors"
                          onClick={() =>
                            setModalMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                          }
                        >
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-500 mb-2">
                        {["D", "L", "M", "X", "J", "V", "S"].map((day) => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {modalCalendarCells.slice(0, 35).map((cell) => {
                          const isSelected = cell.ymd === form.fecha_cita;
                          return (
                            <button
                              key={`modal-${cell.ymd}`}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, fecha_cita: cell.ymd }))}
                              className={`h-8 flex items-center justify-center text-xs rounded-full transition-colors ${
                                isSelected
                                  ? "bg-primary text-white font-black"
                                  : cell.inMonth
                                    ? "text-white hover:bg-surface-dark"
                                    : "text-slate-600"
                              }`}
                            >
                              {cell.date.getDate()}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="date"
                        className="mt-3 w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.fecha_cita}
                        onChange={(event) => setForm((prev) => ({ ...prev, fecha_cita: event.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                      Horario Disponible
                    </label>
                    <div className="space-y-3">
                      <div className="relative">
                        <select
                          className={`w-full pl-4 pr-10 py-3.5 bg-background-dark/70 border ${selectedTimeStatusClass} rounded-lg text-white appearance-none focus:ring-2 focus:ring-primary/30 transition-all`}
                          value={form.hora_cita}
                          onChange={(event) => setForm((prev) => ({ ...prev, hora_cita: event.target.value }))}
                          required
                        >
                          {!modalTimeSlots.includes(String(form.hora_cita || "").slice(0, 5)) &&
                          form.hora_cita ? (
                            <option value={form.hora_cita}>
                              {form.hora_cita} - Personalizado
                            </option>
                          ) : null}
                          {modalTimeSlots.map((slot) => (
                            <option
                              key={slot}
                              value={slot}
                              disabled={(modalSlotStatus[slot] || "Disponible") === "Ocupado"}
                            >
                              {slot} - {modalSlotStatus[slot] || "Disponible"}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">schedule</span>
                      </div>
                      {loadingModalDayCitas ? (
                        <p className="text-[11px] text-slate-500">Calculando disponibilidad...</p>
                      ) : null}
                      {!loadingModalDayCitas && selectedTimeIsBlocked ? (
                        <p className="text-[11px] text-alert-red font-semibold">
                          Ese horario está ocupado. Selecciona uno disponible para continuar.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <span className="px-3 py-1 bg-alert-green/10 border border-alert-green/30 text-alert-green text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-alert-green rounded-full"></span> Disponible ({modalAvailabilityCounts.disponible})
                        </span>
                        <span className="px-3 py-1 bg-alert-red/10 border border-alert-red/30 text-alert-red text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-alert-red rounded-full"></span> Ocupado ({modalAvailabilityCounts.ocupado})
                        </span>
                        <span className="px-3 py-1 bg-alert-amber/10 border border-alert-amber/30 text-alert-amber text-[10px] font-bold uppercase rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-alert-amber rounded-full"></span> Tentativo ({modalAvailabilityCounts.tentativo})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-3">
                    <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">Estado</label>
                    <div className="relative">
                      <select
                        className="w-full pl-4 pr-10 py-3.5 bg-background-dark/70 border border-border-dark rounded-lg text-white appearance-none focus:ring-2 focus:ring-primary/30 transition-all"
                        value={form.estado}
                        onChange={(event) => setForm((prev) => ({ ...prev, estado: event.target.value }))}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">label</span>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-3">
                    <label className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">Notas adicionales</label>
                    <textarea
                      rows={3}
                      className="w-full px-4 py-3.5 bg-background-dark/70 border border-border-dark rounded-lg text-white focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                      value={form.notas}
                      onChange={(event) => setForm((prev) => ({ ...prev, notas: event.target.value }))}
                      placeholder="Detalles específicos del daño o requerimientos del cliente..."
                    />
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 border-t border-border-dark bg-background-dark/40 flex justify-end gap-4">
                <button
                  type="button"
                  className="px-6 py-2.5 rounded-lg font-semibold text-slate-300 hover:bg-slate-700/50 transition-all border border-transparent"
                  onClick={() => !saving && setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || selectedTimeIsBlocked}
                  className="px-8 py-2.5 rounded-lg font-bold bg-primary text-white hover:shadow-[0_0_20px_rgba(37,110,116,0.35)] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  {saving ? "Guardando..." : editingId ? "Guardar cita" : "Guardar cita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
