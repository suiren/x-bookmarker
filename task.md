# Implementation Plan

## Phase 1: MVP (Minimum Viable Product)

### 1. 基盤整備とプロジェクト構造確立

- [x] 1. プロジェクト環境構築・設定ファイル作成 🟢（最小実装済）
  - ✅ `.env.example`ファイルを作成し、必要な環境変数を定義
  - ✅ `docker-compose.yml`の完成（PostgreSQL、Redis、アプリケーション）
  - ✅ TypeScript設定の統一（`tsconfig.json`のベース設定作成）
  - ✅ ESLint/Prettier設定の統一（ワークスペース全体での一貫性確保）
  - ✅ 開発用スクリプトの整備（`npm run dev`, `npm run build`, `npm run test`）
  - _Requirements: 9_

- [x] 2. 共有ライブラリ（@x-bookmarker/shared）の実装完成 🟢（最小実装済）
  - ✅ Zodスキーマの定義（User, Bookmark, Category, Tag, SearchQuery等）
  - ✅ API型定義の完成（APIResponse, PaginatedResponse, エラー型）
  - ✅ バリデーション関数の実装
  - ✅ ユーティリティ関数の実装（日付フォーマット、文字列処理等）
  - ✅ テストスイート完成（66テスト全通過）
  - _Requirements: 9_

### 2. データベース・バックエンドコア機能

- [x] 3. データベースマイグレーション実行とシード機能 🟢（最小実装済）
  - ✅ 既存マイグレーションファイルの実行確認
  - ✅ `src/database/migrate.ts`、`src/database/seed.ts`の実装
  - ✅ デフォルトカテゴリのシード実装（技術・AI、趣味・ゲーム、料理・レシピ、読書・書籍、未分類）
  - ✅ データベース接続プール設定とトランザクション管理
  - _Requirements: 2, 6_

- [x] 4. 認証・セキュリティ基盤実装 🟢（最小実装済）
  - ✅ JWT認証システムの実装（`jsonwebtoken`ライブラリ使用）
  - ✅ Express middleware実装（認証チェック、レート制限）
  - ✅ X OAuth 2.0フロー実装（`/auth/x/oauth`, `/auth/x/callback`エンドポイント）
  - ✅ セッション管理とタイムアウト機能（Redis使用）
  - ✅ HTTPS通信の強制とCORS設定（`helmet`, `cors`ライブラリ）
  - _Requirements: 1, 8_

- [x] 5. X API統合サービス実装 🟢（最小実装済）
  - ✅ X API v2クライアントの実装（`axios`ベースの専用クライアント）
  - ✅ OAuth認証フロー完成（アクセストークン取得・更新）
  - ✅ ブックマーク取得APIの実装（ページネーション対応）
  - ✅ レート制限対応（設計書記載の75requests/15min制限）
  - ✅ 指数バックオフによるリトライ機能
  - ✅ トークン自動更新機能
  - _Requirements: 1_

### 3. コアAPI・データ管理機能

- [x] 6. ブックマーク管理API実装 ✅️（リファクタリング済）
  - ✅ `GET /bookmarks` - ユーザーブックマーク一覧取得
  - ✅ `POST /bookmarks` - 新規ブックマーク作成
  - ✅ `PUT /bookmarks/:id` - ブックマーク更新
  - ✅ `DELETE /bookmarks/:id` - ブックマーク削除
  - ✅ `GET /categories` - カテゴリ一覧取得
  - ✅ `POST /categories` - カテゴリ作成（色・アイコン・階層対応）
  - ✅ `PUT /categories/:id` - カテゴリ編集
  - ✅ `DELETE /categories/:id` - カテゴリ削除
  - ✅ `PUT /categories/order` - カテゴリ並び順変更
  - ✅ `POST /bookmarks/bulk` - 一括操作API（複数選択・移動）
  - _Requirements: 2, 3_

