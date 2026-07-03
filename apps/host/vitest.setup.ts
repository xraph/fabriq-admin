// Polyfills for jsdom test environment
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (typeof window !== "undefined" && !window.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserver,
  })
}

// maplibre-gl (pulled in transitively via the spatial plugin's SpatialMap)
// calls URL.createObjectURL at import time to set up its web worker; jsdom
// ships neither it nor revokeObjectURL. The host smoke test never renders a
// map, so a stub URL that satisfies the import is enough.
if (typeof URL !== "undefined" && typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:jsdom-stub"
  URL.revokeObjectURL = () => {}
}
