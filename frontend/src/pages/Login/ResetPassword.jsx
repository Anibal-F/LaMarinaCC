const heroImageUrl = "/assets/BG_LoginLaMarina.png";

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { isAuthenticated } from "../../utils/auth.js";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Si ya está autenticado, redirigir al home
    if (isAuthenticated()) {
      navigate("/", { replace: true });
      return;
    }
    
    // Si no hay token, mostrar error
    if (!token) {
      setError("Link inválido o expirado. Solicita uno nuevo.");
    }
  }, [navigate, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    // Validaciones
    if (!newPassword || !confirmPassword) {
      setError("Ingresa y confirma tu nueva contraseña");
      return;
    }
    
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    
    try {
      setLoading(true);
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token, 
          new_password: newPassword 
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "No se pudo restablecer la contraseña");
      }
      
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Error al restablecer contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white font-display antialiased overflow-hidden">
      <div className="relative min-h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${heroImageUrl}')` }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#050b14]/70 via-[#0c1728]/55 to-[#050b14]/80"></div>
        <div className="absolute inset-0 bg-[#020817]/20 backdrop-blur-[1px]"></div>
        <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6 py-10 pt-6">
          <div className="w-full max-w-[460px]">
            <div className="rounded-xl p-8 lg:p-10 bg-[rgba(22,39,64,0.82)] backdrop-blur-[12px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
              
              {success ? (
                // Estado de éxito
                <div className="text-center py-6">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-green-500">check_circle</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    ¡Contraseña actualizada!
                  </h2>
                  <p className="text-[#9ab0bc] mb-6">
                    Tu contraseña ha sido cambiada exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.
                  </p>
                  <button
                    onClick={() => navigate("/login")}
                    className="w-full h-14 bg-[#00527a] hover:bg-[#00527a]/90 text-white font-extrabold text-lg rounded-lg shadow-lg shadow-[#00527a]/20 transition-all flex items-center justify-center gap-2"
                  >
                    <span>INICIAR SESIÓN</span>
                    <span className="material-symbols-outlined">login</span>
                  </button>
                </div>
              ) : (
                // Formulario
                <>
                  <div className="mb-8 text-center">
                    <h1 className="text-white text-[24px] font-extrabold leading-tight tracking-tight">
                      Restablecer contraseña
                    </h1>
                    <p className="text-[#9ab0bc] mt-2 text-sm">
                      Ingresa tu nueva contraseña
                    </p>
                  </div>
                  
                  <form className="space-y-5" onSubmit={handleSubmit}>
                    {/* Nueva contraseña */}
                    <div className="flex flex-col gap-2">
                      <label className="text-white text-sm font-bold uppercase tracking-wider opacity-80">
                        Nueva contraseña
                      </label>
                      <div className="flex w-full items-stretch rounded-lg group transition-all">
                        <input
                          className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-r-none border-r-0 text-white focus:outline-0 focus:ring-1 focus:ring-[#00527a] border-[#394c56] bg-[#1b2328] h-14 placeholder:text-[#9ab0bc]/40 px-4 text-base font-normal leading-normal transition-all"
                          placeholder="••••••••"
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          disabled={!token}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[#9ab0bc] hover:text-white flex border border-[#394c56] border-l-0 bg-[#1b2328] items-center justify-center px-3 rounded-r-lg transition-colors cursor-pointer"
                          title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          <span className="material-symbols-outlined text-xl">
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      <p className="text-xs text-[#9ab0bc]/70">
                        Mínimo 6 caracteres
                      </p>
                    </div>
                    
                    {/* Confirmar contraseña */}
                    <div className="flex flex-col gap-2">
                      <label className="text-white text-sm font-bold uppercase tracking-wider opacity-80">
                        Confirmar contraseña
                      </label>
                      <div className="flex w-full items-stretch rounded-lg group transition-all">
                        <input
                          className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-r-none border-r-0 text-white focus:outline-0 focus:ring-1 focus:ring-[#00527a] border-[#394c56] bg-[#1b2328] h-14 placeholder:text-[#9ab0bc]/40 px-4 text-base font-normal leading-normal transition-all"
                          placeholder="••••••••"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={!token}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="text-[#9ab0bc] hover:text-white flex border border-[#394c56] border-l-0 bg-[#1b2328] items-center justify-center px-3 rounded-r-lg transition-colors cursor-pointer"
                          title={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          <span className="material-symbols-outlined text-xl">
                            {showConfirmPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>
                    
                    {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
                    
                    <button
                      className="w-full h-14 bg-[#00527a] hover:bg-[#00527a]/90 text-white font-extrabold text-lg rounded-lg shadow-lg shadow-[#00527a]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      type="submit"
                      disabled={loading || !token}
                    >
                      {loading ? (
                        <>
                          <span className="material-symbols-outlined animate-spin">refresh</span>
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <span>GUARDAR CONTRASEÑA</span>
                          <span className="material-symbols-outlined">save</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => navigate("/login")}
                      className="w-full h-12 border border-[#394c56] text-white font-bold rounded-lg hover:bg-[#1b2328] transition-all"
                    >
                      Volver al inicio de sesión
                    </button>
                  </form>
                </>
              )}
            </div>
            
            <div className="mt-6 flex flex-col items-center gap-2 text-xs font-medium text-[#9ab0bc]/70 text-center">
              <span>V 1.0.0</span>
              <p>
                © 2026 La Marina Collision Center &amp; AF Consulting
                <br />
                Todos los derechos reservados
              </p>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-10 left-10 z-10 hidden lg:flex flex-col gap-2 text-white">
          <div className="flex items-stretch gap-4">
            <div className="size-14 bg-white flex items-center justify-center rounded-2xl overflow-hidden border border-white/70 shadow-[0_0_30px_rgba(56,189,248,0.55)]">
              <img
                src="/assets/LaMarinaCCLogoT.png"
                alt="La Marina Collision Center"
                className="h-10 w-10 object-contain"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl font-extrabold tracking-tight drop-shadow-[0_0_16px_rgba(56,189,248,0.4)] leading-none">
                LA MARINA <span className="text-[#00527a]">COLLISION CENTER</span>
              </span>
              <span className="text-white/70 text-xs font-medium uppercase tracking-[0.28em] leading-none">
                Cloud Suite
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
