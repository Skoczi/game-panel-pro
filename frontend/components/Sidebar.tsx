import { panelUrl } from '../utils/panelLinks';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { KeyRound, Moon, MoreVertical, Power, Sun, X, Settings, Server } from 'lucide-react';
import { useBranding } from '../contexts/BrandingContext';
import { PanelBrand } from './PanelBrand';
import { NodeSelector } from './NodeSelector';
import { Icon, type IconName } from '@ovhcloud/ods-react';
import { formatDisplayVersion, getAppVersion } from '../utils/appInfo';
import type { AuthUser } from '../utils/permissions';
import { useTheme } from '../contexts/ThemeContext';
import {
  AppButton,
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalDescription,
  AppModalHeader,
  AppModalTitle,
} from '../src/ui/components';
import { PanelUpdateModal } from './PanelUpdateModal';
import { ApiTokensModal } from './ApiTokensModal';
import { AccountSecurityModal } from './AccountSecurityModal';
import { apiClient, type PanelUpdateCheck } from '../utils/api';
import { useBodyScrollLock } from '../src/ui/utils/useBodyScrollLock';

interface SidebarProps {
  onNodeScopeChange?: (id: string) => void | Promise<void>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  onChangePassword?: () => void;
  canManageUsers?: boolean;
  staticLayout?: boolean;
  currentUser?: AuthUser | null;
}

function LegalSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <section className={`space-y-4 border-b pb-7 last:border-b-0 last:pb-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
      <div className="border-l-2 border-[var(--color-cyan-400)] pl-4">
        <h3 className={`text-lg font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {number}. {title}
        </h3>
      </div>
      <div className={`space-y-3 text-sm leading-6 ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>{children}</div>
    </section>
  );
}

interface UserMenuRowProps {
  onSecurity: () => void;
  onApiTokens: () => void;
  currentUserInitial: string;
  currentUserLabel: string;
  isDark: boolean;
  toggleTheme: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
}

function UserMenuRow({
  onSecurity,
  onApiTokens,
  currentUserInitial,
  currentUserLabel,
  isDark,
  toggleTheme,
  onChangePassword,
  onLogout,
}: UserMenuRowProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <div className="gp-user-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold border-[#324666] bg-[#0f1a2b] text-[var(--color-cyan-400)]">
        {currentUserInitial}
      </div>
      <p
        className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100"
        title={currentUserLabel}
      >
        {currentUserLabel}
      </p>
      <button
        type="button"
        onClick={toggleTheme}
        className={`cursor-pointer shrink-0 rounded-md p-1 transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>
      <div
        ref={ref}
        className="relative shrink-0"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`cursor-pointer rounded-md p-1 transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          aria-label="User menu"
          aria-haspopup="menu"
          aria-expanded={open}
          title="User menu"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <div
            className={`absolute bottom-full right-0 mb-3 w-44 overflow-hidden rounded-xl border shadow-lg ${isDark ? 'border-white/10 bg-[#0f1a2b]' : 'border-gray-200 bg-white'}`}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChangePassword?.();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${isDark ? 'text-[#eef4fa] hover:bg-[#1c2e47]' : 'text-gray-800 hover:bg-gray-100'}`}
            >
              <KeyRound className="h-4 w-4 text-[var(--color-cyan-400)]" />
              Change password
            </button>
            <button type="button" onClick={() => { setOpen(false); onSecurity(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${isDark ? 'text-[#eef4fa] hover:bg-[#1c2e47]' : 'text-gray-800 hover:bg-gray-100'}`}>
              <KeyRound className="h-4 w-4 text-[var(--color-cyan-400)]" />Account security
            </button>
            <button type="button" onClick={() => { setOpen(false); onApiTokens(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${isDark ? 'text-[#eef4fa] hover:bg-[#1c2e47]' : 'text-gray-800 hover:bg-gray-100'}`}>
              <KeyRound className="h-4 w-4 text-[var(--color-cyan-400)]" />API tokens
            </button>
            <div className={`mx-2 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout?.();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-[#e86180] transition-colors ${isDark ? 'hover:bg-[#291126]' : 'hover:bg-red-50'}`}
            >
              <Power className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  onNodeScopeChange,
  activeTab,
  onTabChange,
  onLogout,
  onChangePassword,
  canManageUsers = true,
  staticLayout = false,
  currentUser = null,
}: SidebarProps) {
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isApiTokensOpen, setIsApiTokensOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  useBodyScrollLock(isLegalModalOpen);
  const [isPanelUpdateOpen, setIsPanelUpdateOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<PanelUpdateCheck | null>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const layoutClasses = staticLayout ? 'relative h-full' : 'fixed left-0 top-0 h-screen';
  const widthClasses = staticLayout ? 'w-full' : 'w-52';
  const currentUserLabel = currentUser?.username || 'Unknown user';
  const currentUserInitial = currentUserLabel.trim().charAt(0).toUpperCase() || '?';
  const appVersion = getAppVersion();
  const versionLabel = (
    <>
      <span className="block text-[11px] leading-4">Game Panel PRO</span>
      <span
        className="mt-1 block whitespace-nowrap text-[11px] tracking-wide tabular-nums"
        data-testid="panel-revision"
      >
        {formatDisplayVersion(appVersion)}
      </span>
    </>
  );
  const { appearance } = useBranding();

  useEffect(() => {
    if (!currentUser?.isRoot) return;
    apiClient
      .checkPanelUpdate()
      .then(setUpdateInfo)
      .catch(() => {});
  }, [currentUser?.isRoot]);

  const menuItems: Array<{ id: string; label: string; iconName: IconName; disabled?: boolean }> = [
    { id: 'game-servers', label: 'Game Servers', iconName: 'game-controller-alt' },
  ];
  if (canManageUsers)
    menuItems.push({ id: 'admin-users', label: 'User Administration', iconName: 'user' });
  if (currentUser?.isRoot) {
    menuItems.push({ id: 'nodes', label: 'Nodes', iconName: 'book' });
    menuItems.push({ id: 'game-templates', label: 'Game Templates', iconName: 'book' });
    menuItems.push({ id: 'settings', label: 'Panel Settings', iconName: 'book' });
    menuItems.push({ id: 'host-status', label: 'Host Status', iconName: 'analysis' });
  }

  return (
    <aside
      className={`gp-sidebar ${widthClasses} border-r flex flex-col ${layoutClasses} overflow-y-auto ${isDark ? 'border-white/10 bg-[#111827]' : 'border-gray-200 bg-white'}`}
    >
      <div className={`border-b px-4 py-3 ${isDark ? 'border-white/10' : 'border-white/40'}`}>
        <div className="flex items-center justify-center">
          {/* Modified by Skoczi: independent fork identity; upstream credits retained. */}
          <button
            type="button"
            className="min-w-0 max-w-full text-white text-center font-semibold"
            onClick={() => onTabChange('game-servers')}
          >
            <PanelBrand appearance={appearance} />
          </button>
        </div>
      </div>

      {currentUser?.isRoot && <NodeSelector onSelect={onNodeScopeChange} />}
      <nav className="gp-sidebar-nav p-2 flex-1">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const isDisabled = Boolean(item.disabled);

          return (
            <a
              key={item.id}
              aria-current={isActive ? 'page' : undefined}
              href={isDisabled ? undefined : panelUrl(item.id)}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (isDisabled) return;
                onTabChange(item.id);
              }}
              aria-disabled={isDisabled || undefined}
              className={`gp-app-button gp-app-button--${isActive ? 'secondary' : 'ghost'} min-h-9 cursor-pointer mb-1 flex w-full items-center justify-start gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                isDisabled
                  ? isDark
                    ? 'text-gray-600 cursor-not-allowed opacity-60'
                    : 'text-white/30 cursor-not-allowed opacity-60'
                  : isActive
                    ? isDark
                      ? 'border-[var(--gp-primary-300)] bg-[var(--gp-primary-300)] text-[#031126] hover:border-[var(--gp-primary-200)] hover:bg-[var(--gp-primary-200)] hover:text-[#031126]'
                      : 'border-white/20 bg-white/90 text-[#00185e] font-semibold hover:bg-white'
                    : isDark
                      ? 'border-none bg-transparent text-gray-400 hover:bg-gray-800 hover:text-[var(--gp-primary-300)]'
                      : 'border-none bg-transparent text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                {item.id === 'settings' ? (
                  <Settings size={20} />
                ) : item.id === 'nodes' ? (
                  <Server size={20} />
                ) : (
                  <Icon name={item.iconName} className="text-lg leading-none" />
                )}
              </span>
              <span className="text-sm font-medium leading-none">{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="gp-sidebar-bottom">
        <div className="border-y bg-transparent px-2 py-2.5 border-white/10">
          <UserMenuRow
            onApiTokens={() => setIsApiTokensOpen(true)}
            onSecurity={() => setIsSecurityOpen(true)}
            currentUserInitial={currentUserInitial}
            currentUserLabel={currentUserLabel}
            isDark={isDark}
            toggleTheme={toggleTheme}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
          />
        </div>

        <div className="border-t px-3 py-3 border-white/10">
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-center text-[10px] text-gray-500">
            {currentUser?.isRoot ? (
              <button
                type="button"
                onClick={() => setIsPanelUpdateOpen(true)}
                className="relative w-full rounded-sm px-1 text-xs transition-colors text-gray-400 hover:text-gray-200"
                title={`Version ${appVersion}${updateInfo?.updateAvailable ? ` — Update available: v${updateInfo.latestVersion}` : ' — Panel update'}`}
              >
                {versionLabel}
                {updateInfo?.updateAvailable && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-400 ring-2 ring-[#000e9c] dark:ring-[#111827]" />
                )}
              </button>
            ) : (
              <span className="w-full text-xs text-gray-400" title={`Version ${appVersion}`}>
                {versionLabel}
              </span>
            )}
            <a
              href="https://github.com/Skoczi/game-panel-pro"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-sm text-[9px] text-gray-400 transition-colors hover:text-gray-200"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <button
              type="button"
              onClick={() => setIsLegalModalOpen(true)}
              className="rounded-sm px-1 text-[10px] transition-colors text-gray-500 hover:text-gray-300"
            >
              Legal
            </button>
            <a
              href="https://github.com/Skoczi/game-panel-pro/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm px-1 text-[10px] transition-colors text-gray-500 hover:text-gray-300"
            >
              Bug or feature?
            </a>
          </div>
        </div>
      </div>

      <AppModal
        open={isLegalModalOpen}
        closeOnInteractOutside={false}
        onOpenChange={setIsLegalModalOpen}
      >
        <AppModalContent
          dismissible={false}
          className={`w-full max-w-5xl overflow-hidden rounded-2xl border shadow-[0_30px_120px_rgba(0,0,0,0.25)] ${isDark ? 'border-white/10 bg-[#0d1524] shadow-[0_30px_120px_rgba(0,0,0,0.55)]' : 'border-[#e2e8f0] bg-white'}`}
        >
          <AppModalHeader
            className={`flex items-start justify-between border-b p-6 ${isDark ? 'border-white/10 bg-[#101a2d]' : 'border-[#e2e8f0] bg-[#f8fafc]'}`}
          >
            <div className="space-y-1">
              <AppModalTitle
                className={`text-2xl font-semibold tracking-tight ${isDark ? 'text-white' : 'text-[#0f172a]'}`}
              >
                License and acknowledgements
              </AppModalTitle>
              <AppModalDescription className={isDark ? 'text-slate-400' : 'text-[#64748b]'}>
                Game Panel PRO · Apache License 2.0
              </AppModalDescription>
            </div>
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => setIsLegalModalOpen(false)}
              className={`rounded border-none bg-transparent p-2 transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-red-400' : 'text-[#94a3b8] hover:bg-[#f0f4f8] hover:text-[#dc2626]'}`}
              aria-label="Close legal modal"
            >
              <X className="h-5 w-5" />
            </AppButton>
          </AppModalHeader>

          <AppModalBody className="max-h-[85vh] overflow-y-auto p-0">
            <div className="space-y-6 px-6 py-6">
              <LegalSection number="1" title="Game Panel PRO">
                <p>Maintained by Skoczi. Copyright 2026 Skoczi for modifications and continued development.</p>
                <p>This software is distributed under the Apache License, Version 2.0, without warranties or conditions of any kind.</p>
                <a className="text-cyan-500 underline" href="https://github.com/Skoczi/game-panel-pro/blob/main/LICENSE-2.0.txt" target="_blank" rel="noopener noreferrer">Read the license</a>
              </LegalSection>
              <LegalSection number="2" title="Acknowledgements">
                <p>Derived from OVHcloud Game Panel 1.5.0. Copyright OVH 2026. This is an independent project, not an official OVHcloud release.</p>
                <p>Third-party software and game assets remain subject to their respective licenses.</p>
                <a className="text-cyan-500 underline" href="https://github.com/Skoczi/game-panel-pro/blob/main/NOTICE" target="_blank" rel="noopener noreferrer">Third-party notices</a>
              </LegalSection>
              <LegalSection number="3" title="Your deployment">
                <p>The operator of this installation provides its service terms, privacy information and support contact. The software license does not define those deployment-specific policies.</p>
              </LegalSection>
            </div>
          </AppModalBody>
        </AppModalContent>
      </AppModal>

      <PanelUpdateModal
        isOpen={isPanelUpdateOpen}
        onClose={() => setIsPanelUpdateOpen(false)}
        updateInfo={updateInfo}
      />
      {isApiTokensOpen && <ApiTokensModal key={currentUser?.username} onClose={() => setIsApiTokensOpen(false)} />}
      {isSecurityOpen && <AccountSecurityModal key={currentUser?.username} username={currentUser?.username || ''} onClose={() => setIsSecurityOpen(false)} />}

    </aside>
  );
}
