import WorkshopCatalogPage from "./WorkshopCatalogPage.jsx";

async function loadAuxiliary() {
  const [stationsRes, personalRes, etapasRes, recepcionesRes] = await Promise.all([
    fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/estaciones`),
    fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/personal`),
    fetch(`${import.meta.env.VITE_API_URL}/taller/catalogos/etapas`),
    fetch(`${import.meta.env.VITE_API_URL}/taller/dashboard/autos-en-sitio`)
  ]);
  if (!stationsRes.ok) throw new Error("No se pudieron cargar las estaciones.");
  if (!personalRes.ok) throw new Error("No se pudo cargar el personal.");
  if (!etapasRes.ok) throw new Error("No se pudieron cargar las etapas.");
  if (!recepcionesRes.ok) throw new Error("No se pudieron cargar las OTs activas.");

  return {
    estaciones: await stationsRes.json(),
    personal: await personalRes.json(),
    etapas: await etapasRes.json(),
    recepciones: await recepcionesRes.json()
  };
}

function buildPayload(form, auxData) {
  const selectedOt = (auxData?.recepciones || []).find((item) => String(item.id) === String(form.recepcion_id));
  return {
    estacion_id: Number(form.estacion_id),
    personal_id: Number(form.personal_id),
    recepcion_id: form.recepcion_id ? Number(form.recepcion_id) : null,
    folio_ot: form.folio_ot?.trim() || selectedOt?.folio_ot || selectedOt?.folio_recep || null,
    etapa_id: form.etapa_id ? Number(form.etapa_id) : null,
    activa: Boolean(form.activa)
  };
}

export default function CatalogoAsignacionesEstacion() {
  return (
    <WorkshopCatalogPage
      title="Asignaciones de Estación"
      singularLabel="Asignación"
      endpoint="/taller/estaciones/asignaciones"
      queryPlaceholder="Buscar estación, técnico u OT..."
      initialForm={{ estacion_id: "", personal_id: "", recepcion_id: "", folio_ot: "", etapa_id: "", activa: true }}
      searchFields={["nb_estacion", "nb_personal", "folio_ot", "nb_etapa"]}
      loadAuxiliary={loadAuxiliary}
      buildPayload={buildPayload}
      fields={[
        { key: "estacion_id", label: "Estación", type: "select", required: true, optionsKey: "estaciones", optionLabel: "nb_estacion" },
        { key: "personal_id", label: "Personal", type: "select", required: true, optionsKey: "personal", optionLabel: "nb_personal" },
        {
          key: "recepcion_id",
          label: "OT / Recepción",
          type: "select",
          optionsKey: "recepciones",
          optionLabel: "folio_ot"
        },
        { key: "folio_ot", label: "Folio OT", placeholder: "Se autocompleta al elegir OT" },
        { key: "etapa_id", label: "Etapa", type: "select", optionsKey: "etapas", optionLabel: "nb_etapa" },
        { key: "activa", label: "Activa", type: "checkbox" }
      ]}
      columns={[
        { key: "nb_estacion", label: "Estación" },
        { key: "nb_personal", label: "Personal" },
        { key: "folio_ot", label: "OT" },
        { key: "nb_etapa", label: "Etapa" },
        {
          key: "activa",
          label: "Estatus",
          render: (item) => (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${item.activa ? "bg-alert-green/20 text-alert-green" : "bg-slate-500/20 text-slate-300"}`}>
              {item.activa ? "ACTIVA" : "CERRADA"}
            </span>
          )
        }
      ]}
      mapItemToForm={(item) => ({
        estacion_id: item.estacion_id ? String(item.estacion_id) : "",
        personal_id: item.personal_id ? String(item.personal_id) : "",
        recepcion_id: item.recepcion_id ? String(item.recepcion_id) : "",
        folio_ot: item.folio_ot || "",
        etapa_id: item.etapa_id ? String(item.etapa_id) : "",
        activa: Boolean(item.activa)
      })}
    />
  );
}
