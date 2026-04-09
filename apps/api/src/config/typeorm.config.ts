import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';

loadEnv({ path: join(process.cwd(), '..', '..', '.env') });
loadEnv({ path: join(process.cwd(), '.env'), override: false });

const isCli = process.argv.some((a) => a.includes('typeorm'));

const baseDir = isCli ? join(__dirname, '..') : join(__dirname, '..');

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'telemed',
  password: process.env.DB_PASSWORD ?? 'telemed',
  database: process.env.DB_NAME ?? 'telemed',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: [join(baseDir, '**', '*.entity.{ts,js}')],
  migrations: [join(baseDir, 'database', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
