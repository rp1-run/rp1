use std::{
    collections::HashMap,
    error::Error,
    fmt,
    future::Future,
    io,
    path::PathBuf,
    pin::Pin,
    process::{ExitStatus, Stdio},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use agent_client_protocol::{
    Agent, Client, ConnectTo, ConnectionTo,
    schema::{
        ContentBlock, ContentChunk, InitializeRequest, NewSessionRequest, PermissionOption,
        PromptRequest, PromptResponse, ProtocolVersion, RequestPermissionOutcome,
        RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
        SessionNotification, SessionUpdate, StopReason, ToolCall, ToolCallContent, ToolCallUpdate,
    },
};
use tokio::{
    io::AsyncReadExt,
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command},
    sync::{Mutex, mpsc, oneshot},
    task::JoinHandle,
    time::timeout,
};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use crate::{
    acp::AgentLaunch,
    app::{AppEvent, DecisionOption, DecisionOutcome, DecisionResolution, PendingDecision},
};

const CHANNEL_DEPTH: usize = 32;
const STDERR_TAIL_LIMIT: usize = 4096;

#[derive(Debug)]
pub struct SessionController {
    launch: AgentLaunch,
    command_rx: mpsc::Receiver<UiCommand>,
    event_tx: mpsc::Sender<SessionEvent>,
    stderr_limit: usize,
}

