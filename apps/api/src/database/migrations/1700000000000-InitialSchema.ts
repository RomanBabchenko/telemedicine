import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

    // ---------- tenants ----------
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "slug" varchar(64) NOT NULL UNIQUE,
        "subdomain" varchar(128) NOT NULL UNIQUE,
        "brand_name" varchar(256) NOT NULL,
        "primary_color" varchar(16) NOT NULL DEFAULT '#1f7ae0',
        "logo_url" text,
        "locale" varchar(8) NOT NULL DEFAULT 'uk',
        "currency" varchar(8) NOT NULL DEFAULT 'UAH',
        "feature_matrix" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "audio_policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "billing_plan_id" uuid,
        "is_platform" boolean NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_billing_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "name" varchar(128) NOT NULL,
        "monthly_fee" numeric(12,2) NOT NULL DEFAULT 0,
        "per_consultation_fee" numeric(12,2) NOT NULL DEFAULT 0,
        "included_modules" text[] NOT NULL DEFAULT '{}',
        "revenue_share_pct" numeric(5,2) NOT NULL DEFAULT 0
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "revenue_share_rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid,
        "platform_pct" numeric(5,2) NOT NULL DEFAULT 15,
        "clinic_pct" numeric(5,2) NOT NULL DEFAULT 25,
        "doctor_pct" numeric(5,2) NOT NULL DEFAULT 60,
        "mis_partner_pct" numeric(5,2) NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_revshare_tenant" ON "revenue_share_rules" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_revshare_doctor" ON "revenue_share_rules" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "key" varchar(128) NOT NULL,
        "value" jsonb NOT NULL DEFAULT 'true'::jsonb,
        CONSTRAINT "uq_feature_flag_tenant_key" UNIQUE ("tenant_id", "key")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_feature_flag_tenant" ON "feature_flags" ("tenant_id")`);

    // ---------- identity ----------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "email" citext,
        "phone" varchar(32),
        "password_hash" text,
        "first_name" varchar(128),
        "last_name" varchar(128),
        "mfa_secret" text,
        "mfa_enabled" boolean NOT NULL DEFAULT false,
        "email_verified_at" timestamptz,
        "phone_verified_at" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE'
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_phone" ON "users" ("phone") WHERE "phone" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_tenant_memberships" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "user_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "role" varchar(32) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_user_tenant_role" UNIQUE ("user_id", "tenant_id", "role")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_membership_user" ON "user_tenant_memberships" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_membership_tenant" ON "user_tenant_memberships" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "user_id" uuid NOT NULL,
        "refresh_token_hash" text NOT NULL,
        "device_fingerprint" text,
        "user_agent" text,
        "ip" inet,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_user" ON "sessions" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE "otp_codes" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "identifier" varchar(256) NOT NULL,
        "channel" varchar(16) NOT NULL,
        "code_hash" text NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "attempts" int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_otp_identifier" ON "otp_codes" ("identifier")`);

    await queryRunner.query(`
      CREATE TABLE "magic_link_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "token_hash" text NOT NULL UNIQUE,
        "email" varchar(256) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz
      )
    `);

    // ---------- providers / patients ----------
    await queryRunner.query(`
      CREATE TABLE "doctors" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "user_id" uuid NOT NULL UNIQUE,
        "first_name" varchar(128) NOT NULL,
        "last_name" varchar(128) NOT NULL,
        "specializations" text[] NOT NULL DEFAULT '{}',
        "subspecializations" text[] NOT NULL DEFAULT '{}',
        "license_number" varchar(64),
        "years_of_experience" int NOT NULL DEFAULT 0,
        "languages" text[] NOT NULL DEFAULT '{}',
        "bio" text,
        "photo_url" text,
        "verification_status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "rating" numeric(3,2),
        "base_price" numeric(12,2) NOT NULL DEFAULT 0,
        "default_duration_min" int NOT NULL DEFAULT 30,
        "deleted_at" timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_tenant_profiles" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "display_name" varchar(256),
        "price" numeric(12,2) NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT true,
        "slot_source_is_mis" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_doctor_tenant" UNIQUE ("doctor_id", "tenant_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_dtp_tenant" ON "doctor_tenant_profiles" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_dtp_doctor" ON "doctor_tenant_profiles" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "patients" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "user_id" uuid,
        "first_name" varchar(128) NOT NULL,
        "last_name" varchar(128) NOT NULL,
        "date_of_birth" date,
        "gender" varchar(16),
        "email" citext,
        "phone" varchar(32),
        "preferred_locale" varchar(8) NOT NULL DEFAULT 'uk',
        "master_patient_id" uuid,
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_patients_user" ON "patients" ("user_id") WHERE "user_id" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "patient_tenant_profiles" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "external_mis_id" varchar(128),
        CONSTRAINT "uq_patient_tenant" UNIQUE ("patient_id", "tenant_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ptp_tenant" ON "patient_tenant_profiles" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ptp_patient" ON "patient_tenant_profiles" ("patient_id")`);

    await queryRunner.query(`
      CREATE TABLE "consents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" varchar(32) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'GRANTED',
        "version_code" varchar(32) NOT NULL DEFAULT 'v1',
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "withdrawn_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consents_tenant" ON "consents" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_consents_user" ON "consents" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE "consent_artifacts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "consent_id" uuid NOT NULL,
        "ip" inet,
        "user_agent" text,
        "payload_hash" text,
        "file_asset_id" uuid
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_consent_artifact_consent" ON "consent_artifacts" ("consent_id")`);

    // ---------- booking ----------
    await queryRunner.query(`
      CREATE TABLE "service_types" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid,
        "code" varchar(64) NOT NULL,
        "name" varchar(256) NOT NULL,
        "duration_min" int NOT NULL DEFAULT 30,
        "price" numeric(12,2) NOT NULL DEFAULT 0,
        "mode" varchar(16) NOT NULL DEFAULT 'VIDEO',
        "is_follow_up" boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_service_tenant" ON "service_types" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_service_doctor" ON "service_types" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "availability_rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "weekday" int NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "buffer_min" int NOT NULL DEFAULT 0,
        "service_type_id" uuid,
        "valid_from" date,
        "valid_until" date
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_avail_tenant" ON "availability_rules" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_avail_doctor" ON "availability_rules" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "slots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "service_type_id" uuid NOT NULL,
        "start_at" timestamptz NOT NULL,
        "end_at" timestamptz NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'OPEN',
        "source_is_mis" boolean NOT NULL DEFAULT false,
        "external_slot_id" varchar(128),
        "held_until" timestamptz,
        "version" int NOT NULL DEFAULT 1,
        CONSTRAINT "uq_slot_doctor_start" UNIQUE ("doctor_id", "start_at")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_slot_tenant" ON "slots" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_slot_tenant_doctor_start" ON "slots" ("tenant_id", "doctor_id", "start_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "appointments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "service_type_id" uuid NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
        "reason_text" text,
        "start_at" timestamptz NOT NULL,
        "end_at" timestamptz NOT NULL,
        "payment_id" uuid,
        "consultation_session_id" uuid,
        "cancelled_reason" text,
        "version" int NOT NULL DEFAULT 1,
        "deleted_at" timestamptz,
        CONSTRAINT "uq_appointment_slot" UNIQUE ("slot_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_appointment_tenant" ON "appointments" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_appointment_tenant_status" ON "appointments" ("tenant_id", "status")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_appointment_patient" ON "appointments" ("patient_id")`);
    await queryRunner.query(`CREATE INDEX "idx_appointment_doctor" ON "appointments" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "appointment_participants" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "appointment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(32) NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_participant_appointment" ON "appointment_participants" ("appointment_id")`,
    );

    // ---------- consultation ----------
    await queryRunner.query(`
      CREATE TABLE "consultation_sessions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "livekit_room_name" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'SCHEDULED',
        "started_at" timestamptz,
        "ended_at" timestamptz,
        "patient_joined_at" timestamptz,
        "doctor_joined_at" timestamptz,
        "recording_id" uuid,
        CONSTRAINT "uq_session_appointment" UNIQUE ("appointment_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_session_tenant" ON "consultation_sessions" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_session_room" ON "consultation_sessions" ("livekit_room_name")`);

    await queryRunner.query(`
      CREATE TABLE "session_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "type" varchar(32) NOT NULL,
        "actor_user_id" uuid,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_session_event_tenant" ON "session_events" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_session_event_session" ON "session_events" ("session_id")`);

    await queryRunner.query(`
      CREATE TABLE "session_recordings" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "file_asset_id" uuid,
        "duration_sec" int NOT NULL DEFAULT 0,
        "consent_id" uuid,
        "retention_until" timestamptz,
        "egress_id" varchar(128),
        "status" varchar(16) NOT NULL DEFAULT 'RECORDING',
        CONSTRAINT "uq_recording_session" UNIQUE ("session_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_recording_tenant" ON "session_recordings" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_recording_session" ON "session_recordings" ("session_id")`);

    // ---------- documentation ----------
    await queryRunner.query(`
      CREATE TABLE "medical_documents" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "author_doctor_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "type" varchar(32) NOT NULL DEFAULT 'CONCLUSION',
        "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
        "structured_content" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "pdf_file_asset_id" uuid,
        "parent_document_id" uuid,
        "version" int NOT NULL DEFAULT 1,
        "signed_at" timestamptz,
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_doc_tenant" ON "medical_documents" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_doc_appointment" ON "medical_documents" ("appointment_id")`);
    await queryRunner.query(`CREATE INDEX "idx_doc_patient" ON "medical_documents" ("patient_id")`);

    await queryRunner.query(`
      CREATE TABLE "document_templates" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid,
        "specialization" varchar(128) NOT NULL,
        "type" varchar(32) NOT NULL DEFAULT 'CONCLUSION',
        "name" varchar(256) NOT NULL,
        "schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "default_values" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_template_tenant" ON "document_templates" ("tenant_id")`);

    // ---------- prescriptions / referrals ----------
    await queryRunner.query(`
      CREATE TABLE "prescriptions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
        "pdf_file_asset_id" uuid,
        "signed_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_prescription_tenant" ON "prescriptions" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_prescription_appointment" ON "prescriptions" ("appointment_id")`);

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "target_type" varchar(32) NOT NULL DEFAULT 'SPECIALIST',
        "instructions" text NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
        "pdf_file_asset_id" uuid
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_referral_tenant" ON "referrals" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_referral_appointment" ON "referrals" ("appointment_id")`);

    // ---------- payments ----------
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "provider" varchar(32) NOT NULL,
        "provider_intent_id" varchar(256) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'UAH',
        "status" varchar(32) NOT NULL DEFAULT 'PENDING',
        "webhook_event_ids" text[] NOT NULL DEFAULT '{}',
        CONSTRAINT "uq_payment_provider_intent" UNIQUE ("provider", "provider_intent_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_payment_tenant" ON "payments" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_payment_appointment" ON "payments" ("appointment_id")`);

    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "payment_id" uuid,
        "appointment_id" uuid,
        "account" varchar(32) NOT NULL,
        "debit" numeric(12,2) NOT NULL DEFAULT 0,
        "credit" numeric(12,2) NOT NULL DEFAULT 0,
        "memo" text
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ledger_tenant" ON "ledger_entries" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ledger_payment" ON "ledger_entries" ("payment_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ledger_account" ON "ledger_entries" ("account")`);

    await queryRunner.query(`
      CREATE TABLE "payouts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL DEFAULT 0,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING'
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_payout_tenant" ON "payouts" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_payout_doctor" ON "payouts" ("doctor_id")`);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
        "pdf_file_asset_id" uuid
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_invoice_tenant" ON "invoices" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_invoice_period" ON "invoices" ("tenant_id", "period_start")`);

    // ---------- notifications ----------
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "user_id" uuid,
        "channel" varchar(16) NOT NULL,
        "template_code" varchar(64) NOT NULL,
        "subject" varchar(256),
        "body" text NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'QUEUED',
        "sent_at" timestamptz,
        "error" text
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_notification_tenant" ON "notifications" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_notification_user" ON "notifications" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE "notification_prefs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "user_id" uuid NOT NULL UNIQUE,
        "email" boolean NOT NULL DEFAULT true,
        "sms" boolean NOT NULL DEFAULT true,
        "push" boolean NOT NULL DEFAULT true,
        "marketing" boolean NOT NULL DEFAULT false
      )
    `);

    // ---------- file storage ----------
    await queryRunner.query(`
      CREATE TABLE "file_assets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "bucket" varchar(128) NOT NULL,
        "object_key" varchar(512) NOT NULL,
        "content_type" varchar(128) NOT NULL,
        "size_bytes" bigint NOT NULL DEFAULT 0,
        "sha256" varchar(128),
        "purpose" varchar(64) NOT NULL,
        "uploaded_by_user_id" uuid,
        "access_policy" jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_file_tenant" ON "file_assets" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_file_purpose" ON "file_assets" ("purpose")`);

    // ---------- mis integration ----------
    await queryRunner.query(`
      CREATE TABLE "external_identities" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "entity_type" varchar(32) NOT NULL,
        "internal_id" uuid NOT NULL,
        "external_system" varchar(32) NOT NULL,
        "external_id" varchar(256) NOT NULL,
        CONSTRAINT "uq_external_identity" UNIQUE ("tenant_id", "external_system", "entity_type", "external_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_external_tenant" ON "external_identities" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX "idx_external_internal" ON "external_identities" ("internal_id")`);

    await queryRunner.query(`
      CREATE TABLE "mis_sync_jobs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "connector" varchar(32) NOT NULL,
        "job_type" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'QUEUED',
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "stats" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "error" text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_sync_job_tenant_started" ON "mis_sync_jobs" ("tenant_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "tenant_integration_configs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "tenant_id" uuid NOT NULL,
        "connector" varchar(32) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "credentials" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "options" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_full_sync_at" timestamptz,
        "last_incremental_sync_at" timestamptz,
        CONSTRAINT "uq_tenant_connector" UNIQUE ("tenant_id", "connector")
      )
    `);

    // ---------- audit ----------
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "actor_user_id" uuid,
        "action" varchar(128) NOT NULL,
        "resource_type" varchar(64) NOT NULL,
        "resource_id" varchar(128),
        "before" jsonb,
        "after" jsonb,
        "ip" inet,
        "user_agent" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_tenant_created" ON "audit_events" ("tenant_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_actor_created" ON "audit_events" ("actor_user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_resource" ON "audit_events" ("resource_type", "resource_id")`,
    );

    // ---------- analytics ----------
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" uuid,
        "kind" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_analytics_tenant_created" ON "analytics_events" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_analytics_kind" ON "analytics_events" ("kind")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'analytics_events',
      'audit_events',
      'tenant_integration_configs',
      'mis_sync_jobs',
      'external_identities',
      'file_assets',
      'notification_prefs',
      'notifications',
      'invoices',
      'payouts',
      'ledger_entries',
      'payments',
      'referrals',
      'prescriptions',
      'document_templates',
      'medical_documents',
      'session_recordings',
      'session_events',
      'consultation_sessions',
      'appointment_participants',
      'appointments',
      'slots',
      'availability_rules',
      'service_types',
      'consent_artifacts',
      'consents',
      'patient_tenant_profiles',
      'patients',
      'doctor_tenant_profiles',
      'doctors',
      'magic_link_tokens',
      'otp_codes',
      'sessions',
      'user_tenant_memberships',
      'users',
      'feature_flags',
      'revenue_share_rules',
      'tenant_billing_plans',
      'tenants',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
  }
}
