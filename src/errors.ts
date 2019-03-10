export class BaseClientError<Errors> extends Error {
	constructor(public id: Errors, public msg?: string) {
		super(`${id}${msg ? `: ${msg}` : ''}`);
	}
}
