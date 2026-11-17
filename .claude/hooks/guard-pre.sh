#!/usr/bin/env bash
# PreToolUse: 禁止事項を実行前にブロックする(exit 2 + stderr で Claude に理由を返す)
#
# 位置づけ: これは「うっかり事故の防止」であって、悪意への防御ではない。
# 抜け道は残る(Bash では書き方を変えれば回避できる)。頼れるのは、settings.json の
# permissions.deny と、秘密情報を人が管理すること(.env.local は Claude に読ませない)だけ。
set -u
input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
path=$(jq -r '.tool_input.file_path // .tool_input.path // ""' <<<"$input")
# 書き込まれる内容(Write: content / Edit: new_string / MultiEdit: edits[].new_string)
content=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")' <<<"$input")

block() { echo "BLOCKED by guard-pre.sh: $1" >&2; exit 2; }

project="${CLAUDE_PROJECT_DIR:-$PWD}"

# パスを絶対パスにして、`.` と `..` を畳む(src/../drizzle/x → drizzle/x)
normalize() {
  local p=$1 seg
  [[ "$p" == /* ]] || p="$project/$p"
  local IFS=/
  local -a out=()
  for seg in $p; do
    case "$seg" in
      ''|.) ;;
      ..) [[ ${#out[@]} -gt 0 ]] && unset 'out[${#out[@]}-1]' ;;
      *) out+=("$seg") ;;
    esac
  done
  echo "/${out[*]}"
}

rel=""
if [[ -n "$path" ]]; then
  abs=$(normalize "$path")
  rel=${abs#"$project"/}
fi

# --- 環境変数ファイル(.env*)の読み書き(.env.example は許可) ---
is_env_path() { [[ "$(basename "$1")" == .env* && "$(basename "$1")" != ".env.example" ]]; }
if [[ -n "$path" ]] && is_env_path "$abs"; then
  block "環境変数ファイルは読まない・編集しない(.env.example は可)。秘密情報は人が .env.local に置く"
fi
if [[ "$tool" == "Bash" ]]; then
  # 引用符とバックスラッシュを取り除いてから見る(.e""nv や .en\v のような分割を元に戻す)
  plain=${cmd//[\"\'\\]/}
  stripped=${plain//.env.example/}
  # 直前が空白・/・=・<・>・( のどれかなら .env とみなす(cat<.env.local や $(<.env.local) を含む)。
  # 限界: 変数の連結(a=.en; cat ${a}v.local)などは、正規表現では防げない。settings.json の deny と、
  # 人が .env.local を管理する運用に頼る
  if grep -Eq "(^|[[:space:]/=<>(])\.env(\.[A-Za-z0-9._-]+)?(\$|[[:space:]|;&)])" <<<"$stripped"; then
    block "環境変数ファイルをコマンドで読まない(.env.example は可)"
  fi
  # ワイルドカードで .env を指す書き方(.e* / .en? / .env* / .env.* と、空白の後ろの .* だけ)。
  # grep "foo=.*bar" や ls .git* のような普通のコマンドは止めない
  if grep -Eq "(^|[[:space:]/=<>(])\.e[A-Za-z0-9._-]{0,10}[*?[]|(^|[[:space:]])\.[*?[]" <<<"$plain"; then
    block "隠しファイルをワイルドカードで指定しない(.env を読めてしまうため)。ファイル名を明示する"
  fi
fi

# --- Bash の危険操作 ---
if [[ "$tool" == "Bash" ]]; then
  sep='(^|[;&|][[:space:]]*)'
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(clean|reset[[:space:]]+--hard)" <<<"$cmd" \
    && block "git clean / reset --hard は人が頼むまでしない"
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*checkout([[:space:]]+[^;&|]*)?[[:space:]]--([[:space:]]|\$)|${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*checkout[[:space:]]+\.([[:space:]]|\$)" <<<"$cmd" \
    && block "git checkout -- / checkout . / checkout <rev> -- は、作業中の変更を消すので人が頼むまでしない"
  if grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*restore" <<<"$cmd" && ! grep -Eq -- "--staged" <<<"$cmd"; then
    block "git restore は、作業中の変更を消すので人が頼むまでしない(--staged は可)"
  fi
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*stash([[:space:]]+(push|save|drop|clear|pop|apply|-u|-a|--include-untracked|--all)|[[:space:]]*(\$|[;&|]))" <<<"$cmd" \
    && block "git stash は、作業中の変更を隠す(または消す)ので人が頼むまでしない(list / show は可)"
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*branch[[:space:]]+-D" <<<"$cmd" \
    && block "git branch -D は人が頼むまでしない"
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*push.*(--force|--force-with-lease|--delete|--mirror|[[:space:]]-f([[:space:]]|\$)|[[:space:]]\+[^[:space:]]|[[:space:]]:[^[:space:]])" <<<"$cmd" \
    && block "git push の force / delete / mirror / +ref / :ref は人が頼むまでしない"
  grep -Eq "${sep}rm[[:space:]]+-[a-zA-Z]*[rR]" <<<"$cmd" \
    && block "rm -r は禁止。必要なら人に確認する"
  grep -Eq "(^|[[:space:];&|])find[[:space:]].*(-delete|-exec(dir)?[[:space:]]+(rm|mv))" <<<"$cmd" \
    && block "find の -delete / -exec rm / -exec mv は禁止。必要なら人に確認する"
  grep -Eq "docker[[:space:]]+compose.*[[:space:]]down.*([[:space:]]-v|--volumes)" <<<"$cmd" \
    && block "docker compose down -v はデータ(ボリューム)を消すので、人が頼むまでしない(人が自分で実行する)"
  grep -Eq "drizzle-kit[[:space:]]+push" <<<"$cmd" \
    && block "DB を直接いじらない。スキーマ変更は db:generate → db:migrate のマイグレーションで行う"

  # 保護対象ファイルを Bash で書き換える(リダイレクト・sed -i・tee・mv・rm・cp・ln・install・dd など)
  prot='(package-lock\.json|drizzle/|\.claude/hooks|\.claude/settings)'
  # 宛先が最後の引数になるコマンド(cp / ln / install)は、保護対象が最後に来るときだけ(読むだけの cp は通す)
  dest="[[:space:]][^[:space:]]*${prot}[^[:space:]]*[[:space:]]*(\$|[;&|])"
  # mv は元のファイルを消すので、保護対象がどの位置にあっても止める(tee / rm / truncate と同じ)
  if grep -Eq ">>?[[:space:]]*[^[:space:]]*${prot}|(sed|perl)[[:space:]]+-[a-zA-Z]*i.*${prot}|(tee|mv|rm|truncate)[[:space:]].*${prot}|(cp|ln|install)[[:space:]][^;&|]*${dest}|dd[[:space:]].*of=[^[:space:]]*${prot}" <<<"$plain"; then
    block "保護対象のファイル(drizzle/・package-lock.json・.claude/ の hooks と settings)は、Bash でも書き換えない"
  fi
  # node -e / python -c などの埋め込みスクリプトで、保護対象に書き込む形
  if grep -Eq "(node|python3?|perl|ruby)[[:space:]]+-[a-zA-Z]*[ecp][[:space:]]" <<<"$plain" \
    && grep -Eq "${prot}" <<<"$plain" \
    && grep -Eq "write|append|rename|unlink|rmSync|truncate|open\(" <<<"$plain"; then
    block "保護対象のファイルに、埋め込みスクリプト(node -e など)で書き込まない"
  fi
fi

# --- 保護対象ファイルの編集禁止 ---
if [[ "$tool" =~ ^(Edit|Write|MultiEdit)$ && -n "$rel" ]]; then
  case "$rel" in
    drizzle/*) block "drizzle/ は生成物。スキーマ(src/db/)を直して db:generate で作る" ;;
    package-lock.json) block "package-lock.json は手編集しない(npm コマンド経由で更新する)" ;;
    .claude/hooks/*|.claude/settings.json|.claude/settings.local.json) block ".claude/ の hooks と settings は人が編集する(ガード自身を書き換えさせない)" ;;
  esac

  # --- 型・lint・テストを黙らせる回避の禁止 ---
  case "$rel" in
    *.ts|*.tsx|*.mts|*.mjs)
      grep -Eq '@ts-ignore|@ts-expect-error|eslint-disable|as unknown as|as any\b|:[[:space:]]*any[[:space:]]*[],;=)>|[]|[<,][[:space:]]*any[[:space:]]*[>,]' <<<"$content" \
        && block "@ts-ignore / @ts-expect-error / eslint-disable / as unknown as / any は使わない。型を正しく直す"
      ;;
  esac
  case "$rel" in
    *.test.ts|*.test.tsx)
      grep -Eq '\b(it|test|describe)\.(skip|only|todo)\b' <<<"$content" \
        && block "テストの skip / only / todo は禁止。やむを得ないなら理由を報告して人の確認を待つ"
      ;;
    eslint.config.mjs|vitest.config.mts|tsconfig.json)
      grep -Eq '"(strict[A-Za-z]*|noImplicit[A-Za-z]*|noUnchecked[A-Za-z]*|useUnknownInCatchVariables|exactOptionalPropertyTypes|noFallthroughCasesInSwitch)"[[:space:]]*:[[:space:]]*false|:[[:space:]]*"off"|exclude' <<<"$content" \
        && block "設定を弱める変更(strict 系・noImplicit 系・noUnchecked 系を false、rule off、exclude)は禁止。やむを得ないなら理由を報告して人の確認を待つ"
      ;;
  esac
fi
exit 0
