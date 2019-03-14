export type QueryResult<T, Context> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R
		? (args: Args, ctx: Context) => [R] extends [Array<infer RR>] ? ReturnArray<RR> : Return<R>
		: never
};

export type QueryParameters<Q> = { [P in keyof Q]: Q[P] extends (args: infer Args) => unknown ? Args : never };

type PP<T> = T extends object
	? (T extends Promise<infer V>
			? Promise<PromisifyObject<V>>
			: (T extends Array<unknown>
					? Promise<PromisifyObject<T[number]>>[]
					: T extends Date
					? Date
					: Promise<PromisifyObject<T>>))
	: T;
export type PromisifyObject<T> = { [P in keyof T]: PP<T[P]> };
export type Return<T> = [T] extends [object] ? Promise<PromisifyObject<T>> : Promise<T>;
export type ReturnArray<T> = [T] extends [object] ? Promise<PromisifyObject<T>[]> : Promise<T[]>;
