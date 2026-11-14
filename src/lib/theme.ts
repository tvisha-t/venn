export const THEME_KEY = "venn-theme";
export type Theme = "light" | "dark";

/** Runs in <head> before paint so a saved dark choice doesn't flash light. Light is the default. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
