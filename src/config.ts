import { getEnvNullable } from "./utils";

export const config = {
	secret: 'ertwer$#%$@ED',
};

export const ENV = getEnvNullable('NODE_ENV') || 'development';
export const PRODUCTION = ENV === 'production';
