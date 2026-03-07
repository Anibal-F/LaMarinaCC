import { useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 8000;

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};

export default function WhatsAppChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeWaId, setActiveWaId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draftWaId, setDraftWaId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastSeenByWaId, setLastSeenByWaId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("lmcc_whatsapp_last_seen") || "{}");
    } catch {
      return {};
    }
  });
  const fileInputRef = useRef(null);

  const apiBase = useMemo(() => import.meta.env.VITE_API_URL, []);
  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => {
      const wa = String(item.wa_id || "").toLowerCase();
      const txt = String(item.last_text || "").toLowerCase();
      return wa.includes(query) || txt.includes(query);
    });
  }, [conversations, searchQuery]);

  const hasUnread = (item) => {
    if (item.last_direction !== "in") return false;
    const lastAt = item.last_at ? new Date(item.last_at).getTime() : 0;
    const seenAt = lastSeenByWaId[item.wa_id] ? new Date(lastSeenByWaId[item.wa_id]).getTime() : 0;
    return lastAt > seenAt;
  };

  const unreadCount = useMemo(
    () => conversations.filter((item) => hasUnread(item)).length,
    [conversations, lastSeenByWaId]
  );

  const markConversationSeen = (waId) => {
    if (!waId) return;
    setLastSeenByWaId((prev) => {
      const next = { ...prev, [waId]: new Date().toISOString() };
      localStorage.setItem("lmcc_whatsapp_last_seen", JSON.stringify(next));
      return next;
    });
  };

  const loadConversations = async () => {
    if (!open) return;
    try {
      setLoadingConversations(true);
      const response = await fetch(`${apiBase}/whatsapp/chat/conversations?limit=100`);
      if (!response.ok) throw new Error("No se pudieron cargar conversaciones");
      const data = await response.json();
      setConversations(data || []);
      if (!activeWaId && data?.length) {
        setActiveWaId(data[0].wa_id);
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar conversaciones");
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (waId) => {
    if (!open || !waId) return;
    try {
      setLoadingMessages(true);
      const response = await fetch(
        `${apiBase}/whatsapp/chat/messages?wa_id=${encodeURIComponent(waId)}&limit=200`
      );
      if (!response.ok) throw new Error("No se pudieron cargar mensajes");
      const data = await response.json();
      setMessages(data || []);
      markConversationSeen(waId);
    } catch (err) {
      setError(err.message || "No se pudieron cargar mensajes");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadConversations();
  }, [open]);

  useEffect(() => {
    if (!open || !activeWaId) return;
    loadMessages(activeWaId);
  }, [open, activeWaId]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => {
      loadConversations();
      if (activeWaId) loadMessages(activeWaId);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, activeWaId]);

  const sendMessage = async () => {
    const waId = (activeWaId || draftWaId || "").trim();
    const text = messageText.trim();
    if (!waId || (!text && !selectedFile)) {
      setError("Captura número (wa_id) y mensaje o adjunto.");
      return;
    }
    try {
      setSending(true);
      setError("");
      let response;
      if (selectedFile) {
        const formData = new FormData();
        formData.append("wa_id", waId);
        formData.append("caption", text);
        formData.append("file", selectedFile);
        response = await fetch(`${apiBase}/whatsapp/chat/messages/media`, {
          method: "POST",
          body: formData
        });
      } else {
        response = await fetch(`${apiBase}/whatsapp/chat/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wa_id: waId, text })
        });
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "No se pudo enviar el mensaje");
      }
      setMessageText("");
      setSelectedFile(null);
      setActiveWaId(waId);
      await loadConversations();
      await loadMessages(waId);
    } catch (err) {
      setError(err.message || "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title="Chat WhatsApp"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-[120] h-14 w-14 rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/40 text-white flex items-center justify-center hover:scale-105 transition-transform relative"
      >
        <svg viewBox="0 0 32 32" className="w-7 h-7" fill="currentColor" aria-hidden="true">
          <path d="M19.11 17.21c-.28-.14-1.65-.82-1.9-.91-.25-.09-.43-.14-.61.14-.18.28-.71.91-.87 1.09-.16.18-.32.21-.6.07-.28-.14-1.17-.43-2.24-1.37-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.35-.02-.49-.07-.14-.61-1.48-.84-2.03-.22-.53-.45-.46-.61-.46h-.52c-.18 0-.46.07-.7.35-.24.28-.92.9-.92 2.19s.94 2.54 1.07 2.71c.14.18 1.85 2.82 4.48 3.95.63.27 1.12.43 1.5.55.63.2 1.2.17 1.65.1.5-.07 1.65-.67 1.88-1.31.23-.64.23-1.19.16-1.31-.07-.12-.25-.19-.53-.33z" />
          <path d="M16.01 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.26.59 4.47 1.71 6.41L3 29l6.79-1.78c1.87 1.02 3.97 1.55 6.22 1.56h.01c7.07 0 12.8-5.73 12.8-12.8 0-3.43-1.34-6.65-3.77-9.08A12.74 12.74 0 0 0 16.01 3.2zm0 23.42h-.01c-1.92 0-3.8-.52-5.44-1.49l-.39-.23-4.03 1.06 1.08-3.93-.25-.41a10.58 10.58 0 0 1-1.62-5.62c0-5.86 4.77-10.63 10.64-10.63 2.83 0 5.5 1.1 7.5 3.11 2 2 3.1 4.67 3.1 7.5 0 5.86-4.77 10.63-10.63 10.63z" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-alert-red text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-6 z-[119] w-[360px] max-w-[calc(100vw-1.5rem)] h-[70vh] rounded-xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">WhatsApp</h3>
            <button
              type="button"
              className="text-slate-400 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <div className="px-3 py-2 border-b border-border-dark space-y-2">
            <input
              className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white"
              placeholder="Buscar wa_id o mensaje..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <input
              className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-xs text-white"
              placeholder="wa_id para iniciar chat (ej. 526691234567)"
              value={draftWaId}
              onChange={(event) => setDraftWaId(event.target.value)}
            />
            {loadingConversations ? (
              <p className="text-[11px] text-slate-500">Cargando conversaciones...</p>
            ) : (
              <div className="flex flex-wrap gap-1 max-h-20 overflow-auto custom-scrollbar">
                {filteredConversations.map((item) => (
                  <button
                    key={item.wa_id}
                    type="button"
                    onClick={() => {
                      setActiveWaId(item.wa_id);
                      setDraftWaId(item.wa_id);
                      markConversationSeen(item.wa_id);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] border ${
                      activeWaId === item.wa_id
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-background-dark text-slate-300 border-border-dark"
                    }`}
                  >
                    {item.wa_id}
                    {hasUnread(item) ? <span className="ml-1 text-alert-red">•</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-background-dark/40">
            {loadingMessages ? (
              <p className="text-xs text-slate-500">Cargando mensajes...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-slate-500">Sin mensajes para mostrar.</p>
            ) : (
              messages.map((item) => (
                <div
                  key={item.id}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                    item.direction === "out"
                      ? "ml-auto bg-primary/20 text-white border border-primary/30"
                      : "mr-auto bg-surface-dark text-slate-200 border border-border-dark"
                  }`}
                >
                  <p>{item.text_body || `[${item.message_type}]`}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatTime(item.created_at)} {item.status ? `· ${item.status}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-border-dark space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
            <textarea
              className="w-full min-h-20 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Escribe tu mensaje..."
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-border-dark text-xs text-slate-300 hover:text-white"
                onClick={() => fileInputRef.current?.click()}
              >
                Adjuntar
              </button>
              {selectedFile ? (
                <div className="text-[11px] text-slate-400 truncate">
                  {selectedFile.name}
                  <button
                    type="button"
                    className="ml-2 text-alert-red"
                    onClick={() => setSelectedFile(null)}
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-slate-500">Sin adjunto</span>
              )}
            </div>
            {error ? <p className="text-xs text-alert-red">{error}</p> : null}
            <button
              type="button"
              className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
              disabled={sending}
              onClick={sendMessage}
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
