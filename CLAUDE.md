@AGENTS.md

# Habit and Health Tracker

Shu の生活習慣管理アプリ。食事・栄養・体重・睡眠・日記を記録し、集計とAIフィードバックを得る。

## 技術スタック
- Next.js(App Router, TypeScript)
- PostgreSQL + pgvector(Docker でローカル運用)
- ORM: Drizzle
- 認証: Better Auth(マジックリンク)
- AI: OpenRouter(食事の栄養推定、フィードバック)
  - OpenAI 互換 API として呼び出す。モデル名は環境変数で切り替えられるようにする
  - 写真入力には画像対応(vision)モデルを使う
  - 採用モデル: Gemini 3.8 Flash(`google/gemini-3.8-flash`)。速さ・安さ・軽い推論を重視
    - thinking は低めに設定し、出力トークン(thinking 含む)のコストを抑える
    - 2027-01 から価格が倍になる予定。精度や JSON の安定性に不満があれば Sonnet 5.5 と比較する

## 認証
- Better Auth でマジックリンクログインを実装する(友人にも使ってもらうため、複数ユーザー前提)
  - パスワードは使わない。ログインはマジックリンクが root で、Google などの OAuth は後から連結する任意の手段(おいおい検討。今は作らない)
  - Better Auth の Drizzle 連携で `user` / `session` / `account` / `verification` テーブルを使う。独自の `users` テーブルは作らず、Better Auth の `user` を使う(今ある `src/db/schema.ts` の `users` は置き換える)
  - Better Auth の ID は文字列。各テーブルの `user_id` は `user.id` への外部キー(型は `text`)にする
- 全テーブルに `user_id` を持たせ、クエリは必ず `user_id` で絞る(他のユーザーの記録が見えないことが最重要)
- `user_id` の取得は1か所(`getCurrentUserId()`)に集約する。セッションから取り、未ログインなら `/login` へ送る
- 認証を通っていないページ・Server Action でデータを読み書きしない。API の認可はセッション確認から始める

## 当面の方針
- まずはローカル環境で開発する。友人が使うためのデプロイ先は未決(下の未決事項)

## 機能要件
1. **食事記録**: 食事内容(テキスト/写真)、カロリー・PFC などの栄養素
2. **体重記録**
3. **睡眠記録**: 集計と分析
4. **AIフィードバック**: 記録データをもとにした助言
5. **ダッシュボード**: 食事・栄養・体重・睡眠の集計表示
6. **ポジティブ3行日記**: 1日3行のポジティブな出来事の記録

## ページ構成
- `/login` ログイン: メールアドレスを入力してマジックリンクを送る。他のページは未ログインなら `/login` へ送る
- `/` ダッシュボード: 日付ごとに1行(日付・体重・睡眠・カロリー・日記など)。行をクリックで詳細へ。期間の絞り込み・ページネーション(月単位/過去30日)は後回しで、今は全期間
- `/days/[date]` 日の詳細: デフォルトは閲覧モード。「編集」ボタン(`?mode=edit`)で編集モードに入る。日付は `YYYY-MM-DD`(不正な日付は 404)
- `/new` 新規入力: 1ページに全項目(デフォルトの3食、追加の食事、運動量、ポジティブ3行日記、自由記入欄)を記入する。中身は順次実装

## 食事の栄養推定フロー
1. ユーザーが食事のテキスト・写真を入力
2. AI に送り、栄養素を推論させ **JSON で返却**させる(スキーマは固定し、検証してから保存)
3. 保存した値で日次/週次の集計を行う
- 推定値であることを前提とし、ユーザーが後から修正できるようにする

## pgvector の用途
- 「名もなき自炊料理」(定型名のない家庭料理)の類似するものをまとめる
- 料理の説明文などを embedding 化して保存し、類似検索でグルーピング・過去の栄養推定の再利用に使う

## 開発ルール
- スキーマ変更は Drizzle のマイグレーションで行う(DBを直接いじらない)
- DB は `docker compose up -d` で起動する
- API キー等の秘密情報は `.env.local` に置き、コミットしない

