import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { cn } from "./lib/utils"
import { Button } from "./components/ui/button"
import { Badge } from "./components/ui/badge"
import { Card, CardTitle, CardContent } from "./components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"

describe("cn utility", () => {
  it("merges class names and filters falsy values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c")
  })
  it("resolves tailwind-merge conflicts (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })
})

describe("Button", () => {
  it("renders children inside a <button>", () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole("button", { name: "Click me" })
    expect(btn.tagName).toBe("BUTTON")
  })
  it("with asChild renders the child element (e.g. <a>)", () => {
    render(
      <Button asChild>
        <a href="/home">Go home</a>
      </Button>
    )
    const link = screen.getByRole("link", { name: "Go home" })
    expect(link.tagName).toBe("A")
  })
})

describe("Badge", () => {
  it("renders text", () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText("New")).toBeTruthy()
  })
  it("variant prop applies a class", () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/destructive/)
  })
})

describe("Card", () => {
  it("renders nested CardTitle and CardContent text", () => {
    render(
      <Card>
        <CardTitle>My Title</CardTitle>
        <CardContent>Some content</CardContent>
      </Card>
    )
    expect(screen.getByText("My Title")).toBeTruthy()
    expect(screen.getByText("Some content")).toBeTruthy()
  })
})

describe("Alert", () => {
  it("renders AlertTitle and AlertDescription text", () => {
    render(
      <Alert>
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>Something happened.</AlertDescription>
      </Alert>
    )
    expect(screen.getByText("Heads up!")).toBeTruthy()
    expect(screen.getByText("Something happened.")).toBeTruthy()
  })
})
