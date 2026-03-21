import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import Toast from "../../components/Toast.jsx";

const initialForm = {
  clave: "",
  nb_etapa: "",
  activo: true
};

function reorderItems(items, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return items;
  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === draggedId);
  const toIndex = next.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return items;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, orden: index + 1 }));
}

export default function CatalogoEtapasTaller() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [draggedId, setDraggedId] = useState(null);
  const [reordering, setReordering] = useState(false);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
      if (!response.ok) throw new Error("No se pudieron cargar las etapas.");
      const payload = await response.json();
      setItems(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las etapas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [item.clave, item.nb_etapa].some((value) => String(value || "").toLowerCase().includes(normalized)));
  }, [items, query]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setFieldErrors({});
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.clave.trim()) nextErrors.clave = "Clave requerida";
    if (!form.nb_etapa.trim()) nextErrors.nb_etapa = "Nombre requerido";
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateForm();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const orden = editingId
      ? items.find((item) => item.id === editingId)?.orden || items.length || 1
      : items.length + 1;

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/taller/catalogos/etapas/${editingId}`
          : `${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clave: form.clave.trim(),
            nb_etapa: form.nb_etapa.trim(),
            orden,
            activo: Boolean(form.activo)
          })
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar la etapa.");
      }
      resetForm();
      setShowForm(false);
      await loadItems();
      setToast({ type: "success", message: editingId ? "Etapa actualizada." : "Etapa guardada." });
    } catch (err) {
      setToast({ type: "error", message: err.message || "No se pudo guardar la etapa." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas/${deleteTarget.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar la etapa.");
      }
      setDeleteTarget(null);
      await loadItems();
      setToast({ type: "success", message: "Etapa eliminada." });
    } catch (err) {
      setToast({ type: "error", message: err.message || "No se pudo eliminar la etapa." });
    }
  };

  const persistOrder = async (nextItems) => {
    try {
      setReordering(true);
      // Asegurar que los IDs sean números
      const orderedIds = nextItems.map((item) => Number(item.id));
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas/reordenar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: orderedIds })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        // Manejar errores de validación de FastAPI (pueden venir como lista)
        let errorMessage = "No se pudo reordenar las etapas.";
        if (data?.detail) {
          if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map(e => e.msg || String(e)).join(", ");
          } else {
            errorMessage = String(data.detail);
          }
        }
        throw new Error(errorMessage);
      }
      const payload = await response.json();
      setItems(Array.isArray(payload) ? payload : nextItems);
      setToast({ type: "success", message: "Orden de etapas actualizado." });
    } catch (err) {
      await loadItems();
      setToast({ type: "error", message: err.message || "No se pudo reordenar las etapas." });
    } finally {
      setReordering(false);
      setDraggedId(null);
    }
  };

  const handleDropRow = async (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const nextItems = reorderItems(items, draggedId, targetId);
    setItems(nextItems);
    await persistOrder(nextItems);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Etapas de Taller"
            showSearch
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar etapa..."
            actions={
              <button
                type="button"
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                onClick={() => {
                  setShowForm((value) => !value);
                  resetForm();
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nueva Etapa"}
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <section className="rounded-xl border border-border-dark bg-surface-dark p-4 text-sm text-slate-400">
              Arrastra desde el icono de la izquierda para reordenar las etapas. El cambio se guarda automaticamente.
            </section>

            {showForm ? (
              <form className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 rounded-xl border border-border-dark bg-surface-dark p-5" onSubmit={handleSubmit}>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Clave</span>
                  <input
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    value={form.clave}
                    onChange={(event) => setForm((prev) => ({ ...prev, clave: event.target.value }))}
                    placeholder="recepcionado"
                  />
                  {fieldErrors.clave ? <span className="text-xs text-alert-red">{fieldErrors.clave}</span> : null}
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Nombre etapa</span>
                  <input
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    value={form.nb_etapa}
                    onChange={(event) => setForm((prev) => ({ ...prev, nb_etapa: event.target.value }))}
                    placeholder="Recepcionado"
                  />
                  {fieldErrors.nb_etapa ? <span className="text-xs text-alert-red">{fieldErrors.nb_etapa}</span> : null}
                </label>
                <label className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border-dark bg-background-dark text-primary"
                    checked={Boolean(form.activo)}
                    onChange={(event) => setForm((prev) => ({ ...prev, activo: event.target.checked }))}
                  />
                  <span className="text-sm text-white">Activa</span>
                </label>
                <div className="flex justify-end gap-3 pt-6 md:col-span-2 xl:col-span-1">
                  <button
                    type="button"
                    className="rounded-lg border border-border-dark px-4 py-2 text-slate-300 hover:text-white"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-bold text-white hover:bg-primary/90">
                    {editingId ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : null}

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <section className="overflow-hidden rounded-xl border border-border-dark bg-surface-dark">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse text-left">
                  <thead className="border-b border-border-dark bg-background-dark/50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Mover</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Clave</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Etapa</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Orden</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Estatus</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-sm text-slate-400">Cargando etapas...</td>
                      </tr>
                    ) : null}
                    {!loading && filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-sm text-slate-400">No hay etapas para mostrar.</td>
                      </tr>
                    ) : null}
                    {!loading && filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors ${draggedId === item.id ? "bg-primary/10" : "hover:bg-white/5"}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDropRow(item.id)}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          <button
                            type="button"
                            draggable={!reordering}
                            className="rounded-lg border border-border-dark bg-background-dark p-2 hover:text-white disabled:opacity-50"
                            onDragStart={() => setDraggedId(item.id)}
                            onDragEnd={() => setDraggedId(null)}
                            disabled={reordering}
                            title="Arrastrar para reordenar"
                          >
                            <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{item.clave}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{item.nb_etapa}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{item.orden}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${item.activo ? "bg-alert-green/20 text-alert-green" : "bg-slate-500/20 text-slate-300"}`}>
                            {item.activo ? "ACTIVA" : "INACTIVA"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="text-slate-300 hover:text-white"
                              onClick={() => {
                                setEditingId(item.id);
                                setForm({ clave: item.clave || "", nb_etapa: item.nb_etapa || "", activo: Boolean(item.activo) });
                                setShowForm(true);
                                setFieldErrors({});
                              }}
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button
                              type="button"
                              className="text-alert-red hover:text-red-300"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background-dark/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border-dark bg-surface-dark p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-alert-red text-3xl">warning</span>
              <div>
                <h3 className="text-lg font-bold text-white">Eliminar etapa</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Esta accion eliminara la etapa seleccionada. ¿Deseas continuar?
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-border-dark px-4 py-2 text-slate-300 hover:text-white"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-alert-red px-4 py-2 font-bold text-white hover:bg-alert-red/90"
                onClick={handleDelete}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
