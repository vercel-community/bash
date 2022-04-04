import fs from 'fs-extra';
import { tmpdir } from 'os';
import execa from 'execa';
import fetch from 'node-fetch';
import { join, dirname, normalize, relative } from 'path';
import { snakeCase } from 'snake-case';
import {
	FileFsRef,
	glob,
	download,
	Lambda,
	shouldServe,
	BuildV3,
	PrepareCache,
	Files,
	FileBlob,
	getWriteableDirectory,
	streamToBuffer,
} from '@vercel/build-utils';

const TMP = tmpdir();

// `chmod()` is required for usage with `vercel-dev-runtime`
// since file mode is not preserved in Vercel CLI deployments.
fs.chmodSync(join(__dirname, 'build.sh'), 0o755);
fs.chmodSync(join(__dirname, 'import.sh'), 0o755);
fs.chmodSync(join(__dirname, 'bootstrap'), 0o755);

const bootstrapPromise = FileFsRef.fromFsPath({
	fsPath: join(__dirname, 'bootstrap'),
});
const runtimePromise = FileFsRef.fromFsPath({
	fsPath: join(__dirname, 'runtime.sh'),
});
const importPromise = FileFsRef.fromFsPath({
	fsPath: join(__dirname, 'import.sh'),
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

	const configEnv: Lambda['environment'] = {};
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

	const env = {
		...process.env,
		...configEnv,
		IMPORT_CACHE: importCacheDir,
		IMPORT_TRACE,
		WORK_PATH: workPath,
		ENTRYPOINT: entrypoint,
		BUILDER_DIST: __dirname,
	};

	const buildDir = await getWriteableDirectory();

	await execa(join(__dirname, 'build.sh'), [], {
		env,
		cwd: buildDir,
		stdio: 'inherit',
	});

	const trace = await fs.readFile(IMPORT_TRACE, 'utf8').then((traceFile) => {
		const trimmed = traceFile.trim();
		if (!trimmed) return [];
		return trimmed.split('\n');
	});
	fs.remove(IMPORT_TRACE);

	const lambdaFiles: Files = {
		...(await filesToBlobs(glob('**', buildDir)).finally(() =>
			fs.remove(buildDir)
		)),
		bootstrap: await bootstrapPromise,
		'.import-cache/runtime.sh': await runtimePromise,
		'.import-cache/bin/import': await importPromise,
		'.import-cache/bin/curl': await curlPromise,
		'.import-cache/bin/jq': await jqPromise,
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

		const dataPath = join(dirname(linkPath), await fs.readlink(linkPath));
		const dataOutputPath = join(
			'.import-cache',
			relative(importCacheDir, dataPath)
		);

		if (!lambdaFiles[dataOutputPath]) {
			lambdaFiles[dataOutputPath] = await FileFsRef.fromFsPath({
				fsPath: dataPath,
			});
		}
	}

	// Trace the `bin` dir:
	//  - if symlink, then include if it points to a traced files
	//  - if not symlink, then always include in output
	const binDir = join(importCacheDir, 'bin');
	let bins: string[] = [];
	try {
		bins = await fs.readdir(binDir);
	} catch (err: any) {
		if (err.code !== 'ENOENT') throw err;
	}
	for (const bin of bins) {
		const binPath = join(binDir, bin);
		const target = await fs.readlink(binPath).catch((err) => {
			if (err.code !== 'EINVAL') throw err;
		});
		if (target) {
			const rel = relative(importCacheDir, join(binDir, target));
			if (!lambdaFiles[join('.import-cache', rel)]) {
				continue;
			}
		}
		lambdaFiles[join('.import-cache/bin', bin)] =
			await FileFsRef.fromFsPath({
				fsPath: binPath,
			});
	}

	const output = new Lambda({
		files: lambdaFiles,
		handler: entrypoint,
		runtime: 'provided',
		environment: configEnv,
	});

	return { output };
};

export const prepareCache: PrepareCache = async ({ workPath }) => {
	return await glob('.vercel/cache/bash/**', workPath);
};

async function filesToBlobs(filesPromise: Promise<Files>) {
	const files = await filesPromise;
	for (const [name, file] of Object.entries(files)) {
		const stream = file.toStream();
		const buffer = await streamToBuffer(stream);
		files[name] = new FileBlob({
			mode: file.mode,
			contentType: file.contentType,
			data: buffer,
		});
	}
	return files;
}
