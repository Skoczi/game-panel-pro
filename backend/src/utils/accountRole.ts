export const OPERATOR_PERMISSION = 'panel.operator';
type Account = { is_root?: number; global_permissions_json?: string };

export function accountRole(user: Account): 'super-admin' | 'operator' | 'user' {
  if (user.is_root) return 'super-admin';
  try {
    const permissions: unknown = JSON.parse(user.global_permissions_json || '[]');
    if (Array.isArray(permissions) && permissions.includes(OPERATOR_PERMISSION)) return 'operator';
  } catch { /* Invalid grants fail closed. */ }
  return 'user';
}

// Legacy authenticated principal.isRoot means full panel authority. The immutable
// owner flag remains users.is_root; account-management routes protect that flag.
export function isPanelAdministrator(user: Account): boolean {
  return accountRole(user) !== 'user';
}
