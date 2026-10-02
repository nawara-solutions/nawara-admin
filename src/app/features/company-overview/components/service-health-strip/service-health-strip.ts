import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CoreService,
  ServiceHealthSummary,
  ServiceStatus,
} from '../../domain/service-health.model';

const LABEL_KEYS = {
  auth: 'companyOverview.health.services.auth',
  organization: 'companyOverview.health.services.organization',
  release: 'companyOverview.health.services.release',
  billing: 'companyOverview.health.services.billing',
  payment: 'companyOverview.health.services.payment',
  file: 'companyOverview.health.services.file',
  notification: 'companyOverview.health.services.notification',
  audit: 'companyOverview.health.services.audit',
} as const satisfies Record<CoreService, string>;

const STATUS_KEYS = {
  operational: 'companyOverview.health.status.operational',
  delayed: 'companyOverview.health.status.delayed',
  unavailable: 'companyOverview.health.status.unavailable',
  unknown: 'companyOverview.health.status.unknown',
} as const satisfies Record<ServiceStatus, string>;

/**
 * Services & health: one illustrative status per Core service, from the service-health gateway. Status is text plus a
 * coloured dot (never colour alone). These are demo statuses, not live health (CF-06).
 */
@Component({
  selector: 'adm-service-health-strip',
  imports: [TranslocoPipe],
  templateUrl: './service-health-strip.html',
  styleUrl: './service-health-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'service-health-strip' },
})
export class ServiceHealthStrip {
  readonly summary = input.required<ServiceHealthSummary>();
  protected readonly labelKeys = LABEL_KEYS;
  protected readonly statusKeys = STATUS_KEYS;
}
