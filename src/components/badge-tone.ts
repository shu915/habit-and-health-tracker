// 時間帯のバッジの色(食事と運動で共有する。片方だけ直して食い違わないよう、ここに1か所だけ置く)。
// 色は globals.css の変数で、ダークモードもそちらが切り替える。角は rounded-sm(6px)
export const BADGE_BASE = "inline-block rounded-sm px-2.5 py-0.5 text-xs font-bold";

export const BADGE_TONE = {
  morning: "bg-badge-morning text-badge-morning-ink",
  noon: "bg-badge-noon text-badge-noon-ink",
  evening: "bg-badge-evening text-badge-evening-ink",
  snack: "bg-badge-snack text-badge-snack-ink",
  night: "bg-badge-night text-badge-night-ink",
} as const;
