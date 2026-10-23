import {
  DEMO_PLATFORM_FACTS,
  demoOrganizationsOf,
} from '../../../core/context/organization.fixtures';
import { DEMO_COMPANY_DIRECTORY } from '../../../core/context/scope-directory.fixtures';
import { PlatformRef } from '../../../core/context/scope.model';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';

const [school, drive] = DEMO_COMPANY_DIRECTORY.platforms;
if (!school || !drive) throw new Error('The demo directory defines two platforms.');

const count = (value: number) => ({ status: 'available', value }) as const;

/** One directory entry, derived from the demo Organization records (core/context/organization.fixtures.ts). */
function entry(platform: PlatformRef): PlatformDirectoryEntry {
  const organizations = demoOrganizationsOf(platform.id);
  return {
    platform,
    organizations: count(organizations.length),
    memberships: count(organizations.reduce((sum, o) => sum + o.memberships, 0)),
    operatorAssignments: count(DEMO_PLATFORM_FACTS[platform.id]?.operatorAssignments ?? 0),
  };
}

/**
 * FICTIONAL demo data (docs/ARCHITECTURE.md §3), derived from the demo Organizations, so it agrees with the Platform
 * dashboard by construction: 16 + 8 organizations, 920 and 460 platform memberships, 3 + 2 operator assignments (also
 * the Company Overview's figures). Not Core data, and not a Core contract.
 */
export const DEMO_PLATFORM_DIRECTORY: readonly PlatformDirectoryEntry[] = [
  entry(school),
  entry(drive),
];
