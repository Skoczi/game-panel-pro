import { useEffect, useState } from 'react';

export function AuthenticatorSetup({ secret, username }: { secret: string; username: string }) {
  const [qr, setQr] = useState(''), [failed, setFailed] = useState(false);
  const issuer = location.hostname;
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?` +
    new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' }).toString();
  useEffect(() => {
    let cancelled = false;
    setQr(''); setFailed(false);
    void import('qrcode').then(module => module.toDataURL(uri, {
      errorCorrectionLevel: 'M', margin: 4, width: 320, color: { dark: '#000000', light: '#ffffff' },
    })).then(value => { if (!cancelled) setQr(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [uri]);
  return <div className="space-y-3 rounded border border-gray-400/40 p-3">
    <p>Scan this QR code with your iPhone or authenticator app, then enter the generated code below.</p>
    {qr ? <img src={qr} alt="Authenticator setup QR code" width={320} height={320} className="mx-auto block h-auto w-full max-w-60 rounded bg-white" />
      : <p role="status">{failed ? 'QR code unavailable. Use the app link or manual setup key.' : 'Preparing QR code…'}</p>}
    <p className="text-sm break-all">{issuer} · {username}</p>
    <a href={uri} style={{ backgroundColor: '#0e7490', color: '#fff' }} className="inline-flex rounded px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Open in authenticator app</a>
    <p className="text-xs">On the same iPhone, use the button. If no compatible app opens, use manual setup.</p>
    <details><summary className="cursor-pointer text-sm underline">Enter setup key manually</summary>
      <code className="mt-2 block break-all select-all">{secret}</code>
      <p className="mt-2 text-xs">Time-based · 6 digits · SHA-1 · 30 seconds</p>
    </details>
    <p className="text-xs">Keep this QR code and key private. Protection starts after you confirm a generated code.</p>
  </div>;
}
