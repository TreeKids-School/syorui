import {documentRoute,implementationNavigationMonth} from '../lib/documentRoutes';
import {DocumentIcon,documentTypes,type DocumentType} from './DocumentIcon';
import {useNavigate} from 'react-router-dom';
import {DropdownSelect} from './ui/DropdownSelect';

const options=documentTypes.map(option=>({...option,icon:<DocumentIcon type={option.value}/>}));
export function DocumentTypeSelect({childId,month,current}:{childId:string;month:string;current:DocumentType}) {
  const navigate=useNavigate();
  const implementationMonth=implementationNavigationMonth(current,month);
  const paths={professional:documentRoute('professional',childId,month),implementation:documentRoute('implementation',childId,implementationMonth),force:documentRoute('force',childId,month)};
  return <DropdownSelect variant="heading" label={options.find(option=>option.value===current)!.label} value={current} options={options} icon={<DocumentIcon type={current} size={20}/>} onChange={next=>{if(next!==current)navigate(paths[next]);}}/>;
}