- [x] 7. 検索・フィルタリング機能実装 ✅️（リファクタリング済）
  - ✅ `GET /search` - 複合検索エンドポイント実装
  - ✅ PostgreSQL全文検索実装（tsvectorとGINインデックス活用）
  - ✅ 複合検索条件サポート（テキスト・カテゴリ・タグ・日付・作者）
  - ✅ ファセット検索実装（カテゴリ・タグ・作者別の件数集計）
  - ✅ 検索結果ソート機能（関連度・日付・作者）
  - ✅ `GET /search/history` - 検索履歴取得
  - ✅ `POST /search/history` - 検索履歴保存
  - ✅ 検索アナリティクス・提案機能
  - _Requirements: 4_

### 4. フロントエンド基礎実装

- [x] 8. フロントエンド基盤構築 ✅
  - Vite + React + TypeScript環境構築完了確認
  - React Router DOM設定（認証ルート・プライベートルート）
  - Zustand状態管理設定（認証状態・ユーザー設定・ブックマーク状態）
  - Axios + React Query設定（API通信・キャッシュ戦略）
  - Tailwind CSS設定とデザインシステム構築
  - Lucide React アイコンライブラリ統合
  - _Requirements: 5_

- [x] 9. 認証画面とユーザー管理UI ✅️（リファクタリング済）
  - ✅ ログイン画面実装（X OAuth認証ボタン）
  - ✅ OAuth認証フロー画面（認証中・エラー・成功状態）
  - ✅ ユーザー設定画面実装（テーマ・表示モード・自動同期設定）
  - ✅ テーマ切り替え機能（ダーク・ライトモード、システム設定連動）
  - ✅ 認証状態管理（Zustand + React Query）
  - ✅ ヘッダーコンポーネント（ユーザー情報・ナビゲーション・モバイル対応）
  - _Requirements: 1, 5, 8_

- [x] 10. ブックマーク表示・管理UI ✅️（リファクタリング済）
  - ✅ ブックマーク一覧コンポーネント（グリッドビュー・リストビュー）
  - ✅ ブックマークカードコンポーネント（画像プレビュー・メタ情報表示）
  - ✅ カテゴリ管理サイドバー（基本機能・色・アイコン）※階層表示は今後対応
  - ✅ ドラッグ&ドロップ機能実装（`react-dnd`使用）
  - ✅ タグ管理UI（タグ追加・削除・色設定）
  - ✅ 一括選択機能（チェックボックス・Shift+Click対応）
  - ✅ 包括的なテストケース実装（30テスト・カバレッジ完備）
  - ✅ アクセシビリティ対応（ARIA属性・キーボードナビゲーション）
  - _Requirements: 2, 3, 5_

### 5. 同期・データインポート機能

- [x] 11. ブックマーク同期機能実装 ✅️（リファクタリング済）
  - ✅ 同期ジョブ管理システム（Bull Queueライブラリ使用）
  - ✅ `POST /bookmarks/sync` - 同期開始エンドポイント
  - ✅ `GET /sync/status/:jobId` - 同期進捗取得
  - ✅ WebSocket/Server-Sent Events実装（リアルタイム進捗表示）
  - ✅ バックグラウンド処理でのX APIデータ取得
  - ✅ 同期エラーハンドリング（部分失敗・リトライ機能）
  - ✅ 同期履歴管理
  - _Requirements: 1, 6_

- [x] 12. 検索機能UI実装 ✅️（リファクタリング済）
  - ✅ 検索バーコンポーネント（オートコンプリート機能）
  - ✅ 高度な検索フィルターコンポーネント
  - ✅ ファセット検索UI（カテゴリ・タグ・作者での絞り込み）
  - ✅ 検索結果表示コンポーネント（ハイライト・ページネーション）
  - ✅ 検索履歴UI（保存・再実行・削除機能）
  - ✅ ソート機能UI（関連度・日付・作者）
  - _Requirements: 4_

