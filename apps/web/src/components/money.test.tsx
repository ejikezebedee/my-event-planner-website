import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MoneyInput, MoneyText } from "./money";

describe("MoneyText", () => {
  it("formats minor units as currency", () => {
    render(<MoneyText minor={125000} currency="EUR" />);
    expect(screen.getByText(/1\.250,00/)).toBeInTheDocument();
  });

  it("renders zero safely", () => {
    render(<MoneyText minor={0} currency="EUR" />);
    expect(screen.getByText(/0,00/)).toBeInTheDocument();
  });
});

describe("MoneyInput", () => {
  it("emits integer minor units — never floats", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "12.34" } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it("accepts comma decimals", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "7,50" } });
    expect(onChange).toHaveBeenLastCalledWith(750);
  });

  it("rejects invalid input without emitting", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalledWith(expect.any(Number));
  });
});
