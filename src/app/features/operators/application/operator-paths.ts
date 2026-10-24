/** The operators destination (company scope, the owner only; P6). */
export const OPERATORS_SEGMENT = 'operators';

export const OPERATORS_PATH = `/${OPERATORS_SEGMENT}`;

/** One operator's page. The id is Core's user id, never a contact: contacts never go into a URL. */
export const operatorPath = (operator: string): string =>
  `${OPERATORS_PATH}/${encodeURIComponent(operator)}`;
