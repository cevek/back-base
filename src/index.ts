import cors from 'cors';
import Express, { Request } from 'express';
import graphqlHTTP from 'express-graphql';
import session from 'express-session';
import { createSchema } from 'ts2graphql';
import { config } from './config';
import { query } from './graphql/implementation';
import { DBUser } from './db/db.schema';
import { db } from './db';
import { ClientError } from './errors';
// const bundler = new Bundler(__dirname + '/../front/src/index.html', { cache: false });
// express.use((bundler as any).middleware());

export interface ReqWithUser extends Request {
	session: Request['session'] & {
		user: DBUser | undefined;
	};
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

if (process.env.NODE_ENV !== 'production') {
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
			if (err instanceof ClientError) return err.id;
			return err;
		},
	}),
);

express.use((err: any, _: Express.Request, res: Express.Response, _next: Express.NextFunction) => {
	console.error(err);
	return res.status(400).send({ status: 'error', error: '' });
});

express.listen(4000, () =>
	console.log(
		'server is running on http://localhost:4000, graphql: http://localhost:4000/api/graphql',
	),
);

// console.log(printSchema(schema));
