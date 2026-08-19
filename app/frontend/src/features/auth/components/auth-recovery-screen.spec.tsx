import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthRecoveryScreen } from "./auth-recovery-screen";

describe("AuthRecoveryScreen", () => {
  it("renders one generic recovery message without a speculative cause", () => {
    render(<AuthRecoveryScreen onRetry={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load this page."
    );
    expect(
      screen.queryByText("Check your connection and try again.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't verify your session.")
    ).not.toBeInTheDocument();
  });

  it("accepts one contextual message and invokes Retry", () => {
    const onRetry = vi.fn();

    render(
      <AuthRecoveryScreen
        message="We couldn't finish signing you in."
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't finish signing you in."
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