#[derive(Debug)]
pub struct SessionChannels {
    pub commands: mpsc::Sender<UiCommand>,
    pub events: mpsc::Receiver<SessionEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiCommand {
    SubmitPrompt(String),
    ResolveDecision(DecisionResolution),
    CancelDecision(String),
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionEvent {
    App(AppEvent),
}

impl SessionEvent {
    pub fn into_app_event(self) -> AppEvent {
        match self {
            SessionEvent::App(event) => event,
        }
    }
}

impl From<AppEvent> for SessionEvent {
    fn from(event: AppEvent) -> Self {
        Self::App(event)
    }
}

impl SessionController {
    pub fn new(launch: AgentLaunch) -> (Self, SessionChannels) {
        let (command_tx, command_rx) = mpsc::channel(CHANNEL_DEPTH);
        let (event_tx, event_rx) = mpsc::channel(CHANNEL_DEPTH);

        (
            Self {
                launch,
                command_rx,
                event_tx,
                stderr_limit: STDERR_TAIL_LIMIT,
            },
            SessionChannels {
                commands: command_tx,
                events: event_rx,
            },
        )
    }

    pub fn with_channels(
        launch: AgentLaunch,
        command_rx: mpsc::Receiver<UiCommand>,
        event_tx: mpsc::Sender<SessionEvent>,
    ) -> Self {
        Self {
            launch,
            command_rx,
            event_tx,
            stderr_limit: STDERR_TAIL_LIMIT,
        }
    }

    pub async fn run(self) -> Result<(), SessionError> {
        emit_app(&self.event_tx, AppEvent::SessionStarted).await?;

        let spawned = match spawn_agent(&self.launch) {
            Ok(spawned) => spawned,
            Err(error) => {
                emit_failure(&self.event_tx, &error).await?;
                return Err(error);
            }
        };

        self.run_spawned(spawned).await
    }

    async fn run_spawned(self, spawned: SpawnedAgent) -> Result<(), SessionError> {
        let SpawnedAgent {
            stdin,
            stdout,
            stderr,
            mut child,
        } = spawned;

        emit_app(&self.event_tx, AppEvent::Connecting).await?;

        let stderr_task = tokio::spawn(read_stderr_tail(stderr, self.stderr_limit));
        let permission_registry = PermissionRegistry::new();
        let transport =
            agent_client_protocol::ByteStreams::new(stdin.compat_write(), stdout.compat());

        let client_run = run_client(
            transport,
            self.launch.workdir().to_path_buf(),
            self.command_rx,
            self.event_tx.clone(),
            permission_registry.clone(),
        );
        tokio::pin!(client_run);

        let outcome = tokio::select! {
            result = &mut client_run => RunOutcome::Client(result),
            wait_result = child.wait() => RunOutcome::Child(wait_result),
        };

        permission_registry.cancel_all().await;

        match outcome {
            RunOutcome::Client(Ok(())) => {
                stop_child(&mut child).await?;
                let _ = collect_stderr_tail(stderr_task).await;
                Ok(())
            }
            RunOutcome::Client(Err(error)) => {
                stop_child(&mut child).await?;
                let stderr_tail = collect_stderr_tail(stderr_task).await;
                let error = error.with_stderr(stderr_tail);
                emit_failure(&self.event_tx, &error).await?;
                Err(error)
            }
            RunOutcome::Child(wait_result) => {
                let status = wait_result.map_err(SessionError::Io)?;
                let stderr_tail = collect_stderr_tail(stderr_task).await;

                if status.success() {
                    emit_app(
                        &self.event_tx,
                        AppEvent::ProcessExited {
                            code: status.code(),
                        },
                    )
                    .await?;
                    Ok(())
                } else {
                    let error = SessionError::agent_exited(status, stderr_tail);
                    emit_failure(&self.event_tx, &error).await?;
                    Err(error)
                }
            }
        }
    }
}

enum RunOutcome {
    Client(Result<(), SessionError>),
    Child(io::Result<ExitStatus>),
}

struct SpawnedAgent {
    stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: ChildStderr,
    child: Child,
}

fn spawn_agent(launch: &AgentLaunch) -> Result<SpawnedAgent, SessionError> {
    let mut command = Command::new(launch.command());
    command
        .args(launch.args())
        .current_dir(launch.workdir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|source| SessionError::Spawn {
        command: launch.command().to_string(),
        workdir: launch.workdir().to_path_buf(),
        source,
    })?;

    let Some(stdin) = child.stdin.take() else {
        let _ = child.start_kill();
        return Err(SessionError::MissingPipe("stdin"));
    };
    let Some(stdout) = child.stdout.take() else {
        let _ = child.start_kill();
        return Err(SessionError::MissingPipe("stdout"));
    };
    let Some(stderr) = child.stderr.take() else {
        let _ = child.start_kill();
        return Err(SessionError::MissingPipe("stderr"));
    };

    Ok(SpawnedAgent {
        stdin,
        stdout,
        stderr,
        child,
    })
}

async fn run_client(
    transport: impl ConnectTo<Client>,
    workdir: PathBuf,
    command_rx: mpsc::Receiver<UiCommand>,
    event_tx: mpsc::Sender<SessionEvent>,
    permission_registry: PermissionRegistry,
) -> Result<(), SessionError> {
    let notification_tx = event_tx.clone();
    let request_tx = event_tx.clone();
    let request_registry = permission_registry.clone();

    Client
        .builder()
        .name("sprite")
        .on_receive_notification(
            async move |notification: SessionNotification, _connection| {
                for event in map_session_notification(notification) {
                    send_protocol_event(&notification_tx, event).await?;
                }
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |request: RequestPermissionRequest, responder, _connection| {
                let (request_id, outcome_rx) = request_registry.register().await;
                let pending = pending_decision_from_request(&request_id, &request);

                send_protocol_event(&request_tx, AppEvent::DecisionRequested(pending)).await?;

                let outcome = outcome_rx.await.unwrap_or(DecisionOutcome::Cancelled);
                responder.respond(permission_response_for_outcome(outcome))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(transport, |connection: ConnectionTo<Agent>| async move {
            drive_connection(
                connection,
                workdir,
                command_rx,
                event_tx,
                permission_registry,
            )
            .await
        })
        .await
        .map_err(SessionError::protocol)
}

async fn drive_connection(
    connection: ConnectionTo<Agent>,
    workdir: PathBuf,
    mut command_rx: mpsc::Receiver<UiCommand>,
    event_tx: mpsc::Sender<SessionEvent>,
    permission_registry: PermissionRegistry,
) -> agent_client_protocol::Result<()> {
    connection
        .send_request(InitializeRequest::new(ProtocolVersion::V1))
        .block_task()
        .await?;

    let new_session = connection
        .send_request(NewSessionRequest::new(workdir))
        .block_task()
        .await?;
    let session_id = new_session.session_id;

    send_protocol_event(&event_tx, AppEvent::Connected).await?;
    send_protocol_event(&event_tx, AppEvent::Ready).await?;

    let mut active_prompt: Option<
        Pin<Box<dyn Future<Output = agent_client_protocol::Result<PromptResponse>> + '_>>,
    > = None;

    loop {
        if active_prompt.is_some() {
            let prompt_result = {
                let prompt = active_prompt.as_mut().expect("active prompt checked above");
                tokio::select! {
                    result = prompt.as_mut() => Some(result),
                    command = command_rx.recv() => {
                        match command {
                            Some(UiCommand::ResolveDecision(resolution)) => {
                                resolve_permission(&event_tx, &permission_registry, resolution).await?;
                            }
                            Some(UiCommand::CancelDecision(request_id)) => {
                                cancel_permission(&event_tx, &permission_registry, &request_id).await?;
                            }
                            Some(UiCommand::SubmitPrompt(_)) => {
                                send_protocol_event(&event_tx, AppEvent::StatusMessage("prompt already running".to_string())).await?;
                            }
                            Some(UiCommand::Shutdown) | None => {
                                send_protocol_event(&event_tx, AppEvent::ShutdownStarted).await?;
                                permission_registry.cancel_all().await;
                                return Ok(());
                            }
                        }
                        None
                    }
                }
            };

            if let Some(result) = prompt_result {
                active_prompt = None;
                handle_prompt_result(&event_tx, result).await?;
            }

            continue;
        }

        let Some(command) = command_rx.recv().await else {
            permission_registry.cancel_all().await;
            return Ok(());
        };

        match command {
            UiCommand::SubmitPrompt(prompt) => {
                if prompt.trim().is_empty() {
                    send_protocol_event(
                        &event_tx,
                        AppEvent::StatusMessage("empty prompt ignored".to_string()),
                    )
                    .await?;
                    continue;
                }

                send_protocol_event(&event_tx, AppEvent::PromptSubmitted(prompt.clone())).await?;
                let request = PromptRequest::new(
                    session_id.clone(),
                    vec![ContentBlock::Text(
                        agent_client_protocol::schema::TextContent::new(prompt),
                    )],
                );
                active_prompt = Some(Box::pin(connection.send_request(request).block_task()));
            }
            UiCommand::ResolveDecision(resolution) => {
                resolve_permission(&event_tx, &permission_registry, resolution).await?;
            }
            UiCommand::CancelDecision(request_id) => {
                cancel_permission(&event_tx, &permission_registry, &request_id).await?;
            }
            UiCommand::Shutdown => {
                send_protocol_event(&event_tx, AppEvent::ShutdownStarted).await?;
                permission_registry.cancel_all().await;
                return Ok(());
            }
        }
    }
}

async fn handle_prompt_result(
    event_tx: &mpsc::Sender<SessionEvent>,
    result: agent_client_protocol::Result<PromptResponse>,
) -> agent_client_protocol::Result<()> {
    let response = result?;

    if response.stop_reason != StopReason::EndTurn {
        send_protocol_event(
            event_tx,
            AppEvent::StatusMessage(format!(
                "prompt stopped: {}",
                stop_reason_label(response.stop_reason)
            )),
        )
        .await?;
    }

    send_protocol_event(event_tx, AppEvent::PromptCompleted).await
}

async fn resolve_permission(
    event_tx: &mpsc::Sender<SessionEvent>,
    registry: &PermissionRegistry,
    resolution: DecisionResolution,
) -> agent_client_protocol::Result<()> {
    if registry.resolve(resolution.clone()).await {
        return Ok(());
    }

    send_protocol_event(
        event_tx,
        AppEvent::StatusMessage(format!(
            "permission request {} is no longer pending",
            resolution.request_id()
        )),
    )
    .await
}

async fn cancel_permission(
    event_tx: &mpsc::Sender<SessionEvent>,
    registry: &PermissionRegistry,
    request_id: &str,
) -> agent_client_protocol::Result<()> {
    if registry.cancel(request_id).await {
        return Ok(());
    }

    send_protocol_event(
        event_tx,
        AppEvent::StatusMessage(format!(
            "permission request {request_id} is no longer pending"
        )),
    )
    .await
}

#[derive(Clone, Debug)]
struct PermissionRegistry {
    waiters: Arc<Mutex<HashMap<String, oneshot::Sender<DecisionOutcome>>>>,
    sequence: Arc<AtomicU64>,
}

impl PermissionRegistry {
    fn new() -> Self {
        Self {
            waiters: Arc::new(Mutex::new(HashMap::new())),
            sequence: Arc::new(AtomicU64::new(1)),
        }
    }

    async fn register(&self) -> (String, oneshot::Receiver<DecisionOutcome>) {
        let id = format!(
            "permission-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        );
        let (tx, rx) = oneshot::channel();
        self.waiters.lock().await.insert(id.clone(), tx);
        (id, rx)
    }

    async fn resolve(&self, resolution: DecisionResolution) -> bool {
        let Some(sender) = self.waiters.lock().await.remove(resolution.request_id()) else {
            return false;
        };

        sender.send(resolution.outcome().clone()).is_ok()
    }

    async fn cancel(&self, request_id: &str) -> bool {
        let Some(sender) = self.waiters.lock().await.remove(request_id) else {
            return false;
        };

        sender.send(DecisionOutcome::Cancelled).is_ok()
    }

    async fn cancel_all(&self) {
        let waiters = self
            .waiters
            .lock()
            .await
            .drain()
            .map(|(_, tx)| tx)
            .collect::<Vec<_>>();

        for sender in waiters {
            let _ = sender.send(DecisionOutcome::Cancelled);
        }
    }
}

fn pending_decision_from_request(
    request_id: &str,
    request: &RequestPermissionRequest,
) -> PendingDecision {
    let tool_summary = format_tool_update(&request.tool_call);
    let request_summary = if tool_summary.is_empty() {
        "agent requested permission".to_string()
    } else {
        format!("agent requested permission for {tool_summary}")
    };

    PendingDecision::new(
        request_id.to_string(),
        request_summary,
        Some(tool_summary),
        permission_options(&request.options),
    )
}

fn permission_options(options: &[PermissionOption]) -> Vec<DecisionOption> {
    if options.is_empty() {
        return vec![DecisionOption::new("cancel", "Cancel")];
    }

    options
        .iter()
        .map(|option| {
            DecisionOption::new(option.option_id.to_string(), option.name.clone())
                .with_description(format!("{:?}", option.kind))
        })
        .collect()
}

fn permission_response_for_outcome(outcome: DecisionOutcome) -> RequestPermissionResponse {
    match outcome {
        DecisionOutcome::Selected(option) => {
            RequestPermissionResponse::new(RequestPermissionOutcome::Selected(
                SelectedPermissionOutcome::new(option.id().to_string()),
            ))
        }
        DecisionOutcome::Cancelled => {
            RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled)
        }
    }
}

pub fn map_session_notification(notification: SessionNotification) -> Vec<AppEvent> {
    vec![map_session_update(notification.update)]
}

pub fn map_session_update(update: SessionUpdate) -> AppEvent {
    match update {
        SessionUpdate::UserMessageChunk(chunk) => {
            AppEvent::StatusMessage(format!("user message: {}", format_content_chunk(&chunk)))
        }
        SessionUpdate::AgentMessageChunk(chunk) => {
            AppEvent::AgentChunk(format_content_chunk(&chunk))
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            AppEvent::StatusMessage(format!("agent thought: {}", format_content_chunk(&chunk)))
        }
        SessionUpdate::ToolCall(tool_call) => AppEvent::ToolUpdate(format_tool_call(&tool_call)),
        SessionUpdate::ToolCallUpdate(update) => AppEvent::ToolUpdate(format_tool_update(&update)),
        SessionUpdate::Plan(plan) => AppEvent::StatusMessage(format_plan(&plan)),
        SessionUpdate::AvailableCommandsUpdate(update) => AppEvent::StatusMessage(format!(
            "available commands updated: {}",
            update.available_commands.len()
        )),
        SessionUpdate::CurrentModeUpdate(update) => {
            AppEvent::StatusMessage(format!("mode changed: {}", update.current_mode_id))
        }
        SessionUpdate::ConfigOptionUpdate(update) => AppEvent::StatusMessage(format!(
            "configuration updated: {} options",
            update.config_options.len()
        )),
        SessionUpdate::SessionInfoUpdate(update) => {
            let title = update
                .title
                .value()
                .map(String::as_str)
                .unwrap_or("metadata");
            AppEvent::StatusMessage(format!("session info updated: {title}"))
        }
        _ => AppEvent::StatusMessage("session update received".to_string()),
    }
}

fn format_content_chunk(chunk: &ContentChunk) -> String {
    format_content_block(&chunk.content)
}

fn format_content_block(block: &ContentBlock) -> String {
    match block {
        ContentBlock::Text(text) => text.text.clone(),
        ContentBlock::Image(_) => "[image content]".to_string(),
        ContentBlock::Audio(_) => "[audio content]".to_string(),
        ContentBlock::ResourceLink(_) => "[resource link]".to_string(),
        ContentBlock::Resource(_) => "[embedded resource]".to_string(),
        _ => "[unsupported content]".to_string(),
    }
}

fn format_tool_call(tool_call: &ToolCall) -> String {
    let mut parts = vec![format!("tool {}", tool_call.tool_call_id)];

    if !tool_call.title.is_empty() {
        parts.push(tool_call.title.clone());
    }

    parts.push(format!("{:?}", tool_call.status));
    parts.join(": ")
}

fn format_tool_update(update: &ToolCallUpdate) -> String {
    let mut parts = vec![format!("tool {}", update.tool_call_id)];

    if let Some(title) = &update.fields.title {
        parts.push(title.clone());
    }
    if let Some(status) = update.fields.status {
        parts.push(format!("{status:?}"));
    }
    if let Some(content) = &update.fields.content {
        let rendered = content
            .iter()
            .map(format_tool_content)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if !rendered.is_empty() {
            parts.push(rendered);
        }
    }
    if update.fields.raw_output.is_some() {
        parts.push("output updated".to_string());
    }

    parts.join(": ")
}

fn format_tool_content(content: &ToolCallContent) -> String {
    match content {
        ToolCallContent::Content(content) => format_content_block(&content.content),
        ToolCallContent::Diff(diff) => format!("diff {}", diff.path.display()),
        ToolCallContent::Terminal(terminal) => format!("terminal {}", terminal.terminal_id),
        _ => "[unsupported tool content]".to_string(),
    }
}

fn format_plan(plan: &agent_client_protocol::schema::Plan) -> String {
    if plan.entries.is_empty() {
        return "plan updated: no entries".to_string();
    }

    let entries = plan
        .entries
        .iter()
        .take(5)
        .map(|entry| format!("{:?} {}", entry.status, entry.content))
        .collect::<Vec<_>>()
        .join("; ");

    if plan.entries.len() > 5 {
        format!("plan updated: {entries}; ...")
    } else {
        format!("plan updated: {entries}")
    }
}

fn stop_reason_label(reason: StopReason) -> &'static str {
    match reason {
        StopReason::EndTurn => "end turn",
        StopReason::MaxTokens => "max tokens",
        StopReason::MaxTurnRequests => "max turn requests",
        StopReason::Refusal => "refusal",
        StopReason::Cancelled => "cancelled",
        _ => "unknown",
    }
}

async fn emit_failure(
    event_tx: &mpsc::Sender<SessionEvent>,
    error: &SessionError,
) -> Result<(), SessionError> {
    emit_app(event_tx, AppEvent::SessionFailed(error.to_string())).await
}

async fn emit_app(
    event_tx: &mpsc::Sender<SessionEvent>,
    event: AppEvent,
) -> Result<(), SessionError> {
    event_tx
        .send(event.into())
        .await
        .map_err(|_| SessionError::EventReceiverDropped)
}

async fn send_protocol_event(
    event_tx: &mpsc::Sender<SessionEvent>,
    event: AppEvent,
) -> agent_client_protocol::Result<()> {
    event_tx
        .send(event.into())
        .await
        .map_err(|_| agent_client_protocol::util::internal_error("session event receiver dropped"))
}

async fn read_stderr_tail(mut stderr: ChildStderr, limit: usize) -> String {
    let mut tail = Vec::new();
    let mut chunk = [0; 1024];

    loop {
        match stderr.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                tail.extend_from_slice(&chunk[..read]);
                if tail.len() > limit {
                    let remove = tail.len() - limit;
                    tail.drain(..remove);
                }
            }
        }
    }

    crate::app::sanitize_user_message(String::from_utf8_lossy(&tail))
}

async fn collect_stderr_tail(task: JoinHandle<String>) -> Option<String> {
    match timeout(Duration::from_millis(250), task).await {
        Ok(Ok(tail)) if !tail.trim().is_empty() => Some(tail),
        _ => None,
    }
}

async fn stop_child(child: &mut Child) -> Result<(), SessionError> {
    if child.try_wait().map_err(SessionError::Io)?.is_some() {
        return Ok(());
    }

    child.start_kill().map_err(SessionError::Io)?;
    let _ = child.wait().await.map_err(SessionError::Io)?;
    Ok(())
}

#[derive(Debug)]
pub enum SessionError {
    Spawn {
        command: String,
        workdir: PathBuf,
        source: io::Error,
    },
    MissingPipe(&'static str),
    Protocol {
        message: String,
        stderr: Option<String>,
    },
    AgentExited {
        code: Option<i32>,
        stderr: Option<String>,
    },
    Io(io::Error),
    EventReceiverDropped,
}

impl SessionError {
    fn protocol(error: agent_client_protocol::Error) -> Self {
        Self::Protocol {
            message: error.to_string(),
            stderr: None,
        }
    }

    fn agent_exited(status: ExitStatus, stderr: Option<String>) -> Self {
        Self::AgentExited {
            code: status.code(),
            stderr,
        }
    }

    fn with_stderr(self, stderr: Option<String>) -> Self {
        match self {
            SessionError::Protocol {
                message,
                stderr: None,
            } => SessionError::Protocol { message, stderr },
            other => other,
        }
    }
}

impl fmt::Display for SessionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            SessionError::Spawn {
                command,
                workdir,
                source,
            } => format!(
                "failed to launch agent command `{command}` in {}: {source}. Check that the command is installed and authenticated outside Sprite.",
                workdir.display()
            ),
            SessionError::MissingPipe(stream) => {
                format!("failed to open agent process {stream} pipe")
            }
            SessionError::Protocol { message, stderr } => {
                with_optional_stderr(format!("ACP protocol error: {message}"), stderr.as_deref())
            }
            SessionError::AgentExited { code, stderr } => {
                let status = code
                    .map(|code| format!("code {code}"))
                    .unwrap_or_else(|| "no exit status".to_string());
                with_optional_stderr(
                    format!("agent process exited with {status}"),
                    stderr.as_deref(),
                )
            }
            SessionError::Io(error) => error.to_string(),
            SessionError::EventReceiverDropped => "session event receiver dropped".to_string(),
        };

        write!(formatter, "{}", crate::app::sanitize_user_message(message))
    }
}

