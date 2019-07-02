import { GraphQLScalarType, Kind, GraphQLError, validateSchema } from 'graphql';
import Express from 'express';
import graphqlHTTP from 'express-graphql';
import { createSchema } from 'ts2graphql';
import { handleError } from './errors';
export type RootResolver<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R ? (args: Args, ctx: Context) => Return<R> : never
};

export type QueryParameters<Q> = { [P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never };

// type PromisifyObj<T> = { [P in keyof T]: PromisifyValue<T[P]> };
// type Obj<T> = PromisifyObj<T> | Promise<PromisifyObj<T>> | (() => PromisifyObj<T>) | (() => Promise<PromisifyObj<T>>);
// type PromisifyPrimitive<T> = T | Promise<T> | (() => T) | (() => Promise<T>);
// type PromisifyValue<T> = [T] extends [object]
// 	? (T extends Date ? PromisifyPrimitive<Date> : Obj<T>)
// 	: PromisifyPrimitive<T>;

// export type Return<T> = Promise<[T] extends [object] ? ([T] extends [Date] ? Date : PromisifyObj<T>) : T>;
export type Return<T> = Promise<T>;

export function fromPromise<T>(val: Promise<T> | (() => Promise<T>) | T) {
	return (val as unknown) as T extends Array<Promise<infer V>> ? V[] : T extends Array<() => Promise<infer V>> ? V : T;
}

const customTypeMap = new Map<string, GraphQLScalarType>();

export const graphQLBigintTypeFactory = (typeName: string) => {
	if (!/ID$/.test(typeName)) return;
	if (customTypeMap.has(typeName)) return customTypeMap.get(typeName);
	const type = new GraphQLScalarType({
		name: typeName,
		serialize: value,
		parseValue: value,
		parseLiteral(ast) {
			if (ast.kind === Kind.STRING) {
				return value(ast.value);
			}
			return null;
		},
	});
	customTypeMap.set(typeName, type);
	return type;

	function value(value: string) {
		try {
			if (BigInt(value) === 0n) throw 1;
		} catch (e) {
			throw new GraphQLError(`${typeName} should be numeric string: ${value}`);
		}
		return value;
	}
};

function graphQLErrorHandler(_: Express.Request, res: Express.Response, next: () => void) {
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
}
export function createGraphQLMiddleware(data: { resolver: object; schema: string }) {
	const schema = createSchema(data.schema, {
		customScalarFactory: type =>
			type.type === 'string' && type.rawType !== undefined ? graphQLBigintTypeFactory(type.rawType) : undefined,
	});
	validateSchema(schema).forEach(err => {
		throw err;
	});

	return {
		beforeEach: graphQLErrorHandler,
		get: graphqlHTTP({
			schema: schema,
			rootValue: data.resolver,
			graphiql: true,
		}),
		post: graphqlHTTP({
			schema,
			rootValue: data.resolver,
			...{ customFormatErrorFn: (err: Error) => err },
		}),
	};
}
