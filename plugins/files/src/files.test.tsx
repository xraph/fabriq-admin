import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import {
  FabriqClient,
  FabriqAdmin,
  HttpTransportError,
  type FabriqTransport,
  type FileNode,
} from "@fabriq/admin-sdk"
import { filesPlugin, FilesPage } from "./index"

// ---------------------------------------------------------------------------
// Fake transport — the file plugin uses request() (list/create/upload/delete)
// and fetchBlob() (download). We route request() by path and stub fetchBlob.
// ---------------------------------------------------------------------------

type RequestOpts = Parameters<FabriqTransport["request"]>[0]

function makeClient(handler: (opts: RequestOpts) => unknown): {
  client: FabriqClient
  request: ReturnType<typeof vi.fn>
  fetchBlob: ReturnType<typeof vi.fn>
} {
  const request = vi.fn(async (opts: RequestOpts) => handler(opts))
  const fetchBlob = vi.fn(async () => ({
    blob: new Blob(["data"], { type: "text/plain" }),
    headers: {
      "content-type": "text/plain",
      "content-disposition": 'attachment; filename="a.txt"',
    },
    status: 200,
  }))
  const transport: FabriqTransport = {
    request: request as unknown as FabriqTransport["request"],
    async rawRequest() {
      throw new Error("not used")
    },
    async *stream(): AsyncIterable<unknown> {},
    fetchBlob: fetchBlob as unknown as FabriqTransport["fetchBlob"],
  }
  return {
    client: new FabriqClient({ baseUrl: "http://test", transport }),
    request,
    fetchBlob,
  }
}

function renderFiles(client: FabriqClient) {
  return render(
    <FabriqAdmin
      client={client}
      plugins={[filesPlugin]}
      loadRemote={vi.fn()}
      initialPath="files"
    />,
  )
}

const ROOT: FileNode[] = [
  { id: "fold1", name: "Documents", kind: "folder" },
  { id: "file1", name: "readme.txt", kind: "file", size: 1024, contentType: "text/plain" },
]

