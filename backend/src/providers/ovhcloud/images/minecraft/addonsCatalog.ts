import { promises as fs } from 'node:fs';
import type { GameServerRow } from '../../../../types/gameServer.js';
import { resolveServerPath } from '../../../../services/fileExplorer.js';
import { getAppVersion } from '../../../../utils/appInfo.js';
import { logWarn } from '../../../../utils/logger.js';
import { getOvhcloudMinecraftMetadata } from '../../../serverMetadata.js';
import { invalidInput } from './shared.js';

const MODRINTH_API_BASE = (process.env.MODRINTH_API_BASE || 'https://api.modrinth.com/v2').replace(/\/+$/, '');
const MODRINTH_USER_AGENT = process.env.MODRINTH_USER_AGENT
    || `Game-Panel-PRO/${getAppVersion()} (+https://github.com/Skoczi/game-panel-skoczi)`;
const MODRINTH_TIMEOUT_MS = 15_000;

const TAGS_CACHE_TTL_MS = 60 * 60 * 1000;
const GAMESERVER_META_API_PATH = '/.gameserver-meta.json';

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 50;
const SEARCH_OFFSET_MAX = 5_000;
const PROJECT_VERSION_LIMIT = 20;
const PROJECT_BODY_MAX_LENGTH = 40_000;

const SEARCH_SORTS = ['relevance', 'downloads', 'follows', 'newest', 'updated'] as const;

export type MinecraftAddonKind = 'mods' | 'plugins';
export type MinecraftAddonLoader = 'paper' | 'fabric' | 'neoforge' | 'forge';
export type MinecraftAddonSort = (typeof SEARCH_SORTS)[number];
export type MinecraftVersionSource = 'metadata' | 'neoforge' | 'unknown';

export type MinecraftAddonArea = {
    kind: MinecraftAddonKind;
    loader: MinecraftAddonLoader;
    projectType: 'mod' | 'plugin';
    directory: string;
};

export type MinecraftAddonContext = MinecraftAddonArea & {
    minecraftVersion: string | null;
    minecraftVersionSource: MinecraftVersionSource;
    versionFilterAvailable: boolean;
    loaderVersion: string | null;
    sorts: MinecraftAddonSort[];
    categories: string[];
    catalogAvailable: boolean;
};

export type MinecraftAddonSearchParams = {
    query?: string;
    sort?: string;
    category?: string;
    offset?: number;
    limit?: number;
    anyVersion?: boolean;
};

export type MinecraftAddonSearchHit = {
    projectId: string;
    slug: string | null;
    title: string;
    description: string;
    author: string | null;
    iconUrl: string | null;
    downloads: number;
    follows: number;
    categories: string[];
    projectTypes: string[];
    serverSide: string | null;
    clientSide: string | null;
    dateModified: string | null;
    color: number | null;
    compatible: boolean;
    installed: boolean;
    installedVersionId: string | null;
};

export type MinecraftAddonSearchResult = {
    context: MinecraftAddonContext;
    sort: MinecraftAddonSort;
    offset: number;
    limit: number;
    total: number;
    versionFiltered: boolean;
    librariesExcluded: boolean;
    hits: MinecraftAddonSearchHit[];
};

export type MinecraftAddonVersion = {
    versionId: string;
    name: string;
    versionNumber: string;
    versionType: string;
    datePublished: string | null;
    downloads: number;
    gameVersions: string[];
    loaders: string[];
    fileName: string | null;
    fileSize: number | null;
    fileSha1: string | null;
};

export type MinecraftAddonDependency = {
    projectId: string;
    slug: string | null;
    title: string | null;
    iconUrl: string | null;
    type: string;
};

export type MinecraftAddonProject = {
    context: MinecraftAddonContext;
    projectId: string;
    slug: string | null;
    title: string;
    description: string;
    body: string;
    author: string | null;
    iconUrl: string | null;
    downloads: number;
    follows: number;
    categories: string[];
    projectTypes: string[];
    serverSide: string | null;
    clientSide: string | null;
    license: string | null;
    links: {
        source: string | null;
        issues: string | null;
        wiki: string | null;
        discord: string | null;
    };
    gallery: Array<{ url: string; title: string | null; description: string | null; featured: boolean }>;
    versionFiltered: boolean;
    compatibleVersionCount: number;
    versions: MinecraftAddonVersion[];
    dependencies: MinecraftAddonDependency[];
};

