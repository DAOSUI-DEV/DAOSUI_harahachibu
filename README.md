# はらはちぶ（DAOSUI_harahachibu）

食べた物のカロリーがすぐわかって、食べ過ぎかどうかがひと目でわかる記録アプリ。iPhone の Safari で開いて「ホーム画面に追加」して使う（Web アプリ）。

- 記録するとお茶碗が満ちていく。目安を超えるとあふれる（緑→黄→朱）
- 食べ物の検索：日本食品標準成分表の全2,538食品＋料理・コンビニの目安 約1,370品＋チェーン店13店のメニュー 996品（各社の公式の栄養成分）＋日本で売っている商品（Open Food Facts・毎月自動で更新）
- バーコードで探す（カメラを向けるだけで読む。読めない時は写真から。見つからない商品は1回入れれば次からバーコードで出る）、写真から推定（スマホの中だけで判定・約300種の候補・種類で絞り込み）、袋の成分表示の入力、マイメニュー
- 記録をラクに：写真のあとに量を1タップ（半分残した・少なめ・普通・大盛り）、「前と同じ」（前の日・よく食べる組み合わせをワンタップ）、「、」で区切ってまとめて記録、材料（成分表）から自分の料理を作る
- 1週間の成績を画像にしてLINEなどで送る（名前・今の体重・食べた物は載らない）
- iPhoneとの連携：ショートカットでヘルスケアの体重を取り込む・食べた分をヘルスケアに書き込む、記録忘れのお知らせ（カレンダーに毎日の予定を入れる）
- 写真つきで記録すると、その写真の特徴をスマホの中に覚えて、次から似た写真の時に「前に記録した物」として一番上に出す
- 目標体重と期限から1日の目安を計算（安全装置つき）
- カレンダー、体重・体脂肪のグラフ（傾向線と到達日の予想）、運動の記録、カロリー貯金（週の合計）
- 次の食事の提案（コンビニの組み合わせ・自炊レシピ・外食のコツ）

## 個人情報・セキュリティの設定

| 項目 | 設定 |
| --- | --- |
| 記録の保存場所 | このスマホのブラウザの中だけ（localStorage と IndexedDB）。サーバーはない。ログインもない |
| 外への通信 | アプリ本体と食品データの読み込み（GitHub Pages）と、写真判定のAIデータの初回ダウンロード（Hugging Face）だけ。Content-Security-Policy で、それ以外の通信先をブロック |
| 検索・バーコード | 食品データを丸ごとスマホに読み込んで、スマホの中で探す。検索した言葉や読み取ったバーコードはどこにも送らない。バーコードの読み取りもスマホの中（WebAssembly） |
| カメラ | バーコードを読む画面の間だけ使う。映像は保存も送信もしない。画面を閉じた時・アプリを離れた時にすぐ止める |
| ヘルスケア | iPhoneの「ショートカット」アプリを通して、iPhoneの中だけでやりとりする（体重はショートカットがコピー → アプリで貼り付け。食べた分はショートカットに渡す）。外のサーバーは通らない |
| 成績の画像 | スマホの中で作る。載せる物は自分で選ぶ（体重は増減だけ・選んだ時だけ） |
| 写真 | 判定はスマホの中（Web Worker）で実行。保存する時は長い辺720pxに縮小し、位置情報などの付加情報（Exif）を消す。「前に記録した物」のために覚えるのは写真の特徴（数字の列）だけで、スマホの中の IndexedDB に置く（設定から消せる） |
| バックアップ | パスワードで暗号化した1つのファイル（PBKDF2-SHA256 60万回 → AES-GCM 256bit）。パスワードはどこにも保存しない |
| 外部のスクリプト | 使わない（すべてこのリポジトリの中のファイル） |
| リファラ | 送らない（no-referrer） |
| 削除 | 設定 →「すべての記録を消す」で、記録・写真・AIデータをまとめて消せる |

第2弾で追加予定：友達との共有（スマホの中で暗号化してから Cloudflare に置く・写真は30日で自動削除・招待リンクは24時間で期限切れ）、AIに詳しく聞く、記録忘れの通知と週の振り返り。

## 計算の中身

- 基礎代謝：国立健康・栄養研究所の式  
  男性 `(0.0481×体重 + 0.0234×身長 − 0.0138×年齢 − 0.4235) × 1000 ÷ 4.186`、女性は最後が `− 0.9708`
- 1日に使う量：基礎代謝 × 活動量（1.50 / 1.75 / 2.00）
- 体脂肪1kg ≒ 7,200kcal として、期限までに必要な1日の減らす量を計算
- 安全装置：
  - 目安は基礎代謝より下にしない
  - 減らすのは1日750kcalまで、かつ1週間に体重の1%まで（おすすめは0.5%）。超える期限は設定できず、おすすめの期限を出す
  - 目標体重が BMI 18.5 未満なら設定できない
  - 18歳未満は目標カロリーを出さない（記録だけ）
