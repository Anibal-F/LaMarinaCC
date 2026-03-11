import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

export default function CatalogoEtapasTaller() {
  return (
    <WorkshopCatalogPage
      title="Etapas de Taller"
      singularLabel="Etapa"
      endpoint="/taller/catalogos/etapas"
      queryPlaceholder="Buscar etapa..."
      initialForm={{ clave: "", nb_etapa: "", orden: 1, activo: true }}
      searchFields={["clave", "nb_etapa"]}
      fields={[
        { key: "clave", label: "Clave", required: true, placeholder: "recepcionado" },
        { key: "nb_etapa", label: "Nombre etapa", required: true, placeholder: "Recepcionado" },
        { key: "orden", label: "Orden", type: "number", required: true, min: 1, max: 999 },
        { key: "activo", label: "Activo", type: "checkbox" }
      ]}
      columns={[
        { key: "clave", label: "Clave" },
        { key: "nb_etapa", label: "Etapa" },
        { key: "orden", label: "Orden" },
        {
          key: "activo",
          label: "Estatus",
          render: (item) => (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${item.activo ? "bg-alert-green/20 text-alert-green" : "bg-slate-500/20 text-slate-300"}`}>
              {item.activo ? "ACTIVA" : "INACTIVA"}
            </span>
          )
        }
      ]}
      mapItemToForm={(item) => ({
        clave: item.clave || "",
        nb_etapa: item.nb_etapa || "",
        orden: item.orden ?? 1,
        activo: Boolean(item.activo)
      })}
    />
  );
}
