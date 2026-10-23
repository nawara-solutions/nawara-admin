/** A count that may be unknown. An unavailable value is shown as unavailable and never becomes zero. */
export type Metric =
  { readonly status: 'available'; readonly value: number } | { readonly status: 'unavailable' };

/** A section whose data may not exist for this actor or build. */
export type Section<T> =
  { readonly status: 'available'; readonly data: T } | { readonly status: 'unavailable' };
