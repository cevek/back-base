export type QueryResult<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R ? (args: Args, ctx: Context) => Return<R> : never
};

export type QueryParameters<Q> = { [P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never };

type PromisifyObj<T> = { [P in keyof T]: PromisifyValue<T[P], T[P]> };
type PromisifyValue<T, Raw> = [T] extends [object]
	? T extends Array<unknown>
		? Promise<PromisifyObj<T>>
		: (T extends Date ? Raw : PromisifyObj<T> | Promise<PromisifyObj<T>>)
	: Raw;

export type Return<T> = PromisifyValue<T, Promise<T>>;

