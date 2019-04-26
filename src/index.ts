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
import { graphQLBigintTypeFactory } from './graphQLUtils';
import { BaseDB, SchemaConstraint } from './Orm/PostgresqlDriver';
import * as bodyparser from 'body-parser';
import serveStatic from 'serve-static';
import { readFileSync } from 'fs';
import https from 'https';
import http from 'http';
import { ClientException, logger, Exception } from './logger';
import { Pool } from 'pg';
import findUp from 'find-up';

export * from './di';
export * from './graphQLUtils';
export * from './Orm/PostgresqlDriver';
export * from './request';
export * from './testUtils';
export * from './utils';
export * from './dateUtils';
export * from './assert';
export * from './logger';
export const bodyParser = bodyparser;

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
	logger.info('ENV', { ENV });
	const packageJsonFile = await findUp('package.json', { cwd: require.main!.filename });
	if (!packageJsonFile) throw new Exception('package.json is not found');
	const projectDir = dirname(packageJsonFile);

	let db: BaseDB<DBSchema> | undefined;
	let dbPool: Pool | undefined;
	if (options.db) {
		const dbRes = await dbInit<DBSchema>(projectDir, options.db);
		db = dbRes.db;
		dbPool = dbRes.pool;
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
		if (error instanceof ClientException) {
			return { error: error.name, status: 400 };
		}
		logger.error(error);
		/* istanbul ignore next */
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
	server.listen(port, () => logger.info(`server starts on port`, { port }));

	return {
		server,
		express,
		projectDir,
		db: db!,
		dbPool: dbPool!,
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
	logger.warn('Unhandled Promise rejection', { reason });
});
process.on('uncaughtException', err => {
	logger.error('UncaughtException', err);
});
process.on('warning', warning => {
	logger.warn('Warning', { warning });
});
