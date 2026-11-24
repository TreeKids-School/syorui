import type {Child} from '../data/mockData';
import type {SummaryChildOrder} from '../lib/summaryChildOrder';
import {DropdownSelect} from './ui/DropdownSelect';
import {CHILD_SWITCH_ORDERS} from '../lib/childSwitcherFilters';
import {ArrowDownUp} from 'lucide-react';
type Props={childrenData:Child[];childOrder:SummaryChildOrder;onChildOrderChange:(order:SummaryChildOrder)=>void;showSort:boolean};
export function MobileNavigation({childOrder,onChildOrderChange,showSort}:Props){
  return <div data-sort={showSort} className="mobile-bottom-bar fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200/70 bg-white/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl md:hidden print:hidden">
    <div id="mobile-summary-header-slot" className="summary-mobile-header-slot"/>
    {showSort&&<div className="flex justify-end"><DropdownSelect label="児童一覧の並べ替え" value={childOrder} onChange={onChildOrderChange} options={CHILD_SWITCH_ORDERS} icon={<ArrowDownUp size={18}/>}/></div>}
  </div>;
}
