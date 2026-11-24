/** Place a small explanation beside its row without moving the menu. */
export function taskTooltipPosition(rect:{left:number;right:number;top:number;bottom:number},size:{width:number;height:number},viewport:{width:number;height:number;left?:number;top?:number}){
  const edge=12,gap=8,vLeft=viewport.left||0,vTop=viewport.top||0,right=vLeft+viewport.width-edge,bottom=vTop+viewport.height-edge;
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
  let left:number,top:number;
  if(right-rect.right-gap>=size.width){left=rect.right+gap;top=(rect.top+rect.bottom-size.height)/2;}
  else if(rect.left-gap-vLeft-edge>=size.width){left=rect.left-gap-size.width;top=(rect.top+rect.bottom-size.height)/2;}
  else{left=rect.left;top=bottom-rect.bottom-gap>=size.height?rect.bottom+gap:rect.top-gap-size.height;}
  return {left:clamp(left,vLeft+edge,right-size.width),top:clamp(top,vTop+edge,bottom-size.height)};
}
