export type NotificationSettings={implementationDays:number;professionalMonths:number};
export const DEFAULT_NOTIFICATION_SETTINGS:NotificationSettings={implementationDays:7,professionalMonths:1};
export function notificationSettings(value:unknown):NotificationSettings{
  const data=value as Partial<NotificationSettings>|null;
  return {implementationDays:[0,1,3,7,14].includes(data?.implementationDays as number)?data!.implementationDays!:7,professionalMonths:[0,1,2,3].includes(data?.professionalMonths as number)?data!.professionalMonths!:1};
}
export function staffTaskRole(data:Record<string,unknown>):'manager'|'staff'|'unknown'{
  const values=[data.role,data.roles,data.position,data.jobTitle,data.jobType,data.staffRole,data.occupation,data.qualifications,data.qualification,data.status,data.job,data.staffType,data.roleType];
  const roles=values.flatMap(value=>Array.isArray(value)?value:[value]).filter((value):value is string=>typeof value==='string').map(value=>value.trim().toLowerCase());
  if(roles.some(value=>['admin','administrator','manager','管理者','児童発達支援管理責任者','児発管'].includes(value)))return 'manager';
  if(roles.some(value=>['teacher','instructor','nursery','nursery_teacher','childcare','保育士','指導員','児童指導員'].includes(value)))return 'staff';
  return 'unknown';
}
export type TaskPlan={id:string;childId:string;officeId:string;startMonth:string;createdAt?:string;archived:boolean;isPrimary?:boolean;variantIndex?:number};
export type AccountTask={id:string;childId:string;childName:string;book:'implementation'|'professional';label:string;dueDate:string;notifyDate:string;daysLeft:number;message:string;href:string};
const DAY=86400000;
function dateValue(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;const result=Date.parse(value+'T00:00:00Z');return Number.isFinite(result)&&new Date(result).toISOString().slice(0,10)===value?result:NaN;}
export function shiftTaskMonths(value:string,months:number){
  if(!Number.isFinite(dateValue(value)))return '';
  const [year,month,day]=value.split('-').map(Number),target=new Date(Date.UTC(year,month-1+months,1));
  target.setUTCDate(Math.min(day,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return target.toISOString().slice(0,10);
}
export function planTaskStart(plan:TaskPlan){
  // 本案の編集画面の「開始年月日」は createdAt に保存されている。
  if(Number.isFinite(dateValue(plan.createdAt||'')))return plan.createdAt!;
  const fallback=plan.startMonth+'-01';return Number.isFinite(dateValue(fallback))?fallback:'';
}
export function buildAccountTasks(input:{today:string;officeId:string;children:{id?:string;fullName:string;archived?:boolean}[];ownStaffId:string;assignments:Record<string,string>;completed:Set<string>;plans:TaskPlan[];role:'manager'|'staff'|'unknown';settings:NotificationSettings}):AccountTask[]{
  const {today,officeId,ownStaffId,assignments,completed,settings}=input,now=dateValue(today);if(!Number.isFinite(now))return [];
  const [year,month]=today.split('-').map(Number),due=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),tasks:AccountTask[]=[];
  for(const child of input.children){
    if(!child.id||child.archived)continue;
    if(ownStaffId&&assignments[child.id]===ownStaffId&&!completed.has(child.id)){
      const daysLeft=Math.round((dateValue(due)-now)/DAY);
      tasks.push({id:'implementation:'+child.id+':'+today.slice(0,7),childId:child.id,childName:child.fullName,book:'implementation',label:'専門的支援実施計画',dueDate:due,notifyDate:new Date(dateValue(due)-settings.implementationDays*DAY).toISOString().slice(0,10),daysLeft,message:child.fullName+'の専門的支援実施計画の期限が'+(daysLeft===7?'残り1週間です':daysLeft===0?'本日です':'残り'+daysLeft+'日です'),href:'/children/'+encodeURIComponent(child.id)+'/support-plan/'+today.slice(0,7)});
    }
    if(input.role!=='manager')continue;
    const plans=input.plans.filter(plan=>plan.childId===child.id&&plan.officeId===officeId&&!plan.archived&&planTaskStart(plan)).sort((a,b)=>planTaskStart(b).localeCompare(planTaskStart(a))||Number(b.isPrimary===true)-Number(a.isPrimary===true)||(a.variantIndex||0)-(b.variantIndex||0));
    const plan=plans[0];if(!plan)continue;
    const start=planTaskStart(plan),deadline=shiftTaskMonths(start,6),daysLeft=Math.round((dateValue(deadline)-now)/DAY);
    tasks.push({id:'professional:'+plan.id,childId:child.id,childName:child.fullName,book:'professional',label:'個別支援計画書',dueDate:deadline,notifyDate:shiftTaskMonths(deadline,-settings.professionalMonths),daysLeft,message:child.fullName+'の個別支援計画書は'+start.replaceAll('-','/')+'開始の本案から'+(daysLeft<0?'6か月を過ぎています':daysLeft===0?'本日で6か月です':'まもなく6か月です（残り'+daysLeft+'日）'),href:'/children/'+encodeURIComponent(child.id)+'/professional-perspective?'+new URLSearchParams({logMonth:plan.startMonth||start.slice(0,7),logDocument:plan.id,logKind:'final'})});
  }
  return tasks.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.childName.localeCompare(b.childName,'ja'));
}

export type TaskDisplayWindow='1d'|'1w'|'1m';
export type TaskDisplaySettings={implementation:TaskDisplayWindow;professional:TaskDisplayWindow};
export const DEFAULT_TASK_DISPLAY_SETTINGS:TaskDisplaySettings={implementation:'1w',professional:'1m'};
export function taskDisplaySettings(value:unknown):TaskDisplaySettings{
  const data=value as Partial<TaskDisplaySettings>|null;
  const valid=(value:unknown):value is TaskDisplayWindow=>['1d','1w','1m'].includes(value as string);
  return {implementation:valid(data?.implementation)?data.implementation:'1w',professional:valid(data?.professional)?data.professional:'1m'};
}
/** 通知時期とは独立した、アカウントメニューへの表示開始日。期限超過は表示を続ける。 */
export function visibleAccountTasks(tasks:AccountTask[],today:string,settings:TaskDisplaySettings){
  if(!Number.isFinite(dateValue(today)))return [];
  return tasks.filter(task=>{const window=settings[task.book],date=dateValue(task.dueDate);if(!Number.isFinite(date))return false;const start=window==='1m'?shiftTaskMonths(task.dueDate,-1):new Date(date-(window==='1w'?7:1)*DAY).toISOString().slice(0,10);return start<=today;});
}
