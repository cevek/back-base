import { DBUser } from '../db/db.schema';
import { ReqWithUser } from '..';
import { ClientError, Errors } from '../errors';
import { Query, Mutation } from './schema';

export type QueryArg<Name extends keyof Query> = Parameters<Query[Name]>[0];
export type MutationArg<Name extends keyof Mutation> = Parameters<Mutation[Name]>[0];

export function promiseAll<T>(arr: Promise<T>[]) {
	return (Promise.all(arr) as never) as T[];
}

export function method<Arg, T>(
	cb: (arg: Arg, user: DBUser | undefined, ctx: ReqWithUser) => Promise<T> | undefined,
) {
	return (args: Arg, ctx?: ReqWithUser) => {
		const user = ctx!.user;
		return (cb(args, user, ctx!) as unknown) as T;
	};
}

export function authZone<Arg, T>(
	cb: (arg: Arg, user: DBUser, ctx: ReqWithUser) => Promise<T> | undefined,
) {
	return (args: Arg, ctx?: ReqWithUser) => {
		const user = ctx!.user;
		if (!user) throw new ClientError(Errors.AuthRequired);
		return (cb(args, user, ctx!) as unknown) as T;
	};
}
