import {
  FUEL_LEVELS,
  FUEL_LEVEL_SHORT_LABELS,
  INVENTORY_SECTIONS,
} from "./inventoryConfig.js";

export default function InventoryTab({
  inventoryForm,
  setInventoryForm,
  fuelLevelIndex,
  setFuelLevelIndex,
  readOnly = false,
}) {
  const updateInventoryItem = (key, field, value) => {
    setInventoryForm((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { cantidad: "", estado: "" }),
        [field]: value,
      },
    }));
  };

  const handleFuelLevelSelect = (index) => {
    if (readOnly) return;
    setFuelLevelIndex(index);
  };

  const inputState = readOnly ? "cursor-default opacity-90" : "";

  return (
    <div className="col-span-12 grid grid-cols-12 gap-6 xl:gap-7">
      <div className="col-span-12 xl:col-span-4 space-y-6">
        {INVENTORY_SECTIONS.filter((section) => ["interiores", "motor"].includes(section.key)).map((section) => (
          <section key={section.key} className="overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <div className="border-b border-border-dark bg-primary/15 px-5 py-3.5">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">{section.title}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-background-dark/40 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Descripcion</th>
                    <th className="w-28 px-4 py-3.5">Cant.</th>
                    <th className="w-16 px-4 py-3.5 text-center">Si</th>
                    <th className="w-16 px-4 py-3.5 text-center">No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark">
                  {section.items.map((item) => (
                    <tr key={item.key} className="text-sm text-slate-200">
                      <td className="px-5 py-3.5">{item.label}</td>
                      <td className="px-4 py-3.5">
                        <input
                          className={`w-full rounded-md border border-border-dark bg-background-dark px-3 py-2 text-sm text-white ${inputState}`}
                          type="text"
                          value={inventoryForm[item.key]?.cantidad || ""}
                          onChange={(event) => updateInventoryItem(item.key, "cantidad", event.target.value)}
                          readOnly={readOnly}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <input
                          className="size-5 border-border-dark bg-background-dark text-primary focus:ring-primary"
                          type="radio"
                          name={`${item.key}_estado`}
                          checked={inventoryForm[item.key]?.estado === "si"}
                          onChange={() => updateInventoryItem(item.key, "estado", "si")}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <input
                          className="size-5 border-border-dark bg-background-dark text-primary focus:ring-primary"
                          type="radio"
                          name={`${item.key}_estado`}
                          checked={inventoryForm[item.key]?.estado === "no"}
                          onChange={() => updateInventoryItem(item.key, "estado", "no")}
                          disabled={readOnly}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <div className="col-span-12 xl:col-span-5 space-y-6">
        {INVENTORY_SECTIONS.filter((section) => ["exteriores", "cajuela"].includes(section.key)).map((section) => (
          <section key={section.key} className="overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <div className="border-b border-border-dark bg-primary/15 px-5 py-3.5">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">{section.title}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-background-dark/40 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Descripcion</th>
                    <th className="w-28 px-4 py-3.5">Cant.</th>
                    <th className="w-16 px-4 py-3.5 text-center">Si</th>
                    <th className="w-16 px-4 py-3.5 text-center">No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark">
                  {section.items.map((item) => (
                    <tr key={item.key} className="text-sm text-slate-200">
                      <td className="px-5 py-3.5">{item.label}</td>
                      <td className="px-4 py-3.5">
                        <input
                          className={`w-full rounded-md border border-border-dark bg-background-dark px-3 py-2 text-sm text-white ${inputState}`}
                          type="text"
                          value={inventoryForm[item.key]?.cantidad || ""}
                          onChange={(event) => updateInventoryItem(item.key, "cantidad", event.target.value)}
                          readOnly={readOnly}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <input
                          className="size-5 border-border-dark bg-background-dark text-primary focus:ring-primary"
                          type="radio"
                          name={`${item.key}_estado`}
                          checked={inventoryForm[item.key]?.estado === "si"}
                          onChange={() => updateInventoryItem(item.key, "estado", "si")}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <input
                          className="size-5 border-border-dark bg-background-dark text-primary focus:ring-primary"
                          type="radio"
                          name={`${item.key}_estado`}
                          checked={inventoryForm[item.key]?.estado === "no"}
                          onChange={() => updateInventoryItem(item.key, "estado", "no")}
                          disabled={readOnly}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <div className="col-span-12 xl:col-span-3 space-y-6">
        <section className="overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="border-b border-border-dark bg-primary/15 px-5 py-3.5">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Medidor de gasolina</h3>
          </div>
          <div className="relative flex min-h-[27rem] flex-col items-center justify-center gap-5 p-6">
            <span className="text-sm font-bold text-slate-500">F</span>
            <div className="relative flex h-80 w-20 flex-col justify-end overflow-hidden rounded-full border border-border-dark bg-background-dark">
              <div className="absolute inset-0 flex flex-col justify-between py-4 opacity-20">
                {Array.from({ length: FUEL_LEVELS.length - 1 }, (_, mark) => (
                  <div key={mark} className="border-t border-slate-500" />
                ))}
              </div>
              <div className="absolute inset-0 z-10 flex flex-col">
                {Array.from({ length: FUEL_LEVELS.length }, (_, position) => FUEL_LEVELS.length - 1 - position).map((index) => (
                  <button
                    key={index}
                    type="button"
                    className="flex-1 border-b border-transparent last:border-b-0"
                    onClick={() => handleFuelLevelSelect(index)}
                    aria-label={`Seleccionar ${FUEL_LEVELS[index]}`}
                    title={FUEL_LEVELS[index]}
                    disabled={readOnly}
                  />
                ))}
              </div>
              <div
                className="w-full border-t-2 border-primary bg-primary/45 transition-all"
                style={{
                  height: `${fuelLevelIndex === 0 ? 0 : (fuelLevelIndex / (FUEL_LEVELS.length - 1)) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm font-bold text-slate-500">E</span>
            <div className="absolute right-5 top-1/2 -translate-y-1/2 rounded-md bg-primary px-2 py-1.5 text-[10px] font-bold uppercase text-white [writing-mode:vertical-rl]">
              {FUEL_LEVELS[fuelLevelIndex]}
            </div>
            <div className="w-full space-y-3">
              <input
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-background-dark accent-primary"
                max={FUEL_LEVELS.length - 1}
                min="0"
                step="1"
                type="range"
                value={fuelLevelIndex}
                onChange={(event) => setFuelLevelIndex(Number(event.target.value))}
                disabled={readOnly}
              />
              <div className="grid grid-cols-5 gap-2">
                {FUEL_LEVELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-md border px-2 py-2 text-[11px] font-bold uppercase transition-colors ${
                      fuelLevelIndex === index
                        ? "border-primary bg-primary/20 text-white"
                        : "border-border-dark bg-background-dark text-slate-400 hover:text-white"
                    } ${readOnly ? "cursor-default" : ""}`}
                    onClick={() => handleFuelLevelSelect(index)}
                    disabled={readOnly}
                  >
                    {FUEL_LEVEL_SHORT_LABELS[index]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="border-b border-border-dark bg-primary/15 px-5 py-3.5">
            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Comentario</h3>
          </div>
          <div className="p-5">
            <textarea
              className={`h-64 w-full rounded-lg border border-border-dark bg-background-dark p-4 text-sm text-white focus:ring-1 focus:ring-primary ${inputState}`}
              placeholder="Escriba sus observaciones aquí..."
              value={inventoryForm.comentario || ""}
              onChange={(event) => setInventoryForm((prev) => ({ ...prev, comentario: event.target.value }))}
              readOnly={readOnly}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
