import "server-only";
import { redirect } from "next/navigation";
import { getDay } from "@/lib/days";
import { isProfileReady } from "@/lib/profile-ready";
import { getProfile } from "@/lib/profiles";

// 記録を始めるための入口。その日の行がまだ無いのに、目標カロリーか活動係数が未設定なら、プロフィールの編集へ送る
// (redirect は例外を投げるので、try/catch で囲まない)。日の行を作ると、プロフィールの値を写して固定するため(lib/day-row.ts)。
// 行がすでにある日は塞がない(新しく作らないので、既存の日の編集や、その日への追加はできる)。
// 日の行を作る画面(朝の記録・食事の追加・運動の追加・良かったこと・今日の気づき)と、その保存の Server Action が呼ぶ。保存関数(saveDay など)自体は塞がない
export async function requireRecordingProfile(date: string): Promise<void> {
  if (isProfileReady(await getProfile())) return;
  if ((await getDay(date)) === null) redirect("/profile/edit");
}
