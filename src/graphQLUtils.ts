export type QueryResult<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R
		? (args: Args, ctx: Context) => Return<R>
		: never
};

export type QueryParameters<Q> = {
	[P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never
};

type PP<T> = T extends object
	? (T extends Promise<infer V>
			? Promise<PromisifyObject<V>>
			: (T extends Array<unknown>
					? Promise<PromisifyObject<T[number]>>[]
					: Promise<PromisifyObject<T>>))
	: T;
type PromisifyObject<T> = { [P in keyof T]: PP<T[P]> };
export type Return<T> = [T] extends [object] ? Promise<PromisifyObject<T>> : Promise<T>;

