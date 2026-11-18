/** Small HTML helpers shared by the web shell and the coaching-state renderer. */
export type ViewName = "calendar" | "history" | "muscle" | "none";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function errorBanner(error?: string): string {
  return error === undefined ? "" : `<p class="error" role="alert">${escapeHtml(error)}</p>`;
}

export function auditMetric(label: string, value: string | number): string {
  return `<div class="audit-stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}
