import {APP_VERSION} from '../lib/appVersion';
import React, { useEffect, useState } from 'react';
import type {SummaryChildOrder} from '../lib/summaryChildOrder';
import {japanDateKey} from '../lib/summaryChildOrder';
import { MobileNavigation } from './MobileNavigation';
import { Outlet, useLocation } from 'react-router-dom';
import type { Child } from '../data/mockData';

type LayoutProps = {
  childrenData: Child[];
  selectedOfficeId: string;
};

export const Layout: React.FC<LayoutProps> = ({ 
  childrenData, 
  selectedOfficeId
}) => {
  const [childOrder, setChildOrder] = useState<SummaryChildOrder>('today');
  const [visibleMobileChildren, setVisibleMobileChildren] = useState<{scope: string; ids: string[]} | null>(null);
  const location = useLocation();
  const mobileSearchChildren = location.pathname === '/' && childOrder === 'today'
    ? childrenData.filter(child => visibleMobileChildren?.scope === `${selectedOfficeId}:${japanDateKey()}` && visibleMobileChildren.ids.includes(child.id || ''))
    : childrenData;
  useEffect(() => {
    return () => {
      document.body.classList.remove('overflow-hidden', 'touch-none');
    };
  }, []);



  return (
    <div className="flex h-[100dvh] overflow-hidden relative">
      <span aria-label={'バージョン '+APP_VERSION} className="pointer-events-none absolute right-5 top-0 z-10 text-[10px] leading-3 tabular-nums text-slate-400 print:hidden">{APP_VERSION}</span>
      <main
        className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative`}
      >
        {/* スクロールコンテナ
            - モバイル底部の検索とセーフエリア分の余白を確保 */}
        <div
          className={`mobile-page-content flex-1 overflow-y-auto min-h-0 p-3 md:p-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-5 transition-all ${location.pathname==='/monthly-summary'?'summary-mobile-content':''}`}
          style={{ overscrollBehavior: 'contain' }}
        >
          <Outlet context={{childOrder, setChildOrder, setVisibleMobileChildren}} />
        </div>
      </main>

      {/* 下部ナビゲーション（モバイルのみ） */}
      <MobileNavigation childrenData={mobileSearchChildren} childOrder={childOrder} onChildOrderChange={setChildOrder} showSort={location.pathname === '/'} />
    </div>
  );
};
