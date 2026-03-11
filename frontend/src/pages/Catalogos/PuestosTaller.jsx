import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
  if (!response.ok) throw new Error("No se pudieron cargar las etapas.");
  return { etapas: await response.json() };
}

export default function CatalogoPuestosTaller() {
  return (
    <WorkshopCatalogPage
      title="Puestos de Taller"
      singularLabel="Puesto"
      endpoint="/taller/catalogos/puestos"
      queryPlaceholder="Buscar puesto..."
      initialForm={{ nb_puesto: "", etapa_id: "", activo: true }}
      searchFields={["nb_puesto", "nb_etapa", "clave"]}
      loadAuxiliary={loadAuxiliary}
      fields={[
        { key: "nb_puesto", label: "Nombre puesto", required: true, placeholder: "Técnico Pintura" },
        { key: "etapa_id", label: "Etapa", type: "select", required: true, optionsKey: "etapas", optionLabel: "nb_etapa" },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_puesto", label: "Puesto" },
        { key: "nb_etapa", label: "Etapa" }
      ]}
      mapItemToForm={(item) => ({
        nb_puesto: item.nb_puesto || "",
        etapa_id: item.etapa_id ? String(item.etapa_id) : "",
        activo: Boolean(item.activo)
      })}
    />
  );
}
