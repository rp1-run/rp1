use std::{env, io, process::ExitCode};

fn main() -> ExitCode {
    sprite::cli::run(env::args().skip(1), io::stdout(), io::stderr())
}
