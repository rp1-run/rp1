#!/usr/bin/env bun

import {
	chmod,
	lstat,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { createTestSandbox } from "./test-with-isolated-home.js";

const SENTINEL_NAME = ".rp1-test-home-sentinel";
const EXPECTED_DENIAL_CODES = new Set(["EACCES", "EPERM", "EROFS"]);

const isInside = (parent: string, child: string): boolean => {
	const relativePath = relative(parent, child);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const errorCode = (error: unknown): string | undefined =>
	typeof error === "object" && error !== null && "code" in error
		? String(error.code)
		: undefined;

const assertBoundaryPreconditions = async (
	protectedHome: string,
	sentinelPath: string,
): Promise<number> => {
	if (process.env.RP1_TEST_HOME_BOUNDARY !== "1") {
		throw new Error("Refusing to probe without RP1_TEST_HOME_BOUNDARY=1");
	}

	const getuid = process.getuid;
	if (!getuid)
		throw new Error("The absolute home boundary requires a POSIX UID");
	const uid = getuid();
	if (uid === 0)
		throw new Error("The absolute home boundary must not run as root");
	if (protectedHome === "/") {
		throw new Error(
			"Refusing to use the filesystem root as the protected home",
		);
	}

	const [homeStat, sentinelStat] = await Promise.all([
		stat(protectedHome, { bigint: true }),
		stat(sentinelPath, { bigint: true }),
	]);
	for (const [label, value] of [
		["protected home", homeStat],
		["protected sentinel", sentinelStat],
	] as const) {
		if (value.uid !== 0n || (value.mode & 0o222n) !== 0n) {
			throw new Error(`${label} must be root-owned and non-writable`);
		}
	}

	return uid;
};

const sentinelSnapshot = async (
	path: string,
): Promise<{ readonly bytes: string; readonly metadata: string }> => {
	const [contents, metadata] = await Promise.all([
		readFile(path),
		stat(path, { bigint: true }),
	]);

	return {
		bytes: contents.toString("base64"),
		metadata: [
			metadata.dev,
			metadata.ino,
			metadata.mode,
			metadata.nlink,
			metadata.uid,
			metadata.gid,
			metadata.size,
			metadata.mtimeNs,
			metadata.ctimeNs,
		]
			.map(String)
			.join(":"),
	};
};

const assertMissing = async (path: string): Promise<void> => {
	try {
		await lstat(path);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	throw new Error(`Boundary probe path already exists: ${path}`);
};

const expectPermissionDenied = async (
	label: string,
	operation: () => Promise<unknown>,
): Promise<void> => {
	try {
		await operation();
	} catch (error) {
		const code = errorCode(error);
		if (code && EXPECTED_DENIAL_CODES.has(code)) {
			console.log(`Protected home ${label}: denied (${code})`);
			return;
		}
		throw new Error(
			`Protected home ${label}: unexpected error ${String(error)}`,
		);
	}

	throw new Error(`Protected home ${label}: mutation unexpectedly succeeded`);
};

const verifyProtectedHomeDenials = async (
	protectedHome: string,
	sentinelPath: string,
): Promise<void> => {
	const createPath = join(protectedHome, ".rp1-boundary-create-probe");
	const renamedPath = join(protectedHome, ".rp1-test-home-sentinel-renamed");
	await Promise.all([assertMissing(createPath), assertMissing(renamedPath)]);
	const before = await sentinelSnapshot(sentinelPath);

	await expectPermissionDenied("create", () =>
		writeFile(createPath, "must not exist", { flag: "wx" }),
	);
	await expectPermissionDenied("overwrite", () =>
		writeFile(sentinelPath, "must not replace sentinel"),
	);
	await expectPermissionDenied("rename", () =>
		rename(sentinelPath, renamedPath),
	);
	await expectPermissionDenied("delete", () => unlink(sentinelPath));
	await expectPermissionDenied("chmod", () => chmod(sentinelPath, 0o600));
	await expectPermissionDenied("utimes", () =>
		utimes(sentinelPath, new Date(1_000), new Date(1_000)),
	);

	const after = await sentinelSnapshot(sentinelPath);
	if (before.bytes !== after.bytes || before.metadata !== after.metadata) {
		throw new Error("Protected sentinel contents or metadata changed");
	}
	await Promise.all([assertMissing(createPath), assertMissing(renamedPath)]);
	console.log("Protected sentinel: contents and metadata unchanged");
};

const verifySandboxMutations = async (protectedHome: string): Promise<void> => {
	const sandbox = await createTestSandbox();
	if (!isInside(sandbox.root, sandbox.home)) {
		throw new Error("Launcher sandbox home escaped its owned root");
	}
	if (isInside(protectedHome, sandbox.root)) {
		throw new Error(
			"Launcher sandbox must not be created below protected home",
		);
	}

	const createPath = join(sandbox.home, "boundary-create-probe");
	const renamedPath = join(sandbox.home, "boundary-renamed-probe");

	try {
		await writeFile(createPath, "created", { flag: "wx" });
		await writeFile(createPath, "overwritten");
		await rename(createPath, renamedPath);
		await chmod(renamedPath, 0o600);
		await utimes(renamedPath, new Date(2_000), new Date(2_000));
		await unlink(renamedPath);
		await assertMissing(renamedPath);
		console.log(
			"Launcher sandbox: create/overwrite/rename/delete/metadata succeeded",
		);
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}

	await assertMissing(sandbox.root);
	console.log("Launcher sandbox: cleanup stayed within the disposable root");
};

const main = async (): Promise<void> => {
	const protectedHome = await realpath(homedir());
	const sentinelPath = join(protectedHome, SENTINEL_NAME);
	const uid = await assertBoundaryPreconditions(protectedHome, sentinelPath);

	console.log(`Filesystem boundary: non-root uid ${uid}`);
	await verifyProtectedHomeDenials(protectedHome, sentinelPath);
	await verifySandboxMutations(protectedHome);
	console.log("Absolute test-home filesystem boundary verified");
};

if (import.meta.main) {
	await main();
}
