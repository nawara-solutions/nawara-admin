import { can } from '../../../core/access/capability-policy';
import { Actor } from '../../../core/auth/actor';
import { CompanyDirectory, PlatformRef } from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';
import type { NwIconName } from '../../../shared/ui/icon/icon.registry';
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
  /** Presentation identity only, matched to the trusted current company. */
  readonly brand?: 'solutions';
}
/** Identity presentation only; a role label never grants authorization. */
export interface AccountIdentitySummary {
  readonly displayName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly initials: string | null;
  readonly roleKey: string;
}
/** Presentation states stay distinct. The current session adapter only establishes `not-reported`.
 * Known states require an explicit trusted source; supporting their display never implies enrollment.
 */
export interface AccountSecurityInfo extends AccountInfo {
  readonly status:
    | 'reported'
    | 'configured'
    | 'not-configured'
    | 'enabled'
    | 'disabled'
    | 'not-reported'
    | 'unsupported'
    | 'unavailable'
    | 'unknown';
  readonly icon: NwIconName;
}
/** LOCAL presentation contract. No role-specific panel, invented membership or authorization rule. */
export interface AccountSettingsView {
  readonly identity: AccountIdentitySummary;
  readonly profile: readonly AccountInfo[];
  readonly access: {
    readonly rows: readonly AccountInfo[];
    readonly entries: ViewState<readonly AccountAccessEntry[]>;
    readonly entryLabel: string;
    readonly emptyDescription: string;
    readonly unavailableDescription: string;
    readonly note: string | null;
  };
  readonly security: readonly AccountSecurityInfo[];
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
      value: 'settings.account.ownerScopeTitle',
      description: 'settings.account.ownerScopeDescription',
      translated: true,
    });
    entries =
      source.company.status === 'success'
        ? {
            status: 'success',
            data: [
              {
                id: 'company',
                name: source.company.data.name,
                ...(actor.kind === 'owner' &&
                directory.status === 'success' &&
                directory.data.company.id === actor.companyId &&
                source.company.data.name.trim().toLocaleLowerCase() === 'nawara solutions'
                  ? { brand: 'solutions' as const }
                  : {}),
              },
            ],
          }
        : source.company;
  } else {
    rows.push({
      id: 'scope',
      label: 'settings.account.scope',
      value: 'settings.account.operatorScopeTitle',
      description: 'settings.account.operatorScopeDescription',
      translated: true,
    });
    entries = source.platforms;
  }
  const displayName = actor.displayName?.trim() || null;
  const initials =
    displayName
      ?.split(/\s+/u)
      .slice(0, 2)
      .map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? '')
      .join('') || null;
  return {
    identity: {
      displayName,
      initials,
      email: actor.email,
      phone: actor.phone ?? null,
      roleKey: roleKeys[actor.kind],
    },
    profile: [
      {
        id: 'display-name',
        label: 'settings.account.displayName',
        value: displayName,
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
        icon: 'monitor',
        status: 'not-reported',
        label: 'settings.account.signInMethod',
        value: null,
        description: 'settings.account.methodDetail',
      },
      {
        id: 'second-factor',
        icon: 'lock-keyhole',
        status: 'not-reported',
        label: 'settings.account.secondFactor',
        value: null,
        description: 'settings.account.factorDetail',
      },
      {
        id: 'passkey',
        icon: 'key-round',
        status: 'not-reported',
        label: 'settings.account.passkey',
        value: null,
        description: 'settings.account.passkeyDetail',
      },
    ],
    securityLink: can(actor, 'account.security.view'),
  };
}
