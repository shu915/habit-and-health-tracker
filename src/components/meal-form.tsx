"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { deleteMealAction, estimateMealAction, saveMealAction, updateMealAction, type SaveMealResult } from "@/app/(app)/days/[date]/meals/actions";
import { buttonClass } from "@/components/button";
import { FormActions } from "@/components/form-actions";
import { MealBadge } from "@/components/meal-badge";
import { PairInput, timeParts } from "@/components/pair-input";
import { ProcessingPanel } from "@/components/processing-indicator";
import { joinTimeOfDay } from "@/lib/duration";
import { resizeImageToDataUrl } from "@/lib/image-resize";
import type { MealEstimate } from "@/lib/meal-estimate";
import { MAX_PHOTOS, TEXT_MAX_LENGTH } from "@/lib/meal-limits";
import { defaultMealDayAndTime, mealLabel, MEAL_DAY_START_HOUR } from "@/lib/meal-time";
import { shiftDate, todayString } from "@/lib/date";

// 食事を入力して、AI に推定させ、確認して、保存する画面。
//   1. 食べた時刻・食べたもの(文章)・写真(任意)を入れて「AI で推定する」
//   2. 推定(料理名・内訳・合計)を確認する。数字は直接直せない。違うときは、説明を直して「推定し直す」
//   3. 合っていたら「この内容で保存」。保存は、ここで押したときだけ(推定しただけでは何も保存されない)
// 写真は保存しない(推定にだけ使う)。ブラウザ側で縮小して送る。

const subscribeNothing = () => () => {};

type Props = {
  date: string;
  mode: "new" | "edit";
  mealId?: number; // 編集のときの食事の id
  initial?: { eatenTime: string; estimate: MealEstimate }; // 編集のときの、保存済みの値
};

type Photo = { id: number; dataUrl: string };

