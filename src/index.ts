if (+process.versions.node.replace(/\.\d+$/, '') < 11)
	throw new Error(`Required version of node: >=11, current: ${process.versions.node}`);
import Logger from 'bunyan';
import cors from 'cors';
import 'deps-check';
import dotenv from 'dotenv';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session, { SessionOptions } from 'express-session';
import { GraphQLError } from 'graphql';
import { dirname } from 'path';
import { createSchema } from 'ts2graphql';
import { config, ENV, PRODUCTION } from './config';
import { dbInit, DBOptions } from './dbInit';
import { BaseClientError } from './errors';
import { graphQLBigintTypeFactory } from './graphQLUtils';
import { logger } from './logger';
import { DBEntityNotFound } from './Orm';
import { DBQueryError } from './Orm/Base';
import { BaseDB, SchemaConstraint } from './Orm/PostgresqlDriver';

export * from './di';
export * from './errors';
export * from './graphQLUtils';
export * from './Orm';
export * from './Orm/PostgresqlDriver';
export * from './request';
export * from './testUtils';
export * from './utils';

export { logger } from './logger';

const envFiles = ['.env', '.env.local', '.env.' + ENV, '.env.' + ENV + '.local'];
envFiles.forEach(path => Object.assign(process.env, dotenv.config({ path }).parsed));

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
	logger: Logger;
	db: BaseDB<DBSchema>;
	express: Express.Express;
}> {
	logger.info('ENV=' + ENV);
	const projectDir = dirname(require.main!.filename);

	let db: BaseDB<DBSchema> | undefined;
	if (options.db) {
		await dbInit(projectDir, options.db);
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
	// express.get(
	// 	'/api/graphql',
	// 	graphqlHTTP({
	// 		schema: schema,
	// 		rootValue: options.graphql.resolvers,
	// 		graphiql: true,
	// 	}),
	// );

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

process.on('unhandledRejection', (reason, p) => {
	logger.warn({ err: reason }, 'Unhandled Promise rejection');
});
process.on('uncaughtException', err => {
	logger.error(err);
});
process.on('warning', warning => {
	logger.warn(warning);
});
