use std::{error::Error, fmt, io, time::Duration};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Frame, Terminal,
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Position, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
};
use tokio::{sync::mpsc, time::interval};

use crate::{
    app::{AppModel, AppStatus, PendingDecision, TranscriptRole},
    session::{SessionChannels, SessionEvent, UiCommand},
};

const INPUT_TICK: Duration = Duration::from_millis(40);
const DRAIN_LIMIT: usize = 64;

pub async fn run_terminal_harness(channels: SessionChannels) -> Result<(), UiError> {
    let mut terminal = TerminalSession::enter()?;
    let result = run_ui_loop(&mut terminal.terminal, channels).await;
    let restore = terminal.restore();

    result?;
    restore?;
    Ok(())
}

struct TerminalSession {
    terminal: Terminal<CrosstermBackend<io::Stdout>>,
    restored: bool,
}

impl TerminalSession {
    fn enter() -> Result<Self, UiError> {
        enable_raw_mode()?;

        let mut stdout = io::stdout();
        if let Err(error) = execute!(stdout, EnterAlternateScreen) {
            let _ = disable_raw_mode();
            return Err(error.into());
        }

        let backend = CrosstermBackend::new(stdout);
        let terminal = match Terminal::new(backend) {
            Ok(terminal) => terminal,
            Err(error) => {
                let _ = disable_raw_mode();
                let mut stdout = io::stdout();
                let _ = execute!(stdout, LeaveAlternateScreen);
                return Err(error.into());
            }
        };
        let mut session = Self {
            terminal,
            restored: false,
        };
        session.terminal.clear()?;

        Ok(session)
    }

