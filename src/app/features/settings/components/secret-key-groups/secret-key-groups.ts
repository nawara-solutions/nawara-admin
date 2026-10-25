import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SECRET_KEY_GROUPS } from '../../application/secret-key.facade';

/**
 * The new secret key (P9-S4c design, Key artboard): 13 numbered groups, left to right in every locale, never
 * translated. `groups` `null`: masked, with nothing of the key in the DOM. Revealed, each group is a list item a screen
 * reader reads letter by letter ("Group 3 of 13: A B C D"); the visible characters are hidden from it.
 */
@Component({
  selector: 'adm-secret-key-groups',
  imports: [TranslocoPipe],
  templateUrl: './secret-key-groups.html',
  styleUrl: './secret-key-groups.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'secret-key-groups' },
})
export class SecretKeyGroups {
  readonly groups = input.required<readonly string[] | null>();
  /** The id of the reading instructions the list is described by. */
  readonly describedBy = input<string>();

  protected readonly count = SECRET_KEY_GROUPS;
  protected readonly placeholders = Array.from({ length: SECRET_KEY_GROUPS }, (_, i) => i + 1);
  protected readonly items = computed(
    () =>
      this.groups()?.map((value, i) => ({
        number: i + 1,
        value,
        letters: value.split('').join(' '),
      })) ?? null,
  );
}