impl Error for SessionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            SessionError::Spawn { source, .. } => Some(source),
            SessionError::Io(error) => Some(error),
            _ => None,
        }
    }
}

fn with_optional_stderr(message: String, stderr: Option<&str>) -> String {
    match stderr {
        Some(stderr) if !stderr.trim().is_empty() => {
            format!("{message}. stderr: {}", stderr.trim())
        }
        _ => message,
    }
}

#[cfg(test)]
mod tests {
    use std::{future::Future, path::PathBuf, sync::Arc};

    use agent_client_protocol::schema::{
        AgentCapabilities, ContentBlock, ContentChunk, InitializeRequest, InitializeResponse,
        NewSessionRequest, NewSessionResponse, PermissionOption, PermissionOptionKind, Plan,
        PlanEntry, PlanEntryPriority, PlanEntryStatus, PromptRequest, PromptResponse,
        RequestPermissionOutcome, RequestPermissionRequest, SessionNotification, SessionUpdate,
        StopReason, TextContent, ToolCall, ToolCallStatus, ToolCallUpdate, ToolCallUpdateFields,
    };
    use agent_client_protocol::{Agent, Client, ConnectTo, ConnectionTo};
    use tokio::{
        sync::{Mutex, mpsc, oneshot},
        task::LocalSet,
        time::{Duration, timeout},
    };
    use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

