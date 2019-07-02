if (+process.versions.node.replace(/\.\d+$/, '') < 12)
	throw new Error(`Required version of node: >=12, current: ${process.versions.node}`);

import * as bodyparser from 'body-parser';
import cors from 'cors';
import 'deps-check';
import Express from 'express';
import session, { SessionOptions } from 'express-session';
import findUp from 'find-up';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import http from 'http';
import https from 'https';
import { dirname } from 'path';
import { Pool } from 'pg';
import serveStatic from 'serve-static';
import { dbInit, DBOptions } from './dbInit';
import { handleError } from './errors';
import { Exception, logger } from './logger';
import { BaseDB, SchemaConstraint } from './Orm/PostgresqlDriver';
import { makeRoutes, Route, getActiveThreadsCount } from './router';
import { sleep } from './utils';

export * from './assert';
export * from './dateUtils';
export * from './service';
export * from './graphQLUtils';
export * from './logger';
export * from './Orm/PostgresqlDriver';
export * from './request';
export * from './testUtils';
export * from './utils';
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
	static?: {
		rootDir: string;
		options?: serveStatic.ServeStaticOptions;
	};
	parcel?: {
		indexFilename: string;
	};
	routes: Route;
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
export async function createApp<DBSchema extends SchemaConstraint>(options: Options): Promise<Result<DBSchema>> {
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

		makeRoutes(express, options.routes, 'all', '/', []);

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

let lastExitRequestTime = 0;
[`SIGINT`, `SIGUSR1`, `SIGUSR2`, `SIGTERM`].forEach(eventType => {
	process.on(eventType as 'exit', async code => {
		const activeThreadsCount = getActiveThreadsCount();
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
