import cors from 'cors';
import Express, { Request } from 'express';
import graphqlHTTP from 'express-graphql';
import session from 'express-session';
import { createSchema } from 'ts2graphql';
import { config } from './config';
import { query } from './graphql/implementation';
import { ClientError, Errors } from './errors';
import { dbClearAll } from './db';
// const bundler = new Bundler(__dirname + '/../front/src/index.html', { cache: false });
// express.use((bundler as any).middleware());

const PRODUCTION = process.env.NODE_ENV === 'production';
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

const schema = createSchema(__dirname + '/graphql/schema.d.ts');
express.get(
	'/api/graphql',
	graphqlHTTP({
		schema: schema,
		rootValue: query,
		graphiql: true,
	}),
);

express.post(
	'/api/graphql',
	graphqlHTTP({
		schema: schema,
		rootValue: query,
		formatError(err) {
			if (err.originalError) {
				if (err.originalError instanceof ClientError) return err.originalError.id;
				/* istanbul ignore next */ else {
					console.error(err.originalError);
					return Errors.SomethingWentWrong;
				}
			}
			/* istanbul ignore next */
			return err;
		},
	}),
);

if (!PRODUCTION) {
	express.post('/api/clear-fake-db', (req, res, next) => {
		dbClearAll();
		next();
	});
}
/* istanbul ignore next */
express.use((err: any, _: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
	console.error(err);
	return res.status(500).send({ status: 'error', error: '' });
});

express.listen(4000, () =>
	console.log(
		'server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql',
	),
);

// console.log(printSchema(schema));
