import { DBUser } from '../db/db.schema';
import { ClientError, Errors } from '../errors';
import { Query, Mutation } from './schema';
import { Context, ContextWithUser } from '../utils';

export type QueryArg<Name extends keyof Query> = Parameters<Query[Name]>[0];
export type MutArgs<Name extends keyof Mutation> = Parameters<Mutation[Name]>[0];
export type QueryResult<T> = {
	[P in keyof T]: T[P] extends (args: infer Args) => infer R
		? (args: Args, ctx: ContextWithUser) => Promise<R>
		: never
};

export function promiseAll<T>(arr: Promise<T>[]) {
	return (Promise.all(arr) as never) as T[];
}

export function withAuth<Arg, T>(cb: (arg: Arg, ctx: ContextWithUser) => Promise<T>) {
	return (args: Arg, req: Context | ContextWithUser) => {
		if (req.session.user === undefined) throw new ClientError(Errors.AuthRequired);
		return cb(args, req as ContextWithUser);
	};
}

