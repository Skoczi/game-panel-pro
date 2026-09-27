import { useEffect, useState } from 'react';
import { Archive, Upload, RefreshCw, LockKeyhole } from 'lucide-react';
import { nodesRequest } from '../utils/nodesApi';
type Package = {id:string;name:string;version:string;bytes:number;files:number;sha256:string;servers:{id:number;name:string}[]};
type Snapshot = {available:boolean;packages:Package[];uploads:{id:string;input:{name:string};status:string;bytes:number;error?:string}[]};
const size = (n:number) => `${(n / 1024 ** 3).toFixed(2)} GiB`;
const button = 'inline-flex min-h-11 shrink-0 whitespace-nowrap items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm dark:border-slate-700 disabled:opacity-40';
const input = 'mt-1 block w-full rounded-xl border border-slate-300 bg-transparent p-3 dark:border-slate-700';
export function SharedFiles({nodeId,onDirtyChange}:{nodeId:string;onDirtyChange:(dirty:boolean)=>void}) {
  const endpoint = (nodeId === 'local' ? '' : `/api/nodes/${nodeId}/runtime`) + '/api/system/shared-files';
  const [state,setState] = useState<Snapshot>(), [error,setError] = useState(''), [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [percent,setPercent] = useState(0);
  const [file,setFile] = useState<File>(), [draft,setDraft] = useState({id:'',name:'',version:'',root:'.'});
  async function refresh() { try {setState(await nodesRequest<Snapshot>(endpoint));} catch(e:any){setError(e.message);} }
  useEffect(() => {void refresh(); const t=setInterval(()=>void refresh(),5000);return ()=>clearInterval(t);},[endpoint]);
  useEffect(() => {onDirtyChange(busy || open);return ()=>onDirtyChange(false);},[busy,open,onDirtyChange]);
  async function upload() {
    if (!file) return;
    setBusy(true);setError('');setPercent(0);
    try {
      const session = await nodesRequest<{id:string}>(endpoint+'/uploads',{...draft,total:file.size});
      for(let offset=0;offset<file.size;) {
        const blob=file.slice(offset,offset+1024*1024);
        const data = await new Promise<string>((resolve,reject)=> {const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
        const result = await nodesRequest<{offset:number}>(`${endpoint}/uploads/${session.id}`,{offset,data},'PUT');
        offset=result.offset;setPercent(Math.floor(offset/file.size*100));
      }
      await nodesRequest(`${endpoint}/uploads/${session.id}/finish`,{});setOpen(false);setFile(undefined);await refresh();
    } catch(e:any) {setError(e.message);} finally {setBusy(false);}
  }
  return <section className="space-y-5">
    <header className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Archive className="shrink-0 text-cyan-400"/><h2 className="whitespace-nowrap text-lg font-semibold sm:text-xl">Shared files</h2></div><div className="flex gap-2"><button className={`${button} w-11 !px-0`} aria-label="Refresh shared files" onClick={()=>void refresh()}><RefreshCw size={17}/></button><button className={`${button} bg-blue-700 text-white`} aria-label="Upload ZIP" disabled={!state?.available || busy} onClick={()=>setOpen(!open)}><Upload size={17}/><span className="hidden sm:inline">Upload ZIP</span></button></div></header>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {state && !state.available && <p className="text-slate-500">Shared storage is not configured on this node.</p>}
    {open && <form onSubmit={e=>{e.preventDefault();void upload();}} className="space-y-4 rounded-2xl border border-slate-700 p-5"><div className="grid gap-4 sm:grid-cols-2">{(['name','version','id','root'] as const).map(k=><label key={k} className="text-sm">{{name:'Name',version:'Version',id:'Package ID',root:'Folder inside ZIP'}[k]}<input required disabled={busy} className={input} value={draft[k]} onChange={e=>setDraft({...draft,[k]:e.target.value})}/></label>)}</div><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-400 p-4 text-sm"><Upload size={20} className="shrink-0 text-cyan-500"/><span className="min-w-0 break-all">{file ? file.name : 'Choose ZIP'}</span><input className="sr-only" aria-label="Package ZIP" required disabled={busy} type="file" accept=".zip" onChange={e=>setFile(e.target.files?.[0])}/></label>{busy && <div role="status"><progress className="w-full" value={percent} max={100}/><span>Uploading · {percent}%</span></div>}<button type="submit" className={`${button} bg-blue-700 text-white`} disabled={busy || !file}>Upload</button></form>}
    {state?.uploads.filter(u=>u.status==='importing'||u.status==='failed'||(u.status==='uploading'&&!busy)).map(u=><div key={u.id} role="status" className="rounded-xl border border-slate-700 p-4">{u.input.name} · {u.status==='importing'?`Extracting · ${size(u.bytes)}`:u.status==='uploading'?'Upload interrupted':u.error} {u.status!=='importing' && <button className={button} onClick={async()=>{try{await nodesRequest(`${endpoint}/uploads/${u.id}`,undefined,'DELETE');await refresh();}catch(e:any){setError(e.message);}}}>Discard upload</button>}</div>)}
    <div className="grid gap-4 xl:grid-cols-2">{state?.packages.map(p=><article key={p.id} className="rounded-2xl border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-[#111827]"><header className="flex justify-between gap-3"><div><h3 className="text-lg font-semibold">{p.name}</h3><p className="mt-1 text-sm text-slate-500">{p.version} · {size(p.bytes)} · {p.files.toLocaleString()} files</p></div><span className="flex h-fit shrink-0 items-center gap-1.5 rounded-lg bg-cyan-500/10 px-2 py-1 text-xs text-cyan-500"><LockKeyhole size={13}/>Read only</span></header><div className="mt-5 border-t border-slate-300 pt-4 text-sm dark:border-slate-700">{p.servers.length ? p.servers.map(s=><span key={s.id} className="mr-2 inline-block rounded-lg bg-slate-500/10 px-3 py-1">#{s.id} {s.name}</span>) : <span className="text-slate-500">No servers assigned</span>}</div><details className="mt-4 text-xs text-slate-500"><summary className="cursor-pointer">Package details</summary><p className="mt-2">{p.id}</p><code className="mt-1 block break-all">SHA256 {p.sha256}</code></details></article>)}</div>
    {state?.available && state.packages.length===0 && <p className="py-10 text-center text-slate-500">No shared packages</p>}
  </section>;
}
