export default function Toast({ message, type = "info", onClose }) {
  const styles = {
    success: "border-alert-green/40 bg-alert-green/10 text-alert-green",
    error: "border-alert-red/40 bg-alert-red/10 text-alert-red",
    info: "border-primary/40 bg-primary/10 text-primary"
  };

  return (
    <div
      className={`fixed right-6 top-20 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg ${
        styles[type] || styles.info
      }`}
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-base">notifications</span>
        <span className="flex-1">{message}</span>
        <button
          type="button"
          className="text-current/80 hover:text-current"
          onClick={onClose}
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    </div>
  );
}
