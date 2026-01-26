/**
 * WebSocket message types for real-time updates.
 * Extends the existing message types with run-specific events.
 */

import type { Artifact, RunEvent, RunStatus, StepStatus } from "./runs";

/** File change notification */
export interface FileChangedMessage {
  type: "file:changed";
  path: string;
  changeType: "modify" | "add" | "delete";
  timestamp: string;
}

/** Tree structure change notification */
export interface TreeChangedMessage {
  type: "tree:changed";
  timestamp: string;
}

/** Server heartbeat */
export interface HeartbeatMessage {
  type: "heartbeat";
  timestamp: string;
}

/** Legacy status change notification */
export interface StatusChangedMessage {
  type: "status_changed";
  projectId: string;
  feature: string;
  status: string;
  timestamp: string;
}

/** Run status change notification */
export interface RunStatusMessage {
  type: "run:status";
  runId: string;
  status: RunStatus;
  currentStep: string | null;
  timestamp: string;
}

/** Run step status change notification */
export interface RunStepMessage {
  type: "run:step";
  runId: string;
  stepId: string;
  status: StepStatus;
  timestamp: string;
}

/** Run artifact creation/update notification */
export interface RunArtifactMessage {
  type: "run:artifact";
  runId: string;
  artifact: Artifact;
  timestamp: string;
}

/** Run event stream notification */
export interface RunEventMessage {
  type: "run:event";
  runId: string;
  event: RunEvent;
  timestamp: string;
}

/** Union of all run-related messages */
export type RunMessage =
  | RunStatusMessage
  | RunStepMessage
  | RunArtifactMessage
  | RunEventMessage;

/** Union of all server messages */
export type ServerMessage =
  | FileChangedMessage
  | TreeChangedMessage
  | HeartbeatMessage
  | StatusChangedMessage
  | RunStatusMessage
  | RunStepMessage
  | RunArtifactMessage
  | RunEventMessage;

/** WebSocket connection status */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Callback type for run subscriptions */
export type RunSubscriptionCallback = (message: RunMessage) => void;

/** Callback type for attention updates */
export type AttentionCallback = () => void;
