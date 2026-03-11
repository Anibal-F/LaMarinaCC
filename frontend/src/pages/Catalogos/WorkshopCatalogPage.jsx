import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import Toast from "../../components/Toast.jsx";

function defaultBuildPayload(form, fields) {
  const payload = {};
  fields.forEach((field) => {
    const value = form[field.key];
    if (field.type === "number" || field.numeric) {
      payload[field.key] = value === "" || value === null || value === undefined ? null : Number(value);
      return;
    }
    if (field.type === "checkbox") {
      payload[field.key] = Boolean(value);
      return;
    }
    payload[field.key] = typeof value === "string" ? value.trim() : value;
  });
  return payload;
}

export default function WorkshopCatalogPage({
  title,
  endpoint,
  singularLabel,
  queryPlaceholder,
  initialForm,
  fields,
  columns,
  searchFields,
  loadAuxiliary,
  buildPayload,
  mapItemToForm
}) {
  const [items, setItems] = useState([]);
  const [auxData, setAuxData] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState(initialForm);
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [itemsResponse, auxiliaryPayload] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}${endpoint}`),
        loadAuxiliary ? loadAuxiliary() : Promise.resolve({})
      ]);
      if (!itemsResponse.ok) {
        throw new Error(`No se pudo cargar ${singularLabel.toLowerCase()}.`);
      }
      const itemsPayload = await itemsResponse.json();
      setItems(Array.isArray(itemsPayload) ? itemsPayload : []);
      setAuxData(auxiliaryPayload || {});
    } catch (err) {
      setError(err.message || `No se pudo cargar ${singularLabel.toLowerCase()}.`);
    } finally {
      setLoading(false);
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
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      searchFields.some((field) => String(item?.[field] || "").toLowerCase().includes(normalized))
    );
  }, [items, query, searchFields]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const validateForm = () => {
    const nextErrors = {};
    fields.forEach((field) => {
      if (!field.required) return;
      const value = form[field.key];
      if (field.type === "checkbox") return;
      if (value === "" || value === null || value === undefined) {
        nextErrors[field.key] = `${field.label} requerido`;
      }
    });
    return nextErrors;
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setFieldErrors({});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const validation = validateForm();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) return;

    try {
      const payload = buildPayload ? buildPayload(form) : defaultBuildPayload(form, fields);
      const response = await fetch(
        editingId ? `${import.meta.env.VITE_API_URL}${endpoint}/${editingId}` : `${import.meta.env.VITE_API_URL}${endpoint}`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `No se pudo guardar ${singularLabel.toLowerCase()}.`);
      }
      resetForm();
      setShowForm(false);
      await load();
      setToast({
        type: "success",
        message: editingId ? `${singularLabel} actualizado.` : `${singularLabel} guardado.`
      });
    } catch (err) {
      setError(err.message || `No se pudo guardar ${singularLabel.toLowerCase()}.`);
      setToast({ type: "error", message: err.message || `No se pudo guardar ${singularLabel.toLowerCase()}.` });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}${endpoint}/${deleteTarget.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `No se pudo eliminar ${singularLabel.toLowerCase()}.`);
      }
      setDeleteTarget(null);
      await load();
      setToast({ type: "success", message: `${singularLabel} eliminado.` });
    } catch (err) {
      setError(err.message || `No se pudo eliminar ${singularLabel.toLowerCase()}.`);
      setToast({ type: "error", message: err.message || `No se pudo eliminar ${singularLabel.toLowerCase()}.` });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title={title}
            showSearch
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder={queryPlaceholder}
            actions={
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                type="button"
                onClick={() => {
                  setShowForm((value) => !value);
                  resetForm();
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : `Nuevo ${singularLabel}`}
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {showForm ? (
              <form className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" onSubmit={handleSubmit}>
                {fields.map((field) => {
                  const options = field.getOptions ? field.getOptions(auxData, form) : auxData[field.optionsKey] || [];
                  return (
                    <label key={field.key} className={`space-y-1 ${field.type === "checkbox" ? "flex items-center gap-3 pt-6" : ""}`}>
                      {field.type !== "checkbox" ? (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{field.label}</span>
                      ) : null}

                      {field.type === "select" ? (
                        <select
                          className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                          value={form[field.key]}
                          onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                        >
                          <option value="">{field.placeholder || `Selecciona ${field.label.toLowerCase()}`}</option>
                          {options.map((option) => (
                            <option key={option[field.optionValue || "id"]} value={option[field.optionValue || "id"]}>
                              {field.optionLabel ? option[field.optionLabel] : option.nb_etapa || option.nb_area || option.nb_puesto || option.nb_personal}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <>
                          <input
                            type="checkbox"
                            checked={Boolean(form[field.key])}
                            onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.checked }))}
                            className="h-4 w-4 rounded border-border-dark bg-background-dark text-primary"
                          />
                          <span className="text-sm text-white">{field.label}</span>
                        </>
                      ) : (
                        <input
                          type={field.type || "text"}
                          className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white placeholder-slate-500"
                          placeholder={field.placeholder || field.label}
                          value={form[field.key]}
                          min={field.min}
                          max={field.max}
                          onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                        />
                      )}

                      {fieldErrors[field.key] ? <span className="text-xs text-alert-red">{fieldErrors[field.key]}</span> : null}
                    </label>
                  );
                })}

                <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary/90" type="submit">
                    {editingId ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : null}

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <section className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-background-dark/50 border-b border-border-dark">
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {column.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {loading ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="px-4 py-6 text-sm text-slate-400">
                          Cargando {title.toLowerCase()}...
                        </td>
                      </tr>
                    ) : null}
                    {!loading && paged.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 1} className="px-4 py-6 text-sm text-slate-400">
                          No hay registros para mostrar.
                        </td>
                      </tr>
                    ) : null}
                    {!loading &&
                      paged.map((item) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                          {columns.map((column) => (
                            <td key={`${item.id}-${column.key}`} className="px-4 py-3 text-sm text-slate-300">
                              {column.render ? column.render(item, auxData) : item[column.key] ?? "-"}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                className="text-slate-300 hover:text-white"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setForm(mapItemToForm ? mapItemToForm(item) : { ...initialForm, ...item });
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

              <div className="px-4 py-3 border-t border-border-dark bg-background-dark/30 flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-bold tracking-wide">
                  Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados
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
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background-dark/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-surface-dark border border-border-dark rounded-2xl p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-alert-red text-3xl">warning</span>
              <div>
                <h3 className="text-lg font-bold text-white">Eliminar {singularLabel.toLowerCase()}</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Esta acción eliminará el registro seleccionado. ¿Deseas continuar?
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-alert-red text-white font-bold hover:bg-alert-red/90"
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
