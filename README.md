# Habit and Health Tracker

食事・栄養・体重・睡眠・運動・日記を記録し、集計と AI のフィードバック(レポート)を得る、生活習慣の管理アプリです。自分と、数人の友人で使うために作っています。画面と文章は日本語です。

- **食事は AI が推定します。** 文章と写真から、品目ごとの栄養を推定し、合計はコードで計算します。写真は保存せず、AI への入力として使い捨てます
- **記録は、日ごとにまとまります。** 朝の体重・体脂肪率、睡眠(就寝と起床)、食事、運動、良かったこと、今日の気づき
- **グラフで推移を見ます。** 体重・睡眠・摂取カロリーと目標、摂取 − 消費の差、栄養のレーダー、記録のカレンダー
- **AI レポート**(随時・月次・四半期・年次)。グラフと文章を 1 つにまとめ、「バッジ」を贈ります(成績はつけません)。PDF にも保存できます

## 全体像

```
ブラウザ ──▶ Next.js(App Router。サーバーとブラウザの部品)
                │
                ├─▶ Postgres(Drizzle。ユーザー、記録、レポート)
                ├─▶ OpenRouter(食事の推定、レポートの文章)
                └─▶ Resend(ログインのメール。本番)
```

ログインは、**メールのリンク(マジックリンク)**です。パスワードは使いません。Google は任意で、**アカウントのページで連結した人だけ**が使えます(Google だけでは、アカウントを作れません)。

## 設計の要点

詳しい決定と理由は `docs/` にあります。

- **データは、ユーザーごとに分けます。** 全テーブルが `user_id` を持ち、クエリは必ず `user_id` で絞ります。守りは 3 段(`proxy.ts` → レイアウトの認証 → データを扱う関数が最初にユーザーを確かめる)で、実 DB のテストで守っています
- **登録は許可リスト制です**(`ALLOWED_EMAILS`)。セッションを作るときにも確かめるので、許可リストから外した人は、連結済みの Google からも入れません
- **ログインのメールは、IP 単位とメールアドレス単位の両方で、回数を制限します。** 許可リストの内外で、応答を同じにします(登録の有無を教えないため)
- **過去の日の記録を、今のプロフィールで書き換えません。** 目標カロリーと活動係数は、日の行を作るときに写して固定します
- **時計は日本時間に固定しています**(サーバーは UTC でも、端末がどこでも、同じ「今日」になります)。食事の「その日」は、03:00 区切りです
- **AI の出力は信用せず、検証します。** 合計は内訳からコードで計算し直し、返事は zod で検証します。日記の全文を AI に送るのは、レポートを作るときだけで、利用者の同意が要ります
- **レポートは、作った時点の数字(スナップショット)から、グラフを描き直します。** 記録をあとで直しても、文章・バッジ・グラフがずれません

## 技術スタック

| 分類 | 技術 |
|---|---|
| フレームワーク | Next.js 16(App Router)、React 19 |
| 言語 | TypeScript(strict) |
| スタイル | Tailwind CSS 4 |
| グラフ | Recharts |
| 認証 | Better Auth(マジックリンク、Google の連結) |
| ORM / マイグレーション | Drizzle ORM / drizzle-kit |
| DB | PostgreSQL 17(開発は Docker、本番は Neon の予定) |
| 検証 | zod |
| AI | OpenRouter(既定のモデルは `google/gemini-3.8-flash`。環境変数で切り替え) |
| メール | Resend(REST API。開発とテストはコンソールに出力) |
| テスト | Vitest、Testing Library(jsdom) |
| Lint | ESLint |
| ホスティング | Vercel |

## 手元で動かす

必要なもの: Node.js 22、Docker。

```bash
npm ci
cp .env.example .env.local        # 中身を埋める(下の表を参照)
docker compose up -d --wait       # Postgres を起動(ホストのポートは 5433)
npm run db:migrate                # テーブルを作る
npm run dev                       # http://localhost:3000
```

- 開発中のログインのメールは、**端末に出力されます**(`npm run dev` の出力にリンクが出ます)
- `ALLOWED_EMAILS` が空のとき、開発では全員が登録できます
- ダミーのデータを入れる: `npm run db:seed-dummy`(3 人 × 100 日分)、`npm run db:seed-demo`(1 人 × 約 700 日分)。どちらも AI は呼ばず、開発用の DB 以外では止まります

