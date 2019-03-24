if (+process.versions.node.replace(/\.\d+$/, '') < 11)
	throw new Error(`Required version of node: >=11, current: ${process.versions.node}`);

import dotenv from 'dotenv';
export const ENV = process.env.NODE_ENV || 'development';
const envFiles = ['.env', '.env.local', '.env.' + ENV, '.env.' + ENV + '.local'];
envFiles.forEach(path => Object.assign(process.env, dotenv.config({ path }).parsed));

import cors from 'cors';
import 'deps-check';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { GraphQLError } from 'graphql';
import { dirname } from 'path';
import { createSchema } from 'ts2graphql';
import { dbInit, DBOptions } from './dbInit';
import { BaseClientError } from './errors';
import { graphQLBigintTypeFactory } from './graphQLUtils';
import { logger } from './logger';
import { DBEntityNotFound } from './Orm';
import { DBQueryError } from './Orm/Base';
import { BaseDB, SchemaConstraint } from './Orm/PostgresqlDriver';
import * as bodyparser from 'body-parser';

export * from './di';
export * from './errors';
export * from './graphQLUtils';
export * from './Orm';
export * from './Orm/PostgresqlDriver';
export * from './request';
export * from './testUtils';
export * from './utils';
export * from './dateUtils';
export const bodyParser = bodyparser;

export { logger, JsonError } from './logger';

export const PRODUCTION = ENV === 'production';

export async function createGraphqApp<DBSchema extends SchemaConstraint>(options: {
	session?: SessionOptions;
	db?: DBOptions;
	graphql: {
		schema: string;
		resolver: object;
	};
	parcel?: {
		indexFilename: string;
	};
	errors: {
		unknown: unknown;
	};
	port: number;
}): Promise<{
	db: BaseDB<DBSchema>;
	express: Express.Express;
}> {
	logger.info('ENV=' + ENV);
	const projectDir = dirname(require.main!.filename);

	let db: BaseDB<DBSchema> | undefined;
	if (options.db) {
		db = await dbInit(projectDir, options.db);
	}
	const express = Express();
	express.disable('x-powered-by');

	if (options.session) {
		express.use(
			session({
				name: 'sid',
				resave: true,
				saveUninitialized: true,
				...options.session,
			}),
		);
	}

	if (!PRODUCTION) {
		express.use(cors());
	}
	if (options.parcel) {
		const Bundler = require('parcel-bundler');
		const bundler = new Bundler(options.parcel.indexFilename, { cache: false }) as {
			middleware(): Express.RequestHandler;
		};
		express.use(bundler.middleware());
	}

	const schema = createSchema(options.graphql.schema, {
		customScalarFactory: type =>
			type.type === 'string' && type.rawType !== undefined ? graphQLBigintTypeFactory(type.rawType) : undefined,
	});

	// console.log(printSchema(schema));
	express.get(
		'/api/graphql',
		graphqlHTTP({
			schema: schema,
			rootValue: options.graphql.resolver,
			graphiql: true,
		}),
	);
	express.post(
		'/api/graphql',
		graphqlHTTP({
			schema: schema,
			rootValue: options.graphql.resolver,
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
					logger.error('DBQuery error: ' + error.error + '\n' + error.query + '\n', error.values);
				} else {
					logger.error(error);
				}
				return options.errors.unknown;
			},
		}),
	);

	setTimeout(() => {
		/* istanbul ignore next */
		express.use((err: any, req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
			logger.error(err);
			if (res.headersSent) {
				return next(err);
			}
			res.status(500);
			res.send({ status: 'error' });
		});
	});

	express.listen(options.port, () =>
		logger.info('server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql'),
	);

	return {
		express,
		db: db!,
	};
}

export function asyncMiddleware(fn: (req: Express.Request, res: Express.Response) => Promise<unknown>): Express.Handler {
	return (req, res, next) => {
		fn(req, res).then(next, next);
	};
}

process.on('unhandledRejection', (reason, p) => {
	logger.warn({ err: reason }, 'Unhandled Promise rejection');
});
process.on('uncaughtException', err => {
	logger.error(err);
});
process.on('warning', warning => {
	logger.warn(warning);
});
