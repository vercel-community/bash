import fs from 'fs';
import { tmpdir } from 'os';
import execa from 'execa';
import fetch from 'node-fetch';
import { join, dirname, normalize, relative } from 'path';
import { snakeCase } from 'snake-case';
import {
	Env,
	FileFsRef,
	glob,
	download,
	Lambda,
	shouldServe,
	BuildV3,
	PrepareCache,
	Files,
	FileBlob,
} from '@vercel/build-utils';

const TMP = tmpdir();

// `chmod()` is required for usage with `vercel-dev-runtime`
// since file mode is not preserved in Vercel CLI deployments.
fs.chmodSync(join(__dirname, 'build.sh'), 0o755);
fs.chmodSync(join(__dirname, 'bootstrap'), 0o755);

const bootstrapPromise = FileFsRef.fromFsPath({
	fsPath: join(__dirname, 'bootstrap'),
});
const runtimePromise = FileFsRef.fromFsPath({
	fsPath: join(__dirname, 'runtime.sh'),
});
const curlPromise = fetch(
	'https://github.com/dtschan/curl-static/releases/download/v7.63.0/curl'
).then(async (res) => {
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Failed to fetch "curl": ${err}`);
	}
	const data = await res.buffer();
	return new FileBlob({ mode: 0o755, data });
});
const jqPromise = fetch(
	'https://github.com/importpw/static-binaries/raw/master/binaries/linux/x86_64/jq'
).then(async (res) => {
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Failed to fetch "jq": ${err}`);
	}
	const data = await res.buffer();
	return new FileBlob({ mode: 0o755, data });
});

// From this list: https://import.sh/docs/config
const allowedConfigImports = new Set([
	'CACHE',
	'CURL_OPTS',
	'DEBUG',
	'RELOAD',
	'SERVER',
]);

export const version = 3;

export { shouldServe };

export const build: BuildV3 = async ({
	workPath,
	files,
	entrypoint,
	meta = {},
	config = {},
}) => {
	await download(files, workPath, meta);

	const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;
	const importCacheDir = join(devCacheDir, 'bash');

	const configEnv: Env = {};
	for (const [key, val] of Object.entries(config)) {
		const name = snakeCase(key).toUpperCase();
		if (typeof val === 'string' && allowedConfigImports.has(name)) {
			configEnv[`IMPORT_${name}`] = val;
		}
	}
	if (config?.import) {
		for (const key of Object.keys(config.import)) {
			const name = snakeCase(key).toUpperCase();
			configEnv[`IMPORT_${name}`] = config.import[key];
		}
	}

	const IMPORT_TRACE = join(TMP, Math.random().toString(16).substring(2));

	const env: Env = {
		...process.env,
		...configEnv,
		IMPORT_CACHE: importCacheDir,
		IMPORT_TRACE,
		WORK_PATH: workPath,
		ENTRYPOINT: entrypoint,
		//DIST: distPath,
		//VERCEL_DEV: meta.isDev ? '1' : '0'
	};

	await execa(join(__dirname, 'build.sh'), [], {
		env,
		cwd: workPath,
		stdio: 'inherit',
	});

	const trace = await fs.promises
		.readFile(IMPORT_TRACE, 'utf8')
		.then((traceFile) => {
			const trimmed = traceFile.trim();
			if (!trimmed) return [];
			return trimmed.split('\n');
		});
	fs.promises.unlink(IMPORT_TRACE);

	const lambdaFiles: Files = {
		bootstrap: await bootstrapPromise,
		'.import-cache/runtime.sh': await runtimePromise,
		'.import-cache/bin/curl': await curlPromise,
		'.import-cache/bin/jq': await jqPromise,
		'.import-cache/bin/import': await FileFsRef.fromFsPath({
			fsPath: join(importCacheDir, 'bin/import'),
		}),
		// For now only the entrypoint file is copied into the lambda
		[entrypoint]: files[entrypoint],
	};

	for (const url of trace) {
		const urlPath = normalize(url.replace('://', '/'));
		const linkPath = join(importCacheDir, 'links', urlPath);
		const locationPath = join(importCacheDir, 'locations', urlPath);
		const [linkFile, locationFile] = await Promise.all([
			FileFsRef.fromFsPath({ fsPath: linkPath }),
			FileFsRef.fromFsPath({ fsPath: locationPath }),
		]);
		lambdaFiles[join('.import-cache/links', urlPath)] = linkFile;
		lambdaFiles[join('.import-cache/locations', urlPath)] = locationFile;

		const dataPath = join(
			dirname(linkPath),
			await fs.promises.readlink(linkPath)
		);
		const dataOutputPath = join(
			'.import-cache',
			relative(importCacheDir, dataPath)
		);

		//console.log({ url, urlPath, linkPath, locationPath, dataPath, dataOutputPath });

		if (!lambdaFiles[dataOutputPath]) {
			lambdaFiles[dataOutputPath] = await FileFsRef.fromFsPath({
				fsPath: dataPath,
			});
		}
	}

	// TODO: trace `bin` dir - for each file - if symlink - verify that it points to one of the
	// files that's already been traced, if not symlink then include in output

	const output = new Lambda({
		files: lambdaFiles,
		handler: entrypoint,
		runtime: 'provided',
		environment: {
			...configEnv,
			SCRIPT_FILENAME: entrypoint,
		},
	});

	return { output };
};

export const prepareCache: PrepareCache = async ({ workPath }) => {
	return await glob('.vercel/cache/bash/**', workPath);
};
