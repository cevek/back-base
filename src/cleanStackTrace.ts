'use strict';
const extractPathRegex = /\s+at.*?\((.*?)\)/;
// const pathRegex2 = /^(((node|(internal\/[\w/]*|.*node_modules\/(babel-polyfill|ts-node)\/.*)?\w+)\.js:\d+:\d+)|native)/;
const pathRegex = /^internal|(.*?\/node_modules\/(ts-node)\/)/;
// const homeDir = os.homedir();

export function cleanStackTrace(stack: string | undefined) {
	if (!stack) return;
	return (
		stack
			.replace(/\\/g, '/')
			.split('\n')
			.filter(line => {
				const pathMatches = line.match(extractPathRegex);
				if (pathMatches === null) return true;
				const match = pathMatches[1];
				return !pathRegex.test(match);
			})
			.filter(line => line.trim() !== '')
			// .map(line => line.replace(extractPathRegex, (m, p1) => m.replace(p1, p1.replace(homeDir, '~'))))
			.join('\n')
	);
}
