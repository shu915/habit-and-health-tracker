@AGENTS.md

# Habit and Health Tracker

Shu の生活習慣管理アプリ(友人にも使ってもらう)。食事・栄養・体重・睡眠・日記を記録し、集計と AI フィードバックを得る。

## 技術スタック
- Next.js(App Router, TypeScript)/ PostgreSQL + pgvector(Docker)/ Drizzle / Better Auth / zod / Vitest
- AI: OpenRouter(OpenAI 互換 API)。用途は食事の栄養推定とフィードバック。モデル名は環境変数で切り替える。写真は vision モデルへ
  - 採用: Gemini 3.8 Flash(`google/gemini-3.8-flash`)。thinking は低めにして出力コストを抑える。2027-01 に価格が倍になる予定。精度や JSON の安定性に不満があれば Sonnet 5.5 と比較する
  - 写真は保存しない(AI への入力として使い捨て)。AI が返す JSON(料理の説明文を含む)を保存する

## ページ構成
- `/login`: メールアドレスを入れてマジックリンクを送る。他のページは未ログインなら `/login` へ
- `/` ダッシュボード: 1日の消費カロリーの目安(基礎代謝 × 活動係数、目標カロリーとの差)、プロフィール、日付ごとの一覧(新しい日が上、行のどこでもクリックで詳細へ。全期間。期間の絞り込みは後回し)
- `/profile`(閲覧)と `/profile/edit`(編集フォーム)。`/days/[date]`(日の詳細)と `/days/[date]/edit` も同じ形。編集は別のパスにする(`?mode=edit` のクエリは使わない。閲覧ページが `searchParams` を読まずに済み、コードも分かれる)
- `/days/[date]`(詳細)と `/days/[date]/edit`(編集。記録が無い日は新規作成): 就寝・起床の時刻、朝の体重・体脂肪率、夜の振り返り。保存は Server Action(`days/[date]/edit/actions.ts`。日付は URL から bind し、フォームの入力にしない)
- 日の入力の入口: ダッシュボードの「日々の記録」の右に、**日付欄(初期値は今日)と「編集」ボタン**がある(`components/day-jump-form.tsx`)。新規か編集かは分けず、押すと `/days/[date]/edit` へ移動する。記録がある日は入力済みの値が出て、無い日は空のフォームになる(今日は端末のローカル時間なので、ブラウザ側で決める。画面では未来を選べない)。入力画面の上に「前の日／次の日」がある。サーバーは翌日までの日付を許す(利用者のタイムゾーンを知らないため。`isRecordableDate`)。食事・運動・ポジティブ3行日記は、これから追加する
- プロフィールの目標値(体重・カロリー・タンパク質)は、各欄の「提案」ボタンで入力欄を埋める。**保存はしない**(本人が確認して「保存」)
  - 計算は AI なしの式(`lib/nutrition.ts`。方針の定数もここ)。フォームの値から作るのは `lib/profile-suggest.ts`
  - **18 歳以上だけが対象**(大人の基準で減量を出すため)。画面に「医療上の指示ではない」と出す
  - 目標値の提案に AI は使わない(活動係数も本人が5つから選ぶ)。式の精度は一般的な目安(±10〜15%)で、合わせ込みは、記録が溜まってから体重の推移と摂取量の実測で行う

## 認証とデータの分離
- Better Auth のマジックリンクが root。Google などは、後から任意で連結する(今は作らない)。`user` は Better Auth のものを使い、独自の users は作らない
- 全テーブルに `user_id`(`user.id` への外部キー、型は `text`、cascade)を持たせ、**クエリは必ず `user_id` で絞る**
- `user_id` は `getCurrentUserId()` に集約する。未ログインなら `/login` へ `redirect()`(例外を投げる)ので `try/catch` で囲まない。Route Handler で使うときは 401 を返す版を別に作る
- 守りは3段: `proxy.ts`(Cookie が無ければリダイレクト)→ `(app)/layout.tsx` の `AuthGate` → **データを扱う関数が `getCurrentUserId()` を呼ぶ(本当の認可はここ)**。レイアウトはページ遷移のたびに再実行されないので、レイアウトだけに頼らない
- 新規登録は `ALLOWED_EMAILS`(カンマ区切り)のホワイトリスト制。空のとき、開発は全員許可・本番は誰も許可しない。許可外でも応答は同じにして、登録の有無を教えない。外した人の `session` の行も消す(消さないとセッションが7日残る)。`next dev` を外に公開するときは先に設定する
- 開発中のメールは `lib/email.ts` がコンソールに出す。本番は送信方法が未設定なのでエラー

