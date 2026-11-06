@AGENTS.md

# Habit and Health Tracker

Shu の生活習慣管理アプリ(友人にも使ってもらう)。食事・栄養・体重・睡眠・運動・日記を記録し、集計と AI フィードバックを得る。
このファイルには、**毎回守る規則**だけを書く。機能ごとの詳細な仕様は `docs/`(下の索引)、作業の進み具合と宿題は `claude-progress.txt`。コードを読めば分かることは、どちらにも書かない。

## 技術スタック
- Next.js(App Router, TypeScript)/ Recharts(ブラウザ側の部品なので `"use client"`)/ PostgreSQL(Docker。pgvector は使っていない)/ Drizzle / Better Auth / zod / Vitest
- AI: OpenRouter(OpenAI 互換)。食事の栄養推定とフィードバック用。モデル名は環境変数で切り替える。既定は Gemini 3.8 Flash(`google/gemini-3.8-flash`、thinking は低め。2027-01 に価格が倍になる予定)。Sonnet 5.5 と比較済み: 細かい栄養値は Sonnet が成分表に近いが、写真で誤読や少なめの見積もりがあり、高く遅いので Flash を既定にした
- 写真は保存しない(AI への入力として使い捨て)。AI が返す JSON を保存する

## 認証とデータの分離(いちばん大事)
- Better Auth のマジックリンクが root。`user` は Better Auth のものを使い、独自の users は作らない
- 全テーブルに `user_id`(`user.id` への外部キー、型は `text`、cascade)を持たせ、**クエリは必ず `user_id` で絞る**
- `user_id` は `getCurrentUserId()` に集約する。未ログインなら `/login` へ `redirect()`(例外を投げる)ので、`try/catch` で囲まない。Route Handler 用には 401 を返す版を別に作る
- 守りは 3 段: `proxy.ts` → `(app)/layout.tsx` の `AuthGate` → **データを扱う関数が `getCurrentUserId()` を最初に呼ぶ(本当の認可はここ)**。レイアウトだけに頼らない。日付は関数の中でも検証する。実 DB のテストで守る
- 新規登録は `ALLOWED_EMAILS` のホワイトリスト(空のとき、開発は全員許可・本番は誰も許可しない)。許可外でも応答は同じにする。外した人の `session` の行も消す
- 開発中のメールは `lib/email.ts` がコンソールに出す。本番は Resend の予定だが未実装

## データの要点(詳細は `docs/data-rules.md`)
- 値の範囲は `lib/*-limits.ts` に集約(`app` = zod の現実的な範囲、`db` = CHECK の広い範囲。**app は db の内側**)
- 保存は「入力に**あった項目だけ**」を更新する(キーが無い項目は変更しない、空欄は null)。フォームに項目を足したら、`*-schema.ts` と `*-form.tsx` の両方に足す
- zod の検証は、数値を文字列の正規表現で先に絞る。**zod をブラウザ側のコードに入れない**
- **過去の日を、今のプロフィールで書き換えない**: 目標カロリー・活動係数は、日の行を作るときに写して固定する。体重・体脂肪率は、その日の朝 → それ以前の最新 → プロフィール。空のまま保存しても日の行は作らない。日の行を作る画面は、プロフィールの目標カロリーと活動係数が未設定なら `/profile/edit` へ送る
- 測定値の列には、測った値だけを入れる。睡眠は 2 つの時刻(起きた日に入れる)で持ち、時間は計算する

## 食事と AI の要点(詳細は `docs/meals-and-ai.md`)
- **すべての食事は AI の推定**(手入力の経路は作らない)。合計と糖質は**コードで計算**する(AI に足し算させない)。保存のとき、サーバーは推定を zod で検証し直し、合計を内訳から計算し直す
- **API キーを読むのは `openrouter.ts` だけ**。食事の内容と写真は健康情報なので `data_collection: "deny"`。**Google のモデルは、JSON スキーマの `minLength`・`maxLength`・`minimum`・`maximum`・`minItems`・`maxItems`・`additionalProperties` を 400 で拒否する**(スキーマからは外し、zod で検証)
- 食事の推定の回数制限は、1 日 10 回(03:00 区切り。失敗は数えず、「食べ物でない」判定は数える)。ユーザー単位の `pg_advisory_xact_lock` で「数える → 足す」を直列にする。AI レポートは別の決まり(`docs/ai-feedback.md`)
- 日記(良かったこと・今日の気づき・運動のメモ)は、**AI レポートを作るときだけ、利用者が同意したうえで**、全文を AI に送る(`docs/ai-feedback.md`)。ほかの場面では送らない。レポートの保存(スナップショット)には、文章を複製しない
- 実際に AI を呼ぶ `*.live.test.ts` は `RUN_LIVE_AI=1` のときだけ動く(お金がかかる)

## 画面とグラフの要点(詳細は `docs/screens.md`、`docs/charts.md`)
- 閲覧と編集は別のパス(`?mode=edit` は使わない)。保存は Server Action で、日付・id はページが bind する
- ボタン: 決定する操作だけ深い緑(`accent`)、弱い操作はベージュのグレーの塗り(`neutral`)。新しく書く部分の色は `globals.css` の変数(`bg-surface-raised`・`text-ink-muted` など)を使う(日の詳細以外には、まだ zinc が残っている)。行は `FormActions`(「キャンセル、決定」の並び、決定が右)。新しいフォームもこの並びにする
- グラフは、**高さを固定**してサーバーが場所を確保し、1 つの図に軸 2 本を作らない。各図に `aria-label` と、表の形の代替(カレンダーを除く)を付ける。グラフを書く前に `dataviz` スキルを読む
- **赤は、失敗や入力の誤りなど、重要なことを知らせるときだけ**(`text-red-600`。トークンは作らない)。装飾や強調、注意を引くためには使わない(見た目が悪くなる)。待てば直る案内(回数制限など)は、赤にしない
- 栄養の目標との比べは、**一般的な参考値で、医療上の指示ではない**と画面に出す