    fn restore(&mut self) -> Result<(), UiError> {
        if self.restored {
            return Ok(());
        }

        disable_raw_mode()?;
        execute!(self.terminal.backend_mut(), LeaveAlternateScreen)?;
        self.terminal.show_cursor()?;
        self.restored = true;
        Ok(())
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

async fn run_ui_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    channels: SessionChannels,
) -> Result<(), UiError> {
    let SessionChannels {
        commands,
        mut events,
    } = channels;
    let mut model = AppModel::new("sprite");
    let mut view = UiState::default();
    let mut ticker = interval(INPUT_TICK);
    let mut events_open = true;

    loop {
        terminal.draw(|frame| render(frame, &model, &view))?;

        tokio::select! {
            event = events.recv(), if events_open => {
                match event {
                    Some(event) => apply_session_event(&mut model, event),
                    None => events_open = false,
                }
            }
            _ = ticker.tick() => {
                drain_session_events(&mut model, &mut events, &mut events_open);

                while event::poll(Duration::ZERO)? {
                    if let Event::Key(key) = event::read()? {
                        if let Some(action) = handle_key_event(&mut model, &mut view, key) {
                            if dispatch_action(&commands, action).await? {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
    }
}

fn drain_session_events(
    model: &mut AppModel,
    events: &mut mpsc::Receiver<SessionEvent>,
    events_open: &mut bool,
) {
    for _ in 0..DRAIN_LIMIT {
        match events.try_recv() {
            Ok(event) => apply_session_event(model, event),
            Err(mpsc::error::TryRecvError::Empty) => return,
            Err(mpsc::error::TryRecvError::Disconnected) => {
                *events_open = false;
                return;
            }
        }
    }
}

fn apply_session_event(model: &mut AppModel, event: SessionEvent) {
    model.apply(event.into_app_event());
}

async fn dispatch_action(
    commands: &mpsc::Sender<UiCommand>,
    action: UiAction,
) -> Result<bool, UiError> {
    match action {
        UiAction::Send(command) => {
            commands
                .send(command)
                .await
                .map_err(|_| UiError::CommandChannelClosed)?;
            Ok(false)
        }
        UiAction::ShutdownAndExit => {
            let _ = commands.send(UiCommand::Shutdown).await;
            Ok(true)
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct UiState {
    transcript_scroll: u16,
}

impl UiState {
    fn scroll_up(&mut self, amount: u16) {
        self.transcript_scroll = self.transcript_scroll.saturating_add(amount);
    }

    fn scroll_down(&mut self, amount: u16) {
        self.transcript_scroll = self.transcript_scroll.saturating_sub(amount);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum UiAction {
    Send(UiCommand),
    ShutdownAndExit,
}

fn handle_key_event(model: &mut AppModel, view: &mut UiState, key: KeyEvent) -> Option<UiAction> {
    if key.kind != KeyEventKind::Press {
        return None;
    }

    if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
        model.apply(crate::app::AppEvent::ShutdownStarted);
        return Some(UiAction::ShutdownAndExit);
    }

    if model.pending_decision().is_some() {
        return handle_decision_key(model, view, key);
    }

    match key.code {
        KeyCode::Enter if model.can_accept_prompt() => {
            let prompt = model.prompt_input().text().trim().to_string();
            if prompt.is_empty() {
                return None;
            }
            Some(UiAction::Send(UiCommand::SubmitPrompt(prompt)))
        }
        KeyCode::Char(character)
            if model.can_accept_prompt()
                && !key
                    .modifiers
                    .intersects(KeyModifiers::CONTROL | KeyModifiers::ALT) =>
        {
            model.insert_prompt_char(character);
            None
        }
        KeyCode::Backspace if model.can_accept_prompt() => {
            model.backspace_prompt();
            None
        }
        KeyCode::Left if model.can_accept_prompt() => {
            model.move_prompt_cursor_left();
            None
        }
        KeyCode::Right if model.can_accept_prompt() => {
            model.move_prompt_cursor_right();
            None
        }
        KeyCode::Up => {
            view.scroll_up(1);
            None
        }
        KeyCode::Down => {
            view.scroll_down(1);
            None
        }
        KeyCode::PageUp => {
            view.scroll_up(8);
            None
        }
        KeyCode::PageDown => {
            view.scroll_down(8);
            None
        }
        _ => None,
    }
}

fn handle_decision_key(
    model: &mut AppModel,
    view: &mut UiState,
    key: KeyEvent,
) -> Option<UiAction> {
    match key.code {
        KeyCode::Enter => {
            let resolution = model.resolve_selected_decision()?;
            Some(UiAction::Send(UiCommand::ResolveDecision(resolution)))
        }
        KeyCode::Esc => {
            let resolution = model.cancel_decision()?;
            Some(UiAction::Send(UiCommand::CancelDecision(
                resolution.request_id().to_string(),
            )))
        }
        KeyCode::Char(character) if character.is_ascii_digit() => {
            let index = character
                .to_digit(10)
                .and_then(|digit| digit.checked_sub(1))?;
            model.select_decision_option(index as usize);
            None
        }
        KeyCode::Up | KeyCode::Left => {
            let decision = model.pending_decision()?;
            let index = decision.selected_index().saturating_sub(1);
            model.select_decision_option(index);
            None
        }
        KeyCode::Down | KeyCode::Right => {
            let decision = model.pending_decision()?;
            model.select_decision_option(decision.selected_index() + 1);
            None
        }
        KeyCode::PageUp => {
            view.scroll_up(8);
            None
        }
        KeyCode::PageDown => {
            view.scroll_down(8);
            None
        }
        _ => None,
    }
}

fn render(frame: &mut Frame<'_>, model: &AppModel, view: &UiState) {
    let area = frame.area();
    let pending_decision = model.pending_decision();
    let decision_height = decision_height(pending_decision, area);
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(4),
            Constraint::Length(decision_height),
            Constraint::Length(3),
            Constraint::Length(1),
        ])
        .split(area);

    render_header(frame, chunks[0], model);
    render_transcript(frame, chunks[1], model, view);

    if let Some(decision) = pending_decision {
        render_decision(frame, chunks[2], decision);
    }

    render_prompt(frame, chunks[3], model);
    render_footer(frame, chunks[4], model);
}

fn render_header(frame: &mut Frame<'_>, area: Rect, model: &AppModel) {
    let header = Paragraph::new(Line::from(vec![
        Span::styled(
            model.title().to_string(),
            Style::default().add_modifier(Modifier::BOLD),
        ),
        Span::raw("  "),
        Span::styled(model.status_label(), status_style(model.status())),
    ]))
    .block(Block::default().borders(Borders::BOTTOM));

    frame.render_widget(header, area);
}

fn render_transcript(frame: &mut Frame<'_>, area: Rect, model: &AppModel, view: &UiState) {
    let lines = transcript_lines(model);
    let scroll = transcript_scroll(lines.len(), area, view);
    let transcript = Paragraph::new(lines)
        .block(Block::default().title("Transcript").borders(Borders::ALL))
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));

    frame.render_widget(transcript, area);
}

fn render_decision(frame: &mut Frame<'_>, area: Rect, decision: &PendingDecision) {
    if area.height == 0 {
        return;
    }

    frame.render_widget(Clear, area);

    let decision = Paragraph::new(decision_lines(decision))
        .block(Block::default().title("Decision").borders(Borders::ALL))
        .wrap(Wrap { trim: false });

    frame.render_widget(decision, area);
}

fn render_prompt(frame: &mut Frame<'_>, area: Rect, model: &AppModel) {
    let prompt_style = if model.can_accept_prompt() {
        Style::default()
    } else {
        Style::default().fg(Color::DarkGray)
    };
    let text = model.prompt_input().text().to_string();
    let prompt = Paragraph::new(Line::from(vec![Span::raw("> "), Span::raw(text)]))
        .style(prompt_style)
        .block(Block::default().title("Prompt").borders(Borders::ALL));

    frame.render_widget(prompt, area);

    if model.can_accept_prompt() && area.width > 4 && area.height > 2 {
        let cursor = model.prompt_input().cursor_offset() as u16;
        let max_x = area.width.saturating_sub(2);
        let x = area.x + 3 + cursor.min(max_x.saturating_sub(3));
        frame.set_cursor_position(Position::new(x, area.y + 1));
    }
}

fn render_footer(frame: &mut Frame<'_>, area: Rect, model: &AppModel) {
    let text = if model.pending_decision().is_some() {
        "1-9 select  Enter send  Esc cancel  Ctrl-C exit"
    } else if model.can_accept_prompt() {
        "Enter submit  Ctrl-C exit"
    } else {
        "waiting for agent  Ctrl-C exit"
    };
    let footer = Paragraph::new(text).style(Style::default().fg(Color::DarkGray));

    frame.render_widget(footer, area);
}

fn transcript_lines(model: &AppModel) -> Vec<Line<'static>> {
    if model.transcript().is_empty() {
        return vec![Line::from(Span::styled(
            "status: waiting for session events",
            role_style(TranscriptRole::Status),
        ))];
    }

    model
        .transcript()
        .iter()
        .flat_map(|entry| {
            entry
                .text()
                .lines()
                .enumerate()
                .map(|(index, line)| {
                    if index == 0 {
                        Line::from(vec![
                            Span::styled(
                                format!("{}: ", role_label(entry.role())),
                                role_style(entry.role()).add_modifier(Modifier::BOLD),
                            ),
                            Span::styled(line.to_string(), role_style(entry.role())),
                        ])
                    } else {
                        Line::from(Span::styled(
                            format!("    {line}"),
                            role_style(entry.role()),
                        ))
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

fn decision_lines(decision: &PendingDecision) -> Vec<Line<'static>> {
    let mut lines = vec![Line::from(Span::styled(
        decision.request_summary().to_string(),
        Style::default().add_modifier(Modifier::BOLD),
    ))];

    if let Some(tool) = decision.tool_summary() {
        lines.push(Line::from(vec![
            Span::styled("tool: ", Style::default().fg(Color::Yellow)),
            Span::raw(tool.to_string()),
        ]));
    }

    for (index, option) in decision.options().iter().enumerate() {
        let marker = if index == decision.selected_index() {
            ">"
        } else {
            " "
        };
        let mut text = format!("{marker} {}. {}", index + 1, option.label());
        if let Some(description) = option.description() {
            text.push_str(": ");
            text.push_str(description);
        }
        lines.push(Line::from(text));
    }

    lines
}

fn transcript_scroll(line_count: usize, area: Rect, view: &UiState) -> u16 {
    let visible = area.height.saturating_sub(2) as usize;
    let max_scroll = line_count.saturating_sub(visible) as u16;
    max_scroll.saturating_sub(view.transcript_scroll.min(max_scroll))
}

fn decision_height(decision: Option<&PendingDecision>, area: Rect) -> u16 {
    let Some(decision) = decision else {
        return 0;
    };

    let tool_line = u16::from(decision.tool_summary().is_some());
    let lines = 3 + tool_line + decision.options().len() as u16;
    lines.min(area.height.saturating_sub(7)).max(4)
}

fn role_label(role: TranscriptRole) -> &'static str {
    match role {
        TranscriptRole::User => "you",
        TranscriptRole::Agent => "agent",
        TranscriptRole::Status => "status",
        TranscriptRole::Error => "error",
        TranscriptRole::Tool => "tool",
        TranscriptRole::Decision => "decision",
    }
}

fn role_style(role: TranscriptRole) -> Style {
    match role {
        TranscriptRole::User => Style::default().fg(Color::Cyan),
        TranscriptRole::Agent => Style::default().fg(Color::Green),
        TranscriptRole::Status => Style::default().fg(Color::Gray),
        TranscriptRole::Error => Style::default().fg(Color::Red),
        TranscriptRole::Tool => Style::default().fg(Color::Yellow),
        TranscriptRole::Decision => Style::default().fg(Color::Magenta),
    }
}

fn status_style(status: &AppStatus) -> Style {
    match status {
        AppStatus::Ready | AppStatus::Connected | AppStatus::Completed => {
            Style::default().fg(Color::Green)
        }
        AppStatus::Failed(_) => Style::default().fg(Color::Red),
        AppStatus::WaitingForDecision => Style::default().fg(Color::Magenta),
        AppStatus::RunningPrompt | AppStatus::Launching | AppStatus::Connecting => {
            Style::default().fg(Color::Yellow)
        }
        AppStatus::Idle | AppStatus::ShuttingDown => Style::default().fg(Color::Gray),
    }
}

#[derive(Debug)]
pub enum UiError {
    Io(io::Error),
    CommandChannelClosed,
}

impl fmt::Display for UiError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UiError::Io(error) => write!(formatter, "{error}"),
            UiError::CommandChannelClosed => write!(formatter, "session command channel closed"),
        }
    }
}

impl Error for UiError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            UiError::Io(error) => Some(error),
            UiError::CommandChannelClosed => None,
        }
    }
}

impl From<io::Error> for UiError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

#[cfg(test)]
mod tests {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
    use ratatui::{Terminal, backend::TestBackend};

    use super::{UiAction, UiState, handle_key_event, render};
    use crate::{
        app::{AppEvent, AppModel, AppStatus, DecisionOption, DecisionOutcome, PendingDecision},
        session::UiCommand,
    };

    #[test]
    fn renders_core_states_with_test_backend() {
        let states = [
            AppStatus::Connected,
            AppStatus::Ready,
            AppStatus::RunningPrompt,
            AppStatus::Failed("boom".to_string()),
        ];

        for status in states {
            let mut model = AppModel::new("sprite");
            model.set_status(status.clone());
            let output = render_to_string(&model);

            assert!(output.contains("sprite"));
            assert!(output.contains(&model.status_label()));
            assert!(output.contains("Transcript"));
            assert!(output.contains("Prompt"));
        }

        let mut decision_model = AppModel::new("sprite");
        decision_model.apply(AppEvent::DecisionRequested(sample_decision()));
        let decision_output = render_to_string(&decision_model);

        assert!(decision_output.contains("waiting for decision"));
        assert!(decision_output.contains("Decision"));
        assert!(decision_output.contains("run shell command?"));
    }

    #[test]
    fn renders_transcript_prompt_and_decision_panel() {
        let mut model = AppModel::new("sprite");
        model.apply(AppEvent::Connected);
        model.apply(AppEvent::Ready);
        model.set_prompt_text("hello");
        model.apply(AppEvent::StatusMessage("ready for work".to_string()));
        model.apply(AppEvent::DecisionRequested(sample_decision()));

        let output = render_to_string(&model);

        assert!(output.contains("status: connected to ACP agent"));
        assert!(output.contains("status: ready for prompt"));
        assert!(output.contains("decision: decision required: run shell command?"));
        assert!(output.contains("> hello"));
        assert!(output.contains("tool: shell"));
        assert!(output.contains("> 1. Allow"));
        assert!(output.contains("2. Deny"));
    }

    #[test]
    fn prompt_keys_edit_and_submit_only_when_ready() {
        let mut model = AppModel::new("sprite");
        let mut view = UiState::default();

        handle_key_event(&mut model, &mut view, key(KeyCode::Char('h')));
        assert_eq!(model.prompt_input().text(), "");

        model.apply(AppEvent::Ready);
        handle_key_event(&mut model, &mut view, key(KeyCode::Char('h')));
        handle_key_event(&mut model, &mut view, key(KeyCode::Char('i')));
        handle_key_event(&mut model, &mut view, key(KeyCode::Left));
        handle_key_event(&mut model, &mut view, key(KeyCode::Backspace));
        handle_key_event(&mut model, &mut view, key(KeyCode::Char('H')));

        assert_eq!(model.prompt_input().text(), "Hi");

        let action = handle_key_event(&mut model, &mut view, key(KeyCode::Enter));

        assert_eq!(
            action,
            Some(UiAction::Send(UiCommand::SubmitPrompt("Hi".to_string())))
        );

        model.apply(AppEvent::PromptSubmitted("Hi".to_string()));
        handle_key_event(&mut model, &mut view, key(KeyCode::Char('!')));

        assert_eq!(model.prompt_input().text(), "");
    }

    #[test]
    fn decision_keys_select_resolve_and_cancel() {
        let mut model = AppModel::new("sprite");
        let mut view = UiState::default();
        model.apply(AppEvent::DecisionRequested(sample_decision()));

        handle_key_event(&mut model, &mut view, key(KeyCode::Char('2')));

        assert_eq!(model.pending_decision().unwrap().selected_index(), 1);

        let action = handle_key_event(&mut model, &mut view, key(KeyCode::Enter));
        let Some(UiAction::Send(UiCommand::ResolveDecision(resolution))) = action else {
            panic!("expected decision resolution");
        };

        assert_eq!(resolution.request_id(), "request-1");
        assert!(matches!(
            resolution.outcome(),
            DecisionOutcome::Selected(option) if option.id() == "deny"
        ));
        assert!(model.pending_decision().is_none());

        model.apply(AppEvent::DecisionRequested(sample_decision()));
        let action = handle_key_event(&mut model, &mut view, key(KeyCode::Esc));

        assert_eq!(
            action,
            Some(UiAction::Send(UiCommand::CancelDecision(
                "request-1".to_string()
            )))
        );
    }

    #[test]
    fn navigation_and_shutdown_keys_produce_expected_actions() {
        let mut model = AppModel::new("sprite");
        let mut view = UiState::default();

        handle_key_event(&mut model, &mut view, key(KeyCode::PageUp));
        assert_eq!(view.transcript_scroll, 8);

        handle_key_event(&mut model, &mut view, key(KeyCode::Down));
        assert_eq!(view.transcript_scroll, 7);

        let action = handle_key_event(
            &mut model,
            &mut view,
            KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL),
        );

        assert_eq!(action, Some(UiAction::ShutdownAndExit));
        assert_eq!(model.status(), &AppStatus::ShuttingDown);
    }

    fn render_to_string(model: &AppModel) -> String {
        let backend = TestBackend::new(80, 20);
        let mut terminal = Terminal::new(backend).unwrap();

        terminal
            .draw(|frame| render(frame, model, &UiState::default()))
            .unwrap();

        terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect::<String>()
    }

    fn sample_decision() -> PendingDecision {
        PendingDecision::new(
            "request-1",
            "run shell command?",
            Some("shell".to_string()),
            vec![
                DecisionOption::new("allow", "Allow"),
                DecisionOption::new("deny", "Deny").with_description("Reject once"),
            ],
        )
    }

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }
}
