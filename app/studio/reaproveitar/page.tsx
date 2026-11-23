'use client';
import DashboardShell from '../../components/DashboardShell';
import {ProjectIntake} from './ProjectIntake';

export default function Reaproveitar(){
  return <DashboardShell active="Studio"><main className="main">
    <p className="eyebrow">Studio · Reaproveitar e editar</p><h1 className="title">Reaproveitar e editar</h1>
    <div className="card" style={{marginTop:24}}><ProjectIntake useStored onCreated={id=>location.assign('/studio?project='+encodeURIComponent(id))}/></div>
  </main></DashboardShell>
}
