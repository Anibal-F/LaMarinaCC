import { useState } from "react";

export default function RPAExecutor() {
  const [loadingQualitas, setLoadingQualitas] = useState(false);
  const [loadingChubb, setLoadingChubb] = useState(false);
  const [status, setStatus] = useState(null);

  const runRPA = async (seguro) => {
    const setLoading = seguro === "QUALITAS" ? setLoadingQualitas : setLoadingChubb;
    setLoading(true);
    setStatus({ type: "info", message: `Iniciando RPA de ${seguro}...` });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/admin/rpa/${seguro.toLowerCase()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "login",
            headless: false, // Mostrar navegador para que vea el proceso
            save_session: true
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Error al iniciar RPA de ${seguro}`);
      }

      const data = await response.json();
      setStatus({ 
        type: "success", 
        message: `RPA de ${seguro} iniciado. Job ID: ${data.job_id}`
      });

      // Opcional: consultar estado cada cierto tiempo
      checkJobStatus(data.job_id, seguro);

    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const checkJobStatus = async (jobId, seguro) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/admin/rpa/status/${jobId}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === "completed") {
          setStatus({ 
            type: "success", 
            message: `✓ RPA de ${seguro} completado exitosamente!` 
          });
        } else if (data.status === "failed") {
          setStatus({ 
            type: "error", 
            message: `✗ RPA de ${seguro} falló: ${data.error || "Error desconocido"}` 
          });
        } else {
          // Seguir esperando
          setTimeout(() => checkJobStatus(jobId, seguro), 5000);
          setStatus({ 
            type: "info", 
            message: `⏳ RPA de ${seguro} en ejecución... (${data.status})` 
          });
        }
      }
    } catch (err) {
      console.error("Error consultando estado:", err);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Botón Qualitas */}
      <button
        type="button"
        onClick={() => runRPA("QUALITAS")}
        disabled={loadingQualitas || loadingChubb}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          loadingQualitas
            ? "bg-slate-700 text-slate-400 cursor-wait"
            : "bg-blue-600 hover:bg-blue-500 text-white"
        }`}
        title="Ejecutar RPA de Qualitas"
      >
        {loadingQualitas ? (
          <>
            <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
            <span>Qualitas...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-sm">smart_toy</span>
            <span>Qualitas</span>
          </>
        )}
      </button>

      {/* Botón CHUBB */}
      <button
        type="button"
        onClick={() => runRPA("CHUBB")}
        disabled={loadingQualitas || loadingChubb}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
          loadingChubb
            ? "bg-slate-700 text-slate-400 cursor-wait"
            : "bg-purple-600 hover:bg-purple-500 text-white"
        }`}
        title="Ejecutar RPA de CHUBB"
      >
        {loadingChubb ? (
          <>
            <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
            <span>CHUBB...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-sm">smart_toy</span>
            <span>CHUBB</span>
          </>
        )}
      </button>

      {/* Mensaje de estado */}
      {status && (
        <div 
          className={`ml-2 text-xs px-2 py-1 rounded ${
            status.type === "error" 
              ? "bg-red-500/20 text-red-400" 
              : status.type === "success"
              ? "bg-green-500/20 text-green-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
