import { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import { AppButton, AppToggle } from '../src/ui/components';
export function SignedWebhookSettings() {
    const [data, setData] = useState<any>(null), [secret, setSecret] = useState(''), [rotate, setRotate] = useState(false);
    const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const refresh = async () => { setBusy(true); setError(''); try { setData(await apiClient.getSignedWebhooks()); setDirty(false); setRotate(false); } catch { setError('Could not load signed webhook settings'); } finally { setBusy(false); } };
    useEffect(() => { void refresh(); }, []);
    return <section aria-label="Signed integration webhook" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111827]">
        <h2 className="text-lg font-semibold">Signed integration webhook</h2>
        <p>Send alert summaries and API power results to your HTTPS receiver. Deliveries contain a signature and stable event ID. Your receiver must verify the signature and ignore duplicate IDs.</p>
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        {data && <>
            <AppToggle label="Enable signed webhook" checked={data.enabled} disabled={busy} onChange={enabled => { setData({ ...data, enabled }); setDirty(true); }} />
            <label className="block">Receiver URL<input aria-label="Signed webhook receiver URL" type="url" value={data.url} disabled={busy} placeholder="https://example.com/eserv/events" onChange={e => { setData({ ...data, url: e.target.value }); setDirty(true); }} className="mt-2 w-full rounded border bg-transparent p-2" /></label>
            <p>Public HTTPS address on port 443, without query parameters. Up to five delivery attempts within 24 hours.</p>
            <label className="flex gap-2"><input type="checkbox" checked={rotate} disabled={busy} onChange={e => { setRotate(e.target.checked); setDirty(true); }} />Generate a new signing secret on save</label>
            {rotate && <p>Update the receiver after saving. The previous secret will stop working.</p>}
            {secret && <label className="block">New signing secret — save it now<input aria-label="New webhook signing secret" readOnly value={secret} autoComplete="off" className="mt-2 w-full rounded border bg-transparent p-2" /><AppButton onClick={() => setSecret('')}>I have saved the signing secret</AppButton></label>}
            <div className="flex flex-wrap gap-2">
                <AppButton disabled={busy || !dirty} onClick={async () => { setBusy(true); setError(''); try { const value = await apiClient.saveSignedWebhooks({ revision: data.revision, enabled: data.enabled, url: data.url, rotateSecret: rotate }); if (value.secret) setSecret(value.secret); setData(value); setDirty(false); setRotate(false); setNotice('Webhook settings saved.'); } catch (e: any) { setError(e.response?.data?.error || 'Save was not confirmed. Refresh settings before retrying. If the signing secret was lost, generate a new one.'); } finally { setBusy(false); } }}>Save signed webhook</AppButton>
                <AppButton disabled={busy || dirty || !data.enabled} onClick={async () => { setBusy(true); try { await apiClient.testSignedWebhooks(); setNotice('Test queued. Refresh delivery history to check the result.'); } catch { setError('Test could not be queued'); } finally { setBusy(false); } }}>Send signed test</AppButton>
                <AppButton disabled={busy} onClick={() => void refresh()}>Refresh signed delivery history</AppButton>
            </div>
            <div className="space-y-2">{data.recent.map((row: any) => <p key={row.id} className="break-words text-sm">{new Date(row.created_at).toLocaleString()} · {row.state} · {row.attempts} attempts · {row.result || 'Queued'}</p>)}</div>
        </>}
    </section>;
}
