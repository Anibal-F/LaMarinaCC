import { useMemo, useRef, useState } from "react";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const INITIAL_PACKAGES = [
  {
    id: 1,
    folio: "PKG-001",
    arriboFecha: "2026-03-14",
    arriboHora: "09:15",
    proveedor: "Refacciones Selectas S.A.",
    ot: "OT-4521",
    reporte: "04251889452",
    piezas: ["Fascia delantera", "Faro derecho", "Sensores de impacto"],
    comentarios: "Revisar empaque del sensor derecho antes de liberar a almacén.",
    estado: "Pendiente",
    fotos: [
      {
        id: "pkg-1-a",
        name: "paquete-fascia.jpg",
        url: "https://images.unsplash.com/photo-1613214149922-f1809c99b414?auto=format&fit=crop&w=240&q=80",
      },
    ],
  },
  {
    id: 2,
    folio: "PKG-002",
    arriboFecha: "2026-03-14",
    arriboHora: "10:40",
    proveedor: "Collision Parts Co.",
    ot: "OT-4489",
    reporte: "04251877100",
    piezas: ["Parrilla central", "Emblema cromado"],
    comentarios: "",
    estado: "Pendiente",
    fotos: [],
  },
  {
    id: 3,
    folio: "PKG-003",
    arriboFecha: "2026-03-14",
    arriboHora: "12:05",
    proveedor: "AutoGlass Pro",
    ot: "OT-4505",
    reporte: "04251877681",
    piezas: ["Parabrisas laminado", "Kit de sellador uretano"],
    comentarios: "Paquete completo, pendiente validación dimensional.",
    estado: "Demorado",
    fotos: [
      {
        id: "pkg-3-a",
        name: "parabrisas.jpg",
        url: "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=240&q=80",
      },
    ],
  },
  {
    id: 4,
    folio: "PKG-004",
    arriboFecha: "2026-03-14",
    arriboHora: "14:20",
    proveedor: "Motores y Más",
    ot: "OT-4530",
    reporte: "04251878121",
    piezas: ["Radiador", "Ventilador principal", "Mangueras"],
    comentarios: "El radiador llegó con etiqueta parcial; documentado en evidencia.",
    estado: "Recibido",
    fotos: [
      {
        id: "pkg-4-a",
        name: "radiador.jpg",
        url: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&w=240&q=80",
      },
    ],
  },
];

const EMPTY_FORM = {
  proveedor: "",
  ot: "",
  reporte: "",
  piezasText: "",
  comentarios: "",
  estado: "Pendiente",
};

const STATUS_STYLES = {
  Pendiente: "bg-alert-amber/15 text-alert-amber border-alert-amber/30",
  Recibido: "bg-alert-green/15 text-alert-green border-alert-green/30",
  Demorado: "bg-alert-red/15 text-alert-red border-alert-red/30",
};

