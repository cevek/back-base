import Logger from 'bunyan';
import cors from 'cors';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { Pool } from 'pg';
import { createSchema } from 'ts2graphql';
import { config } from './config';
import { BaseClientError } from './errors';
import { DBEntityNotFound } from './Orm';
import { createDB, DB, SchemaConstraint } from './Orm/PostgresqlDriver';
import { DBQueryError } from './Orm/Base';
import { GraphQLError } from 'graphql';
import { EventEmitter } from 'events';

export * from './utils';
export * from './graphQLUtils';
export * from './testUtils';
export * from './errors';
export * from './Orm';
export * from './Orm/PostgresqlDriver';
export { Logger };

export async function createGraphqApp<DBSchema extends SchemaConstraint>(options: {
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
	enum ConsoleColor {
		GRAY = 0,
		RED = 1,
		GREEN = 2,
		YELLOW = 3,
		BLUE = 4,
		MAGENTA = 5,
		CYAN = 6,
	}
	function color(text: string, color: ConsoleColor) {
		return '\u001b[3' + color + ';1m' + text + '\u001b[0m';
	}

	class LogStream extends EventEmitter {
		writable = true;
		end() {}
		prevTime = new Date();
		formatTime(t: Date) {
			return `${('0' + t.getHours()).substr(-2)}:${('0' + t.getMinutes()).substr(-2)}:${('0' + t.getSeconds()).substr(
				-2,
			)}`;
		}
		formatDiff(time: Date, time2: Date) {
			const ms = time2.getTime() - time.getTime();
			if (ms > 60_000) return `+${(ms / 60_000).toPrecision(1)}min`;
			if (ms > 1000) return `+${(ms / 1000).toPrecision(1)}s`;
			return `+${Math.round(ms / 10) * 10}ms`;
		}
		write(b: string | Buffer) {
			const rec = (b as unknown) as { level: number; time: Date; msg: object };
			const levels = {
				error: ConsoleColor.RED,
				info: ConsoleColor.BLUE,
				warn: ConsoleColor.YELLOW,
				debug: ConsoleColor.CYAN,
			} as const;
			console.log(
				`${color(this.formatTime(rec.time), ConsoleColor.GRAY)} ${color(
					Logger.nameFromLevel[rec.level],
					levels[Logger.nameFromLevel[rec.level] as keyof typeof levels],
				)}`,
				rec.msg,
			);
			this.prevTime = rec.time;
			return true;
		}
	}
	const logger = new Logger({
		name: 'app',
		streams: [
			{
				type: 'raw',
				stream: new LogStream(),
			},
		],
	});

	let db: DB<DBSchema> | undefined;
	if (options.db) {
		db = await createDB<DBSchema>(
			new Pool({
				password: options.db.password,
				user: options.db.user,
				database: options.db.database,
				host: options.db.host,
				port: options.db.port,
			}),
		);
		// db = await createDB<DBSchema>();
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
				const error = err.originalError || err;
				if (error instanceof GraphQLError) {
					return error;
				}

				if (options.db && error instanceof DBEntityNotFound) {
					logger.error(error.message);
					return options.db.errorEntityNotFound;
				}
				if (error instanceof BaseClientError) {
					return error.id;
				}
				/* istanbul ignore next */
				if (error instanceof DBQueryError) {
					logger.error({ ...error });
				} else {
					logger.error(error);
				}
				return options.errors.unknown;
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
