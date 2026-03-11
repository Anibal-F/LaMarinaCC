import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`);
  if (!response.ok) throw new Error("No se pudieron cargar las etapas.");
  return { etapas: await response.json() };
}

export default function CatalogoAreasTaller() {
  return (
    <WorkshopCatalogPage
      title="Áreas de Trabajo"
      singularLabel="Área"
      endpoint="/taller/catalogos/areas"
      queryPlaceholder="Buscar área..."
      initialForm={{ nb_area: "", etapa_id: "", capacidad_maxima: 1, activo: true }}
      searchFields={["nb_area", "nb_etapa", "clave"]}
      loadAuxiliary={loadAuxiliary}
      fields={[
        { key: "nb_area", label: "Nombre área", required: true, placeholder: "Cabinas de Pintura" },
        { key: "etapa_id", label: "Etapa", type: "select", required: true, optionsKey: "etapas", optionLabel: "nb_etapa" },
        { key: "capacidad_maxima", label: "Capacidad", type: "number", required: true, min: 1, max: 999 },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_area", label: "Área" },
        { key: "nb_etapa", label: "Etapa" },
        { key: "capacidad_maxima", label: "Capacidad" }
      ]}
      mapItemToForm={(item) => ({
        nb_area: item.nb_area || "",
        etapa_id: item.etapa_id ? String(item.etapa_id) : "",
        capacidad_maxima: item.capacidad_maxima ?? 1,
        activo: Boolean(item.activo)
      })}
    />
  );
}
