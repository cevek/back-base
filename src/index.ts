import Logger from 'bunyan';
import cors from 'cors';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { Pool } from 'pg';
import { createSchema } from 'ts2graphql';
import { config } from './config';
import { BaseClientError } from './errors';
import { DB, DBEntityNotFound } from './Orm';
// import {createDB} from './Orm/PostgresqlDriver';
import { createDB } from './Orm/MemoryDriver';

export { Logger };

export async function createGraphqApp<DBSchema = unknown>(options: {
	session?: SessionOptions;
	db?: {
		user: string;
		password: string;
		database: string;
		host?: string;
		port?: number;
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
	const PRODUCTION = process.env.NODE_ENV === 'production';

	const logger = new Logger({ name: 'app' });

	let db: DB<DBSchema> | undefined;
	if (options.db) {
		// const dbPool = new Pool({
		// 	password: options.db.password,
		// 	user: options.db.user,
		// 	database: options.db.database,
		// 	host: options.db.host,
		// 	port: options.db.port,
		// });
		// db = await createDB<DBSchema>({
		// 	getClient: () => dbPool.connect(),
		// 	driver: postresqlDriver,
		// });
		db = await createDB<DBSchema>();
	}
	const express = Express();
	express.disable('x-powered-by');

	express.use(
		session({
			name: 'sid',
			secret: config.secret,
			resave: true,
			saveUninitialized: true,
		}),
	);

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
				if (err.originalError) {
					if (options.db && err.originalError instanceof DBEntityNotFound) {
						return options.db.errorEntityNotFound;
					}
					if (err.originalError instanceof BaseClientError) {
						return err.originalError.id;
					} else {
						/* istanbul ignore next */
						logger.error(err.originalError);
						return options.errors.unknown;
					}
				}
				/* istanbul ignore next */
				return err;
			},
		}),
	);

	/* istanbul ignore next */
	express.use((err: any, _: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
		console.error(err);
		return res.status(500).send({ status: 'error', error: '' });
	});

	express.listen(options.port, () =>
		console.log('server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql'),
	);

	return {
		express,
		logger,
		db: db!,
	};
}

// console.log(printSchema(schema));
