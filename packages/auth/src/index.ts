export type PermissionKey =
  | 'lead.read' | 'lead.create' | 'lead.update' | 'lead.assign'
  | 'quote.read' | 'quote.create' | 'quote.update' | 'quote.send' | 'quote.accept'
  | 'order.read' | 'order.create' | 'order.update' | 'order.cancel'
  | 'dispatch.read' | 'dispatch.manage'
  | 'carrier.read' | 'carrier.create' | 'carrier.update' | 'carrier.verify' | 'carrier.block'
  | 'finance.read' | 'finance.manage' | 'finance.refund'
  | 'communication.read' | 'communication.send' | 'communication.assign'
  | 'document.read' | 'document.manage'
  | 'cms.read' | 'cms.edit' | 'cms.publish'
  | 'marketing.read' | 'marketing.manage' | 'marketing.publish'
  | 'integration.read' | 'integration.manage' | 'integration.credentials.manage'
  | 'automation.read' | 'automation.manage' | 'automation.publish'
  | 'ai_skill.read' | 'ai_skill.execute' | 'ai_skill.manage'
  | 'user.read' | 'user.manage' | 'role.manage'
  | 'audit.read' | 'settings.manage';

export interface UserIdentity {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  roleKeys: string[];
  permissions: PermissionKey[];
}

export class AuthorizationError extends Error {
  constructor(public readonly permission: PermissionKey) {
    super(`Missing required permission: ${permission}`);
    this.name = 'AuthorizationError';
  }
}

export function hasPermission(user: UserIdentity, permission: PermissionKey): boolean {
  return user.active && user.permissions.includes(permission);
}

export function requirePermission(user: UserIdentity, permission: PermissionKey): void {
  if (!hasPermission(user, permission)) throw new AuthorizationError(permission);
}

export function requireAnyPermission(user: UserIdentity, permissions: PermissionKey[]): void {
  if (!user.active || !permissions.some((permission) => user.permissions.includes(permission))) {
    throw new AuthorizationError(permissions[0] ?? 'settings.manage');
  }
}
