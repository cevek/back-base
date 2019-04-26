import { Pool } from 'pg';
import { migrateUp, createDB, sql, readMigrationsFromDir, SchemaConstraint } from './Orm/PostgresqlDriver';
import { sleep } from './utils';
import { logger } from './logger';

export interface DBOptions {
	config: {
		user: string | undefined;
		password: string | undefined;
		database: string | undefined;
		host?: string;
		port?: number | string | number;
		createIfNotExists?: boolean;
	};
	schema: string;
	errorEntityNotFound: unknown;
}

export async function dbInit<DBSchema extends SchemaConstraint>(projectDir: string, options: DBOptions) {
	const config = options.config;
	const pool = new Pool({
		password: config.password,
		user: config.user,
		database: config.database,
		host: config.host,
		port: typeof config.port === 'string' ? Number(config.port) : config.port,
	});
	const db = await createDB<DBSchema>(pool);
	while (true) {
		try {
			await db.query(sql`SELECT 1`);
			break;
		} catch (e) {
			logger.info('Postgres is unavailable', e);
			await sleep(1000);
		}
	}
	const migrations = await readMigrationsFromDir(projectDir + '/migrations/');
	await migrateUp(db, migrations);
	return { db, pool };
}