type GameServerMeta = {
    serverType: string | null;
    minecraftVersion: string | null;
    paperBuild: string | null;
    fabricLoaderVersion: string | null;
    neoForgeVersion: string | null;
    forgeVersion: string | null;
};

type TagsCache = {
    fetchedAt: number;
    gameVersions: Set<string>;
    categories: string[];
};

let tagsCache: TagsCache | null = null;

function unsupported(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 501 });
}

function upstreamFailure(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 502 });
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : [];
}

export async function modrinthRequest(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODRINTH_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(`${MODRINTH_API_BASE}${path}`, {
            ...init,
            headers: {
                accept: 'application/json',
                'user-agent': MODRINTH_USER_AGENT,
                ...(init?.body ? { 'content-type': 'application/json' } : {}),
                ...(init?.headers as Record<string, string> | undefined),
            },
            signal: controller.signal,
        });
    } catch {
        upstreamFailure('Unable to reach the Modrinth API');
    } finally {
        clearTimeout(timeout);
    }

    if (response.status === 404) {
        throw Object.assign(new Error('Modrinth project not found'), { statusCode: 404 });
    }

    if (response.status === 429) {
        upstreamFailure('Modrinth API rate limit reached, try again in a moment');
    }

    if (!response.ok) {
        upstreamFailure(`Modrinth API error (HTTP ${response.status})`);
    }

    try {
        return await response.json();
    } catch {
        upstreamFailure('Modrinth API returned an invalid response');
    }
}

export function encodeJsonParam(value: unknown): string {
    return encodeURIComponent(JSON.stringify(value));
}

async function getModrinthTags(): Promise<TagsCache> {
    if (tagsCache && Date.now() - tagsCache.fetchedAt < TAGS_CACHE_TTL_MS) {
        return tagsCache;
    }

    const [rawVersions, rawCategories] = await Promise.all([
        modrinthRequest('/tag/game_version'),
        modrinthRequest('/tag/category'),
    ]);

    const gameVersions = new Set<string>();
    if (Array.isArray(rawVersions)) {
        for (const entry of rawVersions) {
            const version = asString((entry as Record<string, unknown>)?.version);
            if (version) gameVersions.add(version);
        }
    }

    const categories: string[] = [];
    if (Array.isArray(rawCategories)) {
        for (const entry of rawCategories) {
            const record = entry as Record<string, unknown>;
            if (record?.project_type !== 'mod' || record?.header !== 'categories') continue;
            const name = asString(record?.name);
            if (name && !categories.includes(name)) categories.push(name);
        }
    }

    if (gameVersions.size === 0 || categories.length === 0) {
        upstreamFailure('Modrinth API returned an empty tag list');
    }

    tagsCache = { fetchedAt: Date.now(), gameVersions, categories: categories.sort() };
    return tagsCache;
}

export function deriveMinecraftVersionFromNeoForge(version: string): string | null {
    const base = String(version ?? '').trim().split('+')[0].split('-')[0];
    const parts = base.split('.').map((part) => Number(part));

    if (!Number.isInteger(parts[0]) || !Number.isInteger(parts[1])) return null;

    if (parts[0] >= 26) {
        const patch = Number.isInteger(parts[2]) && parts[2] > 0 ? `.${parts[2]}` : '';
        return `${parts[0]}.${parts[1]}${patch}`;
    }

    if (parts[0] >= 20 && parts[0] <= 25) {
        const patch = parts[1] > 0 ? `.${parts[1]}` : '';
        return `1.${parts[0]}${patch}`;
    }

    return null;
}

async function readGameServerMeta(serverId: number): Promise<GameServerMeta | null> {
    const resolved = await resolveServerPath({ serverId, root: 'data', path: GAMESERVER_META_API_PATH });

    let raw: string;
    try {
        raw = await fs.readFile(resolved.absPath, 'utf8');
    } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') return null;
        throw error;
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        logWarn('MINECRAFT:ADDONS_CATALOG', 'Ignoring unreadable .gameserver-meta.json', { serverId });
        return null;
    }

    return {
        serverType: asString(parsed.serverType),
        minecraftVersion: asString(parsed.minecraftVersion),
        paperBuild: parsed.paperBuild === undefined || parsed.paperBuild === null ? null : String(parsed.paperBuild),
        fabricLoaderVersion: asString(parsed.fabricLoaderVersion),
        neoForgeVersion: asString(parsed.neoForgeVersion),
        forgeVersion: asString(parsed.forgeVersion),
    };
}

