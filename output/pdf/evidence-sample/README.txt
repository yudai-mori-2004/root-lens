RootLens 証跡一式のサンプル

rootlens-evidence-demo.json  証跡JSON
files/                       承認されたファイル一式（任意形式・任意個数）
agreements/                  承認時点の現場合意書・スタッフ同意書のコピー

検証:
  cd web
  npm run verify:evidence -- ../output/pdf/evidence-sample/rootlens-evidence-demo.json
