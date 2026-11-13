# DB のバックアップ

本番の DB(Neon)を、毎晩ダンプして、**暗号化**して、Cloudflare R2 に置く(`.github/workflows/db-backup.yml`)。Neon の無料枠の履歴(戻せるのは 6 時間前まで)だけでは足りないため。

## 仕組み
- 毎日 03:00(日本時間)に、GitHub Actions が、`pg_dump`(カスタム形式)→ `age` で暗号化 → R2 に `hht-YYYY-MM-DD.dump.age` として置く。手動でも動かせる(Actions のタブ →「DB backup」→ Run workflow)
- **公開鍵で暗号化**する。復号の鍵(秘密鍵)は、**あなたの手元だけ**にある。GitHub や R2 が漏れても、中身は読めない(健康情報のため)
- 外部のアクションは使わない。このリポジトリのコードも読まない
- 古いファイルは、R2 のバケットの自動削除のルールで消える(保持期間。**退会した人のデータも、この期間はダンプに残る**ので、友人には、この日数を伝える)

## 設定(1 回だけ)
- Cloudflare R2: 非公開のバケット、そのバケットだけの API トークン(オブジェクトの読み書き)、自動削除のルール(30 日など)
- 暗号化の鍵: `age-keygen -o ~/hht-backup-key.txt`。**秘密鍵(このファイル)は、リポジトリに置かず、パスワード管理ツールなどに別に控える。失くすと、バックアップを開けない**。出力の `public key: age1…` が公開鍵
- GitHub の Settings → Secrets and variables → Actions に登録: `BACKUP_DATABASE_URL`(Neon の **direct**。プールなし)、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`(`https://<アカウント ID>.r2.cloudflarestorage.com`)、`R2_BUCKET`、`BACKUP_AGE_PUBLIC_KEY`
- 値は、ログやチャット、コミットに出さない。ワークフローで、値を表示するコマンド(`set -x`、`echo`)を、書かない

## 復元(月に 1 回ほど、練習する。取れていても、戻せなければ意味がない)
**本番の DB に、直接戻さない**。空の DB(Neon の新しいブランチ、または手元の Docker)に戻して、中身を確かめる。
```
# R2 からダウンロード(AWS CLI。R2 の鍵とエンドポイントを環境変数に入れて)
aws s3 cp s3://<バケット>/hht-YYYY-MM-DD.dump.age . --endpoint-url "$R2_ENDPOINT"
# 復号(秘密鍵が要る)
age --decrypt --identity ~/hht-backup-key.txt --output restore.dump hht-YYYY-MM-DD.dump.age
# 空の DB に戻す(接続先は、本番ではないことを、必ず確かめる)
pg_restore --no-owner --no-privileges --dbname "<復元先の接続文字列>" restore.dump
```
戻したら、`SELECT count(*) FROM drizzle.__drizzle_migrations;`(10)と、`user`・`days` の行数を、見る。終わったら、`restore.dump` を消す(健康情報の平文)。

## 注意
- **公開リポジトリは、60 日間、更新が無いと、定時実行が自動で無効になる**(GitHub の決まり。止まっても、失敗の通知は来ない)。使い続けている間は、更新があるので、問題にならない。**月に 1 回、R2 のバケットを開いて、最新のファイルの日付が昨日か見る**(復元の練習と一緒に)。止まっていたら、GitHub の Actions のタブ →「DB backup」→ **「Enable workflow」を押す**(push は要らない。ボタン 1 回で、定時実行が再開する)。GitHub からメールが来ることもあるが、来る保証は無いので、**カレンダーに「毎月 1 日: バックアップの確認」を入れておく**
- Actions のログは、誰でも読める。Secrets は伏せられるが、ワークフローで値を出さない
- `pg_dump` のバージョンは、Neon の PostgreSQL 以上にする(`PG_IMAGE`)。Neon のバージョンを上げたら、ワークフローも見る
- ダンプは、`session`(ログイン中の情報)なども含む。暗号化してあるが、復元した DB は、本番と同じ扱いにする
