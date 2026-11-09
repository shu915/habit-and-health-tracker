// 食事の AI 推定の、1 日あたりの上限(回数)。ai-limit.ts が使う。DB にも env にも触れない、値を決めるだけの関数。
// 環境変数 MEAL_ESTIMATE_DAILY_LIMIT(1 以上の整数)があれば、その値。無い・読めないときは、
//   - 開発サーバー(NODE_ENV=development): 上限なし(Infinity)。手で試すとき、10 回では足りないため
//   - それ以外(本番・テスト): 10 回(悪用と費用の膨らみを防ぐ保険。公開前に、この値と全体の費用の上限を決める)
export const DEFAULT_DAILY_LIMIT = 10;

export function resolveDailyLimit(env: { NODE_ENV?: string; MEAL_ESTIMATE_DAILY_LIMIT?: string }): number {
  const raw = env.MEAL_ESTIMATE_DAILY_LIMIT?.trim();
  if (raw !== undefined && /^[1-9]\d{0,8}$/.test(raw)) return Number(raw);
  return env.NODE_ENV === "development" ? Number.POSITIVE_INFINITY : DEFAULT_DAILY_LIMIT;
}
