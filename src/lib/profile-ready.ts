// 記録を始められるプロフィールか: 目標カロリーと活動係数が決まっていること。
// この 2 つは、日の行を作るときに行へ写して固定する値(lib/day-row.ts)。空のまま記録した日は固定されず、あとでプロフィールを直すたびに数字が動くため、先に決めてもらう
export function isProfileReady(profile: { targetCalories: number | null; activityLevel: string | null }): boolean {
  return profile.targetCalories !== null && profile.activityLevel !== null;
}