## データの規則
- 値の範囲は `lib/profile-limits.ts`(プロフィール)と `lib/day-limits.ts`(日の記録)に集約する(`app` = zod とフォームの現実的な範囲、`db` = CHECK 制約の広い範囲)。**app は db の内側**(テストで守る)。CHECK の SQL は定数から生成せず `schema.ts` に直接書くので、db の範囲を変えるときは定数・`schema.ts`・マイグレーションを一緒に直す
- 保存は「入力に**あった項目だけ**を更新」する(キーが無い項目は変更せず、空欄は null で空にする)。フォームに項目を足したら、`*-schema.ts` と `*-form.tsx` の両方に足す
- 個人の値は null が「未入力」。使う側で null を「未設定」として扱う(睡眠の2項目は空にでき、空は「睡眠の機能を使わない」)
- 活動係数は5つの選択肢だけ(選択肢にない値は、フォームに「現在の値」と出て、選び直しになる)
- フォームの検証は zod。数値は文字列の正規表現で先に絞る(zod の変換は `0x10` や `1e2` を通すため)。**zod をブラウザ側のコードに入れない**(`profile-form.tsx` は `profile-schema` を type import だけで読む)
- 睡眠時間・中間時刻・就寝・起床は「時間/時」「分」の2欄(`components/pair-input.tsx`)で入力し、DB の形(分 / `HH:MM`)に変換して送る(`lib/duration.ts`)
- 睡眠の記録は `days` の `sleep_bedtime`(前の夜)と `sleep_wake_time`(今朝)の2列で、**起きた日**に入れる。睡眠時間は列に保存せず、2つの時刻から計算する(`lib/sleep.ts`。同じ時刻・片方が空は null)。空は「記録しない」。昼寝や夜中に起きた記録は扱わない(1日1回)
- 日の記録の検証は `day-schema.ts`(zod。プロフィールと同じ作り)、範囲は `day-limits.ts`(同じ app / db の決まり)。zod の共通の部品は `form-fields.ts`
- 測定値(体重・体脂肪率)の列には、測った値だけを入れる。式で見積もった値は入れない

## 食事の栄養推定フロー(予定)
1. テキスト・写真を AI に送り、栄養素を **JSON で返却**させる(スキーマは固定し、zod で検証してから保存)
2. 推定値としてフォームに出し、本人が直してから保存。保存した値で日次/週次の集計をする
- pgvector: 「名もなき自炊料理」の説明文を embedding 化して保存し、類似検索でグルーピング・過去の推定の再利用に使う

## 開発ルール
- スキーマ変更は Drizzle のマイグレーションで行う(DB を直接いじらない)。`drizzle/` と `src/db/auth-schema.ts` は生成物で手編集しない(`0000_enable_pgvector.sql` だけ手書き。`guard-pre.sh` が例外にしている)
- **マージ済みのマイグレーションは書き換えない**(`when` や snapshot の ID が変わると、適用済みの DB で再実行されて壊れる)。未マージの分は作り直してよい。そのときも、マージ済みの分は `git checkout <コミット> -- drizzle/meta/_journal.json` などで戻してから、新しい分だけ `db:generate` で作る
  - **例外(デプロイ前だけ)**: 人が「1本に書き直したい」と指示したときに限り、最新の1本(今は `0002`)を書き直してよい。その分のファイルと snapshot を消し、journal を1つ前に戻し、`db:migrate` で1つ前まで適用してから `db:generate`。**開発用・テスト用 DB の作り直し(`down -v`)でデータが消える**ので、先に中身を確認して伝え、残したいデータは `pg_dump --data-only` で退避して戻す。デプロイ後は使わない
- データを扱う関数は、`getCurrentUserId()` を最初に呼んで `user_id` で絞り、日付は関数の中でも検証する。実 DB のテストで守る
- 秘密情報は `.env.local` に置き、コミットしない。`.env*` は読まない・編集しない(`.env.example` は可)

