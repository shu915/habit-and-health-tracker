import { sql } from "drizzle-orm";
import { MEAL_DAY_START_HOUR } from "@/lib/meal-time";

// 今の食事の日(03:00 区切り)の始まりの時刻(DB の now() で出す。アプリと DB のタイムゾーンの違いに左右されない)。
// 「1 日」の回数制限(食事の推定・随時レポート)が、「今日」を数える区切りに使う。例: 02:00 なら前の日の 03:00、10:00 なら今日の 03:00
export const startOfMealDay = sql`date_trunc('day', now() - make_interval(hours => ${MEAL_DAY_START_HOUR})) + make_interval(hours => ${MEAL_DAY_START_HOUR})`;
