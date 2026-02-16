import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

export default function CatalogoEstatusValuacion() {
  const [estatus, setEstatus] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldError, setFieldError] = useState("");
  const [form, setForm] = useState({ nombre_estatus: "", descripcion: "" });
  const [toast, setToast] = useState(null);

  const load = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/estatus-valuacion`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los estatus");
      }
      const payload = await response.json();
      setEstatus(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los estatus");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return estatus;
    return estatus.filter((item) =>
      String(item.nombre_estatus || "").toLowerCase().includes(normalized)
    );
  }, [estatus, query]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldError("");

    if (!form.nombre_estatus.trim()) {
      setFieldError("Nombre de estatus requerido");
      return;
    }

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/catalogos/estatus-valuacion/${editingId}`
          : `${import.meta.env.VITE_API_URL}/catalogos/estatus-valuacion`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar el estatus");
      }

      setForm({ nombre_estatus: "", descripcion: "" });
      setEditingId(null);
      setShowForm(false);
      load();
      setToast({
        type: "success",
        message: editingId ? "Estatus actualizado." : "Estatus guardado."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar el estatus");
      setToast({ type: "error", message: err.message || "No se pudo guardar el estatus." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/catalogos/estatus-valuacion/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar el estatus");
      }
      setDeleteTarget(null);
      load();
      setToast({ type: "success", message: "Estatus eliminado." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el estatus");
      setToast({ type: "error", message: err.message || "No se pudo eliminar el estatus." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">
                Estatus de Valuación
              </h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar estatus..."
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
                  setForm({ nombre_estatus: "", descripcion: "" });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nuevo Estatus"}
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {showForm ? (
              <form
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
                onSubmit={handleSubmit}
              >
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Pendiente de valuación"
                  value={form.nombre_estatus}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, nombre_estatus: event.target.value }))
                  }
                />
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Descripción (opcional)"
                  value={form.descripcion}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, descripcion: event.target.value }))
                  }
                />
                {fieldError ? (
                  <p className="text-xs text-alert-red md:col-span-2">{fieldError}</p>
                ) : null}
                <div className="md:col-span-2 flex justify-end gap-3">
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
                      Estatus
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {item.nombre_estatus}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{item.descripcion || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(item.id);
                              setForm({
                                nombre_estatus: item.nombre_estatus || "",
                                descripcion: item.descripcion || ""
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                        No hay estatus para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="bg-surface-dark border border-border-dark rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-2">Eliminar estatus</h3>
            <p className="text-sm text-slate-400">
              ¿Eliminar {deleteTarget.nombre_estatus}?
            </p>
            <div className="flex justify-end gap-3 mt-6">
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

      {toast ? <Toast type={toast.type} message={toast.message} /> : null}
    </div>
  );
}