    use super::{
        PermissionRegistry, SessionError, SessionEvent, UiCommand, format_tool_update,
        map_session_update, pending_decision_from_request, run_client,
    };
    use crate::app::{AppEvent, TranscriptRole};

    #[test]
    fn maps_agent_chunks_into_agent_events() {
        let event = map_session_update(SessionUpdate::AgentMessageChunk(ContentChunk::new(
            ContentBlock::Text(TextContent::new("hello")),
        )));

        assert_eq!(event, AppEvent::AgentChunk("hello".to_string()));
    }

    #[test]
    fn maps_orientation_updates_to_status_or_tool_events() {
        let thought = map_session_update(SessionUpdate::AgentThoughtChunk(ContentChunk::new(
            ContentBlock::Text(TextContent::new("checking files")),
        )));
        let tool = map_session_update(SessionUpdate::ToolCall(
            ToolCall::new("tool-1", "run command").status(ToolCallStatus::InProgress),
        ));
        let tool_update = map_session_update(SessionUpdate::ToolCallUpdate(ToolCallUpdate::new(
            "tool-1",
            ToolCallUpdateFields::new()
                .title("run command")
                .status(ToolCallStatus::Completed)
                .content(vec![ContentBlock::Text(TextContent::new("done")).into()]),
        )));
        let plan = map_session_update(SessionUpdate::Plan(Plan::new(vec![PlanEntry::new(
            "inspect files",
            PlanEntryPriority::High,
            PlanEntryStatus::InProgress,
        )])));

        assert_eq!(
            thought,
            AppEvent::StatusMessage("agent thought: checking files".to_string())
        );
        assert_eq!(
            tool,
            AppEvent::ToolUpdate("tool tool-1: run command: InProgress".to_string())
        );
        assert_eq!(
            tool_update,
            AppEvent::ToolUpdate("tool tool-1: run command: Completed: done".to_string())
        );
        assert_eq!(
            plan,
            AppEvent::StatusMessage("plan updated: InProgress inspect files".to_string())
        );
    }

