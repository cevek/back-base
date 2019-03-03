import cors from 'cors';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import session from 'express-session';
import { createSchema } from 'ts2graphql';
import { config } from './config';
import { ClientError, Errors } from './errors';
import { query } from './graphql/implementation';
// const bundler = new Bundler(__dirname + '/../front/src/index.html', { cache: false });
// express.use((bundler as any).middleware());

const PRODUCTION = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT) || 4000;

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

/* istanbul ignore next */
express.use((err: any, _: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
	console.error(err);
	return res.status(500).send({ status: 'error', error: '' });
});

express.listen(PORT, () =>
	console.log(
		'server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql',
	),
);

// console.log(printSchema(schema));
