use std::{env, error::Error, fmt, io, io::Write, path::PathBuf, process::ExitCode};

use crate::acp::{AcpConfigError, AgentLaunch};

const HELP: &str = "\
sprite - terminal ACP client for rp1 harness workflows

Usage:
  sprite [--help]
  sprite [--version]
  sprite status
  sprite launch [--workdir <path>] <agent-command> [-- <agent-args>...]

Commands:
  status    Print current client readiness
  launch    Validate and prepare an ACP agent launch request
";

#[derive(Debug, Clone, PartialEq, Eq)]
enum Command {
    Help,
    Version,
    Status,
    Launch(LaunchOptions),
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
    match run_inner(args, &mut stdout, &mut stderr) {
        Ok(code) => code,
        Err(error) => {
            let _ = writeln!(stderr, "error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run_inner<I, S, Stdout, Stderr>(
    args: I,
    stdout: &mut Stdout,
    _stderr: &mut Stderr,
) -> Result<ExitCode, CliError>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
    Stdout: Write,
    Stderr: Write,
{
    match parse(args)? {
        Command::Help => {
            write!(stdout, "{HELP}")?;
            Ok(ExitCode::SUCCESS)
        }
        Command::Version => {
            writeln!(stdout, "sprite {}", env!("CARGO_PKG_VERSION"))?;
            Ok(ExitCode::SUCCESS)
        }
        Command::Status => {
            writeln!(stdout, "sprite: ready")?;
            Ok(ExitCode::SUCCESS)
        }
        Command::Launch(options) => {
            let workdir = absolute_workdir(options.workdir)?;
            let launch = AgentLaunch::new(options.command, options.args, workdir)?;

            writeln!(
                stdout,
                "sprite: launch request prepared for {} in {}",
                launch.command(),
                launch.workdir().display()
            )?;
            Ok(ExitCode::SUCCESS)
        }
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
enum CliError {
    UnknownCommand(String),
    MissingValue(&'static str),
    MissingAgentCommand,
    Io(io::Error),
    Acp(AcpConfigError),
}

impl fmt::Display for CliError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::UnknownCommand(command) => write!(formatter, "unknown command: {command}"),
            CliError::MissingValue(option) => write!(formatter, "missing value for {option}"),
            CliError::MissingAgentCommand => write!(formatter, "launch requires an agent command"),
            CliError::Io(error) => write!(formatter, "{error}"),
            CliError::Acp(error) => write!(formatter, "{error}"),
        }
    }
}

impl Error for CliError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            CliError::Io(error) => Some(error),
            CliError::Acp(error) => Some(error),
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

#[cfg(test)]
mod tests {
    use super::run;

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
}
