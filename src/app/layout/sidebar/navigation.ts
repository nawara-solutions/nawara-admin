import { Capability } from '../../core/access/capability-policy';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

/**
 * Sidebar navigation, in the order of the owner's Company Overview design. An item with a `path` is a working page; an item
 * without one is a destination that is not built yet: it is shown (the approved navigation) but is not a link and
 * never behaves as a page. Items declare the capability they require (§10); unavailable ones are hidden.
 */
export interface NavigationItem {
  readonly labelKey: string;
  readonly icon: NwIconName;
  readonly path?: string;
  readonly requires?: Capability;
  /** Shows the unread notification count beside the label (shell `NotificationIndicator`). */
  readonly unreadBadge?: true;
}

export interface NavigationGroup {
  readonly labelKey: string;
  readonly items: readonly NavigationItem[];
}

export const NAVIGATION: readonly NavigationGroup[] = [
  {
    labelKey: 'shell.nav.groups.platform',
    items: [
      {
        labelKey: 'shell.nav.overview',
        icon: 'house',
        path: '/overview',
        requires: 'company.overview.view',
      },
      { labelKey: 'shell.nav.organizations', icon: 'building-2' },
      { labelKey: 'shell.nav.users', icon: 'users' },
      { labelKey: 'shell.nav.operators', icon: 'shield-check' },
    ],
  },
  {
    labelKey: 'shell.nav.groups.commercial',
    items: [
      { labelKey: 'shell.nav.licenses', icon: 'file-badge' },
      { labelKey: 'shell.nav.billing', icon: 'credit-card' },
    ],
  },
  {
    labelKey: 'shell.nav.groups.operations',
    items: [
      { labelKey: 'shell.nav.releases', icon: 'package' },
      { labelKey: 'shell.nav.audit', icon: 'scroll-text' },
      { labelKey: 'shell.nav.files', icon: 'folder' },
      { labelKey: 'shell.nav.notifications', icon: 'bell', unreadBadge: true },
      { labelKey: 'shell.nav.services', icon: 'heart-pulse' },
      { labelKey: 'shell.nav.monitoring', icon: 'chart-line' },
    ],
  },
];

/** Personal settings (Appearance in this slice): for every signed-in actor, so it requires no capability. */
export const SETTINGS_ITEM: NavigationItem = {
  labelKey: 'shell.nav.settings',
  icon: 'settings',
  path: '/settings',
};
