export type PermissionMode = 'auto' | 'acceptEdits' | 'plan';

let currentPermissionMode: PermissionMode = 'auto';

export function getPermissionMode(): PermissionMode {
  return currentPermissionMode;
}

export function setPermissionMode(mode: PermissionMode) {
  currentPermissionMode = mode;
}
