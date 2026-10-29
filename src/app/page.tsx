// メインダッシュボード: 日付ごとに1行。行をクリックすると /days/[date] の詳細へ
// 期間の絞り込み・ページネーションは未実装(全期間を表示する)
const COLUMNS = ["日付", "体重", "睡眠", "カロリー", "日記"];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">ダッシュボード</h1>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-zinc-500">
                まだ記録がありません。「新規入力」から追加してください。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
