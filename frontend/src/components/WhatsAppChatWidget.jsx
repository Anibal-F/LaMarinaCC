import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POLL_MS = 8000;
const PHONE_INPUT_PATTERN = /^[\d+\s\-()]*$/;

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
};

const formatPhoneForInput = (digitsValue) => {
  const digits = String(digitsValue || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;

  const prefix = digits.slice(0, -10);
  const local = digits.slice(-10);
  return `+${prefix} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
};

const MediaPreview = ({ item, apiBase }) => {
  const rawLink = item.media_link;
  const link = rawLink && !/^https?:\/\//i.test(rawLink) ? `${apiBase}${rawLink}` : rawLink;
  if (!link) return null;

  if (item.message_type === "image") {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="block mt-2">
        <img src={link} alt={item.file_name || "Imagen"} className="max-h-48 rounded-md border border-border-dark" />
      </a>
    );
  }
  if (item.message_type === "video") {
    return <video controls src={link} className="mt-2 max-h-56 w-full rounded-md border border-border-dark" />;
  }
  if (item.message_type === "audio") {
    return <audio controls src={link} className="mt-2 w-full" />;
  }
  if (item.message_type === "document") {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-[11px] text-primary hover:text-white">
        Abrir documento
      </a>
    );
  }
  return null;
};

export default function WhatsAppChatWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("list");
  const [conversations, setConversations] = useState([]);
  const [activeWaId, setActiveWaId] = useState("");
  const [messages, setMessages] = useState([]);
  const [newChatWaId, setNewChatWaId] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientesCatalogo, setClientesCatalogo] = useState([]);
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
  const clientDropdownRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const apiBase = useMemo(() => import.meta.env.VITE_API_URL, []);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => {
      const wa = String(item.wa_id || "").toLowerCase();
      const name = String(item.contact_name || "").toLowerCase();
      const txt = String(item.last_text || "").toLowerCase();
      return wa.includes(query) || name.includes(query) || txt.includes(query);
    });
  }, [conversations, searchQuery]);

  const filteredClientesCatalogo = useMemo(() => {
    const query = newChatWaId.trim().toLowerCase();
    const queryDigits = query.replace(/\D+/g, "");
    if (!query) return clientesCatalogo.slice(0, 30);
    return clientesCatalogo
      .filter((item) => {
        const name = String(item.nb_cliente || "").toLowerCase();
        const phone = String(item.tel_cliente || "").toLowerCase();
        const phoneDigits = phone.replace(/\D+/g, "");
        return name.includes(query) || phone.includes(query) || (queryDigits && phoneDigits.includes(queryDigits));
      })
      .slice(0, 30);
  }, [clientesCatalogo, newChatWaId]);

  const openQuickChat = async () => {
    const digits = String(newChatWaId || "").replace(/\D+/g, "");
    if (digits.length < 10) {
      setError("Captura un celular válido (10+ dígitos) o selecciona un cliente.");
      return;
    }
    setError("");
    setClientDropdownOpen(false);
    await openConversation(digits);
  };

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
    } catch (err) {
      setError(err.message || "No se pudieron cargar conversaciones");
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadClientesCatalogo = async () => {
    if (!open) return;
    try {
      const response = await fetch(`${apiBase}/clientes`);
      if (!response.ok) return;
      const data = await response.json();
      const withPhone = (data || []).filter((item) => String(item?.tel_cliente || "").trim());
      setClientesCatalogo(withPhone);
    } catch {
      // silent: catalog is optional helper for starting chat
    }
  };

  const loadMessages = async (
    waId,
    options = { showLoader: true, preserveScroll: true, stickToBottom: false }
  ) => {
    if (!open || !waId) return;
    const showLoader = options.showLoader ?? true;
    const preserveScroll = options.preserveScroll ?? true;
    const stickToBottom = options.stickToBottom ?? false;

    const container = messagesContainerRef.current;
    const previousScrollTop = container ? container.scrollTop : 0;
    const previousScrollHeight = container ? container.scrollHeight : 0;
    const wasNearBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight <= 24
      : false;

    try {
      if (showLoader) setLoadingMessages(true);
      const response = await fetch(`${apiBase}/whatsapp/chat/messages?wa_id=${encodeURIComponent(waId)}&limit=200`);
      if (!response.ok) throw new Error("No se pudieron cargar mensajes");
      const data = await response.json();
      setMessages(data || []);
      markConversationSeen(waId);
      window.requestAnimationFrame(() => {
        const nextContainer = messagesContainerRef.current;
        if (!nextContainer) return;
        if (stickToBottom || wasNearBottom) {
          nextContainer.scrollTop = nextContainer.scrollHeight;
          return;
        }
        if (preserveScroll) {
          const deltaHeight = nextContainer.scrollHeight - previousScrollHeight;
          nextContainer.scrollTop = Math.max(0, previousScrollTop + deltaHeight);
        }
      });
    } catch (err) {
      setError(err.message || "No se pudieron cargar mensajes");
    } finally {
      if (showLoader) setLoadingMessages(false);
    }
  };

  const openConversation = async (waId) => {
    if (!waId) return;
    setActiveWaId(waId);
    setNewChatWaId(waId);
    setView("chat");
    await loadMessages(waId, { showLoader: true, preserveScroll: false, stickToBottom: true });
  };

  useEffect(() => {
    if (!open) return;
    loadConversations();
    loadClientesCatalogo();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setInterval(() => {
      loadConversations();
      if (view === "chat" && activeWaId) {
        loadMessages(activeWaId, { showLoader: false, preserveScroll: true, stickToBottom: false });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, activeWaId, view]);

  useEffect(() => {
    if (!clientDropdownOpen) return undefined;
    const onPointerDown = (event) => {
      if (!clientDropdownRef.current) return;
      if (!clientDropdownRef.current.contains(event.target)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [clientDropdownOpen]);

  const sendMessage = async () => {
    const waId = (activeWaId || newChatWaId || "").trim();
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
      await openConversation(waId);
      await loadConversations();
    } catch (err) {
      setError(err.message || "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  if (typeof document === "undefined") return null;

  const activeConversation = conversations.find((item) => item.wa_id === activeWaId);
  const activeDisplayName = activeConversation?.contact_name || activeWaId;

  const widget = (
    <>
      <button
        type="button"
        title="Chat WhatsApp"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) setView("list");
        }}
        className="fixed h-14 w-14 rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/40 text-white flex items-center justify-center hover:scale-105 transition-transform relative"
        style={{ position: "fixed", right: "1.5rem", bottom: "1.5rem", left: "auto", zIndex: 120 }}
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
        <div
          className="fixed w-[380px] max-w-[calc(100vw-1.5rem)] h-[72vh] rounded-xl border border-primary/35 bg-gradient-to-b from-[#212B3A] to-[#1B2330] shadow-2xl shadow-black/55 overflow-hidden flex flex-col"
          style={{ position: "fixed", right: "1.5rem", bottom: "6rem", left: "auto", zIndex: 119 }}
        >
          <div className="px-4 py-3 border-b border-primary/20 bg-[#273446] flex items-center justify-between">
            {view === "chat" ? (
              <button
                type="button"
                className="text-slate-300 hover:text-white flex items-center gap-1"
                onClick={() => setView("list")}
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                <span className="text-xs">Chats</span>
              </button>
            ) : (
              <h3 className="text-sm font-bold text-white">WhatsApp</h3>
            )}
            <div className="flex items-center gap-2">
              {view === "chat" && activeWaId ? (
                <p className="text-xs text-slate-400 truncate max-w-44" title={activeWaId}>
                  {activeDisplayName}
                </p>
              ) : null}
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setOpen(false)}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>

          {view === "list" ? (
            <>
              <div className="p-3 border-b border-primary/20 space-y-2">
                <input
                  className="w-full bg-[#121A25] border border-primary/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-400"
                  placeholder="Buscar chat..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <div className="flex gap-2 relative" ref={clientDropdownRef}>
                  <input
                    className="flex-1 bg-[#121A25] border border-primary/20 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-400"
                    placeholder="Nuevo chat: cliente o celular (ej. 6691234567)"
                    value={newChatWaId}
                    onFocus={() => setClientDropdownOpen(true)}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      if (PHONE_INPUT_PATTERN.test(rawValue)) {
                        const digits = rawValue.replace(/\D+/g, "");
                        setNewChatWaId(formatPhoneForInput(digits));
                      } else {
                        setNewChatWaId(rawValue);
                      }
                      setClientDropdownOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        openQuickChat();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="px-3 rounded-lg bg-primary text-white text-xs font-semibold"
                    onClick={openQuickChat}
                  >
                    Abrir
                  </button>
                  {clientDropdownOpen ? (
                    <div className="absolute z-[130] top-[2.65rem] w-[calc(100%-4.5rem)] max-h-48 overflow-y-auto custom-scrollbar rounded-lg border border-primary/20 bg-[#1F2A39] shadow-xl">
                      {filteredClientesCatalogo.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias en clientes. Puedes abrir con el número capturado.</p>
                      ) : (
                        filteredClientesCatalogo.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-[#121A25]"
                            onClick={() => {
                              setNewChatWaId(String(item.tel_cliente || ""));
                              setClientDropdownOpen(false);
                            }}
                          >
                            {item.nb_cliente} · {item.tel_cliente}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loadingConversations ? (
                  <p className="px-3 py-4 text-xs text-slate-500">Cargando conversaciones...</p>
                ) : filteredConversations.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-slate-500">No hay conversaciones.</p>
                ) : (
                  filteredConversations.map((item) => (
                    <button
                      key={item.wa_id}
                      type="button"
                      onClick={() => openConversation(item.wa_id)}
                      className="w-full text-left px-3 py-3 border-b border-primary/10 hover:bg-[#151E2A]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-background-dark border border-border-dark flex items-center justify-center text-slate-300 text-sm font-semibold">
                          {String(item.wa_id || "?").slice(-2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-white font-semibold truncate">
                              {item.contact_name || item.wa_id}
                            </p>
                            <p className="text-[11px] text-slate-500 whitespace-nowrap">{formatTime(item.last_at)}</p>
                          </div>
                          <p className="text-xs text-slate-500 truncate">{item.wa_id}</p>
                          <p className="text-xs text-slate-400 truncate">{item.last_text || "Sin mensajes"}</p>
                        </div>
                        {hasUnread(item) ? <span className="h-2.5 w-2.5 rounded-full bg-[#25D366] mt-2" /> : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-background-dark/40">
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
                      <MediaPreview item={item} apiBase={apiBase} />
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
                  placeholder={activeConversation ? "Escribe tu mensaje..." : "Selecciona o abre un chat"}
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
                      <button type="button" className="ml-2 text-alert-red" onClick={() => setSelectedFile(null)}>
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
                  disabled={sending || !activeWaId}
                  onClick={sendMessage}
                >
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  return createPortal(widget, document.body);
}
