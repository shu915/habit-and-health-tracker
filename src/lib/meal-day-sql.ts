import { sql, type SQL } from "drizzle-orm";
import { MEAL_DAY_START_HOUR } from "@/lib/meal-time";
import { APP_TIME_ZONE } from "@/lib/time-zone";

// 今の食事の日(日本時間の 03:00 区切り)の始まりの時刻。「1 日」の回数制限(食事の推定・随時レポート)が、「今日」を数える区切りに使う。
// 例(日本時間): 02:00 なら前の日の 03:00、10:00 なら今日の 03:00。
// 時計は DB の now() だけを使う(アプリのタイムゾーンに左右されない)。now() を日本時間の壁時計にして、区切りを出し、
// DB の列(created_at。timestamp without time zone で、UTC の壁時計で入っている前提。Docker・CI・Neon の既定は UTC)と比べられるよう、UTC の壁時計に戻す。
// 比べる列が UTC でないと、区切りが 9 時間ずれる(DB のテストが、タイムゾーンの設定を確かめる)
export const mealDayStartAt = (now: SQL): SQL =>
  sql`((date_trunc('day', (${now} AT TIME ZONE ${APP_TIME_ZONE}) - make_interval(hours => ${MEAL_DAY_START_HOUR})) + make_interval(hours => ${MEAL_DAY_START_HOUR})) AT TIME ZONE ${APP_TIME_ZONE}) AT TIME ZONE 'UTC'`;

export const startOfMealDay = mealDayStartAt(sql`now()`);
