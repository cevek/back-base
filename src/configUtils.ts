import _ from 'lodash';

export function mergeWithEnvConfigs<T>(resolver: (path: string) => string, configFiles: string[], config: T): T {
	for (const file of configFiles) {
		try {
			_.merge(config, require(resolver(file)).default);
		} catch (e) {}
	}
	return config;
}
