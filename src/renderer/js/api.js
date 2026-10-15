// Bridge exposed by src/main/preload.js. Imported instead of read from `window`
// so every module declares the dependency.
export const api = window.api;
