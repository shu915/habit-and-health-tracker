#!/bin/bash
# 編集した TS/JS ファイルに eslint をかけ、問題があれば Claude に返す
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs)
    cd "$CLAUDE_PROJECT_DIR" || exit 0
    out=$(npx eslint "$file" 2>&1) || { echo "$out" >&2; exit 2; }
    ;;
esac
