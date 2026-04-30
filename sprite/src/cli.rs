use std::{env, error::Error, fmt, io, io::Write, path::PathBuf, process::ExitCode};

use crate::{
    acp::{AcpConfigError, AgentLaunch},
    session::{SessionController, SessionError, UiCommand},
    ui::{self, UiError},
};

const HELP: &str = "\
sprite - terminal ACP client for rp1 harness workflows

Usage:
  sprite [--help]
  sprite [--version]
  sprite status
  sprite launch [--workdir <path>] <agent-command> [-- <agent-args>...]

Commands:
  status    Print current client readiness
  launch    Start an ACP terminal harness for an agent command
";

#[derive(Debug, Clone, PartialEq, Eq)]
enum Command {
    Help,
    Version,
    Status,
    Launch(LaunchOptions),
}

#[derive(Debug)]
pub enum CliAction {
    Complete(ExitCode),
    Launch(AgentLaunch),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LaunchOptions {
    command: String,
    args: Vec<String>,
    workdir: Option<PathBuf>,
}

pub fn run<I, S, Stdout, Stderr>(args: I, mut stdout: Stdout, mut stderr: Stderr) -> ExitCode
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
    Stdout: Write,
    Stderr: Write,
{
    match prepare(args, &mut stdout, &mut stderr) {
        Ok(CliAction::Complete(code)) => code,
        Ok(CliAction::Launch(_)) => ExitCode::SUCCESS,
        Err(error) => {
            let _ = writeln!(stderr, "error: {error}");
            ExitCode::FAILURE
        }
    }
}

pub fn prepare<I, S, Stdout, Stderr>(
    args: I,
    stdout: &mut Stdout,
    _stderr: &mut Stderr,
) -> Result<CliAction, CliError>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
    Stdout: Write,
    Stderr: Write,
{
    match parse(args)? {
        Command::Help => {
            write!(stdout, "{HELP}")?;
            Ok(CliAction::Complete(ExitCode::SUCCESS))
        }
        Command::Version => {
            writeln!(stdout, "sprite {}", env!("CARGO_PKG_VERSION"))?;
            Ok(CliAction::Complete(ExitCode::SUCCESS))
        }
        Command::Status => {
            writeln!(stdout, "sprite: ready")?;
            Ok(CliAction::Complete(ExitCode::SUCCESS))
        }
        Command::Launch(options) => {
            let workdir = absolute_workdir(options.workdir)?;
            let launch = AgentLaunch::new(options.command, options.args, workdir)?;

            Ok(CliAction::Launch(launch))
        }
    }
}

pub async fn run_launch(launch: AgentLaunch) -> Result<ExitCode, CliError> {
    let (controller, channels) = SessionController::new(launch);
    let shutdown_tx = channels.commands.clone();
    let controller_run = controller.run();
    let ui_run = ui::run_terminal_harness(channels);

    tokio::pin!(controller_run);
    tokio::pin!(ui_run);

    let mut controller_result = None;

    loop {
        tokio::select! {
            ui_result = &mut ui_run => {
                if controller_result.is_none() {
                    let _ = shutdown_tx.send(UiCommand::Shutdown).await;
                    controller_result = Some((&mut controller_run).await);
                }

                ui_result?;
                return Ok(exit_code_for_controller(controller_result.as_ref()));
            }
            result = &mut controller_run, if controller_result.is_none() => {
                controller_result = Some(result);
            }
        }
    }
}

fn exit_code_for_controller(result: Option<&Result<(), SessionError>>) -> ExitCode {
    match result {
        Some(Err(_)) => ExitCode::FAILURE,
        _ => ExitCode::SUCCESS,
    }
}

fn parse<I, S>(args: I) -> Result<Command, CliError>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut args = args.into_iter().map(Into::into);
    let Some(first) = args.next() else {
        return Ok(Command::Help);
    };

    match first.as_str() {
        "-h" | "--help" | "help" => Ok(Command::Help),
        "-V" | "--version" | "version" => Ok(Command::Version),
        "status" => Ok(Command::Status),
        "launch" => parse_launch(args.collect()),
        command => Err(CliError::UnknownCommand(command.to_string())),
    }
}

fn parse_launch(args: Vec<String>) -> Result<Command, CliError> {
    let mut index = 0;
    let mut workdir = None;
    let mut command = None;
    let mut agent_args = Vec::new();

    while index < args.len() {
        match args[index].as_str() {
            "--workdir" => {
                index += 1;
                let Some(path) = args.get(index) else {
                    return Err(CliError::MissingValue("--workdir"));
                };
                workdir = Some(PathBuf::from(path));
            }
            "--" => {
                index += 1;
                agent_args.extend(args[index..].iter().cloned());
                break;
            }
            value if command.is_none() => {
                command = Some(value.to_string());
            }
            value => {
                agent_args.push(value.to_string());
            }
        }

        index += 1;
    }

    let Some(command) = command else {
        return Err(CliError::MissingAgentCommand);
    };

    Ok(Command::Launch(LaunchOptions {
        command,
        args: agent_args,
        workdir,
    }))
}

