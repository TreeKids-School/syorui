export function dropdownPosition(rect:{left:number;top:number;bottom:number},viewport:{width:number;height:number;left?:number;top?:number},count:number,preferredHeight?:number) {
  const edge=12,gap=8,leftEdge=viewport.left||0,topEdge=viewport.top||0;
  const width=Math.min(288,Math.max(1,viewport.width-edge*2));
  const below=Math.max(0,topEdge+viewport.height-rect.bottom-gap-edge);
  const above=Math.max(0,rect.top-topEdge-gap-edge);
  const desired=preferredHeight??Math.min(360,count*44+16);
  const openBelow=preferredHeight===undefined?(below>=Math.min(desired,160)||below>=above):(below>=desired||below>=above);
  const maxHeight=Math.max(1,Math.min(desired,openBelow?below:above));
  return {left:Math.max(leftEdge+edge,Math.min(rect.left,leftEdge+viewport.width-width-edge)),top:openBelow?rect.bottom+gap:Math.max(topEdge+edge,rect.top-gap-maxHeight),width,maxHeight};
}