- 栄養の目安：たんぱく質20%・脂質25%・炭水化物55%（エネルギー比）、食塩は男性7.5g・女性6.5g未満
- 運動：`(メッツ − 1) × 体重 × 時間 × 1.05`（安静時の分は引いてある）
- 体重の傾向線：指数平滑（1日あたり α=0.1）、最近3週間の傾きから目標に届く日を予想
- カロリー貯金：月曜はじまりの1週間で「その日に使える量 − 食べた量」を合計（記録がない日は目安どおり食べたとみなす）

## 出典・ライセンス

- 食品の成分：日本食品標準成分表（八訂）増補2023年から引用（文部科学省）。`tools/make_foods.py` で Excel（第2章 データ）から `data/foods.json` を作成
- 料理・コンビニ・レシピの値：成分表などをもとにした目安（店や作り方で変わる）。カロリーメイト・カップヌードル・どん兵衛・赤いきつね・緑のたぬき・U.F.O.・ペヤング・ファミチキなどの商品は、商品の栄養成分表示の値（2026年10月時点で調べた値。リニューアルで変わることがある）
- チェーン店のメニュー：各社が公開している栄養成分（公式ページ・PDF）から、栄養成分だけを `tools/chains/*.txt` に写した物。店ごとの出典と確認した日は各ファイルの1行目とアプリの設定画面に書いてある。メニューや量の変更で値は変わる。`tools/make_chains.py` で `data/chains.json` を作る（店を足す時は txt を1つ足して動かすだけ）
- 商品（バーコード）：Contains data from [Open Food Facts](https://world.openfoodfacts.org/), available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/)。GitHub Actions（`.github/workflows/off-jp.yml`）が毎月、日本で売っている商品のうち栄養成分がある物を `tools/off_jp.py` で取り出して `data/off-jp.json` を作り直す。`data/off-jp.json` も ODbL
- 運動のメッツ：国立健康・栄養研究所「改訂版 身体活動のメッツ（METs）表」を参考にした目安
- [Transformers.js](https://github.com/huggingface/transformers.js)（Apache-2.0）：`vendor/transformers/transformers.LICENSE.txt`
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）：`vendor/transformers/ONNXRUNTIME.LICENSE.txt`
  - `transformers.min.js` は npm の `@huggingface/transformers@4.3.1` の `dist/transformers.min.js`。GitHub の秘密情報チェックがクラス名 `Mistral3…Generation`（英数字32文字）を APIキーと誤検知するため、`tools/patch_vendor.py` でその名前だけ「文字列をつなぐ形」に書き換えている（動作は同じ。秘密情報は入っていない）
- 写真判定のAI：Google SigLIP base patch16-224（Apache-2.0）。[Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224) を各スマホが初回にダウンロード（このリポジトリには含めない。初回約230MB、準備後にスマホに残るのは約120MB）。1.0 では OpenAI CLIP ViT-B/32 を使っていたが、当たりにくかったので 1.1 で入れ替えた
- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.6（MIT）と [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp)（Apache-2.0）：バーコードの読み取り。`vendor/zxing/zxing-wasm.LICENSE.txt`・`vendor/zxing/NOTICE.txt`
- フォント：Zen Maru Gothic（SIL Open Font License 1.1）：`fonts/OFL-zen-maru-gothic.txt`

## ファイル

```
index.html / app.css / manifest.webmanifest / sw.js（オフライン用）
js/      app（起動）・today（今日）・add（記録）・history（カレンダー・グラフ）・suggestview / suggest（提案）
         settings（設定）・calc（計算）・store（保存）・foods（検索）・barcode（バーコード）・ai / ai-worker（写真判定）・backup・charts・util・state
         ios（ショートカット・ヘルスケア・カレンダー）・report（成績の画像）
data/    foods.json（成分表）・dishes.js / dishes-more.json（料理の目安）・chains.json（チェーン店）・off-jp.json（商品・自動で作る）
         recipes.js・exercises.js・photo-labels.js（写真判定の候補）
vendor/  transformers（AIを動かすライブラリ）・zxing（バーコードを読むライブラリ）
fonts/   Zen Maru Gothic（太さ500・700）
tools/   make_foods.py・make_dishes_more.py・make_chains.py（chains/*.txt から）・off_jp.py・fonts.py・icons.py・patch_vendor.py
         build_site.sh・site/_headers（Cloudflare Pages で公開する時に使う）
.github/workflows/off-jp.yml（商品データを毎月作り直す）
```

アプリを更新した時は `sw.js` の `CACHE` の番号を上げる（スマホに新しい版が届く）。

## Cloudflare Pages で公開する時（リポジトリを非公開にする場合）

GitHub の無料プランでは、非公開リポジトリから GitHub Pages を使えない。Cloudflare Pages（無料）なら非公開リポジトリから公開できる。

- ビルドコマンド：`sh tools/build_site.sh`／出力ディレクトリ：`site`
- `site/` に入るのはアプリに必要なファイルだけ（tools・README・.github は公開しない）。`tools/site/_headers` でセキュリティのヘッダー（CSP・frame-ancestors・Permissions-Policy など）も付く
- 記録はURL（サイト）ごとに保存されるので、URLが変わる時は、前のURLで「バックアップを作る」→ 新しいURLで「バックアップから戻す」
