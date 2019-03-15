export type QueryResult<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R ? (args: Args, ctx: Context) => Return<R> : never
};

export type QueryParameters<Q> = { [P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never };

type PromisifyObj<T> = { [P in keyof T]: PromisifyValue<T[P]> };
type PromisifyValue<T> = [T] extends [object]
	? (T extends Date ? Date : PromisifyObj<T> | Promise<PromisifyObj<T>>)
	: T;

export type Return<T> = Promise<[T] extends [object] ? ([T] extends [Date] ? Date : PromisifyObj<T>) : T>;
