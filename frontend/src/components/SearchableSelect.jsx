import { useEffect, useMemo, useRef, useState } from "react";

export default function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  onAdd,
  addLabel = "Agregar",
  disabled = false,
  emptyLabel = "Sin resultados"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [options, normalizedQuery]);

  const hasExactMatch = useMemo(() => {
    if (!normalizedQuery) return false;
    return options.some((option) => option.toLowerCase() === normalizedQuery);
  }, [options, normalizedQuery]);

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
    setQuery("");
  };

  const handleAdd = async () => {
    if (!onAdd || !normalizedQuery) return;
    try {
      setAdding(true);
      await onAdd(query.trim());
      setQuery("");
      setIsOpen(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {label ? (
        <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        className={`w-full text-left bg-background-dark rounded-lg px-3 py-2 text-sm text-white flex items-center justify-between gap-2 transition-colors ${
          error ? "border border-alert-red" : "border border-border-dark"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary"}`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={value ? "text-white" : "text-slate-500"}>
          {value || placeholder}
        </span>
        <span className="material-symbols-outlined text-base text-slate-400">expand_more</span>
      </button>
      {error ? <span className="text-[10px] text-alert-red">{error}</span> : null}
      {isOpen ? (
        <div className="relative">
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border-dark bg-surface-dark shadow-xl">
            <div className="p-2 border-b border-border-dark">
              <input
                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Buscar..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">{emptyLabel}</div>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-background-dark"
                    onClick={() => handleSelect(option)}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
            {onAdd && normalizedQuery && !hasExactMatch ? (
              <div className="border-t border-border-dark p-2">
                <button
                  type="button"
                  className="w-full text-xs font-bold uppercase tracking-widest text-primary hover:text-primary/80"
                  onClick={handleAdd}
                  disabled={adding}
                >
                  {adding ? "Agregando..." : `${addLabel} "${query.trim()}"`}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
