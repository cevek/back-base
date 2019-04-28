import mkdirp from 'mkdirp';
import { createWriteStream, fstatSync, openSync, renameSync, readFileSync } from 'fs';
import { dirname } from 'path';
import words from './words';
import { IncomingMessage, ClientRequest } from 'http';
import colors from 'colors';
import findUp from 'find-up';

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

interface LoggerSettings {
	streams: { level: Levels; file?: string; stdout?: boolean; rotate?: 'daily' }[];
}
export class Logger {
	protected files: {
		level: number;
		name: string;
		stdout: boolean;
		createdAt: Date;
		stream: NodeJS.WritableStream;
		dailyRotate: boolean;
	}[] = [];
	constructor(protected settings: LoggerSettings) {
		for (const stream of settings.streams) {
			const level = levels[stream.level];
			if (stream.file) {
				mkdirp.sync(dirname(stream.file));
				let createdAt = new Date();
				try {
					createdAt = fstatSync(openSync(stream.file, 'r')).ctime;
				} catch (e) {}
				const file = {
					level,
					name: stream.file,
					stream: createWriteStream(stream.file),
					createdAt,
					stdout: false,
					dailyRotate: stream.rotate === 'daily',
				};
				this.files.push(file);
			}
			if (stream.stdout) {
				this.files.push({
					level,
					stdout: true,
					name: 'stdout',
					stream: process.stdout,
					createdAt: new Date(),
					dailyRotate: false,
				});
			}
		}
		this.selectFile();
	}

	protected selectFile() {
		const d = new Date();
		for (const file of this.files) {
			if (file.dailyRotate) {
				const d2 = file.createdAt;
				if (d.getDate() !== d2.getDate() || d.getMonth() !== d2.getMonth() || d.getFullYear() !== d2.getFullYear()) {
					file.stream.end();
					const historyName =
						file.name.replace(/\.log$/, '') + '_' + file.createdAt.toISOString().split('T')[0] + '.log';
					renameSync(file.name, historyName);
					file.stream = createWriteStream(file.name);
					file.createdAt = new Date();
				}
			}
		}
	}

	protected log(type: Levels, name: string, json?: object) {
		this.selectFile();
		if (!(json instanceof Object)) json = { raw: json };
		const id = words[Math.floor(words.length * Math.random())];
		const parentId = '';
		const str = JSON.stringify([id, parentId, new Date(), type, name, json], jsonReplacer) + '\n';
		for (const file of this.files) {
			if (levels[type] <= file.level) {
				if (file.stdout) {
					let fn = colors.black;
					if (type === 'error') fn = colors.red;
					if (type === 'info') fn = colors.blue;
					if (type === 'warn') fn = colors.yellow;
					if (type === 'trace') fn = colors.gray;
					if (type === 'external') fn = colors.magenta;
					if (type === 'clientError') fn = colors.green;
					const dt = new Date();
					const dtS =
						('0' + dt.getHours()).substr(-2) +
						':' +
						('0' + dt.getMinutes()).substr(-2) +
						':' +
						('0' + dt.getSeconds()).substr(-2);
					file.stream.write(
						colors.gray(dtS + ' ' + type + ' ') +
							fn(name + ' ') +
							colors.gray(JSON.stringify(json, jsonReplacer, 2) + '\n'),
					);
				} else {
					file.stream.write(str);
				}
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

const env = process.env.NODE_ENV || 'production';
let settings: LoggerSettings | undefined;
for (const e of ['', '.local', env, env + '.local']) {
	try {
		settings = JSON.parse(readFileSync(projectDir + '/logger' + e + '.json', 'utf8'));
	} catch (e) {}
}
if (!settings) throw new Exception('Logger settings file is not found', { projectDir });
for (const stream of settings.streams) {
	if (!stream.file && !stream.stdout) {
		throw new Exception('Logger settings.streams: file or stdout should be specified', { stream });
	}
	if (stream.rotate && stream.rotate !== 'daily') {
		throw new Exception('Logger settings.streams: only daily rotate supports', { stream });
	}
}

export const logger = new Logger(settings);

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
