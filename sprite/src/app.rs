#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppStatus {
    Idle,
    PreparingLaunch,
    Running,
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppModel {
    title: String,
    status: AppStatus,
}

impl AppModel {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            status: AppStatus::Idle,
        }
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn status(&self) -> &AppStatus {
        &self.status
    }

    pub fn set_status(&mut self, status: AppStatus) {
        self.status = status;
    }

    pub fn status_label(&self) -> String {
        match &self.status {
            AppStatus::Idle => "idle".to_string(),
            AppStatus::PreparingLaunch => "preparing launch".to_string(),
            AppStatus::Running => "running".to_string(),
            AppStatus::Failed(message) => format!("failed: {message}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppModel, AppStatus};

    #[test]
    fn status_label_reflects_current_state() {
        let mut model = AppModel::new("sprite");

        assert_eq!(model.title(), "sprite");
        assert_eq!(model.status_label(), "idle");

        model.set_status(AppStatus::PreparingLaunch);
        assert_eq!(model.status_label(), "preparing launch");
    }
}
