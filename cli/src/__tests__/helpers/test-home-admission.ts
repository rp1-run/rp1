import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";

const ADMISSION_PREFIX = "Test home admission failed";

const canonicalize = (path: string, label: string): string => {
	try {
		return realpathSync(path);
	} catch {
		throw new Error(`${ADMISSION_PREFIX}: could not canonicalize ${label}`);
	}
};

const declaredHome = process.env.RP1_TEST_SANDBOX_HOME?.trim();

if (!declaredHome) {
	throw new Error(
		`${ADMISSION_PREFIX}: RP1_TEST_SANDBOX_HOME is required; run tests through the isolated-home launcher`,
	);
}

const sandboxHome = canonicalize(declaredHome, "RP1_TEST_SANDBOX_HOME");
const resolvedHome = canonicalize(homedir(), "os.homedir()");
const relativeHome = relative(sandboxHome, resolvedHome);
const homeIsContained =
	relativeHome === "" ||
	(!relativeHome.startsWith("..") && !isAbsolute(relativeHome));

if (!homeIsContained) {
	throw new Error(
		`${ADMISSION_PREFIX}: resolved home is outside RP1_TEST_SANDBOX_HOME`,
	);
}