fn absolute_workdir(workdir: Option<PathBuf>) -> Result<PathBuf, CliError> {
    let workdir = match workdir {
        Some(path) => path,
        None => env::current_dir()?,
    };

    if workdir.is_absolute() {
        return Ok(workdir);
    }

    Ok(env::current_dir()?.join(workdir))
}

#[derive(Debug)]
pub enum CliError {
    UnknownCommand(String),
    MissingValue(&'static str),
    MissingAgentCommand,
    Io(io::Error),
    Acp(AcpConfigError),
    Ui(UiError),
}

impl fmt::Display for CliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::UnknownCommand(command) => write!(formatter, "unknown command: {command}"),
            CliError::MissingValue(option) => write!(formatter, "missing value for {option}"),
            CliError::MissingAgentCommand => write!(formatter, "launch requires an agent command"),
            CliError::Io(error) => write!(formatter, "{error}"),
            CliError::Acp(error) => write!(formatter, "{error}"),
            CliError::Ui(error) => write!(formatter, "{error}"),
        }
    }
}

impl Error for CliError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            CliError::Io(error) => Some(error),
            CliError::Acp(error) => Some(error),
            CliError::Ui(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for CliError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<AcpConfigError> for CliError {
    fn from(error: AcpConfigError) -> Self {
        Self::Acp(error)
    }
}

impl From<UiError> for CliError {
    fn from(error: UiError) -> Self {
        Self::Ui(error)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{CliAction, exit_code_for_controller, prepare, run};
    use crate::session::SessionError;

    #[test]
    fn help_is_default_command() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        let code = run(Vec::<String>::new(), &mut stdout, &mut stderr);

        assert_eq!(code, std::process::ExitCode::SUCCESS);
        assert!(String::from_utf8(stdout).unwrap().contains("Usage:"));
        assert!(stderr.is_empty());
    }

    #[test]
    fn launch_requires_agent_command() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        let code = run(["launch"], &mut stdout, &mut stderr);

        assert_eq!(code, std::process::ExitCode::FAILURE);
        assert!(stdout.is_empty());
        assert!(String::from_utf8(stderr).unwrap().contains("agent command"));
    }

    #[test]
    fn version_is_a_synchronous_complete_action() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        let action = prepare(["--version"], &mut stdout, &mut stderr).unwrap();

        assert!(matches!(action, CliAction::Complete(_)));
        assert!(String::from_utf8(stdout).unwrap().starts_with("sprite "));
        assert!(stderr.is_empty());
    }

    #[test]
    fn launch_returns_action_without_prepared_output() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        let action = prepare(
            [
                "launch",
                "--workdir",
                "/tmp/project",
                "bunx",
                "--",
                "@zed-industries/codex-acp",
            ],
            &mut stdout,
            &mut stderr,
        )
        .unwrap();

        let CliAction::Launch(launch) = action else {
            panic!("expected launch action");
        };

        assert_eq!(launch.command(), "bunx");
        assert_eq!(launch.args(), ["@zed-industries/codex-acp"]);
        assert_eq!(launch.workdir(), Path::new("/tmp/project"));
        assert!(stdout.is_empty());
        assert!(stderr.is_empty());
    }

    #[test]
    fn launch_parses_github_copilot_acp_reference_command() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();

        let action = prepare(
            [
                "launch",
                "--workdir",
                "/tmp/project",
                "gh",
                "--",
                "copilot",
                "--",
                "--acp",
            ],
            &mut stdout,
            &mut stderr,
        )
        .unwrap();

        let CliAction::Launch(launch) = action else {
            panic!("expected launch action");
        };

        assert_eq!(launch.command(), "gh");
        assert_eq!(launch.args(), ["copilot", "--", "--acp"]);
        assert_eq!(launch.workdir(), Path::new("/tmp/project"));
        assert!(stdout.is_empty());
        assert!(stderr.is_empty());
    }

    #[test]
    fn launch_normalizes_relative_workdir_for_reference_command() {
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let cwd = std::env::current_dir().unwrap();

        let action = prepare(
            [
                "launch",
                "--workdir",
                "relative-project",
                "gh",
                "--",
                "copilot",
                "--",
                "--acp",
            ],
            &mut stdout,
            &mut stderr,
        )
        .unwrap();

        let CliAction::Launch(launch) = action else {
            panic!("expected launch action");
        };

        assert_eq!(launch.command(), "gh");
        assert_eq!(launch.args(), ["copilot", "--", "--acp"]);
        assert_eq!(launch.workdir(), cwd.join("relative-project"));
        assert!(stdout.is_empty());
        assert!(stderr.is_empty());
    }

    #[test]
    fn launch_exits_failure_when_controller_failed() {
        let result = Err(SessionError::EventReceiverDropped);

        assert_eq!(
            exit_code_for_controller(Some(&result)),
            std::process::ExitCode::FAILURE
        );
        assert_eq!(
            exit_code_for_controller(None),
            std::process::ExitCode::SUCCESS
        );
    }
}
