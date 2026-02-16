import { useEffect, useState } from "react";

export default function AppHeader({
  title,
  subtitle,
  showSearch = true,
  searchPlaceholder = "Buscar...",
  searchValue = "",
  onSearchChange,
  actions,
  rightExtras,
  showNotifications = true,
  notificationsActive = true
}) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    localStorage.setItem("lmcc_theme", nextTheme);
    setTheme(nextTheme);
  };

  return (
    <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
      <div className="flex items-center flex-1 max-w-xl gap-6">
        {title ? (
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white whitespace-nowrap">{title}</h2>
            {subtitle ? <span className="text-xs text-slate-400">{subtitle}</span> : null}
          </div>
        ) : null}
        {showSearch ? (
          <div className="relative w-full group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="w-full bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 transition-all"
              placeholder={searchPlaceholder}
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        {actions}
        <button
          className="p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all"
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          <span className="material-symbols-outlined">
            {theme === "dark" ? "dark_mode" : "light_mode"}
          </span>
        </button>
        {showNotifications ? (
          <button className="relative p-2 text-slate-400 hover:text-white hover:bg-surface-dark rounded-lg transition-all">
            <span className="material-symbols-outlined">notifications</span>
            {notificationsActive ? (
              <span className="absolute top-2 right-2 size-2 bg-alert-red rounded-full border border-background-dark"></span>
            ) : null}
          </button>
        ) : null}
        {rightExtras}
      </div>
    </header>
  );
}
