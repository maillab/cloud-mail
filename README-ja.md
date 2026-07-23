<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Cloud Mail</h1>
    <p align="center">Cloudflare 上で動作する、シンプルでレスポンシブなメールサービス。メール送信と添付ファイルの送受信に対応 🎉</p>
    <p align="center">
        <a href="/README.md" style="margin-left: 5px">简体中文</a> | <a href="/README-en.md" style="margin-left: 5px">English</a> | 日本語
    </p>
    <p align="center">
        <a href="https://github.com/maillab/cloud-mail/tree/main?tab=MIT-1-ov-file" target="_blank" >
            <img src="https://img.shields.io/badge/license-MIT-green" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/releases" target="_blank" >
            <img src="https://img.shields.io/github/v/release/maillab/cloud-mail" alt="releases" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/issues" >
            <img src="https://img.shields.io/github/issues/maillab/cloud-mail" alt="issues" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/stargazers" target="_blank">
            <img src="https://img.shields.io/github/stars/maillab/cloud-mail" alt="stargazers" />
        </a>
        <a href="https://github.com/maillab/cloud-mail/forks" target="_blank" >
            <img src="https://img.shields.io/github/forks/maillab/cloud-mail" alt="forks" />
        </a>
    </p>
    <p align="center">
        <a href="https://trendshift.io/repositories/20459" target="_blank" >
            <img src="https://trendshift.io/api/badge/repositories/20459" alt="trendshift" >
        </a>
    </p>
</p>


## プロジェクト概要

ドメインを1つ用意するだけで、大手メールサービスのように複数の異なるメールアドレスを作成できます。本プロジェクトは Cloudflare Workers にデプロイでき、サーバーコストを抑えながら独自のメールサービスを構築できます。

## プロジェクトのデモ

- [オンラインデモ](https://skymail.ink)<br>
- [デプロイガイド](https://doc.skymail.ink)<br>

| ![](/doc/demo/demo1.png) | ![](/doc/demo/demo2.png) |
|--------------------------|--------------------------|
| ![](/doc/demo/demo3.png) | ![](/doc/demo/demo4.png) |




## 機能

- **💰 低コストで利用**：Cloudflare Workers にデプロイしてサーバーコストを削減できます。

- **💻 レスポンシブデザイン**：PC とほとんどのモバイルブラウザにレイアウトが自動で適応します。

- **📧 メール送信**：Resend を統合し、一斉送信、インライン画像と添付ファイルの送信、送信状態の確認に対応します。

- **🛡️ 管理者機能**：ユーザーとメールを管理でき、RBAC によって機能や利用リソースへのアクセスを制御します。

- **📦 添付ファイルの送受信**：添付ファイルの送受信に対応し、R2 オブジェクトストレージを使ってファイルを保存、ダウンロードします。

- **🔔 メール通知**：受信メールを Telegram ボットや他社のメールアドレスへ転送できます。

- **📡 オープン API**：API によるユーザーの一括作成と、複数条件でのメール検索に対応します。

- **🔢 認証コードの認識**：Workers AI を使ってメール内の認証コードを自動認識します。

- **📈 データ可視化**：ECharts を使ってシステムの詳細データやユーザーのメール増加を可視化します。

- **🎨 カスタマイズ**：サイトのタイトル、ログイン背景、透明度をカスタマイズできます。

- **🤖 ボット対策**：Turnstile を統合し、ボットによる一括登録を防止します。

- **📜 その他の機能**：開発中です...



## 技術スタック

- **プラットフォーム**：[Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web フレームワーク**：[Hono](https://hono.dev/)

- **ORM：**[Drizzle](https://orm.drizzle.team/)

- **フロントエンドフレームワーク**：[Vue3](https://vuejs.org/)

- **UI フレームワーク**：[Element Plus](https://element-plus.org/)

- **メール送信：** [Resend](https://resend.com/)

- **キャッシュ**：[Cloudflare KV](https://developers.cloudflare.com/kv/)

- **データベース**：[Cloudflare D1](https://developers.cloudflare.com/d1/)

- **ファイルストレージ**：[Cloudflare R2](https://developers.cloudflare.com/r2/)

## ディレクトリ構成

```
cloud-mail
├── mail-worker				    # Worker バックエンドプロジェクト
│   ├── src
│   │   ├── api	 			    # API レイヤー
│   │   ├── const  			    # プロジェクト定数
│   │   ├── dao                 # データアクセスレイヤー
│   │   ├── email			    # メールの受信と処理
│   │   ├── entity			    # データベースエンティティ
│   │   ├── error			    # カスタム例外
│   │   ├── hono			    # Web フレームワーク設定、インターセプター、グローバル例外など
│   │   ├── i18n			    # 国際化
│   │   ├── init			    # データベースとキャッシュの初期化
│   │   ├── model			    # レスポンスデータのモデル
│   │   ├── security			# 認証と認可
│   │   ├── service			    # ビジネスサービスレイヤー
│   │   ├── template			# メッセージテンプレート
│   │   ├── utils			    # ユーティリティ
│   │   └── index.js			# エントリーファイル
│   ├── pageckge.json			# プロジェクトの依存関係
│   └── wrangler.toml			# プロジェクト設定
│
├── mail-vue				    # Vue フロントエンドプロジェクト
│   ├── src
│   │   ├── axios 			    # Axios 設定
│   │   ├── components			# カスタムコンポーネント
│   │   ├── echarts			    # ECharts コンポーネントのインポート
│   │   ├── i18n			    # 国際化
│   │   ├── init			    # 起動時の初期化
│   │   ├── layout			    # メインレイアウトコンポーネント
│   │   ├── perm			    # 権限認証
│   │   ├── request			    # API リクエスト
│   │   ├── router			    # ルーター設定
│   │   ├── store			    # グローバル状態管理
│   │   ├── utils			    # ユーティリティ
│   │   ├── views			    # ページコンポーネント
│   │   ├── app.vue			    # エントリーコンポーネント
│   │   ├── main.js			    # JavaScript エントリーファイル
│   │   └── style.css			# グローバル CSS
│   ├── package.json			# プロジェクトの依存関係
└── └── env.release				# プロジェクト設定
```

## スポンサー

<a href="https://doc.skymail.ink/support.html" >
<img width="170px" src="./doc/images/support.png" alt="">
</a>

## ライセンス

本プロジェクトは [MIT](LICENSE) ライセンスで提供されています。


## コミュニティ

[Telegram](https://t.me/cloud_mail_tg)
