import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
  if (!response.ok) throw new Error("No se pudieron cargar las etapas.");
  return { etapas: await response.json() };
}

export default function CatalogoChecklistTaller() {
  return (
    <WorkshopCatalogPage
      title="Checklist de Taller"
      singularLabel="Item"
      endpoint="/taller/catalogos/checklist-items"
      queryPlaceholder="Buscar checklist..."
      initialForm={{ etapa_id: "", descripcion: "", orden: 1, obligatorio: true, activo: true }}
      searchFields={["descripcion", "nb_etapa", "clave"]}
      loadAuxiliary={loadAuxiliary}
      fields={[
        { key: "etapa_id", label: "Etapa", type: "select", required: true, optionsKey: "etapas", optionLabel: "nb_etapa" },
        { key: "descripcion", label: "Descripcion", required: true, placeholder: "Inspección de chasis" },
        { key: "orden", label: "Orden", type: "number", required: true, min: 1, max: 999 },
        { key: "obligatorio", label: "Obligatorio", type: "checkbox" },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_etapa", label: "Etapa" },
        { key: "descripcion", label: "Descripcion" },
        { key: "orden", label: "Orden" },
        {
          key: "obligatorio",
          label: "Tipo",
          render: (item) => (item.obligatorio ? "Obligatorio" : "Opcional")
        }
      ]}
      mapItemToForm={(item) => ({
        etapa_id: item.etapa_id ? String(item.etapa_id) : "",
        descripcion: item.descripcion || "",
        orden: item.orden ?? 1,
        obligatorio: Boolean(item.obligatorio),
        activo: Boolean(item.activo)
      })}
    />
  );
}
