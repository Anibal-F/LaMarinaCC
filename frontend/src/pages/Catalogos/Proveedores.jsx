import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

function loadAuxiliary() {
  return Promise.resolve({
    fuentes: [
      { value: "Qualitas", label: "Qualitas" },
      { value: "CHUBB", label: "CHUBB" },
      { value: "Manual", label: "Manual" },
    ],
  });
}

function buildPayload(form) {
  return {
    id_externo: Number(form.id_externo),
    fuente: form.fuente.trim(),
    nombre: form.nombre.trim(),
    email: form.email.trim() || null,
    celular: form.celular.trim() || null,
    activo: Boolean(form.activo),
  };
}

function renderFilters({ filters, setFilters }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
      <label className="space-y-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase">Nombre</span>
        <input
          type="text"
          className="w-full rounded-lg border-border-dark bg-background-dark px-4 py-2 text-sm text-white placeholder-slate-500"
          placeholder="Filtrar por nombre de proveedor"
          value={filters.nombre || ""}
          onChange={(event) => setFilters((prev) => ({ ...prev, nombre: event.target.value }))}
        />
      </label>

      <label className="flex items-center gap-3 pb-2">
        <input
          type="checkbox"
          checked={Boolean(filters.soloActivos)}
          onChange={(event) => setFilters((prev) => ({ ...prev, soloActivos: event.target.checked }))}
          className="h-4 w-4 rounded border-border-dark bg-background-dark text-primary"
        />
        <span className="text-sm text-white">Solo activos</span>
      </label>
    </div>
  );
}

function filterItems(items, { filters }) {
  const nombre = String(filters?.nombre || "").trim().toLowerCase();

  return items.filter((item) => {
    if (nombre && !String(item?.nombre || "").toLowerCase().includes(nombre)) {
      return false;
    }
    if (filters?.soloActivos && !item?.activo) {
      return false;
    }
    return true;
  });
}

export default function CatalogoProveedores() {
  return (
    <WorkshopCatalogPage
      title="Proveedores"
      singularLabel="Proveedor"
      endpoint="/inventario/proveedores"
      showSearch={false}
      queryPlaceholder="Buscar proveedor..."
      initialForm={{ id_externo: "", fuente: "", nombre: "", email: "", celular: "", activo: true }}
      initialFilters={{ nombre: "", soloActivos: false }}
      searchFields={["nombre", "fuente", "id_externo", "email", "celular"]}
      loadAuxiliary={loadAuxiliary}
      buildPayload={buildPayload}
      renderFilters={renderFilters}
      filterItems={filterItems}
      fields={[
        { key: "nombre", label: "Nombre", required: true, placeholder: "Refacciones Selectas S.A." },
        {
          key: "fuente",
          label: "Fuente",
          type: "select",
          required: true,
          optionsKey: "fuentes",
          optionValue: "value",
          optionLabel: "label",
        },
        {
          key: "id_externo",
          label: "ID Externo",
          type: "number",
          required: true,
          min: 1,
          placeholder: "1254",
        },
        { key: "email", label: "Email", type: "email", placeholder: "compras@proveedor.com" },
        { key: "celular", label: "Celular", placeholder: "6691234567" },
        { key: "activo", label: "Activo", type: "checkbox" },
      ]}
      columns={[
        { key: "nombre", label: "Proveedor" },
        {
          key: "fuente",
          label: "Fuente",
          render: (item) => (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
              {item.fuente || "-"}
            </span>
          ),
        },
        { key: "id_externo", label: "ID Externo" },
        { key: "email", label: "Email" },
        { key: "celular", label: "Celular" },
        {
          key: "activo",
          label: "Estatus",
          render: (item) => (
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                item.activo ? "bg-alert-green/20 text-alert-green" : "bg-slate-500/20 text-slate-300"
              }`}
            >
              {item.activo ? "ACTIVO" : "INACTIVO"}
            </span>
          ),
        },
      ]}
      mapItemToForm={(item) => ({
        id_externo: item.id_externo ? String(item.id_externo) : "",
        fuente: item.fuente || "",
        nombre: item.nombre || "",
        email: item.email || "",
        celular: item.celular || "",
        activo: item.activo !== false,
      })}
    />
  );
}
