import { Capability, can } from '../../core/access/capability-policy';
import { Actor } from '../../core/auth/actor';
import { NwIconName } from '../../shared/ui/icon/icon.registry';
import { NAVIGATION, NOTIFICATIONS_ITEM } from '../sidebar/navigation';

export interface SearchPage {
  readonly path: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly icon: NwIconName;
  readonly group: 'pages' | 'settings';
  readonly requires?: Capability;
}
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/overview': 'settings.company.links.overview.description',
  '/platforms': 'settings.company.links.platforms.description',
  '/operators': 'settings.company.links.operators.description',
  '/licenses': 'settings.company.links.licenses.description',
  '/billing': 'settings.company.links.billing.description',
  '/audit': 'settings.company.links.audit.description',
  '/releases': 'shell.search.pages.releases',
  '/services': 'shell.search.pages.services',
  '/notifications': 'shell.search.pages.notifications',
};
const SETTINGS: readonly SearchPage[] = [
  {
    path: '/settings/appearance',
    titleKey: 'settings.appearance.title',
    descriptionKey: 'shell.search.pages.appearance',
    icon: 'settings',
    group: 'settings',
  },
  {
    path: '/settings/language',
    titleKey: 'settings.language.title',
    descriptionKey: 'shell.search.pages.language',
    icon: 'globe',
    group: 'settings',
  },
  {
    path: '/settings/account',
    titleKey: 'settings.account.title',
    descriptionKey: 'shell.search.pages.account',
    icon: 'user-round',
    group: 'settings',
  },
  {
    path: '/settings/security',
    titleKey: 'settings.security.title',
    descriptionKey: 'shell.search.pages.security',
    icon: 'shield-check',
    group: 'settings',
    requires: 'account.security.view',
  },
  {
    path: '/settings/company',
    titleKey: 'settings.company.title',
    descriptionKey: 'shell.search.pages.company',
    icon: 'building-2',
    group: 'settings',
    requires: 'company.settings.view',
  },
];

/** The same working destinations and capability checks as the shell; no routes inferred from a query. */
export function searchPages(actor: Actor | null): readonly SearchPage[] {
  if (!actor) return [];
  const items = [
    ...NAVIGATION.flatMap((group) => group.items).filter((item) => item.path !== '/notifications'),
    NOTIFICATIONS_ITEM,
  ];
  return [
    ...items.map((item): SearchPage => ({
      path: item.path,
      titleKey: item.labelKey,
      descriptionKey: DESCRIPTIONS[item.path] ?? item.labelKey,
      icon: item.icon,
      group: 'pages',
      ...(item.requires ? { requires: item.requires } : {}),
    })),
    ...SETTINGS,
  ].filter((page) => !page.requires || can(actor, page.requires));
}

export const normalizeSearch = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

/** Literal text fragments: highlighting never interprets result names or the query as HTML. */
export function highlightSearch(
  text: string,
  query: string,
): readonly { text: string; match: boolean }[] {
  const needle = query.trim();
  const index = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  return index < 0
    ? [{ text, match: false }]
    : [
        { text: text.slice(0, index), match: false },
        { text: text.slice(index, index + needle.length), match: true },
        { text: text.slice(index + needle.length), match: false },
      ].filter((part) => part.text);
}