## コマンド
- `npm run dev` / `build` / `check`(lint + typecheck。**テストは含まない**)/ `test`
- DB: `docker compose up -d --wait`(ホストのポートは **5433**)、`npm run db:generate` / `db:migrate` / `db:studio`
- Better Auth の設定(`lib/auth.ts`)を変えたら、`DATABASE_URL=... BETTER_AUTH_SECRET=... npm run db:auth-schema` で `auth-schema.ts` を再生成する
- `drizzle-kit generate` は、テーブルの削除と作成が同時にあると対話で聞いてくる(非対話では失敗する)。別のマイグレーションに分ける
- `.env.local` に `BETTER_AUTH_SECRET` が無いと起動時にエラー。開発中のマジックリンクは `next dev` の端末に出る
- `package.json` を変えて `npm install` すると、macOS の npm が lock から `@rolldown/binding-*` を落とす(`grep -c '"node_modules/@rolldown/binding-' package-lock.json` が 15 でなければ異常)。`package.json` だけを空のフォルダにコピーして `npm install --package-lock-only` した lock を取り込み、`npm ci` する

## テスト
- Vitest(`src/**/*.test.{ts,tsx}`)。フォームは jsdom + Testing Library(ファイル先頭に `// @vitest-environment jsdom`)
- 実 DB のテスト(`data-access.test.ts`)は `TEST_DATABASE_URL` が無いと実行されない(CI は無いと失敗)。手元は `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/habit_health_test npm test`。専用 DB `habit_health_test` は `docker/initdb/` が作る(Stop フックも無ければ作る)。**本物のデータが入った DB を指さない**
- テストが落ちたら、まず実装が間違っていると考える。**テストを通すための改ざんは禁止**: テストの削除・`skip`・`only`・`exclude`、期待値を実装に合わせて弱める、型や lint を黙らせる、tsconfig や ESLint を緩める、`evaluator` の指摘をコメントや設定で黙らせる。やむを得ないときは理由を報告して人の確認を待つ

## 型と評価
- `strict: true`。`any`、`as unknown as`、`@ts-ignore`、`@ts-expect-error`、`eslint-disable` は使わない(必要なら理由を1行のコメントで書く)。外から来るデータは `unknown` で受け、スキーマで検証してから型を付ける
- 実装後は hooks が tsc・lint・test を自動で実行する(`build` は対象外)。**挙動を変えたら `evaluator` を呼ぶ**(最大5周。同じ指摘が再発したら止める)。報告には、検証していない範囲と、人間向けの確認手順を書く

## コミットと hooks
- 人が頼むまでコミットしない。コミットメッセージと PR(タイトル・本文)・コード中のコメントは日本語。PR の本文は「概要 / 確認したこと / 未確認・注意」の順で、確認していないことは分けて書く
- `guard-pre.sh` がブロックする: `.env*` の読み書き、`git clean` / `reset --hard`、`rm -r`、`drizzle-kit push`、`drizzle/` と `package-lock.json` の編集、型や lint を黙らせる記述、テストや設定を弱める変更。ブロックされたら回避せず、理由を報告して指示を待つ
- `claude-progress.txt` に完了・実行中・これからを書く。新しいセッションは、最初にこのファイルと CLAUDE.md を読む

## 未決事項・公開前に決めること
- マジックリンクのメール送信方法(Resend など)/ 友人が使うためのデプロイ先(DB の置き場所、秘密情報、`BETTER_AUTH_URL` を https に)/ embedding モデル(次元数が列定義に影響。インデックスは2000次元まで)/ 睡眠データの入力方法(手入力かインポートか)
- デプロイ時: プロキシ越しの IP の取り方(`advanced.ipAddress` の `ipAddressHeaders` と `trustedProxies`)、メールアドレス単位の送信回数の制限、期限切れの `verification` 行の掃除、リンクスキャナにトークンが先に消費される問題、IP・User-Agent の保持期間
- 健康情報は平文で保存している。公開前に、バックアップとログに出る範囲、退会時の cascade の範囲を確認する
- 今は許容: `listDays()` の件数に上限がない(期間の絞り込みを入れるときに付ける)/ 同時編集は最後の保存が勝つ
