export function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL || "/api";
  if (typeof window === "undefined") return configured;

  const isPublicHost = !["localhost", "127.0.0.1"].includes(window.location.hostname);
  const pointsToLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  if (isPublicHost && pointsToLocalApi) return "/api";
  return configured.replace(/\/+$/, "");
}

export function resolveMediaUrl(filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return encodeURI(raw);

  const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
  const encodedPath = encodeURI(normalizedPath);
  return `${resolveApiBaseUrl()}${encodedPath}`;
}
