import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/env.config';

/**
 * Note: we deliberately do NOT use file globs for `entities` or `migrations`.
 * The webpack-built bundle has no real filesystem layout, so glob loading fails.
 * Instead:
 *   - entities are auto-collected from `TypeOrmModule.forFeature([...])` calls
 *     in each module via `autoLoadEntities: true`.
 *   - migrations are run out-of-process via the CLI script which uses
 *     `src/config/typeorm.config.ts` (ts-node, no webpack involved).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        type: 'postgres',
        host: config.db.host,
        port: config.db.port,
        username: config.db.user,
        password: config.db.password,
        database: config.db.name,
        synchronize: false,
        logging: config.db.logging,
        autoLoadEntities: true,
        migrationsRun: false,
        migrationsTableName: 'typeorm_migrations',
      }),
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class DatabaseModule {}
