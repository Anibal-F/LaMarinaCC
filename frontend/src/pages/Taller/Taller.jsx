import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { resolveMediaUrl } from "../../utils/media.js";

const PAGE_SIZE = 8;
const ACTIVE_WORKSHOP_STATUS = ["recepcion", "valuacion", "autorizacion", "taller"];

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(String(value).replace(" ", "T"));
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function formatIngreso(value) {
  const date = parseDate(value);
  if (!date) return { dateText: "-", timeText: "" };
  return {
    dateText: new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date),
    timeText: new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date)
  };
}

function daysInShop(value) {
  const date = parseDate(value);
  if (!date) return 0;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor(diffMs / dayMs));
}

function isWorkshopRecord(record) {
  const status = String(record?.estatus || "").trim().toLowerCase();
  if (!status) return true;
  return ACTIVE_WORKSHOP_STATUS.some((value) => status.includes(value));
}

function dayBadgeClasses(days) {
  if (days >= 4) return "bg-alert-red/20 text-alert-red animate-pulse";
  if (days >= 2) return "bg-alert-amber/20 text-alert-amber";
  return "bg-alert-green/20 text-alert-green";
}

function insurerTagClasses(seguro) {
  const normalized = String(seguro || "").toLowerCase();
  if (normalized.includes("qualitas")) return "bg-violet-500/10 text-violet-300 border-violet-500/30";
  if (normalized.includes("axa")) return "bg-blue-500/10 text-blue-300 border-blue-500/30";
  if (normalized.includes("mapfre")) return "bg-red-500/10 text-red-300 border-red-500/30";
  if (normalized.includes("hdi")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  return "bg-primary/10 text-primary border-primary/30";
}

export default function Taller() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [photoByRecord, setPhotoByRecord] = useState({});

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el listado de taller.");
      }
      const payload = await response.json();
      const recepcionados = (Array.isArray(payload) ? payload : []).filter(isWorkshopRecord);
      setRecords(recepcionados);
      setPage(1);
    } catch (err) {
      setError(err.message || "No se pudo cargar el listado de taller.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;

    return records.filter((record) => {
      const folio = String(record.folio_recep || "").toLowerCase();
      const placa = String(record.placas || "").toLowerCase();
      const vehiculo = String(record.vehiculo || "").toLowerCase();
      const cliente = String(record.nb_cliente || "").toLowerCase();
      const seguro = String(record.seguro || "").toLowerCase();
      return (
        folio.includes(normalized) ||
        placa.includes(normalized) ||
        vehiculo.includes(normalized) ||
        cliente.includes(normalized) ||
        seguro.includes(normalized)
      );
    });
  }, [records, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    const recordsWithoutPhoto = pagedRecords.filter((record) => photoByRecord[record.id] === undefined);
    if (recordsWithoutPhoto.length === 0) return;

    let active = true;

    const loadThumbs = async () => {
      const results = await Promise.all(
        recordsWithoutPhoto.map(async (record) => {
          try {
            const mediaResponse = await fetch(
              `${import.meta.env.VITE_API_URL}/recepcion/registros/${record.id}/media`
            );
            const media = mediaResponse.ok ? await mediaResponse.json() : [];
            const firstPhoto = (Array.isArray(media) ? media : []).find((item) =>
              String(item.media_type || "").startsWith("photo")
            );
            if (firstPhoto?.file_path) {
              return [record.id, resolveMediaUrl(firstPhoto.file_path)];
            }

            const reportId = String(record.folio_seguro || "").trim();
            if (!reportId) {
              return [record.id, null];
            }

            const expedienteResponse = await fetch(
              `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(reportId)}`
            );
            if (!expedienteResponse.ok) {
              return [record.id, null];
            }
            const expedienteData = await expedienteResponse.json();
            const expedientePhoto = (Array.isArray(expedienteData?.archivos) ? expedienteData.archivos : []).find(
              (item) => {
                const tipo = String(item.tipo || "").toLowerCase();
                const path = String(item.archivo_path || "").toLowerCase();
                const mime = String(item.mime_type || "").toLowerCase();
                return (
                  (tipo === "recepcion_foto" || tipo === "valuacion_foto" || tipo === "archivorecepcion_vehiculo") &&
                  (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) => path.endsWith(ext)))
                );
              }
            );
            return [
              record.id,
              expedientePhoto?.archivo_path ? resolveMediaUrl(expedientePhoto.archivo_path) : null
            ];
          } catch {
            return [record.id, null];
          }
        })
      );

      if (!active) return;
      setPhotoByRecord((prev) => {
        const next = { ...prev };
        results.forEach(([id, photoUrl]) => {
          next[id] = photoUrl;
        });
        return next;
      });
    };

    loadThumbs();
    return () => {
      active = false;
    };
  }, [pagedRecords, photoByRecord]);

  const todayReceived = useMemo(() => {
    const now = new Date();
    return records.filter((record) => {
      const date = parseDate(record.fecha_recep);
      if (!date) return false;
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      );
    }).length;
  }, [records]);

  const pendingAssign = useMemo(
    () =>
      records.filter((record) => {
        const status = String(record.estatus || "").toLowerCase();
        return !status.includes("taller");
      }).length,
    [records]
  );

  const delayedCount = useMemo(
    () => records.filter((record) => daysInShop(record.fecha_recep) >= 4).length,
    [records]
  );

  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Autos en Sitio"
            subtitle="Vehiculos recepcionados activos dentro del modulo de taller."
            showSearch={false}
            actions={
              <>
                <Link
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                  to="/recepcion/nuevo"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nueva recepcion
                </Link>
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

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Recibidos hoy</p>
                <p className="text-3xl font-black text-white mt-2">{todayReceived}</p>
              </article>
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pendientes de asignar</p>
                <p className="text-3xl font-black text-white mt-2">{pendingAssign}</p>
              </article>
              <article className="bg-surface-dark border border-border-dark rounded-xl p-5">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">En retraso</p>
                <p className="text-3xl font-black text-white mt-2">{delayedCount}</p>
              </article>
            </div>

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <section className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <div className="p-4 border-b border-border-dark flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                    search
                  </span>
                  <input
                    className="w-full bg-background-dark border-border-dark rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500"
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por folio, placa, vehiculo o cliente..."
                  />
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-background-dark/50 border-b border-border-dark">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Folio</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foto</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vehiculo</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Placa</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aseguradora</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingreso</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Dias taller</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-sm text-slate-400">
                          Cargando vehiculos recepcionados...
                        </td>
                      </tr>
                    ) : null}
                    {!loading && filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-sm text-slate-400">
                          No hay vehiculos recepcionados para mostrar.
                        </td>
                      </tr>
                    ) : null}
                    {!loading &&
                      pagedRecords.map((record) => {
                        const ingreso = formatIngreso(record.fecha_recep);
                        const days = daysInShop(record.fecha_recep);
                        const photo = photoByRecord[record.id];
                        const delayed = days >= 4;

                        return (
                          <tr
                            key={record.id}
                            className={`hover:bg-white/5 transition-colors ${
                              delayed ? "bg-alert-red/5 border-l-2 border-l-alert-red" : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-mono text-xs font-bold text-white">
                              #{record.folio_recep || record.id}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-10 w-16 rounded bg-background-dark border border-border-dark overflow-hidden">
                                {photo ? (
                                  <img src={photo} alt={record.vehiculo || "vehiculo"} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                                    <span className="material-symbols-outlined text-sm">directions_car</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-white">{record.vehiculo || "-"}</p>
                              <p className="text-[11px] text-slate-400">
                                {[record.vehiculo_anio, record.vehiculo_tipo].filter(Boolean).join(" - ") || "Sin detalle"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-xs font-mono uppercase text-slate-300">
                              {record.placas || "-"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${insurerTagClasses(
                                  record.seguro
                                )}`}
                              >
                                {record.seguro || "Sin seguro"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300">
                              <p>{ingreso.dateText}</p>
                              {ingreso.timeText ? <p className="text-slate-500">{ingreso.timeText}</p> : null}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${dayBadgeClasses(
                                  days
                                )}`}
                              >
                                {days}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                className="text-primary hover:text-white hover:bg-primary/20 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 uppercase tracking-wide"
                                type="button"
                                onClick={() => navigate(`/taller/autos-en-sitio/${record.id}`, { state: { record } })}
                              >
                                Gestionar
                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-border-dark bg-background-dark/30 flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-bold tracking-wide">
                  Mostrando {rangeStart} a {rangeEnd} de {filtered.length} resultados
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                    onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                    disabled={page >= pageCount}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
