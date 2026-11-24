export function describeReadError(error: any): string {
  const code = String(error?.code || '');
  if (code.includes('resource-exhausted') || /quota|resource.exhausted/i.test(String(error?.message || ''))) {
    return 'Firebaseの読み取り上限に達したため取得できません。空データではありません。上限がリセットされてから再試行してください。';
  }
  if (code.includes('permission-denied')) return 'このデータを読み取る権限がありません。';
  return 'データを取得できませんでした。通信状態を確認して再試行してください。';
}
