import { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import Toast from "../../components/Toast.jsx";

const initialForm = {
  etapa_id: "",
  descripcion: "",
  orden: 1,
  obligatorio: true,
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

export default function CatalogoChecklistTaller() {
  const [items, setItems] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [selectedEtapaId, setSelectedEtapaId] = useState("");
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

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      
      // Cargar etapas
      const etapasRes = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
      if (!etapasRes.ok) throw new Error("No se pudieron cargar las etapas.");
      const etapasData = await etapasRes.json();
      setEtapas(Array.isArray(etapasData) ? etapasData : []);
      
      // Cargar checklist items
      const itemsRes = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/checklist-items`);
      if (!itemsRes.ok) throw new Error("No se pudieron cargar los items.");
      const itemsData = await itemsRes.json();
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      setError(err.message || "Error cargando datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Items filtrados por etapa seleccionada y búsqueda
  const filteredItems = useMemo(() => {
    let result = items;
    
    // Filtrar por etapa
    if (selectedEtapaId) {
      result = result.filter(item => String(item.etapa_id) === String(selectedEtapaId));
    }
    
    // Filtrar por búsqueda
    const normalized = query.trim().toLowerCase();
    if (normalized) {
      result = result.filter(item => 
        (item.descripcion || "").toLowerCase().includes(normalized) ||
        (item.nb_etapa || "").toLowerCase().includes(normalized)
      );
    }
    
    return result;
  }, [items, selectedEtapaId, query]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setFieldErrors({});
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.etapa_id) nextErrors.etapa_id = "Etapa requerida";
    if (!form.descripcion.trim()) nextErrors.descripcion = "Descripción requerida";
    if (!form.orden || form.orden < 1) nextErrors.orden = "Orden inválido";
    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = validateForm();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) return;

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/taller/catalogos/checklist-items/${editingId}`
          : `${import.meta.env.VITE_API_URL}/taller/catalogos/checklist-items`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            etapa_id: parseInt(form.etapa_id),
            descripcion: form.descripcion.trim(),
            orden: parseInt(form.orden),
            obligatorio: Boolean(form.obligatorio),
            activo: Boolean(form.activo)
          })
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar el item.");
      }
      resetForm();
      setShowForm(false);
      await loadData();
      setToast({ type: "success", message: editingId ? "Item actualizado." : "Item guardado." });
    } catch (err) {
      setToast({ type: "error", message: err.message || "Error al guardar." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/checklist-items/${deleteTarget.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar.");
      }
      setDeleteTarget(null);
      await loadData();
      setToast({ type: "success", message: "Item eliminado." });
    } catch (err) {
      setToast({ type: "error", message: err.message || "Error al eliminar." });
    }
  };

  const persistOrder = async (nextItems) => {
    if (!selectedEtapaId) return;
    
    try {
      setReordering(true);
      const orderedIds = nextItems.map(item => parseInt(item.id)).filter(id => !isNaN(id));
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/checklist-items/reordenar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          etapa_id: parseInt(selectedEtapaId), 
          ordered_ids: orderedIds 
        })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        let errorMessage = "No se pudo reordenar.";
        if (data?.detail) {
          if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map(e => typeof e === 'string' ? e : (e.msg || JSON.stringify(e))).join("; ");
          } else {
            errorMessage = String(data.detail);
          }
        }
        throw new Error(errorMessage);
      }
      
      const updatedItems = await response.json();
      
      // Actualizar solo los items de esta etapa en el estado global
      setItems(prev => {
        const otherItems = prev.filter(item => String(item.etapa_id) !== String(selectedEtapaId));
        return [...otherItems, ...updatedItems];
      });
      
      setToast({ type: "success", message: "Orden actualizado." });
    } catch (err) {
      console.error("[persistOrder] Error:", err);
      await loadData();
      setToast({ type: "error", message: err.message || "Error al reordenar." });
    } finally {
      setReordering(false);
      setDraggedId(null);
    }
  };

  const handleDropRow = async (targetId) => {
    if (!draggedId || draggedId === targetId || !selectedEtapaId) return;
    const nextItems = reorderItems(filteredItems, draggedId, targetId);
    setItems(prev => {
      const otherItems = prev.filter(item => String(item.etapa_id) !== String(selectedEtapaId));
      return [...otherItems, ...nextItems];
    });
    await persistOrder(nextItems);
  };

  const selectedEtapa = etapas.find(e => String(e.id) === String(selectedEtapaId));

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Checklist de Taller"
            showSearch
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar checklist..."
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
                {showForm ? "Cerrar formulario" : "Nuevo Item"}
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {/* Filtro de Etapa */}
            <section className="rounded-xl border border-border-dark bg-surface-dark p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Filtrar por Etapa
                  </label>
                  <select
                    value={selectedEtapaId}
                    onChange={(e) => setSelectedEtapaId(e.target.value)}
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  >
                    <option value="">Todas las etapas</option>
                    {etapas.map(etapa => (
                      <option key={etapa.id} value={etapa.id}>
                        {etapa.nb_etapa} (Orden {etapa.orden})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedEtapaId && (
                  <div className="text-sm text-slate-400">
                    Mostrando {filteredItems.length} items de <span className="text-primary font-medium">{selectedEtapa?.nb_etapa}</span>
                  </div>
                )}
              </div>
              
              {selectedEtapaId && (
                <p className="mt-3 text-xs text-slate-500">
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">drag_indicator</span>
                  Arrastra desde el icono de la izquierda para reordenar los items. El cambio se guarda automáticamente.
                </p>
              )}
            </section>

            {showForm ? (
              <form className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 rounded-xl border border-border-dark bg-surface-dark p-5" onSubmit={handleSubmit}>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Etapa</span>
                  <select
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    value={form.etapa_id}
                    onChange={(e) => setForm(prev => ({ ...prev, etapa_id: e.target.value }))}
                  >
                    <option value="">Selecciona etapa</option>
                    {etapas.map(etapa => (
                      <option key={etapa.id} value={etapa.id}>{etapa.nb_etapa}</option>
                    ))}
                  </select>
                  {fieldErrors.etapa_id ? <span className="text-xs text-alert-red">{fieldErrors.etapa_id}</span> : null}
                </label>
                <label className="space-y-1 xl:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Descripción</span>
                  <input
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    value={form.descripcion}
                    onChange={(e) => setForm(prev => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Inspección de chasis"
                  />
                  {fieldErrors.descripcion ? <span className="text-xs text-alert-red">{fieldErrors.descripcion}</span> : null}
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Orden</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    value={form.orden}
                    onChange={(e) => setForm(prev => ({ ...prev, orden: parseInt(e.target.value) || 1 }))}
                  />
                  {fieldErrors.orden ? <span className="text-xs text-alert-red">{fieldErrors.orden}</span> : null}
                </label>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border-dark bg-background-dark text-primary"
                      checked={form.obligatorio}
                      onChange={(e) => setForm(prev => ({ ...prev, obligatorio: e.target.checked }))}
                    />
                    <span className="text-sm text-white">Obligatorio</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border-dark bg-background-dark text-primary"
                      checked={form.activo}
                      onChange={(e) => setForm(prev => ({ ...prev, activo: e.target.checked }))}
                    />
                    <span className="text-sm text-white">Activo</span>
                  </label>
                </div>
                <div className="flex justify-end gap-3 md:col-span-2 xl:col-span-5">
                  <button
                    type="button"
                    className="rounded-lg border border-border-dark px-4 py-2 text-slate-300 hover:text-white"
                    onClick={() => { setShowForm(false); resetForm(); }}
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
                      {selectedEtapaId && <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-16">Mover</th>}
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Etapa</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Descripción</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Orden</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={selectedEtapaId ? 6 : 5} className="px-4 py-6 text-sm text-slate-400">Cargando...</td>
                      </tr>
                    ) : null}
                    {!loading && filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={selectedEtapaId ? 6 : 5} className="px-4 py-6 text-sm text-slate-400">
                          {selectedEtapaId ? "No hay items para esta etapa." : "Selecciona una etapa para ver sus items."}
                        </td>
                      </tr>
                    ) : null}
                    {!loading && filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors ${draggedId === item.id ? "bg-primary/10" : "hover:bg-white/5"}`}
                        onDragOver={(e) => selectedEtapaId && e.preventDefault()}
                        onDrop={() => selectedEtapaId && handleDropRow(item.id)}
                      >
                        {selectedEtapaId && (
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
                        )}
                        <td className="px-4 py-3 text-sm text-slate-300">{item.nb_etapa}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{item.descripcion}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{item.orden}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${item.obligatorio ? "bg-alert-green/20 text-alert-green" : "bg-slate-500/20 text-slate-300"}`}>
                            {item.obligatorio ? "OBLIGATORIO" : "OPCIONAL"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              className="text-slate-300 hover:text-white"
                              onClick={() => {
                                setEditingId(item.id);
                                setForm({
                                  etapa_id: item.etapa_id ? String(item.etapa_id) : "",
                                  descripcion: item.descripcion || "",
                                  orden: item.orden ?? 1,
                                  obligatorio: Boolean(item.obligatorio),
                                  activo: Boolean(item.activo)
                                });
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
                <h3 className="text-lg font-bold text-white">Eliminar item</h3>
                <p className="mt-1 text-sm text-slate-400">
                  ¿Estás seguro de eliminar "{deleteTarget.descripcion}"?
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
