import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';
import { RecordCategory } from './search-record-source';
import { highlightSearch } from './search-pages';

export interface SearchResult {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly group: 'pages' | 'settings' | RecordCategory;
  readonly icon: NwIconName;
  readonly initials?: string;
  readonly record: boolean;
}

@Component({
  selector: 'button[adm-search-result]',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './search-result-row.html',
  styleUrl: './search-result-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'global-search__result',
    type: 'button',
    role: 'option',
    tabindex: '-1',
    '[attr.aria-selected]': 'active()',
  },
})
export class SearchResultRow {
  readonly result = input.required<SearchResult>();
  readonly query = input.required<string>();
  readonly active = input(false);
  protected readonly highlight = highlightSearch;
}
