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
import { BaseDB, SchemaConstraint, DBQueryError, DBEntityNotFound } from './Orm';
import * as bodyparser from 'body-parser';
import serveStatic from 'serve-static';
import { readFileSync } from 'fs';
import https from 'https';
import http from 'http';

export * from './di';
export * from './errors';
export * from './graphQLUtils';
export * from './Orm';
export * from './Orm/PostgresqlDriver';
export * from './request';
export * from './testUtils';
export * from './utils';
export * from './dateUtils';
export * from './Validator';
export const bodyParser = bodyparser;

export { logger, JsonError } from './logger';

export const PRODUCTION = ENV === 'production';

export async function createGraphqApp<DBSchema extends SchemaConstraint>(options: {
	https?: {
		privateKeyFile: string;
		certificateFile: string;
		port?: number;
	};
	session?: SessionOptions;
	db?: DBOptions;
	graphql: {
		schema: string;
		resolver: object;
	};
	static?: {
		rootDir: string;
		options?: serveStatic.ServeStaticOptions;
	};
	parcel?: {
		indexFilename: string;
	};
	errors: {
		unknown: unknown;
	};
	port: number;
}) {
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

	if (options.static) {
		express.use(serveStatic(options.static.rootDir, options.static.options));
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

	function handleError(error: Error) {
		debugger;
		if (error instanceof BaseClientError) {
			logger.warn(error);
			return { error: error.id, status: 400 };
		}
		if (options.db && error instanceof DBEntityNotFound) {
			logger.warn(error.message);
			return { error: options.db.errorEntityNotFound, status: 400 };
		}
		/* istanbul ignore next */
		if (error instanceof DBQueryError) {
			logger.error('DBQuery error: ' + error.error + '\n' + error.query + '\n', error.values);
		} else {
			logger.error(error);
		}
		return { error: options.errors.unknown, status: 500 };
	}

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
			...{
				customFormatErrorFn(err: GraphQLError) {
					const error = err.originalError || err;
					if (error instanceof GraphQLError) {
						return error;
					}
					return handleError(error).error;
				},
			},
		}),
	);

	setTimeout(() => {
		/* istanbul ignore next */
		express.use((err: any, _: Express.Request, res: Express.Response, next: Express.NextFunction) => {
			const { error, status } = handleError(err);
			if (res.headersSent) {
				return next(err);
			}
			res.status(status);
			res.send({ status: 'error', error: error });
		});
	});

	const server = options.https
		? https.createServer(
				{
					key: readFileSync(options.https.privateKeyFile, 'utf8'),
					cert: readFileSync(options.https.certificateFile, 'utf8'),
				},
				express,
		  )
		: http.createServer(express);

	const port = options.https ? options.https.port || 4443 : options.port;
	server.listen(port, () =>
		logger.info(`server is running on http://localhost:${port}, graphql: http://localhost:${port}/api/graphql`),
	);

	return {
		server,
		express,
		db: db!,
	};
}

export function asyncMiddleware(
	fn: (req: Express.Request, res: Express.Response) => Promise<unknown>,
): Express.Handler {
	return (req, res, next) => {
		fn(req, res).then(ret => {
			res.send(ret || { status: 'ok' });
		}, next);
	};
}

process.on('unhandledRejection', reason => {
	logger.warn({ err: reason }, 'Unhandled Promise rejection');
});
process.on('uncaughtException', err => {
	logger.error(err);
});
process.on('warning', warning => {
	logger.warn(warning);
});
