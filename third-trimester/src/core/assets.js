// Asset URL resolution. The single-file build replaces window.__ASSETS with data: URIs.
const BASE = (typeof document !== 'undefined' && document.querySelector('meta[name="asset-base"]')?.content) || 'assets/';
export function assetUrl(path) {
  const inl = typeof window !== 'undefined' && window.__ASSETS;
  if (inl && inl[path]) return inl[path];
  return BASE + path;
}
