import { describe, expect, test } from "bun:test";
import { greet, add } from "./utils";

describe("utils", () => {
  test("greet returns greeting message", () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  test("add returns sum of two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
