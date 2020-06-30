import fs from 'fs';
import execa from 'execa';
import { join } from 'path';
import { snakeCase } from 'snake-case';
import {
	AnalyzeOptions,
	BuildOptions,
	Env,
	glob,
	download,
	createLambda,
	shouldServe
} from '@vercel/build-utils';

// `chmod()` is required for usage with `vercel-dev-runtime`
// since file mode is not preserved in Vercel deployments.
fs.chmodSync(join(__dirname, 'build.sh'), 0o755);
fs.chmodSync(join(__dirname, 'bootstrap'), 0o755);

// From this list: https://import.pw/importpw/import/docs/config.md
const allowedConfigImports = new Set([
	'CACHE',
	'CURL_OPTS',
	'DEBUG',
	'RELOAD',
	'SERVER'
]);

export const version = 3;

export { shouldServe };

export function analyze({ files, entrypoint }: AnalyzeOptions) {
	return files[entrypoint].digest;
}

export async function build({
	workPath,
	files,
	entrypoint,
	meta = {},
	config = {}
}: BuildOptions) {
	const configEnv: Env = {};
	const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;
	const distPath = join(devCacheDir, 'bash', entrypoint);

	await download(files, workPath, meta);

	for (const [key, val] of Object.entries(config)) {
		const name = snakeCase(key).toUpperCase();
		if (typeof val === 'string' && allowedConfigImports.has(name)) {
			configEnv[`IMPORT_${name}`] = val;
		}
	}

	if (config && config.import) {
		for (const key of Object.keys(config.import)) {
			const name = snakeCase(key).toUpperCase();
			configEnv[`IMPORT_${name}`] = config.import[key];
		}
	}

	const IMPORT_CACHE = `${distPath}/.import-cache`;
	const env = {
		...process.env,
		...configEnv,
		PATH: `${IMPORT_CACHE}/bin:${process.env.PATH}`,
		IMPORT_CACHE,
		DIST: distPath,
		BUILDER: __dirname,
		ENTRYPOINT: entrypoint
	};

	const builderPath = join(__dirname, 'build.sh');

	await execa(builderPath, [], {
		env,
		cwd: workPath,
		stdio: 'inherit'
	});

	const lambda = await createLambda({
		files: await glob('**', distPath),
		handler: entrypoint, // not actually used in `bootstrap`
		runtime: 'provided',
		environment: {
			...configEnv,
			SCRIPT_FILENAME: entrypoint
		}
	});

	return {
		output: lambda
	};
}
