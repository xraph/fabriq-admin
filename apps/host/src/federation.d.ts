// Type declaration for the @originjs/vite-plugin-federation runtime virtual module.
// These functions are emitted by the federation plugin into "virtual:__federation__"
// when the host is built (or previewed). They allow registering and loading remotes
// at runtime, sharing the host's module scope (one React instance).
declare module "virtual:__federation__" {
  export function __federation_method_setRemote(
    name: string,
    config: { url: string | (() => Promise<string>); format?: string; from?: string },
  ): void
  export function __federation_method_getRemote(
    name: string,
    exposedModule: string,
  ): Promise<unknown>
  export function __federation_method_unwrapDefault(module: unknown): unknown
}
