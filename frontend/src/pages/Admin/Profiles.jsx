import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

const statusOptions = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Activos" },
  { id: "inactive", label: "Inactivos" }
];

export default function AdminProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    profile_name: "",
    description: "",
    status: true
  });

  const fetchProfiles = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/profiles`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los perfiles");
      }
      const payload = await response.json();
      setProfiles(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los perfiles");
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesQuery =
        !normalizedQuery ||
        profile.profile_name.toLowerCase().includes(normalizedQuery) ||
        (profile.description || "").toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && profile.status) ||
        (statusFilter === "inactive" && !profile.status);

      return matchesQuery && matchesStatus;
    });
  }, [profiles, query, statusFilter]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.profile_name.trim()) {
      errors.profile_name = "Nombre requerido";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/admin/profiles/${editingId}`
          : `${import.meta.env.VITE_API_URL}/admin/profiles`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar el perfil");
      }

      setForm({ profile_name: "", description: "", status: true });
      setEditingId(null);
      setShowForm(false);
      fetchProfiles();
      setToast({
        type: "success",
        message: editingId ? "Perfil actualizado." : "Perfil guardado."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil");
      setToast({ type: "error", message: err.message || "No se pudo guardar el perfil." });
    }
  };

  const handleDelete = async (profileId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/profiles/${profileId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar el perfil");
      }
      setProfiles((prev) => prev.filter((item) => item.id !== profileId));
      setDeleteTarget(null);
      setToast({ type: "success", message: "Perfil eliminado." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el perfil");
      setToast({ type: "error", message: err.message || "No se pudo eliminar el perfil." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Perfiles</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar por nombre o descripción..."
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
                  setForm({ profile_name: "", description: "", status: true });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nuevo Perfil"}
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {showForm ? (
              <form
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-4"
                onSubmit={handleSubmit}
              >
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Nombre del perfil"
                  value={form.profile_name}
                  onChange={(event) => setForm({ ...form, profile_name: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Descripción"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Activo</label>
                  <input
                    type="checkbox"
                    checked={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.checked })}
                  />
                </div>
                <div className="md:col-span-4 flex justify-end gap-3">
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
                {fieldErrors.profile_name ? (
                  <p className="text-xs text-alert-red md:col-span-4">{fieldErrors.profile_name}</p>
                ) : null}
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
                      Perfil
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Estatus
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((profile) => (
                    <tr key={profile.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {profile.profile_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {profile.description || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            profile.status
                              ? "bg-alert-green/10 text-alert-green"
                              : "bg-alert-red/10 text-alert-red"
                          }`}
                        >
                          {profile.status ? "Activo" : "Inactivo"}
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
                              setEditingId(profile.id);
                              setForm({
                                profile_name: profile.profile_name,
                                description: profile.description || "",
                                status: Boolean(profile.status)
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(profile)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProfiles.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={4}>
                        No hay perfiles para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {filteredProfiles.length} de {profiles.length} registros</p>
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
              <h3 className="text-lg font-bold text-white">Eliminar perfil</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Deseas eliminar el perfil <span className="text-white font-semibold">{deleteTarget.profile_name}</span>?
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
