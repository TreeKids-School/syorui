import {useEffect,useId,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';
import {dropdownPosition} from '../../lib/dropdownPosition';
import {menuItemClass,menuSurfaceClass,menuTriggerClass} from './menuStyles';

type Props<T extends string>={label:string;value:T;options:readonly {value:T;label:string;icon?:ReactNode}[];onChange:(value:T)=>void;icon?:ReactNode;iconOnly?:boolean;showSelectedLabel?:boolean;variant?:'control'|'heading';toggles?:readonly {label:string;checked:boolean;onChange:(checked:boolean)=>void}[]};
/** 画面中央へ移動せず、操作位置の近くに開く共通の単一選択メニュー。 */
export function DropdownSelect<T extends string>({label,value,options,onChange,icon,iconOnly=false,showSelectedLabel=false,variant='control',toggles=[]}:Props<T>) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  const keyboard=useRef(false);
  const [position,setPosition]=useState<ReturnType<typeof dropdownPosition>|null>(null);
  const open=()=>{
    const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
    const viewport=window.visualViewport;
    setPosition(dropdownPosition(rect,{width:viewport?.width||window.innerWidth,height:viewport?.height||window.innerHeight,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0},options.length+toggles.length));
  };
  useEffect(()=>{
    if(!position)return;
    if(keyboard.current){(panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')||panel.current?.querySelector('button'))?.focus();keyboard.current=false;}
    const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setPosition(null);};
    const close=()=>setPosition(null);
    const scroll=(event:Event)=>{if(!panel.current?.contains(event.target as Node))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',open);window.addEventListener('scroll',scroll,true);window.addEventListener('keydown',escape);
    window.visualViewport?.addEventListener('resize',open);window.visualViewport?.addEventListener('scroll',open);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',open);window.removeEventListener('scroll',scroll,true);window.removeEventListener('keydown',escape);window.visualViewport?.removeEventListener('resize',open);window.visualViewport?.removeEventListener('scroll',open);};
  },[position]);
  const ownerId=trigger.current?.closest?.('[data-dropdown-panel-id]')?.getAttribute('data-dropdown-panel-id');
  return <>
    <button ref={trigger} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position?id:undefined}
      className={variant==='heading'?'inline-flex min-h-10 min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left text-lg font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary md:text-xl':iconOnly?menuTriggerClass.replace('px-3','px-2')+' h-10 w-10 shrink-0':menuTriggerClass}
      onClick={event=>{keyboard.current=event.detail===0;if(position)setPosition(null);else open();}}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();keyboard.current=true;open();}}}>
      {icon}{iconOnly?<span className="sr-only">{label}</span>:showSelectedLabel?(options.find(option=>option.value===value)?.label||label):label}{!iconOnly&&<ChevronDown size={14} aria-hidden="true"/>}
    </button>
    {position&&createPortal(<div ref={panel} id={id} data-dropdown-owner={ownerId||undefined} role="menu" aria-label={label} data-print-exclude className={'fixed z-[10030] overflow-y-auto overscroll-contain print:hidden '+menuSurfaceClass} style={position}
      onKeyDown={event=>{
        if(event.key==='Tab'){setPosition(null);return;}
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        event.preventDefault();const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }}>
      {[...toggles.map(toggle=><button key={toggle.label} type="button" role="menuitemcheckbox" aria-checked={toggle.checked} className={menuItemClass+' border-b border-slate-100'+(toggle.checked?' bg-primary/10 font-semibold text-primary':'')} onClick={()=>{toggle.onChange(!toggle.checked);setPosition(null);trigger.current?.focus();}}><span>{toggle.label}</span>{toggle.checked&&<Check size={17} className="shrink-0" aria-hidden="true"/>}</button>),...options.map(option=><button key={option.value} type="button" role="menuitemradio" aria-checked={value===option.value} className={menuItemClass+(value===option.value?' bg-primary/10 font-semibold text-primary':'')}
        onClick={()=>{onChange(option.value);setPosition(null);trigger.current?.focus();}}><span className="flex min-w-0 items-center gap-3">{option.icon}<span>{option.label}</span></span>{value===option.value&&<Check size={17} className="shrink-0" aria-hidden="true"/>}</button>)]}
    </div>,document.body)}
  </>;
}
