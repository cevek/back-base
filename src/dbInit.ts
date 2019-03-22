import { Pool } from 'pg';
import { logger } from './logger';
import { migrateUp, createDB, sql, readMigrationsFromDir, SchemaConstraint } from './Orm/PostgresqlDriver';
import { sleep } from './utils';
import { DBQueryError } from './Orm/Base';

export interface DBOptions {
	user: string | undefined;
	password: string | undefined;
	database: string | undefined;
	host?: string;
	port?: number | string | number;
	schema: string;
	errorEntityNotFound: unknown;
}
export async function dbInit<DBSchema extends SchemaConstraint>(projectDir: string, options: DBOptions) {
	const db = await createDB<DBSchema>(
		new Pool({
			password: validate(options.password, 'password'),
			user: validate(options.user, 'user'),
			database: validate(options.database, 'name'),
			host: options.host,
			port: typeof options.port === 'string' ? Number(options.port) : options.port,
		}),
	);
	function validate(str: string | undefined, field: string) {
		if (typeof str !== 'string') throw new Error(`db ${field} is incorrect: ${str}`);
		return str;
	}
	while (true) {
		try {
			await db.query(sql`SELECT 1`);
			break;
		} catch (e) {
			logger.info('Postgres is unavailable: ' + e.message);
			await sleep(1000);
		}
	}
	try {
		const migrations = await readMigrationsFromDir(projectDir + '/../migrations/');
		await migrateUp(db, migrations, logger);
	} catch (e) {
		if (e instanceof DBQueryError) {
			logger.error('Migration error: ' + e.error);
		} else {
			logger.error('Migration error', e);
		}
		throw e;
	}
	return db;
}
