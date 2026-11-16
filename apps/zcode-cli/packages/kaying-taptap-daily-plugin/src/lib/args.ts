export interface ParsedArgs {
  values: Record<string, string | boolean>;
  positionals: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      values[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values[withoutPrefix] = next;
      index += 1;
    } else {
      values[withoutPrefix] = true;
    }
  }
  return { values, positionals };
}

export function requireStringArg(args: ParsedArgs, name: string): string {
  const value = args.values[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing required --${name}`);
  }
  return value;
}

export function optionalStringArg(args: ParsedArgs, name: string, fallback: string): string {
  const value = args.values[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function optionalNumberArg(args: ParsedArgs, name: string, fallback: number): number {
  const value = args.values[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`--${name} requires a number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} requires a number, got: ${value}`);
  return parsed;
}

export function booleanArg(args: ParsedArgs, name: string): boolean {
  return args.values[name] === true || args.values[name] === "true" || args.values[name] === "1";
}
