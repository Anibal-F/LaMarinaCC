import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import SearchableSelect from "../../components/SearchableSelect.jsx";

export default function RecepcionForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);
  const fuelLevels = ["Tanque Vacio", "1/4 Tanque", "1/2 Tanque", "3/4 Tanque", "Tanque Lleno"];
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("lmcc_user") || "null");
    } catch {
      return null;
    }
  })();
  const displayUserName = storedUser?.name || storedUser?.user_name || "Usuario";
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [gruposAutos, setGruposAutos] = useState([]);
  const [marcasAutos, setMarcasAutos] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [marcaSaving, setMarcaSaving] = useState(false);
  const [marcaError, setMarcaError] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [fuelLevelIndex, setFuelLevelIndex] = useState(2);
  const [form, setForm] = useState({
    folio_recep: "",
    fecha_recep: new Date().toISOString().slice(0, 16),
    nb_cliente: "",
    telefono: "",
    seguro: "Particular (Sin Seguro)",
    email: "",
    vehiculo_marca: "",
    vehiculo_modelo: "",
    vehiculo_anio: "",
    vehiculo_tipo: "",
    vehiculo_color: "",
    placas: "",
    kilometraje: "",
    fecha_entregaestim: "",
    estatus: "Recepcionado",
    estado_mecanico: "",
    observaciones: ""
  });
  const [videoFile, setVideoFile] = useState(null);
  const [damageRightFiles, setDamageRightFiles] = useState([]);
  const [damageLeftFiles, setDamageLeftFiles] = useState([]);
  const [preexistRightFiles, setPreexistRightFiles] = useState([]);
  const [preexistLeftFiles, setPreexistLeftFiles] = useState([]);
  const [damageRightIndex, setDamageRightIndex] = useState(0);
  const [damageLeftIndex, setDamageLeftIndex] = useState(0);
  const [preexistRightIndex, setPreexistRightIndex] = useState(0);
  const [preexistLeftIndex, setPreexistLeftIndex] = useState(0);
  const signatureRef = useRef(null);
  const [isSigning, setIsSigning] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signatureDirty, setSignatureDirty] = useState(false);
  const [reporteSiniestro, setReporteSiniestro] = useState("");
  const [expedienteFiles, setExpedienteFiles] = useState([]);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [existingVideoUrl, setExistingVideoUrl] = useState("");
  const [existingDamageRightPreviews, setExistingDamageRightPreviews] = useState([]);
  const [existingDamageLeftPreviews, setExistingDamageLeftPreviews] = useState([]);
  const [existingPreexistRightPreviews, setExistingPreexistRightPreviews] = useState([]);
  const [existingPreexistLeftPreviews, setExistingPreexistLeftPreviews] = useState([]);
  const [damageModalOpen, setDamageModalOpen] = useState(false);
  const [damageMode, setDamageMode] = useState("siniestro");
  const [damagePartsSiniestro, setDamagePartsSiniestro] = useState([]);
  const [damagePartsPreexist, setDamagePartsPreexist] = useState([]);
  const [damageSvgMarkup, setDamageSvgMarkup] = useState("");
  const [damageSvgIds, setDamageSvgIds] = useState([]);
  const [partesAuto, setPartesAuto] = useState([]);
  const [damageSelectValue, setDamageSelectValue] = useState("");
  const [damageObsSiniestro, setDamageObsSiniestro] = useState("");
  const [damageObsPreexist, setDamageObsPreexist] = useState("");
  const siniestroSvgRef = useRef(null);
  const preexistSvgRef = useRef(null);
  const modalSvgRef = useRef(null);

  const damageParts = [
    "FACIA DELANTERA",
    "FARO DERECHO",
    "FARO IZQUIERDO",
    "PARRILLA",
    "COFRE",
    "SALPICADERA IZQUIERDA",
    "SALPICADERA DERECHA",
    "ESPEJO IZQUIERDO",
    "ESPEJO DERECHO",
    "POSTE PARABRISAS IZQUIERDO",
    "POSTE PARABRISAS DERECHO",
    "PUERTA DELANTERA IZQUIERDA",
    "PUERTA DELANTERA DERECHA",
    "PUERTA TRASERA IZQUIERDA",
    "PUERTA TRASERA DERECHA",
    "ESTRIBO IZQUIERDO",
    "ESTRIBO DERECHO",
    "TOLDO",
    "COSTADO IZQUIERDO",
    "COSTADO DERECHO",
    "TAPA CAJUELA",
    "STOP IZQUIERDO",
    "STOP DERECHO",
    "FACIA TRASERA"
  ];
  const formatPartLabel = (part) => part.replace(/_/g, " ");
  const normalizePartId = (part) =>
    part
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "")
      .toUpperCase();
  const svgParts = useMemo(() => {
    const extras = damageSvgIds.filter((id) => !damageParts.includes(id));
    return [...damageParts, ...extras];
  }, [damageParts, damageSvgIds]);
  const partesOptions = useMemo(() => {
    if (partesAuto.length) {
      return partesAuto.map((item) => formatPartLabel(item.nb_parte));
    }
    return svgParts.map((item) => formatPartLabel(item));
  }, [partesAuto, svgParts]);

  const addFiles = (setter) => (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setter((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removeCurrentFile = (setter, indexSetter, currentIndex) => {
    setter((prev) => prev.filter((_, idx) => idx !== currentIndex));
    indexSetter((prev) => (prev > 0 ? prev - 1 : 0));
  };

  const payload = useMemo(
    () => ({
      folio_recep: form.folio_recep,
      fecha_recep: new Date(form.fecha_recep).toISOString(),
      nb_cliente: form.nb_cliente,
      tel_cliente: form.telefono || null,
      email_cliente: form.email || null,
      vehiculo_marca: form.vehiculo_marca || null,
      vehiculo_modelo: form.vehiculo_modelo || null,
      vehiculo_anio: form.vehiculo_anio ? Number(form.vehiculo_anio) : null,
      vehiculo_color: form.vehiculo_color || null,
      vehiculo_tipo: form.vehiculo_tipo || null,
      kilometraje: form.kilometraje ? Number(form.kilometraje) : null,
      placas: form.placas || null,
      seguro: form.seguro || null,
      nivel_gas: fuelLevels[fuelLevelIndex],
      estado_mecanico: form.estado_mecanico || null,
      observaciones: form.observaciones || null,
      partes_siniestro: damagePartsSiniestro,
      partes_preexistentes: damagePartsPreexist,
      observaciones_siniestro: damageObsSiniestro || null,
      observaciones_preexistentes: damageObsPreexist || null,
      fecha_entregaestim: form.fecha_entregaestim
        ? new Date(form.fecha_entregaestim).toISOString()
        : null,
      estatus: form.estatus || "Recepcionado"
    }),
    [
      form,
      fuelLevelIndex,
      damagePartsSiniestro,
      damagePartsPreexist,
      damageObsSiniestro,
      damageObsPreexist
    ]
  );

  const lookupCliente = async (tel) => {
    if (!tel) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clientes/by-telefono?tel=${tel}`);
      if (!response.ok) return;
      const cliente = await response.json();
      if (cliente) {
        setForm((prev) => ({
          ...prev,
          nb_cliente: prev.nb_cliente || cliente.nb_cliente || "",
          email: prev.email || cliente.email_cliente || ""
        }));
      }
    } catch {
      // ignore lookup failures
    }
  };

  useEffect(() => {
    if (!reporteSiniestro) return;
    const loadExpediente = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(reporteSiniestro)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        setExpedienteFiles(data?.archivos || []);
      } catch {
        // ignore
      }
    };
    loadExpediente();
  }, [reporteSiniestro]);

  useEffect(() => {
    if (!isEditMode || !editId) return;
    const loadRegistro = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/recepcion/registros/${editId}`);
        if (!response.ok) {
          throw new Error("No se pudo cargar la recepción para edición");
        }
        const data = await response.json();
        setForm((prev) => ({
          ...prev,
          folio_recep: data.folio_recep ?? "",
          fecha_recep: data.fecha_recep ? new Date(data.fecha_recep).toISOString().slice(0, 16) : prev.fecha_recep,
          nb_cliente: data.nb_cliente ?? "",
          telefono: data.tel_cliente ?? "",
          seguro: data.seguro ?? "Particular (Sin Seguro)",
          email: data.email_cliente ?? "",
          vehiculo_marca: data.vehiculo_marca ?? "",
          vehiculo_modelo: data.vehiculo_modelo ?? "",
          vehiculo_anio: data.vehiculo_anio ? String(data.vehiculo_anio) : "",
          vehiculo_tipo: data.vehiculo_tipo ?? "",
          vehiculo_color: data.vehiculo_color ?? "",
          placas: data.placas ?? "",
          kilometraje: data.kilometraje ? String(data.kilometraje) : "",
          fecha_entregaestim: data.fecha_entregaestim
            ? new Date(data.fecha_entregaestim).toISOString().slice(0, 10)
            : "",
          estatus: data.estatus ?? "Recepcionado",
          estado_mecanico: data.estado_mecanico ?? "",
          observaciones: data.observaciones ?? ""
        }));
        setDamagePartsSiniestro(data.partes_siniestro || []);
        setDamagePartsPreexist(data.partes_preexistentes || []);
        setDamageObsSiniestro(data.observaciones_siniestro || "");
        setDamageObsPreexist(data.observaciones_preexistentes || "");
        const levelIdx = fuelLevels.findIndex((level) => level === data.nivel_gas);
        setFuelLevelIndex(levelIdx >= 0 ? levelIdx : 2);

        const mediaResponse = await fetch(
          `${import.meta.env.VITE_API_URL}/recepcion/registros/${editId}/media`
        );
        if (mediaResponse.ok) {
          const media = await mediaResponse.json();
          const asUrl = (filePath) =>
            filePath?.startsWith("http")
              ? filePath
              : `${import.meta.env.VITE_API_URL}${filePath || ""}`;

          const toPreview = (item) => ({
            id: item.id,
            name: item.original_name || "archivo",
            url: asUrl(item.file_path),
            source: "existing"
          });

          const videos = media.filter((item) => item.media_type === "video");
          setExistingVideoUrl(videos[0]?.file_path ? asUrl(videos[0].file_path) : "");
          const signature = media.find((item) => item.media_type === "signature");
          setSignatureDataUrl(signature?.file_path ? asUrl(signature.file_path) : "");
          setSignatureDirty(false);

          const right = media
            .filter((item) => item.media_type === "photo_damage_right")
            .map(toPreview);
          const left = media
            .filter((item) => item.media_type === "photo_damage_left")
            .map(toPreview);
          const preRight = media
            .filter((item) => item.media_type === "photo_preexist_right")
            .map(toPreview);
          const preLeft = media
            .filter((item) => item.media_type === "photo_preexist_left")
            .map(toPreview);

          setExistingDamageRightPreviews(right);
          setExistingDamageLeftPreviews(left);
          setExistingPreexistRightPreviews(preRight);
          setExistingPreexistLeftPreviews(preLeft);
        }
      } catch (err) {
        setError(err.message || "No se pudo cargar la recepción");
      }
    };
    loadRegistro();
  }, [editId, isEditMode]);

  const handleSubmit = async () => {
    setError("");
    setFieldErrors({});
    const errors = {};
    if (!form.folio_recep.trim()) errors.folio_recep = "Folio requerido";
    if (!form.nb_cliente.trim()) errors.nb_cliente = "Nombre requerido";
    if (!form.vehiculo_marca) errors.marca = "Selecciona una marca";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Folio, nombre del cliente y vehículo son obligatorios.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/recepcion/registros${isEditMode ? `/${editId}` : ""}`,
        {
          method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `No se pudo ${isEditMode ? "actualizar" : "guardar"} el registro`);
      }
      const created = await response.json().catch(() => null);
      const recepcionId = isEditMode ? Number(editId) : created?.id;
      if (recepcionId) {
        const uploads = [];
        const uploadMedia = async (file, mediaType) => {
          const formData = new FormData();
          formData.append("file", file);
          const mediaResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/recepcion/registros/${recepcionId}/media?media_type=${mediaType}`,
            { method: "POST", body: formData }
          );
          if (!mediaResponse.ok) {
            const data = await mediaResponse.json().catch(() => null);
            throw new Error(data?.detail || "No se pudo subir el archivo");
          }
        };

        if (videoFile) uploads.push(uploadMedia(videoFile, "video"));
        damageRightFiles.forEach((file) => uploads.push(uploadMedia(file, "photo_damage_right")));
        damageLeftFiles.forEach((file) => uploads.push(uploadMedia(file, "photo_damage_left")));
        preexistRightFiles.forEach((file) => uploads.push(uploadMedia(file, "photo_preexist_right")));
        preexistLeftFiles.forEach((file) => uploads.push(uploadMedia(file, "photo_preexist_left")));
        if (signatureDataUrl && (!isEditMode || signatureDirty)) {
          const blob = dataUrlToBlob(signatureDataUrl);
          const file = new File([blob], "firma.png", { type: blob.type });
          uploads.push(uploadMedia(file, "signature"));
        }
        if (uploads.length) {
          await Promise.all(uploads);
        }
      }
      const expedienteId = reporteSiniestro || form.folio_recep?.trim();
      if (expedienteId) {
        const expedienteUploads = [];
        const uploadExpediente = async (file, tipo) => {
          const formData = new FormData();
          formData.append("tipo", tipo);
          formData.append("file", file);
          const expedienteResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/expedientes/${encodeURIComponent(expedienteId)}/archivos`,
            { method: "POST", body: formData }
          );
          if (!expedienteResponse.ok) {
            const data = await expedienteResponse.json().catch(() => null);
            throw new Error(data?.detail || "No se pudo subir el archivo al expediente");
          }
        };
        if (videoFile) expedienteUploads.push(uploadExpediente(videoFile, "recepcion_video"));
        damageRightFiles.forEach((file) => expedienteUploads.push(uploadExpediente(file, "recepcion_foto")));
        damageLeftFiles.forEach((file) => expedienteUploads.push(uploadExpediente(file, "recepcion_foto")));
        preexistRightFiles.forEach((file) => expedienteUploads.push(uploadExpediente(file, "recepcion_foto")));
        preexistLeftFiles.forEach((file) => expedienteUploads.push(uploadExpediente(file, "recepcion_foto")));
        if (signatureDataUrl && (!isEditMode || signatureDirty)) {
          const blob = dataUrlToBlob(signatureDataUrl);
          const file = new File([blob], "firma.png", { type: blob.type });
          expedienteUploads.push(uploadExpediente(file, "archivorecepcion_vehiculo"));
        }
        if (expedienteUploads.length) {
          await Promise.all(expedienteUploads);
        }
      }
      navigate("/recepcion");
    } catch (err) {
      setError(err.message || `No se pudo ${isEditMode ? "actualizar" : "guardar"} el registro`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!damageSvgMarkup) return;
    if (!damageModalOpen) return;
    const container = modalSvgRef.current;
    if (!container) return;
    const elements = container.querySelectorAll("[id]");
    elements.forEach((el) => {
      const id = el.getAttribute("id");
      if (!id) return;
      el.style.cursor = "pointer";
    });
  }, [damageSvgMarkup, damageModalOpen]);

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
          setGruposAutos(await gruposRes.json());
        }
        if (marcasRes.ok) {
          setMarcasAutos(await marcasRes.json());
        }
        if (aseguradorasRes.ok) {
          setAseguradoras(await aseguradorasRes.json());
        }
        if (partesRes.ok) {
          setPartesAuto(await partesRes.json());
        }
      } catch {
        // ignore catalog errors
      }
    };

    loadCatalogos();
  }, []);

  useEffect(() => {
    const loadDamageSvg = async () => {
      try {
        const response = await fetch("/assets/Cardialog_svgLaMarina.svg");
        if (!response.ok) return;
        const svgText = await response.text();
        setDamageSvgMarkup(svgText);

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const zone = doc.getElementById("ZONAS");
        const ids = [];
        if (zone) {
          zone.querySelectorAll("[id]").forEach((node) => {
            const id = node.getAttribute("id");
            if (id) ids.push(id);
          });
        } else {
          doc.querySelectorAll("[id]").forEach((node) => {
            const id = node.getAttribute("id");
            if (
              id &&
              !id.toLowerCase().startsWith("svg") &&
              !id.toLowerCase().startsWith("layer") &&
              !id.toLowerCase().startsWith("capa") &&
              id !== "ZONAS"
            ) {
              ids.push(id);
            }
          });
        }
        setDamageSvgIds(Array.from(new Set(ids)));
      } catch {
        // ignore svg load failures
      }
    };

    loadDamageSvg();
  }, []);

  const marcasFiltradas = useMemo(() => {
    if (!grupoSeleccionado) return marcasAutos;
    return marcasAutos.filter((marca) => marca.gpo_marca === grupoSeleccionado);
  }, [marcasAutos, grupoSeleccionado]);

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
      setMarcasAutos((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, vehiculo_marca: created.nb_marca }));
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
      setGruposAutos((prev) => [...prev, created]);
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
      setForm((prev) => ({ ...prev, seguro: created.nb_aseguradora }));
    } catch (err) {
      setError(err.message || "No se pudo crear la aseguradora");
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
      if (data.reporte_siniestro) {
        setReporteSiniestro((prev) => prev || data.reporte_siniestro);
      }
      setForm((prev) => ({
        ...prev,
        nb_cliente: prev.nb_cliente || data.nb_cliente || "",
        telefono: prev.telefono || data.tel_cliente || "",
        email: prev.email || data.email_cliente || "",
        vehiculo_marca: prev.vehiculo_marca || data.vehiculo_marca || "",
        vehiculo_modelo: prev.vehiculo_modelo || data.vehiculo_modelo || "",
        vehiculo_anio: prev.vehiculo_anio || (data.vehiculo_anio ? String(data.vehiculo_anio) : ""),
        vehiculo_tipo: prev.vehiculo_tipo || data.vehiculo_tipo || "",
        vehiculo_color: prev.vehiculo_color || data.vehiculo_color || "",
        kilometraje: prev.kilometraje || (data.kilometraje ? String(data.kilometraje) : ""),
        seguro: prev.seguro || data.seguro || prev.seguro
      }));
      if (data.vehiculo_marca) {
        const selected = marcasAutos.find((marca) => marca.nb_marca === data.vehiculo_marca);
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
    const normalized = normalizePartId(nombre);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/catalogos/partes-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nb_parte: normalized })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo crear la parte");
      }
      const created = await response.json();
      setPartesAuto((prev) => [...prev, created]);
      toggleDamagePart(created.nb_parte);
      setDamageSelectValue("");
    } catch (err) {
      setError(err.message || "No se pudo crear la parte");
    }
  };

  const localPhotoPreviews = useMemo(() => {
    const files = [
      ...damageRightFiles,
      ...damageLeftFiles,
      ...preexistRightFiles,
      ...preexistLeftFiles
    ];
    return files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file)
    }));
  }, [damageRightFiles, damageLeftFiles, preexistRightFiles, preexistLeftFiles]);

  useEffect(() => {
    return () => {
      localPhotoPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [localPhotoPreviews]);

  const expedienteFotos = useMemo(
    () => expedienteFiles.filter((file) => file.tipo === "recepcion_foto"),
    [expedienteFiles]
  );
  const expedienteVideos = useMemo(
    () => expedienteFiles.filter((file) => file.tipo === "recepcion_video"),
    [expedienteFiles]
  );

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [videoFile]);

  const damageRightLocalPreviews = useMemo(
    () =>
      damageRightFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        source: "local"
      })),
    [damageRightFiles]
  );
  const damageLeftLocalPreviews = useMemo(
    () =>
      damageLeftFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        source: "local"
      })),
    [damageLeftFiles]
  );
  const preexistRightLocalPreviews = useMemo(
    () =>
      preexistRightFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        source: "local"
      })),
    [preexistRightFiles]
  );
  const preexistLeftLocalPreviews = useMemo(
    () =>
      preexistLeftFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        source: "local"
      })),
    [preexistLeftFiles]
  );
  const damageRightPreviews = useMemo(
    () => [...existingDamageRightPreviews, ...damageRightLocalPreviews],
    [existingDamageRightPreviews, damageRightLocalPreviews]
  );
  const damageLeftPreviews = useMemo(
    () => [...existingDamageLeftPreviews, ...damageLeftLocalPreviews],
    [existingDamageLeftPreviews, damageLeftLocalPreviews]
  );
  const preexistRightPreviews = useMemo(
    () => [...existingPreexistRightPreviews, ...preexistRightLocalPreviews],
    [existingPreexistRightPreviews, preexistRightLocalPreviews]
  );
  const preexistLeftPreviews = useMemo(
    () => [...existingPreexistLeftPreviews, ...preexistLeftLocalPreviews],
    [existingPreexistLeftPreviews, preexistLeftLocalPreviews]
  );

  useEffect(() => {
    return () => damageRightLocalPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [damageRightLocalPreviews]);
  useEffect(() => {
    return () => damageLeftLocalPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [damageLeftLocalPreviews]);
  useEffect(() => {
    return () => preexistRightLocalPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [preexistRightLocalPreviews]);
  useEffect(() => {
    return () => preexistLeftLocalPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [preexistLeftLocalPreviews]);

  useEffect(() => {
    setDamageRightIndex((prev) => Math.min(prev, Math.max(0, damageRightPreviews.length - 1)));
  }, [damageRightPreviews.length]);
  useEffect(() => {
    setDamageLeftIndex((prev) => Math.min(prev, Math.max(0, damageLeftPreviews.length - 1)));
  }, [damageLeftPreviews.length]);
  useEffect(() => {
    setPreexistRightIndex((prev) =>
      Math.min(prev, Math.max(0, preexistRightPreviews.length - 1))
    );
  }, [preexistRightPreviews.length]);
  useEffect(() => {
    setPreexistLeftIndex((prev) =>
      Math.min(prev, Math.max(0, preexistLeftPreviews.length - 1))
    );
  }, [preexistLeftPreviews.length]);

  const getCanvasPoint = (event) => {
    const canvas = signatureRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startSignature = (event) => {
    event.preventDefault();
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    if (event.pointerId != null) {
      canvas.setPointerCapture(event.pointerId);
    }
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setIsSigning(true);
  };

  const drawSignature = (event) => {
    event.preventDefault();
    if (!isSigning) return;
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const endSignature = () => {
    if (!isSigning) return;
    setIsSigning(false);
    const canvas = signatureRef.current;
    if (!canvas) return;
    setSignatureDirty(true);
    setSignatureDataUrl(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDirty(true);
    setSignatureDataUrl("");
  };

  useEffect(() => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!signatureDataUrl) return;

    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = signatureDataUrl;
  }, [signatureDataUrl]);

  const dataUrlToBlob = (dataUrl) => {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  };

  const activeDamageParts = damageMode === "siniestro" ? damagePartsSiniestro : damagePartsPreexist;

  const toggleDamagePart = (part) => {
    if (damageMode === "siniestro") {
      setDamagePartsSiniestro((prev) =>
        prev.includes(part) ? prev.filter((item) => item !== part) : [...prev, part]
      );
      return;
    }
    setDamagePartsPreexist((prev) =>
      prev.includes(part) ? prev.filter((item) => item !== part) : [...prev, part]
    );
  };

  const applySvgSelection = (containerRef, selected, mode) => {
    const container = containerRef.current;
    if (!container) return;
    const fillColor = mode === "siniestro" ? "#e04b4b" : "#f2a300";
    const zoneGroup = container.querySelector("#ZONAS");
    const elements = zoneGroup ? zoneGroup.querySelectorAll("[id]") : container.querySelectorAll("[id]");
    elements.forEach((el) => {
      const id = el.getAttribute("id");
      if (!id) return;
      el.style.cursor = "pointer";
      if (selected.includes(id)) {
        el.style.fill = fillColor;
        el.style.fillOpacity = "1";
      } else {
        el.style.fill = "transparent";
        el.style.fillOpacity = "0";
      }
    });
  };

  useEffect(() => {
    if (!damageSvgMarkup) return;
    applySvgSelection(siniestroSvgRef, damagePartsSiniestro, "siniestro");
    applySvgSelection(preexistSvgRef, damagePartsPreexist, "preexistente");
  }, [damageSvgMarkup, damagePartsSiniestro, damagePartsPreexist]);

  useEffect(() => {
    if (!damageSvgMarkup || !damageModalOpen) return;
    applySvgSelection(
      modalSvgRef,
      damageMode === "siniestro" ? damagePartsSiniestro : damagePartsPreexist,
      damageMode
    );
  }, [damageSvgMarkup, damageModalOpen, damageMode, damagePartsSiniestro, damagePartsPreexist]);
  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <AppHeader
            title="Registro de Recepción de Vehículo"
            showSearch={false}
            actions={
              <>
                <Link className="text-slate-400 hover:text-white transition-colors" to="/recepcion">
                  <span className="material-symbols-outlined">arrow_back</span>
                </Link>
                <button
                  className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                >
                  Cancelar
                </button>
                <button
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-primary/10"
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {saving ? "Guardando..." : "Guardar e Iniciar OT"}
                </button>
              </>
            }
          />
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {error ? (
              <div className="fixed right-6 top-20 z-50 rounded-lg border border-alert-red/40 bg-alert-red/10 px-4 py-3 text-sm text-alert-red shadow-lg">
                {error}
              </div>
            ) : null}
            <form className="max-w-7xl mx-auto grid grid-cols-12 gap-8 pb-12">
              <div className="col-span-12 lg:col-span-5 space-y-8">
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">person</span>
                    Información del Cliente
                  </h3>
                  <div className="grid grid-cols-1 gap-4 bg-surface-dark p-6 rounded-xl border border-border-dark">
                    {error ? <p className="text-sm text-alert-red">{error}</p> : null}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Folio</label>
                      <input
                          className={`w-full bg-background-dark rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary ${
                            fieldErrors.folio_recep ? "border border-alert-red" : "border border-border-dark"
                          }`}
                          placeholder="Ej. 4405"
                          type="text"
                          value={form.folio_recep}
                          onChange={(event) => setForm({ ...form, folio_recep: event.target.value })}
                        />
                        {fieldErrors.folio_recep ? (
                          <p className="text-[10px] text-alert-red">{fieldErrors.folio_recep}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha/Hora</label>
                        <input
                          className="w-full bg-background-dark border-border-dark rounded-lg px-4 py-2.5 text-sm text-white"
                          type="datetime-local"
                          value={form.fecha_recep}
                          onChange={(event) => setForm({ ...form, fecha_recep: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre Completo</label>
                      <input
                        className={`w-full bg-background-dark rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary ${
                          fieldErrors.nb_cliente ? "border border-alert-red" : "border border-border-dark"
                        }`}
                        placeholder="Ej. Juan Pérez"
                        type="text"
                        value={form.nb_cliente}
                        onChange={(event) => setForm({ ...form, nb_cliente: event.target.value })}
                      />
                      {fieldErrors.nb_cliente ? (
                        <p className="text-[10px] text-alert-red">{fieldErrors.nb_cliente}</p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</label>
                        <input
                          className="w-full bg-background-dark border-border-dark rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary"
                          placeholder="669-000-0000"
                          type="tel"
                          value={form.telefono}
                          onChange={(event) => setForm({ ...form, telefono: event.target.value })}
                          onBlur={(event) => lookupCliente(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Aseguradora</label>
                      <SearchableSelect
                        value={form.seguro}
                        onChange={(value) => setForm((prev) => ({ ...prev, seguro: value }))}
                        options={["Particular (Sin Seguro)", ...aseguradoras.map((item) => item.nb_aseguradora)]}
                        placeholder="Selecciona aseguradora"
                        onAdd={handleCreateAseguradora}
                        addLabel="Agregar aseguradora"
                      />
                    </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Correo Electrónico</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary"
                        placeholder="cliente@correo.com"
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                      />
                    </div>
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">directions_car</span>
                    Detalles del Vehículo
                  </h3>
                  <div className="bg-surface-dark p-6 rounded-xl border border-border-dark grid grid-cols-2 gap-4">
                    <SearchableSelect
                      label="Grupo"
                      value={grupoSeleccionado}
                      onChange={(value) => {
                        setGrupoSeleccionado(value);
                        setForm((prev) => ({ ...prev, vehiculo_marca: "" }));
                      }}
                      options={gruposAutos.map((grupo) => grupo.nb_grupo)}
                      placeholder="Selecciona grupo"
                      onAdd={handleCreateGrupo}
                      addLabel="Agregar grupo"
                    />
                    <SearchableSelect
                      label="Marca"
                      value={form.vehiculo_marca}
                      onChange={(value) => {
                        setForm((prev) => ({ ...prev, vehiculo_marca: value }));
                        const selected = marcasAutos.find((marca) => marca.nb_marca === value);
                        if (selected?.gpo_marca) {
                          setGrupoSeleccionado(selected.gpo_marca);
                        }
                      }}
                      options={marcasAutos.map((marca) => marca.nb_marca)}
                      placeholder="Selecciona marca"
                      error={fieldErrors.marca || marcaError}
                      onAdd={handleCreateMarca}
                      addLabel="Agregar marca"
                    />
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="Hilux 2023"
                        type="text"
                        value={form.vehiculo_modelo}
                        onChange={(event) => setForm({ ...form, vehiculo_modelo: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo / Carrocería</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="Pick-up"
                        type="text"
                        value={form.vehiculo_tipo}
                        onChange={(event) => setForm({ ...form, vehiculo_tipo: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="Blanco Perlado"
                        type="text"
                        value={form.vehiculo_color}
                        onChange={(event) => setForm({ ...form, vehiculo_color: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Placas</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white uppercase"
                        placeholder="VSR-23-45"
                        type="text"
                        value={form.placas}
                        onChange={(event) => setForm({ ...form, placas: event.target.value.toUpperCase() })}
                        onBlur={(event) => lookupPlacas(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Kilometraje</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="45000"
                        type="number"
                        value={form.kilometraje}
                        onChange={(event) => setForm({ ...form, kilometraje: event.target.value })}
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">
                          Nivel de Combustible
                        </label>
                        <span className="text-xs font-bold text-white bg-primary/20 px-2 py-0.5 rounded">
                          {fuelLevels[fuelLevelIndex]}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-500">E</span>
                        <input
                          className="w-full h-2 bg-background-dark rounded-lg appearance-none cursor-pointer accent-primary"
                          max="4"
                          min="0"
                          step="1"
                          type="range"
                          value={fuelLevelIndex}
                          onChange={(event) => setFuelLevelIndex(Number(event.target.value))}
                        />
                        <span className="text-xs font-bold text-slate-500">F</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Entrega Estimada</label>
                      <input
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        type="date"
                        value={form.fecha_entregaestim}
                        onChange={(event) => setForm({ ...form, fecha_entregaestim: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Estatus</label>
                      <select
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                        value={form.estatus}
                        onChange={(event) => setForm({ ...form, estatus: event.target.value })}
                      >
                        <option>Recepcionado</option>
                        <option>En Valuacion</option>
                        <option>Pendiente Autorizacion</option>
                        <option>En Taller</option>
                      </select>
                    </div>
                  </div>
                </section>
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">video_library</span>
                    Evidencia de Inventario
                  </h3>
                  <div className="bg-surface-dark p-6 rounded-xl border border-border-dark space-y-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">
                      Video de Recepción (360° Exterior e Interior)
                    </label>
                    <div className="relative group">
                      {videoPreviewUrl || existingVideoUrl || expedienteVideos.length ? (
                        <div className="w-full aspect-video bg-background-dark rounded-lg border border-border-dark overflow-hidden relative">
                          <video
                            className="w-full h-full object-cover"
                            controls
                            src={
                              videoPreviewUrl ||
                              existingVideoUrl ||
                              `${import.meta.env.VITE_API_URL}${
                                expedienteVideos[0]?.archivo_path || expedienteVideos[0]?.path || ""
                              }`
                            }
                          />
                          <div className="absolute top-3 right-3">
                            <label className="bg-primary/90 hover:bg-primary text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 shadow-xl cursor-pointer">
                              <span className="material-symbols-outlined text-base">cloud_upload</span>
                              Cambiar video
                              <input
                                className="hidden"
                                type="file"
                                accept="video/*"
                                onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-full aspect-video bg-background-dark rounded-lg border border-border-dark flex flex-col items-center justify-center overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            <span className="material-symbols-outlined text-5xl text-slate-600 mb-2">
                              videocam
                            </span>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                              Sin video cargado
                            </p>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                            <label className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xl cursor-pointer">
                              <span className="material-symbols-outlined text-base">cloud_upload</span>
                              Cargar Video
                              <input
                                className="hidden"
                                type="file"
                                accept="video/*"
                                onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                              />
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                    {videoFile ? (
                      <p className="text-[10px] text-slate-400">Archivo: {videoFile.name}</p>
                    ) : null}
                    <div className="flex items-center gap-3 p-3 bg-background-dark/30 rounded-lg border border-border-dark/50">
                      <span className="material-symbols-outlined text-primary text-xl">info</span>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Se recomienda grabar el estado exterior, interior, arranque y tablero del auto encendido.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Fotos de recepción
                      </span>
                      {(localPhotoPreviews.length || expedienteFotos.length) ? (
                        <div className="grid grid-cols-4 gap-2">
                          {localPhotoPreviews.map((item) => (
                            <div
                              key={item.url}
                              className="aspect-square rounded bg-background-dark border border-border-dark bg-cover bg-center"
                              style={{ backgroundImage: `url(${item.url})` }}
                              title={item.name}
                            />
                          ))}
                          {localPhotoPreviews.length === 0 &&
                            expedienteFotos.slice(0, 8).map((item) => (
                              <div
                                key={item.archivo_path || item.path}
                                className="aspect-square rounded bg-background-dark border border-border-dark bg-cover bg-center"
                                style={{
                                  backgroundImage: item.archivo_path || item.path
                                    ? `url(${import.meta.env.VITE_API_URL}${
                                        item.archivo_path || item.path
                                      })`
                                    : undefined
                                }}
                                title={item.archivo_nombre || "Foto"}
                              />
                            ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500">Sin fotos cargadas.</p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
              <div className="col-span-12 lg:col-span-7 space-y-8 flex flex-col">
                <section className="space-y-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">edit_square</span>
                      Inspección de Daños
                    </h3>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-alert-amber"></div>
                        <span className="text-[10px] font-bold text-slate-400">Pre-existente</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full bg-alert-red"></div>
                        <span className="text-[10px] font-bold text-slate-400">Siniestro</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-surface-dark border border-border-dark rounded-xl p-8 space-y-8 flex-1">
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                        <span className="size-2 rounded-full bg-alert-red"></span>
                        Daños del siniestro
                      </div>
                      <div className="space-y-5">
                        <div className="relative bg-background-dark border border-border-dark rounded-xl p-4">
                          <button
                            className="group w-full text-left"
                            type="button"
                            onClick={() => {
                              setDamageMode("siniestro");
                              setDamageModalOpen(true);
                            }}
                          >
                            <div className="relative overflow-hidden rounded-lg border border-border-dark bg-white">
                              <div
                                ref={siniestroSvgRef}
                                className="w-full"
                                dangerouslySetInnerHTML={{ __html: damageSvgMarkup }}
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                              <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-alert-red/80 px-3 py-1 text-[10px] font-bold uppercase text-white shadow">
                                Seleccionar daños
                              </div>
                            </div>
                          </button>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {damagePartsSiniestro.length ? (
                              damagePartsSiniestro.map((part) => (
                                <span
                                  key={part}
                                  className="rounded-full border border-alert-red/40 bg-alert-red/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-red"
                                >
                                  {formatPartLabel(part)}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase text-center">Lado Derecho</p>
                            <div className="relative">
                              <div className="relative h-40 overflow-hidden rounded-lg border border-border-dark bg-background-dark flex items-center justify-center">
                                {damageRightPreviews.length ? (
                                  <img
                                    className="h-full w-full object-cover"
                                    src={damageRightPreviews[damageRightIndex]?.url}
                                    alt="Lado derecho"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-500 uppercase">Sin fotos</span>
                                )}
                                {damageRightPreviews.length > 1 ? (
                                  <>
                                    <button
                                      className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setDamageRightIndex((prev) =>
                                          prev === 0 ? damageRightPreviews.length - 1 : prev - 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                    <button
                                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setDamageRightIndex((prev) =>
                                          prev === damageRightPreviews.length - 1 ? 0 : prev + 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                                    </button>
                                  </>
                                ) : null}
                                {damageRightPreviews.length &&
                                damageRightPreviews[damageRightIndex]?.source === "local" ? (
                                  <button
                                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center size-8 rounded-full bg-alert-red/25 text-alert-red hover:bg-alert-red/35 border border-alert-red/50 shadow-lg transition-colors"
                                    type="button"
                                    title="Eliminar foto actual"
                                    onClick={() =>
                                      removeCurrentFile(
                                        setDamageRightFiles,
                                        setDamageRightIndex,
                                        damageRightIndex - existingDamageRightPreviews.length
                                      )
                                    }
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                ) : null}
                              </div>
                              <label className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-background-dark hover:bg-background-dark/80 text-slate-300 border border-border-dark rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-sm">add_a_photo</span>
                                Subir Foto Lado Derecho
                                <input
                                  className="hidden"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={addFiles(setDamageRightFiles)}
                                />
                              </label>
                              {damageRightPreviews.length ? (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {damageRightIndex + 1}/{damageRightPreviews.length} · {damageRightPreviews[damageRightIndex]?.name}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase text-center">Lado Izquierdo</p>
                            <div className="relative">
                              <div className="relative h-40 overflow-hidden rounded-lg border border-border-dark bg-background-dark flex items-center justify-center">
                                {damageLeftPreviews.length ? (
                                  <img
                                    className="h-full w-full object-cover"
                                    src={damageLeftPreviews[damageLeftIndex]?.url}
                                    alt="Lado izquierdo"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-500 uppercase">Sin fotos</span>
                                )}
                                {damageLeftPreviews.length > 1 ? (
                                  <>
                                    <button
                                      className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setDamageLeftIndex((prev) =>
                                          prev === 0 ? damageLeftPreviews.length - 1 : prev - 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                    <button
                                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setDamageLeftIndex((prev) =>
                                          prev === damageLeftPreviews.length - 1 ? 0 : prev + 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                                    </button>
                                  </>
                                ) : null}
                                {damageLeftPreviews.length &&
                                damageLeftPreviews[damageLeftIndex]?.source === "local" ? (
                                  <button
                                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center size-8 rounded-full bg-alert-red/25 text-alert-red hover:bg-alert-red/35 border border-alert-red/50 shadow-lg transition-colors"
                                    type="button"
                                    title="Eliminar foto actual"
                                    onClick={() =>
                                      removeCurrentFile(
                                        setDamageLeftFiles,
                                        setDamageLeftIndex,
                                        damageLeftIndex - existingDamageLeftPreviews.length
                                      )
                                    }
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                ) : null}
                              </div>
                              <label className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-background-dark hover:bg-background-dark/80 text-slate-300 border border-border-dark rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-sm">add_a_photo</span>
                                Subir Foto Lado Izquierdo
                                <input
                                  className="hidden"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={addFiles(setDamageLeftFiles)}
                                />
                              </label>
                              {damageLeftPreviews.length ? (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {damageLeftIndex + 1}/{damageLeftPreviews.length} · {damageLeftPreviews[damageLeftIndex]?.name}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 pt-4 border-t border-border-dark/50">
                        <span className="size-2 rounded-full bg-alert-amber"></span>
                        Daños preexistentes
                      </div>
                      <div className="space-y-5">
                        <div className="relative bg-background-dark border border-border-dark rounded-xl p-4">
                          <button
                            className="group w-full text-left"
                            type="button"
                            onClick={() => {
                              setDamageMode("preexistente");
                              setDamageModalOpen(true);
                            }}
                          >
                            <div className="relative overflow-hidden rounded-lg border border-border-dark bg-white">
                              <div
                                ref={preexistSvgRef}
                                className="w-full"
                                dangerouslySetInnerHTML={{ __html: damageSvgMarkup }}
                              />
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                              <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-alert-amber/80 px-3 py-1 text-[10px] font-bold uppercase text-white shadow">
                                Seleccionar daños
                              </div>
                            </div>
                          </button>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {damagePartsPreexist.length ? (
                              damagePartsPreexist.map((part) => (
                                <span
                                  key={part}
                                  className="rounded-full border border-alert-amber/40 bg-alert-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase text-alert-amber"
                                >
                                  {formatPartLabel(part)}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase text-center">Lado Derecho</p>
                            <div className="relative">
                              <div className="relative h-40 overflow-hidden rounded-lg border border-border-dark bg-background-dark flex items-center justify-center">
                                {preexistRightPreviews.length ? (
                                  <img
                                    className="h-full w-full object-cover"
                                    src={preexistRightPreviews[preexistRightIndex]?.url}
                                    alt="Preexistente lado derecho"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-500 uppercase">Sin fotos</span>
                                )}
                                {preexistRightPreviews.length > 1 ? (
                                  <>
                                    <button
                                      className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setPreexistRightIndex((prev) =>
                                          prev === 0 ? preexistRightPreviews.length - 1 : prev - 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                    <button
                                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setPreexistRightIndex((prev) =>
                                          prev === preexistRightPreviews.length - 1 ? 0 : prev + 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                                    </button>
                                  </>
                                ) : null}
                                {preexistRightPreviews.length &&
                                preexistRightPreviews[preexistRightIndex]?.source === "local" ? (
                                  <button
                                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center size-8 rounded-full bg-alert-red/25 text-alert-red hover:bg-alert-red/35 border border-alert-red/50 shadow-lg transition-colors"
                                    type="button"
                                    title="Eliminar foto actual"
                                    onClick={() =>
                                      removeCurrentFile(
                                        setPreexistRightFiles,
                                        setPreexistRightIndex,
                                        preexistRightIndex - existingPreexistRightPreviews.length
                                      )
                                    }
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                ) : null}
                              </div>
                              <label className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-background-dark hover:bg-background-dark/80 text-slate-300 border border-border-dark rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-sm">add_a_photo</span>
                                Subir Foto Lado Derecho
                                <input
                                  className="hidden"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={addFiles(setPreexistRightFiles)}
                                />
                              </label>
                              {preexistRightPreviews.length ? (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {preexistRightIndex + 1}/{preexistRightPreviews.length} · {preexistRightPreviews[preexistRightIndex]?.name}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase text-center">Lado Izquierdo</p>
                            <div className="relative">
                              <div className="relative h-40 overflow-hidden rounded-lg border border-border-dark bg-background-dark flex items-center justify-center">
                                {preexistLeftPreviews.length ? (
                                  <img
                                    className="h-full w-full object-cover"
                                    src={preexistLeftPreviews[preexistLeftIndex]?.url}
                                    alt="Preexistente lado izquierdo"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-500 uppercase">Sin fotos</span>
                                )}
                                {preexistLeftPreviews.length > 1 ? (
                                  <>
                                    <button
                                      className="absolute left-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setPreexistLeftIndex((prev) =>
                                          prev === 0 ? preexistLeftPreviews.length - 1 : prev - 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                    <button
                                      className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                                      type="button"
                                      onClick={() =>
                                        setPreexistLeftIndex((prev) =>
                                          prev === preexistLeftPreviews.length - 1 ? 0 : prev + 1
                                        )
                                      }
                                    >
                                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                                    </button>
                                  </>
                                ) : null}
                                {preexistLeftPreviews.length &&
                                preexistLeftPreviews[preexistLeftIndex]?.source === "local" ? (
                                  <button
                                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center justify-center size-8 rounded-full bg-alert-red/25 text-alert-red hover:bg-alert-red/35 border border-alert-red/50 shadow-lg transition-colors"
                                    type="button"
                                    title="Eliminar foto actual"
                                    onClick={() =>
                                      removeCurrentFile(
                                        setPreexistLeftFiles,
                                        setPreexistLeftIndex,
                                        preexistLeftIndex - existingPreexistLeftPreviews.length
                                      )
                                    }
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                ) : null}
                              </div>
                              <label className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-background-dark hover:bg-background-dark/80 text-slate-300 border border-border-dark rounded-lg text-[11px] font-bold uppercase transition-colors cursor-pointer">
                                <span className="material-symbols-outlined text-sm">add_a_photo</span>
                                Subir Foto Lado Izquierdo
                                <input
                                  className="hidden"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={addFiles(setPreexistLeftFiles)}
                                />
                              </label>
                              {preexistLeftPreviews.length ? (
                                <p className="text-[10px] text-slate-400 mt-1">
                                  {preexistLeftIndex + 1}/{preexistLeftPreviews.length} · {preexistLeftPreviews[preexistLeftIndex]?.name}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-border-dark/50">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Estado Mecánico e Interiores</label>
                      <textarea
                        className="w-full bg-background-dark border-border-dark rounded-lg px-3 py-2 text-xs text-white h-16"
                        placeholder="Daños mecánicos o tapicería..."
                        value={form.estado_mecanico}
                        onChange={(event) => setForm({ ...form, estado_mecanico: event.target.value })}
                      ></textarea>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Observaciones Adicionales</label>
                      <textarea
                        className="w-full bg-background-dark border-border-dark rounded-lg px-4 py-2 text-sm text-white h-20"
                        placeholder="Ej. El vehículo ingresa con objetos de valor en guantera..."
                        value={form.observaciones}
                        onChange={(event) => setForm({ ...form, observaciones: event.target.value })}
                      ></textarea>
                    </div>
                  </div>
                </section>
              </div>
              <div className="col-span-12 space-y-4">
                <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">history_edu</span>
                  Formalización
                </h3>
                <div className="bg-surface-dark border border-border-dark rounded-xl p-6 space-y-6">
                  <div className="p-4 bg-background-dark/50 rounded-lg border border-border-dark border-dashed">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <strong>AVISO LEGAL:</strong> El taller no se hace responsable por objetos de valor olvidados en el interior del vehículo. Al firmar, el cliente acepta el inventario de daños aquí descrito y autoriza el inicio de los trabajos de diagnóstico y reparación correspondientes.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase text-center block">Firma del Cliente</label>
                      <div className="h-32 bg-background-dark border border-border-dark rounded-lg signature-pad relative overflow-hidden">
                        <canvas
                          ref={signatureRef}
                          width={480}
                          height={128}
                          className="w-full h-full touch-none select-none"
                          onPointerDown={startSignature}
                          onPointerMove={drawSignature}
                          onPointerUp={endSignature}
                          onPointerLeave={endSignature}
                        />
                        {!signatureDataUrl ? (
                          <div className="absolute inset-0 flex items-center justify-center text-[14px] text-slate-500 pointer-events-none">
                            Ingrese su firma aquí
                          </div>
                        ) : null}
                        <div className="absolute bottom-4 left-0 right-0 border-t border-slate-700 mx-8"></div>
                      </div>
                      <button
                        className="text-[10px] text-slate-500 font-bold uppercase hover:text-primary transition-colors block mx-auto"
                        type="button"
                        onClick={clearSignature}
                      >
                        Limpiar Firma
                      </button>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase text-center block">Sello / Firma Recepción</label>
                      <div className="h-32 bg-background-dark border border-border-dark rounded-lg flex items-center justify-center">
                        <div className="text-center opacity-30">
                          <span className="material-symbols-outlined text-3xl">verified_user</span>
                          <p className="text-[14px] font-bold uppercase mt-1">{displayUserName}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </main>
      </div>
      {damageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-dark bg-surface-dark shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-dark px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">Seleccionar daños</h3>
                <p className="text-xs text-slate-400">
                  {damageMode === "siniestro" ? "Daños del siniestro" : "Daños preexistentes"}
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-white transition-colors"
                onClick={() => setDamageModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-6 space-y-6">
              <div
                ref={modalSvgRef}
                className="w-full rounded-xl border border-border-dark bg-white p-4"
                onClick={(event) => {
                  const target = event.target;
                  const element = target?.closest?.("#ZONAS [id]");
                  const id = element?.getAttribute?.("id");
                  if (id && (damageSvgIds.length === 0 || damageSvgIds.includes(id))) {
                    toggleDamagePart(id);
                  }
                }}
                dangerouslySetInnerHTML={{ __html: damageSvgMarkup }}
              />
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-500">
                  <span>Partes</span>
                  <span>{activeDamageParts.length} seleccionadas</span>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border-dark bg-background-dark/40 p-3">
                  <div className="flex flex-wrap gap-2">
                    {activeDamageParts.length ? (
                      activeDamageParts.map((part) => (
                        <span
                          key={part}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            damageMode === "siniestro"
                              ? "border-alert-red/40 bg-alert-red/15 text-alert-red"
                              : "border-alert-amber/40 bg-alert-amber/15 text-alert-amber"
                          }`}
                        >
                          {formatPartLabel(part)}
                          <button
                            type="button"
                            className="ml-1 text-xs text-current hover:opacity-80"
                            onClick={() => toggleDamagePart(part)}
                            aria-label={`Quitar ${formatPartLabel(part)}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500">Sin partes seleccionadas</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-border-dark bg-background-dark/60 p-2 text-slate-400 hover:text-white transition-colors"
                    title="Limpiar selección"
                    onClick={() => {
                      if (damageMode === "siniestro") {
                        setDamagePartsSiniestro([]);
                      } else {
                        setDamagePartsPreexist([]);
                      }
                    }}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                    <span className="sr-only">Limpiar selección</span>
                  </button>
                </div>
                <SearchableSelect
                  label="Buscar parte"
                  value={damageSelectValue}
                  onChange={(value) => {
                    setDamageSelectValue("");
                    toggleDamagePart(normalizePartId(value));
                  }}
                  options={partesOptions}
                  placeholder="Buscar parte..."
                  onAdd={handleCreateParte}
                  addLabel="Agregar parte"
                />
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {damageMode === "siniestro"
                      ? "Observaciones de Daños del Siniestro"
                      : "Observaciones de Daños Preexistentes"}
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-border-dark bg-background-dark px-3 py-2 text-sm text-white"
                    rows={3}
                    placeholder="Escribe observaciones..."
                    value={damageMode === "siniestro" ? damageObsSiniestro : damageObsPreexist}
                    onChange={(event) =>
                      damageMode === "siniestro"
                        ? setDamageObsSiniestro(event.target.value)
                        : setDamageObsPreexist(event.target.value)
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border-dark px-6 py-4">
              <button
                type="button"
                className="rounded-lg border border-border-dark px-4 py-2 text-sm text-slate-300"
                onClick={() => setDamageModalOpen(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"
                onClick={() => setDamageModalOpen(false)}
              >
                Guardar selección
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
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
                  setForm({
                    folio_recep: "",
                    fecha_recep: new Date().toISOString().slice(0, 16),
                    nb_cliente: "",
                    telefono: "",
                    seguro: "Particular (Sin Seguro)",
                    email: "",
                    vehiculo_marca: "",
                    vehiculo_modelo: "",
                    vehiculo_anio: "",
                    vehiculo_tipo: "",
                    vehiculo_color: "",
                    placas: "",
                    kilometraje: "",
                    fecha_entregaestim: "",
                    estatus: "Recepcionado",
                    estado_mecanico: "",
                    observaciones: ""
                  });
                  setGrupoSeleccionado("");
                  setFieldErrors({});
                  setMarcaError("");
                  setFuelLevelIndex(2);
                  clearSignature();
                  setDamagePartsSiniestro([]);
                  setDamagePartsPreexist([]);
                  setDamageSelectValue("");
                  setDamageObsSiniestro("");
                  setDamageObsPreexist("");
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
