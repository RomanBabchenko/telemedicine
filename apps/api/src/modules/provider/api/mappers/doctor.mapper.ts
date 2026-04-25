import { Doctor } from '../../domain/entities/doctor.entity';
import { DoctorTenantProfile } from '../../domain/entities/doctor-tenant-profile.entity';
import { AvailabilityRule } from '../../../booking/domain/entities/availability-rule.entity';
import { DoctorResponseDto } from '../dto/doctor.response.dto';
import { AvailabilityRuleResponseDto } from '../dto/availability-rule.response.dto';

export const toDoctorResponse = (
  doctor: Doctor,
  profile: DoctorTenantProfile,
): DoctorResponseDto => ({
  id: doctor.id,
  firstName: doctor.firstName,
  lastName: doctor.lastName,
  specializations: doctor.specializations,
  subspecializations: doctor.subspecializations,
  licenseNumber: doctor.licenseNumber,
  yearsOfExperience: doctor.yearsOfExperience,
  languages: doctor.languages,
  bio: doctor.bio,
  photoUrl: doctor.photoUrl,
  verificationStatus: doctor.verificationStatus,
  rating: doctor.rating !== null ? Number(doctor.rating) : null,
  basePrice: Number(profile.price),
  defaultDurationMin: doctor.defaultDurationMin,
  isPublished: profile.isPublished,
});

export const toAvailabilityRuleResponse = (
  rule: AvailabilityRule,
): AvailabilityRuleResponseDto => ({
  id: rule.id,
  doctorId: rule.doctorId,
  weekday: rule.weekday,
  startTime: rule.startTime,
  endTime: rule.endTime,
  bufferMin: rule.bufferMin,
  serviceTypeId: rule.serviceTypeId,
  validFrom: rule.validFrom
    ? typeof rule.validFrom === 'string'
      ? rule.validFrom
      : (rule.validFrom as Date).toISOString()
    : null,
  validUntil: rule.validUntil
    ? typeof rule.validUntil === 'string'
      ? rule.validUntil
      : (rule.validUntil as Date).toISOString()
    : null,
});
