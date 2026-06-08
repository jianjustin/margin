use notify::{
    Config, Event, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Holds the active file-system watcher so it can be stopped and restarted.
pub struct WatcherState {
    _watcher: RecommendedWatcher,
    pub root: String,
    /// Setting this flag to `true` signals the debounce thread to exit.
    stop_flag: Arc<Mutex<bool>>,
}

impl Drop for WatcherState {
    fn drop(&mut self) {
        if let Ok(mut flag) = self.stop_flag.lock() {
            *flag = true;
        }
    }
}

/// Start watching `root` recursively. On any change, emits a `vault-changed`
/// event to the frontend with the root path as the payload. The watcher is
/// debounced at 300 ms so rapid edits coalesce into a single event.
pub fn start_watching(
    root: &str,
    app: AppHandle,
) -> Result<WatcherState, String> {
    let root_string = root.to_string();
    let root_for_event = root.to_string();
    let stop_flag = Arc::new(Mutex::new(false));
    let stop_flag_thread = Arc::clone(&stop_flag);

    let (tx, rx) = mpsc::channel::<Event>();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Could not create file watcher: {}", e))?;

    watcher
        .watch(Path::new(root), RecursiveMode::Recursive)
        .map_err(|e| format!("Could not watch vault: {}", e))?;

    // Debounce thread: coalesces events and emits at most once per 300 ms.
    thread::spawn(move || {
        let debounce = Duration::from_millis(300);
        let mut last_emit = Instant::now() - debounce;

        loop {
            // Check stop flag.
            if let Ok(flag) = stop_flag_thread.lock() {
                if *flag {
                    break;
                }
            }

            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(_event) => {
                    let now = Instant::now();
                    if now.duration_since(last_emit) >= debounce {
                        let _ = app.emit("vault-changed", root_for_event.clone());
                        last_emit = now;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // No events, keep looping.
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    // Watcher was dropped, exit.
                    break;
                }
            }
        }
    });

    Ok(WatcherState {
        _watcher: watcher,
        root: root_string,
        stop_flag,
    })
}
