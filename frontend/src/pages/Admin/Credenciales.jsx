import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

export default function AdminCredenciales() {
  const [credenciales, setCredenciales] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState(new Set());
  const [form, setForm] = useState({
    seguro: "",
    plataforma_url: "",
    usuario: "",
    password: "",
    taller_id: "",
    activo: true
  });

  const fetchCredenciales = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/credenciales`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar las credenciales");
      }
      const payload = await response.json();
      setCredenciales(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las credenciales");
    }
  };

  useEffect(() => {
    fetchCredenciales();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredCredenciales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return credenciales.filter((cred) => {
      const matchesQuery =
        !normalizedQuery ||
        cred.seguro.toLowerCase().includes(normalizedQuery) ||
        cred.usuario.toLowerCase().includes(normalizedQuery) ||
        (cred.plataforma_url && cred.plataforma_url.toLowerCase().includes(normalizedQuery));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && cred.activo) ||
        (statusFilter === "inactive" && !cred.activo);

      return matchesQuery && matchesStatus;
    });
  }, [credenciales, query, statusFilter]);

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/credenciales/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la credencial");
      }

      setCredenciales((prev) => prev.filter((item) => item.id !== id));
      setDeleteTarget(null);
      setToast({ type: "success", message: "Credencial eliminada." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar la credencial");
      setToast({ type: "error", message: err.message || "No se pudo eliminar la credencial." });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.seguro.trim()) {
      errors.seguro = "Nombre del seguro requerido";
    }
    if (!form.plataforma_url.trim()) {
      errors.plataforma_url = "URL de la plataforma requerida";
    }
    if (!form.usuario.trim()) {
      errors.usuario = "Usuario requerido";
    }
    if (!form.password.trim()) {
      errors.password = "Contraseña requerida";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const payload = { ...form };

      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/admin/credenciales/${editingId}`
          : `${import.meta.env.VITE_API_URL}/admin/credenciales`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar la credencial");
      }

      setForm({
        seguro: "",
        plataforma_url: "",
        usuario: "",
        password: "",
        taller_id: "",
        activo: true
      });
      setFieldErrors({});
      setEditingId(null);
      setShowForm(false);
      fetchCredenciales();
      setToast({
        type: "success",
        message: editingId ? "Credencial actualizada." : "Credencial guardada."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar la credencial");
      setToast({ type: "error", message: err.message || "No se pudo guardar la credencial." });
    }
  };

  const statusOptions = [
    { id: "all", label: "Todos" },
    { id: "active", label: "Activos" },
    { id: "inactive", label: "Inactivos" }
  ];

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Credenciales</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar por seguro o usuario..."
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
                  setForm({
                    seguro: "",
                    plataforma_url: "",
                    usuario: "",
                    password: "",
                    taller_id: "",
                    activo: true
                  });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nueva Credencial"}
              </button>
              <div className="h-8 w-[1px] bg-border-dark mx-2"></div>
              <button className="relative p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all">
                <span className="material-symbols-outlined">filter_list</span>
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {showForm ? (
              <form
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
                onSubmit={handleSubmit}
              >
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Seguro / Aseguradora *</label>
                  <input
                    className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    placeholder="Ej: QUALITAS, CHUBB, AXA..."
                    value={form.seguro}
                    onChange={(event) => setForm({ ...form, seguro: event.target.value })}
                  />
                  {fieldErrors.seguro ? (
                    <p className="text-xs text-alert-red mt-1">{fieldErrors.seguro}</p>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Plataforma (URL) *</label>
                  <input
                    className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    placeholder="https://..."
                    value={form.plataforma_url}
                    onChange={(event) => setForm({ ...form, plataforma_url: event.target.value })}
                  />
                  {fieldErrors.plataforma_url ? (
                    <p className="text-xs text-alert-red mt-1">{fieldErrors.plataforma_url}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Usuario *</label>
                  <input
                    className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    placeholder="usuario@ejemplo.com"
                    value={form.usuario}
                    onChange={(event) => setForm({ ...form, usuario: event.target.value })}
                  />
                  {fieldErrors.usuario ? (
                    <p className="text-xs text-alert-red mt-1">{fieldErrors.usuario}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Contraseña *</label>
                  <div className="relative">
                    <input
                      className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 pr-10 text-sm text-white"
                      placeholder={editingId ? "Nueva contraseña (opcional)" : "Contraseña"}
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition-colors"
                      onClick={() => setShowPassword((prev) => !prev)}
                      title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <p className="text-xs text-alert-red mt-1">{fieldErrors.password}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">ID Taller</label>
                  <input
                    className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                    placeholder="Ej: 96627"
                    value={form.taller_id}
                    onChange={(event) => setForm({ ...form, taller_id: event.target.value })}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Activo</label>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(event) => setForm({ ...form, activo: event.target.checked })}
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white">
                    {editingId ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">
                Filtrar por estatus:
              </span>
              {statusOptions.map((option) => (
                <button
                  key={option.id}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                    statusFilter === option.id
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-surface-dark text-slate-400 border-border-dark hover:text-white"
                  }`}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <div className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-dark/50">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Seguro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Plataforma
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Usuario
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Contraseña
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      ID Taller
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCredenciales.map((cred) => (
                    <tr key={cred.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {cred.seguro || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate" title={cred.plataforma_url}>
                        {cred.plataforma_url || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cred.usuario}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="font-mono bg-surface-dark px-2 py-1 rounded text-xs">
                            {visiblePasswords.has(cred.id) ? cred.password : "••••••••"}
                          </span>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                            onClick={() => {
                              setVisiblePasswords((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(cred.id)) {
                                  newSet.delete(cred.id);
                                } else {
                                  newSet.add(cred.id);
                                }
                                return newSet;
                              });
                            }}
                            title={visiblePasswords.has(cred.id) ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            <span className="material-symbols-outlined text-base">
                              {visiblePasswords.has(cred.id) ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cred.taller_id || "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            cred.activo
                              ? "bg-alert-green/10 text-alert-green"
                              : "bg-alert-red/10 text-alert-red"
                          }`}
                        >
                          {cred.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(cred.id);
                              setForm({
                                seguro: cred.seguro || "",
                                plataforma_url: cred.plataforma_url || "",
                                usuario: cred.usuario || "",
                                password: "",
                                taller_id: cred.taller_id || "",
                                activo: Boolean(cred.activo)
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(cred)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCredenciales.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                        No hay credenciales para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {filteredCredenciales.length} de {credenciales.length} registros</p>
            </div>
          </div>
        </main>
      </div>
      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      ) : null}
      {deleteTarget ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-md bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-alert-red">warning</span>
              <h3 className="text-lg font-bold text-white">Eliminar credencial</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Deseas eliminar las credenciales de <span className="text-white font-semibold">{deleteTarget.seguro}</span>?
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
                onClick={() => handleDelete(deleteTarget.id)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
