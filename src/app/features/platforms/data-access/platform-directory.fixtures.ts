import { DEMO_COMPANY_DIRECTORY } from '../../../core/context/scope-directory.fixtures';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';

const [school, drive] = DEMO_COMPANY_DIRECTORY.platforms;
if (!school || !drive) throw new Error('The demo directory defines two platforms.');

const count = (value: number) => ({ status: 'available', value }) as const;

/**
 * FICTIONAL demo data (docs/ARCHITECTURE.md §3), consistent with the Company Overview demo: 16 + 8 organizations,
 * 920 and 460 platform memberships, 3 + 2 operator assignments. Not Core data, and not a Core contract.
 */
export const DEMO_PLATFORM_DIRECTORY: readonly PlatformDirectoryEntry[] = [
  {
    platform: school,
    organizations: count(16),
    memberships: count(920),
    operatorAssignments: count(3),
  },
  {
    platform: drive,
    organizations: count(8),
    memberships: count(460),
    operatorAssignments: count(2),
  },
];
