export const ACCOUNT_TASKS_CHANGED='syorui-account-tasks-changed';
export function notifyAccountTasksChanged(officeId:string){window.dispatchEvent(new CustomEvent(ACCOUNT_TASKS_CHANGED,{detail:{officeId}}));}
