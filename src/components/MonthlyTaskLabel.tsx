import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {taskTooltipPosition} from '../lib/taskTooltipPosition';

export function MonthlyTaskLabel({title,description}:{title:string;description:string}){
  const id=useId(),label=useRef<HTMLSpanElement>(null),tooltip=useRef<HTMLSpanElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState<{left:number;top:number}|null>(null);
  useEffect(()=>{
    const anchor=label.current?.closest('button,a');if(!anchor)return;
    const show=()=>setOpen(true),hide=()=>{setOpen(false);setPosition(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    anchor.addEventListener('mouseenter',show);anchor.addEventListener('mouseleave',hide);anchor.addEventListener('focus',show);anchor.addEventListener('blur',hide);anchor.addEventListener('click',hide);
    window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('keydown',escape);
    return()=>{anchor.removeEventListener('mouseenter',show);anchor.removeEventListener('mouseleave',hide);anchor.removeEventListener('focus',show);anchor.removeEventListener('blur',hide);anchor.removeEventListener('click',hide);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);window.removeEventListener('keydown',escape);};
  },[]);
  useLayoutEffect(()=>{
    if(!open)return;const anchor=label.current?.closest('button,a'),bubble=tooltip.current;if(!anchor||!bubble)return;
    const viewport=window.visualViewport;
    setPosition(taskTooltipPosition(anchor.getBoundingClientRect(),bubble.getBoundingClientRect(),{width:viewport?.width||window.innerWidth,height:viewport?.height||window.innerHeight,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0}));
    const previous=anchor.getAttribute('aria-describedby');anchor.setAttribute('aria-describedby',[previous,id].filter(Boolean).join(' '));
    return()=>{if(previous===null)anchor.removeAttribute('aria-describedby');else anchor.setAttribute('aria-describedby',previous);};
  },[open,id,description]);
  return <span ref={label} className="min-w-0"><span className="block text-sm font-semibold">{title}</span>{open&&createPortal(<span ref={tooltip} id={id} role="tooltip" className="pointer-events-none fixed z-[10050] block w-64 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal leading-relaxed text-slate-600 shadow-lg print:hidden" style={{left:position?.left??0,top:position?.top??0,visibility:position?'visible':'hidden'}}>{description}</span>,document.body)}</span>;
}
