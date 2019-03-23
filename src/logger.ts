import Logger from 'bunyan';
import { EventEmitter } from 'events';
import { PRODUCTION } from './config';
import { cleanStackTrace } from './cleanStackTrace';

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

class LogStream extends EventEmitter {
	writable = true;
	end() {}
	prevTime = new Date();
	formatTime(t: Date) {
		return `${('0' + t.getHours()).substr(-2)}:${('0' + t.getMinutes()).substr(-2)}:${('0' + t.getSeconds()).substr(
			-2,
		)}`;
	}
	formatDiff(time: Date, time2: Date) {
		const ms = time2.getTime() - time.getTime();
		if (ms > 60_000) return `+${(ms / 60_000).toPrecision(1)}min`;
		if (ms > 1000) return `+${(ms / 1000).toPrecision(1)}s`;
		return `+${Math.round(ms / 10) * 10}ms`;
	}
	write(b: string | Buffer) {
		const rec = (b as unknown) as {
			level: number;
			time: Date;
			v: string;
			pid: string;
			name: string;
			hostname: string;
			msg: object;
			err?: Error;
		};
		const levels = {
			fatal: ConsoleColor.RED,
			error: ConsoleColor.RED,
			info: ConsoleColor.BLUE,
			warn: ConsoleColor.YELLOW,
			debug: ConsoleColor.CYAN,
			trace: ConsoleColor.GRAY,
		} as const;
		const { name, level, hostname, pid, v, time, msg, err, ...other } = rec;
		let data = other;
		if (err instanceof JsonError) data = { ...other, ...err.json };
		console.log(
			`${color(this.formatTime(new Date(+rec.time)), ConsoleColor.GRAY)} ${color(
				Logger.nameFromLevel[level],
				levels[Logger.nameFromLevel[level] as keyof typeof levels],
			)}`,
			msg,
			Object.keys(data).length === 0 ? '' : data,
			err ? `\n${cleanStackTrace(err.stack)}` : '',
		);
		this.prevTime = rec.time;
		return true;
	}
}

const prodStream = {
	stream: process.stdout,
};
const devStream = {
	type: 'raw',
	stream: new LogStream(),
};

export const logger = new Logger({
	name: 'app',
	streams: [PRODUCTION ? prodStream : devStream],
	serializers: {
		err: err => err,
	},
});
