import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const monthlySettingsRef = (officeId: string, month: string) => {
  if (!officeId) throw new Error('事業所を選択してください。');
  return doc(db, 'monthlySettings', `${officeId}_${month}`);
};

// 事業所別の設定が未登録の場合は、従来の共通設定を引き継ぐ。
export const getMonthlySettings = async (officeId: string, month: string) => {
  const scoped = await getDoc(monthlySettingsRef(officeId, month));
  return scoped.exists() ? scoped : getDoc(doc(db, 'monthlySettings', month));
};
