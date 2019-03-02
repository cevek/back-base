export enum Errors {
	YouAreAlreadyLogged = 'YouAreAlreadyLogged',
	ValidationFailed = 'ValidationFailed',
	EntityNotFound = 'EntityNotFound',
	AuthRequired = "AuthRequired",
	UserAlreadyExists = "UserAlreadyExists"
}

export class ClientError extends Error {
	constructor(public id: Errors, public msg?: string) {
		super(`${id}${msg ? `: ${msg}` : ''}`);
	}
}

export class NotFoundError extends ClientError {
	constructor(msg: string) {
		super(Errors.EntityNotFound, msg);
	}
}
