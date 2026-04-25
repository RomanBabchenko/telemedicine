import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

type WhenPredicate = (object: Record<string, unknown>) => boolean;

interface AtLeastOneOfOptions extends ValidationOptions {
  when?: WhenPredicate;
}

const isPresent = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

export function AtLeastOneOf<T extends object>(
  fields: ReadonlyArray<keyof T & string>,
  options?: AtLeastOneOfOptions,
) {
  return function (target: object, propertyKey: string | symbol) {
    registerDecorator({
      name: 'atLeastOneOf',
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      constraints: [fields, options?.when],
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [fieldNames, when] = args.constraints as [string[], WhenPredicate | undefined];
          const obj = args.object as Record<string, unknown>;
          if (when && !when(obj)) return true;
          return fieldNames.some((f) => isPresent(obj[f]));
        },
        defaultMessage(args: ValidationArguments): string {
          const [fieldNames] = args.constraints as [string[]];
          return `At least one of [${fieldNames.join(', ')}] is required`;
        },
      },
    });
  };
}
