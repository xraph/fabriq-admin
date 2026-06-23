import { describe, it, expect, vi } from "vitest"
import { loadRemotePlugin } from "./remoteLoader"
import type { FabriqAdminPlugin } from "./plugin"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validPlugin: FabriqAdminPlugin = {
  id: "fabriq.remote-test",
  name: "Remote Test Plugin",
  version: "1.0.0",
}

// A factory function — Module Federation's container.get() returns a function
// (factory) that when called returns the module. So container.get() resolves
// to () => pluginModule.
const makeFactory = (pluginModule: unknown) =>
  // container.get() returns a Promise<factory>
  async () =>
    // factory() returns the module
    () =>
      pluginModule

// ---------------------------------------------------------------------------
// loadRemotePlugin — happy path
// ---------------------------------------------------------------------------

describe("loadRemotePlugin – happy path", () => {
  it("returns the plugin from .default export", async () => {
    const getContainer = async () => ({
      get: makeFactory({ default: validPlugin }),
    })

    const result = await loadRemotePlugin({
      url: "http://fake.remote/remoteEntry.js",
      scope: "entityBrowser",
      module: "./plugin",
      getContainer,
    })

    expect(result).toBe(validPlugin)
  })

  it("falls back to a named export matching the module basename", async () => {
    // module = "./entityBrowserPlugin" → tries pluginModule.entityBrowserPlugin
    const getContainer = async () => ({
      get: makeFactory({ entityBrowserPlugin: validPlugin }),
    })

    const result = await loadRemotePlugin({
      url: "http://fake.remote/remoteEntry.js",
      scope: "entityBrowser",
      module: "./entityBrowserPlugin",
      getContainer,
    })

    expect(result).toBe(validPlugin)
  })

  it("falls back to the raw module when it is the plugin itself", async () => {
    // The module IS the plugin (has id/name/version at top level)
    const getContainer = async () => ({
      get: makeFactory(validPlugin),
    })

    const result = await loadRemotePlugin({
      url: "http://fake.remote/remoteEntry.js",
      scope: "entityBrowser",
      module: "./plugin",
      getContainer,
    })

    expect(result).toBe(validPlugin)
  })

  it("calls container.init() if present (shared scope handshake)", async () => {
    const init = vi.fn()
    const getContainer = async () => ({
      init,
      get: makeFactory({ default: validPlugin }),
    })

    await loadRemotePlugin({
      url: "http://fake.remote/remoteEntry.js",
      scope: "entityBrowser",
      module: "./plugin",
      getContainer,
    })

    expect(init).toHaveBeenCalledOnce()
  })

  it("does NOT call container.init() when absent", async () => {
    // container without init — must not throw
    const getContainer = async () => ({
      get: makeFactory({ default: validPlugin }),
    })

    await expect(
      loadRemotePlugin({
        url: "http://fake.remote/remoteEntry.js",
        scope: "entityBrowser",
        module: "./plugin",
        getContainer,
      })
    ).resolves.toBe(validPlugin)
  })
})

// ---------------------------------------------------------------------------
// loadRemotePlugin — failure paths
// ---------------------------------------------------------------------------

describe("loadRemotePlugin – invalid plugin module", () => {
  it("throws when the resolved module has no id", async () => {
    const badPlugin = { name: "Bad", version: "1.0.0" } // missing id
    const getContainer = async () => ({
      get: makeFactory({ default: badPlugin }),
    })

    await expect(
      loadRemotePlugin({
        url: "http://fake.remote/remoteEntry.js",
        scope: "entityBrowser",
        module: "./plugin",
        getContainer,
      })
    ).rejects.toThrow()
  })

  it("throws when the resolved module has no name", async () => {
    const badPlugin = { id: "fabriq.bad", version: "1.0.0" }
    const getContainer = async () => ({
      get: makeFactory({ default: badPlugin }),
    })

    await expect(
      loadRemotePlugin({
        url: "http://fake.remote/remoteEntry.js",
        scope: "entityBrowser",
        module: "./plugin",
        getContainer,
      })
    ).rejects.toThrow()
  })

  it("throws when the resolved module has no version", async () => {
    const badPlugin = { id: "fabriq.bad", name: "Bad" }
    const getContainer = async () => ({
      get: makeFactory({ default: badPlugin }),
    })

    await expect(
      loadRemotePlugin({
        url: "http://fake.remote/remoteEntry.js",
        scope: "entityBrowser",
        module: "./plugin",
        getContainer,
      })
    ).rejects.toThrow()
  })

  it("throws when factory() returns null", async () => {
    // container.get() resolves to a factory; factory() returns null
    const getContainer = async () => ({
      get: async () => () => null as unknown,
    })

    await expect(
      loadRemotePlugin({
        url: "http://fake.remote/remoteEntry.js",
        scope: "entityBrowser",
        module: "./plugin",
        getContainer,
      })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// loadRemotePlugin — loadEntry injection (no real window/document)
// ---------------------------------------------------------------------------

describe("loadRemotePlugin – loadEntry injection", () => {
  it("calls loadEntry with the provided URL", async () => {
    const loadEntry = vi.fn()
    const getContainer = async () => ({
      get: makeFactory({ default: validPlugin }),
    })

    await loadRemotePlugin({
      url: "http://fake.remote/remoteEntry.js",
      scope: "entityBrowser",
      module: "./plugin",
      loadEntry,
      getContainer,
    })

    expect(loadEntry).toHaveBeenCalledWith("http://fake.remote/remoteEntry.js")
  })
})
