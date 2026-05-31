export function formatMoney(value: string | number): string {
  const number = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(number) ? number : 0);
}

export function absoluteMoney(value: string | number): string {
  return formatMoney(Math.abs(Number(value)));
}

