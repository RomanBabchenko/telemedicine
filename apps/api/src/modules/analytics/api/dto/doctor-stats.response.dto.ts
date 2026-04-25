import { ApiProperty } from '@nestjs/swagger';

export class DoctorStatsResponseDto {
  @ApiProperty({ format: 'uuid' })
  doctorId!: string;

  @ApiProperty()
  consultations!: number;

  @ApiProperty()
  cancellations!: number;

  @ApiProperty()
  noShows!: number;

  @ApiProperty()
  averagePrice!: number;

  @ApiProperty({ description: 'Sum of DOCTOR_PAYABLE ledger credit entries' })
  totalRevenue!: number;

  @ApiProperty()
  followUpCount!: number;

  @ApiProperty()
  averageDurationMin!: number;

  @ApiProperty({ type: Number, nullable: true })
  rating!: number | null;
}
