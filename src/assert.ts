import { ClientException, Exception } from './logger';

type NumberContraints = { min?: number; max?: number };
type StringContraints = { minLen?: number; maxLen?: number; regexp?: RegExp };

export class Assert {
	constructor(protected ErrorFactory: typeof ClientException) {}

	protected error(name: string, json: object) {
		throw new this.ErrorFactory(name, json);
	}

	protected valueidateNumber(value: number, constraints: NumberContraints | undefined) {
		if (typeof value !== 'number') this.error('Value is not a number', { value });
		if (Number.isNaN(value)) this.error('Value is NaN', { value });
		if (!Number.isFinite(value)) this.error('Value is not finite', { value });
		if (constraints !== undefined) {
			this.between(value, constraints.min, constraints.max, 'Value');
		}
	}

	protected between(value: number, min: number | undefined, max: number | undefined, error: string) {
		if (min !== undefined && min > value) this.error(error + ' should be >= ', { min, value });
		if (max !== undefined && max < value) this.error(error + ' should be <= ', { max, value });
	}

	protected valueidateUnsigned(value: number) {
		if (value < 0) this.error('Value should be positive', { value });
	}

	protected valueidateInt(value: number) {
		if (value !== Math.ceil(value)) this.error('Value should be integer', { value });
	}

	signedFloat(value: number, constraints?: NumberContraints) {
		this.valueidateNumber(value, constraints);
		return value;
	}
	signedFloatNullable(value: number | undefined, constraints?: NumberContraints) {
		if (value !== undefined) this.signedFloat(value, constraints);
		return value;
	}
	positiveFloat(value: number, constraints?: NumberContraints) {
		this.valueidateNumber(value, constraints);
		this.valueidateUnsigned(value);
		return value;
	}
	positiveFloatNullable(value: number | undefined, constraints?: NumberContraints) {
		if (value !== undefined) this.positiveFloat(value, constraints);
		return value;
	}
	signedInt(value: number, constraints?: NumberContraints) {
		this.valueidateNumber(value, constraints);
		this.valueidateInt(value);
		return value;
	}
	positiveIntNullable(value: number | undefined, constraints?: NumberContraints) {
		if (value !== undefined) this.signedInt(value, constraints);
		return value;
	}
	positiveInt(value: number, constraints?: NumberContraints) {
		this.valueidateNumber(value, constraints);
		this.valueidateInt(value);
		this.valueidateUnsigned(value);
		return value;
	}
	signedIntNullable(value: number | undefined, constraints?: NumberContraints) {
		if (value !== undefined) this.positiveInt(value, constraints);
		return value;
	}
	string(value: string, constraints?: StringContraints) {
		if (typeof value !== 'string') this.error('Value is not a string', { value });
		if (constraints !== undefined) {
			this.between(value.length, constraints.minLen, constraints.maxLen, 'String length');
			if (constraints.regexp !== undefined && constraints.regexp.test(value)) {
				this.error('String is not valueidated by regexp ', { regexp: constraints.regexp.toString(), value });
			}
		}
		return value;
	}
	stringNullable(value: string | undefined, constraints?: StringContraints) {
		if (value !== undefined) this.string(value, constraints);
		return value;
	}
	noEmptyString(value: string, constraints?: StringContraints) {
		this.string(value, constraints);
		if (value === '') this.error('String should not be empty', { value });
		return value;
	}
	noEmptyStringNullable(value: string | undefined, constraints?: StringContraints) {
		if (value !== undefined) this.noEmptyString(value, constraints);
		return value;
	}
	date(value: Date, constraints?: { min?: Date; max?: Date }) {
		if (!(value instanceof Date)) this.error('Value is not a date', { value });
		if (Number.isNaN(value.getTime())) this.error('Date is invalueid', { value });
		if (constraints !== undefined) {
			this.between(
				value.getTime(),
				constraints.min !== undefined ? constraints.min.getTime() : undefined,
				constraints.max !== undefined ? constraints.max.getTime() : undefined,
				'Date',
			);
		}
		return value;
	}
	dateNullable(value: Date | undefined, constraints?: { min?: Date; max?: Date }) {
		if (value !== undefined) this.date(value, constraints);
		return value;
	}
	array<T>(value: T[], constraints?: { minSize?: number; maxSize?: number }) {
		if (!Array.isArray(value)) this.error('Value is not an array', { value });
		if (constraints !== undefined) this.between(value.length, constraints.minSize, constraints.maxSize, 'Array.length');
		return value;
	}
	arrayNullable<T>(value: T[] | undefined, constraints?: { minSize?: number; maxSize?: number }) {
		if (value !== undefined) this.array(value, constraints);
		return value;
	}
	noEmptyArray<T>(value: T[], constraints?: { minSize?: number; maxSize?: number }) {
		this.array(value, constraints);
		if (value.length === 0) this.error('Array should have elements', { value });
		return value;
	}
	noEmptyArrayNullable<T>(value: T[] | undefined, constraints?: { minSize?: number; maxSize?: number }) {
		if (value !== undefined) this.noEmptyArray(value, constraints);
		return value;
	}
	bool(value: boolean) {
		if (typeof value !== 'boolean') this.error('Value is not a boolean', { value });
		return value;
	}
	boolNullable(value: boolean | undefined) {
		if (value !== undefined) this.bool(value);
		return value;
	}
	email(value: string) {
		this.string(value);
		if (!/^\S+@\S+$/.test(value)) this.error('Value is an incorrect email', { value });
		return value;
	}
	emailNullable(value: string | undefined) {
		if (value !== undefined) this.email(value);
		return value;
	}
	object<T extends object>(value: T) {
		if (typeof value !== 'object' || value === null) this.error('Value is not an object', { value });
		return value;
	}
	objectNullable<T extends object>(value: T | undefined) {
		if (value !== undefined) this.object(value);
		return value;
	}
	noEmptyObject<T extends object>(value: T) {
		this.object(value);
		if (Object.keys(value).length === 0) this.error('Object should have elements', { value });
		return value;
	}
	noEmptyObjectNullable<T extends object>(value: T | undefined) {
		if (value !== undefined) this.noEmptyObject(value);
		return value;
	}
	union<T>(value: T & {}, union: T[]) {
		if (!union.includes(value)) this.error(`Union doesn't have specified element`, { value });
		return value;
	}
	unionNullable<T>(value: T | undefined, union: T[]) {
		if (value !== undefined) this.union(value, union);
		return value;
	}
	enum(value: number | string, Enum: { [key: number]: string }) {
		if (Enum[value as number] === undefined) this.error(`Enum doesn't have specified element`, { value });
		return value;
	}
	enumNullable(value: number | string | undefined, Enum: { [key: number]: string }) {
		if (value !== undefined) this.enum(value, Enum);
		return value;
	}
}

export const assert = new Assert(Exception);
export const clientValidation = new Assert(ClientException);
