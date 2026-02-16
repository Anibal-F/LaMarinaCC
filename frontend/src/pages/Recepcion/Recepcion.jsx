import { useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

const statusFilters = [
  "Todos",
  "En Valuacion",
  "Pendiente Autorizacion",
  "En Taller"
];

const aseguradoras = ["CHUBB", "Qualitas"];
const photoTypeLabels = {
  photo_damage_right: "Siniestro · Lado derecho",
  photo_damage_left: "Siniestro · Lado izquierdo",
  photo_preexist_right: "Preexistente · Lado derecho",
  photo_preexist_left: "Preexistente · Lado izquierdo",
  photo: "Foto (legacy)",
  signature: "Firma del cliente"
};

export default function Recepcion() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("Todos");
  const [error, setError] = useState("");
  const [mediaModal, setMediaModal] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [openingPdfId, setOpeningPdfId] = useState(null);
  const [pdfModal, setPdfModal] = useState(null);
  const [whatsAppModal, setWhatsAppModal] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los registros");
        }
        const payload = await response.json();
        setRecords(payload);
      } catch (err) {
        setError(err.message || "No se pudieron cargar los registros");
      }
    };

    load();
  }, []);

  const handleDeleteRegistro = async (record) => {
    const ok = window.confirm(
      `Se eliminará la recepción #${record.folio_recep}. Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros/${record.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo eliminar el registro");
      }
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
    } catch (err) {
      setError(err.message || "No se pudo eliminar el registro");
    }
  };

  const closePdfModal = () => {
    if (pdfModal?.objectUrl) {
      URL.revokeObjectURL(pdfModal.objectUrl);
    }
    setPdfModal(null);
  };

  const openPdfPreview = async (record) => {
    if (!record?.id) return;
    setOpeningPdfId(record.id);
    setPdfModal({
      record,
      loading: true,
      error: "",
      fileName: "",
      objectUrl: ""
    });
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros/${record.id}/pdf`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar el PDF");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fallback = `Recepcion_${record.folio_recep || record.id}.pdf`;
      const fileName = fileNameMatch?.[1] || fallback;
      const objectUrl = URL.createObjectURL(blob);
      setPdfModal((prev) => {
        if (prev?.objectUrl) {
          URL.revokeObjectURL(prev.objectUrl);
        }
        return {
          ...prev,
          loading: false,
          error: "",
          fileName,
          objectUrl
        };
      });
    } catch (err) {
      setPdfModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "No se pudo generar el PDF"
      }));
    } finally {
      setOpeningPdfId(null);
    }
  };

  const sanitizeToken = (value, fallback = "NA") => {
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;
    return raw.replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "") || fallback;
  };

  const normalizePhone = (value) => String(value || "").replace(/\D+/g, "");

  const buildWhatsappPreview = (record) => {
    const folio = record?.folio_recep || "-";
    const cliente = record?.nb_cliente || "-";
    const vehiculo = record?.vehiculo || "-";
    const placas = record?.placas || "-";
    const fecha = record?.fecha_recep || "-";
    return `Hola ${cliente}, te compartimos tu comprobante de recepción.

Folio: ${folio}
Vehículo: ${vehiculo}
Placas: ${placas}
Fecha ingreso: ${fecha}

Si tienes dudas, responde a este mensaje.`;
  };

  const openWhatsAppModal = (record) => {
    setWhatsAppModal({
      record,
      primaryPhone: normalizePhone(record?.tel_cliente),
      extraPhones: [""],
      message: buildWhatsappPreview(record),
      error: ""
    });
  };

  const sendWhatsAppMessage = () => {
    if (!whatsAppModal) return;
    const phoneList = [
      normalizePhone(whatsAppModal.primaryPhone),
      ...whatsAppModal.extraPhones.map((value) => normalizePhone(value))
    ].filter(Boolean);
    const uniquePhones = Array.from(new Set(phoneList));
    if (uniquePhones.length === 0) {
      setWhatsAppModal((prev) => ({
        ...prev,
        error: "Captura al menos un número de celular válido."
      }));
      return;
    }
    const text = encodeURIComponent(whatsAppModal.message || "");
    uniquePhones.forEach((phone) => {
      window.open(`https://wa.me/${phone}?text=${text}`, "_blank", "noopener,noreferrer");
    });
    setWhatsAppModal(null);
  };

  const openMedia = async (record, mediaType) => {
    setMediaLoading(true);
    setMediaItems([]);
    setMediaModal({ recordId: record.id, mediaType, record });
    try {
      const baseUrl = `${import.meta.env.VITE_API_URL}/recepcion/registros/${record.id}/media`;
      const response = await fetch(
        mediaType === "photo" ? baseUrl : `${baseUrl}?media_type=${mediaType}`
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los archivos");
      }
      const payload = await response.json();
      if (mediaType === "photo") {
        setMediaItems(
          payload
            .filter((item) => {
              const type = String(item.media_type || "");
              return type.startsWith("photo") || type === "signature";
            })
            .sort((a, b) => {
              const aType = a.media_type || "";
              const bType = b.media_type || "";
              if (aType === bType) return (a.id || 0) - (b.id || 0);
              return String(aType).localeCompare(String(bType));
            })
        );
      } else {
        setMediaItems(payload);
      }
      setPhotoViewerIndex(null);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los archivos");
    } finally {
      setMediaLoading(false);
    }
  };

  const downloadMediaZip = async () => {
    if (!mediaModal?.recordId || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros/${mediaModal.recordId}/media/download`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo descargar el archivo ZIP");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fallbackName = mediaModal?.record
        ? `Galeria_${sanitizeToken(mediaModal.record.folio_recep)}_${sanitizeToken(
            mediaModal.record.vehiculo_marca
          )}_${sanitizeToken(mediaModal.record.vehiculo_tipo)}_${sanitizeToken(
            mediaModal.record.vehiculo_anio
          )}.zip`
        : `recepcion_${mediaModal.recordId}_imagenes.zip`;
      const zipName = fileNameMatch?.[1] || fallbackName;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "No se pudo descargar el archivo ZIP");
    } finally {
      setDownloadingZip(false);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const matchesQuery =
        !normalizedQuery ||
        String(record.folio_recep || "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        (record.nb_cliente || "").toLowerCase().includes(normalizedQuery) ||
        (record.vehiculo || "").toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        activeStatus === "Todos" || (record.estatus || "") === activeStatus;

      return matchesQuery && matchesStatus;
    });
  }, [records, query, activeStatus]);

  useEffect(() => {
    return () => {
      if (pdfModal?.objectUrl) {
        URL.revokeObjectURL(pdfModal.objectUrl);
      }
    };
  }, [pdfModal]);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Listado de Recepción de Vehiculos"
            showSearch
            searchPlaceholder="Buscar por folio, vehiculo o cliente..."
            searchValue={query}
            onSearchChange={setQuery}
            actions={
              <>
                <Link
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                  to="/recepcion/nuevo"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Nuevo Registro
                </Link>
                <div className="h-8 w-[1px] bg-border-dark mx-2"></div>
                <button className="relative p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all">
                  <span className="material-symbols-outlined">filter_list</span>
                </button>
              </>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">
                Filtrar por estatus:
              </span>
              {statusFilters.map((status) => (
                <button
                  key={status}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                    activeStatus === status
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-surface-dark text-slate-400 border-border-dark hover:text-white"
                  }`}
                  type="button"
                  onClick={() => setActiveStatus(status)}
                >
                  {status}
                </button>
              ))}
              <div className="w-[1px] h-4 bg-border-dark mx-2"></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">
                Aseguradora:
              </span>
              {aseguradoras.map((aseguradora) => (
                <button
                  key={aseguradora}
                  className="bg-surface-dark text-slate-400 border border-border-dark px-3 py-1 rounded-full text-[11px] font-bold hover:text-white transition-colors"
                  type="button"
                >
                  {aseguradora}
                </button>
              ))}
            </div>

            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <div className="overflow-hidden bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-dark/50">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Folio
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Fecha/Hora ingreso
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Teléfono
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Vehiculo (Marca/Modelo)
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Placas
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Seguro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Entrega estimada
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Estatus
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Daños
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr key={record.id} className="border-b border-border-dark/50 hover:bg-white/5">
                      <td className="px-4 py-3 text-sm text-primary font-bold">#{record.folio_recep}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{record.fecha_recep}</td>
                      <td className="px-4 py-3 text-sm text-white font-semibold">{record.nb_cliente}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{record.tel_cliente || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {record.vehiculo}
                        <span className="text-[10px] text-slate-500 block">
                          {[record.vehiculo_tipo, record.vehiculo_anio]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {record.color ? (
                          <span className="text-[10px] text-slate-500 block">{record.color}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono uppercase">{record.placas}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{record.seguro}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{record.fecha_entregaestim}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            record.estatus === "En Valuacion"
                              ? "bg-blue-500/10 text-blue-500"
                              : record.estatus === "Pendiente Autorizacion"
                                ? "bg-alert-amber/10 text-alert-amber"
                                : record.estatus === "En Taller"
                                  ? "bg-alert-green/10 text-alert-green"
                                  : "bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {record.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {record.danos_siniestro_count || record.danos_preexistentes_count ? (
                          <span className="text-xs font-semibold text-slate-200">
                            S:{record.danos_siniestro_count || 0} · P:
                            {record.danos_preexistentes_count || 0}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Sin daños</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors disabled:opacity-60"
                            title="Documento"
                            type="button"
                            onClick={() => openPdfPreview(record)}
                            disabled={openingPdfId === record.id}
                          >
                            <span className="material-symbols-outlined text-lg">description</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Editar"
                            type="button"
                            onClick={() => navigate(`/recepcion/nuevo?edit=${record.id}`)}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Video"
                            type="button"
                            onClick={() => openMedia(record, "video")}
                          >
                            <span className="material-symbols-outlined text-lg">videocam</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                            title="Galería de fotos"
                            type="button"
                            onClick={() => openMedia(record, "photo")}
                          >
                            <span className="material-symbols-outlined text-lg">photo_library</span>
                          </button>
                          <button
                            className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                            title="Eliminar"
                            type="button"
                            onClick={() => handleDeleteRegistro(record)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={11}>
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              <p>Mostrando {filtered.length} de {records.length} registros</p>
            </div>
          </div>
        </main>
      </div>
      {mediaModal ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="w-[95vw] max-w-7xl max-h-[90vh] bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                {mediaModal.mediaType === "video" ? "Videos" : "Fotos"} de recepción
              </h3>
              <div className="flex items-center gap-2">
                {mediaModal.mediaType === "photo" ? (
                  <button
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 text-xs font-bold transition-colors disabled:opacity-50"
                    type="button"
                    onClick={downloadMediaZip}
                    disabled={downloadingZip || mediaLoading || mediaItems.length === 0}
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    {downloadingZip ? "Descargando..." : "Descargar ZIP"}
                  </button>
                ) : null}
                <button
                  className="text-slate-400 hover:text-white"
                  type="button"
                  onClick={() => {
                    setMediaModal(null);
                    setPhotoViewerIndex(null);
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            {mediaLoading ? (
              <p className="text-sm text-slate-400">Cargando archivos...</p>
            ) : mediaItems.length === 0 ? (
              <p className="text-sm text-slate-400">No hay archivos disponibles.</p>
            ) : mediaModal.mediaType === "photo" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto max-h-[75vh] custom-scrollbar pr-1">
                {mediaItems.map((item, index) => (
                  <button
                    key={item.id}
                    className="relative text-left group"
                    type="button"
                    onClick={() => setPhotoViewerIndex(index)}
                    title="Abrir en pantalla completa"
                  >
                    <img
                      src={`${import.meta.env.VITE_API_URL}${item.file_path}`}
                      alt={item.original_name}
                      className="w-full h-44 object-cover rounded-lg border border-border-dark"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white">
                      {photoTypeLabels[item.media_type] || item.media_type || "Foto"}
                    </span>
                    <span className="absolute right-2 bottom-2 rounded-full bg-black/70 border border-white/10 px-2 py-1 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      Pantalla completa
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[75vh] custom-scrollbar pr-1">
                {mediaItems.map((item) => (
                  <video
                    key={item.id}
                    src={`${import.meta.env.VITE_API_URL}${item.file_path}`}
                    controls
                    className="w-full rounded-lg border border-border-dark"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {pdfModal ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="w-[95vw] max-w-6xl h-[90vh] bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Vista previa de PDF</h3>
                <p className="text-xs text-slate-400">{pdfModal.fileName || "Generando documento..."}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title="Descargar"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  disabled={!pdfModal.objectUrl}
                  onClick={() => {
                    if (!pdfModal.objectUrl) return;
                    const link = document.createElement("a");
                    link.href = pdfModal.objectUrl;
                    link.download =
                      pdfModal.fileName ||
                      `Recepcion_${pdfModal.record?.folio_recep || pdfModal.record?.id}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                  }}
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                </button>
                <button
                  type="button"
                  title="Abrir en nueva ventana"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  disabled={!pdfModal.objectUrl}
                  onClick={() => {
                    if (!pdfModal.objectUrl) return;
                    window.open(pdfModal.objectUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <span className="material-symbols-outlined text-lg">open_in_new</span>
                </button>
                <button
                  type="button"
                  title="Enviar por correo"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-slate-300 hover:text-white hover:border-primary"
                  onClick={() => {
                    const folio = pdfModal.record?.folio_recep || pdfModal.record?.id;
                    const subject = encodeURIComponent(`Comprobante de recepción #${folio}`);
                    const body = encodeURIComponent(
                      `Te comparto el comprobante de recepción #${folio}.\n\nNota: adjunta el PDF descargado desde la vista previa.`
                    );
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                >
                  <span className="material-symbols-outlined text-lg">mail</span>
                </button>
                <button
                  type="button"
                  title="Enviar por WhatsApp"
                  className="p-2 rounded-lg bg-surface-dark border border-border-dark text-[#25D366] hover:text-[#36e27a] hover:border-primary"
                  onClick={() => openWhatsAppModal(pdfModal.record)}
                >
                  <svg
                    viewBox="0 0 32 32"
                    className="w-5 h-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M19.11 17.21c-.28-.14-1.65-.82-1.9-.91-.25-.09-.43-.14-.61.14-.18.28-.71.91-.87 1.09-.16.18-.32.21-.6.07-.28-.14-1.17-.43-2.24-1.37-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.35-.02-.49-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.46h-.52c-.18 0-.46.07-.7.35-.24.28-.92.9-.92 2.19s.94 2.54 1.07 2.71c.14.18 1.85 2.82 4.48 3.95.63.27 1.12.43 1.5.55.63.2 1.2.17 1.65.1.5-.07 1.65-.67 1.88-1.31.23-.64.23-1.19.16-1.31-.07-.12-.25-.19-.53-.33z" />
                    <path d="M16.01 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.26.59 4.47 1.71 6.41L3 29l6.79-1.78c1.87 1.02 3.97 1.55 6.22 1.56h.01c7.07 0 12.8-5.73 12.8-12.8 0-3.43-1.34-6.65-3.77-9.08A12.74 12.74 0 0 0 16.01 3.2zm0 23.42h-.01c-1.92 0-3.8-.52-5.44-1.49l-.39-.23-4.03 1.06 1.08-3.93-.25-.41a10.58 10.58 0 0 1-1.62-5.62c0-5.86 4.77-10.63 10.64-10.63 2.83 0 5.5 1.1 7.5 3.11 2 2 3.1 4.67 3.1 7.5 0 5.86-4.77 10.63-10.63 10.63z" />
                  </svg>
                </button>
                <button
                  className="text-slate-400 hover:text-white"
                  type="button"
                  onClick={closePdfModal}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black/30">
              {pdfModal.loading ? (
                <div className="h-full flex items-center justify-center text-slate-300">
                  Generando PDF...
                </div>
              ) : pdfModal.error ? (
                <div className="h-full flex items-center justify-center text-alert-red">
                  {pdfModal.error}
                </div>
              ) : (
                <iframe
                  src={pdfModal.objectUrl}
                  title="Vista previa PDF recepción"
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
      {photoViewerIndex != null && mediaItems[photoViewerIndex] ? (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-6">
          <button
            className="absolute top-6 right-6 text-white/80 hover:text-white"
            type="button"
            onClick={() => setPhotoViewerIndex(null)}
          >
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
          {mediaItems.length > 1 ? (
            <>
              <button
                className="absolute left-6 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                type="button"
                onClick={() =>
                  setPhotoViewerIndex((prev) =>
                    prev === 0 ? mediaItems.length - 1 : prev - 1
                  )
                }
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button
                className="absolute right-6 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                type="button"
                onClick={() =>
                  setPhotoViewerIndex((prev) =>
                    prev === mediaItems.length - 1 ? 0 : prev + 1
                  )
                }
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </>
          ) : null}
          <img
            src={`${import.meta.env.VITE_API_URL}${mediaItems[photoViewerIndex].file_path}`}
            alt={mediaItems[photoViewerIndex].original_name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 border border-white/10 px-3 py-1 text-xs text-white">
            {photoTypeLabels[mediaItems[photoViewerIndex].media_type] ||
              mediaItems[photoViewerIndex].media_type ||
              "Foto"}{" "}
            · {photoViewerIndex + 1}/{mediaItems.length}
          </div>
        </div>
      ) : null}
      {whatsAppModal ? (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border-dark flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <svg
                    viewBox="0 0 32 32"
                    className="w-5 h-5 text-[#25D366]"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M19.11 17.21c-.28-.14-1.65-.82-1.9-.91-.25-.09-.43-.14-.61.14-.18.28-.71.91-.87 1.09-.16.18-.32.21-.6.07-.28-.14-1.17-.43-2.24-1.37-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.35-.02-.49-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.46h-.52c-.18 0-.46.07-.7.35-.24.28-.92.9-.92 2.19s.94 2.54 1.07 2.71c.14.18 1.85 2.82 4.48 3.95.63.27 1.12.43 1.5.55.63.2 1.2.17 1.65.1.5-.07 1.65-.67 1.88-1.31.23-.64.23-1.19.16-1.31-.07-.12-.25-.19-.53-.33z" />
                    <path d="M16.01 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.26.59 4.47 1.71 6.41L3 29l6.79-1.78c1.87 1.02 3.97 1.55 6.22 1.56h.01c7.07 0 12.8-5.73 12.8-12.8 0-3.43-1.34-6.65-3.77-9.08A12.74 12.74 0 0 0 16.01 3.2zm0 23.42h-.01c-1.92 0-3.8-.52-5.44-1.49l-.39-.23-4.03 1.06 1.08-3.93-.25-.41a10.58 10.58 0 0 1-1.62-5.62c0-5.86 4.77-10.63 10.64-10.63 2.83 0 5.5 1.1 7.5 3.11 2 2 3.1 4.67 3.1 7.5 0 5.86-4.77 10.63-10.63 10.63z" />
                  </svg>
                  Enviar por WhatsApp
                </h3>
                <p className="text-xs text-slate-400">Previsualización de plantilla Meta</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setWhatsAppModal(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-border-dark bg-background-dark/40 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Template: recepcion_pdf_v1
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Variables detectadas:{" "}
                  <span className="text-white font-semibold">
                    Cliente, Folio, Vehículo, Placas, Fecha ingreso
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Celular principal
                  </span>
                  <input
                    className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary"
                    value={whatsAppModal.primaryPhone}
                    onChange={(e) =>
                      setWhatsAppModal((prev) => ({
                        ...prev,
                        primaryPhone: e.target.value,
                        error: ""
                      }))
                    }
                    placeholder="6691234567"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Celulares adicionales
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-white"
                    onClick={() =>
                      setWhatsAppModal((prev) => ({
                        ...prev,
                        extraPhones: [...prev.extraPhones, ""]
                      }))
                    }
                  >
                    + Agregar
                  </button>
                </div>
                {whatsAppModal.extraPhones.map((phone, idx) => (
                  <div key={`extra-phone-${idx}`} className="flex items-center gap-2">
                    <input
                      className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary"
                      value={phone}
                      onChange={(e) =>
                        setWhatsAppModal((prev) => ({
                          ...prev,
                          extraPhones: prev.extraPhones.map((item, itemIdx) =>
                            itemIdx === idx ? e.target.value : item
                          ),
                          error: ""
                        }))
                      }
                      placeholder="6690000000"
                    />
                    <button
                      type="button"
                      className="p-2 rounded-lg text-slate-400 hover:text-alert-red hover:bg-alert-red/10"
                      onClick={() =>
                        setWhatsAppModal((prev) => ({
                          ...prev,
                          extraPhones:
                            prev.extraPhones.length === 1
                              ? [""]
                              : prev.extraPhones.filter((_, itemIdx) => itemIdx !== idx)
                        }))
                      }
                      title="Quitar"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ))}
              </div>

              <label className="space-y-1.5 block">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  Mensaje (preview)
                </span>
                <textarea
                  className="w-full min-h-36 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary"
                  value={whatsAppModal.message}
                  onChange={(e) =>
                    setWhatsAppModal((prev) => ({
                      ...prev,
                      message: e.target.value
                    }))
                  }
                />
              </label>
              {whatsAppModal.error ? (
                <p className="text-sm text-alert-red">{whatsAppModal.error}</p>
              ) : null}
            </div>
            <div className="px-5 py-4 border-t border-border-dark flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-border-dark text-slate-300 hover:text-white"
                onClick={() => setWhatsAppModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 font-semibold"
                onClick={sendWhatsAppMessage}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
