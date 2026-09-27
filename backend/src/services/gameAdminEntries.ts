export const steamId = /^STEAM_[0-5]:[01]:[0-9]{1,12}$/;
const entry = /^\s*"(STEAM_[0-5]:[01]:[0-9]{1,12})"\s+""\s+"([a-y]+)"\s+"ce"(?:\s*;.*)?\s*$/;
export function gameAdminEntries(content: string) {
    const entries: Array<{ steamId: string; flags: string }> = []; let unmanaged = 0;
    for (const line of content.split(/\r?\n/)) {
        const m = entry.exec(line);
        if (m) entries.push({ steamId: m[1], flags: m[2] });
        else if (line.trim() && !/^\s*(;|\/\/)/.test(line)) unmanaged++;
    }
    return { entries, unmanaged };
}
export function editGameAdmin(content: string, id: string, flags: string | null) {
    if (!steamId.test(id) || (flags !== null && !/^[a-y]{1,25}$/.test(flags))) throw Object.assign(new Error('Use a Steam ID and AMXX flags a–y'), { statusCode: 400 });
    const lines = content.split(/\r?\n/); let matches = 0;
    const result: string[] = [];
    for (const line of lines) {
        const m = entry.exec(line);
        if (m?.[1] === id) { matches++; if (flags !== null && matches === 1) result.push(`"${id}" "" "${[...new Set(flags)].sort().join('')}" "ce"`); }
        else {
            if (!/^\s*(;|\/\/)/.test(line) && line.includes(`"${id}"`)) throw Object.assign(new Error('This identity uses a custom authentication format; edit the file instead'), { statusCode: 409 });
            result.push(line);
        }
    }
    if (!matches && flags !== null) result.push(`"${id}" "" "${[...new Set(flags)].sort().join('')}" "ce"`);
    const text = result.join('\n').replace(/\n*$/, '\n');
    if (Buffer.byteLength(text) > 128 * 1024) throw Object.assign(new Error('Admin file exceeds limit'), { statusCode: 400 });
    return text;
}
