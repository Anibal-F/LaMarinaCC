import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function buildVehiculoTitle(record) {
  if (!record) return "Vehículo";
  if (record.vehiculo) return record.vehiculo;
  return [record.marca_vehiculo, record.modelo_anio, record.tipo_vehiculo, record.color_vehiculo]
    .filter(Boolean)
    .join(" ");
}

export default function ValuarVehiculo() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [record, setRecord] = useState(location.state?.record || null);
  const [loading, setLoading] = useState(!record);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [aseguradoraActiva, setAseguradoraActiva] = useState("");
  const [autorizadoAseguradora, setAutorizadoAseguradora] = useState(8700);
  const [observacionesValuacion, setObservacionesValuacion] = useState("");
  const [savingValuacion, setSavingValuacion] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    if (record || !id) return;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${import.meta.env.VITE_API_URL}/valuacion/vehiculos`);
        if (!response.ok) {
          throw new Error("No se pudo cargar la unidad.");
        }
        const payload = await response.json();
        const selected = payload.find((item) => String(item.id) === String(id));
        if (!selected) {
          throw new Error("Unidad no encontrada.");
        }
        setRecord(selected);
      } catch (err) {
        setError(err.message || "No se pudo cargar la unidad.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [record, id]);

  useEffect(() => {
    if (!record?.reporte_siniestro) return;
    const loadExpediente = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            record.reporte_siniestro
          )}`
        );
        if (!response.ok) return;
        const data = await response.json();
        setExpedienteFiles(data?.archivos || []);
      } catch {
        // ignore
      }
    };
    loadExpediente();
  }, [record?.reporte_siniestro]);

  useEffect(() => {
    if (!record?.id) return;
    const loadValuacion = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/valuacion/ordenes/${record.id}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (data?.aseguradora_activa) setAseguradoraActiva(data.aseguradora_activa);
        if (typeof data?.autorizado_aseguradora === "number") {
          setAutorizadoAseguradora(data.autorizado_aseguradora);
        }
        if (data?.observaciones) setObservacionesValuacion(data.observaciones);
        if (Array.isArray(data?.detalle) && data.detalle.length) {
          setOperations(
            data.detalle.map((item) => ({
              id: item.id || crypto.randomUUID(),
              tipo: item.tipo,
              descripcion: item.descripcion,
              monto: Number(item.monto || 0)
            }))
          );
        }
      } catch {
        // ignore
      }
    };
    loadValuacion();
  }, [record?.id]);

  useEffect(() => {
    const loadAseguradoras = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`);
        if (!response.ok) return;
        const data = await response.json();
        setAseguradoras(data || []);
      } catch {
        // ignore
      }
    };
    loadAseguradoras();
  }, []);

  useEffect(() => {
    if (record?.seguro_comp) {
      setAseguradoraActiva(record.seguro_comp);
    }
  }, [record?.seguro_comp]);

  const vehiculoTitle = useMemo(() => buildVehiculoTitle(record), [record]);
  const valuacionFotos = useMemo(
    () => expedienteFiles.filter((item) => item.tipo === "valuacion_foto"),
    [expedienteFiles]
  );
  const montoPorTipo = useMemo(() => {
    return operations.reduce(
      (acc, item) => {
        const amount = Number(item.monto) || 0;
        if (item.tipo === "MO") acc.mo += amount;
        if (item.tipo === "SUST") acc.sust += amount;
        if (item.tipo === "BYD") acc.byd += amount;
        return acc;
      },
      { mo: 0, sust: 0, byd: 0 }
    );
  }, [operations]);
  const subtotal = montoPorTipo.mo + montoPorTipo.sust + montoPorTipo.byd;
  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  const autorizado = autorizadoAseguradora || 0;
  const diferencia = total - autorizado;

  const handleSaveValuacion = async () => {
    if (!record?.id) return;
    setSavingValuacion(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/valuacion/ordenes/${record.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aseguradora_activa: aseguradoraActiva,
            autorizado_aseguradora: Number(autorizadoAseguradora || 0),
            observaciones: observacionesValuacion,
            detalle: operations.map((item) => ({
              tipo: item.tipo,
              descripcion: item.descripcion,
              monto: Number(item.monto || 0)
            }))
          })
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo guardar la valuación");
      }
      setRecord((prev) => (prev ? { ...prev, estatus: "Borrador" } : prev));
      setSaveSuccess("Valuación guardada en borrador.");
    } catch (err) {
      setSaveError(err.message || "No se pudo guardar la valuación");
    } finally {
      setSavingValuacion(false);
    }
  };

  const aseguradoraLogo = (aseguradora) => {
    if (!aseguradora) return null;
    const normalized = aseguradora.toLowerCase();
    if (normalized.includes("qualitas")) return "/assets/Qualitas_profile.jpg";
    if (normalized.includes("chubb")) return "/assets/CHUBB_profile.jpg";
    return null;
  };

  const handleUploadEvidencia = async (event) => {
    if (!record?.reporte_siniestro) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploadError("");
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("tipo", "valuacion_foto");
        formData.append("file", file);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            record.reporte_siniestro
          )}/archivos`,
          { method: "POST", body: formData }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir la evidencia.");
        }
        const uploaded = await response.json().catch(() => null);
        if (uploaded) {
          setUploadedFiles((prev) => [uploaded, ...prev]);
          setExpedienteFiles((prev) => [uploaded, ...prev]);
        }
      }
      event.target.value = "";
    } catch (err) {
      setUploadError(err.message || "No se pudo subir la evidencia.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AppHeader
            title="Valuación del vehículo"
            subtitle="Gestión de presupuesto y conexión con aseguradoras."
            showSearch={false}
            actions={
              <>
                <button
                  className="flex items-center gap-2 bg-surface-dark hover:bg-primary/20 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all border border-border-dark"
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">history</span>
                  Historial de precios
                </button>
                <button
                  className="flex items-center gap-2 bg-surface-dark hover:bg-primary/20 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all border border-border-dark"
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  Generar PDF
                </button>
                <button
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-primary/20"
                  type="button"
                  onClick={handleSaveValuacion}
                >
                  {savingValuacion ? "Guardando..." : "Guardar valuación"}
                </button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {loading ? <p className="text-sm text-slate-400">Cargando valuación...</p> : null}
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            {!loading && !error && record ? (
              <div className="grid grid-cols-12 gap-6">
                <section className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                  <div className="bg-surface-dark border border-border-dark rounded-xl p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h1 className="text-xl font-black text-white leading-none">{vehiculoTitle}</h1>
                        <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide">
                          Expediente: {record.reporte_siniestro || "Sin folio"}
                        </p>
                      </div>
                      <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded border border-primary/30 uppercase">
                        {record.estatus || "Pendiente"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-border-dark pt-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                          Placas
                        </span>
                        <span className="text-white font-semibold">{record.placas || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                          Cliente
                        </span>
                        <span className="text-white font-semibold">{record.nb_cliente || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                          Serie
                        </span>
                        <span className="text-white font-semibold font-mono">
                          {record.serie_auto || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-dark border border-border-dark rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        Evidencia de recepción
                      </h3>
                      <span className="text-[10px] text-slate-500">Daños del siniestro</span>
                    </div>
                    <label
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-dark px-4 py-8 text-center text-sm text-slate-400 hover:border-primary/60 hover:text-slate-200 transition-colors cursor-pointer bg-background-dark/60"
                      htmlFor="valuacion-evidencia"
                    >
                      <span className="material-symbols-outlined text-3xl">upload_file</span>
                      <span className="text-xs font-bold uppercase tracking-widest">
                        Arrastra fotos o haz clic para cargar
                      </span>
                      <span className="text-[10px] text-slate-500">
                        PNG, JPG o JPEG
                      </span>
                      {uploading ? (
                        <span className="text-[10px] text-primary">Subiendo archivos...</span>
                      ) : null}
                      <input
                        id="valuacion-evidencia"
                        className="hidden"
                        type="file"
                        accept=".jpg,.jpeg,.png"
                        multiple
                        onChange={handleUploadEvidencia}
                      />
                    </label>
                    {uploadError ? (
                      <span className="text-[10px] text-alert-red">{uploadError}</span>
                    ) : null}
                    {valuacionFotos.length ? (
                      <div className="grid grid-cols-4 gap-2">
                        {valuacionFotos.slice(0, 8).map((item) => (
                          <div
                            key={item.path}
                            className="aspect-square rounded bg-background-dark border border-border-dark bg-cover bg-center"
                            style={{
                              backgroundImage: item.path ? `url(${import.meta.env.VITE_API_URL}${item.path})` : undefined
                            }}
                            title={item.archivo_nombre || "Foto"}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="bg-surface-dark border border-border-dark rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        Lista de operaciones
                      </h3>
                      <button
                        className="flex items-center gap-1 bg-primary px-2 py-1 rounded text-[10px] font-bold"
                        type="button"
                        onClick={() =>
                          setOperations((prev) => [
                            ...prev,
                            { id: crypto.randomUUID(), tipo: "MO", descripcion: "", monto: 0 }
                          ])
                        }
                      >
                        <span className="material-symbols-outlined text-[12px]">add</span>
                        Añadir
                      </button>
                    </div>
                    <div className="overflow-hidden border border-border-dark rounded-lg bg-background-dark/60">
                      <table className="w-full text-left">
                        <thead className="bg-background-dark">
                          <tr>
                            <th className="text-[10px] font-bold uppercase p-2 text-slate-400">Tipo</th>
                            <th className="text-[10px] font-bold uppercase p-2 text-slate-400">
                              Descripción
                            </th>
                            <th className="text-[10px] font-bold uppercase p-2 text-slate-400 text-right">
                              Monto
                            </th>
                            <th className="text-[10px] font-bold uppercase p-2 text-slate-400 text-right">
                              Acción
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-xs">
                          {operations.map((item) => (
                            <tr key={item.id} className="border-t border-border-dark">
                              <td className="p-2">
                                <select
                                  className="w-full bg-surface-dark border border-border-dark rounded px-2 py-1 text-[10px] text-white"
                                  value={item.tipo}
                                  onChange={(event) =>
                                    setOperations((prev) =>
                                      prev.map((row) =>
                                        row.id === item.id ? { ...row, tipo: event.target.value } : row
                                      )
                                    )
                                  }
                                >
                                  <option value="SUST">SUST</option>
                                  <option value="MO">MO</option>
                                  <option value="BYD">BYD</option>
                                </select>
                              </td>
                              <td className="p-2">
                                <input
                                  className="w-full bg-surface-dark border border-border-dark rounded px-2 py-1 text-[11px] text-white"
                                  value={item.descripcion}
                                  onChange={(event) =>
                                    setOperations((prev) =>
                                      prev.map((row) =>
                                        row.id === item.id ? { ...row, descripcion: event.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="Descripción de operación"
                                />
                              </td>
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  className="w-24 bg-surface-dark border border-border-dark rounded px-2 py-1 text-[11px] text-white text-right"
                                  value={item.monto}
                                  onChange={(event) =>
                                    setOperations((prev) =>
                                      prev.map((row) =>
                                        row.id === item.id
                                          ? { ...row, monto: Number(event.target.value || 0) }
                                          : row
                                      )
                                    )
                                  }
                                />
                              </td>
                              <td className="p-2 text-right">
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-alert-red"
                                  onClick={() =>
                                    setOperations((prev) => prev.filter((row) => row.id !== item.id))
                                  }
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <section className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                  <div className="bg-surface-dark border border-border-dark rounded-xl p-6 flex flex-col h-full">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
                      Resumen de presupuesto
                    </h3>
                    <div className="space-y-4">
                      {saveError ? (
                        <p className="text-xs text-alert-red">{saveError}</p>
                      ) : null}
                      {saveSuccess ? (
                        <p className="text-xs text-alert-green">{saveSuccess}</p>
                      ) : null}
                      {[
                        ["Mano de Obra (MO)", montoPorTipo.mo],
                        ["Refacciones (SUST)", montoPorTipo.sust],
                        ["Insumos y Materiales (BYD)", montoPorTipo.byd]
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-border-dark">
                          <span className="text-sm text-slate-400">{label}</span>
                          <span className="text-sm font-bold text-white">
                            {Number(value).toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN"
                            })}
                          </span>
                        </div>
                      ))}
                      <div className="pt-4">
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="text-slate-400">Subtotal</span>
                          <span className="font-bold">
                            {subtotal.toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN"
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-4">
                          <span className="text-slate-400">IVA (16%)</span>
                          <span className="font-bold">
                            {iva.toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN"
                            })}
                          </span>
                        </div>
                        <div className="bg-background-dark p-5 rounded border border-border-dark mb-6">
                          <div className="flex justify-between items-end">
                            <span className="text-[10px] uppercase font-black text-primary tracking-widest">
                              Total valuación
                            </span>
                            <span className="text-3xl font-black text-white">
                              {total.toLocaleString("es-MX", {
                                style: "currency",
                                currency: "MXN"
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 bg-alert-amber/10 border-l-4 border-alert-amber rounded-r mb-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-alert-amber uppercase">
                              Autorizado aseguradora
                            </span>
                            <input
                              type="number"
                              className="w-32 bg-background-dark border border-border-dark rounded px-2 py-1 text-xs text-white text-right"
                              value={autorizadoAseguradora}
                              onChange={(event) =>
                                setAutorizadoAseguradora(Number(event.target.value || 0))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-alert-red/10 border border-alert-red/40 rounded">
                          <span className="text-[10px] font-bold text-alert-red uppercase">
                            Diferencia por cobrar
                          </span>
                          <span className="text-md font-black text-alert-red">
                            {diferencia.toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN"
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto pt-8">
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-4 tracking-tighter">
                        Observaciones de valuación
                      </p>
                      <textarea
                        className="w-full bg-background-dark border-border-dark rounded text-xs p-3 text-white focus:ring-primary focus:border-primary placeholder:text-slate-500"
                        placeholder="Añadir notas internas sobre el siniestro..."
                        rows="3"
                        value={observacionesValuacion}
                        onChange={(event) => setObservacionesValuacion(event.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <section className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                  <div className="bg-surface-dark border border-border-dark rounded-xl p-6 flex flex-col h-full relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">dynamic_form</span>
                      Conexión con aseguradoras
                    </h3>
                    <p className="text-slate-400 text-xs mb-6">
                      Sincronización en tiempo real mediante API y scrapping de portales.
                    </p>
                    <div className="space-y-4 mb-8">
                      <div className="p-4 bg-background-dark border border-border-dark rounded">
                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">
                          Aseguradora activa
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            {aseguradoraLogo(aseguradoraActiva) ? (
                              <img
                                src={aseguradoraLogo(aseguradoraActiva)}
                                alt={aseguradoraActiva}
                                className="w-8 h-8 rounded bg-white object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-white rounded flex items-center justify-center font-black text-blue-900 text-xs">
                                {aseguradoraActiva ? aseguradoraActiva.slice(0, 3).toUpperCase() : "--"}
                              </div>
                            )}
                            <select
                              className="flex-1 bg-surface-dark border border-border-dark text-white text-xs rounded-lg py-2 px-3 focus:ring-1 focus:ring-primary focus:border-primary"
                              value={aseguradoraActiva}
                              onChange={(event) => setAseguradoraActiva(event.target.value)}
                            >
                              <option value="">Selecciona aseguradora</option>
                              {aseguradoras.map((item) => (
                                <option key={item.id} value={item.nb_aseguradora}>
                                  {item.nb_aseguradora}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-background-dark border border-border-dark rounded">
                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">
                          Estatus en portal
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-alert-amber">
                            hourglass_empty
                          </span>
                          <span className="text-sm font-bold text-alert-amber">
                            En espera de autorización
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 italic">
                          Última actualización: hace 4 minutos
                        </p>
                      </div>
                      <div className="p-4 bg-alert-amber/10 border border-alert-amber/30 rounded flex items-start gap-3">
                        <span className="material-symbols-outlined text-alert-amber text-lg">
                          warning
                        </span>
                        <div>
                          <p className="text-xs font-bold text-alert-amber uppercase tracking-tight">
                            Diferencia detectada
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            El portal registra un monto autorizado de{" "}
                            <span className="text-white font-bold">$7,500.00</span>. Existe una
                            discrepancia de{" "}
                            <span className="text-white font-bold">$1,010.00</span> con el
                            presupuesto actual.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <button
                        className="w-full py-3 bg-primary hover:bg-primary/80 text-white rounded font-bold text-sm flex items-center justify-center gap-3 transition-all"
                        type="button"
                      >
                        <span
                          className="material-symbols-outlined animate-spin"
                          style={{ animationDuration: "3s" }}
                        >
                          sync
                        </span>
                        Sincronizar estatus ahora
                      </button>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="text-center p-2 border border-border-dark rounded bg-background-dark/80">
                          <p className="text-[9px] text-slate-400 uppercase font-bold">Refacciones</p>
                          <p className="text-xs font-bold text-alert-green">Solicitadas</p>
                        </div>
                        <div className="text-center p-2 border border-border-dark rounded bg-background-dark/80">
                          <p className="text-[9px] text-slate-400 uppercase font-bold">Deducible</p>
                          <p className="text-xs font-bold">$3,500</p>
                        </div>
                        <div className="text-center p-2 border border-border-dark rounded bg-background-dark/80">
                          <p className="text-[9px] text-slate-400 uppercase font-bold">Folio</p>
                          <p className="text-xs font-bold">AX-29102</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
            <button
              className="mt-6 text-sm text-slate-400 hover:text-white inline-flex items-center gap-2"
              type="button"
              onClick={() => navigate(-1)}
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Volver al listado
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
