export const MAX_MONEY = 99999999999999n;
export class PaymentFault extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function amount(value: string): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(value)
  )
    throw new PaymentFault(422, "VALIDATION_ERROR");
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n || minor > MAX_MONEY)
    throw new PaymentFault(422, "VALIDATION_ERROR");
  return minor;
}
export function money(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function ensureFunds(
  balance: bigint,
  reserved: bigint,
  requested: bigint,
) {
  if (balance - reserved < requested)
    throw new PaymentFault(409, "INSUFFICIENT_FUNDS");
}
export function ensureCredit(balance: bigint, credit: bigint) {
  if (balance + credit > MAX_MONEY)
    throw new PaymentFault(409, "BALANCE_LIMIT_EXCEEDED");
}
