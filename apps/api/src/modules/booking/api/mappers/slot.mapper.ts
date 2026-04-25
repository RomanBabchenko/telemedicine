import { Slot } from '../../domain/entities/slot.entity';
import { SlotResponseDto } from '../dto/slot.response.dto';

export const toSlotResponse = (slot: Slot): SlotResponseDto => ({
  id: slot.id,
  doctorId: slot.doctorId,
  serviceTypeId: slot.serviceTypeId,
  startAt: slot.startAt.toISOString(),
  endAt: slot.endAt.toISOString(),
  status: slot.status,
  sourceIsMis: slot.sourceIsMis,
});