## 開発ルール(詳細は `docs/dev-notes.md`)
- スキーマ変更は Drizzle のマイグレーションで行う(DB を直接いじらない)。`drizzle/` と `src/db/auth-schema.ts` は生成物で手編集しない。`npm run db:generate -- --name <説明的な名前>`
- **マージ済みのマイグレーションは書き換えない**。例外は、デプロイ前に人が「1 本に書き直したい」と指示したときだけ(手順と落とし穴は `docs/dev-notes.md`)
- 秘密情報は `.env.local` に置き、コミットしない。`.env*` は読まない・編集しない(`.env.example` は可)
- ルートを足す・消したら `npx next typegen`。依存を足すときは、`docs/dev-notes.md` の手順に従う(普通に `npm install` すると lock が壊れる)

## コマンド
- `npm run dev` / `build` / `check`(lint + typecheck。**テストは含まない**)/ `test`
- DB: `docker compose up -d --wait`(ホストのポートは **5433**)、`npm run db:generate` / `db:migrate` / `db:studio`
- ダミーデータ: `npm run db:seed-dummy`(開発用 DB 以外では止まる。スキーマを変えたらスクリプトも直す)。詳細は `docs/dev-notes.md`

## テスト
- Vitest(`src/**/*.test.{ts,tsx}`)。フォームは jsdom + Testing Library(ファイル先頭に `// @vitest-environment jsdom`)
- 実 DB のテスト(`data-access.test.ts`)は `TEST_DATABASE_URL` が無いと実行されない(CI は無いと失敗)。手元は `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/habit_health_test npm test`。**本物のデータが入った DB を指さない**
- 落とし穴: `beforeEach(() => mock.mockResolvedValue(...))` はモックを返すので Vitest が後片付けとして呼ぶ(波括弧で囲む)/ 解決しない非同期の遷移はテストをまたいで漏れる(afterEach で解決する)/ Server Action の結果は `findBy*` で待つ
- テストが落ちたら、まず実装が間違っていると考える。**テストを通すための改ざんは禁止**: テストの削除・`skip`・`only`・`exclude`、期待値を実装に合わせて弱める、型や lint を黙らせる、tsconfig や ESLint を緩める、`evaluator` の指摘をコメントや設定で黙らせる。やむを得ないときは理由を報告して人の確認を待つ

## 型と評価
- `strict: true`。`any`、`as unknown as`、`@ts-ignore`、`@ts-expect-error`、`eslint-disable` は使わない(必要なら理由を 1 行のコメントで書く)。外から来るデータは `unknown` で受け、スキーマで検証してから型を付ける
- 実装後は hooks が tsc・lint・test を自動で実行する(`build` は対象外)。**挙動を変えたら `evaluator` を呼ぶ**(最大 5 周。同じ指摘が再発したら止める)。報告には、検証していない範囲と、人間向けの確認手順を書く

## コミットと hooks
- 人が頼むまでコミットしない。コミットメッセージと PR(タイトル・本文)・コード中のコメントは日本語。PR の本文は「概要 / 確認したこと / 未確認・注意」の順で、確認していないことは分けて書く
- `guard-pre.sh` がブロックする: `.env*` の読み書き(コマンドの文字列に環境ファイルのパスが入っているだけでも)、`git clean` / `reset --hard`、`rm -r`、`drizzle-kit push`、`drizzle/` と `package-lock.json` の編集、型や lint を黙らせる記述、テストや設定を弱める変更。ブロックされたら回避せず、理由を報告して指示を待つ
- 新しいセッションは、最初にこのファイルと `claude-progress.txt` を読む。作業の区切りごとに `claude-progress.txt` を更新する

## 詳細な仕様(`docs/`)
機能を変えるときは、先に該当のファイルを読み、変えたら直す。**このファイルと `docs/` は短く保つ**: 経緯の語りや、コードを読めば分かること(関数名の列挙など)は書かず、決定には理由を 1 行で添える。
- [`docs/screens.md`](docs/screens.md): パス、日の詳細・ダッシュボードの並び、一覧・入口・前後の日、ボタンの並び、プロフィールの提案、ウエスト
- [`docs/data-rules.md`](docs/data-rules.md): 値の範囲、保存の規則、睡眠、**その日の値の固定(過去を書き換えない仕組み)**、記録を始める条件
- [`docs/meals-and-ai.md`](docs/meals-and-ai.md): 食事の記録(「その日」の境目 03:00 など)、AI の呼び出し、回数制限、食事の画面の流れ、写真
- [`docs/charts.md`](docs/charts.md): 栄養のレーダー(軸と目標の決め方)、推移のグラフ(体重・睡眠・カロリー・差の棒)、記録のカレンダー
- [`docs/ai-feedback.md`](docs/ai-feedback.md): **AI フィードバック(レポート)**。期間と種類、同意、バッジ(成果型)、保存(スナップショット)、プロンプトの方針、実装の状態
- [`docs/exercise-and-diary.md`](docs/exercise-and-diary.md): 運動(MET の式、1 日 5 件、いつもより多く動いた分だけ)、良かったこと(1 日 3 件、まとめて入れ替え)
- [`docs/dev-notes.md`](docs/dev-notes.md): マイグレーションの書き直しの手順と落とし穴、ダミーデータ、依存を足す手順、環境変数の落とし穴
- [`docs/release-checklist.md`](docs/release-checklist.md): 公開前に決めること(Resend・Vercel・Neon、タイムゾーン、プライバシー、許容している制約)
