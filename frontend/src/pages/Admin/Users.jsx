import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

const statusOptions = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Activos" },
  { id: "inactive", label: "Inactivos" }
];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    name: "",
    user_name: "",
    email: "",
    password: "",
    profile_id: "",
    status: true
  });

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los usuarios");
      }
      const payload = await response.json();
      setUsers(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los usuarios");
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (!editingId && profiles.length > 0 && !form.profile_id) {
      setForm((prev) => ({ ...prev, profile_id: String(profiles[0].id) }));
    }
  }, [profiles, editingId, form.profile_id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        user.user_name.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.status) ||
        (statusFilter === "inactive" && !user.status);

      return matchesQuery && matchesStatus;
    });
  }, [users, query, statusFilter]);

  const handleDelete = async (userId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users/${userId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar el usuario");
      }

      setUsers((prev) => prev.filter((item) => item.id !== userId));
      setDeleteTarget(null);
      setToast({ type: "success", message: "Usuario eliminado." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el usuario");
      setToast({ type: "error", message: err.message || "No se pudo eliminar el usuario." });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.name.trim()) {
      errors.name = "Nombre requerido";
    }
    if (!form.user_name.trim()) {
      errors.user_name = "Usuario requerido";
    }
    if (!form.email.trim()) {
      errors.email = "Correo requerido";
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      errors.email = "Correo inválido";
    }
    if (!editingId && !form.password.trim()) {
      errors.password = "Contraseña requerida";
    }
    if (form.password && form.password.length < 8) {
      errors.password = "Mínimo 8 caracteres";
    }
    if (profiles.length > 0 && !form.profile_id) {
      errors.profile_id = "Perfil requerido";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const payload = { ...form };
      if (!payload.password) {
        delete payload.password;
      }
      if (payload.profile_id) {
        payload.profile_id = Number(payload.profile_id);
      }

      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/admin/users/${editingId}`
          : `${import.meta.env.VITE_API_URL}/auth/register`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear el usuario");
      }

      setForm({
        name: "",
        user_name: "",
        email: "",
        password: "",
        profile_id: profiles[0]?.id ? String(profiles[0].id) : "",
        status: true
      });
      setFieldErrors({});
      setEditingId(null);
      setShowForm(false);
      fetchUsers();
      setToast({
        type: "success",
        message: editingId ? "Usuario actualizado." : "Usuario guardado."
      });
    } catch (err) {
      setError(err.message || "No se pudo crear el usuario");
      setToast({ type: "error", message: err.message || "No se pudo guardar el usuario." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Usuarios</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar por usuario o correo..."
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
                    name: "",
                    user_name: "",
                    email: "",
                    password: "",
                    profile_id: profiles[0]?.id ? String(profiles[0].id) : "",
                    status: true
                  });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nuevo Usuario"}
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
                className="bg-surface-dark border border-border-dark rounded-xl p-5 grid grid-cols-1 md:grid-cols-5 gap-4"
                onSubmit={handleSubmit}
              >
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Nombre"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
                {fieldErrors.name ? (
                  <p className="text-xs text-alert-red md:col-span-5">{fieldErrors.name}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Usuario"
                  value={form.user_name}
                  onChange={(event) => setForm({ ...form, user_name: event.target.value })}
                />
                {fieldErrors.user_name ? (
                  <p className="text-xs text-alert-red md:col-span-5">{fieldErrors.user_name}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Correo"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
                {fieldErrors.email ? (
                  <p className="text-xs text-alert-red md:col-span-5">{fieldErrors.email}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder={editingId ? "Nueva contraseña (opcional)" : "Contraseña"}
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
                {fieldErrors.password ? (
                  <p className="text-xs text-alert-red md:col-span-5">{fieldErrors.password}</p>
                ) : null}
                <select
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  value={form.profile_id}
                  onChange={(event) => setForm({ ...form, profile_id: event.target.value })}
                >
                  <option value="">Selecciona un perfil</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.profile_name}
                    </option>
                  ))}
                </select>
                {fieldErrors.profile_id ? (
                  <p className="text-xs text-alert-red md:col-span-5">{fieldErrors.profile_id}</p>
                ) : null}
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Activo</label>
                  <input
                    type="checkbox"
                    checked={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.checked })}
                  />
                </div>
                <div className="md:col-span-5 flex justify-end gap-3">
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
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Usuario
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Email
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Perfil
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Estatus
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Creado
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {user.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{user.user_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {user.profile_name || user.profile || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            user.status
                              ? "bg-alert-green/10 text-alert-green"
                              : "bg-alert-red/10 text-alert-red"
                          }`}
                        >
                          {user.status ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(user.id);
                              setForm({
                                name: user.name || "",
                                user_name: user.user_name,
                                email: user.email,
                                password: "",
                                profile_id: user.profile_id ? String(user.profile_id) : "",
                                status: Boolean(user.status)
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                        No hay usuarios para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {filteredUsers.length} de {users.length} registros</p>
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
              <h3 className="text-lg font-bold text-white">Eliminar usuario</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Deseas eliminar a <span className="text-white font-semibold">{deleteTarget.user_name}</span>?
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