export function MealForm({ date, mode, mealId, initial }: Props) {
  // 追加のときの時刻の初期値は、端末の今の時刻(サーバーには分からないので、ブラウザ側で決める)。
  // 03:00 より前は前の日の食事なので、この画面の日付が、その「前の日」のときだけ初期値を入れる
  const defaultTime = useSyncExternalStore(
    subscribeNothing,
    () => (initial ? initial.eatenTime : defaultMealDayAndTime().date === date ? defaultMealDayAndTime().time : ""),
    () => (initial ? initial.eatenTime : ""),
  );
  // 午前 3 時より前に、今日(カレンダーの日付)の画面で追加しようとしているとき、前の日の日付。それ以外は空。
  // 深夜の食事は前の日の記録なので、案内を出す(勝手には移さない: 本当に今日の早朝の食事かもしれない)
  const previousDay = useSyncExternalStore(
    subscribeNothing,
    () => {
      const now = new Date();
      return mode === "new" && now.getHours() < MEAL_DAY_START_HOUR && todayString(now) === date ? shiftDate(date, -1) : "";
    },
    () => "",
  );
  const [chosenTime, setChosenTime] = useState<string | null>(null); // 本人が入れた時刻。入れるまでは初期値
  const time = chosenTime ?? defaultTime;

  const [text, setText] = useState(initial?.estimate.description ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]); // 最大 4 枚(同じ食事の別の角度や、別の皿)
  const nextPhotoId = useRef(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null); // 同じ写真をまとめたことなどの、エラーではない知らせ
  const [resizing, setResizing] = useState(false);

  const [estimate, setEstimate] = useState<MealEstimate | null>(initial?.estimate ?? null);
  const [estimatedText, setEstimatedText] = useState(initial?.estimate.description ?? ""); // 推定したときの説明(直したかどうかを見る)
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [saveErrors, setSaveErrors] = useState<SaveMealResult["errors"]>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [estimating, startEstimate] = useTransition();
  const [saving, startSave] = useTransition();

  const busy = estimating || saving || resizing;
  // 推定の結果(や失敗のメッセージ)は、ボタンの下に出るので、画面の外に隠れて気づかれない。出たときに、その先頭へ画面を動かす。
  // 結果は、推定が終わったときだけ(編集の画面を開いたときに、もともとある結果へは動かさない)。関数の形を変えない(useCallback)ので、出た 1 回だけ動く。
  // 動きを減らす設定のときは、滑らせない
  const scrollResultNext = useRef(false);
  const showWhenAppears = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, []);
  const showResultWhenAppears = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !scrollResultNext.current) return;
      scrollResultNext.current = false;
      showWhenAppears(node);
    },
    [showWhenAppears],
  );
  const descriptionChanged = estimate !== null && text.trim() !== estimatedText.trim();
  const timeIsValid = mealLabel(time) !== null;
  const canEstimate = !busy && (text.trim() !== "" || photos.length > 0);
  const canSave = estimate !== null && !descriptionChanged && timeIsValid && !busy;

  // 選んだ写真を、順に縮小して足す(一度に何枚か選べる)。4 枚を超える分は足さず、理由を出す
  async function handlePhotos(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    let error: string | null = chosen.length > room ? `写真は ${MAX_PHOTOS} 枚までです。${room} 枚だけ足しました。` : null;

    setPhotoError(null);
    setPhotoNote(null);
    setResizing(true);
    const added: Photo[] = [];
    for (const file of chosen.slice(0, room)) {
      const result = await resizeImageToDataUrl(file);
      if (result.ok) added.push({ id: nextPhotoId.current++, dataUrl: result.dataUrl });
      else error = result.message;
    }
    setResizing(false);

    // 同じ写真(縮小した結果が同じ)は、足さない。同じ写真を何枚付けても、1 回分として扱う
    const known = new Set(photos.map((photo) => photo.dataUrl));
    const fresh = added.filter((photo) => {
      if (known.has(photo.dataUrl)) return false;
      known.add(photo.dataUrl);
      return true;
    });
    setPhotos((current) => [...current, ...fresh].slice(0, MAX_PHOTOS));
    setPhotoNote(fresh.length < added.length ? "同じ写真は、1 枚にまとめました。" : null);
    setPhotoError(error);
  }

  function handleEstimate() {
    setEstimateError(null);
    startEstimate(async () => {
      const result = await estimateMealAction({ text, imageDataUrls: photos.map((photo) => photo.dataUrl) });
      if (!result.ok) {
        setEstimateError(result.message);
        return;
      }
      scrollResultNext.current = true; // 次に結果が出たとき、そこへ画面を動かす
      setEstimate(result.estimate);
      setText(result.estimate.description); // 整えられた説明に置き換える(直して推定し直せる)
      setEstimatedText(result.estimate.description);
    });
  }

  function handleSave() {
    if (!estimate) return;
    setSaveErrors({});
    // 合計は送らない(保存する側が、内訳から計算し直す)
    const payload = { eatenTime: time, estimate: { dishName: estimate.dishName, description: estimate.description, items: estimate.items } };
    startSave(async () => {
      const result = mode === "edit" && mealId !== undefined ? await updateMealAction(mealId, payload) : await saveMealAction(date, payload);
      setSaveErrors(result.errors); // 成功すると、サーバーが移動させるので、ここへは戻らない
    });
  }

  function handleDelete() {
    if (mealId === undefined) return;
    startSave(async () => {
      await deleteMealAction(mealId);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {previousDay !== "" && !estimate && (
        <p role="note" className="rounded-lg bg-badge-morning px-4.5 py-3.5 text-sm leading-relaxed text-badge-morning-ink">
          午前 {MEAL_DAY_START_HOUR} 時より前です。深夜の食事は、前の日({previousDay})の記録として入れます。{" "}
          <Link href={`/days/${previousDay}/meals/new`} className="font-medium underline">
            {previousDay} に追加する
          </Link>
        </p>
      )}
      <fieldset disabled={estimating || saving} className="flex min-w-0 flex-col gap-5 rounded-lg bg-surface-raised p-4 sm:p-5">
        <div className="grid items-start gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
          <label htmlFor="meal-time" className="pt-2 text-ink-muted">
            食べた時刻
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* 初期値が決まったとき(サーバーの空 → ブラウザの今の時刻)に、入力欄を作り直す */}
              <PairInput
                key={defaultTime}
                id="meal-time"
                name="eatenTime"
                label="食べた時刻"
                units={["時", "分"]}
                initial={timeParts(defaultTime)}
                join={joinTimeOfDay}
                placeholders={["12", "30"]}
                onValue={setChosenTime}
                error={saveErrors.eatenTime}
                errorId="meal-time-error"
              />
              <MealBadge time={time} />
            </div>
            {/* 時刻が空・不正だと保存できないので、理由を出す(別の日の食事は、初期値が空) */}
            {(estimate !== null || chosenTime !== null) && !timeIsValid && (
              <p role="alert" className="text-xs text-badge-morning-ink">
                食べた時刻を入れてください(時は 0〜26、分は 0〜59)。入れると、保存できます。
              </p>
            )}
            <p className="text-xs text-ink-muted">深夜(午前 3 時まで)の食事は、前の日の記録として、24 時以降(例: 25 時 30 分)で入れます。</p>
            {saveErrors.eatenTime && (
              <p id="meal-time-error" className="text-xs text-red-600 dark:text-red-400">
                {saveErrors.eatenTime}
              </p>
            )}
          </div>
        </div>

        <div className="grid items-start gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
          <label htmlFor="meal-text" className="pt-2 text-ink-muted">
            {estimate ? "説明" : "食べたもの"}
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <textarea
              id="meal-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={estimate ? 5 : 4}
              maxLength={TEXT_MAX_LENGTH}
              placeholder="例: 焼鮭1切れ(グリル)、白ご飯茶碗1杯、わかめのみそ汁(大きさ・量や、調理法・油・砂糖の使い方が分かれば書く)"
              className="w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-[15px] text-ink leading-[1.8]"
            />
            {estimate ? (
              <p className="text-xs text-ink-muted">AI が読み取った内容です。違うところ(量、品目、食べなかったもの)を直して「推定し直す」を押すと、数字が計算し直されます。</p>
            ) : (
              <>
                <p className="text-xs text-ink-muted">文章か写真のどちらか(両方でもよい)を入れます。</p>
                {/* 長い説明は折りたたむ(開けば読める。入力の邪魔にしない) */}
                <details className="text-xs text-ink-muted">
                  <summary className="cursor-pointer">書き方のヒント</summary>
                  <p className="mt-1.5 leading-relaxed">
                    重さ(g)が分かるときは、「鮭の切り身 1 切れで 80g」のように書くと、いちばん確実です(書いた重さをもとに計算します)。重さが分からないときは、「大きめ」より、長さ(cm)や個数のほうが伝わります(例: 「長さ 15cm の魚 4 匹」)。量は、器の種類(小鉢・茶碗・丼など)を書くと近づきます。写真に、箸や手を一緒に写すと、大きさが伝わります。写真では、油や砂糖の量が分かりません。大きさ(大きめ・小ぶり)や個数、調理法(フライパン・ノンフライヤー・揚げた、など)、油・砂糖を多く使ったかを書くと、その分を数字に入れます。書かないときは、標準的な(中央値の)大きさと、一般的な調理を仮定して、量の目安の欄と、品目の下に書きます。写真と文章が食い違うときは、文章を優先します。
                  </p>
                </details>
              </>
            )}
          </div>
        </div>

        <div className="grid items-start gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
          <label htmlFor="meal-photo" className="pt-2 text-ink-muted">
            写真
          </label>
          <div className="flex flex-col gap-2">
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="flex flex-col items-center gap-1">
                    <div role="img" aria-label={`選んだ写真 ${index + 1}`} style={{ backgroundImage: `url(${photo.dataUrl})` }} className="h-24 w-24 rounded-md bg-neutral bg-cover bg-center" />
                    <button
                      type="button"
                      onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}
                      aria-label={`写真 ${index + 1} を外す`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      外す
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {/* 入力欄そのものは見えなくして(sr-only)、下のボタン(ラベル)を押すと、写真を選べる。スマホでは、撮影か、写真ライブラリから選ぶ。一度に何枚か選べる */}
              <input
                id="meal-photo"
                type="file"
                accept="image/*"
                multiple
                disabled={resizing || photos.length >= MAX_PHOTOS}
                onChange={(event) => {
                  void handlePhotos(event.target.files);
                  event.target.value = ""; // 同じ写真を選び直せるように
                }}
                className="peer sr-only"
              />
              <label
                htmlFor="meal-photo"
                className={`${buttonClass({ variant: "secondary" })} inline-flex cursor-pointer items-center gap-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
              >
                <CameraIcon />
                {resizing ? "縮小しています…" : photos.length === 0 ? "写真を選ぶ" : photos.length >= MAX_PHOTOS ? `写真は ${MAX_PHOTOS} 枚までです` : "写真を追加"}
              </label>
              <span className="text-xs text-ink-muted">
                {photos.length} / {MAX_PHOTOS} 枚
              </span>
            </div>
            {photoNote && (
              <p role="status" className="text-xs text-ink-muted">
                {photoNote}
              </p>
            )}
            {photoError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {photoError}
              </p>
            )}
            {/* 残す一行: 保存しないこと(安心)と、写すものの注意(他の人の顔など)。残りは折りたたむ */}
            <p className="text-xs text-ink-muted">写真は保存しません(推定にだけ使います)。食べ物の写真だけを選んでください(他の人の顔や、個人が分かるものは、写さないでください)。</p>
            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer">写真について</summary>
              <div className="mt-1.5 flex flex-col gap-1.5 leading-relaxed">
                <p>最大 4 枚まで(同じ食事の別の角度や、別の皿)。スマホでは、撮影か、写真ライブラリから選べます。大きい写真は、このあと縮小して送ります。位置情報などは、縮小のときに取り除かれます。</p>
                <p>パッケージの栄養成分表示(栄養の表)の写真だけでも推定できます。表があれば、その数値をもとにするので、いちばん正確です。このときは、食べ物そのものの写真は要りません。</p>
              </div>
            </details>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        {descriptionChanged && !estimating && <span className="text-xs text-badge-morning-ink">説明を変えました。「推定し直す」を押してから、保存してください。</span>}
        {/* 進み具合の枠は、ボタンの行のすぐ上に、最初から置く(同じ大きさのまま、中身だけが変わる)。下に出すと、画面の外に隠れて気づかれず、出たときに画面もずれる */}
        <ProcessingPanel active={estimating} hasPhoto={photos.length > 0} />
        <FormActions>
          {/* 下の保存の行が出ていないとき(推定する前と、推定し直している間)は、ここにキャンセルを置く */}
          {!(estimate && !estimating) && (
            <Link href={`/days/${date}`} className={buttonClass({ variant: "secondary", size: "action" })}>
              キャンセル
            </Link>
          )}
          {/* 推定したあと、説明を変えていない間は、決定ではない(決定は下の「この内容で保存」)ので、グレーにする */}
          <button type="button" onClick={handleEstimate} disabled={!canEstimate} className={buttonClass({ variant: estimate && !descriptionChanged ? "secondary" : "primary", size: "action" })}>
            {estimating ? "推定中..." : estimate ? "推定し直す" : "AI で推定する"}
          </button>
        </FormActions>
      </div>

      {estimateError && (
        <p ref={showWhenAppears} role="alert" className="scroll-mt-4 text-sm text-red-600 dark:text-red-400">
          {estimateError}
        </p>
      )}

      {estimate && !estimating && (
        <section ref={showResultWhenAppears} aria-label="AI の推定" className="flex scroll-mt-4 flex-col gap-4">
          <EstimateResult estimate={estimate} stale={descriptionChanged} />

          {saveErrors.form && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {saveErrors.form}
            </p>
          )}
          <FormActions
            remove={
              mode === "edit" && mealId !== undefined && !confirmingDelete ? (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className={buttonClass({ variant: "secondary", size: "action" })}>
                  削除
                </button>
              ) : null
            }
          >
            <Link href={`/days/${date}`} className={buttonClass({ variant: "secondary", size: "action" })}>
              キャンセル
            </Link>
            <button type="button" onClick={handleSave} disabled={!canSave} className={buttonClass({ size: "action" })}>
              {saving ? "保存中..." : "この内容で保存"}
            </button>
          </FormActions>
          {confirmingDelete && (
            <div role="alertdialog" aria-label="削除の確認" className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-raised px-4.5 py-3.5 text-sm ring-[1.5px] ring-red-700 ring-inset">
              <span>この食事を削除します。元に戻せません。よろしいですか。</span>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={saving} className={buttonClass({ variant: "secondary", size: "action" })}>
                やめる
              </button>
              <button type="button" onClick={handleDelete} disabled={saving} className={buttonClass({ size: "action" })}>
                削除する
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// 写真のボタンの印(カメラ)。装飾なので、読み上げの対象にしない
function CameraIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// 品目の表の、数字の列。右にそろえ、折り返さない。幅は、見出しの字数に合わせて、列ごとに決める(全部を広い幅にそろえると、
// 食事の画面の幅(3xl)に収まらず、右の列が切れる。「たんぱく質」は 5 字で、約 65px + 左の余白が要る)。数字の列の合計は約 380px で、残りを品目と量が使う
const NUMBER_CELL = "whitespace-nowrap pl-3 text-right tabular-nums";
type ItemRow = MealEstimate["items"][number];
const NUMBER_COLUMNS: { label: string; width: string; value: (item: ItemRow) => string | number }[] = [
  { label: "kcal", width: "w-[3.75rem]", value: (item) => item.kcal },
  { label: "たんぱく質", width: "w-[5rem]", value: (item) => round1(item.proteinG) },
  { label: "脂質", width: "w-[3.5rem]", value: (item) => round1(item.fatG) },
  { label: "糖質", width: "w-[3.5rem]", value: (item) => round1(netCarbOf(item)) },
  { label: "食物繊維", width: "w-[4.5rem]", value: (item) => (item.fiberG === null ? "-" : round1(item.fiberG)) },
  { label: "食塩", width: "w-[3.5rem]", value: (item) => (item.saltG === null ? "-" : round1(item.saltG)) },
];
const round1 = (value: number) => Math.round(value * 10) / 10;
// 品目ごとの糖質 = 炭水化物 − 食物繊維(負にしない)。合計の計算(meal-estimate.ts の totalsOf)と同じ式。zod をブラウザに入れないので、ここに書く
const netCarbOf = (item: MealEstimate["items"][number]) => Math.max(item.carbohydrateG - (item.fiberG ?? 0), 0);
const nutrient = (value: number | null, unit: string) => (value === null ? "-" : `${value} ${unit}`);

// 推定の表示(読み取り専用)。stale のとき(説明を変えて、まだ推定し直していない)は、薄くして、古い数字だと分かるようにする
function EstimateResult({ estimate, stale }: { estimate: MealEstimate; stale: boolean }) {
  const { totals } = estimate;
  return (
    <div className={`flex flex-col gap-4 rounded-lg bg-surface-raised p-4 sm:p-5 ${stale ? "opacity-50" : ""}`} aria-busy={stale || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{estimate.dishName}</h2>
        <p className="text-2xl font-semibold tabular-nums">
          {totals.kcal} <span className="text-sm font-normal text-ink-muted">kcal</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] sm:grid-cols-5">
        <Total label="たんぱく質" value={nutrient(totals.proteinG, "g")} />
        <Total label="脂質" value={nutrient(totals.fatG, "g")} />
        <Total label="糖質" value={nutrient(totals.netCarbG, "g")} />
        <Total label="食物繊維" value={nutrient(totals.fiberG, "g")} />
        <Total label="食塩相当量" value={nutrient(totals.saltG, "g")} />
      </dl>
      {/* 品目ごとの内訳。多い品目を探せるよう、栄養素の列も出す(押して開く形にはしない)。
          数字の列は、同じ幅で、右にそろえる(品目と量の列だけが、残りの幅を使う)。狭い画面は、表の枠の中で横にスクロールする(品目の列は左に固定) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              <th className="sticky left-0 bg-surface-raised py-2 pr-4 font-medium">品目</th>
              <th className="py-2 pr-4 font-medium">量の目安</th>
              {NUMBER_COLUMNS.map((column) => (
                <th key={column.label} className={`${NUMBER_CELL} ${column.width} py-2 font-medium`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((item, index) => (
              <tr key={`${item.name}-${index}`} className="border-t border-line-soft align-top">
                <td className="sticky left-0 bg-surface-raised py-3 pr-4">
                  {item.name}
                  {item.assumption && <span className="mt-0.5 block text-xs text-ink-muted">{item.assumption}</span>}
                </td>
                <td className="py-3 pr-4 text-ink-muted">{item.amount}</td>
                {NUMBER_COLUMNS.map((column) => (
                  <td key={column.label} className={`${NUMBER_CELL} py-3`}>
                    {column.value(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        AI の推定です。約 1 割ずれることがあります(量が見えにくい写真や、書かれていない量・調理法は、もう少しずれます)。栄養素は g(食塩は食塩相当量)です。品目の下の小さな文字は、その数字の前提(調理法・油・砂糖の仮定)で、調理法が書かれていないときは、一般的な調理を仮定しています。違うときは、上の説明を直して「推定し直す」を押してください。
      </p>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
