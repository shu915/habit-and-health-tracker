import { connection } from "next/server";
import { recordWaistAction } from "@/app/(app)/profile/actions";
import { WaistReminderForm } from "@/components/waist-reminder-form";
import { todayString } from "@/lib/date";
import { getProfile } from "@/lib/profiles";
import { isWaistDue } from "@/lib/waist-reminder";

// ダッシュボードの上に出す、ウエストの月末の催促。月末の 3 日間で、今月まだウエストを保存していないときだけ出る。
// 「今日」はサーバーの日付(利用者のタイムゾーンは分からない)なので、月の境目では数時間ずれることがある
export async function WaistReminder() {
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  const profile = await getProfile();
  if (!isWaistDue(todayString(), profile.waistMeasuredOn)) return null;

  return (
    <section aria-label="ウエストの更新" className="flex flex-col gap-2 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-900">
      <p className="text-sm font-medium">月末です。ウエストを測って、更新してください。</p>
      <p className="text-xs text-zinc-500">おへその高さで測ります。前と同じ値でも、そのまま「保存」を押すと、今月は測ったことになります。</p>
      <WaistReminderForm current={profile.currentWaistCm} action={recordWaistAction} />
    </section>
  );
}
