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
  it("applies variant class to the button element", () => {
    const { container } = render(<Button variant="destructive">Delete</Button>)
    const btn = container.querySelector("button")
    expect(btn).toBeTruthy()
    // Base UI Button always renders a <button>; variant classes are applied via data-slot
    expect(btn!.getAttribute("data-slot")).toBe("button")
    expect(btn!.className).toMatch(/destructive/)
  })
  it("renders with ghost variant (hover-muted class applied)", () => {
    render(<Button variant="ghost" size="icon">X</Button>)
    const btn = screen.getByRole("button", { name: "X" })
    expect(btn.tagName).toBe("BUTTON")
    // ghost variant uses hover:bg-muted (no literal "ghost" in className — CVA resolves to utilities)
    expect(btn.className).toMatch(/hover:bg-muted/)
  })
})

describe("Badge", () => {
  it("renders text inside a <span>", () => {
    render(<Badge>New</Badge>)
    const el = screen.getByText("New")
    expect(el.tagName).toBe("SPAN")
  })
  it("variant prop applies a class", () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/destructive/)
  })
  it("default variant applies primary classes", () => {
    const { container } = render(<Badge>Tag</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/bg-primary/)
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
  it("applies data-slot attribute", () => {
    const { container } = render(<Card>body</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute("data-slot")).toBe("card")
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
  it("has role=alert", () => {
    render(<Alert>content</Alert>)
    expect(screen.getByRole("alert")).toBeTruthy()
  })
  it("destructive variant applies destructive class", () => {
    const { container } = render(<Alert variant="destructive">Oops</Alert>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toMatch(/destructive/)
  })
})
