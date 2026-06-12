// Shim: map React imports to CDN-provided globals for esbuild IIFE bundle.
// React 18 UMD builds set window.React and window.ReactDOM.
// Lazy getters — React is not yet loaded when the IIFE bundle is parsed.
export const useState = (...a) => window.React.useState(...a);
export const useEffect = (...a) => window.React.useEffect(...a);
export default new Proxy({}, { get: (_, k) => window.React[k] });
