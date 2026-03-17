import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

function loadAuxiliary() {
  return Promise.resolve({
    fuentes: [
      { value: "Qualitas", label: "Qualitas" },
      { value: "CHUBB", label: "CHUBB" },
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

export default function CatalogoProveedores() {
  return (
    <WorkshopCatalogPage
      title="Proveedores"
      singularLabel="Proveedor"
      endpoint="/inventario/proveedores"
      queryPlaceholder="Buscar proveedor, fuente, ID externo o contacto..."
      initialForm={{ id_externo: "", fuente: "", nombre: "", email: "", celular: "", activo: true }}
      searchFields={["nombre", "fuente", "id_externo", "email", "celular"]}
      loadAuxiliary={loadAuxiliary}
      buildPayload={buildPayload}
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
