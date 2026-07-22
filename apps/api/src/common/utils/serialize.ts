/**
 * Deep-convert BigInt values to Numbers so Express can JSON-serialize
 * Prisma results. Safe: ids and money minor units stay well below
 * Number.MAX_SAFE_INTEGER by design (13 integer digits max).
 */
export function deepSerialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value) as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => deepSerialize(v)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSerialize(v);
    }
    return out as T;
  }
  return value;
}
