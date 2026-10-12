# #38 scoria の指摘を片付ける（error・使われていない export・配列の書き換え・テストの扱い）（2026-10-12）

- **Issue #38（2026-10-12）** scoria の指摘を片付けた。使われていない export を外し、`sort`・`reverse` を元の配列を変えない `toSorted`・`toReversed` にし（apps/web の lib を ES2023 に。Chrome 110・Safari 16・Firefox 115 以降で動く。画面は手元の開発サーバーで見るだけで、配布しない）、名前の重なりを直した。scoria の設定ではファイルごとに規則を外せないため、テストの consistent-function-scoping と no-await-in-loop は残した。`.vue` の style-block は画面の改修のときに直す
