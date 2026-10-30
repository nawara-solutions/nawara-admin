import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { AssistanceInformationSource } from '../domain/assistance.model';

const LABEL_KEYS = {
  fact: 'assistanceCases.case.source.fact',
  report: 'assistanceCases.case.source.report',
  decision: 'assistanceCases.case.source.decision',
  derived: 'assistanceCases.case.source.derived',
} as const satisfies Record<AssistanceInformationSource, string>;

const ICONS = {
  fact: 'badge-check',
  report: 'clipboard-list',
  decision: 'user-cog',
  derived: 'refresh-cw',
} as const satisfies Record<AssistanceInformationSource, NwIconName>;

/**
 * Where an Assistance value comes from (A6): a verified FACT, a REPORT someone asserts, an owner DECISION, or a state Nawara
 * Core DERIVED. Icon, words and an outline style for each, so colour is never the only signal (§25). Shared by the directory,
 * the case's oversight and its history, so the four sources always look the same.
 */
@Component({
  selector: 'adm-assistance-source-tag',
  imports: [NwIcon, TranslocoPipe],
  template: '<nw-icon [name]="icon()" size="sm" /><span>{{ labelKey() | transloco }}</span>',
  styleUrl: './assistance-source-tag.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'assistance-source-tag',
    '[class.assistance-source-tag--fact]': "source() === 'fact'",
    '[class.assistance-source-tag--report]': "source() === 'report'",
    '[class.assistance-source-tag--decision]': "source() === 'decision'",
    '[class.assistance-source-tag--derived]': "source() === 'derived'",
    '[attr.data-source]': 'source()',
  },
})
export class AssistanceSourceTag {
  readonly source = input.required<AssistanceInformationSource>();
  protected readonly icon = computed(() => ICONS[this.source()]);
  protected readonly labelKey = computed(() => LABEL_KEYS[this.source()]);
}
