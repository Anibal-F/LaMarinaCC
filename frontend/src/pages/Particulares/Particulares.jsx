import Sidebar from "../../components/Sidebar.jsx";

export default function Particulares() {
  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-background-dark">
          <header className="h-16 border-b border-border-dark flex items-center justify-between px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
            <h2 className="text-xl font-bold text-white">Particulares</h2>
          </header>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="bg-surface-dark border border-border-dark rounded-xl p-8 text-center">
              <span className="material-symbols-outlined text-6xl text-slate-600 mb-4">
                person
              </span>
              <h3 className="text-lg font-bold text-white mb-2">
                Módulo de Particulares
              </h3>
              <p className="text-slate-400">
                Este módulo está en desarrollo. Próximamente podrás gestionar clientes particulares.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
