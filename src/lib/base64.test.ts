import { describe, it, expect } from "vitest";
import { utf8ToBase64, base64ToUtf8 } from "./base64";

describe("utf8ToBase64 / base64ToUtf8", () => {
  it("round-trips plain ASCII", () => {
    const text = "owner/repo-name_123";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("round-trips characters outside Latin1 - the whole reason this exists instead of plain btoa/atob", () => {
    const text = "5/3/1 tracker – données 日本語 🏋️‍♂️";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("round-trips an empty string", () => {
    expect(base64ToUtf8(utf8ToBase64(""))).toBe("");
  });

  it("round-trips something resembling a real GitHub fine-grained PAT", () => {
    const token = "github_pat_11ABCDEFG0123456789_" + "a".repeat(70);
    expect(base64ToUtf8(utf8ToBase64(token))).toBe(token);
  });

  it("base64ToUtf8 tolerates surrounding/embedded whitespace, matching how a person might paste a code", () => {
    const encoded = utf8ToBase64("hello world");
    const withWhitespace = ` ${encoded.slice(0, 4)}\n${encoded.slice(4)} `;
    expect(base64ToUtf8(withWhitespace)).toBe("hello world");
  });

  it("base64ToUtf8 throws on input that is not valid base64", () => {
    expect(() => base64ToUtf8("not valid base64!!! ###")).toThrow();
  });
});
