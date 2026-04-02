/**
 * Daemon module exports.
 * Provides configuration, IPC, and lifecycle management for the background daemon.
 */

export {
	type DaemonState,
	ensureConfigDir,
	getConfigDir,
	getDaemonStatePath,
	getPidFilePath,
	getRegistryPath,
	readDaemonState,
	writeDaemonState,
} from "./config-dir";

export {
	type ArtifactNotifyPayload,
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	type ErrorResponse,
	type EventNotificationPayload,
	getDaemonStatus,
	type HealthResponse,
	type NotificationNotifyPayload,
	notifyArtifactChange,
	notifyEvent,
	notifyNotification,
	notifyStatusChange,
	type RegisterResponse,
	registerProjectWithDaemon,
	stopDaemon as stopDaemonViaIpc,
	type WorkflowNotifyContext,
} from "./ipc";

export {
	connectToDaemon,
	type DaemonStartResult,
	ensureDaemon,
	forceKillProcess,
	getStatus,
	isProcessRunning,
	restartDaemon,
	stopDaemon,
	waitForProcessExit,
} from "./manager";
