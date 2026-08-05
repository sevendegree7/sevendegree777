// what the tablet remembers about how it should look and speak.
//
// both of these are read twice: once by the inline boot script below, before
// the page paints, and again by react once it is running. they have to agree,
// so the keys and the defaults live here and nowhere else.

export const THEME_KEY = "seven-degree.theme";
export const LANGUAGE_KEY = "seven-degree.lang";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type Language = "en" | "ar";

export const DEFAULT_THEME: ThemePreference = "system";
export const DEFAULT_LANGUAGE: Language = "en";

// arabic is a cashier feature for now. the kitchen board and admin are still
// english only, so they must not be flipped into rtl by a till preference.
export function isBilingualPath(pathname: string): boolean {
  return (
    pathname === "/pos" || pathname.startsWith("/pos/") || pathname === "/login"
  );
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ar";
}

// runs before the first paint, straight from the document head.
//
// without this the tablet paints cream, hydrates, and then snaps to navy - and
// on a screen in direct sun that flash is the first thing anyone notices. it is
// written as a string because it has to run before react exists, and it
// swallows its own errors: a device with storage disabled still gets a page.
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||${JSON.stringify(DEFAULT_THEME)};
var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
d.dataset.theme=dark?'dark':'light';
var l=localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)})||${JSON.stringify(DEFAULT_LANGUAGE)};
var p=location.pathname;
if(l==='ar'&&(p==='/pos'||p.indexOf('/pos/')===0||p==='/login')){d.lang='ar';d.dir='rtl';}
}catch(e){}})();`;
