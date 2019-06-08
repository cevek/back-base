import _ from 'lodash';

export function mergeWithEnvConfigs<T>(resolver: (path: string) => string, configFiles: string[], config: T): T {
	for (const file of configFiles) {
		let filename;
		try {
			filename = resolver(file);
		} catch (e) {
			continue;
		}
		_.merge(config, require(filename).default);
	}
	return config;
}
