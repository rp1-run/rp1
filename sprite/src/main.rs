use std::{
    env,
    io::{self, Write},
    process::ExitCode,
};

use sprite::{
    acp::AgentLaunch,
    cli::{self, CliAction},
};

fn main() -> ExitCode {
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();

    match cli::prepare(env::args().skip(1), &mut stdout, &mut stderr) {
        Ok(CliAction::Complete(code)) => code,
        Ok(CliAction::Launch(launch)) => run_launch(launch, &mut stderr),
        Err(error) => {
            let _ = writeln!(stderr, "error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run_launch<W>(launch: AgentLaunch, stderr: &mut W) -> ExitCode
where
    W: Write,
{
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            let _ = writeln!(stderr, "error: failed to start async runtime: {error}");
            return ExitCode::FAILURE;
        }
    };

    match runtime.block_on(cli::run_launch(launch)) {
        Ok(code) => code,
        Err(error) => {
            let _ = writeln!(stderr, "error: {error}");
            ExitCode::FAILURE
        }
    }
}
