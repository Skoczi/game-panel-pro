import { serverRepository, installProgressRepository } from '../database/index.js';
import { readTemplateTicket, materializeTemplate } from '../templates/tickets.js';
import { nativeContainerOptions, nativeTemplate } from '../templates/nativeContract.js';
import { resolveInstallSpec } from '../providers/installSpec.js';
import { normalizeResourceLimitsPayload } from '../utils/resourceLimits.js';
import { buildAndValidateOpenPortMappings } from '../utils/ports.js';
import { resolveTemplateBindings } from './templatePortAllocation.js';
import { assertHostPortsAvailableForServer } from './hostPortAvailability.js';
import { preflightSharedMounts } from './sharedFiles.js';
import { resolveNativeImages } from './nativeImages.js';
import { enterPortAllocationMutation } from './portAllocationLock.js';
import { installServerAsync } from './servers.js';
import { agentIdentity, isAgent } from '../agent/identity.js';
import { getConfig } from '../config.js';
import { apiFail } from './apiProvisioning.js';
import { serializeGameServerWithInstallProgress } from '../utils/apiSerialization.js';
import { runtimeSummary } from './apiServerDto.js';
import { bus } from '../realtime/bus.js';
export async function provisionReceipt(operationId: string) {
    if (!/^[0-9a-f-]{36}$/.test(operationId)) apiFail(400, 'Invalid operation');
    const matches = (await serverRepository.listAll()).filter(s => { try { return JSON.parse(s.runtime_config_json).apiProvisionId === operationId; } catch { return false; } });
    if (matches.length > 1) apiFail(409, 'Ambiguous installation identity; inspect server history');
    const server = matches[0];
    if (!server) return null;
    return { id: server.id, runtimeKey: server.runtime_uuid!, name: server.name, provider: server.provider, catalogId: server.catalog_id, status: server.status,
        installation: runtimeSummary(serializeGameServerWithInstallProgress(server, await installProgressRepository.getByServerId(server.id))).installation };
}
export async function provisionNative(body: any, actor: string, plan = false) {
    if (!plan) {
        const previous = await provisionReceipt(body.operationId);
        if (previous) return previous;
    }
    const release = enterPortAllocationMutation();
    try {
        const identity = isAgent() ? agentIdentity() : null;
        const snapshot = readTemplateTicket(body.ticket, identity?.key ?? getConfig().jwtSecret, identity?.nodeId ?? 'local');
        if (!snapshot.document.lifecycle) apiFail(409, 'This template does not support stopped installation; publish a Native template');
        if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.length > 50) apiFail(400, 'Invalid server name');
        if (await serverRepository.findByName(body.name)) apiFail(409, 'Server name already exists');
        const bindings = await resolveTemplateBindings(snapshot.document, body.bindings);
        const input = materializeTemplate(snapshot, { ...body, bindings });
        const ports = buildAndValidateOpenPortMappings({ portsPayload: input.ports }).ports;
        await assertHostPortsAvailableForServer({ ports });
        const resourceLimits = normalizeResourceLimitsPayload(body.resourceLimits);
        if (!resourceLimits?.cpu || !resourceLimits.memoryMb || resourceLimits.cpuSet) apiFail(400, 'Explicit CPU and memory limits required');
        const spec = await resolveInstallSpec({ provider: snapshot.document.runtime.provider, body: input, ports, healthcheck: null, resourceLimits, steamCredentials: null });
        spec.providerMetadata.template = snapshot;
        spec.providerMetadata.templateLinuxgsmConfig = input.templateLinuxgsmConfig;
        const native = nativeTemplate(spec.providerMetadata)!;
        const options = nativeContainerOptions(native, spec.env, spec.ports);
        await preflightSharedMounts(native.mounts);
        const images = await resolveNativeImages(native);
        if (plan) return { bindings, limits: resourceLimits, startAfterInstall: false, template: { id: snapshot.id, version: snapshot.version, hash: snapshot.hash } };
        spec.runtimeConfig = { ...spec.runtimeConfig, ...images, terminalUser: options.user, execUser: options.user, terminalWorkdir: options.workdir, execWorkdir: options.workdir, nativeOperation: 'install', apiProvisionId: body.operationId };
        const id = await serverRepository.create({ name: body.name, provider: spec.provider, catalogId: spec.catalogId, dockerImage: spec.dockerImage,
            ports, healthcheck: null, resourceLimits, mounts: spec.mounts, env: spec.env, runtimeConfig: spec.runtimeConfig, providerMetadata: spec.providerMetadata, initialStatus: 'creating', desiredState: 'stopped' });
        release();
        await installProgressRepository.create(id);
        bus.emit('server.created', { serverId: id, timestamp: new Date().toISOString() });
        void installServerAsync(id, body.name, spec, actor).catch(() => console.error('API installation failed', id));
        return (await provisionReceipt(body.operationId))!;
    } finally { release(); }
}