function formatArribo(fecha, hora) {
  const date = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(date.getTime())) return `${fecha} ${hora}`;
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatHour(hora) {
  const date = new Date(`2026-01-01T${hora}:00`);
  if (Number.isNaN(date.getTime())) return hora;
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFolio(items) {
  const maxValue = items.reduce((max, item) => {
    const match = String(item.folio || "").match(/(\d+)$/);
    const number = match ? Number(match[1]) : 0;
    return Math.max(max, number);
  }, 0);
  return `PKG-${String(maxValue + 1).padStart(3, "0")}`;
}

function PackageModal({
  isOpen,
  mode,
  form,
  onChange,
  onClose,
  onSave,
  photos,
  onCameraClick,
  onUploadClick,
  onRemovePhoto,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border-dark px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
              Inventario
            </p>
            <h2 className="text-2xl font-bold text-white">
              {mode === "create" ? "Nuevo Paquete de Piezas" : "Editar Paquete de Piezas"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Relaciona la recepción con una OT, registra contenido, evidencia y observaciones.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-background-dark hover:text-white transition-colors"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr_0.9fr]">
          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Proveedor
                </span>
                <input
                  type="text"
                  value={form.proveedor}
                  onChange={(event) => onChange("proveedor", event.target.value)}
                  className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Proveedor o paquetería"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  OT Relacionada
                </span>
                <input
                  type="text"
                  value={form.ot}
                  onChange={(event) => onChange("ot", event.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="OT-4521"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Reporte / Siniestro
                </span>
                <input
                  type="text"
                  value={form.reporte}
                  onChange={(event) => onChange("reporte", event.target.value)}
                  className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="04251889452"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Estado
                </span>
                <select
                  value={form.estado}
                  onChange={(event) => onChange("estado", event.target.value)}
                  className="w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Recibido">Recibido</option>
                  <option value="Demorado">Demorado</option>
                </select>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Piezas incluidas
              </span>
              <textarea
                value={form.piezasText}
                onChange={(event) => onChange("piezasText", event.target.value)}
                className="min-h-[140px] w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Captura una pieza por línea o separa por comas."
              />
              <div className="flex flex-wrap gap-2">
                {form.piezasText
                  .split(/\n|,/)
                  .map((pieza) => pieza.trim())
                  .filter(Boolean)
                  .slice(0, 12)
                  .map((pieza) => (
                    <span
                      key={pieza}
                      className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {pieza}
                    </span>
                  ))}
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Comentarios
              </span>
              <textarea
                value={form.comentarios}
                onChange={(event) => onChange("comentarios", event.target.value)}
                className="min-h-[160px] w-full rounded-xl border border-border-dark bg-background-dark px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Observaciones del arribo, daños al empaque, discrepancias o notas de almacén."
              />
            </label>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-border-dark bg-background-dark/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Evidencia
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white">
                    {photos.length} archivo{photos.length === 1 ? "" : "s"}
                  </h3>
                </div>
                <div className="rounded-xl bg-primary/15 p-3 text-primary">
                  <span className="material-symbols-outlined text-[28px]">photo_library</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={onCameraClick}
                  className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/15 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  Tomar foto
                </button>
                <button
                  type="button"
                  onClick={onUploadClick}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border-dark bg-surface-dark px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700/70 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">upload_file</span>
                  Subir archivo
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {photos.length ? (
                  photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative overflow-hidden rounded-xl border border-border-dark bg-surface-dark"
                    >
                      <img src={photo.url} alt={photo.name} className="h-28 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(photo.id)}
                        className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        title="Eliminar evidencia"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                      <div className="border-t border-border-dark px-3 py-2 text-[11px] text-slate-400 truncate">
                        {photo.name}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border-dark bg-surface-dark/50 px-5 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-600">inventory_2</span>
                    <p className="mt-3 text-sm font-semibold text-slate-300">Sin evidencia capturada</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Toma o sube fotografías del paquete, etiquetas y contenido recibido.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border-dark bg-background-dark/70 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Recomendación operativa
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-400">
                <div className="flex gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3">
                  <span className="material-symbols-outlined text-primary">qr_code_2</span>
                  <span>Vincula el paquete con la OT antes de enviarlo a almacén o taller.</span>
                </div>
                <div className="flex gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3">
                  <span className="material-symbols-outlined text-alert-amber">rule</span>
                  <span>Documenta en comentarios cualquier faltante, daño o diferencia de proveedor.</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border-dark px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-dark px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-background-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 transition-colors"
          >
            {mode === "create" ? "Guardar paquete" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaquetesPiezas() {
  const [packages, setPackages] = useState(INITIAL_PACKAGES);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [draftPhotos, setDraftPhotos] = useState([]);
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const metrics = useMemo(() => {
    const pendientes = packages.filter((item) => item.estado === "Pendiente").length;
    const demoradas = packages.filter((item) => item.estado === "Demorado").length;
    return { pendientes, demoradas };
  }, [packages]);

  const filteredPackages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packages;
    return packages.filter((item) => {
      const haystack = [
        item.folio,
        item.proveedor,
        item.ot,
        item.reporte,
        item.comentarios,
        ...item.piezas,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [packages, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPackages.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedPackages = filteredPackages.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const resetModal = () => {
    setModalMode("create");
    setActiveId(null);
    setForm(EMPTY_FORM);
    setDraftPhotos([]);
  };

  const openCreateModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const openEditModal = (pkg) => {
    setModalMode("edit");
    setActiveId(pkg.id);
    setForm({
      proveedor: pkg.proveedor,
      ot: pkg.ot,
      reporte: pkg.reporte,
      piezasText: pkg.piezas.join("\n"),
      comentarios: pkg.comentarios,
      estado: pkg.estado,
    });
    setDraftPhotos(pkg.fotos);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetModal();
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFilesSelected = (files) => {
    const nextPhotos = Array.from(files || []).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setDraftPhotos((prev) => [...prev, ...nextPhotos]);
  };

  const handleSave = () => {
    const piezas = form.piezasText
      .split(/\n|,/)
      .map((pieza) => pieza.trim())
      .filter(Boolean);

    if (!form.ot.trim() || !form.reporte.trim() || !form.proveedor.trim() || !piezas.length) {
      window.alert("Completa proveedor, OT, reporte y al menos una pieza.");
      return;
    }

    if (modalMode === "create") {
      const newPackage = {
        id: Date.now(),
        folio: buildFolio(packages),
        arriboFecha: new Date().toISOString().slice(0, 10),
        arriboHora: new Date().toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        proveedor: form.proveedor.trim(),
        ot: form.ot.trim().toUpperCase(),
        reporte: form.reporte.trim(),
        piezas,
        comentarios: form.comentarios.trim(),
        estado: form.estado,
        fotos: draftPhotos,
      };
      setPackages((prev) => [newPackage, ...prev]);
      setPage(1);
    } else {
      setPackages((prev) =>
        prev.map((item) =>
          item.id === activeId
            ? {
                ...item,
                proveedor: form.proveedor.trim(),
                ot: form.ot.trim().toUpperCase(),
                reporte: form.reporte.trim(),
                piezas,
                comentarios: form.comentarios.trim(),
                estado: form.estado,
                fotos: draftPhotos,
              }
            : item
        )
      );
    }

    closeModal();
  };

  const handleDelete = (pkg) => {
    const confirmed = window.confirm(`Eliminar ${pkg.folio} y su evidencia asociada?`);
    if (!confirmed) return;
    setPackages((prev) => prev.filter((item) => item.id !== pkg.id));
  };

  const removeDraftPhoto = (photoId) => {
    setDraftPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Paquetes de piezas"
            searchPlaceholder="Buscar folio, OT, reporte o proveedor..."
            searchValue={search}
            onSearchChange={setSearch}
            rightExtras={
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[20px]">add_box</span>
                Nuevo paquete
              </button>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
                  <span className="material-symbols-outlined text-[16px]">package_2</span>
                  Control de logística
                </div>
                <h1 className="text-3xl font-extrabold text-white">Gestión de Paquetes de Piezas</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Recepción y trazabilidad de paquetes vinculados a OT y siniestros
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-4 rounded-2xl border border-border-dark bg-surface-dark px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                  <div className="rounded-xl bg-primary/15 p-3 text-primary">
                    <span className="material-symbols-outlined">pending_actions</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Pendientes</div>
                    <div className="text-2xl font-bold text-white">{metrics.pendientes}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-border-dark bg-surface-dark px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
                  <div className="rounded-xl bg-alert-amber/15 p-3 text-alert-amber">
                    <span className="material-symbols-outlined">warning</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Demoras</div>
                    <div className="text-2xl font-bold text-white">{metrics.demoradas}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="min-w-[980px] w-full text-left">
                  <thead className="border-b border-border-dark bg-background-dark/40">
                    <tr>
                      {[
                        "Folio",
                        "Arribo",
                        "Proveedor",
                        "OT Relacionada",
                        "No. Reporte / Siniestro",
                        "Acciones",
                      ].map((label) => (
                        <th
                          key={label}
                          className="px-4 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {pagedPackages.length ? (
                      pagedPackages.map((pkg) => (
                        <tr key={pkg.id} className="transition-colors hover:bg-white/5">
                          <td className="px-4 py-4 text-sm">
                            <div className="font-bold text-primary">{pkg.folio}</div>
                            <div className="mt-2">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                                  STATUS_STYLES[pkg.estado] || "border-border-dark text-slate-400"
                                }`}
                              >
                                {pkg.estado}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <div className="font-semibold">{formatArribo(pkg.arriboFecha, pkg.arriboHora)}</div>
                            <div className="text-xs italic text-slate-500">{formatHour(pkg.arriboHora)}</div>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-200">{pkg.proveedor}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-lg bg-background-dark px-3 py-1.5 text-xs font-bold text-white border border-border-dark">
                              {pkg.ot}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">{pkg.reporte}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  openEditModal(pkg);
                                  requestAnimationFrame(() => cameraInputRef.current?.click());
                                }}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-primary/15 hover:text-primary"
                                title="Tomar foto"
                              >
                                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(pkg)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-alert-amber/15 hover:text-alert-amber"
                                title="Ver detalle"
                              >
                                <span className="material-symbols-outlined text-[20px]">list_alt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(pkg)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-alert-red/15 hover:text-alert-red"
                                title="Eliminar"
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-14 text-center">
                          <div className="flex flex-col items-center gap-3 text-slate-500">
                            <span className="material-symbols-outlined text-5xl">package_2</span>
                            <p className="text-base font-semibold text-slate-300">No hay paquetes registrados</p>
                            <p className="text-sm text-slate-500">
                              Ajusta tu búsqueda o registra el primer paquete del día.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-border-dark bg-background-dark/20 px-4 py-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
                <div>
                  Mostrando <span className="font-bold text-white">{pagedPackages.length}</span> de{" "}
                  <span className="font-bold text-white">{filteredPackages.length}</span> paquetes registrados
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-lg border border-border-dark px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-dark"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .slice(0, 5)
                    .map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`min-w-10 rounded-lg px-3 py-1.5 font-bold ${
                          pageNumber === pageSafe
                            ? "bg-primary text-white"
                            : "border border-border-dark text-slate-300 hover:bg-surface-dark"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    className="rounded-lg border border-border-dark px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-dark"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      <PackageModal
        isOpen={modalOpen}
        mode={modalMode}
        form={form}
        photos={draftPhotos}
        onChange={handleFormChange}
        onClose={closeModal}
        onSave={handleSave}
        onCameraClick={() => cameraInputRef.current?.click()}
        onUploadClick={() => uploadInputRef.current?.click()}
        onRemovePhoto={removeDraftPhoto}
      />
    </div>
  );
}
