import { GraphQLScalarType, Kind, GraphQLError } from 'graphql';

export type RootResolver<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R ? (args: Args, ctx: Context) => Return<R> : never
};

export type QueryParameters<Q> = { [P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never };

type PromisifyObj<T> = { [P in keyof T]: PromisifyValue<T[P]> };
type Obj<T> = PromisifyObj<T> | Promise<PromisifyObj<T>> | (() => PromisifyObj<T>) | (() => Promise<PromisifyObj<T>>);
type PromisifyValue<T> = [T] extends [object] ? (T extends Date ? Date : Obj<T>) : T;

export type Return<T> = Promise<[T] extends [object] ? ([T] extends [Date] ? Date : PromisifyObj<T>) : T>;

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
