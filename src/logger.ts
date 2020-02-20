import mkdirp from 'mkdirp';
import { createWriteStream, fstatSync, openSync, renameSync } from 'fs';
import { dirname } from 'path';
import words from './words';
import colors from 'colors';
import findUp from 'find-up';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import nodemailer from 'nodemailer';
import { Logging as GoogleStackDriver, LoggingOptions as GoogleStackDriverOptions } from '@google-cloud/logging';
import { never } from './utils';

export class BaseException<T> extends Error {
	kind: string;
	constructor(public name: string, public json = {} as T) {
		super();
		// eslint-disable-next-line @typescript-eslint/tslint/config
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
	| { level: Levels; type: 'stackdriver'; options: GoogleStackDriverOptions; logName: string }
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
	constructor(settings: LoggerSettings) {
		this.setSettings(settings);
	}

	protected setSettings(settings: LoggerSettings) {
		for (const streamConfig of settings.streams) {
			const level = levels[streamConfig.level];
			if (streamConfig.type === 'file') {
				logger.streams.push(new FileStream(level, streamConfig));
			}
			if (streamConfig.type === 'stdout') {
				logger.streams.push(new StdoutStream(level, streamConfig));
			}
			if (streamConfig.type === 'email') {
				logger.streams.push(new EmailStream(level, streamConfig));
			}
			if (streamConfig.type === 'stackdriver') {
				logger.streams.push(new StackDriverStream(level, streamConfig.logName, streamConfig.options));
			}
		}
	}

	protected log(type: Levels, name: string, json?: object) {
		if (this.streams.length === 0) throw new Exception('Empty logger streams');
		if (json === undefined) json = {};
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
		// eslint-disable-next-line @typescript-eslint/tslint/config
		if (typeof name !== 'string') {
			return this.log('error', 'Raw error', (name as {}) instanceof Object ? name : { error: name });
		}
		return this.log('error', name, json);
	}
	external(name: string, json?: object) {
		return this.log('external', name, json);
	}
}

class LoggerOpened extends Logger {
	setSettings(_settings: LoggerSettings) {}
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
	previousLogsCount = 0;

	sendMail(subject: string, text: string) {
		this.transport
			.sendMail({
				to: this.options.to,
				from: this.options.from,
				subject,
				text,
			})
			.catch((err: Error) => logger.error(err));
	}

	write(_id: string, _parentId: string, date: Date, type: Levels, name: string, json: object): void {
		if (Date.now() - this.lastSendedAt.getTime() < 3_600_000) {
			this.previousLogsCount++;
			return;
		}
		this.sendMail(
			this.options.subject.error,
			`${
				this.previousLogsCount > 0 ? `Prev errors count: ${this.previousLogsCount}\n` : ''
			}${date.toISOString()} ${type} ${name} ${JSON.stringify(json, jsonReplacer, 2)}`,
		);
		this.lastSendedAt = new Date();
		this.previousLogsCount = 0;
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
		this.stream = createWriteStream(options.file, { flags: 'a' });
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
			`0${date.getHours()}`.substr(-2) +
			':' +
			`0${date.getMinutes()}`.substr(-2) +
			':' +
			`0${date.getSeconds()}`.substr(-2);
		process.stdout.write(
			colors.gray(dtS + ' ' + type + ' ') + fn(name + ' ') + colors.gray(JSON.stringify(json, jsonReplacer, 2) + '\n'),
		);
	}
}
class StackDriverStream extends LoggerStream {
	protected log = new GoogleStackDriver(this.options).log(this.logName);
	constructor(level: number, protected logName: string, protected options: GoogleStackDriverOptions) {
		super(level);
	}
	write(_id: string, _parentId: string, _date: Date, type: Levels, name: string, json: object) {
		const preparedJson = JSON.parse(JSON.stringify(json, jsonReplacer)) as {};
		const entry = this.log.entry([name, preparedJson]);
		if (type === 'error') return this.log.error(entry);
		if (type === 'info') return this.log.info(entry);
		if (type === 'warn') return this.log.warning(entry);
		if (type === 'trace') return this.log.info(entry);
		if (type === 'external') return this.log.warning(entry);
		if (type === 'clientError') return this.log.notice(entry);
		never(type);
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
	if (value instanceof Object) {
		if ('request' in value && 'headers' in value && 'body' in value && 'statusCode' in value) {
			return { __type: 'responseObject' };
		}
		if ('method' in value && 'uri' in value && 'headers' in value) {
			return { __type: 'requestObject' };
		}
		if (value instanceof Promise) {
			return { __type: 'promise' };
		}
		if (value instanceof Buffer) {
			return { __type: 'buffer' };
		}
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
export const logger = new Logger({ streams: [] });

const extractPathRegex = /\s+at.*?\((.*?)\)/;
const pathRegex = /^internal|(.*?\/node_modules\/(ts-node)\/)/;
function cleanStackTrace(stack: string | undefined) {
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

export function setLoggerSettings(settings: LoggerSettings) {
	(logger as LoggerOpened).setSettings(settings);
}
