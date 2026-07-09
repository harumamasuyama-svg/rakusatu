# ラクサツ！

競売不動産の3点セットPDFと賃料事例をもとに、入札上限価格・推奨入札価格・投資判断レポートを作成するPC向けWebアプリです。

## 主な機能

- ロゴ付きスプラッシュ画面
- 3点セットPDFのアップロードと候補値抽出
- 抽出値の手入力修正
- 積算価格計算
- 賃料事例の手入力、Excel取込、CSV取込
- 経費・取得費、税率、融資条件の入力
- 入札価格決定エンジン
- 入札価格別シミュレーション
- A/B/C投資判断
- ロゴ入りA4縦1枚レポートのPDF出力
- ブラウザのローカル保存

## セットアップ

```bash
pnpm install
pnpm dev
```

起動後、ブラウザで次を開きます。

```text
http://localhost:5173/
```

## ビルド

```bash
pnpm build
```

生成物は `dist/` に出力されます。通常利用は `file://` で直接 `index.html` を開くのではなく、ローカルサーバー経由で開いてください。

## GitHub Pages

このリポジトリ名は `rakusatu` を想定しているため、Viteの `base` は `/rakusatu/` に設定しています。

GitHub Pagesで公開する場合は、GitHubのリポジトリ設定で次を選びます。

- Settings
- Pages
- Build and deployment
- Source: GitHub Actions

`main` ブランチへpushすると、`.github/workflows/deploy.yml` が自動でビルドと公開を行います。

公開URL:

```text
https://harumamasuyama-svg.github.io/rakusatu/
```

## GitHubにアップロードするファイル

主に以下をアップロードします。

- `src/`
- `public/`
- `index.html`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `vite.config.ts`
- `.gitignore`
- `README.md`

以下はアップロードしません。

- `node_modules/`
- `dist/`
- `work/`
- `outputs/`
- 実物件PDF、Excel原本、CSVなどの個別資料

## 注意

PDF抽出、税額、投資判断は概算です。入札前には必ず3点セット原本、税制、融資条件、専門家確認を行ってください。