## Phase 2: 機能拡張・パフォーマンス最適化

### 6. パフォーマンス最適化

- [x] 13. フロントエンドパフォーマンス最適化 ✅️（リファクタリング済）
  - ✅ 仮想スクロール実装（`@tanstack/react-virtual`使用）
  - ✅ 画像遅延読み込み実装（Intersection Observer API）
  - ✅ コード分割とバンドル最適化（Viteの動的インポート活用）
  - ✅ React.memo、useMemo、useCallbackによる最適化
  - ✅ ブックマーク画像のプログレッシブ読み込み
  - ✅ キャッシュ戦略実装（React Query staleTime調整）
  - _Requirements: 7_

- [x] 14. バックエンドパフォーマンス最適化 ✅️（リファクタリング済）
  - ✅ データベースクエリ最適化（EXPLAIN ANALYZEによる分析）
  - ✅ Redis キャッシング実装（検索結果・ユーザーセッション）
  - ✅ API レスポンス時間最適化（レスポンス圧縮・ETags）
  - ✅ バックグラウンドジョブ最適化（並列処理・バッチサイズ調整）
  - ✅ データベース接続プール最適化
  - _Requirements: 7_

### 7. データ管理・バックアップ機能

- [x] 15. データエクスポート・インポート機能 ✅️（リファクタリング済）
  - ✅ `POST /export` - データエクスポートエンドポイント（JSON/CSV/ZIP形式）
  - ✅ `POST /import` - 他サービスからのインポート機能（Chrome、Firefox、CSV、JSON対応）
  - ✅ AWS S3統合実装（`@aws-sdk/client-s3`使用）またはローカルストレージ
  - ✅ 自動バックアップスケジューリング（`node-cron`使用・日次/週次/月次対応）
  - ✅ ファイルストレージサービス（統合ファイル管理・署名付きURL生成）
  - ✅ インポート検証機能（データ形式チェック・重複検出・バッチ処理）
  - ✅ バックアップ管理API（手動実行・履歴確認・統計情報）
  - _Requirements: 6_

- [x] 16. オフライン機能実装 ✅️（リファクタリング済）
  - ✅ Service Worker実装（Vite PWAプラグイン使用）
  - ✅ オフラインデータキャッシュ（IndexedDB使用、Fuse.js検索）
  - ✅ オフライン時の基本機能サポート（閲覧・検索）
  - ✅ オンライン復帰時の同期機能（コンフリクト解決付き）
  - ✅ オフライン状態表示UI（フローティングインジケーター）
  - ✅ 包括的なドキュメント作成（offline-implementation-guide.md）
  - ✅ **プロセス改善**: タスク完了チェックシステム実装（.claude/task-completion-template.md）
  - _Requirements: 7_

## Phase 3: 高度な機能・AI統合

### 8. AI機能統合

- [ ] 17. AI分析サービス実装
  - AI APIクライアント実装（OpenAI/Anthropic/Hugging Face対応）
  - `POST /ai/analyze` - コンテンツ分析エンドポイント
  - 自動カテゴリ提案システム（信頼度スコア付き）
  - タグ自動生成機能（コンテキスト解析ベース）
  - 感情分析・言語検出機能
  - バッチ処理最適化（複数ブックマーク同時解析）
  - AI設定UI（ON/OFF切り替え・プロバイダー選択）
  - _Requirements: 3_

- [ ] 18. 高度なUI/UX機能
  - キーボードショートカット実装（検索・ナビゲーション・操作）
  - 高度なフィルタリング機能（複数条件・保存フィルター）
  - カスタマイズ可能なダッシュボード（ウィジェット配置）
  - ブックマーク統計・分析表示（カテゴリ別・時系列グラフ）
  - お気に入りカテゴリ・タグのクイックアクセス
  - _Requirements: 5_

### 9. モバイル・レスポンシブ対応

