export function formatCop(amount: string) {
  const [whole = "0", decimals = "00"] = amount.split(".");
  const grouped = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(BigInt(whole));
  return `$ ${grouped},${decimals.padEnd(2, "0")}`;
}

export function amountToCanonical(value: string) {
  const input = value.trim();
  let whole: string;
  let fraction: string;
  if (input.includes(",")) {
    const grouped = /^(?:\d+|\d{1,3}(?:\.\d{3})+),(\d{1,2})$/.exec(input);
    if (!grouped) return null;
    const commaAt = input.lastIndexOf(",");
    whole = input.slice(0, commaAt).replace(/\./g, "");
    fraction = input.slice(commaAt + 1);
  } else if (input.includes(".")) {
    if (!/^\d+\.\d{1,2}$/.test(input)) return null;
    [whole, fraction] = input.split(".");
  } else {
    if (!/^\d+$/.test(input)) return null;
    whole = input;
    fraction = "";
  }
  const wholeValue = BigInt(whole);
  const decimals = fraction.padEnd(2, "0");
  const cents = wholeValue * 100n + BigInt(decimals);
  if (cents <= 0n || cents > 99_999_999_999_999n) return null;
  return `${wholeValue.toString()}.${decimals}`;
}
