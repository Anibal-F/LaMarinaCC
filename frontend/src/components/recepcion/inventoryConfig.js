export const INVENTORY_SECTIONS = [
  {
    key: "interiores",
    title: "Interiores",
    items: [
      { key: "documentos", label: "Documentos" },
      { key: "radio", label: "Radio" },
      { key: "pantalla", label: "Pantalla" },
      { key: "encendedor", label: "Encendedor" },
      { key: "tapetes_tela", label: "Tapetes tela" },
      { key: "tapetes_plastico", label: "Tapetes plastico" }
    ]
  },
  {
    key: "motor",
    title: "Motor",
    items: [
      { key: "bateria", label: "Bateria" },
      { key: "computadora", label: "Computadora" },
      { key: "tapones_depositos", label: "Tapones depositos" }
    ]
  },
  {
    key: "exteriores",
    title: "Exteriores",
    items: [
      { key: "antena", label: "Antena" },
      { key: "polveras", label: "Polveras" },
      { key: "centro_rin", label: "Centro de rin" },
      { key: "placas_item", label: "Placas" }
    ]
  },
  {
    key: "cajuela",
    title: "Cajuela",
    items: [
      { key: "herramienta", label: "Herramienta" },
      { key: "reflejantes", label: "Reflejantes" },
      { key: "cables_pasa_corriente", label: "Cables pasa corriente" },
      { key: "llanta_refaccion", label: "Llanta de refaccion" },
      { key: "llave_l_cruceta", label: "Llave L o cruceta" },
      { key: "extintor", label: "Extintor" },
      { key: "gato", label: "Gato" }
    ]
  }
];

export const FUEL_LEVELS = [
  "Tanque Vacio",
  "1/8 Tanque",
  "2/8 Tanque",
  "3/8 Tanque",
  "4/8 Tanque",
  "5/8 Tanque",
  "6/8 Tanque",
  "7/8 Tanque",
  "Tanque Lleno"
];

export const FUEL_LEVEL_SHORT_LABELS = ["E", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "F"];

export const createInventoryState = () => {
  const items = INVENTORY_SECTIONS.flatMap((section) => section.items);
  return items.reduce(
    (acc, item) => {
      acc[item.key] = { cantidad: "", estado: "" };
      return acc;
    },
    { comentario: "" }
  );
};
