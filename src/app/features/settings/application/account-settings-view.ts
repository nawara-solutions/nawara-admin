import { can } from '../../../core/access/capability-policy';
import { Actor } from '../../../core/auth/actor';
import { CompanyDirectory, PlatformRef } from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';
import { accountView } from './account-view';

export interface AccountInfo {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly translated?: boolean;
  readonly description?: string;
  readonly machine?: boolean;
}
export interface AccountAccessEntry {
  readonly id: string;
  readonly name: string;
}
/** LOCAL presentation contract. No role-specific panel, invented membership or authorization rule. */
export interface AccountSettingsView {
  readonly profile: readonly AccountInfo[];
  readonly access: {
    readonly rows: readonly AccountInfo[];
    readonly entries: ViewState<readonly AccountAccessEntry[]>;
    readonly entryLabel: string;
    readonly emptyDescription: string;
    readonly unavailableDescription: string;
    readonly note: string | null;
  };
  readonly security: readonly AccountInfo[];
  readonly securityLink: boolean;
}

/** Adapt existing session/scope facts once; presentation never interprets role names as capabilities. */
export function accountSettingsView(
  actor: Actor | null,
  directory: ViewState<CompanyDirectory>,
  platforms: ViewState<readonly PlatformRef[]>,
): AccountSettingsView | null {
  const source = accountView(actor, directory, platforms);
  if (!actor || source.kind === 'signedOut') return null;
  const roleKeys = { owner: 'shell.role.owner', operator: 'shell.role.operator' } as const;
  const rows: AccountInfo[] = [
    { id: 'type', label: 'settings.account.type', value: roleKeys[actor.kind], translated: true },
  ];
  let entries: ViewState<readonly AccountAccessEntry[]>;
  if (source.kind === 'owner') {
    rows.push({
      id: 'scope',
      label: 'settings.account.scope',
      value: 'settings.account.ownerScope',
      translated: true,
    });
    entries =
      source.company.status === 'success'
        ? {
            status: 'success',
            data: [{ id: 'company', name: source.company.data.name }],
          }
        : source.company;
  } else {
    entries = source.platforms;
  }
  return {
    profile: [
      {
        id: 'display-name',
        label: 'settings.account.displayName',
        value: actor.displayName?.trim() || null,
      },
      { id: 'email', label: 'settings.account.email', value: actor.email, machine: true },
      { id: 'phone', label: 'settings.account.phone', value: actor.phone ?? null, machine: true },
    ],
    access: {
      rows,
      entries,
      entryLabel:
        source.kind === 'owner' ? 'settings.account.company' : 'settings.account.platforms',
      emptyDescription:
        source.kind === 'owner'
          ? 'settings.account.companyUnavailable'
          : 'settings.account.noPlatforms',
      unavailableDescription:
        source.kind === 'owner'
          ? 'settings.account.companyUnavailable'
          : 'shell.nav.platformsUnavailable',
      note: source.kind === 'operator' ? 'settings.account.managedByOwner' : null,
    },
    security: [
      {
        id: 'method',
        label: 'settings.account.signInMethod',
        value: null,
        description: 'settings.account.methodUnknown',
      },
      {
        id: 'second-factor',
        label: 'settings.account.secondFactor',
        value: null,
        description: 'settings.account.enrollmentUnknown',
      },
      {
        id: 'passkey',
        label: 'settings.account.passkey',
        value: null,
        description: 'settings.account.enrollmentUnknown',
      },
    ],
    securityLink: can(actor, 'account.security.view'),
  };
}
