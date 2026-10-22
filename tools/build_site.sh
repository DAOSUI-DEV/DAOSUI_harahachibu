#!/bin/sh
# Cloudflare Pages 用：公開するファイルだけを site/ に集める（tools・README・.github は公開しない）
#   Cloudflare Pages の設定：ビルドコマンド「sh tools/build_site.sh」、出力ディレクトリ「site」
set -eu
cd "$(dirname "$0")/.."
rm -rf site
mkdir site
cp index.html app.css manifest.webmanifest sw.js site/
cp -R js data fonts icons vendor site/
cp tools/site/_headers site/_headers
find site -name '__pycache__' -prune -exec rm -rf {} +
echo "site/ を作った：$(find site -type f | wc -l | tr -d ' ') ファイル"
