import { getDatabase } from '../database/init.js';
import { getConfig } from '../config.js';
import { SignedWebhookStore } from './signedWebhookStore.js';
let singleton: Promise<SignedWebhookStore> | undefined;
export const signedWebhooks = () => singleton ??= (async () => { const store = new SignedWebhookStore(await getDatabase(), getConfig().jwtSecret); await store.initialize(); return store; })();
export function startSignedWebhookWorker() {
    let stopped = false, busy = false;
    const timer = setInterval(() => { if (stopped || busy) return; busy = true; void signedWebhooks().then(s => s.tick()).catch(() => console.error('Signed webhook worker unavailable')).finally(() => { busy = false; }); }, 3000);
    return { stop() { stopped = true; clearInterval(timer); } };
}
