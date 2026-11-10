import { Observable } from 'rxjs';
import { Actor } from '../../core/auth/actor';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

export type RecordCategory = 'organizations' | 'members' | 'operators' | 'platforms';
export type SearchCategory = 'all' | RecordCategory;

/** A connected adapter supplies only records authorized for the supplied actor and valid guarded app routes.
 * No adapter is registered until a record-search contract is available. Example records belong in tests only.
 */
export interface SearchRecord {
  readonly id: string;
  readonly category: RecordCategory;
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly initials?: string;
  readonly icon?: NwIconName;
}
export abstract class SearchRecordSource {
  abstract readonly categories: readonly RecordCategory[];
  abstract search(
    query: string,
    category: SearchCategory,
    actor: Actor,
  ): Observable<readonly SearchRecord[]>;
}
