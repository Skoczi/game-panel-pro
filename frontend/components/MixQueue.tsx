import { useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  Download,
  FileJson,
  Link2,
  RotateCw,
  Unplug,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { AppButton } from '../src/ui/components';
import { ConfirmationModal } from './ConfirmationModal';
import { apiClient } from '../utils/api';
import { nodesRequest } from '../utils/nodesApi';
import './mixqueue.css';

type Language = 'pl' | 'en';
const words = {
  en: {
    enabled: 'Enabled',
    disabled: 'Disabled',
    install: 'Install runtime',
    update: 'Update runtime',
    available: 'Available',
    restartRequired: 'Runtime updated. Restart this agent after the current session ends.',
    unknownVersion: 'Previous version',
    installed: 'Installed on this node',
    installing: 'Installing…',
    refresh: 'Refresh',
    restart: 'Restart agent',
    disconnect: 'Disconnect',
    connect: 'Import configuration',
    file: 'Private JSON from csco.gg',
    password: 'RCON password',
    passwordHint: 'Leave blank to use the server configuration.',
    import: 'Import JSON',
    replace: 'Replace configuration',
    process: 'Agent',
    rcon: 'RCON',
    journal: 'Plugin journal',
    heartbeat: 'Matchmaking',
    ready: 'Ready',
    waiting: 'Waiting',
    running: 'Running',
    stopped: 'Stopped',
    connected: 'Connected',
    unavailable: 'Unavailable',
    setup: 'Connection',
    plugin: 'Game plugin',
    installPlugin: 'Install plugin',
    reviewPlugin: 'Review installation',
    cancel: 'Cancel',
    installMatchbot: 'Install MatchBot CSCO',
    dependencies: 'Dependencies',
    conflicts: 'Plugins to disable',
    noConflicts: 'No conflicting plugins detected',
    pluginScope: 'Verified backup · Server stays stopped',
    plugin_preview_changed: 'Configuration changed. Review the installation again.',
    incompatible_game_image: 'The game image needs Linux i386 support and glibc 2.36 or newer.',
    matchbot_install_failed: 'Installation failed. Check the operation log before retrying.',
    matchbot_backup_failed: 'Backup failed. Game files were not changed.',
    matchbot_assignment_active: 'End the assigned session in csco.gg and wait for confirmed cleanup.',
    stage: 'Installation',
    pluginInstalled: 'Plugin installed',
    updatePlugin: 'Review update',
    requiresWeb: 'Requires CSCO',
    pluginMissing: 'Not installed',
    plugin_not_installed: 'Install the game plugin before enabling MixQueue.',
    nodeRequired: 'Install MixQueue in this node’s settings.',
    unconfigured: 'No matchmaking configuration',
    imported: 'Configuration imported. Enable MixQueue when ready.',
    logs: 'Agent events',
    emptyLogs: 'No events yet',
    removeTitle: 'Disconnect MixQueue?',
    removeText: 'Removes credentials and the local event spool. Game files stay in place.',
    language: 'Language',
    working: 'Working…',
    unsupported: 'MixQueue supports CS 1.6, CS:GO and Classic Offensive.',
    runtime: 'Node runtime',
    private: 'Owner & operators',
    version: 'Version',
    error: 'Operation failed. Refresh and check the current state.',
    lost: 'Connection lost',
    rcon_password_required: 'Enter the existing RCON password.',
    stop_game_before_plugin_install: 'Stop this game before installing its plugin.',
    framework_required: 'Install AMX Mod X or SourceMod first.',
    get5_required: 'This Source server also requires Get5.',
    runtime_not_installed: 'Install the runtime in node settings first.',
    disconnect_before_identity_change: 'Disconnect the current identity before importing another.',
    identity_already_connected: 'This identity is already assigned to another server on this node.',
    invalid_identity_or_endpoint: 'The JSON belongs to another game or an unsupported endpoint.',
    invalid_import: 'Select a valid csco.gg setup JSON.',
    invalid_key: 'The JSON contains an invalid agent key.',
    invalid_rcon_password: 'The RCON password has an unsupported format.',
    plugin_exists_different_version: 'A different plugin version is already installed.',
    rcon_or_plugin: 'RCON or plugin unavailable',
    journal_or_events: 'Journal or event delivery failed',
    matchmaking_or_command: 'Matchmaking request failed',
    executor_failed: 'Agent stopped unexpectedly',
  },
  pl: {
    enabled: 'Włączony',
    disabled: 'Wyłączony',
    install: 'Zainstaluj runtime',
    update: 'Aktualizuj runtime',
    available: 'Dostępna',
    restartRequired: 'Runtime zaktualizowany. Zrestartuj agenta po zakończeniu bieżącej sesji.',
    unknownVersion: 'Poprzednia wersja',
    installed: 'Zainstalowany na węźle',
    installing: 'Instalowanie…',
    refresh: 'Odśwież',
    restart: 'Restart agenta',
    disconnect: 'Odłącz',
    connect: 'Import konfiguracji',
    file: 'Prywatny JSON z csco.gg',
    password: 'Hasło RCON',
    passwordHint: 'Pozostaw puste, aby użyć konfiguracji serwera.',
    import: 'Importuj JSON',
    replace: 'Zmień konfigurację',
    process: 'Agent',
    rcon: 'RCON',
    journal: 'Dziennik pluginu',
    heartbeat: 'Matchmaking',
    ready: 'Gotowy',
    waiting: 'Oczekiwanie',
    running: 'Uruchomiony',
    stopped: 'Zatrzymany',
    connected: 'Połączony',
    unavailable: 'Niedostępny',
    setup: 'Połączenie',
    plugin: 'Plugin gry',
    installPlugin: 'Zainstaluj plugin',
    reviewPlugin: 'Przejrzyj instalację',
    cancel: 'Anuluj',
    installMatchbot: 'Zainstaluj MatchBot CSCO',
    dependencies: 'Zależności',
    conflicts: 'Pluginy do wyłączenia',
    noConflicts: 'Nie wykryto kolidujących pluginów',
    pluginScope: 'Zweryfikowany backup · Serwer pozostaje wyłączony',
    plugin_preview_changed: 'Konfiguracja się zmieniła. Otwórz ponownie podgląd instalacji.',
    incompatible_game_image: 'Obraz gry wymaga obsługi Linux i386 i glibc co najmniej 2.36.',
    matchbot_install_failed: 'Instalacja nieudana. Sprawdź dziennik operacji przed kolejną próbą.',
    matchbot_backup_failed: 'Backup nieudany. Pliki gry nie zostały zmienione.',
    matchbot_assignment_active: 'Zakończ przypisaną sesję w csco.gg i poczekaj na potwierdzenie jej wyczyszczenia.',
    stage: 'Instalacja',
    pluginInstalled: 'Plugin zainstalowany',
    updatePlugin: 'Przejrzyj aktualizację',
    requiresWeb: 'Wymaga CSCO',
    pluginMissing: 'Nie zainstalowano',
    plugin_not_installed: 'Zainstaluj plugin gry przed włączeniem MixQueue.',
    nodeRequired: 'Zainstaluj MixQueue w ustawieniach tego węzła.',
    unconfigured: 'Brak konfiguracji matchmakingu',
    imported: 'Konfiguracja zapisana. Możesz włączyć MixQueue.',
    logs: 'Zdarzenia agenta',
    emptyLogs: 'Brak zdarzeń',
    removeTitle: 'Odłączyć MixQueue?',
    removeText: 'Usuwa klucze i lokalną bazę zdarzeń. Pliki gry pozostają na miejscu.',
    language: 'Język',
    working: 'Przetwarzanie…',
    unsupported: 'MixQueue obsługuje CS 1.6, CS:GO i Classic Offensive.',
    runtime: 'Runtime węzła',
    private: 'Właściciel i operatorzy',
    version: 'Wersja',
    error: 'Operacja nie powiodła się. Odśwież i sprawdź aktualny stan.',
    lost: 'Utracono połączenie',
    rcon_password_required: 'Podaj istniejące hasło RCON.',
    stop_game_before_plugin_install: 'Zatrzymaj tę grę przed instalacją pluginu.',
    framework_required: 'Najpierw zainstaluj AMX Mod X lub SourceMod.',
    get5_required: 'Ten serwer Source wymaga także Get5.',
    runtime_not_installed: 'Najpierw zainstaluj runtime w ustawieniach węzła.',
    disconnect_before_identity_change: 'Odłącz obecną tożsamość przed importem innej.',
    identity_already_connected: 'Ta tożsamość jest już przypisana do innego serwera na tym węźle.',
    invalid_identity_or_endpoint: 'JSON dotyczy innej gry lub nieobsługiwanego adresu API.',
    invalid_import: 'Wybierz poprawny plik setup JSON z csco.gg.',
    invalid_key: 'JSON zawiera niepoprawny klucz agenta.',
    invalid_rcon_password: 'Hasło RCON ma nieobsługiwany format.',
    plugin_exists_different_version: 'Zainstalowana jest już inna wersja pluginu.',
    rcon_or_plugin: 'RCON lub plugin niedostępny',
    journal_or_events: 'Błąd dziennika lub wysyłania zdarzeń',
    matchmaking_or_command: 'Błąd połączenia z matchmakingiem',
    executor_failed: 'Agent został nieoczekiwanie zatrzymany',
  },
};
function useLanguage() {
  return useState<Language>(() => (navigator.language.startsWith('pl') ? 'pl' : 'en'));
}
function LanguagePicker({
  value,
  onChange,
}: {
  value: Language;
  onChange: (value: Language) => void;
}) {
  return (
    <div className="mq-language" role="group" aria-label={words[value].language}>
      {(['pl', 'en'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={value === lang}
          onClick={() => onChange(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
const errorCode = (error: any) => error?.response?.data?.error || error?.message || 'error';
function message(code: string, lang: Language) {
  return (words[lang] as Record<string, string>)[code] || words[lang].error;
}
function installationStage(stage: string | undefined, lang: Language) {
  const labels: Record<string, [string, string]> = {
    compatibility: ['Sprawdzanie obrazu gry', 'Checking game image'],
    'backup-scan': ['Przygotowanie backupu', 'Preparing backup'],
    backup: ['Tworzenie backupu', 'Creating backup'],
    'backup-verify': ['Weryfikacja backupu', 'Verifying backup'],
    'backup-protection': ['Zabezpieczanie backupu', 'Protecting backup'],
    'backup-ready': ['Backup gotowy', 'Backup ready'],
    'packages-ready': ['Pakiety zweryfikowane', 'Packages verified'],
    staging: ['Przygotowanie plików', 'Preparing files'],
    configure: ['Konfiguracja pluginów', 'Configuring plugins'],
    commit: ['Zapisywanie zmian', 'Applying changes'],
    completed: ['Zainstalowano', 'Installed'],
  };
  const dependency = /^(download|install)-(rehlds|regamedll|metamod)$/.exec(stage || '');
  if (dependency) {
    const verb = dependency[1] === 'download' ? (lang === 'pl' ? 'Pobieranie' : 'Downloading') : (lang === 'pl' ? 'Instalowanie' : 'Installing');
    return `${verb} ${{ rehlds: 'ReHLDS', regamedll: 'ReGameDLL', metamod: 'Metamod' }[dependency[2]]}`;
  }
  return labels[stage || '']?.[lang === 'pl' ? 0 : 1] || words[lang].working;
}

export function MixQueueNode({ nodeId }: { nodeId: string }) {
  const [lang, setLang] = useLanguage(),
    t = words[lang];
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const url = (nodeId === 'local' ? '' : `/api/nodes/${nodeId}/runtime`) + '/api/system/mixqueue';
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await nodesRequest(url);
        if (active) {
          setData(result);
          setError('');
        }
      } catch {
        if (active) setError(t.lost);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [url, t.lost]);
  const install = async () => {
    setBusy(true);
    setError('');
    try {
      setData(await nodesRequest(url, { action: 'install' }));
    } catch (e) {
      setError(message(errorCode(e), lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mq-panel" aria-label="MixQueue node">
      <header className="mq-header">
        <div className="mq-title">
          <span className="mq-symbol">
            <Activity size={24} />
          </span>
          <div>
            <h2>MixQueue</h2>
            <p>{t.runtime}</p>
          </div>
        </div>
        <LanguagePicker value={lang} onChange={setLang} />
      </header>
      {error && (
        <p role="alert" className="mq-error">
          {error}
        </p>
      )}
      <div className="mq-node-row">
        <div>
          <strong>
            {data?.installation === 'installing'
              ? t.installing
              : data?.installed
                ? t.installed
                : t.disabled}
          </strong>
          <p>
            {data?.installed ? `${t.version} ${data.installedVersion || t.unknownVersion}` : `${t.available} ${data?.version || '—'}`}
            {data?.updateAvailable && ` → ${data.version}`}
          </p>
        </div>
        <AppButton
          tone="primary"
          onClick={install}
          disabled={busy || !data || data.installation === 'installing' || (data.installed && !data.updateAvailable)}
        >
          <Download size={16} />
          {data?.installation === 'installing'
            ? t.installing
            : data?.updateAvailable ? t.update : data?.installed
              ? t.installed
              : t.install}
        </AppButton>
      </div>
      {data?.error && (
        <p className="mq-error" role="alert">
          {t.error}
        </p>
      )}
    </section>
  );
}

export function MixQueueServer({ serverId }: { serverId: number }) {
  const [lang, setLang] = useLanguage(),
    t = words[lang],
    id = useId();
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [showImport, setShowImport] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [confirm, setConfirm] = useState(false);
  const [configuration, setConfiguration] = useState<unknown>(null),
    [filename, setFilename] = useState(''),
    [password, setPassword] = useState('');
  const input = useRef<HTMLInputElement>(null),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await apiClient.getMixqueue(serverId);
        if (active.current) {
          setData(result);
          setError(current => current === t.lost ? '' : current);
        }
      } catch {
        if (active.current) {
          setError(t.lost);
          setData((current:any) => current ? {...current,process:'unknown',rcon:false,journal:false,heartbeat:false,ready:false,lastCheck:null} : current);
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [serverId, t.lost]);
  const action = async (body: any) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiClient.changeMixqueue(serverId, body);
      if (!active.current) return;
      if (body.action === 'plugin-preview') { setPreview(result); return; }
      setData(result);
      if (body.action === 'plugin') setPreview(null);
      if (body.action === 'import') {
        setConfiguration(null);
        setFilename('');
        setPassword('');
        setShowImport(false);
        if (input.current) input.current.value = '';
        setNotice(t.imported);
      }
    } catch (e) {
      if (active.current) setError(message(errorCode(e), lang));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const choose = async (file?: File) => {
    setConfiguration(null);
    setFilename('');
    setError('');
    if (!file) return;
    try {
      if (file.size > 32768) throw new Error();
      setConfiguration(JSON.parse(await file.text()));
      setFilename(file.name);
    } catch {
      setError(t.invalid_import);
    }
  };
  if (data?.supported === false) return <p className="mq-muted">{t.unsupported}</p>;
  const checks = [
    {
      name: t.process,
      value: data?.process === 'running',
      yes: t.running,
      no: t.stopped,
      icon: Terminal,
    },
    { name: t.rcon, value: data?.rcon, yes: t.connected, no: t.waiting, icon: Link2 },
    { name: t.journal, value: data?.journal, yes: t.ready, no: t.waiting, icon: FileJson },
    { name: t.heartbeat, value: data?.heartbeat, yes: t.connected, no: t.waiting, icon: Activity },
  ];
  return (
    <section className="mq-panel" aria-label="MixQueue">
      <header className="mq-header">
        <div className="mq-title">
          <span className="mq-symbol">
            <Activity size={24} />
          </span>
          <div>
            <h2>MixQueue</h2>
            <p>{data?.serverId || t.unconfigured}</p>
          </div>
        </div>
        <div className="mq-header-actions">
          <LanguagePicker value={lang} onChange={setLang} />
          <button
            type="button"
            className="mq-switch"
            role="switch"
            aria-checked={data?.enabled || false}
            aria-label="MixQueue"
            disabled={busy || !data?.configured || !data?.node?.installed}
            onClick={() => void action({ action: data.enabled ? 'disable' : 'enable' })}
          >
            <span />
          </button>
          <span className="mq-switch-label">{data?.enabled ? t.enabled : t.disabled}</span>
        </div>
      </header>
      {error && (
        <p className="mq-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mq-notice" role="status">
          {notice}
        </p>
      )}
      {data && !data.node?.installed && <p className="mq-notice">{t.nodeRequired}</p>}
      {data?.runtimeUpdateRequired && <p className="mq-notice">{t.restartRequired}</p>}
      <div className="mq-checks">
        {checks.map((check) => (
          <div className="mq-check" key={check.name}>
            <check.icon size={18} />
            <span>{check.name}</span>
            <strong className={check.value ? 'mq-ok' : ''}>
              <i />
              {check.value ? check.yes : check.no}
            </strong>
          </div>
        ))}
      </div>
      <div className="mq-readiness">
        <ShieldCheck size={19} />
        <strong>{data?.ready ? t.ready : t.waiting}</strong>
        {data?.lastCheck && <time>{new Date(data.lastCheck).toLocaleTimeString(lang)}</time>}
      </div>
      <div className="mq-actions">
        <AppButton tone="primary" disabled={busy} onClick={() => setShowImport(!showImport)}>
          <FileJson size={16} />
          {data?.configured ? t.replace : t.connect}
        </AppButton>
        <AppButton
          disabled={busy || !data?.enabled}
          onClick={() => void action({ action: 'restart' })}
        >
          <RotateCw size={16} />
          {t.restart}
        </AppButton>
        <AppButton
          tone="ghost"
          disabled={busy || !data?.configured}
          onClick={() => setConfirm(true)}
        >
          <Unplug size={16} />
          {t.disconnect}
        </AppButton>
      </div>
      {(showImport || (data && !data.configured)) && (
        <form
          className="mq-import"
          onSubmit={(event) => {
            event.preventDefault();
            void action({ action: 'import', configuration, rconPassword: password || undefined });
          }}
        >
          <label className="mq-file">
            <FileJson size={24} />
            <span>
              <strong>{filename || t.file}</strong>
              <small>JSON · 32 KB</small>
            </span>
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              aria-label={t.file}
              disabled={busy}
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          <div className="mq-import-bottom">
            <label htmlFor={id}>
              {t.password}
              <input
                id={id}
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                disabled={busy}
              />
              <small>{t.passwordHint}</small>
            </label>
            <AppButton tone="primary" type="submit" disabled={busy || !configuration}>
              <Download size={16} />
              {busy ? t.working : t.import}
            </AppButton>
          </div>
        </form>
      )}
      <div className="mq-plugin">
        <div>
          <strong>{data?.plugin?.name || t.plugin} {data?.plugin?.installedVersion || data?.plugin?.version || ''}</strong>
          <p>{data?.plugin?.updateAvailable ? `${t.available}: ${data.plugin.version}` : data?.pluginInstalled ? t.pluginInstalled : t.pluginMissing}</p>
        </div>
        <AppButton
          disabled={busy || !data || (data.pluginInstalled && !data.plugin?.updateAvailable) || data.pluginOperation?.status === 'running'}
          onClick={() => void action({ action: data?.plugin?.name === 'MatchBot CSCO' ? 'plugin-preview' : 'plugin' })}
        >
          <Download size={16} />
          {data?.plugin?.updateAvailable ? t.updatePlugin : data?.plugin?.name === 'MatchBot CSCO' ? t.reviewPlugin : t.installPlugin}
        </AppButton>
      </div>
      {preview && (
        <section className="mq-install-preview" aria-label={t.reviewPlugin}>
          <h3>MatchBot CSCO {preview.version}</h3>
          {preview.minimumWebVersion && <p>{t.requiresWeb} {preview.minimumWebVersion}+</p>}
          <span className="mq-muted-label">{t.dependencies}</span>
          <div className="mq-dependencies">{preview.dependencies?.map((item: any) => <span key={item.name}>{item.name} <b>{item.version}</b></span>)}</div>
          <strong>{t.conflicts}</strong>
          {preview.conflicts?.length ? <ul>{preview.conflicts.map((item: any) => <li key={item.file + item.plugin}><code>{item.plugin}</code><small>{item.file}</small></li>)}</ul> : <p>{t.noConflicts}</p>}
          <small>{t.pluginScope}</small>
          {!preview.stopped && <p className="mq-notice">{t.stop_game_before_plugin_install}</p>}
          {preview.activeAssignment && <p className="mq-notice">{t.matchbot_assignment_active}</p>}
          <div className="mq-actions">
            <AppButton tone="primary" disabled={busy || !preview.stopped || preview.activeAssignment} onClick={() => void action({ action: 'plugin', fingerprint: preview.fingerprint })}><Download size={16} />{t.installMatchbot}</AppButton>
            <AppButton disabled={busy} onClick={() => setPreview(null)}>{t.cancel}</AppButton>
          </div>
        </section>
      )}
      {data?.pluginOperation?.status === 'running' && <div className="mq-install-progress" role="status">
        <strong>{installationStage(data.pluginOperation.progress?.stage, lang)}</strong>
        <progress max={100} value={data.pluginOperation.progress?.percent ?? undefined} aria-label={t.stage} />
        {data.pluginOperation.progress?.percent != null && <span>{data.pluginOperation.progress.percent}%</span>}
      </div>}
      {data?.pluginOperation?.error && <p className="mq-error" role="alert">{message(data.pluginOperation.error, lang)}</p>}
      {data?.error && (
        <p role="alert" className="mq-error">
          {message(data.error, lang)}
        </p>
      )}
      <details className="mq-events">
        <summary>{t.logs}</summary>
        {data?.logs?.length ? (
          data.logs.map((entry: any, index: number) => (
            <p key={index}>
              <time>{new Date(entry.time).toLocaleTimeString(lang)}</time>
              <span>{message(entry.event, lang)}</span>
            </p>
          ))
        ) : (
          <p>{t.emptyLogs}</p>
        )}
      </details>
      <ConfirmationModal
        isOpen={confirm}
        title={t.removeTitle}
        message={t.removeText}
        confirmText={t.disconnect}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await action({ action: 'disconnect' });
          setConfirm(false);
        }}
      />
    </section>
  );
}
