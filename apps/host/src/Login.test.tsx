import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { Login } from "./Login"

describe("Login", () => {
  it("submits the entered username/password to onLogin", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<Login onLogin={onLogin} />)

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("alice", "hunter2")
    })
  })

  it("shows an error message when onLogin rejects", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("HTTP 401: invalid credentials"))
    render(<Login onLogin={onLogin} />)

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } })
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByText("HTTP 401: invalid credentials")).toBeInTheDocument()
  })

  it("does not show an error before any submission", () => {
    render(<Login onLogin={vi.fn()} />)
    expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument()
  })
})
