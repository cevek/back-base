if (+process.versions.node.replace(/\.\d+$/, '') < 12)
	throw new Error(`Required version of node: >=12, current: ${process.versions.node}`);

import cors from 'cors';
import 'deps-check';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { GraphQLError, validateSchema } from 'graphql';
import { dirname } from 'path';
import { createSchema } from 'ts2graphql';
import { dbInit, DBOptions } from './dbInit';
import { graphQLBigintTypeFactory } from './graphQLUtils';
import { BaseDB, SchemaConstraint } from './Orm/PostgresqlDriver';
import * as bodyparser from 'body-parser';
import serveStatic from 'serve-static';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import https from 'https';
import http from 'http';
import { ClientException, logger, Exception } from './logger';
import { Pool } from 'pg';
import findUp from 'find-up';
import { sleep } from './utils';
// import * as diskusage from 'diskusage';

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

export const ENV = process.env.NODE_ENV || 'development';
export const PRODUCTION = ENV === 'production';

interface Options {
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
}

interface Result<DBSchema extends SchemaConstraint> {
	server: https.Server | http.Server;
	express: Express.Express;
	projectDir: string;
	db: BaseDB<DBSchema>;
	dbPool: Pool;
}

let EXITING = false;
export async function createGraphqApp<DBSchema extends SchemaConstraint>(
	options: Options,
	runMiddlewares?: (app: Result<DBSchema>) => Promise<void>,
): Promise<Result<DBSchema>> {
	let db: BaseDB<DBSchema> | undefined;
	let dbPool: Pool | undefined;
	try {
		logger.info('------------------------ START PROGRAM ----------------------', { pid: process.pid });
		logger.info('ENV', { ENV });

		if (options.db) {
			const dbRes = await dbInit<DBSchema>(projectDir, options.db);
			db = dbRes.db;
			dbPool = dbRes.pool;
		}
		const express = Express();
		express.disable('x-powered-by');
		express.use((_req, res, next) => {
			if (EXITING) {
				res.status(503);
				res.send({ status: 'error', error: { message: 'Service unavailable' } });
				return;
			}
			next();
		});

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
		// console.log(printSchema(schema));
		validateSchema(schema).forEach(err => {
			throw err;
		});

		function handleError(error: Error) {
			logger.error(error);
			if (error instanceof ClientException) {
				return { error: error.name, status: 400 };
			}
			debugger;
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
			(_req, res, next) => {
				const sendJson = res.json.bind(res);
				res.json = (json: { errors?: unknown[] }) => {
					if (json && json.errors) {
						json.errors = (json.errors as { originalError?: Error }[]).map(graphqlError => {
							const originalError = graphqlError.originalError || (graphqlError as Error);
							if (originalError instanceof GraphQLError) {
								return originalError;
							}
							const { error, status } = handleError(originalError);
							res.statusCode = status;
							return error;
						});
					}
					return sendJson(json);
				};
				next();
			},
			graphqlHTTP({
				schema: schema,
				rootValue: options.graphql.resolver,
				...{ customFormatErrorFn: (err: Error) => err },
			}),
		);

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
		const result = {
			server,
			express,
			projectDir,
			db: db!,
			dbPool: dbPool!,
		};

		if (runMiddlewares) {
			await runMiddlewares(result);
		}

		/* istanbul ignore next */
		express.use((err: any, _: Express.Request, res: Express.Response, next: Express.NextFunction) => {
			const { error, status } = handleError(err);
			if (res.headersSent) {
				return next(err);
			}
			res.status(status);
			res.send({ status: 'error', error: error });
		});

		return result;
	} catch (err) {
		if (dbPool) {
			await dbPool.end();
		}
		throw err;
	}
}

const packageJsonFile = findUp.sync('package.json', { cwd: require.main!.filename });
if (!packageJsonFile) throw new Exception('package.json is not found');
const projectDir = dirname(packageJsonFile);

const initFile = projectDir + '/.status';

let activeThreadsCount = 0;
export function asyncThread(fn: (req: Express.Request, res: Express.Response) => Promise<unknown>): Express.Handler {
	return (req, res, next) => {
		activeThreadsCount++;
		fn(req, res)
			.then(ret => res.send(ret || { status: 'ok' }), next)
			.finally(() => activeThreadsCount--);
	};
}

let lastExitRequestTime = 0;
[`SIGINT`, `SIGUSR1`, `SIGUSR2`, `SIGTERM`].forEach(eventType => {
	process.on(eventType as 'exit', async code => {
		// console.log('exit', {now: Date.now(), lastExitRequestTime, EXITING});
		if (EXITING && Date.now() - lastExitRequestTime < 10) return;
		if (EXITING) {
			logger.warn('Force Exit Double SIGINT', { activeThreadsCount });
			writeFileSync(initFile, 'ok');
			process.exit();
		}
		lastExitRequestTime = Date.now();
		logger.info('Exit requested', { eventType, code, activeThreadsCount });
		EXITING = true;
		let softExit = false;
		for (let i = 0; i < 300; i++) {
			if (activeThreadsCount === 0) {
				softExit = true;
				break;
			}
			await sleep(100);
		}
		if (softExit) {
			logger.info('Exit');
		} else {
			logger.warn('Force Exit', { activeThreadsCount });
		}
		writeFileSync(initFile, 'ok');
		process.exit();
	});
});

function round(val: number, round: number) {
	return Math.round(val / round) * round;
}
let prevCpuUsage = process.cpuUsage();
const SYSTEM_HEALTH_INTERVAL = 600_000;
setInterval(() => {
	const mem = process.memoryUsage();
	const cpu = process.cpuUsage();
	const cpuSum = cpu.system - prevCpuUsage.system + (cpu.user - prevCpuUsage.user);
	const cpuUsage = round((cpuSum / (SYSTEM_HEALTH_INTERVAL * 1000)) * 100, 1) + '%';
	const headUsage = round(mem.heapUsed / 1024 ** 2, 50) + ' MB';
	const rss = round(mem.rss / 1024 ** 2, 50) + ' MB';
	logger.info('System health', { headUsage, rss, cpuUsage });
	prevCpuUsage = cpu;
}, SYSTEM_HEALTH_INTERVAL).unref();

// const MIN_AVAILABLE_DISK_SPACE = 1024 ** 3;

function checkFreeSpace() {
	// diskusage
	// 	.check('/')
	// 	.then(res => {
	// 		if (res.available < MIN_AVAILABLE_DISK_SPACE) {
	// 			const availableSpace = round(res.available / 1024 ** 2, 50) + ' MB';
	// 			logger.warn('Low available disk space', { availableSpace });
	// 		}
	// 	})
	// 	.catch(err => logger.error(err));
	// setTimeout(checkFreeSpace, 600_000).unref();
}
checkFreeSpace();

if (existsSync(initFile) && readFileSync(initFile, 'utf8') !== 'ok') {
	setTimeout(() => {
		logger.warn('Last program was killed');
	});
}
writeFileSync(initFile, '');

process.on('unhandledRejection', reason => logger.warn('Unhandled Promise rejection', { reason }));
process.on('uncaughtException', err => logger.error('UncaughtException', err));
process.on('warning', warning => logger.warn('Warning', { warning }));
