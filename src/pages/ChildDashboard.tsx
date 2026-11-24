import {DocumentIcon} from '../components/DocumentIcon';
import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, User, School, Star, ChevronRight } from 'lucide-react';
import type { Child } from '../data/mockData';

type ChildDashboardProps = {
  childrenData: Child[];
  selectedOfficeId: string;
  onOfficeChange: (officeId: string) => void;
  offices: { id: string, name: string }[];
};

type DocCard = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  available: boolean;
  color: string;
  alertMessage?: string;
};

export const ChildDashboard: React.FC<ChildDashboardProps> = ({ 
  childrenData
}) => {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();

  const selectedChild = childrenData.find(c => c.id === childId) ?? null;

  if (!selectedChild) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 glass-panel">
        <p className="text-slate-500 font-medium italic">児童が見つかりません（ID: {childId}）</p>
        <button className="btn-primary" onClick={() => navigate('/')}>一覧へ戻る</button>
      </div>
    );
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const isExpiring = selectedChild.currentPlanEndMonth === currentMonth;

  const docCards: DocCard[] = [
    {
      id: 'professional-perspective',
      title: '個別支援計画書',
      description: '支援の目標・方針を作成します。',
      icon: <DocumentIcon type="professional" size={20} tone="inherit"/>,
      path: `/children/${childId}/professional-perspective`,
      available: true,
      color: 'from-violet-500 to-purple-600',
      alertMessage: isExpiring ? '更新期日が1か月を切りました' : undefined,
    },
    {
      id: 'support-plan',
      title: '専門的支援実施計画',
      description: '月ごとの支援内容・結果・今後の予定を記録します。',
      icon: <DocumentIcon type="implementation" size={20} tone="inherit"/>,
      path: `/children/${childId}/support-plan/${currentMonth}`,
      available: true,
      color: 'from-emerald-500 to-teal-600',
      alertMessage: isExpiring ? '更新期日が1か月を切りました' : undefined,
    },
    {
      id: 'force-sheet',
      title: '強行シート',
      description: '重点的な支援や対応方法をまとめます。',
      icon: <DocumentIcon type="force" size={20} tone="inherit"/>,
      path: `/children/${childId}/force-sheet`,
      available: true,
      color: 'from-orange-500 to-red-500',
    },
  ];

  const initials = selectedChild.imageKey || (selectedChild.fullName ? selectedChild.fullName[0] : '?');

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 animate-fade-in">
      {/* 戻るボタン */}
      <button
        onClick={() => navigate('/')}
        className="self-start flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors"
      >
        <ArrowLeft size={18} /> 一覧へ戻る
      </button>

      {/* 児童プロフィールカード */}
      <div className="glass-panel p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-teal-500 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-primary/30 flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-lg font-bold text-slate-800">{selectedChild.fullName}</h2>
            <span className="text-slate-400 text-xs font-medium">{selectedChild.nameKana}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-xs mt-1">
            <span className="flex items-center gap-1.5"><School size={14} className="text-primary" />{selectedChild.schoolName}</span>
            <span className="flex items-center gap-1.5"><User size={14} className="text-primary" />{selectedChild.grade}</span>
          </div>
          {(selectedChild.features ?? []).length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {(selectedChild.features ?? []).map((f: string) => (
                <span key={f} className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[12px] font-semibold">
                  <Star size={10} fill="currentColor" />{f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 書類選択グリッド */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">
          書類を選択してください
        </h3>
        <div className="grid grid-cols-1 gap-2.5">
          {docCards.map(card => (
            <DocCardItem key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
};

// ---- 書類カードコンポーネント ----
function DocCardItem({ card }: { card: DocCard }) {
  const content = (
    <div className={`group glass-panel flex items-center gap-3 p-3.5 transition-colors ${card.available ? 'cursor-pointer hover:bg-slate-50' : 'opacity-75'}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} text-white shadow-sm`}>
        {card.icon}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold leading-snug text-slate-800">{card.title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{card.description}</p>
        {card.alertMessage && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-red-600"><ShieldAlert size={12} />{card.alertMessage}</p>}
        {!card.available && <span className="text-[10px] text-amber-700">開発中</span>}
      </div>
      {card.available && <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-slate-400 group-hover:text-primary" />}
    </div>
  );

  if (!card.available) {
    return content;
  }

  return (
    <Link to={card.path} className="no-underline block">
      {content}
    </Link>
  );
}