## コマンド
- `npm run dev` / `npm run build`
- `npm run check`: lint + typecheck。変更ごとに実行して通すこと(CI も同じ lint → typecheck → build を実行)
- `npm run lint` / `npm run typecheck`
- `docker compose up -d --wait`: DB(pgvector/pgvector:pg17)を起動。ホスト側ポートは **5433**(5432 は他プロジェクトが使うため)
- `npm run db:generate`: マイグレーション生成(`drizzle/`)/ `npm run db:migrate`: 適用 / `npm run db:studio`
- 接続先は `DATABASE_URL`(`.env.example` を `.env.local` にコピーして使う)
- pgvector の拡張は `drizzle/0001_enable_pgvector.sql` で有効化済み。`drizzle/` は生成物なので手編集しない(この1ファイルだけ例外)

## 型の方針
- `strict: true` を前提にする。`any` は使わない
- 黙らせる回避は使わない: `as unknown as X`、`@ts-ignore`、`@ts-expect-error`、`eslint-disable`
- 外部から来るデータ(AI のレスポンス、フォーム入力、環境変数)は `unknown` で受け、スキーマで検証してから型を付ける
- どうしても回避が要るときは、理由を 1 行のコメントで書く。理由のない回避は `evaluator` が指摘する

## 実装後の流れ(生成と評価のループ)
実装は自分、評価は `evaluator` エージェント(`.claude/agents/evaluator.md`)。
1. 実装する。tsc・lint・test は hooks(`.claude/settings.json`)が自動で実行する(編集ごとに ESLint、応答終了時に typegen・tsc・lint、test スクリプトがあれば test)。失敗したら差し戻されるので直す。`npm run build` は hooks の対象外
2. 挙動を変える変更のときは `evaluator` を呼ぶ(ドキュメントやコメントだけの変更では呼ばない)
3. 「要修正」なら「高」「中」の指摘を直して 2 に戻る。最大 5 周で打ち切る
4. 「合格」で終了し、結果を報告する。5 周で合格しなければ、止めて残りの指摘をそのまま報告する(無理に通さない)。同じ指摘が再発したら、上限を待たずに止める
5. 報告には、検証していない範囲と、人間向けの確認手順を必ず書く。人間の返事は待たない

人間の確認(画面の動作確認、最終レビュー)はループの外。

### テストを通すための改ざんは禁止
やむを得ず変えるときは、理由を報告に書き、人間の確認を待つ。
- 失敗するテストの削除、`skip` / `only` の追加、`exclude` で外すこと
- 期待値を実装の出力に合わせて弱めること(仕様が変わった場合を除く)
- 型や lint を黙らせる回避を足すこと、tsconfig や ESLint のルールを緩めること
- `evaluator` の指摘を、直さずにコメントや設定で黙らせること

テストが落ちたら、まず実装が間違っていると考える。

## コミットと hooks
- 人が頼むまでコミットしない
- 環境変数ファイル(`.env*`)は読まない・編集しない(`.env.example` は可)
- PreToolUse でブロック(`.claude/hooks/guard-pre.sh`): `.env*` の読み書き、`git clean` / `reset --hard`、`rm -r`、`drizzle-kit push`、`drizzle/` と `package-lock.json` の編集、`@ts-ignore` / `eslint-disable` / `as unknown as` / `any` の追加、テストや設定への `skip` / `only` / `strict:false` / ルール `off` / `exclude`
- ブロックされたら回避せず、理由を報告して人の指示を待つ

## 進捗ファイル
- `claude-progress.txt` に、完了・実行中・これからのタスクを書く。新しいセッションは、最初にこのファイルと CLAUDE.md を読む
- goal が終わるたびに、終了時の報告と一緒に更新する

## 未決事項
- マジックリンクのメール送信方法(開発中はコンソール出力、友人に使わせる段階で Resend などを選ぶ)
- 友人が使うためのデプロイ先(そのときに DB の置き場所、秘密情報、`BETTER_AUTH_URL` も決める)
- Google ログインの連結(後回し)
- embedding モデルの選定(次元数が pgvector のカラム定義に影響する)
- 写真の保存先(ローカルファイル or DB)
- 睡眠データの入力方法(手入力 or 他アプリからのインポート)
