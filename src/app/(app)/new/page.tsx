// 新規入力: 1ページに全項目を記入する。各セクションの中身は未実装
const SECTIONS = [
  "デフォルトの3食(朝・昼・晩)",
  "追加の食事",
  "運動量",
  "ポジティブ3行日記",
  "自由記入欄",
];

export default function NewPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">新規入力</h1>
      <div className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <section
            key={section}
            className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
          >
            <h2 className="font-medium">{section}</h2>
            <p className="text-sm text-zinc-500">未実装</p>
          </section>
        ))}
      </div>
    </div>
  );
}
