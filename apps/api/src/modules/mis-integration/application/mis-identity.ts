/**
 * Synthetic logins for users the MIS webhook creates on the platform.
 *
 * `users.email` is globally unique, while MIS external ids are only unique
 * inside one clinic's MIS instance: DocDream numbers doctors 1, 2, 3… per
 * installation, so harmony's doctor 105 and reprolife's doctor 105 are two
 * different people. The old format `doctor.<externalId>@mis-import.local`
 * made them collide on the same users/doctors rows, and every webhook from
 * either clinic renamed the shared doctor — the other clinic then saw a
 * stranger's name on its own consultations. Scoping the address by tenant
 * and connector keeps one platform identity per (clinic, MIS, external id),
 * which is exactly the key `external_identities` already uses.
 *
 * The mapping table stays the primary lookup; these addresses only matter
 * on the create path (and as a stable, human-readable hint on the Users page).
 */
export const MIS_IMPORT_EMAIL_DOMAIN = 'mis-import.local';

export interface MisIdentityScope {
  tenantId: string;
  connectorId: string;
  externalId: string;
}

const misEmail = (kind: 'doctor' | 'patient', scope: MisIdentityScope): string =>
  `${kind}.${scope.connectorId}.${scope.externalId}.${scope.tenantId}@${MIS_IMPORT_EMAIL_DOMAIN}`;

export const misDoctorEmail = (scope: MisIdentityScope): string => misEmail('doctor', scope);

export const misPatientEmail = (scope: MisIdentityScope): string => misEmail('patient', scope);
