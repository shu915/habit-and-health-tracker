// その日の計算(運動の消費・基礎代謝)に使う体重の決め方。
// その日の朝の体重 → なければ、その日以前でいちばん新しい朝の体重 → なければ、プロフィールの体重。
// 朝の体重は日ごとに手で入れるので、これが「その日のスタンプ」になる(直せば、その日の数字も更新される)。
// 体脂肪率も同じ決め方(pickMeasure)。目標カロリー・活動係数は、日の行に写してある(lib/day-row.ts)
// earlierDate: 「それ以前の最新」を使ったときの、その体重を測った日(画面に出どころを示すため)
export type DayWeight = { kg: number | null; source: "morning" | "earlier" | "profile" | null; earlierDate: string | null };

export function pickWeight(morning: string | null, earlier: { weight: string; date: string } | null, profile: string | null): DayWeight {
  if (morning !== null) return { kg: Number(morning), source: "morning", earlierDate: null };
  if (earlier !== null) return { kg: Number(earlier.weight), source: "earlier", earlierDate: earlier.date };
  if (profile !== null) return { kg: Number(profile), source: "profile", earlierDate: null };
  return { kg: null, source: null, earlierDate: null };
}

// 体重と同じ決め方の、体脂肪率(%)版
export type DayMeasure = { value: number | null; source: "morning" | "earlier" | "profile" | null; earlierDate: string | null };

export function pickMeasure(morning: string | null, earlier: { weight: string; date: string } | null, profile: string | null): DayMeasure {
  const picked = pickWeight(morning, earlier, profile);
  return { value: picked.kg, source: picked.source, earlierDate: picked.earlierDate };
}
