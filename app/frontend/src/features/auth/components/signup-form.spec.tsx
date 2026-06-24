import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignupForm } from "./signup-form";

const replace = vi.fn();
const signUp = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace })
}));

vi.mock("../auth-store", () => ({
  signUp: (...args: unknown[]) => signUp(...args)
}));

describe("SignupForm", () => {
  beforeEach(() => {
    replace.mockReset();
    signUp.mockReset();
    signUp.mockResolvedValue(undefined);
  });

  it("blocks a weak password before sending a request", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "password1234"
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Your password must meet every requirement below.")
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends only displayName, email, and password after policy validation", async () => {
    const user = userEvent.setup();
    const password = "orbit lantern velvet meadow 47";
    render(<SignupForm />);

    await user.type(screen.getByLabelText("Name"), " Ada Lovelace ");
    await user.type(screen.getByLabelText("Email"), "ADA@EXAMPLE.COM");
    await user.type(screen.getByLabelText("Password"), password);
    await user.type(screen.getByLabelText("Confirm password"), password);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith(
        "Ada Lovelace",
        "ada@example.com",
        password
      );
    });
    expect(signUp.mock.calls[0]).toHaveLength(3);
    expect(replace).toHaveBeenCalledWith("/app");
  });
});
