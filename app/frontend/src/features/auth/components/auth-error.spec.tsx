import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthError } from "./auth-error";

describe("AuthError", () => {
  it("renders only the mapped message", () => {
    render(<AuthError message="Invalid email or password." />);

    expect(screen.getByText("Invalid email or password.")).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't complete that request")
    ).not.toBeInTheDocument();
  });

  it("renders nothing without a message", () => {
    const { container } = render(<AuthError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
