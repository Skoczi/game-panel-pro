import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createHmac } from 'node:crypto';
const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(ip, bits);
for (const [ip, bits] of [['2001:db8::', 32], ['2001::', 23], ['3fff::', 20], ['2002::', 16]] as const) blocked.addSubnet(ip, bits, 'ipv6');
export function publicWebhookAddress(address: string) {
    const family = isIP(address);
    return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, 'ipv6');
}
export function signedWebhookUrl(input: unknown) {
    if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter an HTTPS webhook URL');
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('Use HTTPS port 443 without credentials, query or fragment');
    return url;
}
export function webhookSignature(secret: string, timestamp: string, body: string) {
    return createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
}
/** Resolve once, reject private answers and pin the public address for this request. */
export async function deliverSignedWebhook(endpoint: string, secret: string, id: string, body: string) {
    const url = signedWebhookUrl(endpoint), host = url.hostname.replace(/^\[|\]$/g, '');
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([lookup(host, { all: true }), new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('Webhook DNS timeout')), 5000); })]).finally(() => clearTimeout(dnsTimer));
    if (!addresses.length || addresses.some(a => !publicWebhookAddress(a.address))) throw new Error('Webhook destination must resolve only to public addresses');
    const selected = addresses[0], timestamp = String(Math.floor(Date.now() / 1000));
    return new Promise<number>((resolve, reject) => {
        const request = https.request(url, { method: 'POST', agent: false,
            lookup: ((_host: string, options: any, done: any) => options?.all ? done(null, [selected]) : done(null, selected.address, selected.family)) as any,
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
                'x-eserv-event-id': id, 'x-eserv-timestamp': timestamp, 'x-eserv-signature': 'v1=' + webhookSignature(secret, timestamp, body) } }, response => {
            const status = response.statusCode || 500;
            response.destroy(); resolve(status);
        });
        const timer = setTimeout(() => request.destroy(new Error('Webhook delivery timeout')), 8000);
        request.once('close', () => clearTimeout(timer)); request.once('error', reject); request.end(body);
    });
}
