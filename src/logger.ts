import mkdirp from 'mkdirp';
import { createWriteStream, fstatSync, openSync, renameSync } from 'fs';
import { dirname } from 'path';
import words from './words';
import { IncomingMessage, ClientRequest } from 'http';
import colors from 'colors';
import findUp from 'find-up';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import nodemailer from 'nodemailer';

export class BaseException<T> extends Error {
	kind: string;
	constructor(public name: string, public json = {} as T) {
		super();
		this.kind = new.target.name;
	}
}
export class ClientException<T = object> extends BaseException<T> {}
export class ExternalException<T = object> extends BaseException<T> {}
export class Exception<T = object> extends BaseException<T> {}

type Levels = keyof typeof levels;

type LoggerStreamConfig =
	| { level: Levels; type: 'file'; file: string; rotate?: 'daily' }
	| { level: Levels; type: 'stdout' }
	| {
			level: Levels;
			type: 'email';
			options: SMTPTransport.Options;
			from: string;
			to: string;
			subject: { start: string; error: string };
	  };
export interface LoggerSettings {
	streams: LoggerStreamConfig[];
}
export class Logger {
	protected streams: LoggerStream[] = [];
	constructor(protected settings: LoggerSettings) {
		if (settings.streams.length === 0) throw new Exception('Empty logger streams', { settings });
		for (const streamConfig of settings.streams) {
			const level = levels[streamConfig.level];
			if (streamConfig.type === 'file') {
				this.streams.push(new FileStream(level, streamConfig));
			}
			if (streamConfig.type === 'stdout') {
				this.streams.push(new StdoutStream(level, streamConfig));
			}
			if (streamConfig.type === 'email') {
				this.streams.push(new EmailStream(level, streamConfig));
			}
		}
	}

	protected log(type: Levels, name: string, json?: object) {
		if (!(json instanceof Object)) json = { raw: json };
		const id = words[Math.floor(words.length * Math.random())];
		const parentId = '';
		const date = new Date();
		for (const stream of this.streams) {
			if (levels[type] <= stream.level) {
				stream.write(id, parentId, date, type, name, json);
			}
		}
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

abstract class LoggerStream {
	constructor(public level: number) {}
	abstract write(id: string, parentId: string, date: Date, type: Levels, name: string, json: object): void;
}
class EmailStream extends LoggerStream {
	constructor(
		level: number,
		public options: {
			options: SMTPTransport.Options;
			from: string;
			to: string;
			subject: { start: string; error: string };
		},
	) {
		super(level);
		this.sendMail(this.options.subject.start, '');
	}
	transport = nodemailer.createTransport(this.options.options);
	lastSendedAt = new Date(0);

	sendMail(subject: string, text: string) {
		this.transport
			.sendMail({
				to: this.options.to,
				from: this.options.from,
				subject,
				text,
			})
			.catch(err => logger.error(err));
	}

	write(_id: string, _parentId: string, date: Date, type: Levels, name: string, json: object): void {
		if (Date.now() - this.lastSendedAt.getTime() < 3_600_000) return;
		this.sendMail(
			this.options.subject.error,
			`${date.toISOString()} ${type} ${name} ${JSON.stringify(json, jsonReplacer, 2)}`,
		);
		this.lastSendedAt = new Date();
	}
}
class FileStream extends LoggerStream {
	createdAt: Date;
	stream: NodeJS.WritableStream;
	rotate: 'daily' | 'never';
	fileName: string;

	constructor(level: number, public options: { file: string; rotate?: 'daily' }) {
		super(level);
		mkdirp.sync(dirname(options.file));
		let createdAt = new Date();
		try {
			createdAt = fstatSync(openSync(options.file, 'r')).ctime;
		} catch (e) {}
		this.stream = createWriteStream(options.file);
		this.createdAt = createdAt;
		this.rotate = options.rotate || 'never';
		this.fileName = options.file;
	}

	protected selectFile() {
		const d = new Date();
		if (this.rotate === 'daily') {
			const d2 = this.createdAt;
			if (d.getDate() !== d2.getDate() || d.getMonth() !== d2.getMonth() || d.getFullYear() !== d2.getFullYear()) {
				this.stream.end();
				const historyName =
					this.fileName.replace(/\.log$/, '') + '_' + this.createdAt.toISOString().split('T')[0] + '.log';
				renameSync(this.fileName, historyName);
				this.stream = createWriteStream(this.fileName);
				this.createdAt = new Date();
			}
		}
	}

	write(id: string, parentId: string, date: Date, type: Levels, name: string, json: object) {
		this.selectFile();
		const str = JSON.stringify([id, parentId, date, type, name, json], jsonReplacer) + '\n';
		this.stream.write(str);
	}
}
class StdoutStream extends LoggerStream {
	constructor(level: number, _options: {}) {
		super(level);
	}
	write(_id: string, _parentId: string, date: Date, type: Levels, name: string, json: object) {
		let fn = colors.black;
		if (type === 'error') fn = colors.red.bold;
		if (type === 'info') fn = colors.cyan;
		if (type === 'warn') fn = colors.yellow;
		if (type === 'trace') fn = colors.gray;
		if (type === 'external') fn = colors.magenta;
		if (type === 'clientError') fn = colors.green;
		const dtS =
			('0' + date.getHours()).substr(-2) +
			':' +
			('0' + date.getMinutes()).substr(-2) +
			':' +
			('0' + date.getSeconds()).substr(-2);
		process.stdout.write(
			colors.gray(dtS + ' ' + type + ' ') + fn(name + ' ') + colors.gray(JSON.stringify(json, jsonReplacer, 2) + '\n'),
		);
	}
}

function jsonReplacer(_key: string, value: unknown) {
	if (value instanceof Error) {
		const stack = cleanStackTrace(value.stack);
		if (value instanceof BaseException) {
			return { name: value.name, stack, json: value.json };
		}
		return { ...value, error: value.message, stack };
	}
	if (value instanceof IncomingMessage) {
		return { __type: 'responseObject' };
	}
	if (value instanceof Promise) {
		return { __type: 'promise' };
	}
	if (value instanceof Buffer) {
		return { __type: 'buffer' };
	}
	if (value instanceof ClientRequest) {
		return { __type: 'requestObject' };
	}
	return value;
}

const levels = {
	error: 0,
	warn: 1,
	external: 2,
	info: 3,
	clientError: 4,
	trace: 5,
};

const packageJsonFile = findUp.sync('package.json', { cwd: require.main!.filename });
if (!packageJsonFile) throw new Exception('package.json is not found');
const projectDir = dirname(packageJsonFile);
export const logger = new Logger(require(projectDir + '/logger.ts').default);

// export const logger = new Logger(settings);

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
