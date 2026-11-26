export type AuditBook='professional'|'implementation'|'force';
export type AuditChange={field:string;action:string;date?:string};
const fields:Record<string,string>={goals:'支援目標',author:'作成者',createdAt:'作成日',excludedDates:'表示対象日',date:'記録日',archived:'アーカイブ状態',isPrimary:'メイン指定',familyIntention:'生活に対する意向',overallPolicy:'総合的な支援の方針',longTermGoal:'長期目標',shortTermGoal:'短期目標',serviceHours:'支援の提供時間',supportRows:'支援目標・支援内容の各行',confirmation:'確認事項',managerName:'管理責任者氏名',signDate:'同意日',guardianName:'保護者署名',effectiveStartDate:'利用開始日',weeklyHours:'曜日別の利用・延長時間',extReason:'延長理由',notes:'特記事項',createdDate:'作成日',serviceDate:'提供日',authorName:'作成者',serviceStaffName:'提供者',officeName:'事業所名',rows:'手順・観察記録','content.externalInfo':'ツリー通信','content.supportContent':'療育内容','content.resultInfo':'療育を行った結果','content.futurePlan':'今後の予定','content.isVerified':'確認済み',implementationCreator:'実施計画の作成者',implementationYear:'作成日（令和年）',implementationMonth:'作成日（月）',implementationDay:'作成日（日）',professionalManagerName:'管理責任者氏名'};
const read=(value:any,key:string):any=>key.split('.').reduce((item,key)=>item?.[key],value);
export function describeDocumentChanges(before:any,after:any):AuditChange[]{
  return Object.entries(fields).flatMap(([key,label])=>{
    const previous=read(before,key),next=read(after,key);
    if(JSON.stringify(previous??null)===JSON.stringify(next??null))return [];
    if(previous===undefined&&(next===''||JSON.stringify(next)==='[]'||JSON.stringify(next)==='{}'||next===undefined))return [];
    return [{field:label,action:before?'変更':'追加'}];
  });
}
export function auditScopes(book:AuditBook,childId:string,month:string){
  const scopes=['all','type:'+book,'child:'+childId,'type:'+book+'|child:'+childId];
  return [...scopes,...scopes.map(scope=>scope+'|month:'+month)];
}
export function auditScope(book:string,child:string,month:string){return (book&&child?'type:'+book+'|child:'+child:book?'type:'+book:child?'child:'+child:'all')+(month?'|month:'+month:'');}
export function auditEntryId(now:number,random:string){return String(9_999_999_999_999-now).padStart(13,'0')+'_'+random;}

/** 採用の切替だけの履歴は、内容の変更履歴と分けて表示する。旧ログも同じ基準で分類する。 */
export function auditHistoryCategory(entry:{book?:string;operation?:string;category?:string;changes?:{field:string}[]}):'content'|'adoption'{
  if(entry.category==='adoption'||entry.operation==='採用日変更')return 'adoption';
  return entry.book==='implementation'&&!!entry.changes?.length&&entry.changes.every(change=>['採用日','アーカイブ状態'].includes(change.field))?'adoption':'content';
}
