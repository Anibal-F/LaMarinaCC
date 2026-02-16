import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

export default function CatalogoPartesAuto() {
  const [partes, setPartes] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [form, setForm] = useState({ nb_parte: "" });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [toast, setToast] = useState(null);

  const load = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar las partes");
      }
      const payload = await response.json();
      setPartes(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las partes");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return partes;
    return partes.filter((parte) =>
      String(parte.nb_parte || "").toLowerCase().includes(normalized)
    );
  }, [partes, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldError("");

    if (!form.nb_parte.trim()) {
      setFieldError("Nombre de parte requerido");
      return;
    }

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/catalogos/partes-auto/${editingId}`
          : `${import.meta.env.VITE_API_URL}/catalogos/partes-auto`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar la parte");
      }

      setForm({ nb_parte: "" });
      setEditingId(null);
      setShowForm(false);
      load();
      setToast({
        type: "success",
        message: editingId ? "Parte actualizada." : "Parte guardada."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar la parte");
      setToast({ type: "error", message: err.message || "No se pudo guardar la parte." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/catalogos/partes-auto/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar la parte");
      }
      setDeleteTarget(null);
      load();
      setToast({ type: "success", message: "Parte eliminada." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar la parte");
      setToast({ type: "error", message: err.message || "No se pudo eliminar la parte." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Partes de Auto</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar parte..."
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                type="button"
                onClick={() => {
                  setShowForm((value) => !value);
                  setEditingId(null);
                  setForm({ nb_parte: "" });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nueva Parte"}
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {showForm ? (
              <form
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
                onSubmit={handleSubmit}
              >
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="FACIA DELANTERA"
                  value={form.nb_parte}
                  onChange={(event) => setForm({ nb_parte: event.target.value })}
                />
                {fieldError ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldError}</p>
                ) : null}
                <div className="md:col-span-3 flex justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white">
                    {editingId ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : null}

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <div className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-dark/50">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Parte
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Registro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((parte) => (
                    <tr key={parte.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">{parte.nb_parte}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{parte.created_at || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(parte.id);
                              setForm({ nb_parte: parte.nb_parte });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(parte)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                        No hay partes para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>
                Mostrando {paged.length} de {filtered.length} registros
              </p>
              <div className="flex gap-4 items-center">
                <button
                  className="flex items-center gap-1 hover:text-white transition-colors disabled:opacity-40"
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span> Anterior
                </button>
                <span className="text-white bg-primary size-5 flex items-center justify-center rounded">
                  {page}
                </span>
                <button
                  className="flex items-center gap-1 hover:text-white transition-colors disabled:opacity-40"
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Siguiente <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </main>
        {deleteTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-sm bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4">Eliminar parte</h3>
              <p className="text-sm text-slate-300">
                ¿Seguro que deseas eliminar "{deleteTarget.nb_parte}"?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-alert-red text-white"
                  onClick={handleDelete}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {toast ? <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} /> : null}
      </div>
    </div>
  );
}