    #[test]
    fn builds_permission_decision_without_auto_selecting() {
        let request = RequestPermissionRequest::new(
            "session-1",
            ToolCallUpdate::new(
                "tool-1",
                ToolCallUpdateFields::new().title("run shell command"),
            ),
            vec![
                PermissionOption::new("allow", "Allow", PermissionOptionKind::AllowOnce),
                PermissionOption::new("deny", "Deny", PermissionOptionKind::RejectOnce),
            ],
        );

        let decision = pending_decision_from_request("permission-1", &request);

        assert_eq!(decision.request_id(), "permission-1");
        assert_eq!(decision.options()[0].id(), "allow");
        assert_eq!(decision.options()[1].id(), "deny");
        assert_eq!(decision.selected_index(), 0);
        assert!(decision.request_summary().contains("run shell command"));
    }

    #[test]
    fn formats_tool_updates_with_content() {
        let update = ToolCallUpdate::new(
            "tool-1",
            ToolCallUpdateFields::new()
                .title("read file")
                .status(ToolCallStatus::Completed)
                .content(vec![ContentBlock::Text(TextContent::new("done")).into()]),
        );

        assert_eq!(
            format_tool_update(&update),
            "tool tool-1: read file: Completed: done"
        );
    }

    #[test]
    fn session_error_redacts_stderr_secrets() {
        let error = SessionError::AgentExited {
            code: Some(1),
            stderr: Some("GH_TOKEN=secret Bearer token-value".to_string()),
        };
        let display = error.to_string();

        assert!(display.contains("GH_TOKEN=[REDACTED]"));
        assert!(display.contains("Bearer [REDACTED]"));
        assert!(!display.contains("secret"));
        assert!(!display.contains("token-value"));
    }

