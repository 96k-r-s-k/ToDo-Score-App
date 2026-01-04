// utils/date.ts

export const todayKey = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const isFutureDay = (
  dayKey: string,
  today: string = todayKey()
): boolean => {
  // YYYY-MM-DD は文字列比較で日付順になる
  return dayKey > today;
};