export function resolveMinecraftAddonArea(server: GameServerRow): MinecraftAddonArea {
    const metadata = getOvhcloudMinecraftMetadata(server);

    if (metadata.edition !== 'java') {
        unsupported('The addon catalog is only available for OVHcloud Minecraft Java servers');
    }

    if (metadata.serverType === 'paper') {
        return { kind: 'plugins', loader: 'paper', projectType: 'plugin', directory: '/plugins' };
    }

    if (metadata.serverType === 'fabric' || metadata.serverType === 'neoforge' || metadata.serverType === 'forge') {
        return { kind: 'mods', loader: metadata.serverType, projectType: 'mod', directory: '/mods' };
    }

    unsupported('The addon catalog is not supported for this Minecraft image');
}

function resolveLoaderVersion(area: MinecraftAddonArea, meta: GameServerMeta | null): string | null {
    if (!meta) return null;

    switch (area.loader) {
        case 'paper': return meta.paperBuild;
        case 'fabric': return meta.fabricLoaderVersion;
        case 'neoforge': return meta.neoForgeVersion;
        case 'forge': return meta.forgeVersion;
        default: return null;
    }
}

export async function resolveMinecraftAddonContext(
    server: GameServerRow,
    options?: { requireCatalog?: boolean }
): Promise<MinecraftAddonContext> {
    const area = resolveMinecraftAddonArea(server);
    const meta = await readGameServerMeta(server.id);

    let tags: TagsCache | null = null;
    try {
        tags = await getModrinthTags();
    } catch (error) {
        if (options?.requireCatalog !== false) throw error;
        logWarn('MINECRAFT:ADDONS_CATALOG', 'Modrinth is unreachable, serving the installed addons without catalog data', {
            serverId: server.id,
        });
    }

    let minecraftVersion = meta?.minecraftVersion ?? null;
    let minecraftVersionSource: MinecraftVersionSource = minecraftVersion ? 'metadata' : 'unknown';

    if (!minecraftVersion && area.loader === 'neoforge' && meta?.neoForgeVersion) {
        minecraftVersion = deriveMinecraftVersionFromNeoForge(meta.neoForgeVersion);
        minecraftVersionSource = minecraftVersion ? 'neoforge' : 'unknown';
    }

    const versionFilterAvailable = Boolean(tags && minecraftVersion && tags.gameVersions.has(minecraftVersion));

    if (tags && minecraftVersion && !versionFilterAvailable) {
        logWarn('MINECRAFT:ADDONS_CATALOG', 'Minecraft version is unknown to Modrinth, serving the catalog unfiltered', {
            serverId: server.id,
            minecraftVersion,
            minecraftVersionSource,
        });
    }

    return {
        ...area,
        minecraftVersion,
        minecraftVersionSource,
        versionFilterAvailable,
        loaderVersion: resolveLoaderVersion(area, meta),
        sorts: [...SEARCH_SORTS],
        categories: tags?.categories ?? [],
        catalogAvailable: tags !== null,
    };
}

function normalizeSort(value: string | undefined, hasQuery: boolean): MinecraftAddonSort {
    if (value === undefined || value === '') return hasQuery ? 'relevance' : 'downloads';
    if ((SEARCH_SORTS as readonly string[]).includes(value)) return value as MinecraftAddonSort;
    invalidInput(`sort must be one of: ${SEARCH_SORTS.join(', ')}`);
}

function normalizeCategory(value: string | undefined, categories: string[]): string | null {
    if (value === undefined || value === '') return null;
    if (!categories.includes(value)) invalidInput(`Unknown category: ${value}`);
    return value;
}

