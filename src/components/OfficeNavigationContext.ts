import {createContext} from 'react';
import type {Child} from '../data/mockData';
export type RegisteredOffice={id:string;name:string};
export const OfficeNavigationContext=createContext<{children:Child[];offices:RegisteredOffice[];showAssignedOnlyByDefault:boolean;onOfficeChange:(id:string)=>void}|null>(null);
