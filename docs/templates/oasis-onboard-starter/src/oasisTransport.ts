/**
 * Minimal ONODE response parsing (same shape family as full apps: result/Result, isError).
 */

export function extractOasisData(response: unknown): unknown {
  return (response as { data?: unknown })?.data ?? response;
}

function toOasisRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

export function extractOasisResult<T>(response: unknown): T {
  const data = extractOasisData(response);
  const dataRecord = toOasisRecord(data);
  return (
    (dataRecord.result as { result?: T })?.result ??
    (dataRecord.Result as { Result?: T })?.Result ??
    (dataRecord.result as T) ??
    (dataRecord.Result as T) ??
    (data as T)
  );
}

export function isOasisError(response: unknown): boolean {
  const data = extractOasisData(response);
  const dataRecord = toOasisRecord(data);
  return (
    dataRecord.isError === true ||
    dataRecord.IsError === true ||
    (dataRecord.result as { isError?: boolean })?.isError === true ||
    (dataRecord.Result as { IsError?: boolean })?.IsError === true
  );
}

function firstString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      return c;
    }
  }
  return "";
}

export function extractOasisErrorMessage(
  response: unknown,
  fallback: string
): string {
  const data = extractOasisData(response);
  const dataRecord = toOasisRecord(data);
  const lower = toOasisRecord(dataRecord.result);
  const upper = toOasisRecord(dataRecord.Result);
  const msg = firstString(
    dataRecord.message,
    dataRecord.Message,
    lower.message,
    lower.Message,
    upper.message,
    upper.Message
  );
  return msg || fallback;
}
