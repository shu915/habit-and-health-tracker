#!/bin/bash
# 環境変数ファイル(.env*)の編集を拒否する。秘密情報は人間が .env.local に置く
file=$(jq -r '.tool_input.file_path // empty')
case "$(basename "$file")" in
  .env*)
    echo "環境変数ファイルは編集できません。秘密情報は手動で .env.local に置いてください。" >&2
    exit 2
    ;;
esac
