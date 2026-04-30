use assert_cmd::Command;
use predicates::str::contains;

#[test]
fn help_prints_usage() {
    let mut command = Command::cargo_bin("sprite").unwrap();

    command
        .arg("--help")
        .assert()
        .success()
        .stdout(contains("Usage:"))
        .stdout(contains("sprite launch"));
}

#[test]
fn status_reports_ready() {
    let mut command = Command::cargo_bin("sprite").unwrap();

    command
        .arg("status")
        .assert()
        .success()
        .stdout(contains("sprite: ready"));
}

#[test]
fn unknown_command_fails() {
    let mut command = Command::cargo_bin("sprite").unwrap();

    command
        .arg("unknown")
        .assert()
        .failure()
        .stderr(contains("unknown command: unknown"));
}
