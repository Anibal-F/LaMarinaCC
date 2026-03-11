import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/areas`);
  if (!response.ok) throw new Error("No se pudieron cargar las áreas.");
  return { areas: await response.json() };
}

export default function CatalogoEstacionesTrabajo() {
  return (
    <WorkshopCatalogPage
      title="Estaciones de Trabajo"
      singularLabel="Estación"
      endpoint="/taller/catalogos/estaciones"
      queryPlaceholder="Buscar estación..."
      initialForm={{ area_id: "", nb_estacion: "", tipo_estacion: "", estatus: "ACTIVA", activo: true }}
      searchFields={["nb_estacion", "nb_area", "tipo_estacion", "estatus"]}
      loadAuxiliary={loadAuxiliary}
      fields={[
        { key: "area_id", label: "Área", type: "select", required: true, optionsKey: "areas", optionLabel: "nb_area" },
        { key: "nb_estacion", label: "Nombre estación", required: true, placeholder: "Cabina 01" },
        { key: "tipo_estacion", label: "Tipo", placeholder: "Horneado alta temp" },
        { key: "estatus", label: "Estatus operativo", required: true, placeholder: "ACTIVA" },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_estacion", label: "Estación" },
        { key: "nb_area", label: "Área" },
        { key: "tipo_estacion", label: "Tipo" },
        { key: "ocupacion_actual", label: "Ocupación" }
      ]}
      mapItemToForm={(item) => ({
        area_id: item.area_id ? String(item.area_id) : "",
        nb_estacion: item.nb_estacion || "",
        tipo_estacion: item.tipo_estacion || "",
        estatus: item.estatus || "ACTIVA",
        activo: Boolean(item.activo)
      })}
    />
  );
}
