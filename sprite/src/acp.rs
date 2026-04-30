use std::{
    error::Error,
    fmt,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentLaunch {
    command: String,
    args: Vec<String>,
    workdir: PathBuf,
}

impl AgentLaunch {
    pub fn new(
        command: impl Into<String>,
        args: Vec<String>,
        workdir: impl Into<PathBuf>,
    ) -> Result<Self, AcpConfigError> {
        let command = command.into();
        if command.trim().is_empty() {
            return Err(AcpConfigError::MissingCommand);
        }

        let workdir = workdir.into();
        if !workdir.is_absolute() {
            return Err(AcpConfigError::RelativeWorkdir(workdir));
        }

        Ok(Self {
            command,
            args,
            workdir,
        })
    }

    pub fn command(&self) -> &str {
        &self.command
    }

    pub fn args(&self) -> &[String] {
        &self.args
    }

    pub fn workdir(&self) -> &Path {
        &self.workdir
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcpConfigError {
    MissingCommand,
    RelativeWorkdir(PathBuf),
}

impl fmt::Display for AcpConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AcpConfigError::MissingCommand => write!(formatter, "agent command is required"),
            AcpConfigError::RelativeWorkdir(path) => write!(
                formatter,
                "ACP workdir paths must be absolute: {}",
                path.display()
            ),
        }
    }
}

impl Error for AcpConfigError {}

#[cfg(test)]
mod tests {
    use super::{AcpConfigError, AgentLaunch};

    #[test]
    fn launch_requires_absolute_workdir() {
        let error = AgentLaunch::new("codex", Vec::new(), "relative/path").unwrap_err();

        assert!(matches!(error, AcpConfigError::RelativeWorkdir(_)));
    }

    #[test]
    fn launch_accepts_command_args_and_absolute_workdir() {
        let launch = AgentLaunch::new(
            "codex",
            vec!["--model".to_string(), "gpt-5".to_string()],
            "/tmp/project",
        )
        .unwrap();

        assert_eq!(launch.command(), "codex");
        assert_eq!(launch.args(), ["--model", "gpt-5"]);
        assert_eq!(launch.workdir().to_string_lossy(), "/tmp/project");
    }
}
