import { useEffect, useMemo, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";
import AppHeader from "../../components/AppHeader.jsx";

export default function OrdenAdmision() {
  const [records, setRecords] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [partesAuto, setPartesAuto] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [marcaSaving, setMarcaSaving] = useState(false);
  const [marcaError, setMarcaError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [danosSiniestroParts, setDanosSiniestroParts] = useState([]);
  const [danosPreexistParts, setDanosPreexistParts] = useState([]);
  const [danosSiniestroSelect, setDanosSiniestroSelect] = useState("");
  const [danosPreexistSelect, setDanosPreexistSelect] = useState("");
  const [adjuntoOrden, setAdjuntoOrden] = useState(null);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [extractInfo, setExtractInfo] = useState("");
  const [form, setForm] = useState({
    reporte_siniestro: "",
    fecha_adm: "",
    hr_adm: "",
    nb_cliente: "",
    seguro_comp: "",
    tel_cliente: "",
    email_cliente: "",
    marca_vehiculo: "",
    tipo_vehiculo: "",
    modelo_anio: "",
    color_vehiculo: "",
    serie_auto: "",
    placas: "",
    kilometraje: "",
    danos_siniestro: "",
    danos_preexistentes: "",
    descripcion_siniestro: "",
    descripcion_danospreex: ""
  });

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/ordenes`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar las ordenes de admision");
        }
        const payload = await response.json();
        setRecords(payload);
      } catch (err) {
        setError(err.message || "No se pudieron cargar las ordenes de admision");
      }
    };

    load();
  }, []);

  useEffect(() => {
    const loadCatalogos = async () => {
      try {
        const [gruposRes, marcasRes, aseguradorasRes, partesRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/grupos-autos`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/marcas-autos`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`),
          fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`)
        ]);
        if (gruposRes.ok) {
          setGrupos(await gruposRes.json());
        }
        if (marcasRes.ok) {
          setMarcas(await marcasRes.json());
        }
        if (aseguradorasRes.ok) {
          setAseguradoras(await aseguradorasRes.json());
        }
        if (partesRes.ok) {
          setPartesAuto(await partesRes.json());
        }
      } catch {
        // ignore catalog load errors
      }
    };

    loadCatalogos();
  }, []);

  useEffect(() => {
    if (!previewModal?.archivo_path) return;
    setPreviewLoading(true);
    const fileUrl = `${import.meta.env.VITE_API_URL}${previewModal.archivo_path}`;
    let active = true;
    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el archivo");
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setPreviewType(blob.type || "");
      })
      .catch(() => {
        if (!active) return;
        setPreviewUrl("");
        setPreviewType("");
      })
      .finally(() => {
        if (!active) return;
        setPreviewLoading(false);
      });

    return () => {
      active = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal]);

  const resetForm = () => {
    setForm({
      reporte_siniestro: "",
      fecha_adm: "",
      hr_adm: "",
      nb_cliente: "",
      seguro_comp: "",
      tel_cliente: "",
      email_cliente: "",
      marca_vehiculo: "",
      tipo_vehiculo: "",
      modelo_anio: "",
      color_vehiculo: "",
      serie_auto: "",
      placas: "",
      kilometraje: "",
      danos_siniestro: "",
      danos_preexistentes: "",
      descripcion_siniestro: "",
      descripcion_danospreex: ""
    });
    setDanosSiniestroParts([]);
    setDanosPreexistParts([]);
    setDanosSiniestroSelect("");
    setDanosPreexistSelect("");
    setAdjuntoOrden(null);
    setExtractInfo("");
  };

  const openModal = () => {
    setError("");
    setFieldErrors({});
    resetForm();
    setGrupoSeleccionado("");
    setMarcaError("");
    setIsModalOpen(true);
  };

  const openEdit = (record) => {
    setError("");
    setFieldErrors({});
    setEditingId(record.id);
    setForm({
      reporte_siniestro: record.reporte_siniestro || "",
      fecha_adm: record.fecha_adm ? String(record.fecha_adm).slice(0, 10) : "",
      hr_adm: record.hr_adm || "",
      nb_cliente: record.nb_cliente || "",
      seguro_comp: record.seguro_comp || "",
      tel_cliente: record.tel_cliente || "",
      email_cliente: record.email_cliente || "",
      marca_vehiculo: record.marca_vehiculo || "",
      tipo_vehiculo: record.tipo_vehiculo || "",
      modelo_anio: record.modelo_anio || "",
      color_vehiculo: record.color_vehiculo || "",
      serie_auto: record.serie_auto || "",
      placas: record.placas || "",
      kilometraje: record.kilometraje ? String(record.kilometraje) : "",
      danos_siniestro: record.danos_siniestro || "",
      danos_preexistentes: record.danos_preexistentes || "",
      descripcion_siniestro: record.descripcion_siniestro || "",
      descripcion_danospreex: record.descripcion_danospreex || ""
    });
    setDanosSiniestroParts(
      record.danos_siniestro
        ? String(record.danos_siniestro)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    );
    setDanosPreexistParts(
      record.danos_preexistentes
        ? String(record.danos_preexistentes)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    );
    setGrupoSeleccionado("");
    if (record.marca_vehiculo) {
      const selected = marcas.find((marca) => marca.nb_marca === record.marca_vehiculo);
      if (selected?.gpo_marca) {
        setGrupoSeleccionado(selected.gpo_marca);
      }
    }
    setAdjuntoOrden(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const applyExtractedFields = (campos) => {
    if (!campos || typeof campos !== "object") return;
    setForm((prev) => {
      const next = { ...prev };
      const map = {
        reporte_siniestro: "reporte_siniestro",
        fecha_adm: "fecha_adm",
        hr_adm: "hr_adm",
        nb_cliente: "nb_cliente",
        seguro_comp: "seguro_comp",
        tel_cliente: "tel_cliente",
        email_cliente: "email_cliente",
        marca_vehiculo: "marca_vehiculo",
        tipo_vehiculo: "tipo_vehiculo",
        modelo_anio: "modelo_anio",
        color_vehiculo: "color_vehiculo",
        serie_auto: "serie_auto",
        placas: "placas",
        kilometraje: "kilometraje",
        descripcion_siniestro: "descripcion_siniestro"
      };
      for (const [target, source] of Object.entries(map)) {
        const incoming = String(campos[source] || "").trim();
        if (!incoming) continue;
        const current = String(next[target] || "").trim();
        if (!current) {
          next[target] = source === "kilometraje" ? incoming.replace(/[^\d]/g, "") : incoming;
        }
      }
      return next;
    });
  };

  const handleAdjuntoChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setAdjuntoOrden(file);
    setExtractInfo("");
    if (!file) return;
    try {
      setExtractingDoc(true);
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/ordenes/extract-fields`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo extraer información del archivo");
      }
      const payload = await response.json();
      const campos = payload?.campos || {};
      const fieldDebug = payload?.field_debug || {};
      applyExtractedFields(campos);

      if (campos?.danos_siniestro) {
        setDanosSiniestroParts((prev) => {
          const list = String(campos.danos_siniestro)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!list.length || prev.length) return prev;
          return list;
        });
      }
      if (campos?.danos_preexistentes) {
        setDanosPreexistParts((prev) => {
          const list = String(campos.danos_preexistentes)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (!list.length || prev.length) return prev;
          return list;
        });
      }

      if (campos?.marca_vehiculo) {
        const selected = marcas.find((marca) => marca.nb_marca === campos.marca_vehiculo);
        if (selected?.gpo_marca) {
          setGrupoSeleccionado(selected.gpo_marca);
        }
      }
      const aseguradoraDetectada = payload?.aseguradora_detectada;
      const requiredForReview = [
        ["reporte_siniestro", "Reporte/Siniestro"],
        ["fecha_adm", "Fecha admisión"],
        ["hr_adm", "Hora admisión"],
        ["nb_cliente", "Nombre cliente"],
        ["tel_cliente", "Teléfono"],
        ["email_cliente", "Email"],
        ["marca_vehiculo", "Marca"],
        ["tipo_vehiculo", "Tipo"],
        ["modelo_anio", "Año"],
        ["serie_auto", "Serie"],
        ["placas", "Placas"],
        ["kilometraje", "Kilometraje"]
      ];
      const missing = requiredForReview
        .filter(([key]) => !String(campos?.[key] || "").trim())
        .map(([, label]) => label);
      // Useful while calibrating extraction templates.
      if (Object.keys(fieldDebug).length) {
        // eslint-disable-next-line no-console
        console.info("OCR field_debug", fieldDebug);
      }
      setExtractInfo(
        aseguradoraDetectada
          ? `Documento detectado: ${aseguradoraDetectada}. Campos aplicados al formulario.${
              missing.length ? ` Revisar manualmente: ${missing.join(", ")}.` : ""
            }`
          : `Se extrajo texto del documento. Revisa y completa los campos.${
              missing.length ? ` Faltantes: ${missing.join(", ")}.` : ""
            }`
      );
    } catch (err) {
      setExtractInfo(err.message || "No se pudo leer el documento");
    } finally {
      setExtractingDoc(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors = {};
    if (!form.reporte_siniestro.trim()) errors.reporte_siniestro = "Requerido";
    if (!form.fecha_adm) errors.fecha_adm = "Requerido";
    if (!form.hr_adm) errors.hr_adm = "Requerido";
    if (!form.nb_cliente.trim()) errors.nb_cliente = "Requerido";
    if (!form.marca_vehiculo) errors.marca = "Selecciona una marca";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Completa los campos requeridos.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        ...form,
        kilometraje: form.kilometraje ? Number(form.kilometraje) : null,
        danos_siniestro: danosSiniestroParts.join(", "),
        danos_preexistentes: danosPreexistParts.join(", ")
      };
      const response = await fetch(
        editingId
          ? `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${editingId}`
          : `${import.meta.env.VITE_API_URL}/recepcion/ordenes`,
        {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo guardar la orden");
      }

      const created = await response.json().catch(() => ({}));
      const ordenId = editingId || created.id;

      const uploadExpedienteArchivo = async (file, tipo) => {
        if (!form.reporte_siniestro) return null;
        const formData = new FormData();
        formData.append("tipo", tipo);
        formData.append("file", file);
        const expedienteResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(
            form.reporte_siniestro
          )}/archivos`,
          { method: "POST", body: formData }
        );
        if (!expedienteResponse.ok) {
          const payload = await expedienteResponse.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir el archivo al expediente");
        }
        return expedienteResponse.json().catch(() => null);
      };

      let archivoPayload = null;
      if (ordenId && adjuntoOrden) {
        const formData = new FormData();
        formData.append("file", adjuntoOrden);
        const fileResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${ordenId}/archivo`,
          { method: "POST", body: formData }
        );
        if (!fileResponse.ok) {
          const payload = await fileResponse.json().catch(() => null);
          throw new Error(payload?.detail || "No se pudo subir el archivo");
        }
        archivoPayload = await fileResponse.json().catch(() => null);
        try {
          await uploadExpedienteArchivo(adjuntoOrden, "archivoorden_admision");
        } catch (err) {
          setError(err.message || "No se pudo subir el archivo al expediente");
        }
      }

      const existingRecord = editingId
        ? records.find((item) => item.id === ordenId)
        : null;
      const updatedRecord = {
        id: ordenId,
        created_at: created.created_at || existingRecord?.created_at,
        reporte_siniestro: form.reporte_siniestro,
        fecha_adm: form.fecha_adm,
        hr_adm: form.hr_adm,
        nb_cliente: form.nb_cliente,
        seguro_comp: form.seguro_comp,
        tel_cliente: form.tel_cliente,
        email_cliente: form.email_cliente,
        marca_vehiculo: form.marca_vehiculo,
        tipo_vehiculo: form.tipo_vehiculo,
        modelo_anio: form.modelo_anio,
        color_vehiculo: form.color_vehiculo,
        serie_auto: form.serie_auto,
        placas: form.placas,
        kilometraje: form.kilometraje,
        danos_siniestro: danosSiniestroParts.join(", "),
        danos_preexistentes: danosPreexistParts.join(", "),
        descripcion_siniestro: form.descripcion_siniestro,
        descripcion_danospreex: form.descripcion_danospreex,
        archivo_path: archivoPayload?.path || existingRecord?.archivo_path,
        archivo_nombre: archivoPayload?.name || existingRecord?.archivo_nombre,
        archivo_size: archivoPayload?.size || existingRecord?.archivo_size
      };

      setRecords((prev) => {
        if (editingId) {
          return prev.map((item) => (item.id === ordenId ? { ...item, ...updatedRecord } : item));
        }
        return [updatedRecord, ...prev];
      });
      setIsModalOpen(false);
      setEditingId(null);
      resetForm();
    } catch (err) {
      setError(err.message || "No se pudo guardar la orden");
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return records;
    }

    return records.filter((record) => {
      return (
        String(record.reporte_siniestro || "").toLowerCase().includes(normalizedQuery) ||
        (record.nb_cliente || "").toLowerCase().includes(normalizedQuery) ||
        (record.tel_cliente || "").toLowerCase().includes(normalizedQuery) ||
        (record.placas || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [records, query]);

  const marcasFiltradas = useMemo(() => {
    if (!grupoSeleccionado) return marcas;
    return marcas.filter((marca) => marca.gpo_marca === grupoSeleccionado);
  }, [marcas, grupoSeleccionado]);

  const handleCreateMarca = async (nombreMarca) => {
    setMarcaError("");
    if (!nombreMarca.trim()) {
      setMarcaError("Escribe la nueva marca.");
      return;
    }

    try {
      setMarcaSaving(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/marcas-autos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gpo_marca: grupoSeleccionado || "Otros",
          nb_marca: nombreMarca.trim()
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la marca");
      }
      const created = await response.json();
      setMarcas((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, marca_vehiculo: created.nb_marca }));
      setGrupoSeleccionado(created.gpo_marca || "Otros");
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la marca");
    } finally {
      setMarcaSaving(false);
    }
  };

  const handleCreateGrupo = async (nombreGrupo) => {
    if (!nombreGrupo.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/grupos-autos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_grupo: nombreGrupo.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear el grupo");
      }
      const created = await response.json();
      setGrupos((prev) => [...prev, created]);
      setGrupoSeleccionado(created.nb_grupo);
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear el grupo");
    }
  };

  const handleCreateAseguradora = async (nombre) => {
    if (!nombre.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/aseguradoras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_aseguradora: nombre.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la aseguradora");
      }
      const created = await response.json();
      setAseguradoras((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, seguro_comp: created.nb_aseguradora }));
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la aseguradora");
    }
  };

  const lookupPlacas = async (placas) => {
    if (!placas.trim()) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/lookup-placas?placas=${encodeURIComponent(placas)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.source) return;
      setForm((prev) => ({
        ...prev,
        nb_cliente: prev.nb_cliente || data.nb_cliente || "",
        tel_cliente: prev.tel_cliente || data.tel_cliente || "",
        email_cliente: prev.email_cliente || data.email_cliente || "",
        marca_vehiculo: prev.marca_vehiculo || data.vehiculo_marca || "",
        tipo_vehiculo: prev.tipo_vehiculo || data.vehiculo_tipo || "",
        modelo_anio: prev.modelo_anio || (data.vehiculo_anio ? String(data.vehiculo_anio) : data.vehiculo_modelo || ""),
        color_vehiculo: prev.color_vehiculo || data.vehiculo_color || "",
        serie_auto: prev.serie_auto || data.serie_auto || "",
        kilometraje: prev.kilometraje || (data.kilometraje ? String(data.kilometraje) : ""),
        seguro_comp: prev.seguro_comp || data.seguro || ""
      }));
      if (data.vehiculo_marca) {
        const selected = marcas.find((marca) => marca.nb_marca === data.vehiculo_marca);
        if (selected?.gpo_marca) {
          setGrupoSeleccionado(selected.gpo_marca);
        }
      }
    } catch {
      // ignore lookup failures
    }
  };

  const handleCreateParte = async (nombre) => {
    if (!nombre.trim()) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_parte: nombre.trim() })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la parte");
      }
      const created = await response.json();
      setPartesAuto((prev) => [...prev, created]);
    } catch (err) {
      setMarcaError(err.message || "No se pudo crear la parte");
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <AppHeader
            title="Ordenes de admision"
            showSearch
            searchPlaceholder="Buscar por reporte, cliente, telefono o placas..."
            searchValue={query}
            onSearchChange={setQuery}
            actions={
              <button
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                type="button"
                onClick={openModal}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nueva orden
              </button>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {error ? <p className="text-sm text-alert-red">{error}</p> : null}

            <div className="overflow-x-auto custom-scrollbar bg-surface-dark border border-border-dark rounded-xl">
              <table className="min-w-[1200px] w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background-dark/50">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Aseguradora
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Reporte/Siniestro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Fecha admision
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Hora admision
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Aseguradora
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Telefono
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Email
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Vehiculo
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Placas
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Kilometraje
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Danos siniestro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Descripcion siniestro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Danos preexistentes
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Descripcion danos preexistentes
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark">
                      Registro
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-border-dark text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={16}>
                        No hay ordenes de admision para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((record) => (
                      <tr key={record.id} className="border-b border-border-dark/50 hover:bg-white/5">
                        <td className="px-4 py-3 text-sm text-slate-300">{record.seguro_comp}</td>
                        <td className="px-4 py-3 text-sm text-primary font-bold">
                          {record.reporte_siniestro}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.fecha_adm}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.hr_adm}</td>
                        <td className="px-4 py-3 text-sm text-white font-semibold">
                          {record.nb_cliente}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.seguro_comp}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.tel_cliente}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.email_cliente}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {[record.marca_vehiculo, record.tipo_vehiculo, record.modelo_anio]
                            .filter(Boolean)
                            .join(" ")}
                          {record.color_vehiculo ? (
                            <span className="text-[10px] text-slate-500 block">
                              {record.color_vehiculo}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300 font-mono uppercase">
                          {record.placas}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.kilometraje}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {record.danos_siniestro}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {record.descripcion_siniestro}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {record.danos_preexistentes}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {record.descripcion_danospreex}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{record.created_at}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                              title="Ver archivo"
                              type="button"
                              onClick={() => {
                                if (record.archivo_path) {
                                  setPreviewModal(record);
                                  setPreviewZoom(1);
                                }
                              }}
                              disabled={!record.archivo_path}
                            >
                              <span className="material-symbols-outlined text-lg">visibility</span>
                            </button>
                            <button
                              className="p-1.5 hover:bg-primary/20 hover:text-primary rounded text-slate-400 transition-colors"
                              title="Editar"
                              type="button"
                              onClick={() => openEdit(record)}
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button
                              className="p-1.5 hover:bg-alert-red/20 hover:text-alert-red rounded text-slate-400 transition-colors"
                              title="Eliminar"
                              type="button"
                              onClick={() => setDeleteTarget(record)}
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60">
          <div className="w-full max-w-4xl max-h-[90vh] bg-surface-dark border border-border-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Nueva orden de admisión</h3>
                <p className="text-xs text-slate-400">
                  Captura rápida de la orden antes de registrar la recepción.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <form
              id="orden-admision-form"
              className="p-6 space-y-6 overflow-y-auto"
              onSubmit={handleSubmit}
            >
              {error ? <p className="text-sm text-alert-red">{error}</p> : null}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                    Datos del siniestro
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Reporte/Siniestro *</label>
                      <input
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.reporte_siniestro
                            ? "border border-alert-red"
                            : "border border-border-dark"
                        }`}
                        value={form.reporte_siniestro}
                        onChange={handleChange("reporte_siniestro")}
                        placeholder="04251630235"
                      />
                      {fieldErrors.reporte_siniestro ? (
                        <span className="text-[10px] text-alert-red">
                          {fieldErrors.reporte_siniestro}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <SearchableSelect
                        label="Aseguradora"
                        value={form.seguro_comp}
                        onChange={(value) => setForm((prev) => ({ ...prev, seguro_comp: value }))}
                        options={aseguradoras.map((item) => item.nb_aseguradora)}
                        placeholder="Seleccionar"
                        onAdd={handleCreateAseguradora}
                        addLabel="Agregar aseguradora"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha admisión *</label>
                      <input
                        type="date"
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.fecha_adm ? "border border-alert-red" : "border border-border-dark"
                        }`}
                        value={form.fecha_adm}
                        onChange={handleChange("fecha_adm")}
                        placeholder="dd/mm/aaaa"
                      />
                      {fieldErrors.fecha_adm ? (
                        <span className="text-[10px] text-alert-red">{fieldErrors.fecha_adm}</span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Hora admisión *</label>
                      <input
                        type="time"
                        className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                          fieldErrors.hr_adm ? "border border-alert-red" : "border border-border-dark"
                        }`}
                        value={form.hr_adm}
                        onChange={handleChange("hr_adm")}
                        placeholder="18:40"
                      />
                      {fieldErrors.hr_adm ? (
                        <span className="text-[10px] text-alert-red">{fieldErrors.hr_adm}</span>
                      ) : null}
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest pt-2">
                    Cliente
                  </h4>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre *</label>
                    <input
                      className={`w-full bg-background-dark rounded-lg px-3 py-2 text-sm text-white ${
                        fieldErrors.nb_cliente ? "border border-alert-red" : "border border-border-dark"
                      }`}
                      value={form.nb_cliente}
                      onChange={handleChange("nb_cliente")}
                      placeholder="Jesús Fernando Lugo"
                    />
                    {fieldErrors.nb_cliente ? (
                      <span className="text-[10px] text-alert-red">{fieldErrors.nb_cliente}</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.tel_cliente}
                        onChange={handleChange("tel_cliente")}
                        placeholder="669-164-5258"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                      <input
                        type="email"
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.email_cliente}
                        onChange={handleChange("email_cliente")}
                        placeholder="cliente@correo.com"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                    Vehículo
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SearchableSelect
                      label="Grupo"
                      value={grupoSeleccionado}
                      onChange={(value) => {
                        setGrupoSeleccionado(value);
                        setForm((prev) => ({ ...prev, marca_vehiculo: "" }));
                      }}
                      options={grupos.map((grupo) => grupo.nb_grupo)}
                      placeholder="Selecciona grupo"
                      onAdd={handleCreateGrupo}
                      addLabel="Agregar grupo"
                    />
                    <SearchableSelect
                      label="Marca"
                      value={form.marca_vehiculo}
                      onChange={(value) => {
                        setForm((prev) => ({ ...prev, marca_vehiculo: value }));
                        const selected = marcas.find((marca) => marca.nb_marca === value);
                        if (selected?.gpo_marca) {
                          setGrupoSeleccionado(selected.gpo_marca);
                        }
                      }}
                      options={marcas.map((marca) => marca.nb_marca)}
                      placeholder="Selecciona marca"
                      error={fieldErrors.marca || marcaError}
                      onAdd={handleCreateMarca}
                      addLabel="Agregar marca"
                    />
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.tipo_vehiculo}
                        onChange={handleChange("tipo_vehiculo")}
                        placeholder="GLA 200"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Año</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.modelo_anio}
                        onChange={handleChange("modelo_anio")}
                        placeholder="2022"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.color_vehiculo}
                        onChange={handleChange("color_vehiculo")}
                        placeholder="Negro"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Serie</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase"
                        value={form.serie_auto}
                        onChange={handleChange("serie_auto")}
                        placeholder="1HGCM82633A004352"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Placas</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase"
                        value={form.placas}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, placas: event.target.value.toUpperCase() }))
                        }
                        onBlur={(event) => lookupPlacas(event.target.value)}
                        placeholder="VLE-911C"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Kilometraje</label>
                      <input
                        type="number"
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.kilometraje}
                        onChange={handleChange("kilometraje")}
                        placeholder="45000"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                  Documentos
                </h4>
                <div className="rounded-xl border border-border-dark bg-background-dark/60 p-4">
                  <label
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-dark px-4 py-6 text-center text-sm text-slate-400 hover:border-primary/60 hover:text-slate-200 transition-colors cursor-pointer"
                    htmlFor="orden-admision-adjunto"
                  >
                    <span className="material-symbols-outlined text-3xl">upload_file</span>
                    <span className="text-xs font-bold uppercase tracking-widest">
                      Arrastra el archivo o haz clic para cargar
                    </span>
                    <span className="text-[10px] text-slate-500">
                      PDF, JPG, JPEG o PNG
                    </span>
                    <input
                      id="orden-admision-adjunto"
                      className="hidden"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleAdjuntoChange}
                    />
                  </label>
                  {adjuntoOrden ? (
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-border-dark bg-background-dark/70 px-3 py-2">
                      <span className="text-xs text-slate-300">{adjuntoOrden.name}</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-white"
                        onClick={() => setAdjuntoOrden(null)}
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  ) : null}
                  {extractingDoc ? (
                    <p className="mt-2 text-xs text-slate-400">Extrayendo datos del documento...</p>
                  ) : null}
                  {extractInfo ? (
                    <p className="mt-2 text-xs text-slate-400">{extractInfo}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">
                  Daños
                </h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Daños siniestro</label>
                    <SearchableSelect
                      value={danosSiniestroSelect}
                      onChange={(value) => {
                        setDanosSiniestroSelect("");
                        setDanosSiniestroParts((prev) =>
                          prev.includes(value) ? prev : [...prev, value]
                        );
                      }}
                      options={partesAuto.map((item) => item.nb_parte)}
                      placeholder="Buscar parte..."
                      onAdd={handleCreateParte}
                      addLabel="Agregar parte"
                    />
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border-dark bg-background-dark/40 p-3">
                      {danosSiniestroParts.length ? (
                        danosSiniestroParts.map((part) => (
                          <span
                            key={part}
                            className="inline-flex items-center gap-1 rounded-full border border-alert-red/40 bg-alert-red/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-red"
                          >
                            {part}
                            <button
                              type="button"
                              className="ml-1 text-xs text-current hover:opacity-80"
                              onClick={() =>
                                setDanosSiniestroParts((prev) => prev.filter((item) => item !== part))
                              }
                              aria-label={`Quitar ${part}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Descripción siniestro
                    </label>
                    <textarea
                      className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white h-24"
                      value={form.descripcion_siniestro}
                      onChange={handleChange("descripcion_siniestro")}
                      placeholder="Detalle de las áreas dañadas y observaciones"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Daños preexistentes
                    </label>
                    <SearchableSelect
                      value={danosPreexistSelect}
                      onChange={(value) => {
                        setDanosPreexistSelect("");
                        setDanosPreexistParts((prev) =>
                          prev.includes(value) ? prev : [...prev, value]
                        );
                      }}
                      options={partesAuto.map((item) => item.nb_parte)}
                      placeholder="Buscar parte..."
                      onAdd={handleCreateParte}
                      addLabel="Agregar parte"
                    />
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border-dark bg-background-dark/40 p-3">
                      {danosPreexistParts.length ? (
                        danosPreexistParts.map((part) => (
                          <span
                            key={part}
                            className="inline-flex items-center gap-1 rounded-full border border-alert-amber/40 bg-alert-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-amber"
                          >
                            {part}
                            <button
                              type="button"
                              className="ml-1 text-xs text-current hover:opacity-80"
                              onClick={() =>
                                setDanosPreexistParts((prev) => prev.filter((item) => item !== part))
                              }
                              aria-label={`Quitar ${part}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Descripción daños preexistentes
                    </label>
                    <textarea
                      className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white h-24"
                      value={form.descripcion_danospreex}
                      onChange={handleChange("descripcion_danospreex")}
                      placeholder="Descripción detallada de daños anteriores"
                    />
                  </div>
                </div>
              </div>
            </form>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-dark/60 bg-surface-dark/95">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="orden-admision-form"
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10 disabled:opacity-60"
                disabled={isSaving}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                {isSaving ? "Guardando..." : "Guardar orden"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-alert-red">delete</span>
              <h3 className="text-lg font-bold text-white">Eliminar orden</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Seguro que deseas eliminar la orden "{deleteTarget.reporte_siniestro}"?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-alert-red text-white"
                onClick={async () => {
                  try {
                    const response = await fetch(
                      `${import.meta.env.VITE_API_URL}/recepcion/ordenes/${deleteTarget.id}`,
                      { method: "DELETE" }
                    );
                    if (!response.ok) {
                      const payload = await response.json().catch(() => null);
                      throw new Error(payload?.detail || "No se pudo eliminar la orden");
                    }
                    setRecords((prev) => prev.filter((item) => item.id !== deleteTarget.id));
                    setDeleteTarget(null);
                  } catch (err) {
                    setError(err.message || "No se pudo eliminar la orden");
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {previewModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-4xl bg-surface-dark border border-border-dark rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark">
              <div>
                <h3 className="text-lg font-bold text-white">Vista previa</h3>
                <p className="text-xs text-slate-400">{previewModal.archivo_nombre}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom((prev) => Math.max(0.5, prev - 0.1))}
                  title="Zoom -"
                >
                  <span className="material-symbols-outlined">zoom_out</span>
                </button>
                <span className="text-xs text-slate-400">{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom((prev) => Math.min(2, prev + 0.1))}
                  title="Zoom +"
                >
                  <span className="material-symbols-outlined">zoom_in</span>
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white transition-colors"
                  onClick={() => setPreviewZoom(1)}
                  title="Reset zoom"
                >
                  <span className="material-symbols-outlined">center_focus_strong</span>
                </button>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white transition-colors"
                onClick={() => setPreviewModal(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-background-dark">
              {previewLoading ? (
                <div className="w-full h-[70vh] flex items-center justify-center text-slate-400 text-sm">
                  Cargando archivo...
                </div>
              ) : previewUrl ? (
                previewType.includes("pdf") ? (
                  <div className="w-full h-[70vh] overflow-auto">
                    <iframe
                      title="Vista previa PDF"
                      className="w-full h-full border-0"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: "top left" }}
                      src={previewUrl}
                    />
                  </div>
                ) : (
                  <div className="w-full h-[70vh] overflow-auto flex items-center justify-center">
                    <img
                      className="object-contain"
                      style={{ transform: `scale(${previewZoom})`, transformOrigin: "center" }}
                      src={previewUrl}
                      alt={previewModal.archivo_nombre || "Archivo"}
                    />
                  </div>
                )
              ) : (
                <div className="w-full h-[70vh] flex items-center justify-center text-slate-400 text-sm">
                  No se pudo previsualizar el archivo.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-dark">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setPreviewModal(null)}
              >
                Cerrar
              </button>
              <a
                className="px-4 py-2 rounded-lg bg-primary text-white font-bold"
                href={`${import.meta.env.VITE_API_URL}${previewModal.archivo_path}`}
                download={previewModal.archivo_nombre || "archivo"}
              >
                Descargar
              </a>
            </div>
          </div>
        </div>
      ) : null}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm bg-surface-dark border border-border-dark rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-alert-amber">warning</span>
              <h3 className="text-lg font-bold text-white">Reestablecer formulario</h3>
            </div>
            <p className="text-sm text-slate-300">
              ¿Seguro que deseas limpiar todos los campos? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-border-dark text-slate-300"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-alert-amber text-black font-bold"
                onClick={() => {
                  resetForm();
                  setGrupoSeleccionado("");
                  setMarcaError("");
                  setFieldErrors({});
                  setShowResetConfirm(false);
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
