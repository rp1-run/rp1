#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppStatus {
    Idle,
    Launching,
    Connecting,
    Connected,
    Ready,
    RunningPrompt,
    WaitingForDecision,
    Completed,
    Failed(String),
    ShuttingDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptRole {
    User,
    Agent,
    Status,
    Error,
    Tool,
    Decision,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptEntry {
    role: TranscriptRole,
    text: String,
}

impl TranscriptEntry {
    pub fn new(role: TranscriptRole, text: impl Into<String>) -> Self {
        Self {
            role,
            text: text.into(),
        }
    }

    pub fn role(&self) -> TranscriptRole {
        self.role
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    fn append(&mut self, chunk: &str) {
        self.text.push_str(chunk);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptInput {
    text: String,
    cursor_offset: usize,
}

impl PromptInput {
    pub fn new() -> Self {
        Self {
            text: String::new(),
            cursor_offset: 0,
        }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn cursor_offset(&self) -> usize {
        self.cursor_offset
    }

    pub fn set_text(&mut self, text: impl Into<String>) {
        self.text = text.into();
        self.cursor_offset = self.text.chars().count();
    }

    pub fn insert(&mut self, character: char) {
        let byte_index = self.cursor_byte_index();
        self.text.insert(byte_index, character);
        self.cursor_offset += 1;
    }

    pub fn backspace(&mut self) -> bool {
        if self.cursor_offset == 0 {
            return false;
        }

        let remove_at = self.byte_index_for_offset(self.cursor_offset - 1);
        self.text.remove(remove_at);
        self.cursor_offset -= 1;
        true
    }

    pub fn move_left(&mut self) {
        self.cursor_offset = self.cursor_offset.saturating_sub(1);
    }

    pub fn move_right(&mut self) {
        self.cursor_offset = (self.cursor_offset + 1).min(self.text.chars().count());
    }

    pub fn move_to_end(&mut self) {
        self.cursor_offset = self.text.chars().count();
    }

    pub fn clear(&mut self) {
        self.text.clear();
        self.cursor_offset = 0;
    }

    fn cursor_byte_index(&self) -> usize {
        self.byte_index_for_offset(self.cursor_offset)
    }

    fn byte_index_for_offset(&self, offset: usize) -> usize {
        if offset == 0 {
            return 0;
        }

        self.text
            .char_indices()
            .nth(offset)
            .map(|(index, _)| index)
            .unwrap_or(self.text.len())
    }
}

impl Default for PromptInput {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecisionOption {
    id: String,
    label: String,
    description: Option<String>,
}

impl DecisionOption {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            description: None,
        }
    }

    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn description(&self) -> Option<&str> {
        self.description.as_deref()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingDecision {
    request_id: String,
    request_summary: String,
    tool_summary: Option<String>,
    options: Vec<DecisionOption>,
    selected_index: usize,
}

impl PendingDecision {
    pub fn new(
        request_id: impl Into<String>,
        request_summary: impl Into<String>,
        tool_summary: Option<String>,
        options: Vec<DecisionOption>,
    ) -> Self {
        Self {
            request_id: request_id.into(),
            request_summary: request_summary.into(),
            tool_summary,
            options,
            selected_index: 0,
        }
    }

    pub fn request_id(&self) -> &str {
        &self.request_id
    }

    pub fn request_summary(&self) -> &str {
        &self.request_summary
    }

    pub fn tool_summary(&self) -> Option<&str> {
        self.tool_summary.as_deref()
    }

    pub fn options(&self) -> &[DecisionOption] {
        &self.options
    }

    pub fn selected_index(&self) -> usize {
        self.selected_index
    }

    pub fn selected_option(&self) -> Option<&DecisionOption> {
        self.options.get(self.selected_index)
    }

    fn select(&mut self, index: usize) -> bool {
        if index >= self.options.len() {
            return false;
        }

        self.selected_index = index;
        true
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecisionOutcome {
    Selected(DecisionOption),
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecisionResolution {
    request_id: String,
    outcome: DecisionOutcome,
}

impl DecisionResolution {
    pub fn request_id(&self) -> &str {
        &self.request_id
    }

    pub fn outcome(&self) -> &DecisionOutcome {
        &self.outcome
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppEvent {
    SessionStarted,
    Connecting,
    Connected,
    Ready,
    PromptSubmitted(String),
    AgentChunk(String),
    ToolUpdate(String),
    StatusMessage(String),
    DecisionRequested(PendingDecision),
    PromptCompleted,
    ProcessExited { code: Option<i32> },
    SessionFailed(String),
    ShutdownStarted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppModel {
    title: String,
    status: AppStatus,
    transcript: Vec<TranscriptEntry>,
    prompt_input: PromptInput,
    pending_decision: Option<PendingDecision>,
}

impl AppModel {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            status: AppStatus::Idle,
            transcript: Vec::new(),
            prompt_input: PromptInput::new(),
            pending_decision: None,
        }
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn status(&self) -> &AppStatus {
        &self.status
    }

    pub fn transcript(&self) -> &[TranscriptEntry] {
        &self.transcript
    }

    pub fn prompt_input(&self) -> &PromptInput {
        &self.prompt_input
    }

    pub fn pending_decision(&self) -> Option<&PendingDecision> {
        self.pending_decision.as_ref()
    }

    pub fn can_accept_prompt(&self) -> bool {
        matches!(self.status, AppStatus::Ready) && self.pending_decision.is_none()
    }

    pub fn set_status(&mut self, status: AppStatus) {
        self.status = status;
    }

    pub fn set_prompt_text(&mut self, text: impl Into<String>) {
        self.prompt_input.set_text(text);
    }

    pub fn insert_prompt_char(&mut self, character: char) {
        self.prompt_input.insert(character);
    }

    pub fn backspace_prompt(&mut self) -> bool {
        self.prompt_input.backspace()
    }

    pub fn move_prompt_cursor_left(&mut self) {
        self.prompt_input.move_left();
    }

    pub fn move_prompt_cursor_right(&mut self) {
        self.prompt_input.move_right();
    }

    pub fn apply(&mut self, event: AppEvent) {
        match event {
            AppEvent::SessionStarted => {
                self.status = AppStatus::Launching;
                self.push_entry(TranscriptRole::Status, "launching agent session");
            }
            AppEvent::Connecting => {
                self.status = AppStatus::Connecting;
                self.push_entry(TranscriptRole::Status, "connecting to ACP agent");
            }
            AppEvent::Connected => {
                self.status = AppStatus::Connected;
                self.push_entry(TranscriptRole::Status, "connected to ACP agent");
            }
            AppEvent::Ready => {
                self.status = AppStatus::Ready;
                self.push_entry(TranscriptRole::Status, "ready for prompt");
            }
            AppEvent::PromptSubmitted(prompt) => {
                self.status = AppStatus::RunningPrompt;
                self.pending_decision = None;
                self.prompt_input.clear();
                self.push_entry(TranscriptRole::User, prompt);
            }
            AppEvent::AgentChunk(chunk) => {
                self.merge_entry(TranscriptRole::Agent, &chunk);
            }
            AppEvent::ToolUpdate(update) => {
                self.merge_entry(TranscriptRole::Tool, &update);
            }
            AppEvent::StatusMessage(message) => {
                self.push_entry(TranscriptRole::Status, message);
            }
            AppEvent::DecisionRequested(decision) => {
                self.status = AppStatus::WaitingForDecision;
                self.push_entry(
                    TranscriptRole::Decision,
                    format!("decision required: {}", decision.request_summary()),
                );
                self.pending_decision = Some(decision);
            }
            AppEvent::PromptCompleted => {
                self.status = AppStatus::Ready;
                self.pending_decision = None;
                self.push_entry(TranscriptRole::Status, "prompt completed");
            }
            AppEvent::ProcessExited { code } => match code {
                Some(0) => {
                    self.status = AppStatus::Completed;
                    self.pending_decision = None;
                    self.push_entry(TranscriptRole::Status, "agent process exited");
                }
                Some(code) => self.fail(format!("agent process exited with code {code}")),
                None => self.fail("agent process exited without a status"),
            },
            AppEvent::SessionFailed(message) => {
                self.fail(message);
            }
            AppEvent::ShutdownStarted => {
                self.status = AppStatus::ShuttingDown;
                self.push_entry(TranscriptRole::Status, "shutting down session");
            }
        }
    }

    pub fn select_decision_option(&mut self, index: usize) -> bool {
        self.pending_decision
            .as_mut()
            .is_some_and(|decision| decision.select(index))
    }

    pub fn resolve_selected_decision(&mut self) -> Option<DecisionResolution> {
        let decision = self.pending_decision.take()?;
        let selected = decision.selected_option()?.clone();
        let label = selected.label().to_string();
        let resolution = DecisionResolution {
            request_id: decision.request_id,
            outcome: DecisionOutcome::Selected(selected),
        };

        self.status = AppStatus::RunningPrompt;
        self.push_entry(
            TranscriptRole::Decision,
            format!("decision selected: {label}"),
        );
        Some(resolution)
    }

    pub fn cancel_decision(&mut self) -> Option<DecisionResolution> {
        let decision = self.pending_decision.take()?;
        let resolution = DecisionResolution {
            request_id: decision.request_id,
            outcome: DecisionOutcome::Cancelled,
        };

        self.status = AppStatus::RunningPrompt;
        self.push_entry(TranscriptRole::Decision, "decision cancelled");
        Some(resolution)
    }

    pub fn status_label(&self) -> String {
        match &self.status {
            AppStatus::Idle => "idle".to_string(),
            AppStatus::Launching => "launching".to_string(),
            AppStatus::Connecting => "connecting".to_string(),
            AppStatus::Connected => "connected".to_string(),
            AppStatus::Ready => "ready".to_string(),
            AppStatus::RunningPrompt => "running prompt".to_string(),
            AppStatus::WaitingForDecision => "waiting for decision".to_string(),
            AppStatus::Completed => "completed".to_string(),
            AppStatus::Failed(message) => format!("failed: {message}"),
            AppStatus::ShuttingDown => "shutting down".to_string(),
        }
    }

    fn push_entry(&mut self, role: TranscriptRole, text: impl Into<String>) {
        self.transcript.push(TranscriptEntry::new(role, text));
    }

    fn merge_entry(&mut self, role: TranscriptRole, chunk: &str) {
        if let Some(last) = self.transcript.last_mut() {
            if last.role == role {
                last.append(chunk);
                return;
            }
        }

        self.push_entry(role, chunk);
    }

    fn fail(&mut self, message: impl AsRef<str>) {
        let sanitized = sanitize_user_message(message.as_ref());
        self.status = AppStatus::Failed(sanitized.clone());
        self.pending_decision = None;
        self.push_entry(TranscriptRole::Error, sanitized);
    }
}

pub fn sanitize_user_message(message: impl AsRef<str>) -> String {
    let mut sanitized = message.as_ref().to_string();

    for key in [
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "ANTHROPIC_API_KEY",
    ] {
        sanitized = redact_assignment(&sanitized, key);
    }

    redact_bearer_tokens(&sanitized)
}

fn redact_assignment(input: &str, key: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut remaining = input;
    let needle = format!("{key}=");

    while let Some(index) = remaining.find(&needle) {
        let value_start = index + needle.len();
        output.push_str(&remaining[..value_start]);
        output.push_str("[REDACTED]");

        let value = &remaining[value_start..];
        let value_end = value
            .find(|character: char| character.is_whitespace() || matches!(character, ',' | ';'))
            .unwrap_or(value.len());
        remaining = &value[value_end..];
    }

    output.push_str(remaining);
    output
}

fn redact_bearer_tokens(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut remaining = input;

    while let Some(index) = remaining.find("Bearer ") {
        let token_start = index + "Bearer ".len();
        output.push_str(&remaining[..token_start]);
        output.push_str("[REDACTED]");

        let token = &remaining[token_start..];
        let token_end = token
            .find(|character: char| character.is_whitespace() || matches!(character, ',' | ';'))
            .unwrap_or(token.len());
        remaining = &token[token_end..];
    }

    output.push_str(remaining);
    output
}

#[cfg(test)]
mod tests {
    use super::{
        AppEvent, AppModel, AppStatus, DecisionOption, DecisionOutcome, PendingDecision,
        TranscriptRole, sanitize_user_message,
    };

    #[test]
    fn status_label_reflects_current_state() {
        let mut model = AppModel::new("sprite");

        assert_eq!(model.title(), "sprite");
        assert_eq!(model.status_label(), "idle");

        model.set_status(AppStatus::Launching);
        assert_eq!(model.status_label(), "launching");
    }

    #[test]
    fn prompt_round_trip_updates_transcript_and_ready_state() {
        let mut model = AppModel::new("sprite");
        model.apply(AppEvent::Connected);
        model.apply(AppEvent::Ready);
        model.set_prompt_text("hello");

        assert!(model.can_accept_prompt());

        model.apply(AppEvent::PromptSubmitted("hello".to_string()));
        model.apply(AppEvent::AgentChunk("hi".to_string()));
        model.apply(AppEvent::AgentChunk(" there".to_string()));
        model.apply(AppEvent::PromptCompleted);

        assert_eq!(model.status(), &AppStatus::Ready);
        assert_eq!(model.prompt_input().text(), "");
        assert_eq!(model.transcript()[2].role(), TranscriptRole::User);
        assert_eq!(model.transcript()[2].text(), "hello");
        assert_eq!(model.transcript()[3].role(), TranscriptRole::Agent);
        assert_eq!(model.transcript()[3].text(), "hi there");
        assert_eq!(
            model.transcript().last().map(|entry| entry.text()),
            Some("prompt completed")
        );
    }

    #[test]
    fn prompt_input_tracks_editable_text_and_cursor_offset() {
        let mut model = AppModel::new("sprite");

        model.insert_prompt_char('a');
        model.insert_prompt_char('c');
        model.move_prompt_cursor_left();
        model.insert_prompt_char('b');

        assert_eq!(model.prompt_input().text(), "abc");
        assert_eq!(model.prompt_input().cursor_offset(), 2);

        assert!(model.backspace_prompt());
        assert_eq!(model.prompt_input().text(), "ac");
        assert_eq!(model.prompt_input().cursor_offset(), 1);

        model.move_prompt_cursor_right();
        model.insert_prompt_char('!');
        assert_eq!(model.prompt_input().text(), "ac!");
        assert_eq!(model.prompt_input().cursor_offset(), 3);
    }

    #[test]
    fn decision_request_requires_explicit_resolution() {
        let mut model = AppModel::new("sprite");
        let decision = PendingDecision::new(
            "request-1",
            "run tool?",
            Some("shell command".to_string()),
            vec![
                DecisionOption::new("allow", "Allow"),
                DecisionOption::new("deny", "Deny").with_description("Do not run it"),
            ],
        );

        model.apply(AppEvent::DecisionRequested(decision));

        let pending = model.pending_decision().unwrap();
        assert_eq!(model.status(), &AppStatus::WaitingForDecision);
        assert_eq!(pending.request_id(), "request-1");
        assert_eq!(pending.request_summary(), "run tool?");
        assert_eq!(pending.tool_summary(), Some("shell command"));
        assert_eq!(pending.selected_index(), 0);
        assert_eq!(pending.options()[1].description(), Some("Do not run it"));
        assert_eq!(
            model.transcript().last().map(|entry| entry.role()),
            Some(TranscriptRole::Decision)
        );

        assert!(model.select_decision_option(1));
        let resolution = model.resolve_selected_decision().unwrap();

        assert_eq!(resolution.request_id(), "request-1");
        assert!(matches!(
            resolution.outcome(),
            DecisionOutcome::Selected(option) if option.id() == "deny"
        ));
        assert!(model.pending_decision().is_none());
        assert_eq!(model.status(), &AppStatus::RunningPrompt);
    }

    #[test]
    fn decision_cancel_produces_cancelled_resolution() {
        let mut model = AppModel::new("sprite");
        model.apply(AppEvent::DecisionRequested(PendingDecision::new(
            "request-2",
            "edit file?",
            None,
            vec![DecisionOption::new("allow", "Allow")],
        )));

        let resolution = model.cancel_decision().unwrap();

        assert_eq!(resolution.request_id(), "request-2");
        assert_eq!(resolution.outcome(), &DecisionOutcome::Cancelled);
        assert!(model.pending_decision().is_none());
        assert_eq!(model.status(), &AppStatus::RunningPrompt);
    }

    #[test]
    fn process_exit_reports_completion_or_failure() {
        let mut completed = AppModel::new("sprite");
        completed.apply(AppEvent::ProcessExited { code: Some(0) });

        assert_eq!(completed.status(), &AppStatus::Completed);
        assert_eq!(
            completed.transcript().last().map(|entry| entry.text()),
            Some("agent process exited")
        );

        let mut failed = AppModel::new("sprite");
        failed.apply(AppEvent::ProcessExited { code: Some(2) });

        assert_eq!(
            failed.status(),
            &AppStatus::Failed("agent process exited with code 2".to_string())
        );
        assert_eq!(
            failed.transcript().last().map(|entry| entry.role()),
            Some(TranscriptRole::Error)
        );
    }

    #[test]
    fn failure_messages_are_sanitized_before_display() {
        let mut model = AppModel::new("sprite");

        model.apply(AppEvent::SessionFailed(
            "spawn failed OPENAI_API_KEY=sk-secret Bearer ghp_secret".to_string(),
        ));

        assert_eq!(
            model.status(),
            &AppStatus::Failed(
                "spawn failed OPENAI_API_KEY=[REDACTED] Bearer [REDACTED]".to_string()
            )
        );
        assert_eq!(
            model.transcript().last().map(|entry| entry.text()),
            Some("spawn failed OPENAI_API_KEY=[REDACTED] Bearer [REDACTED]")
        );
    }

    #[test]
    fn sanitizer_redacts_common_secret_shapes() {
        let sanitized = sanitize_user_message(
            "CODEX_API_KEY=codex-secret, GH_TOKEN=gh-secret; Authorization: Bearer token-123",
        );

        assert_eq!(
            sanitized,
            "CODEX_API_KEY=[REDACTED], GH_TOKEN=[REDACTED]; Authorization: Bearer [REDACTED]"
        );
    }
}
