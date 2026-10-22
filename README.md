# はらはちぶ（DAOSUI_harahachibu）

食べた物のカロリーがすぐわかって、食べ過ぎかどうかがひと目でわかる記録アプリ。iPhone の Safari で開いて「ホーム画面に追加」して使う（Web アプリ）。

- 記録するとお茶碗が満ちていく。目安を超えるとあふれる（緑→黄→朱）
- 食べ物の検索（日本食品標準成分表の全2,538食品＋料理・コンビニの目安）、写真から推定（スマホの中だけで判定）、袋の成分表示の入力、マイメニュー
- 目標体重と期限から1日の目安を計算（安全装置つき）
- カレンダー、体重・体脂肪のグラフ（傾向線と到達日の予想）、運動の記録、カロリー貯金（週の合計）
- 次の食事の提案（コンビニの組み合わせ・自炊レシピ・外食のコツ）

## 個人情報・セキュリティの設定

| 項目 | 設定 |
| --- | --- |
| 記録の保存場所 | このスマホのブラウザの中だけ（localStorage と IndexedDB）。サーバーはない。ログインもない |
| 外への通信 | アプリ本体の読み込み（GitHub Pages）と、写真判定のAIデータの初回ダウンロード（Hugging Face）だけ。Content-Security-Policy で、それ以外の通信先をブロック |
| 写真 | 判定はスマホの中（Web Worker）で実行。保存する時は長い辺720pxに縮小し、位置情報などの付加情報（Exif）を消す |
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
- 料理・コンビニ・レシピの値：成分表などをもとにした目安（店や作り方で変わる）
- 運動のメッツ：国立健康・栄養研究所「改訂版 身体活動のメッツ（METs）表」を参考にした目安
- [Transformers.js](https://github.com/huggingface/transformers.js)（Apache-2.0）：`vendor/transformers/transformers.LICENSE.txt`
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）：`vendor/transformers/ONNXRUNTIME.LICENSE.txt`
  - `transformers.min.js` は npm の `@huggingface/transformers@4.3.1` の `dist/transformers.min.js`。GitHub の秘密情報チェックがクラス名 `Mistral3…Generation`（英数字32文字）を APIキーと誤検知するため、`tools/patch_vendor.py` でその名前だけ「文字列をつなぐ形」に書き換えている（動作は同じ。秘密情報は入っていない）
- 写真判定のAI：OpenAI CLIP ViT-B/32（MIT）。[Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) を各スマホが初回にダウンロード（このリポジトリには含めない）
- フォント：Zen Maru Gothic（SIL Open Font License 1.1）：`fonts/OFL-zen-maru-gothic.txt`

## ファイル

```
index.html / app.css / manifest.webmanifest / sw.js（オフライン用）
js/      app（起動）・today（今日）・add（記録）・history（カレンダー・グラフ）・suggestview / suggest（提案）
         settings（設定）・calc（計算）・store（保存）・foods（検索）・ai / ai-worker（写真判定）・backup・charts・util・state
data/    foods.json（成分表）・dishes.js（料理の目安）・recipes.js・exercises.js・photo-labels.js（写真判定の候補）
vendor/  transformers（AIを動かすライブラリ）
fonts/   Zen Maru Gothic（太さ500・700）
tools/   make_foods.py・fonts.py・icons.py（データやアイコンを作り直す道具）
```

アプリを更新した時は `sw.js` の `CACHE` の番号を上げる（スマホに新しい版が届く）。
