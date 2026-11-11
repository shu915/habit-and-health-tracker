# 開発の手順と落とし穴

CLAUDE.md から分けた詳細。仕様を変えたら、ここも直す。

## 開発ルール
- スキーマ変更は Drizzle のマイグレーションで行う(DB を直接いじらない)。`drizzle/` と `src/db/auth-schema.ts` は生成物で手編集しない。`npm run db:generate -- --name <説明的な名前>` で作る。履歴は 1 テーマ 1 本(`0000_auth` / `profiles` / `days` / `meals` / `exercises` / `positive_entries` / `ai_requests`)で、以後は新しい番号で足していく
- **マージ済みのマイグレーションは書き換えない**(適用済みの DB で再実行されて壊れる)。未マージの分は作り直してよい。そのときも、マージ済みの分は `git checkout <コミット> -- drizzle/meta/_journal.json` などで戻してから、新しい分だけ生成する
- **例外(デプロイ前だけ)**: 人が「1 本に書き直したい」と指示したときに限り、書き直してよい(これまで 4 回: 2026-11-03・11-04・11-05・11-11。11-11 は、`reports.kind` の CHECK を直すだけだった旧 0009 を `0007_reports` に、ログインの依頼の表と 2 本目のインデックス(旧 0010・0011)を `0009_login_link_requests` に統合し、12 本を 10 本にした。0000〜0006 と 0008 の SQL は、再生成しても元と同じ。履歴の途中だけを直すときは、0006 までを `git show <コミット>:drizzle/meta/_journal.json` の古い journal と一緒に別の `out` に写し、段階ごとに絞った schema で `generate` する。11-05 は、使っていなかった別名の列を、`0003_meals` から外して、最初からなかったことにした。0000〜0002 と 0004〜0006 の SQL は、再生成しても、元とまったく同じになる。**履歴を書き換えたら、手元の開発用・テスト用 DB は、必ず作り直す**(古い履歴を適用済みの DB は、新しい履歴とスキーマが違うまま気づけない。`pg_dump --data-only --exclude-schema=drizzle` で自分の分を退避 → `docker compose down -v` → `up` → `db:migrate` → 戻す))。開発用・テスト用 DB の作り直し(`down -v`)でデータが消えるので、先に伝え、残したいデータは `pg_dump --data-only` で退避する。デプロイ後は使わない。落とし穴:
  - テーマ別にするには、`schema.ts` を段階ごとに一時的に絞って 1 本ずつ `drizzle-kit generate --config=... --name=...` する。古い `drizzle/` は `mv` で退避する(`rm -r` は guard が止める)。**空のフォルダだけ残して生成すると、エラーを出しても終了コード 0 で何も作らない**(フォルダごと無い状態から)。**zsh の配列は 1 始まり**で、名前をループで配列から取ると 1 つずつずれる。最後に、引数なしの `generate` が「変更なし」になることを確かめる
  - **整理前の履歴を持つ DB に `db:migrate` すると、`account` が既にあるというエラーで止まる**(その DB は作り直す)
- 秘密情報は `.env.local` に置き、コミットしない。`.env*` は読まない・編集しない(`.env.example` は可)

