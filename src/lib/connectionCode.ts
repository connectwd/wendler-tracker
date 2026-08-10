import { utf8ToBase64, base64ToUtf8 } from './base64';

export class ConnectionCodeError extends Error {}

export interface ConnectionCodePayload {
  owner: string;
  repo: string;
  path: string;
  token: string;
}

/**
 * Encodes a sync config into one copy-pasteable string. This is encoding for
 * transport convenience, NOT encryption - the code contains the access token
 * in a form anyone can decode in one line of JS. It's exactly as sensitive
 * as the token itself.
 */
export function encodeConnectionCode(config: ConnectionCodePayload): string {
  return utf8ToBase64(JSON.stringify(config));
}

export function decodeConnectionCode(code: string): ConnectionCodePayload {
  let json: string;
  try {
    json = base64ToUtf8(code.trim());
  } catch {
    throw new ConnectionCodeError("That doesn't look like a valid connection code.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ConnectionCodeError("That doesn't look like a valid connection code.");
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).owner !== 'string' ||
    typeof (parsed as Record<string, unknown>).repo !== 'string' ||
    typeof (parsed as Record<string, unknown>).path !== 'string' ||
    typeof (parsed as Record<string, unknown>).token !== 'string'
  ) {
    throw new ConnectionCodeError("That code is missing some required fields - it may be corrupted or incomplete.");
  }
  const p = parsed as ConnectionCodePayload;
  return { owner: p.owner, repo: p.repo, path: p.path, token: p.token };
}