- [ ] 19. モバイル最適化
  - レスポンシブデザイン完成（ブレークポイント調整）
  - タッチジェスチャー対応（スワイプ・ピンチ）
  - モバイル専用UI調整（タッチターゲットサイズ）
  - PWA機能実装（アプリアイコン・スプラッシュスクリーン）
  - プルトゥリフレッシュ機能
  - _Requirements: 5_

## Phase 4: 本番化対応・監視

### 10. テスト実装

- [ ] 20. バックエンドテスト実装
  - ユニットテスト（Jest使用・サービス層テスト）
  - 統合テスト（APIエンドポイント・データベース操作）
  - モックテスト（X API・AI API・外部サービス）
  - テストカバレッジ80%以上達成
  - テストデータファクトリー実装
  - _Requirements: 9_

- [ ] 21. フロントエンドテスト実装
  - コンポーネントテスト（Vitest + React Testing Library）
  - E2Eテスト（Playwright使用・主要ユーザーフロー）
  - ビジュアルリグレッションテスト
  - パフォーマンステスト（Core Web Vitals測定）
  - アクセシビリティテスト
  - _Requirements: 9_

### 11. 監視・運用機能

- [ ] 22. ログ・監視システム実装
  - 構造化ログ出力（Winston使用・JSON形式）
  - エラー追跡・アラート機能（Webhook通知）
  - システムメトリクス監視（メモリ・CPU・DB接続数）
  - API使用量監視（X API レート制限・AI API使用量）
  - ヘルスチェック機能（`/health`エンドポイント）
  - _Requirements: 10_

- [ ] 23. CI/CDパイプライン構築
  - GitHub Actions設定（`.github/workflows/`）
  - 自動テスト実行（ユニット・統合・E2E）
  - 自動ビルド・デプロイメント
  - セキュリティスキャン（依存関係・コード脆弱性）
  - パフォーマンス監視（Lighthouse CI）
  - _Requirements: 9_

### 12. セキュリティ・本番化

- [ ] 24. セキュリティ強化
  - 入力値検証強化（Joi/Zodによる厳密なバリデーション）
  - SQL インジェクション対策（パラメータ化クエリ徹底）
  - XSS 対策実装（DOMPurify・CSP設定）
  - CSRF 対策実装（SameSite Cookie・トークン検証）
  - データ暗号化実装（機密データの暗号化保存）
  - _Requirements: 8_

- [ ] 25. 本番環境対応
  - 環境別設定管理（development/staging/production）
  - ロードバランサー設定（nginx/AWS ALB）
  - データベース本番化設定（接続プール・レプリケーション）
  - バックアップ・リカバリ戦略（定期バックアップ・Point-in-Time Recovery）
  - GDPR準拠対応（データ削除・エクスポート権・プライバシーポリシー）
  - _Requirements: 6, 8, 10_

---

## 実装における技術的注意事項

### データベース関連
- PostgreSQL 15以上の使用を前提
- 全文検索にはtsvectorとGINインデックスを活用
- マイグレーションは既存ファイル（001-007）を使用

### API実装関連
- X API v2使用、OAuth 2.0フロー実装
- レート制限: 75 requests/15分
- AI分析はOpenAI/Anthropic/Hugging Face対応

### フロントエンド関連
- React 18 + TypeScript + Viteの構成
- 状態管理: Zustand
- UI: Tailwind CSS + Lucide React
- データフェッチ: React Query

### パフォーマンス要件
- 10,000件ブックマークで3秒以内の初期ロード
- 検索結果表示1秒以内
- 仮想スクロール実装必須

### セキュリティ要件
- HTTPS通信強制
- JWT認証 + セッション管理
- CORS/CSP適切な設定
- 入力値検証とサニタイゼーション

この実装計画は、requirements.mdの全10要件を段階的に実装し、design.mdの技術仕様に準拠した実装を行うためのガイドラインです。各タスクは具体的で測定可能な成果物を含んでおり、開発チームが効率的に実装を進められるよう設計されています。