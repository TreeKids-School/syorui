import {requiredSummaryDays,summaryAdoptionTargets} from '../lib/summaryAttendance';
/** 実施状況表と同じ色・記号・行構成で、設定による違いを比較する図。 */
export function AdoptionCalculationExample({addIndividualDays,individualColor}:{addIndividualDays:boolean;individualColor:string}){
  const modes=[addIndividualDays],base=requiredSummaryDays(8,true),stats=modes.map(mode=>summaryAdoptionTargets(base,2,8,mode));
  const width=212,label=104,column=108,start=200,rowHeight=27,height=start+8*rowHeight+2;
  const adopted=(day:number,mode:boolean)=>[1,5,...(mode?[2,3,4,6]:[2,3])].includes(day);
  return <figure className="m-0 min-w-0"><svg role="img" aria-label={`計算例：出席8日、個別療育2日、集団療育6日。採用${stats[0].requiredDays}日。`} viewBox={`0 0 ${width} ${height}`} className="block w-full rounded-xl border border-slate-200 bg-white" fontFamily="inherit">
    <title>採用日の計算方法の比較</title>
    <rect width={width} height={height} fill="white"/>
    <rect x={0} y={27} width={label} height={173} fill="#f1f5f9"/>
    <text x={52} y={66} textAnchor="middle" fill="#475569" fontSize="12">計算例</text><text x={52} y={86} textAnchor="middle" fill="#475569" fontSize="12">放課後デイ</text>
    {modes.map((mode,index)=><g key={String(mode)}>
      <rect x={label+index*column} y={0} width={column} height={27} fill={addIndividualDays===mode?'#dcfce7':'#f8fafc'}/>
      <text x={label+index*column+column/2} y={18} textAnchor="middle" fontWeight="bold" fontSize="12" fill={addIndividualDays===mode?'#15803d':'#475569'}>{mode?'上乗せする':'上乗せしない'}</text>
      <text x={label+index*column+column/2} y={55} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#334155">児童A</text>
      <circle cx={label+index*column+column/2} cy={78} r={6} fill="#f59e0b"/>
    </g>)}
    {([['出席日数',8,'#f8fafc'],['必要日数',stats[0].requiredDays,'#f0fdf4'],['個別療育',2,individualColor],['集団療育',6,'#ecfdf5'],['採用数',stats[0].requiredDays+'/'+stats[0].requiredDays,'#fffbeb']] as const).map((row,index)=><g key={index}>
      <rect x={0} y={90+index*22} width={width} height={22} fill={row[2]}/><text x={52} y={105+index*22} textAnchor="middle" fontSize="12" fill="#475569">{row[0]}</text>
      <text x={label+column/2} y={105+index*22} textAnchor="middle" fontSize="12" fill="#334155" fontWeight="bold">{row[1]}</text>
    </g>)}
    {Array.from({length:8},(_,index)=>{const day=index+1,y=start+index*rowHeight,individual=day===1||day===5;return <g key={day}>
      <rect x={0} y={y} width={width} height={rowHeight} fill={individual?individualColor:'white'}/><text x={52} y={y+18} textAnchor="middle" fontSize="12" fill="#475569">{day}日{individual?'（個別）':''}</text>
      {modes.map((mode,col)=>{const selected=adopted(day,mode);return <g key={String(mode)}>{selected&&<rect x={label+col*column+1} y={y+1} width={column-2} height={rowHeight-2} fill="none" stroke="#059669" strokeWidth={1.5}/>}<text x={label+col*column+column/2} y={y+19} textAnchor="middle" fontSize="17" fill={selected?'#059669':'#334155'}>{selected?'◎':'○'}</text></g>})}
    </g>})}
    {[label,label+column].map(x=><line key={x} x1={x} x2={x} y1={0} y2={height} stroke="#e2e8f0"/>)}
    {[27,90,112,134,156,178,200,...Array.from({length:8},(_,i)=>start+(i+1)*rowHeight)].map(y=><line key={y} x1={0} x2={width} y1={y} y2={y} stroke="#e2e8f0"/>)}
  </svg></figure>;
}