function mapSearchHit(raw: unknown, minecraftVersion: string | null): MinecraftAddonSearchHit | null {
    const record = raw as Record<string, unknown>;
    const projectId = asString(record?.project_id);
    if (!projectId) return null;

    const gameVersions = asStringArray(record.versions);

    return {
        projectId,
        slug: asString(record.slug),
        title: asString(record.title) ?? projectId,
        description: asString(record.description) ?? '',
        author: asString(record.author),
        iconUrl: asString(record.icon_url),
        downloads: asNumber(record.downloads),
        follows: asNumber(record.follows),
        categories: asStringArray(record.display_categories),
        projectTypes: asStringArray(record.all_project_types),
        serverSide: asString(record.server_side),
        clientSide: asString(record.client_side),
        dateModified: asString(record.date_modified),
        color: typeof record.color === 'number' ? record.color : null,
        compatible: minecraftVersion ? gameVersions.includes(minecraftVersion) : true,
        installed: false,
        installedVersionId: null,
    };
}

export async function searchMinecraftAddons(
    server: GameServerRow,
    params: MinecraftAddonSearchParams
): Promise<MinecraftAddonSearchResult> {
    const context = await resolveMinecraftAddonContext(server);

    const query = params.query?.trim() ?? '';
    const sort = normalizeSort(params.sort, query.length > 0);
    const category = normalizeCategory(params.category, context.categories);
    const limit = Math.min(Math.max(params.limit ?? SEARCH_LIMIT_DEFAULT, 1), SEARCH_LIMIT_MAX);
    const offset = Math.min(Math.max(params.offset ?? 0, 0), SEARCH_OFFSET_MAX);

    const versionFiltered = context.versionFilterAvailable && params.anyVersion !== true;
    const librariesExcluded = query.length === 0 && category === null;

    const facets: string[][] = [
        [`project_type:${context.projectType}`],
        [`categories:${context.loader}`],
        ['server_side!=unsupported'],
    ];

    if (versionFiltered) facets.push([`versions:${context.minecraftVersion}`]);
    if (category) facets.push([`categories:${category}`]);
    if (librariesExcluded) facets.push(['categories!=library']);

    const search = new URLSearchParams();
    if (query) search.set('query', query);
    search.set('index', sort);
    search.set('offset', String(offset));
    search.set('limit', String(limit));

    const raw = await modrinthRequest(`/search?${search.toString()}&facets=${encodeJsonParam(facets)}`) as Record<string, unknown>;
    const hits = Array.isArray(raw?.hits) ? raw.hits : [];

    return {
        context,
        sort,
        offset,
        limit,
        total: asNumber(raw?.total_hits),
        versionFiltered,
        librariesExcluded,
        hits: hits
            .map((hit) => mapSearchHit(hit, context.minecraftVersion))
            .filter((hit): hit is MinecraftAddonSearchHit => hit !== null),
    };
}

function normalizeProjectRef(value: string): string {
    const ref = String(value ?? '').trim();
    if (!/^[A-Za-z0-9._+-]{1,64}$/.test(ref)) invalidInput('Invalid Modrinth project id');
    return ref;
}

function mapVersion(raw: unknown): MinecraftAddonVersion | null {
    const record = raw as Record<string, unknown>;
    const versionId = asString(record?.id);
    if (!versionId) return null;

    const files = Array.isArray(record.files) ? record.files : [];
    const primary = (files.find((file) => (file as Record<string, unknown>)?.primary === true) ?? files[0]) as
        | Record<string, unknown>
        | undefined;
    const hashes = primary?.hashes as Record<string, unknown> | undefined;

    return {
        versionId,
        name: asString(record.name) ?? versionId,
        versionNumber: asString(record.version_number) ?? versionId,
        versionType: asString(record.version_type) ?? 'release',
        datePublished: asString(record.date_published),
        downloads: asNumber(record.downloads),
        gameVersions: asStringArray(record.game_versions),
        loaders: asStringArray(record.loaders),
        fileName: asString(primary?.filename),
        fileSize: typeof primary?.size === 'number' ? primary.size : null,
        fileSha1: asString(hashes?.sha1),
    };
}

