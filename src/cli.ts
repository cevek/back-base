#!/usr/bin/env node
import fs from 'fs-extra';
import { execSync } from 'child_process';

const [, , ...args] = process.argv;

async function main() {
	if (args[0] === 'init') {
		const dir = process.cwd();
		await fs.copy(__dirname + '/../template/', dir);
		await fs.rename(dir + '/_tsconfig.json', dir + '/tsconfig.json');
		execSync('npm install');
		// execSync('npm link back-base');
		try {
            execSync('git init');
            execSync('git add .');
		} catch (e) {}
	}
}
main().catch(err => console.error(err));
