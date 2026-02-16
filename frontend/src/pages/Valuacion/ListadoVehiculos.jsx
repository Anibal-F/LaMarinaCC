import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const timeFilterOptions = [
  { value: "todos", label: "Todos los tiempos" },
  { value: "urgente", label: "Mas de 3 dias (Urgente)" },
  { value: "hoy", label: "Ingresados hoy" }
];

function formatFechaHora(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusClasses(status) {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("pendiente")) {
    return "bg-alert-red/10 border border-alert-red/20 text-alert-red";
  }
  if (normalized.includes("taller")) {
    return "bg-alert-amber/10 border border-alert-amber/20 text-alert-amber";
  }
  if (normalized.includes("transito")) {
    return "bg-slate-500/10 border border-slate-500/20 text-slate-300";
  }
  return "bg-primary/10 border border-primary/20 text-primary";
}

function dayClasses(days) {
  if (days >= 4) return "text-alert-red";
  if (days >= 2) return "text-alert-amber";
  return "text-slate-200";
}

export default function ListadoVehiculosValuacion() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [aseguradoraFilter, setAseguradoraFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("todos");

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/valuacion/vehiculos`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el listado de valuacion.");
      }
      const payload = await response.json();
      setRecords(payload);
    } catch (err) {
      setError(err.message || "No se pudo cargar el listado de valuacion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const aseguradoras = useMemo(() => {
    const unique = new Set(
      records.map((record) => (record.seguro_comp || "").trim()).filter(Boolean)
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "es"));
  }, [records]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const matchesQuery =
        !normalizedQuery ||
        String(record.reporte_siniestro || "").toLowerCase().includes(normalizedQuery) ||
        String(record.placas || "").toLowerCase().includes(normalizedQuery) ||
        String(record.nb_cliente || "").toLowerCase().includes(normalizedQuery) ||
        String(record.vehiculo || "").toLowerCase().includes(normalizedQuery);

      const matchesAseguradora =
        !aseguradoraFilter ||
        (record.seguro_comp || "").toLowerCase() === aseguradoraFilter.toLowerCase();

      const matchesTime =
        timeFilter === "todos" ||
        (timeFilter === "urgente" && Number(record.dias_espera || 0) >= 4) ||
        (timeFilter === "hoy" && Number(record.dias_espera || 0) === 0);

      return matchesQuery && matchesAseguradora && matchesTime;
    });
  }, [records, query, aseguradoraFilter, timeFilter]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AppHeader
            title="Unidades en Espera de Valuacion"
            subtitle="Gestion de prioridades y asignacion de presupuestos."
            showSearch
            searchPlaceholder="Buscar folio, placas o cliente..."
            searchValue={query}
            onSearchChange={setQuery}
            actions={
              <>
                <select
                  className="bg-surface-dark border border-border-dark text-white text-xs rounded-lg py-2.5 px-3 focus:ring-1 focus:ring-primary focus:border-primary"
                  value={aseguradoraFilter}
                  onChange={(event) => setAseguradoraFilter(event.target.value)}
                >
                  <option value="">Todas las aseguradoras</option>
                  {aseguradoras.map((aseguradora) => (
                    <option key={aseguradora} value={aseguradora}>
                      {aseguradora}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-surface-dark border border-border-dark text-white text-xs rounded-lg py-2.5 px-3 focus:ring-1 focus:ring-primary focus:border-primary"
                  value={timeFilter}
                  onChange={(event) => setTimeFilter(event.target.value)}
                >
                  {timeFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  className="bg-surface-dark hover:bg-primary/20 text-white p-2.5 rounded-lg border border-border-dark transition-colors"
                  title="Actualizar lista"
                  type="button"
                  onClick={loadRecords}
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
              </>
            }
          />

          <div className="flex-1 bg-surface-dark border border-border-dark rounded-xl overflow-hidden flex flex-col shadow-xl m-6 mt-6">
            <div className="overflow-x-auto custom-scrollbar flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-background-dark sticky top-0 z-10 border-b border-border-dark">
                  <tr>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Reporte/Siniestro
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Fecha admisión
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Vehiculo
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Placas
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Aseguradora
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Estatus siniestro
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">
                      Dias espera
                    </th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-sm text-slate-400">
                        Cargando unidades...
                      </td>
                    </tr>
                  ) : null}
                  {!loading && error ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-sm text-alert-red">
                        {error}
                      </td>
                    </tr>
                  ) : null}
                  {!loading && !error && filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-sm text-slate-400">
                        No hay unidades para mostrar.
                      </td>
                    </tr>
                  ) : null}
                  {!loading &&
                    !error &&
                    filtered.map((record) => (
                      <tr
                        key={record.id}
                        className="transition-colors border-l-4 border-l-transparent hover:border-l-primary hover:bg-primary/5"
                      >
                        <td className="p-4 font-mono text-xs font-bold text-white">
                          {record.reporte_siniestro || "-"}
                        </td>
                        <td className="p-4 text-xs text-slate-400">
                          {formatFechaHora(record.fecha_adm)}
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="text-sm font-bold text-white">{record.vehiculo || "-"}</p>
                            <p className="text-[10px] text-slate-400">
                              {record.vehiculo_anio || "-"} • {record.vehiculo_color || "-"}
                            </p>
                            <p className="text-[10px] text-slate-500">{record.nb_cliente || "-"}</p>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-bold text-white">{record.placas || "-"}</td>
                        <td className="p-4 text-xs text-slate-300">{record.seguro_comp || "-"}</td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${statusClasses(
                              record.estatus
                            )}`}
                          >
                            {record.estatus || "Sin estatus"}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-sm font-black ${dayClasses(record.dias_espera)}`}>
                            {record.dias_espera || 0}
                          </span>
                          <span className="text-[10px] block text-slate-500 uppercase">Dias</span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-3 py-1.5 rounded text-xs font-bold transition-all shadow-lg shadow-primary/20"
                            type="button"
                            onClick={() =>
                              navigate(`/valuacion/vehiculos/${record.id}`, { state: { record } })
                            }
                          >
                            <span className="material-symbols-outlined text-sm">calculate</span>
                            Valuar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="bg-background-dark border-t border-border-dark p-3 flex justify-between items-center text-xs text-slate-400">
              <span>
                Mostrando {filtered.length} de {records.length} unidades
              </span>
              <div className="text-[11px]">Valuacion</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
