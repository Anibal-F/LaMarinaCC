import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

export default function CatalogoModelosAutos() {
  const [modelos, setModelos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [query, setQuery] = useState("");
  const [marcaFilter, setMarcaFilter] = useState("");
  const [sortBy, setSortBy] = useState("nb_modelo");
  const [sortDir, setSortDir] = useState("asc");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({ marca_id: "", nb_modelo: "" });
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [toast, setToast] = useState(null);

  const load = async () => {
    try {
      const [modelosRes, marcasRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/catalogos/modelos-autos`),
        fetch(`${import.meta.env.VITE_API_URL}/catalogos/marcas-autos`)
      ]);

      if (!modelosRes.ok) {
        throw new Error("No se pudieron cargar los modelos");
      }
      if (!marcasRes.ok) {
        throw new Error("No se pudieron cargar las marcas");
      }

      const modelosPayload = await modelosRes.json();
      const marcasPayload = await marcasRes.json();
      setModelos(modelosPayload || []);
      setMarcas(marcasPayload || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los modelos");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, marcaFilter, sortBy, sortDir]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const marcaOptions = useMemo(
    () =>
      Array.from(new Set(modelos.map((item) => String(item.nb_marca || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es-MX")
      ),
    [modelos]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = modelos.filter((modelo) => {
      const marca = String(modelo.nb_marca || "").toLowerCase();
      const nombre = String(modelo.nb_modelo || "").toLowerCase();
      const matchesQuery = !normalized || [marca, nombre].some((value) => value.includes(normalized));
      if (!matchesQuery) return false;
      if (marcaFilter && String(modelo.nb_marca || "") !== marcaFilter) return false;
      return true;
    });
    const dir = sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      const left = String(a?.[sortBy] || "");
      const right = String(b?.[sortBy] || "");
      return left.localeCompare(right, "es-MX", { sensitivity: "base" }) * dir;
    });
  }, [modelos, query, marcaFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.marca_id) errors.marca_id = "Selecciona una marca";
    if (!form.nb_modelo.trim()) errors.nb_modelo = "Nombre de modelo requerido";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const payload = {
        marca_id: Number(form.marca_id),
        nb_modelo: form.nb_modelo.trim()
      };

      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/catalogos/modelos-autos/${editingId}`
          : `${import.meta.env.VITE_API_URL}/catalogos/modelos-autos`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar el modelo");
      }

      setForm({ marca_id: "", nb_modelo: "" });
      setEditingId(null);
      setShowForm(false);
      await load();
      setToast({
        type: "success",
        message: editingId ? "Modelo actualizado." : "Modelo guardado."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar el modelo");
      setToast({ type: "error", message: err.message || "No se pudo guardar el modelo." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/catalogos/modelos-autos/${deleteTarget.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar el modelo");
      }

      setDeleteTarget(null);
      await load();
      setToast({ type: "success", message: "Modelo eliminado." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el modelo");
      setToast({ type: "error", message: err.message || "No se pudo eliminar el modelo." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Modelos Automotrices</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar modelo o marca..."
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
                  setForm({ marca_id: "", nb_modelo: "" });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nuevo Modelo"}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <section className="bg-surface-dark border border-border-dark rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filtro marca</label>
                <select
                  className="w-full rounded-lg border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                  value={marcaFilter}
                  onChange={(event) => setMarcaFilter(event.target.value)}
                >
                  <option value="">Todas</option>
                  {marcaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Ordenar por</label>
                <select
                  className="w-full rounded-lg border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="nb_modelo">Modelo</option>
                  <option value="nb_marca">Marca</option>
                  <option value="created_at">Registro</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Orden</label>
                <select
                  className="w-full rounded-lg border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                  value={sortDir}
                  onChange={(event) => setSortDir(event.target.value)}
                >
                  <option value="asc">A → Z</option>
                  <option value="desc">Z → A</option>
                </select>
              </div>
            </section>

            {showForm ? (
              <form
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
                onSubmit={handleSubmit}
              >
                <select
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  value={form.marca_id}
                  onChange={(event) => setForm({ ...form, marca_id: event.target.value })}
                >
                  <option value="">Selecciona marca</option>
                  {marcas.map((marca) => (
                    <option key={marca.id} value={marca.id}>
                      {marca.nb_marca}
                    </option>
                  ))}
                </select>
                {fieldErrors.marca_id ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldErrors.marca_id}</p>
                ) : null}

                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Ej. MINI DOLPHIN"
                  value={form.nb_modelo}
                  onChange={(event) => setForm({ ...form, nb_modelo: event.target.value })}
                />
                {fieldErrors.nb_modelo ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldErrors.nb_modelo}</p>
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
                      Marca
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Modelo
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
                  {paged.map((modelo) => (
                    <tr key={modelo.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-slate-300">{modelo.nb_marca || "-"}</td>
                      <td className="px-4 py-3 text-sm text-white font-semibold">{modelo.nb_modelo}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{modelo.created_at || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(modelo.id);
                              setForm({
                                marca_id: String(modelo.marca_id || ""),
                                nb_modelo: modelo.nb_modelo || ""
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(modelo)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                        No hay modelos para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <p>
                Mostrando {paged.length} de {filtered.length} registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded border border-border-dark disabled:opacity-40"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page === 1}
                  type="button"
                >
                  Anterior
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  className="px-3 py-1 rounded border border-border-dark disabled:opacity-40"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page === totalPages}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-surface-dark border border-border-dark rounded-xl p-6">
            <h3 className="text-lg font-bold text-white">Eliminar modelo</h3>
            <p className="text-sm text-slate-300 mt-2">
              ¿Deseas eliminar <span className="font-semibold">{deleteTarget.nb_modelo}</span>?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded border border-border-dark text-slate-300"
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded bg-alert-red text-white"
                type="button"
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