    #[test]
    fn session_event_can_feed_app_model_roles() {
        let event = map_session_update(SessionUpdate::ToolCall(
            ToolCall::new("tool-2", "inspect").status(ToolCallStatus::Pending),
        ));

        let mut model = crate::app::AppModel::new("sprite");
        model.apply(event);

        assert_eq!(model.transcript()[0].role(), TranscriptRole::Tool);
    }

    #[test]
    fn controller_client_completes_fake_agent_round_trip() {
        run_local(async {
            let (client_transport, server_transport) = test_transports();
            spawn_fake_round_trip_agent(server_transport);

            let (command_tx, command_rx) = mpsc::channel(8);
            let (event_tx, mut event_rx) = mpsc::channel(8);
            let controller = tokio::task::spawn_local(run_client(
                client_transport,
                PathBuf::from("/tmp/project"),
                command_rx,
                event_tx,
                PermissionRegistry::new(),
            ));

            assert_eq!(recv_app_event(&mut event_rx).await, AppEvent::Connected);
            assert_eq!(recv_app_event(&mut event_rx).await, AppEvent::Ready);

            command_tx
                .send(UiCommand::SubmitPrompt("hello".to_string()))
                .await
                .unwrap();

            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::PromptSubmitted("hello".to_string())
            );
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::AgentChunk("fake response".to_string())
            );
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::PromptCompleted
            );