// A handler that serves listFiles by `parent` query param.
function listHandler(byParent: Record<string, FileNode[]>) {
  return (opts: RequestOpts) => {
    const path = opts.path
    if (path.endsWith("/files") && (opts.method ?? "GET") === "GET") {
      const parent = (opts.query?.parent as string | undefined) ?? "__root__"
      return { items: byParent[parent] ?? byParent["__root__"] ?? [] }
    }
    return {}
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Plugin metadata
// ---------------------------------------------------------------------------

describe("filesPlugin shape", () => {
  it("has id 'fabriq.files'", () => {
    expect(filesPlugin.id).toBe("fabriq.files")
  })
  it("route path is 'files'", () => {
    expect(filesPlugin.routes?.[0]?.path).toBe("files")
  })
  it("navItem to is 'files'", () => {
    expect(filesPlugin.navItems?.[0]?.to).toBe("files")
  })
})

// ---------------------------------------------------------------------------
// 2. Listing folders + files
// ---------------------------------------------------------------------------

describe("FilesPage — listing", () => {
  it("lists folders and files from listFiles", async () => {
    const { client } = makeClient(listHandler({ __root__: ROOT }))
    renderFiles(client)

    await screen.findByText("Documents")
    expect(screen.getByText("readme.txt")).toBeTruthy()
  })

  it("renders an empty state for an empty folder", async () => {
    const { client } = makeClient(listHandler({ __root__: [] }))
    renderFiles(client)
    await screen.findByText(/this folder is empty/i)
  })
})

// ---------------------------------------------------------------------------
// 3. Descending into a folder updates breadcrumb + refetches with its id
// ---------------------------------------------------------------------------

describe("FilesPage — descend", () => {
  it("clicking a folder calls listFiles with its id and updates the breadcrumb", async () => {
    const { client, request } = makeClient(
      listHandler({
        __root__: ROOT,
        fold1: [{ id: "child1", name: "nested.md", kind: "file", size: 5 }],
      }),
    )
    renderFiles(client)

    const folder = await screen.findByText("Documents")
    fireEvent.click(folder)

    // descended: nested file is shown
    await screen.findByText("nested.md")

    // listFiles was called with parent=fold1
    const calledWithFold1 = request.mock.calls.some(
      (c) => (c[0] as RequestOpts).query?.parent === "fold1",
    )
    expect(calledWithFold1).toBe(true)

    // folder-path breadcrumb now contains the folder name
    const crumbs = screen.getByRole("navigation", { name: /folder path/i })
    expect(within(crumbs).getByText("Documents")).toBeTruthy()
    expect(within(crumbs).getByText(/root/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 4. New folder dialog → createFolder
// ---------------------------------------------------------------------------

describe("FilesPage — new folder", () => {
  it("creates a folder via the dialog", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/files/folder")) {
        return { id: "newf", name: "Reports", kind: "folder" }
      }
      if (opts.path.endsWith("/files")) return { items: ROOT }
      return {}
    })
    renderFiles(client)

    await screen.findByText("Documents")
    fireEvent.click(screen.getByRole("button", { name: /new folder/i }))

    const nameInput = await screen.findByLabelText(/folder name/i)
    fireEvent.change(nameInput, { target: { value: "Reports" } })
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }))

    await waitFor(() => {
      const createCall = request.mock.calls.find((c) =>
        (c[0] as RequestOpts).path.endsWith("/files/folder"),
      )
      expect(createCall).toBeTruthy()
      expect((createCall![0] as RequestOpts).body).toMatchObject({ name: "Reports" })
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Upload → uploadFile with base64
// ---------------------------------------------------------------------------

describe("FilesPage — upload", () => {
  it("reads a selected file and calls uploadFile with base64", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.path.endsWith("/files") && opts.method === "POST") {
        return { id: "up1", name: "hi.txt", kind: "file" }
      }
      if (opts.path.endsWith("/files")) return { items: ROOT }
      return {}
    })
    renderFiles(client)
    await screen.findByText("Documents")

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()

    const file = new File(["hello"], "hi.txt", { type: "text/plain" })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      const upCall = request.mock.calls.find(
        (c) =>
          (c[0] as RequestOpts).path.endsWith("/files") &&
          (c[0] as RequestOpts).method === "POST",
      )
      expect(upCall).toBeTruthy()
      const body = (upCall![0] as RequestOpts).body as {
        name: string
        dataBase64: string
      }
      expect(body.name).toBe("hi.txt")
      // base64 of "hello"
      expect(body.dataBase64).toBe("aGVsbG8=")
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Delete → deleteFile + refetch
// ---------------------------------------------------------------------------

describe("FilesPage — delete", () => {
  it("deletes a file after confirming and refetches", async () => {
    const { client, request } = makeClient((opts) => {
      if (opts.method === "DELETE") return undefined
      if (opts.path.endsWith("/files")) return { items: ROOT }
      return {}
    })
    renderFiles(client)
    await screen.findByText("readme.txt")

    // Open the delete confirm for the file row.
    fireEvent.click(screen.getByRole("button", { name: /delete readme\.txt/i }))
    // Confirm.
    fireEvent.click(screen.getByRole("button", { name: /^confirm delete$/i }))

    await waitFor(() => {
      const delCall = request.mock.calls.find(
        (c) => (c[0] as RequestOpts).method === "DELETE",
      )
      expect(delCall).toBeTruthy()
      expect((delCall![0] as RequestOpts).path).toContain("/files/file1")
    })
  })
})

// ---------------------------------------------------------------------------
// 7. Download → client.downloadFile(id)
// ---------------------------------------------------------------------------

describe("FilesPage — download", () => {
  it("clicking Download calls downloadFile with the file id", async () => {
    const { client } = makeClient(listHandler({ __root__: ROOT }))
    // Spy directly on the client method (the URL/anchor plumbing is jsdom-hostile).
    const dlSpy = vi
      .spyOn(client, "downloadFile")
      .mockResolvedValue({
        blob: new Blob(["x"]),
        filename: "readme.txt",
        contentType: "text/plain",
      })

    renderFiles(client)
    await screen.findByText("readme.txt")

    fireEvent.click(screen.getByRole("button", { name: /download readme\.txt/i }))

    await waitFor(() => expect(dlSpy).toHaveBeenCalledWith("file1"))
  })
})

// ---------------------------------------------------------------------------
// 8. 501 → not-configured state
// ---------------------------------------------------------------------------

describe("FilesPage — 501 handling", () => {
  it("renders a 'File storage not configured' state", async () => {
    const { client } = makeClient(() => {
      throw new HttpTransportError(501, '{"error":"files not configured"}')
    })
    renderFiles(client)
    await screen.findByText(/file storage not configured/i)
  })
})

void FilesPage
