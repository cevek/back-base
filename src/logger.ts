import Logger from 'bunyan';
import { EventEmitter } from 'events';

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
		const rec = (b as unknown) as { level: number; time: Date; msg: object };
		const levels = {
			error: ConsoleColor.RED,
			info: ConsoleColor.BLUE,
			warn: ConsoleColor.YELLOW,
			debug: ConsoleColor.CYAN,
        } as const;
		console.log(
			`${color(this.formatTime(new Date(+rec.time)), ConsoleColor.GRAY)} ${color(
				Logger.nameFromLevel[rec.level],
				levels[Logger.nameFromLevel[rec.level] as keyof typeof levels],
			)}`,
			rec.msg,
		);
		this.prevTime = rec.time;
		return true;
	}
}
export const logger = new Logger({
	name: 'app',
	streams: [
		{
            type: 'raw',
			stream: new LogStream(),
		},
	],
});
