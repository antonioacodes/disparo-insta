import Sidebar from './Sidebar';
export default function DashboardShell({children,active}:{children:React.ReactNode;active?:string}){return <div className="shell"><Sidebar active={active}/>{children}</div>}
