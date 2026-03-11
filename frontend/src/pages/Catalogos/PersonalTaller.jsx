import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/puestos`);
  if (!response.ok) throw new Error("No se pudieron cargar los puestos.");
  return { puestos: await response.json() };
}

export default function CatalogoPersonalTaller() {
  return (
    <WorkshopCatalogPage
      title="Personal de Taller"
      singularLabel="Colaborador"
      endpoint="/taller/catalogos/personal"
      queryPlaceholder="Buscar colaborador..."
      initialForm={{ nb_personal: "", puesto_id: "", activo: true }}
      searchFields={["nb_personal", "nb_puesto", "nb_etapa", "clave"]}
      loadAuxiliary={loadAuxiliary}
      fields={[
        { key: "nb_personal", label: "Nombre", required: true, placeholder: "Carlos Méndez" },
        { key: "puesto_id", label: "Puesto", type: "select", required: true, optionsKey: "puestos", optionLabel: "nb_puesto" },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_personal", label: "Nombre" },
        { key: "nb_puesto", label: "Puesto" },
        { key: "nb_etapa", label: "Etapa" }
      ]}
      mapItemToForm={(item) => ({
        nb_personal: item.nb_personal || "",
        puesto_id: item.puesto_id ? String(item.puesto_id) : "",
        activo: Boolean(item.activo)
      })}
    />
  );
}
