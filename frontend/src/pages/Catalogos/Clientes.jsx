import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import Toast from "../../components/Toast.jsx";

export default function CatalogoClientes() {
  const [clientes, setClientes] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);
  const pageSize = 8;
  const [form, setForm] = useState({
    nb_cliente: "",
    tel_cliente: "",
    email_cliente: "",
    direccion: "",
    cp: "",
    rfc: ""
  });

  const load = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clientes`);
      if (!response.ok) {
        throw new Error("No se pudieron cargar los clientes");
      }
      const payload = await response.json();
      setClientes(payload);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los clientes");
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
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return clientes;

    return clientes.filter((cliente) =>
      [cliente.nb_cliente, cliente.tel_cliente, cliente.email_cliente]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [clientes, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.nb_cliente.trim()) {
      errors.nb_cliente = "Nombre requerido";
    }
    if (!form.tel_cliente.trim()) {
      errors.tel_cliente = "Teléfono requerido";
    } else if (!/^[0-9+\s()-]{7,15}$/.test(form.tel_cliente)) {
      errors.tel_cliente = "Teléfono inválido";
    }
    if (form.email_cliente && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email_cliente)) {
      errors.email_cliente = "Correo inválido";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/clientes/${editingId}`
          : `${import.meta.env.VITE_API_URL}/clientes`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar el cliente");
      }

      setForm({
        nb_cliente: "",
        tel_cliente: "",
        email_cliente: "",
        direccion: "",
        cp: "",
        rfc: ""
      });
      setFieldErrors({});
      setEditingId(null);
      setShowForm(false);
      load();
      setToast({
        type: "success",
        message: editingId ? "Cliente actualizado." : "Cliente guardado."
      });
    } catch (err) {
      setError(err.message || "No se pudo guardar el cliente");
      setToast({ type: "error", message: err.message || "No se pudo guardar el cliente." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clientes/${deleteTarget.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo eliminar el cliente");
      }
      setDeleteTarget(null);
      load();
      setToast({ type: "success", message: "Cliente eliminado." });
    } catch (err) {
      setError(err.message || "No se pudo eliminar el cliente");
      setToast({ type: "error", message: err.message || "No se pudo eliminar el cliente." });
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <div className="flex items-center flex-1 max-w-xl">
              <h2 className="text-xl font-bold text-white whitespace-nowrap mr-8">Clientes</h2>
              <div className="relative w-full group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
                  search
                </span>
                <input
                  className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
                  placeholder="Buscar por nombre, teléfono o correo..."
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
                    nb_cliente: "",
                    tel_cliente: "",
                    email_cliente: "",
                    direccion: "",
                    cp: "",
                    rfc: ""
                  });
                }}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {showForm ? "Cerrar formulario" : "Nuevo Cliente"}
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
                  placeholder="Nombre completo"
                  value={form.nb_cliente}
                  onChange={(event) => setForm({ ...form, nb_cliente: event.target.value })}
                />
                {fieldErrors.nb_cliente ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldErrors.nb_cliente}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Teléfono"
                  value={form.tel_cliente}
                  onChange={(event) => setForm({ ...form, tel_cliente: event.target.value })}
                />
                {fieldErrors.tel_cliente ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldErrors.tel_cliente}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Email"
                  value={form.email_cliente}
                  onChange={(event) => setForm({ ...form, email_cliente: event.target.value })}
                />
                {fieldErrors.email_cliente ? (
                  <p className="text-xs text-alert-red md:col-span-3">{fieldErrors.email_cliente}</p>
                ) : null}
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="Dirección"
                  value={form.direccion}
                  onChange={(event) => setForm({ ...form, direccion: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="CP"
                  value={form.cp}
                  onChange={(event) => setForm({ ...form, cp: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white"
                  placeholder="RFC"
                  value={form.rfc}
                  onChange={(event) => setForm({ ...form, rfc: event.target.value })}
                />
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
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Teléfono
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Email
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Dirección
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      CP
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      RFC
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((cliente) => (
                    <tr key={cliente.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-white font-semibold">
                        {cliente.nb_cliente}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cliente.tel_cliente}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cliente.email_cliente || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cliente.direccion || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cliente.cp || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{cliente.rfc || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => {
                              setShowForm(true);
                              setEditingId(cliente.id);
                              setForm({
                                nb_cliente: cliente.nb_cliente || "",
                                tel_cliente: cliente.tel_cliente || "",
                                email_cliente: cliente.email_cliente || "",
                                direccion: cliente.direccion || "",
                                cp: cliente.cp || "",
                                rfc: cliente.rfc || ""
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => setDeleteTarget(cliente)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={7}>
                        No hay clientes para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {paged.length} de {filtered.length} registros</p>
              <div className="flex items-center gap-3">
                <button
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                  Anterior
                </button>
                <span className="text-white bg-primary size-5 flex items-center justify-center rounded">
                  {page}
                </span>
                <button
                  className="flex items-center gap-1 hover:text-white transition-colors"
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                >
                  Siguiente
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
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
              <h3 className="text-lg font-bold text-white">Eliminar cliente</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Deseas eliminar a <span className="text-white font-semibold">{deleteTarget.nb_cliente}</span>?
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
    </div>
  );
}
