// Asset URLs. In the single-file build every asset is embedded as a data URI in
// window.__LL_ASSETS; in development the plain path is served as-is.
export const asset = (path) => globalThis.__LL_ASSETS?.[path] ?? path;
