# JANメモ

JANコードを連続でスキャンし、一覧をテキストでコピーするスマホアプリ。コピーした一覧をAIに渡して、商品名の検索や常備品リストの整理に使う。

## 起動手順

Node.js の LTS 版と npm を用意する。

```sh
npm ci
npx expo start
```

iOS / Android の Expo Go でターミナルの QR コードを読み取る。

開発時の確認コマンド:

```sh
npx tsc --noEmit
npx expo lint
npx expo-doctor
npm test -- --runInBand
```

ユニットテストは `*.test.ts` / `*.test.tsx` に追加する。

## 使い方

現在は初期構築の段階。起動すると背景色 `#F7F7F7` の空の1画面を表示する。
