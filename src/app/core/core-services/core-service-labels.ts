import { CoreService } from './core-service.model';

/** Catalog keys of each service's name and documented responsibility, listed in full (never built at runtime). */
export const CORE_SERVICE_NAME_KEYS = {
  auth: 'coreServices.services.auth.name',
  organization: 'coreServices.services.organization.name',
  release: 'coreServices.services.release.name',
  billing: 'coreServices.services.billing.name',
  payment: 'coreServices.services.payment.name',
  file: 'coreServices.services.file.name',
  notification: 'coreServices.services.notification.name',
  audit: 'coreServices.services.audit.name',
} as const satisfies Record<CoreService, string>;

export const CORE_SERVICE_RESPONSIBILITY_KEYS = {
  auth: 'coreServices.services.auth.owns',
  organization: 'coreServices.services.organization.owns',
  release: 'coreServices.services.release.owns',
  billing: 'coreServices.services.billing.owns',
  payment: 'coreServices.services.payment.owns',
  file: 'coreServices.services.file.owns',
  notification: 'coreServices.services.notification.owns',
  audit: 'coreServices.services.audit.owns',
} as const satisfies Record<CoreService, string>;
