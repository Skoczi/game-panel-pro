export function backupLabel(name: string) {
  const match = /^native-(live-)?(.*?)(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-[a-f0-9-]{36}\.tar\.gz$/.exec(name);
  if (!match) return name;
  return match[2].replace(/-$/, '') || (match[1] ? 'Live backup' : 'Stopped-server backup');
}
export function backupAge(date: string, now = Date.now()) {
  const elapsed = now - Date.parse(date);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Age unavailable';
  const hours = Math.floor(elapsed / 3600000);
  return hours < 1 ? 'Less than an hour ago' : hours < 24 ? `${hours} hours ago` : `${Math.floor(hours / 24)} days ago`;
}
export type BackupVerification = { mode: 'live' | 'offline'; createdAt: string; validatedAt: string } | null;