## 環境変数

`.env.example` が見本です。`.env.local` に書き、**コミットしません**。

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | Postgres の接続文字列 |
| `BETTER_AUTH_SECRET` | 必須。長いランダムな文字列(`openssl rand -base64 32` など) |
| `BETTER_AUTH_URL` | このアプリの公開 URL。本番で必須 |
| `ALLOWED_EMAILS` | 登録を許可するメールアドレス(カンマ区切り)。空のとき、開発は全員許可、本番は誰も許可しない |
| `OPENROUTER_API_KEY` | AI の呼び出しに使う |
| `OPENROUTER_MODEL` | モデル名。既定は `google/gemini-3.8-flash` |
| `RESEND_API_KEY`、`MAIL_FROM` | 本番のログインのメールに必須。送信元のドメインを Resend で認証しておく |
| `MAIL_REPLY_TO` | 任意。返信が届く受信箱 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 任意。2 つそろうと、Google の連結とログインが有効になる。承認済みのリダイレクト URI は `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `MEAL_ESTIMATE_DAILY_LIMIT` | 任意。食事の推定の 1 日の上限。既定は、本番とテストが 20 回、開発サーバーは上限なし |
| `EMAIL_TRANSPORT` | 任意。`resend` にすると、開発でも実際にメールを送る |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` / `build` / `start` | 開発サーバー、ビルド、本番の起動 |
| `npm run check` | lint と型の検査(テストは含まない) |
| `npm test` | テスト(Vitest) |
| `npm run db:generate -- --name <名前>` | スキーマの変更からマイグレーションを作る |
| `npm run db:migrate` | マイグレーションを適用する |
| `npm run db:studio` | DB を見る |
| `npm run db:seed-dummy` / `db:seed-demo` | ダミーデータ、デモの人物 |

スキーマの変更は、必ずマイグレーションで行います(`drizzle/` は生成物なので、手で編集しません)。

## デプロイ

Vercel と Neon に置く予定です。手順と、公開前に決めることは `docs/release-checklist.md` にあります。要点:

1. **先に、本番の DB にマイグレーションを当てる**(`npm run db:migrate`)。先にコードを出すと、表が無くてログインが 500 になります
2. 環境変数を設定する(上の表。`ALLOWED_EMAILS` が空だと、本番では誰も登録できません)
3. デプロイ後に確かめる: DB のタイムゾーンが UTC か、ログインのメールが届くか、IP の取り方、Google でのログイン

## テスト

- Vitest。ロジック、フォームの部品(jsdom)、Server Action の結線、本物の Better Auth(メモリ上の DB)を通す認証のテスト
- **実 DB を使うテスト**は、`TEST_DATABASE_URL` を設定すると動きます(CI では、設定が無いと失敗します)。専用の DB を指してください。本物のデータが入った DB は指さないでください
  ```bash
  TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/habit_health_test npm test
  ```
- 実際に AI を呼ぶテスト(`*.live.test.ts`)は、`RUN_LIVE_AI=1` のときだけ動きます(お金がかかります)
- CI(GitHub Actions)は、lint、テスト(実 Postgres を使用)、型の検査、ビルドを通します

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/auth.md` | 許可リスト、Google の連結とログイン、ログインのメール、回数の制限 |
| `docs/data-rules.md` | 値の範囲、保存の規則、その日の値の固定 |
| `docs/meals-and-ai.md` | 食事の記録、AI の呼び出し、回数制限 |
| `docs/ai-feedback.md` | AI レポート、バッジ、長期レポート |
| `docs/charts.md` | グラフと集計 |
| `docs/screens.md` | 画面の規則、PDF の印刷 |
| `docs/ui-inventory.md` | 実装している画面の一覧 |
| `docs/exercise-and-diary.md` | 運動、良かったこと |
| `docs/dev-notes.md` | マイグレーションの書き直し、ダミーデータ、依存を足す手順 |
| `docs/release-checklist.md` | 公開前に決めること、作らないと決めたこと |
| `docs/backlog.md` | 急がない宿題 |

Claude Code と一緒に作っています。作業のルールは `CLAUDE.md`、進み具合は `claude-progress.txt` にあります。
