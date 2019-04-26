import mkdirp from 'mkdirp';
import { createWriteStream, WriteStream } from 'fs';
import { dirname } from 'path';
import words from './words';
import { getEnv } from './utils';
import { IncomingMessage, ClientRequest } from 'http';

export class BaseException extends Error {
	kind: string;
	constructor(public name: string, public json: object = {}) {
		super(`${new.target.name}: ${name}`);
		this.kind = new.target.name;
	}
}
export class ClientException extends BaseException {}
export class ExternalException extends BaseException {}
export class Exception extends BaseException {}

export class Logger {
	protected file: WriteStream;
	constructor(fileName: string) {
		mkdirp.sync(dirname(fileName));
		this.file = createWriteStream(fileName);
	}
	protected log(type: string, name: string, json?: object) {
		if (!(json instanceof Object)) json = { raw: json };
		const id = words[Math.floor(words.length * Math.random())];
		const parentId = '';
		const str = JSON.stringify([id, parentId, new Date(), type, name, json], (_key, value) => {
			if (value instanceof Error) {
				const stack = cleanStackTrace(value.stack);
				if (value instanceof BaseException) {
					return { name: value.name, stack, json: value.json };
				}
				return { message: value.message, stack };
			}
			if (value instanceof IncomingMessage) {
				return { __type: 'responseObject' };
			}
			if (value instanceof ClientRequest) {
				return { __type: 'requestObject' };
			}
			return value;
		});
		this.file.write(str);
		console.log(str);
	}

	info(name: string, json?: object) {
		return this.log('info', name, json);
	}
	clientError(name: string, json?: object) {
		return this.log('clientError', name, json);
	}
	warn(name: string, json?: object) {
		return this.log('warn', name, json);
	}
	trace(name: string, json?: object) {
		return this.log('trace', name, json);
	}
	args(args?: object) {
		return this.log('trace', 'args', args);
	}
	error(name: string | Error, json?: object) {
		if (name instanceof Error) {
			const error = name;
			if (error instanceof BaseException) {
				if (error.kind === ClientException.name) {
					return this.clientError(error.name, error);
				}
				if (error.kind === ExternalException.name) {
					return this.external(error.name, error);
				}
				if (error.kind === Exception.name) {
					return this.log('error', error.name, error);
				}
			}
			return this.log('error', error.constructor.name, error);
		}
		if (typeof name !== 'string') {
			return this.log('error', 'Raw error', (name as {}) instanceof Object ? name : { error: name });
		}
		return this.log('error', name, json);
	}
	external(name: string, json?: object) {
		return this.log('external', name, json);
	}
}

export const logger = new Logger(getEnv('LOG_FILE'));

const extractPathRegex = /\s+at.*?\((.*?)\)/;
const pathRegex = /^internal|(.*?\/node_modules\/(ts-node)\/)/;
export function cleanStackTrace(stack: string | undefined) {
	if (!stack) return;
	return stack
		.replace(/\\/g, '/')
		.split('\n')
		.filter(line => {
			const pathMatches = line.match(extractPathRegex);
			if (pathMatches === null) return true;
			const match = pathMatches[1];
			return !pathRegex.test(match);
		})
		.filter(line => line.trim() !== '')
		.join('\n');
}
