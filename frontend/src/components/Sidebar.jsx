import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getSession } from "../utils/auth.js";

const navItemBase =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors";

const navItemInactive = "text-slate-400 hover:bg-primary/10 hover:text-white";
const navItemActive = "bg-primary/20 text-white border-l-4 border-primary";

export default function Sidebar() {
  const navigate = useNavigate();
  const storedUser = getSession();

  const displayName = storedUser?.name || "Usuario";
  const displayProfile = storedUser?.profile || "Perfil";
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(
    location.pathname.startsWith("/admin")
  );
  const [recepcionExpanded, setRecepcionExpanded] = useState(
    location.pathname.startsWith("/recepcion")
  );
  const [catalogosExpanded, setCatalogosExpanded] = useState(
    location.pathname.startsWith("/catalogos")
  );
  const [valuacionExpanded, setValuacionExpanded] = useState(
    location.pathname.startsWith("/valuacion")
  );
  const [reportesExpanded, setReportesExpanded] = useState(
    location.pathname.startsWith("/reportes")
  );

  const isAdminRoute = useMemo(
    () => location.pathname.startsWith("/admin"),
    [location.pathname]
  );
  const isRecepcionRoute = useMemo(
    () => location.pathname.startsWith("/recepcion"),
    [location.pathname]
  );
  const isCatalogosRoute = useMemo(
    () => location.pathname.startsWith("/catalogos"),
    [location.pathname]
  );
  const isValuacionRoute = useMemo(
    () => location.pathname.startsWith("/valuacion"),
    [location.pathname]
  );
  const isReportesRoute = useMemo(
    () => location.pathname.startsWith("/reportes"),
    [location.pathname]
  );
  const showLabels = !collapsed || isMobile;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(false);
      }
    };

    syncViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setMobileOpen(false);
    }
  }, [location.pathname, isMobile]);

  return (
    <>
      {isMobile ? (
        <button
          type="button"
          className="fixed left-3 top-3 z-50 flex items-center justify-center size-10 rounded-lg border border-border-dark bg-background-dark/95 text-slate-200"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
      ) : null}
      {isMobile && mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
        />
      ) : null}
      <aside
        className={`border-r border-border-dark bg-background-dark flex flex-col transition-all duration-300 ${
          isMobile
            ? `fixed inset-y-0 left-0 z-40 w-64 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
            : `relative shrink-0 ${collapsed ? "w-20" : "w-64"}`
        }`}
      >
      {!isMobile ? (
        <button
          type="button"
          className={`absolute -right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center size-8 rounded-full border border-border-dark bg-surface-dark text-slate-300 hover:text-white transition-all ${
            collapsed ? "rotate-180" : ""
          }`}
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Expandir sidebar" : "Contraer sidebar"}
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
      ) : null}
      <div className={`p-6 flex items-center gap-3 border-b border-border-dark ${showLabels ? "" : "justify-center"}`}>
        <div
          className={`rounded-lg bg-white flex items-center justify-center overflow-hidden border border-white/70 shadow-[0_0_18px_rgba(56,189,248,0.35)] transition-all duration-300 ${
            showLabels ? "size-11" : "size-10"
          }`}
        >
          <img
            src="/assets/LaMarinaCCLogoT.png"
            alt="La Marina Collision Center"
            className={`object-contain transition-all duration-300 ${showLabels ? "h-8 w-8" : "h-6 w-6"}`}
          />
        </div>
        {showLabels ? (
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-white">La Marina</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
              Collision Center
            </p>
          </div>
        ) : null}
        {isMobile ? (
          <button
            type="button"
            className="ml-auto p-2 text-slate-300 hover:text-white"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        ) : null}
      </div>
      <nav className={`flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar ${showLabels ? "" : "px-2"}`}>
        {showLabels ? (
          <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-2 tracking-widest">
            Inicio
          </div>
        ) : null}
        <NavLink
          to="/"
          end
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            if (isMobile) setMobileOpen(false);
          }}
          title={!showLabels ? "Inicio" : undefined}
          className={({ isActive }) =>
            `${navItemBase} ${isActive ? navItemActive : navItemInactive}`
          }
        >
          <span className="material-symbols-outlined text-[22px]">home</span>
          {showLabels ? <span className="text-sm font-medium">Inicio</span> : null}
        </NavLink>
        {showLabels ? (
          <div className="pt-6 text-[10px] font-bold text-slate-500 uppercase px-3 py-2 tracking-widest">
            Módulos Principales
          </div>
        ) : null}
        <button
          className={`${navItemBase} ${isRecepcionRoute ? navItemActive : navItemInactive} justify-between`}
          type="button"
          title={!showLabels ? "Recepción" : undefined}
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            setRecepcionExpanded((value) => !value);
          }}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px]">assignment_turned_in</span>
            {showLabels ? <span className="text-sm font-medium">Recepción</span> : null}
          </span>
          {showLabels ? (
            <span className="material-symbols-outlined text-lg">
              {recepcionExpanded ? "expand_more" : "chevron_right"}
            </span>
          ) : null}
        </button>
        {recepcionExpanded ? (
          <>
            <NavLink
              to="/recepcion/ordenes"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Orden de admisión</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                assignment
              </span>
            </NavLink>
            <NavLink
              to="/recepcion"
              end
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Recepción de vehículo</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                directions_car
              </span>
            </NavLink>
            <NavLink
              to="/recepcion/citas"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Agenda de citas</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                calendar_month
              </span>
            </NavLink>
          </>
        ) : null}
        <button
          className={`${navItemBase} ${isValuacionRoute ? navItemActive : navItemInactive} justify-between`}
          type="button"
          title={!showLabels ? "Valuación" : undefined}
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            setValuacionExpanded((value) => !value);
          }}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px]">calculate</span>
            {showLabels ? <span className="text-sm font-medium">Valuación</span> : null}
          </span>
          {showLabels ? (
            <span className="material-symbols-outlined text-lg">
              {valuacionExpanded ? "expand_more" : "chevron_right"}
            </span>
          ) : null}
        </button>
        {valuacionExpanded ? (
          <NavLink
            to="/valuacion/vehiculos"
            className={({ isActive }) =>
              `${navItemBase} ml-6 ${
                isActive ? "text-white" : "text-slate-400 hover:text-white"
              }`
            }
          >
            {showLabels ? <span className="text-sm font-medium">Listado de vehículos</span> : null}
            <span className="material-symbols-outlined text-[18px] ml-auto">table_rows</span>
          </NavLink>
        ) : null}
        <button
          className={`${navItemBase} ${navItemInactive}`}
          type="button"
          title={!showLabels ? "Taller" : undefined}
          onClick={() => !showLabels && setCollapsed(false)}
        >
          <span className="material-symbols-outlined text-[22px]">build</span>
          {showLabels ? <span className="text-sm font-medium">Taller</span> : null}
        </button>
        <button
          className={`${navItemBase} ${navItemInactive}`}
          type="button"
          title={!showLabels ? "Pintura" : undefined}
          onClick={() => !showLabels && setCollapsed(false)}
        >
          <span className="material-symbols-outlined text-[22px]">format_paint</span>
          {showLabels ? <span className="text-sm font-medium">Pintura</span> : null}
        </button>
        <button
          className={`${navItemBase} ${navItemInactive}`}
          type="button"
          title={!showLabels ? "Inventario" : undefined}
          onClick={() => !showLabels && setCollapsed(false)}
        >
          <span className="material-symbols-outlined text-[22px]">inventory_2</span>
          {showLabels ? <span className="text-sm font-medium">Inventario</span> : null}
        </button>
        {showLabels ? (
          <div className="pt-6 text-[10px] font-bold text-slate-500 uppercase px-3 py-2 tracking-widest">
            Sistema
          </div>
        ) : null}
        <button
          className={`${navItemBase} ${isAdminRoute ? navItemActive : navItemInactive} justify-between`}
          type="button"
          title={!showLabels ? "Admin" : undefined}
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            setAdminExpanded((value) => !value);
          }}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px]">admin_panel_settings</span>
            {showLabels ? <span className="text-sm font-medium">Admin</span> : null}
          </span>
          {showLabels ? (
            <span className="material-symbols-outlined text-lg">
              {adminExpanded ? "expand_more" : "chevron_right"}
            </span>
          ) : null}
        </button>
        {adminExpanded ? (
          <>
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Usuarios</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">group</span>
            </NavLink>
            <NavLink
              to="/admin/profiles"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Perfiles</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">badge</span>
            </NavLink>
            <NavLink
              to="/admin/credenciales"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Credenciales</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">key</span>
            </NavLink>
          </>
        ) : null}
        <button
          className={`${navItemBase} ${navItemInactive}`}
          type="button"
          title={!showLabels ? "Configuración" : undefined}
          onClick={() => !showLabels && setCollapsed(false)}
        >
          <span className="material-symbols-outlined text-[22px]">settings</span>
          {showLabels ? <span className="text-sm font-medium">Configuración</span> : null}
        </button>
        <button
          className={`${navItemBase} ${isCatalogosRoute ? navItemActive : navItemInactive} justify-between`}
          type="button"
          title={!showLabels ? "Catálogos" : undefined}
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            setCatalogosExpanded((value) => !value);
          }}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px]">folder_open</span>
            {showLabels ? <span className="text-sm font-medium">Catálogos</span> : null}
          </span>
          {showLabels ? (
            <span className="material-symbols-outlined text-lg">
              {catalogosExpanded ? "expand_more" : "chevron_right"}
            </span>
          ) : null}
        </button>
        {catalogosExpanded ? (
          <>
            <NavLink
              to="/catalogos/clientes"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Clientes</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">contacts</span>
            </NavLink>
            <NavLink
              to="/catalogos/grupos-autos"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Grupos Automotrices</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                domain
              </span>
            </NavLink>
            <NavLink
              to="/catalogos/marcas-autos"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Marcas Automotrices</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                directions_car
              </span>
            </NavLink>
            <NavLink
              to="/catalogos/aseguradoras"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Aseguradoras</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                policy
              </span>
            </NavLink>
            <NavLink
              to="/catalogos/partes-auto"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Partes de Auto</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                category
              </span>
            </NavLink>
            <NavLink
              to="/catalogos/estatus-valuacion"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Estatus de Valuación</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                checklist
              </span>
            </NavLink>
            <NavLink
              to="/catalogos/expedientes"
              className={({ isActive }) =>
                `${navItemBase} ml-6 ${
                  isActive ? "text-white" : "text-slate-400 hover:text-white"
                }`
              }
            >
              {showLabels ? <span className="text-sm font-medium">Expedientes</span> : null}
              <span className="material-symbols-outlined text-[18px] ml-auto">
                folder
              </span>
            </NavLink>
          </>
        ) : null}
        <button
          className={`${navItemBase} ${isReportesRoute ? navItemActive : navItemInactive} justify-between`}
          type="button"
          title={!showLabels ? "Reportes" : undefined}
          onClick={() => {
            if (!showLabels) setCollapsed(false);
            setReportesExpanded((value) => !value);
          }}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px]">monitoring</span>
            {showLabels ? <span className="text-sm font-medium">Reportes</span> : null}
          </span>
          {showLabels ? (
            <span className="material-symbols-outlined text-lg">
              {reportesExpanded ? "expand_more" : "chevron_right"}
            </span>
          ) : null}
        </button>
        {reportesExpanded ? (
          <NavLink
            to="/reportes/historial"
            className={({ isActive }) =>
              `${navItemBase} ml-6 ${
                isActive ? "text-white" : "text-slate-400 hover:text-white"
              }`
            }
          >
            {showLabels ? <span className="text-sm font-medium">Historial de ingresos</span> : null}
            <span className="material-symbols-outlined text-[18px] ml-auto">table_view</span>
          </NavLink>
        ) : null}
      </nav>
      <div className={`p-4 border-t border-border-dark flex items-center gap-3 ${showLabels ? "" : "justify-center"}`}>
        {showLabels ? (
          <div
            className="size-10 rounded-full bg-surface-dark border border-border-dark bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDPh-Vj8jAUNVJ19xQ5zOqxtzyEgXxU92HFJSrHeo73qng7W78JJarGVDf1DQIgAWK8fWS-aIWEf7UiyVI1iulhXG9cjLslD7QkTYzH_UzxDN3BMZF0x7ra3wbbXHBvKpaIbkFvAsm32Tds6Uch-k6Zs_5X0duyaDG4zX7X-5ghIkILTbbS3RrdMk0Isz8r1u5kBAb-gRWuEddgbMRX7Ai_FqpaAay4N8jHvwNEqH0aXfIMqdhMK7L0d5REL84R5JIZ60ZD7D7RvBd3')"
            }}
          ></div>
        ) : null}
        {showLabels ? (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-slate-400 truncate">{displayProfile}</p>
          </div>
        ) : null}
        <button
          type="button"
          className="text-slate-400 hover:text-white transition-colors"
          onClick={() => {
            clearSession();
            navigate("/login", { replace: true });
          }}
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </div>
    </aside>
    </>
  );
}