## コマンド
- `npm run dev` / `build` / `check`(lint + typecheck。**テストは含まない**)/ `test`
- DB: `docker compose up -d --wait`(ホストのポートは **5433**)、`npm run db:generate` / `db:migrate` / `db:studio`
- ダミーデータ: `npm run db:seed-dummy`(`scripts/seed-dummy.mts`)。3 人(崩れた俺 / 優等生 / 穴だらけ)に 100 日分を入れる。AI は呼ばない。**開発用 DB(`localhost:5433` の `habit_health`)以外では、何もせずに止まる**。id が `dummy-` で始まるユーザーだけを消して入れ直す。`-- --delete` で消すだけ。ログインは `dummy-collapsed@example.com` などにマジックリンクを送る(`ALLOWED_EMAILS` を設定しているときは、ダミーのメールも足す)。`src/` を import せず、列の名前は `schema.ts` と手で合わせる(**スキーマを変えたら、スクリプトも直し、通ることを確かめる**。静かに壊れる)。ダミーは本物のアカウント(`email_verified` が true)として入るので、**データを本番へ移す前に `-- --delete` で消す**
- デモ用の人物: `npm run db:seed-demo`(`scripts/seed-demo.mts`)。「今の自分が、こうなっていたい」という想定の、**2024 年 12 月 1 日から今日まで**(約 700 日。約 9 割の日に記録。2026-11-09 に、400 日から変えた。2025 年が丸ごと入るので、年のレポートも作れる)。**物語の長さは 700 日で固定**(`arcDays`)なので、今日が伸びても、前の日の値は変わらない(デモを入れ直しても、前に作ったレポートと食い違わない)。最初は夜食・体重の悩みが多く、少しずつ夜食が減り、睡眠が整い、筋トレが習慣になる(体重 約 96kg → 82kg(目標は 80kg)。活動係数と目標カロリーは、日に固定した値が途中で変わる)。日記・良かったことも、悩みから達成へ移る(長期レポートと、日記の「悩みの推移」の確認用)。**メールアドレスと表示名は、`scripts/demo.local.json`(`.gitignore`。追跡しない)から読む。無ければ `scripts/demo.example.json`(ダミー)。このリポジトリは公開なので、本物のメールアドレスをコミットしない**。`--dry-run`(DB に入れず、100 日ずつの様子を出す)/ `--delete`。id は `demo-user`。同じメールの別ユーザーがいると、消さずに止まる。**既定では開発用 DB 以外では止まる。本番には、`DATABASE_URL` を本番にして `-- --production --confirm-host=<接続先のホスト名>` を付けたときだけ入る**(ホスト名が合わなければ止まる。開発用 DB には `--production` を使えない。消すのは `demo-user` だけ)。データは入れた日で止まり、毎日は伸びないので、古くなったら入れ直す。本番で使うなら、デモのメールを `ALLOWED_EMAILS` に足す(**その人が作るレポートは、本物の AI の費用を使う**ので、許可リストに入れる期間を限る)。`--confirm-host` は、ホスト名の打ち間違いを防ぐだけの確認(別の本物の DB でも、ホスト名を合わせれば通る)なので、`DATABASE_URL` を本番に向けたまま、別の作業をしない。共通の部品は `scripts/seed-lib.mts`(`seed-dummy.mts` と共有)
- `globals.css` の `@theme` にトークンを足したら、開発サーバーを止めて `.next` を消してから起動し直す(ソースを直しても、古い CSS が配られ続け、新しいクラスに色が付かないことがある。再起動だけでは直らなかった)
- ルート(`app/` のページ)を足す・消したら `npx next typegen`(`PageProps` の型を作り直す)
- Better Auth の設定(`lib/auth.ts`)を変えたら、`DATABASE_URL=... BETTER_AUTH_SECRET=... npm run db:auth-schema` で `auth-schema.ts` を再生成する
- `drizzle-kit generate` は、テーブルの削除と作成が同時にあると対話で聞いてくる(非対話では失敗する)。別のマイグレーションに分ける
- `source .env.local` で読み込むと、そのターミナルに残り、`npm run dev` では `.env.local` より優先される(古い `ALLOWED_EMAILS` のままログインできなくなった)。実 API を呼ぶテストなどでは、`( set -a; source .env.local; set +a; npm test )` のようにサブシェルで実行する
- `.env.local` に `BETTER_AUTH_SECRET` が無いと起動時にエラー。開発中のマジックリンクは `next dev` の端末に出る
- **依存を足すとき**: `npm install` すると、macOS の npm が lock から `@rolldown/binding-*` を落とす(`grep -c '"node_modules/@rolldown/binding-' package-lock.json` が 15 でなければ異常)。手順: ① 空のフォルダに `package.json` と**元の lock の両方**をコピーして `npm install --package-lock-only`(元の lock が無いと、全依存を最新に解き直して `better-auth` などが勝手に上がる)② その lock は `@rolldown/binding-*` を落とすので、そのまま使わず、**元の lock に「新しく増えたパッケージ」(と root の dependencies)だけを足して**合成する ③ `git diff --stat package-lock.json` が追加行だけ、`@rolldown/binding-*` が 15 件、`npm ci --dry-run` が通ることを確かめて `npm ci`
