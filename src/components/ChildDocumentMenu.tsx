import {DocumentIcon,documentTypes} from './DocumentIcon';
import {menuActionClass,menuSurfaceClass} from './ui/menuStyles';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router-dom';

export function ChildDocumentMenu({childId, name, month}: {childId: string; name: string; month: string}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{left: number; top: number} | null>(null);
  useEffect(() => {
    if (!position) return;
    panel.current?.querySelector('a')?.focus();
    const close = () => setPosition(null);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); button.current?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('resize', close);
    const scroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [position]);
  return <>
    <button ref={button} type="button" aria-label={`${name}の書類を選ぶ`} aria-haspopup="dialog" aria-expanded={!!position}
      className="hover:text-primary hover:underline focus-visible:outline-2" onClick={() => {
        if (position) { setPosition(null); return; }
        const rect = button.current!.getBoundingClientRect();
        const width = Math.min(288, window.innerWidth - 24);
        const left = rect.right + 8 + width <= window.innerWidth - 12 ? rect.right + 8
          : rect.left - width - 8 >= 12 ? rect.left - width - 8 : Math.max(12, window.innerWidth - width - 12);
        setPosition({left, top: Math.max(12, Math.min(rect.top, window.innerHeight - 192))});
      }}>{name}</button>
    {position && createPortal(<>
      <div className="fixed inset-0 z-[9998] print:hidden" onClick={() => { setPosition(null); button.current?.focus(); }} />
      <div ref={panel} role="dialog" aria-label={`${name}の書類`} data-print-exclude
        className={'fixed z-[9999] w-72 max-w-[calc(100vw-24px)] print:hidden '+menuSurfaceClass}
        style={position}>
        <div className="border-b border-slate-100 px-3 py-2 font-semibold">{name}</div>
        {documentTypes.map(option=>{
          const path=option.value==='professional'?`/children/${childId}/professional-perspective`:option.value==='implementation'?`/children/${childId}/support-plan/${month}`:`/children/${childId}/force-sheet`;
          return <Link key={path} to={path} onClick={()=>setPosition(null)} className={menuActionClass}><DocumentIcon type={option.value}/><span>{option.label}</span></Link>;
        })}
      </div>
    </>, document.body)}
  </>;
}