            command_tx.send(UiCommand::Shutdown).await.unwrap();
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::ShutdownStarted
            );
            assert!(controller.await.unwrap().is_ok());
        });
    }

    #[test]
    fn controller_client_cancels_pending_permission_request() {
        run_local(async {
            let (client_transport, server_transport) = test_transports();
            let (outcome_tx, outcome_rx) = oneshot::channel();
            spawn_fake_permission_agent(server_transport, outcome_tx);

            let (command_tx, command_rx) = mpsc::channel(8);
            let (event_tx, mut event_rx) = mpsc::channel(8);
            let controller = tokio::task::spawn_local(run_client(
                client_transport,
                PathBuf::from("/tmp/project"),
                command_rx,
                event_tx,
                PermissionRegistry::new(),
            ));

            assert_eq!(recv_app_event(&mut event_rx).await, AppEvent::Connected);
            assert_eq!(recv_app_event(&mut event_rx).await, AppEvent::Ready);

            command_tx
                .send(UiCommand::SubmitPrompt("needs permission".to_string()))
                .await
                .unwrap();

            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::PromptSubmitted("needs permission".to_string())
            );

            let AppEvent::DecisionRequested(decision) = recv_app_event(&mut event_rx).await else {
                panic!("expected decision request");
            };

            command_tx
                .send(UiCommand::CancelDecision(decision.request_id().to_string()))
                .await
                .unwrap();

            assert!(matches!(
                timeout(Duration::from_secs(1), outcome_rx)
                    .await
                    .unwrap()
                    .unwrap(),
                RequestPermissionOutcome::Cancelled
            ));
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::StatusMessage("prompt stopped: cancelled".to_string())
            );
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::PromptCompleted
            );

            command_tx.send(UiCommand::Shutdown).await.unwrap();
            assert_eq!(
                recv_app_event(&mut event_rx).await,
                AppEvent::ShutdownStarted
            );
            assert!(controller.await.unwrap().is_ok());
        });
    }

    fn run_local(test: impl Future<Output = ()>) {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let local = LocalSet::new();

        runtime.block_on(local.run_until(test));
    }

    fn test_transports() -> (
        impl ConnectTo<Client> + 'static,
        impl ConnectTo<Agent> + 'static,
    ) {
        let (client_writer, server_reader) = tokio::io::duplex(4096);
        let (server_writer, client_reader) = tokio::io::duplex(4096);

        let client_transport = agent_client_protocol::ByteStreams::new(
            client_writer.compat_write(),
            client_reader.compat(),
        );
        let server_transport = agent_client_protocol::ByteStreams::new(
            server_writer.compat_write(),
            server_reader.compat(),
        );

        (client_transport, server_transport)
    }

    fn spawn_fake_round_trip_agent(transport: impl ConnectTo<Agent> + 'static) {
        let agent = Agent
            .builder()
            .name("fake-agent")
            .on_receive_request(
                async |initialize: InitializeRequest, responder, _connection| {
                    responder.respond(
                        InitializeResponse::new(initialize.protocol_version)
                            .agent_capabilities(AgentCapabilities::new()),
                    )
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |_request: NewSessionRequest, responder, _connection| {
                    responder.respond(NewSessionResponse::new("session-1"))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |request: PromptRequest, responder, connection: ConnectionTo<Client>| {
                    connection.send_notification(SessionNotification::new(
                        request.session_id,
                        SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                            TextContent::new("fake response"),
                        ))),
                    ))?;
                    responder.respond(PromptResponse::new(StopReason::EndTurn))
                },
                agent_client_protocol::on_receive_request!(),
            );

        tokio::task::spawn_local(async move {
            let _ = agent.connect_to(transport).await;
        });
    }

    fn spawn_fake_permission_agent(
        transport: impl ConnectTo<Agent> + 'static,
        outcome_tx: oneshot::Sender<RequestPermissionOutcome>,
    ) {
        let outcome_tx = Arc::new(Mutex::new(Some(outcome_tx)));
        let agent = Agent
            .builder()
            .name("fake-permission-agent")
            .on_receive_request(
                async |initialize: InitializeRequest, responder, _connection| {
                    responder.respond(
                        InitializeResponse::new(initialize.protocol_version)
                            .agent_capabilities(AgentCapabilities::new()),
                    )
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |_request: NewSessionRequest, responder, _connection| {
                    responder.respond(NewSessionResponse::new("session-1"))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                {
                    let outcome_tx = outcome_tx.clone();
                    async move |request: PromptRequest,
                                responder,
                                connection: ConnectionTo<Client>| {
                        connection.spawn({
                            let connection = connection.clone();
                            let outcome_tx = outcome_tx.clone();
                            async move {
                                let response = connection
                                    .send_request(RequestPermissionRequest::new(
                                        request.session_id,
                                        ToolCallUpdate::new(
                                            "tool-1",
                                            ToolCallUpdateFields::new().title("run shell command"),
                                        ),
                                        vec![PermissionOption::new(
                                            "allow",
                                            "Allow",
                                            PermissionOptionKind::AllowOnce,
                                        )],
                                    ))
                                    .block_task()
                                    .await?;

                                if let Some(sender) = outcome_tx.lock().await.take() {
                                    let _ = sender.send(response.outcome);
                                }

                                responder.respond(PromptResponse::new(StopReason::Cancelled))
                            }
                        })
                    }
                },
                agent_client_protocol::on_receive_request!(),
            );

        tokio::task::spawn_local(async move {
            let _ = agent.connect_to(transport).await;
        });
    }

    async fn recv_app_event(events: &mut mpsc::Receiver<SessionEvent>) -> AppEvent {
        timeout(Duration::from_secs(1), events.recv())
            .await
            .unwrap()
            .unwrap()
            .into_app_event()
    }
}
