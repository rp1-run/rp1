/**
 * Daemon module exports.
 * Provides configuration, IPC, and lifecycle management for the background daemon.
 */

export {
	type DaemonState,
	ensureConfigDir,
	getConfigDir,
	getDaemonStatePath,
	getLifecycleLockPath,
	getPidFilePath,
	getRestartMarkerPath,
	readDaemonState,
	writeDaemonState,
} from "./config-dir";
export {
	type CheckedDaemonExecutableLocation,
	DaemonExecutableResolutionError,
	type DaemonExecutableResolutionOptions,
	type DaemonExecutableSource,
	resolveDaemonExecutablePath,
} from "./executable";
export {
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	type ErrorResponse,
	type EventNotificationPayload,
	getDaemonStatus,
	type HealthResponse,
	type NotificationNotifyPayload,
	notifyEvent,
	notifyNotification,
	type RegisterResponse,
	registerProjectWithDaemon,
	stopDaemon as stopDaemonViaIpc,
} from "./ipc";
export {
	acquireLifecycleLock,
	type LockAcquireOptions,
	type LockMetadata,
	withLifecycleLock,
} from "./lifecycle-lock";

export {
	connectToDaemon,
	type DaemonEnsureOptions,
	type DaemonLifecycleReason,
	DaemonPortConflictError,
	type DaemonStartAction,
	type DaemonStartResult,
	type DaemonStopAction,
	type DaemonStopResult,
	ensureDaemon,
	forceKillProcess,
	getStatus,
	isProcessRunning,
	restartDaemon,
	stopDaemon,
	waitForProcessExit,
} from "./manager";
