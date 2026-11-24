# このリポジトリでの作業

- UIの追加・変更前に [DESIGN_RULES.md](./DESIGN_RULES.md) を読み、そのルールと既存の共通部品に揃える。
- 新しい見た目・操作のルールを追加するときは、実装と同じ変更で `DESIGN_RULES.md` も更新する。
- プルダウンは `DropdownSelect`・`DropdownPanel` と `ui/menuStyles.ts`、設定の区分は `SettingsGroup`、中央のウィンドウは `ViewportModal` を優先して使用する。
- ユーザーの現在の希望はローカルでの変更・確認。デプロイは、改めて指示を受けたときに行う。
