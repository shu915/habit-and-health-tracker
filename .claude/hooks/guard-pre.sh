#!/usr/bin/env bash
# PreToolUse: 禁止事項を実行前にブロックする(exit 2 + stderr で Claude に理由を返す)
set -u
input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
path=$(jq -r '.tool_input.file_path // .tool_input.path // ""' <<<"$input")
# 書き込まれる内容(Write: content / Edit: new_string / MultiEdit: edits[].new_string)
content=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")' <<<"$input")

block() { echo "BLOCKED by guard-pre.sh: $1" >&2; exit 2; }

rel=${path#"${CLAUDE_PROJECT_DIR:-$PWD}"/}

# --- 環境変数ファイル(.env*)の読み書き(.env.example は許可) ---
is_env_path() { [[ "$(basename "$1")" == .env* && "$(basename "$1")" != ".env.example" ]]; }
if [[ -n "$path" ]] && is_env_path "$path"; then
  block "環境変数ファイルは読まない・編集しない(.env.example は可)。秘密情報は人が .env.local に置く"
fi
if [[ "$tool" == "Bash" ]]; then
  stripped=${cmd//.env.example/}
  if grep -Eq "(^|[[:space:]/\"'=])\.env(\.[A-Za-z0-9._-]+)?(\$|[[:space:]\"'|;&)])" <<<"$stripped"; then
    block "環境変数ファイルをコマンドで読まない(.env.example は可)"
  fi
fi

# --- Bash の危険操作 ---
if [[ "$tool" == "Bash" ]]; then
  sep='(^|[;&|][[:space:]]*)'
  grep -Eq "${sep}git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(clean|reset[[:space:]]+--hard)" <<<"$cmd" \
    && block "git clean / reset --hard は人が頼むまでしない"
  grep -Eq "${sep}rm[[:space:]]+-[a-zA-Z]*[rR]" <<<"$cmd" \
    && block "rm -r は禁止。必要なら人に確認する"
  grep -Eq "drizzle-kit[[:space:]]+push" <<<"$cmd" \
    && block "DB を直接いじらない。スキーマ変更は db:generate → db:migrate のマイグレーションで行う"
fi

# --- 保護対象ファイルの編集禁止 ---
if [[ "$tool" =~ ^(Edit|Write|MultiEdit)$ && -n "$rel" ]]; then
  case "$rel" in
    drizzle/*_enable_pgvector.sql) ;; # 手書きのカスタムマイグレーション(CREATE EXTENSION)だけ許可
    drizzle/*) block "drizzle/ は生成物。スキーマ(src/db/)を直して db:generate で作る" ;;
    package-lock.json) block "package-lock.json は手編集しない(npm コマンド経由で更新する)" ;;
  esac

  # --- 型・lint・テストを黙らせる回避の禁止 ---
  case "$rel" in
    *.ts|*.tsx|*.mts|*.mjs)
      grep -Eq '@ts-ignore|@ts-expect-error|eslint-disable|as unknown as|as any\b|:[[:space:]]*any[[:space:]]*[],;=)>|[]|[<,][[:space:]]*any[[:space:]]*[>,]' <<<"$content" \
        && block "@ts-ignore / @ts-expect-error / eslint-disable / as unknown as / any は使わない。型を正しく直す"
      ;;
  esac
  case "$rel" in
    *.test.ts|*.test.tsx|eslint.config.mjs|vitest.config.mts|tsconfig.json)
      grep -Eq '\b(it|test|describe)\.(skip|only|todo)\b|"strict"[[:space:]]*:[[:space:]]*false|:[[:space:]]*"off"|exclude' <<<"$content" \
        && block "テスト/設定を弱める変更(skip/only/todo, strict:false, rule off, exclude)は禁止。やむを得ないなら理由を報告して人の確認を待つ"
      ;;
  esac
fi
exit 0
