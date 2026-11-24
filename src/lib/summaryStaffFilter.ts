export function resolveOwnStaffId(staff:{id:string;name:string}[],uid:string,name:string):string{
  if(staff.some(member=>member.id===uid))return uid;
  const key=name.normalize('NFKC').replace(/\s/g,'');if(!key)return '';
  const matches=staff.filter(member=>member.name.normalize('NFKC').replace(/\s/g,'')===key);return matches.length===1?matches[0].id:'';
}
export function filterSummaryStaff<T extends {id?:string}>(children:T[],assignments:Record<string,string>,filter:string,ownStaffId:string):T[]{
  if(filter==='all')return children;
  if(filter==='mine')return ownStaffId?children.filter(child=>child.id&&assignments[child.id]===ownStaffId):[];
  if(filter==='unassigned')return children.filter(child=>child.id&&!assignments[child.id]);
  if(filter.startsWith('staff:'))return children.filter(child=>child.id&&assignments[child.id]===filter.slice(6));
  return [];
}
