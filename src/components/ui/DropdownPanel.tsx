import {useEffect,useId,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {dropdownPosition} from '../../lib/dropdownPosition';
import {menuSurfaceClass,menuTriggerClass} from './menuStyles';

/** 通知など、選択項目を持たない内容を操作位置の近くへ表示する。 */
type DropdownPanelProps={label:string;onOpen?:()=>void;itemCount?:number;preferredHeight?:number;contained?:boolean;mobileBottom?:boolean;icon?:ReactNode;triggerContent?:ReactNode;variant?:'icon'|'content'|'stacked';children:ReactNode|((close:()=>void)=>ReactNode)};
export function DropdownPanel({label,onOpen,itemCount=4,preferredHeight,contained=false,mobileBottom=false,icon,triggerContent,variant='icon',children}:DropdownPanelProps) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),keyboard=useRef(false);
  const [position,setPosition]=useState<ReturnType<typeof dropdownPosition>|null>(null);
  const locate=(rect:DOMRect)=>{const viewport=window.visualViewport;const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
    if(mobileBottom&&window.innerWidth<768){const maxHeight=Math.min(preferredHeight||680,Math.max(0,height-24));return {left:left+12,top:top+height-12-maxHeight,width:Math.max(0,width-24),maxHeight};}
    return dropdownPosition(rect,{width,height,left,top},itemCount,preferredHeight);};
  useEffect(()=>{
    if(!position)return;
    if(keyboard.current){panel.current?.focus();keyboard.current=false;}
    const close=()=>setPosition(null);
    const owned=(target:EventTarget|null)=>!!(target as Element|null)?.closest?.('[data-dropdown-owner="'+id+'"]');
    const outside=(event:PointerEvent)=>{if(!owned(event.target)&&!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();};
    const scroll=(event:Event)=>{if(!owned(event.target)&&!panel.current?.contains(event.target as Node))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){if(document.querySelector('[data-dropdown-owner="'+id+'"]'))return;event.preventDefault();close();trigger.current?.focus();}};
    const reposition=()=>{const rect=trigger.current?.getBoundingClientRect();if(!rect)return;setPosition(locate(rect));};
    const visual=window.visualViewport;
    document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape);window.addEventListener('resize',reposition);window.addEventListener('scroll',scroll,true);visual?.addEventListener('resize',reposition);visual?.addEventListener('scroll',reposition);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',scroll,true);visual?.removeEventListener('resize',reposition);visual?.removeEventListener('scroll',reposition);};
  },[position]);
  const triggerClass=variant==='stacked'?'inline-flex min-h-13 min-w-0 flex-col items-center justify-center rounded-xl border border-transparent px-0.5 py-1 text-sm leading-5 text-slate-700 hover:border-slate-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary':variant==='content'?'inline-flex min-h-10 items-center rounded-xl px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary':menuTriggerClass.replace('px-3','px-2')+' h-10 w-10 shrink-0';
  return <>
    <button ref={trigger} type="button" title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={!!position} aria-controls={position?id:undefined} className={triggerClass} onClick={event=>{
      if(position){setPosition(null);return;}
      const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
      onOpen?.();
      keyboard.current=event.detail===0;
      setPosition(locate(rect));
    }}>{triggerContent||icon}</button>
    {position&&createPortal(<div ref={panel} id={id} data-dropdown-panel-id={id} role="dialog" aria-modal="false" aria-label={label} tabIndex={-1} data-print-exclude className={'fixed z-[10030] outline-none print:hidden '+(contained?'flex flex-col overflow-hidden ':'overflow-y-auto overscroll-contain ')+menuSurfaceClass} style={contained?{...position,height:position.maxHeight}:position}>
      <h3 className="shrink-0 border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">{label}</h3>
      {contained?<div className="min-h-0 flex-1 overflow-hidden">{typeof children==='function'?children(()=>{setPosition(null);trigger.current?.focus();}):children}</div>:typeof children==='function'?children(()=>{setPosition(null);trigger.current?.focus();}):children}
    </div>,document.body)}
  </>;
}
