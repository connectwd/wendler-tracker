import { describe, it, expect } from "vitest";
import {
  encodeConnectionCode,
  decodeConnectionCode,
  ConnectionCodeError,
  type ConnectionCodePayload,
} from "./connectionCode";
import { utf8ToBase64 } from "./base64";

const payload: ConnectionCodePayload = {
  owner: "jake",
  repo: "wendler-data",
  path: "wendler-data.json",
  token: "github_pat_abc123",
};

describe("encodeConnectionCode / decodeConnectionCode", () => {
  it("round-trips a full payload", () => {
    expect(decodeConnectionCode(encodeConnectionCode(payload))).toEqual(
      payload,
    );
  });

  it("round-trips values containing unicode - e.g. a repo/owner name with non-ASCII characters", () => {
    const unicodePayload: ConnectionCodePayload = {
      ...payload,
      repo: "wendler-données-🏋️",
    };
    expect(decodeConnectionCode(encodeConnectionCode(unicodePayload))).toEqual(
      unicodePayload,
    );
  });

  it("tolerates the code being pasted with surrounding whitespace/newlines", () => {
    const code = `  ${encodeConnectionCode(payload)}\n`;
    expect(decodeConnectionCode(code)).toEqual(payload);
  });

  it("rejects a code that is not valid base64 at all", () => {
    expect(() => decodeConnectionCode("definitely not a code!!!")).toThrow(
      ConnectionCodeError,
    );
    expect(() => decodeConnectionCode("definitely not a code!!!")).toThrow(
      /valid connection code/i,
    );
  });

  it("rejects base64 that decodes to something that is not JSON", () => {
    const notJson = utf8ToBase64("this is plain text, not json");
    expect(() => decodeConnectionCode(notJson)).toThrow(ConnectionCodeError);
    expect(() => decodeConnectionCode(notJson)).toThrow(
      /valid connection code/i,
    );
  });

  it("rejects valid JSON that is missing a required field", () => {
    for (const missing of ["owner", "repo", "path", "token"] as const) {
      const rest: Record<string, unknown> = { ...payload };
      delete rest[missing];
      const code = utf8ToBase64(JSON.stringify(rest));
      expect(() => decodeConnectionCode(code)).toThrow(ConnectionCodeError);
      expect(() => decodeConnectionCode(code)).toThrow(
        /missing some required fields/i,
      );
    }
  });

  it("rejects a required field of the wrong type", () => {
    const code = utf8ToBase64(JSON.stringify({ ...payload, token: 12345 }));
    expect(() => decodeConnectionCode(code)).toThrow(ConnectionCodeError);
  });

  it("rejects JSON that decodes to a non-object (e.g. a bare array or string)", () => {
    expect(() =>
      decodeConnectionCode(utf8ToBase64(JSON.stringify(["a", "b"]))),
    ).toThrow(ConnectionCodeError);
    expect(() =>
      decodeConnectionCode(utf8ToBase64(JSON.stringify("just a string"))),
    ).toThrow(ConnectionCodeError);
    expect(() =>
      decodeConnectionCode(utf8ToBase64(JSON.stringify(null))),
    ).toThrow(ConnectionCodeError);
  });

  it("ignores extra unexpected fields rather than rejecting the code", () => {
    const code = utf8ToBase64(
      JSON.stringify({ ...payload, extra: "whatever" }),
    );
    expect(decodeConnectionCode(code)).toEqual(payload);
  });
});
