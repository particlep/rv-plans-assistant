// Light / dark / follow-the-device theme, remembered per device.
export type ThemePref = "system" | "light" | "dark";
const KEY = "theme";

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** styles.css reads data-theme on <html>; no attribute means follow prefers-color-scheme. */
export function applyTheme(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === "system") delete el.dataset.theme;
  else el.dataset.theme = pref;
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable: applies for this visit only */
  }
  applyTheme(pref);
  dispatchEvent(new CustomEvent("themechange", { detail: pref }));
}

export const nextTheme = (p: ThemePref): ThemePref => (p === "system" ? "light" : p === "light" ? "dark" : "system");
export const THEME_LABEL: Record<ThemePref, string> = { system: "System", light: "Light", dark: "Dark" };
