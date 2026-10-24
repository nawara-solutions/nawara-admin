/**
 * What Admin can say about Nawara Core's Release service (`/releases`, P8-S4): DOCUMENTATION, from Admin's own records
 * (docs/CORE-INTEGRATION.md §5 Release, §7, §9 CF-05). Not a catalog: there is no product, component, release, version,
 * compatibility value, deployment state or URL here, and the model has no field that could carry one.
 *
 * - Core lets the owner of the operating Company withdraw a release and change a minimum supported version, each with a
 *   factor step-up; neither is in production, and neither is offered by Admin.
 * - Core offers no human read of products, components, releases or policies (CF-05), so Admin cannot show what could
 *   be withdrawn and never guesses a target.
 * - Register and publish are CI-only (service token).
 */
export type ReleaseCapability = 'catalog' | 'publish' | 'withdraw' | 'minimumVersion';

/** How a capability stands for Admin: frontend view values, not Core enums. */
export type ReleaseCapabilityStatus = 'notAvailable' | 'ciOnly' | 'notInAdmin';

export interface ReleaseInformation {
  /** In the order the page lists them. */
  readonly capabilities: readonly {
    readonly capability: ReleaseCapability;
    readonly status: ReleaseCapabilityStatus;
  }[];
}
