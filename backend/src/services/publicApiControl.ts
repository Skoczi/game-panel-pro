import { TemplateStore } from '../templates/store.js';
import { nodes } from '../nodes/control.js';
import { registerPublicManagement } from '../routes/publicApiManagement.js';
import { ApiProvisionStore } from './apiProvisioning.js';
import { apiServerDetail } from './publicApiDetails.js';
import { isPanelAdministrator } from '../utils/accountRole.js';
import { signedWebhooks } from './signedWebhooks.js';
import { apiPower } from './publicApiPower.js';
import { getDatabase } from '../database/init.js';
import { userRepository } from '../database/index.js';
import { fleet, fleetPermissions, fleetSummary, fleetAvailability } from '../fleet/control.js';
import { ApiTokenStore } from './apiTokens.js';
import { apiTokenManagement } from '../routes/apiTokenManagement.js';
import { publicApi } from '../routes/publicApi.js';
import { apiResources } from './publicApiResources.js';
import { apiBackups } from './publicApiBackups.js';
import { ApiOperationStore } from './apiOperations.js';
import { normalizeBackupName } from './nativeBackups.js';
import { startApiBackup, readApiBackupJob } from './publicApiBackupOperations.js';

let provisions: ApiProvisionStore;
let tokens: ApiTokenStore;
let operations: ApiOperationStore;
export async function initializePublicApi() {
    tokens = new ApiTokenStore(await getDatabase());
    await tokens.initialize();
    operations = new ApiOperationStore(await getDatabase());
    await operations.initialize();
    provisions = new ApiProvisionStore(await getDatabase());
    await provisions.initialize();
}
export const apiTokenRoutes = apiTokenManagement({
    options: async () => ({
        nodes: [{ id: 'local', name: 'Local' }, ...(await nodes().list()).filter(n => n.enabled).map(n => ({ id: n.id, name: n.name }))],
        templates: (await new TemplateStore(await getDatabase()).list()).filter(t => t.status === 'published' && t.document.lifecycle).map(t => ({ id: t.id, name: t.document.name, version: t.version })),
    }),
    store: () => tokens,
    permissions: async (id, user) => {
        const row = await fleet().get(id);
        return row && !row.missing ? fleetPermissions(row, user) : null;
    },
});
export const publicApiRoutes = publicApi({
    extension: router => registerPublicManagement(router, { tokens: () => tokens, provisions: () => provisions, operations: () => operations }),
    store: () => tokens,
    owner: async id => {
        const user = await userRepository.findById(id);
        return user ? { userId: user.id, isRoot: isPanelAdministrator(user), enabled: Boolean(user.is_enabled) } : null;
    },
    servers: () => fleet().list(),
    permissions: fleetPermissions,
    summary: fleetSummary,
    availability: fleetAvailability,
    detail: apiServerDetail,
    resources: apiResources,
    backups: apiBackups,
    power: apiPower,
    powerEvent: event => signedWebhooks().then(s => s.enqueue('server.power', { serverId: event.serverId, action: event.action, status: event.status }, event.id)),
    operations: { store: () => operations, normalizeName: normalizeBackupName, start: startApiBackup, readJob: readApiBackupJob },
});
