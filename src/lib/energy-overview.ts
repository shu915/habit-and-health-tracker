import { activityLevelParts } from "@/lib/profile-options";
import { energySummary, type FormValues } from "@/lib/profile-suggest";
import type { BmrMethod } from "@/lib/nutrition";

// ダッシュボードに出す「1日の消費カロリーの目安」の内容。保存済みのプロフィールから、その場で計算する
// (消費カロリーは列に保存せず、身長・体重・活動係数などを直すと自動で変わる)

// プロフィールの行のうち、計算に使う項目(DB の型: numeric は文字列、integer は数値)
export type ProfileEnergyInput = {
  gender: string | null;
  age: number | null;
  heightCm: string | null;
  currentWeightKg: string | null;
  currentBodyFatPercent: string | null;
  activityLevel: string | null;
  targetCalories: number | null;
};

export type EnergyOverview =
  | {
      kind: "ready";
      tdeeKcal: number; // 1 日の消費カロリーの目安
      bmrKcal: number;
      method: BmrMethod;
      activityLevel: number;
      activityName: string | null; // 選択肢にない係数のときは null
      targetCalories: number | null;
      targetDiffKcal: number | null; // 目標カロリー − 消費カロリー(マイナスなら、消費より少なく食べる目標)
    }
  | { kind: "needs-activity"; bmrKcal: number; method: BmrMethod } // 活動係数が未選択
  | { kind: "missing"; missing: string[] }; // 基礎代謝の計算に必要な項目が足りない

const text = (value: string | number | null) => (value === null ? "" : String(value));

export function energyOverview(profile: ProfileEnergyInput): EnergyOverview {
  const values: FormValues = {
    gender: text(profile.gender),
    age: text(profile.age),
    heightCm: text(profile.heightCm),
    currentWeightKg: text(profile.currentWeightKg),
    currentBodyFatPercent: text(profile.currentBodyFatPercent),
    activityLevel: text(profile.activityLevel),
  };
  const energy = energySummary(values);

  if (!energy.ok) return { kind: "missing", missing: energy.missing };
  if (energy.tdeeKcal === null || energy.activityLevel === null) {
    return { kind: "needs-activity", bmrKcal: energy.bmrKcal, method: energy.method };
  }

  return {
    kind: "ready",
    tdeeKcal: energy.tdeeKcal,
    bmrKcal: energy.bmrKcal,
    method: energy.method,
    activityLevel: energy.activityLevel,
    activityName: activityLevelParts(profile.activityLevel)?.name ?? null,
    targetCalories: profile.targetCalories,
    targetDiffKcal: profile.targetCalories === null ? null : profile.targetCalories - energy.tdeeKcal,
  };
}
