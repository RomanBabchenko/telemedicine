import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/env.config';
import { User } from './domain/entities/user.entity';
import { UserTenantMembership } from './domain/entities/user-tenant-membership.entity';
import { Session } from './domain/entities/session.entity';
import { OtpCode } from './domain/entities/otp-code.entity';
import { MagicLinkToken } from './domain/entities/magic-link-token.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { TokenService } from './application/token.service';
import { PasswordService } from './application/password.service';
import { OtpService } from './application/otp.service';
import { MagicLinkService } from './application/magic-link.service';
import { MfaService } from './application/mfa.service';
import { AuthService } from './application/auth.service';
import { UserService } from './application/user.service';
import { AuthController } from './api/auth.controller';
import { AdminUserController } from './api/admin-user.controller';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { MfaGuard } from '../../common/auth/mfa.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserTenantMembership,
      Session,
      OtpCode,
      MagicLinkToken,
      Patient,
      Tenant,
    ]),
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.accessSecret,
        signOptions: { expiresIn: config.jwt.accessTtl },
      }),
    }),
  ],
  providers: [
    TokenService,
    PasswordService,
    OtpService,
    MagicLinkService,
    MfaService,
    AuthService,
    UserService,
    JwtAuthGuard,
    RolesGuard,
    MfaGuard,
  ],
  controllers: [AuthController, AdminUserController],
  exports: [TokenService, PasswordService, AuthService, UserService, JwtAuthGuard, RolesGuard, MfaGuard, JwtModule],
})
export class IdentityModule {}
