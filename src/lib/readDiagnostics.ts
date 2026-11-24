type ReadMetric={label:string;requests:number;documents:number;failures:number;reused:number};
const metrics=new Map<string,ReadMetric>();
const metric=(label:string)=>{if(!metrics.has(label))metrics.set(label,{label,requests:0,documents:0,failures:0,reused:0});return metrics.get(label)!;};
/** Counts observed returned documents only; not a replacement for Firebase billing metrics. */
export async function measureRead<T>(label:string,request:Promise<T>):Promise<T>{
  const entry=metric(label);entry.requests++;
  try{const value=await request,snapshot=value as any;if(!snapshot.metadata?.fromCache)entry.documents+=Array.isArray(snapshot.docs)?Math.max(1,snapshot.docs.length):1;else entry.reused++;return value;}
  catch(error){entry.failures++;throw error;}
}
export function markReadReuse(label:string){metric(label).reused++;}
export function readDiagnostics(){return [...metrics.values()].map(value=>({...value}));}

export function measureReads<T extends (...args:any[])=>Promise<any>>(label:string,read:T):T{return ((...args:Parameters<T>)=>measureRead(label,read(...args))) as T;}
