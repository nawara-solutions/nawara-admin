import { CompanyDirectory, companyId, platformId } from './scope.model';

/**
 * FICTIONAL demo data (docs/ARCHITECTURE.md §3). Not Core data and not a Core contract: names and ids are invented for
 * the Company Overview demo. Ids are UUID-shaped like Core's.
 */
export const DEMO_COMPANY_ID = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a01');
export const DEMO_SCHOOL_PLATFORM_ID = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01');
export const DEMO_DRIVE_PLATFORM_ID = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b02');

export const DEMO_COMPANY_DIRECTORY: CompanyDirectory = {
  company: { id: DEMO_COMPANY_ID, name: 'Nawara Solutions' },
  platforms: [
    { id: DEMO_SCHOOL_PLATFORM_ID, name: 'Nawara School', key: 'nawara-school', product: 'school' },
    { id: DEMO_DRIVE_PLATFORM_ID, name: 'Nawara Drive', key: 'nawara-drive', product: 'drive' },
  ],
};
