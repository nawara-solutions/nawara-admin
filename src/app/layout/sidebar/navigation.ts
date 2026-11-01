import { Capability } from '../../core/access/capability-policy';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

/**
 * Sidebar navigation, in the order of the owner's Company Overview design. Every item is a working page (G0-P0-3): a
 * destination that is not built is not listed at all (no inert entry). Items declare the capability they require (§10);
 * unavailable ones are hidden. Every entry here is company scope (owner only): an operator's sidebar instead lists their
 * assigned Platforms ("Your platforms").
 *
 * Not listed until they exist (G0-D5): Users & identity (no owner directory, CF-03), Files (no human File path, CF-71) and
 * Monitoring (no operator-facing health, CF-06; Services & health is the built inventory). Organizations have no company-wide
 * list (ORG-00, CF-02): they live under each Platform, so their entry is "Platforms & organizations" (`/platforms`).
 */
export interface NavigationItem {
  readonly labelKey: string;
  readonly icon: NwIconName;
  readonly path: string;
  readonly requires?: Capability;
  /** Shows the unread notification count beside the label (shell `NotificationIndicator`). */
  readonly unreadBadge?: true;
}

export interface NavigationGroup {
  readonly labelKey: string;
  readonly items: readonly NavigationItem[];
}

/**
 * Personal Notifications (`/notifications`, P8-S3): every signed-in person's own unread count, so it requires no
 * capability. The owner finds it in Operations (the approved order); an operator, beside Settings, so no other
 * Operations destination is shown to them.
 */
const NOTIFICATIONS_LINK: NavigationItem = {
  labelKey: 'shell.nav.notifications',
  icon: 'bell',
  path: '/notifications',
  unreadBadge: true,
};

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
      // The Platforms directory, the way into each Platform's Organizations (`/platforms/:platformId/organizations`).
      {
        labelKey: 'shell.nav.platforms',
        icon: 'building-2',
        path: '/platforms',
        requires: 'company.platforms.view',
      },
      {
        labelKey: 'shell.nav.operators',
        icon: 'shield-check',
        path: '/operators',
        requires: 'company.operators.view',
      },
    ],
  },
  {
    labelKey: 'shell.nav.groups.commercial',
    items: [
      {
        labelKey: 'shell.nav.licenses',
        icon: 'file-badge',
        path: '/licenses',
        requires: 'company.commercial.view',
      },
      {
        labelKey: 'shell.nav.billing',
        icon: 'credit-card',
        path: '/billing',
        requires: 'company.commercial.view',
      },
    ],
  },
  {
    labelKey: 'shell.nav.groups.operations',
    items: [
      {
        labelKey: 'shell.nav.releases',
        icon: 'package',
        path: '/releases',
        requires: 'company.releases.view',
      },
      {
        labelKey: 'shell.nav.audit',
        icon: 'scroll-text',
        path: '/audit',
        requires: 'company.audit.view',
      },
      // The owner's place for their personal Notifications (P8-S3); an operator gets NOTIFICATIONS_ITEM instead.
      { ...NOTIFICATIONS_LINK, requires: 'company.scope' },
      {
        labelKey: 'shell.nav.services',
        icon: 'heart-pulse',
        path: '/services',
        requires: 'company.services.view',
      },
    ],
  },
];

/** An operator's personal Notifications entry (their sidebar has no Operations group). */
export const NOTIFICATIONS_ITEM: NavigationItem = NOTIFICATIONS_LINK;

/**
 * Personal settings (the hub, Appearance and Language; P9-S1): for every signed-in actor, so it requires no capability.
 * Active on every Settings page (`routerLinkActive` is not exact).
 */
export const SETTINGS_ITEM: NavigationItem = {
  labelKey: 'shell.nav.settings',
  icon: 'settings',
  path: '/settings',
};
