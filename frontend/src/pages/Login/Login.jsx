const heroImageUrl = "/assets/BG_LoginLaMarina.png";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: userName, password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudo iniciar sesión");
      }

      const payload = await response.json();
      localStorage.setItem("lmcc_user", JSON.stringify(payload));
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
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
              <div className="mb-8">
                <h1 className="text-white text-[24px] font-extrabold leading-tight tracking-tight text-center">
                  Bienvenido a Marina Suite
                </h1>
                <p className="text-[#9ab0bc] mt-2 text-sm text-center">
                  Ingrese sus credenciales para acceder
                </p>
              </div>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-bold uppercase tracking-wider opacity-80">
                    Correo Electrónico
                  </label>
                  <div className="flex w-full items-stretch rounded-lg group transition-all">
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-r-none border-r-0 text-white focus:outline-0 focus:ring-1 focus:ring-[#00527a] border-[#394c56] bg-[#1b2328] h-14 placeholder:text-[#9ab0bc]/40 px-4 text-base font-normal leading-normal transition-all"
                      placeholder="ejemplo@lamarina.com"
                      type="email"
                      value={userName}
                      onChange={(event) => setUserName(event.target.value)}
                    />
                    <div className="text-[#9ab0bc] flex border border-[#394c56] border-l-0 bg-[#1b2328] items-center justify-center px-4 rounded-r-lg">
                      <span className="material-symbols-outlined text-xl">mail</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-bold uppercase tracking-wider opacity-80">
                    Contraseña
                  </label>
                  <div className="flex w-full items-stretch rounded-lg group transition-all">
                    <input
                      className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg rounded-r-none border-r-0 text-white focus:outline-0 focus:ring-1 focus:ring-[#00527a] border-[#394c56] bg-[#1b2328] h-14 placeholder:text-[#9ab0bc]/40 px-4 text-base font-normal leading-normal transition-all"
                      placeholder="••••••••"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <div className="text-[#9ab0bc] flex border border-[#394c56] border-l-0 bg-[#1b2328] items-center justify-center px-4 rounded-r-lg">
                      <span className="material-symbols-outlined text-xl">lock</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm py-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      className="rounded border-[#394c56] bg-[#1b2328] text-[#00527a] focus:ring-[#00527a] transition-all cursor-pointer"
                      type="checkbox"
                    />
                    <span className="text-[#9ab0bc] group-hover:text-white transition-colors">
                      Recordarme
                    </span>
                  </label>
                  <a
                    className="text-[#00527a] hover:text-[#00527a]/80 font-bold transition-colors"
                    href="#"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                {error ? <p className="text-sm text-[#f87171]">{error}</p> : null}
                <button
                  className="w-full h-14 bg-[#00527a] hover:bg-[#00527a]/90 text-white font-extrabold text-lg rounded-lg shadow-lg shadow-[#00527a]/20 transition-all flex items-center justify-center gap-2"
                  type="submit"
                >
                  <span>INICIAR SESIÓN</span>
                  <span className="material-symbols-outlined">login</span>
                </button>
              </form>
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