async function resolveDependencies(raw: unknown): Promise<MinecraftAddonDependency[]> {
    const entries = Array.isArray(raw) ? raw : [];
    const declared: Array<{ projectId: string; type: string }> = [];

    for (const entry of entries) {
        const record = entry as Record<string, unknown>;
        const projectId = asString(record?.project_id);
        const type = asString(record?.dependency_type) ?? 'required';
        if (projectId && !declared.some((item) => item.projectId === projectId)) {
            declared.push({ projectId, type });
        }
    }

    if (declared.length === 0) return [];

    let projects: unknown = [];
    try {
        projects = await modrinthRequest(`/projects?ids=${encodeJsonParam(declared.map((item) => item.projectId))}`);
    } catch {
        projects = [];
    }

    const byId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(projects)) {
        for (const project of projects) {
            const record = project as Record<string, unknown>;
            const id = asString(record?.id);
            if (id) byId.set(id, record);
        }
    }

    return declared.map((item) => {
        const project = byId.get(item.projectId);
        return {
            projectId: item.projectId,
            slug: asString(project?.slug),
            title: asString(project?.title),
            iconUrl: asString(project?.icon_url),
            type: item.type,
        };
    });
}

async function resolveProjectAuthor(ref: string): Promise<string | null> {
    let members: unknown;
    try {
        members = await modrinthRequest(`/project/${encodeURIComponent(ref)}/members`);
    } catch {
        return null;
    }

    if (!Array.isArray(members)) return null;

    const owner = members.find((member) => (member as Record<string, unknown>)?.role === 'Owner') ?? members[0];
    const user = (owner as Record<string, unknown>)?.user as Record<string, unknown> | undefined;
    return asString(user?.username);
}

export async function getMinecraftAddonProject(
    server: GameServerRow,
    projectRef: string,
    options?: { anyVersion?: boolean }
): Promise<MinecraftAddonProject> {
    const context = await resolveMinecraftAddonContext(server);
    const ref = normalizeProjectRef(projectRef);
    const versionFiltered = context.versionFilterAvailable && options?.anyVersion !== true;

    const versionQuery = new URLSearchParams();
    versionQuery.set('loaders', JSON.stringify([context.loader]));
    if (versionFiltered) versionQuery.set('game_versions', JSON.stringify([context.minecraftVersion]));

    const [rawProject, rawVersions, author] = await Promise.all([
        modrinthRequest(`/project/${encodeURIComponent(ref)}`) as Promise<Record<string, unknown>>,
        modrinthRequest(`/project/${encodeURIComponent(ref)}/version?${versionQuery.toString()}`),
        resolveProjectAuthor(ref),
    ]);

    const allVersions = (Array.isArray(rawVersions) ? rawVersions : [])
        .map(mapVersion)
        .filter((version): version is MinecraftAddonVersion => version !== null);

    const latestRelease = allVersions.find((version) => version.versionType === 'release') ?? allVersions[0] ?? null;
    const rawLatest = Array.isArray(rawVersions)
        ? (rawVersions as Array<Record<string, unknown>>).find((entry) => asString(entry?.id) === latestRelease?.versionId)
        : undefined;

    const projectId = asString(rawProject?.id) ?? ref;
    const gallery = Array.isArray(rawProject?.gallery) ? rawProject.gallery : [];

    return {
        context,
        projectId,
        slug: asString(rawProject?.slug),
        title: asString(rawProject?.title) ?? projectId,
        description: asString(rawProject?.description) ?? '',
        body: (asString(rawProject?.body) ?? '').slice(0, PROJECT_BODY_MAX_LENGTH),
        author,
        iconUrl: asString(rawProject?.icon_url),
        downloads: asNumber(rawProject?.downloads),
        follows: asNumber(rawProject?.followers),
        categories: [...asStringArray(rawProject?.categories), ...asStringArray(rawProject?.additional_categories)],
        projectTypes: asStringArray([rawProject?.project_type]),
        serverSide: asString(rawProject?.server_side),
        clientSide: asString(rawProject?.client_side),
        license: asString((rawProject?.license as Record<string, unknown> | undefined)?.name),
        links: {
            source: asString(rawProject?.source_url),
            issues: asString(rawProject?.issues_url),
            wiki: asString(rawProject?.wiki_url),
            discord: asString(rawProject?.discord_url),
        },
        gallery: gallery.map((entry) => {
            const record = entry as Record<string, unknown>;
            return {
                url: asString(record?.url) ?? '',
                title: asString(record?.title),
                description: asString(record?.description),
                featured: record?.featured === true,
            };
        }).filter((entry) => entry.url.length > 0),
        versionFiltered,
        compatibleVersionCount: allVersions.length,
        versions: allVersions.slice(0, PROJECT_VERSION_LIMIT),
        dependencies: await resolveDependencies(rawLatest?.dependencies),
    };
}
