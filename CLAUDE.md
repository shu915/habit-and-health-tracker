# Habit and Health Tracker

Shu の生活習慣管理アプリ。食事・栄養・体重・睡眠・日記を記録し、集計とAIフィードバックを得る。

## 技術スタック
- Next.js(App Router, TypeScript)
- PostgreSQL + pgvector(Docker でローカル運用)
- ORM: Drizzle
- AI: OpenRouter(食事の栄養推定、フィードバック)
  - OpenAI 互換 API として呼び出す。モデル名は環境変数で切り替えられるようにする
  - 写真入力には画像対応(vision)モデルを使う
  - 採用モデル: Gemini 3.8 Flash(`google/gemini-3.8-flash`)。速さ・安さ・軽い推論を重視
    - thinking は低めに設定し、出力トークン(thinking 含む)のコストを抑える
    - 2027-01 から価格が倍になる予定。精度や JSON の安定性に不満があれば Sonnet 5.5 と比較する

## 当面の方針
- ローカル環境のみで動かす(デプロイは考えない)
- 認証なし。users テーブルは作るが、常に `user_id = 1` として扱う
  - 将来の認証導入に備え、全テーブルに user_id を持たせ、クエリは必ず user_id で絞る
  - user_id の取得は1か所(例: `getCurrentUserId()`)に集約する

## 機能要件
1. **食事記録**: 食事内容(テキスト/写真)、カロリー・PFC などの栄養素
2. **体重記録**
3. **睡眠記録**: 集計と分析
4. **AIフィードバック**: 記録データをもとにした助言
5. **ダッシュボード**: 食事・栄養・体重・睡眠の集計表示
6. **ポジティブ3行日記**: 1日3行のポジティブな出来事の記録

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
- (DB 導入後に追記: db:generate / db:migrate など)

## Claude Code 設定
- `.claude/settings.json`: 読み取り系コマンドの許可と、環境変数ファイルの Read 拒否
- `.claude/hooks/`: 環境変数ファイルの編集ブロック、編集した TS/JS への eslint 自動実行

## 未決事項
- embedding モデルの選定(次元数が pgvector のカラム定義に影響する)
- 写真の保存先(ローカルファイル or DB)
- 睡眠データの入力方法(手入力 or 他アプリからのインポート)
