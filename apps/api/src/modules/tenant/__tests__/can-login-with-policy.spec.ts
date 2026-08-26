import { Role } from '@telemed/shared-types';
import { canLoginWithPolicy } from '../application/tenant.service';

describe('canLoginWithPolicy', () => {
  describe('always-allowed roles bypass the gate', () => {
    const adminRoles: Role[] = [
      Role.PLATFORM_SUPER_ADMIN,
      Role.CLINIC_ADMIN,
      Role.INTEGRATION_ADMIN,
      Role.CHIEF_MEDICAL_OFFICER,
      Role.MIS_SERVICE,
      Role.AUDITOR,
    ];

    it.each(adminRoles)('allows %s even when both flags are false', (role) => {
      expect(
        canLoginWithPolicy({ doctorEnabled: false, patientEnabled: false }, [role]),
      ).toBe(true);
    });

    it('admin role mixed with blocked DOCTOR still allows login', () => {
      expect(
        canLoginWithPolicy({ doctorEnabled: false }, [Role.DOCTOR, Role.CLINIC_ADMIN]),
      ).toBe(true);
    });
  });

  describe('default policy (missing flags) treats both roles as enabled', () => {
    it.each([Role.DOCTOR, Role.PATIENT])(
      'allows %s when policy is empty',
      (role) => {
        expect(canLoginWithPolicy({}, [role])).toBe(true);
        expect(canLoginWithPolicy(undefined, [role])).toBe(true);
        expect(canLoginWithPolicy(null, [role])).toBe(true);
      },
    );
  });

  describe('explicit blocks', () => {
    it('blocks DOCTOR when doctorEnabled === false and no other allowed role', () => {
      expect(canLoginWithPolicy({ doctorEnabled: false }, [Role.DOCTOR])).toBe(false);
    });

    it('blocks PATIENT when patientEnabled === false and no other allowed role', () => {
      expect(canLoginWithPolicy({ patientEnabled: false }, [Role.PATIENT])).toBe(false);
    });

    it('does not block DOCTOR when only patientEnabled is false', () => {
      expect(canLoginWithPolicy({ patientEnabled: false }, [Role.DOCTOR])).toBe(true);
    });

    it('does not block PATIENT when only doctorEnabled is false', () => {
      expect(canLoginWithPolicy({ doctorEnabled: false }, [Role.PATIENT])).toBe(true);
    });

    it('blocks a user with only DOCTOR+PATIENT when both are disabled', () => {
      expect(
        canLoginWithPolicy(
          { doctorEnabled: false, patientEnabled: false },
          [Role.DOCTOR, Role.PATIENT],
        ),
      ).toBe(false);
    });

    it('allows a user with DOCTOR+PATIENT when only one role is blocked', () => {
      // PATIENT side still open → login goes through with both roles attached
      expect(
        canLoginWithPolicy({ doctorEnabled: false }, [Role.DOCTOR, Role.PATIENT]),
      ).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('blocks empty roles array (no role can pass any gate)', () => {
      expect(canLoginWithPolicy({}, [])).toBe(false);
    });

    it('treats explicit `true` the same as missing', () => {
      expect(
        canLoginWithPolicy({ doctorEnabled: true, patientEnabled: true }, [Role.DOCTOR]),
      ).toBe(true);
      expect(
        canLoginWithPolicy({ doctorEnabled: true, patientEnabled: true }, [Role.PATIENT]),
      ).toBe(true);
    });
  });

  describe('global env-var kill switch (layered on top of per-tenant policy)', () => {
    it('blocks DOCTOR when globalDisable.doctor is true even if tenant policy allows', () => {
      expect(
        canLoginWithPolicy({}, [Role.DOCTOR], { doctor: true }),
      ).toBe(false);
    });

    it('blocks PATIENT when globalDisable.patient is true even if tenant policy allows', () => {
      expect(
        canLoginWithPolicy({}, [Role.PATIENT], { patient: true }),
      ).toBe(false);
    });

    it('still bypasses for admin roles when both globals are true', () => {
      expect(
        canLoginWithPolicy({}, [Role.PLATFORM_SUPER_ADMIN], { doctor: true, patient: true }),
      ).toBe(true);
      expect(
        canLoginWithPolicy({}, [Role.CLINIC_ADMIN], { doctor: true, patient: true }),
      ).toBe(true);
    });

    it('does not block DOCTOR when only patient global is set', () => {
      expect(
        canLoginWithPolicy({}, [Role.DOCTOR], { patient: true }),
      ).toBe(true);
    });

    it('blocks DOCTOR via global even when tenant policy explicitly enables doctor', () => {
      expect(
        canLoginWithPolicy({ doctorEnabled: true }, [Role.DOCTOR], { doctor: true }),
      ).toBe(false);
    });
  });
});
