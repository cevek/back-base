if (+process.versions.node.replace(/\.\d+$/, '') < 11)
	throw new Error(`Required version of node: >=11, current: ${process.versions.node}`);
import 'deps-check';
import { logger } from './logger';
import dotenv from 'dotenv';
import Logger from 'bunyan';
import cors from 'cors';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { Pool } from 'pg';
import { createSchema } from 'ts2graphql';
import { config, ENV, PRODUCTION } from './config';
import { BaseClientError } from './errors';
import { DBEntityNotFound } from './Orm';
import { createDB, DB, SchemaConstraint, migrateUp, readMigrationsFromDir, query } from './Orm/PostgresqlDriver';
import { DBQueryError } from './Orm/Base';
import { GraphQLError } from 'graphql';
import { dirname } from 'path';
import { sleep } from './utils';

export * from './utils';
export * from './graphQLUtils';
export * from './testUtils';
export * from './errors';
export * from './Orm';
export * from './Orm/PostgresqlDriver';
export { Logger };

const envFiles = ['.env', '.env.local', '.env.' + ENV, '.env.' + ENV + '.local'];
envFiles.forEach(path => Object.assign(process.env, dotenv.config({ path }).parsed));
export async function createGraphqApp<DBSchema extends SchemaConstraint>(options: {
	session?: SessionOptions;
	db?: {
		user: string;
		password: string;
		database: string;
		host?: string;
		port?: number | string | number;
		schema: string;
		errorEntityNotFound: unknown;
	};
	graphql: {
		schema: string;
		values: object;
	};
	bundler?: {
		indexFilename: string;
	};
	logger?: {};
	errors: {
		unknown: unknown;
	};
	port: number;
}): Promise<{
	logger: Logger;
	db: DB<DBSchema>;
	express: Express.Express;
}> {
	logger.info('ENV=' + ENV);
	const projectDir = dirname(require.main!.filename);

	let db: DB<DBSchema> | undefined;
	if (options.db) {
		db = await createDB<DBSchema>(
			new Pool({
				password: validate(options.db.password, 'password'),
				user: validate(options.db.user, 'user'),
				database: validate(options.db.database, 'name'),
				host: options.db.host,
				port: typeof options.db.port === 'string' ? Number(options.db.port) : options.db.port,
			}),
		);
		function validate(str: string, field: string) {
			if (typeof str !== 'string') {
				throw new Error(`db ${field} is incorrect: ${str}`);
			}
			return str;
		}
		while (true) {
			try {
				await db.query(query`SELECT 1`);
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
	}
	const express = Express();
	express.disable('x-powered-by');

	if (options.session) {
		express.use(
			session({
				name: 'sid',
				secret: config.secret,
				resave: true,
				saveUninitialized: true,
				...options.session,
			}),
		);
	}

	if (!PRODUCTION) {
		express.use(cors());
	}
	if (options.bundler) {
		const Bundler = require('parcel-bundler');
		const bundler = new Bundler(options.bundler.indexFilename, { cache: false }) as {
			middleware(): Express.RequestHandler;
		};
		express.use(bundler.middleware());
	}

	const schema = createSchema(options.graphql.schema);
	express.get(
		'/api/graphql',
		graphqlHTTP({
			schema: schema,
			rootValue: options.graphql.values,
			graphiql: true,
		}),
	);

	express.post(
		'/api/graphql',
		graphqlHTTP({
			schema: schema,
			rootValue: options.graphql.values,
			formatError(err) {
				const error = err.originalError || err;
				if (error instanceof GraphQLError) {
					return error;
				}
				debugger;
				if (error instanceof BaseClientError) {
					return error.id;
				}
				if (options.db && error instanceof DBEntityNotFound) {
					logger.error(error.message);
					return options.db.errorEntityNotFound;
				}
				/* istanbul ignore next */
				if (error instanceof DBQueryError) {
					logger.error('DBQuery error: ', error.query, error.values);
				} else {
					logger.error(error);
				}
				return options.errors.unknown;
			},
		}),
	);

	/* istanbul ignore next */
	express.use((err: any, _: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
		logger.error(err);
		return res.status(500).send({ status: 'error', error: '' });
	});

	express.listen(options.port, () =>
		logger.info('server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql'),
	);

	return {
		express,
		logger,
		db: db!,
	};
}
