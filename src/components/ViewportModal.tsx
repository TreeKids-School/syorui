import {useLayoutEffect, useState} from 'react';
import type {HTMLAttributes} from 'react';
import {createPortal} from 'react-dom';

type Viewport = {top:number;left:number;width:number;height:number};
export function visibleModalViewport():Viewport {
  const viewport=window.visualViewport;
  return {top:viewport?.offsetTop || 0,left:viewport?.offsetLeft || 0,
    width:viewport?.width || window.innerWidth,height:viewport?.height || window.innerHeight};
}

/** transform・ぼかし・長いスクロール領域の外で、現在見えている画面に配置する。 */
export function ViewportModal({children,className='',style,...props}:HTMLAttributes<HTMLDivElement>) {
  const [viewport,setViewport]=useState(visibleModalViewport);
  useLayoutEffect(()=>{
    const update=()=>setViewport(visibleModalViewport());
    const visual=window.visualViewport;
    update();
    window.addEventListener('resize',update);
    visual?.addEventListener('resize',update);
    visual?.addEventListener('scroll',update);
    return()=>{window.removeEventListener('resize',update);visual?.removeEventListener('resize',update);visual?.removeEventListener('scroll',update);};
  },[]);
  const layer=Number(className.match(/(?:^|\s)z-\[(\d+)\]/)?.[1] || 0);
  return createPortal(<div {...props} className={`viewport-modal print:hidden ${className}`} style={{...style,
    position:'fixed',inset:'auto',top:viewport.top,left:viewport.left,width:viewport.width,height:viewport.height,zIndex:Math.max(10000,layer)}}>{children}</div>,document.body);
}
