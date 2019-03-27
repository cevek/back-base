import Logger, { LogLevel } from 'bunyan';
import { EventEmitter } from 'events';
import { cleanStackTrace } from './cleanStackTrace';
import { getEnvNullable, getEnv } from './utils';
import { inspect } from 'util';
import { createWriteStream, WriteStream, existsSync } from 'fs';
import { dirname } from 'path';
const mkdirp = require('mkdirp');

export class JsonError extends Error {
	constructor(msg: string, public json: object) {
		super(msg);
	}
}

enum ConsoleColor {
	GRAY = 0,
	RED = 1,
	GREEN = 2,
	YELLOW = 3,
	BLUE = 4,
	MAGENTA = 5,
	CYAN = 6,
}
function color(text: string, color: ConsoleColor) {
	return '\u001b[3' + color + ';1m' + text + '\u001b[0m';
}

const levels = {
	fatal: ConsoleColor.RED,
	error: ConsoleColor.RED,
	info: ConsoleColor.BLUE,
	warn: ConsoleColor.YELLOW,
	debug: ConsoleColor.CYAN,
	trace: ConsoleColor.GRAY,
} as const;

interface Rec {
	level: number;
	time: Date;
	v: string;
	pid: string;
	name: string;
	hostname: string;
	msg: string;
	err?: Error;
}

class StdoutStream extends EventEmitter {
	writable = true;
	end() {}
	prevTime = new Date();

	write(b: string | Buffer) {
		const rec = (b as unknown) as Rec;
		const { name, level, hostname, pid, v, time, msg, err, ...other } = rec;
		let data = other;
		if (err instanceof JsonError) data = { ...other, ...err.json };
		this.out(level, rec.time, msg, data, rec.err);
		this.prevTime = rec.time;
		return true;
	}

	out(level: number, time: Date, msg: string, data: object, err?: Error) {
		console.log(
			`${color(formatTime(new Date(+time)), ConsoleColor.GRAY)} ${color(
				Logger.nameFromLevel[level],
				levels[Logger.nameFromLevel[level] as keyof typeof levels],
			)}`,
			msg,
			Object.keys(data).length === 0 ? '' : inspect(data, { compact: false, depth: 20, colors: true }),
			err ? `\n${cleanStackTrace(err.stack)}` : '',
		);
	}
}

class FileStream extends StdoutStream {
	private fileStream: WriteStream;
	constructor(private fileName: string) {
		super();
		mkdirp.sync(dirname(this.fileName));
		this.fileStream = createWriteStream(this.fileName);
	}
	out(level: number, time: Date, msg: string, data: object, err?: Error) {
		const json = Object.keys(data).length === 0 ? '' : inspect(data, { compact: false, depth: 20, colors: true });
		const errStack = err ? `\n${cleanStackTrace(err.stack)}` : '';
		const d = new Date(+time);
		this.fileStream.write(
			`${formatDate(d)} ${formatTime(d)} ${Logger.nameFromLevel[level]} ${msg}${json}${errStack}\n\n`,
		);
	}
}

function formatTime(t: Date) {
	return `${('0' + t.getHours()).substr(-2)}:${('0' + t.getMinutes()).substr(-2)}:${('0' + t.getSeconds()).substr(-2)}`;
}
function formatDate(t: Date) {
	return `${t.getFullYear()}-${('0' + (t.getMonth() + 1)).substr(-2)}-${('0' + t.getDate()).substr(-2)}`;
}
function formatDiff(time: Date, time2: Date) {
	const ms = time2.getTime() - time.getTime();
	if (ms > 60_000) return `+${(ms / 60_000).toPrecision(1)}min`;
	if (ms > 1000) return `+${(ms / 1000).toPrecision(1)}s`;
	return `+${Math.round(ms / 10) * 10}ms`;
}

const errorLogFile = getEnv('ERROR_LOG_FILE');
const traceLogFile = getEnv('TRACE_LOG_FILE');
const logLevel = (getEnvNullable('LOG_LEVEL') || 'info') as LogLevel;

export const logger = new Logger({
	name: 'app',
	streams:
		process.env.NODE_ENV === 'production'
			? [
					{
						level: 'error' as LogLevel,
						type: 'raw',
						stream: new FileStream(errorLogFile),
					},
					{
						level: 'trace' as LogLevel,
						type: 'raw',
						stream: new FileStream(traceLogFile),
					},
					{
						level: logLevel,
						type: 'raw',
						stream: new StdoutStream(),
					},
			  ]
			: [
					{
						type: 'raw',
						level: (getEnvNullable('LOG_LEVEL') || 'info') as LogLevel,
						stream: new StdoutStream(),
					},
			  ],
	serializers: {
		err: err => err,
	},
});
