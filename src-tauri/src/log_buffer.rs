//! In-memory ring buffer of tracing events, mirrored to the admin UI.
//! Same lines you see in the `npm run tauri dev` / cargo terminal.

use serde::Serialize;
use std::cell::Cell;
use std::collections::VecDeque;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

const MAX_ENTRIES: usize = 4000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLog {
    pub id: u64,
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub code: String,
}

static BUFFER: OnceLock<Mutex<VecDeque<RuntimeLog>>> = OnceLock::new();
static SEQ: AtomicU64 = AtomicU64::new(1);

thread_local! {
    static IN_LAYER: Cell<bool> = Cell::new(false);
}

fn buffer() -> &'static Mutex<VecDeque<RuntimeLog>> {
    BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_ENTRIES)))
}

pub fn snapshot() -> Vec<RuntimeLog> {
    buffer()
        .lock()
        .map(|b| b.iter().cloned().collect())
        .unwrap_or_default()
}

pub fn format_all() -> String {
    snapshot()
        .into_iter()
        .map(|e| format_line(&e))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn format_line(e: &RuntimeLog) -> String {
    format!("{} {} {} :: {}", e.timestamp, e.level, e.target, e.message)
}

fn push(entry: RuntimeLog) {
    if let Ok(mut b) = buffer().lock() {
        if b.len() >= MAX_ENTRIES {
            b.pop_front();
        }
        b.push_back(entry.clone());
    }
    let _ = writeln!(std::io::stderr(), "{}", format_line(&entry));
    crate::log_archive::enqueue(&entry);
}

struct MessageVisitor {
    message: String,
    extra: Vec<String>,
}

impl Visit for MessageVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else if field.name() != "log.target" && field.name() != "log.module_path" {
            self.extra.push(format!("{}={}", field.name(), value));
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        let raw = format!("{value:?}");
        let s = raw
            .strip_prefix('"')
            .and_then(|x| x.strip_suffix('"'))
            .unwrap_or(&raw);
        if field.name() == "message" {
            self.message = s.to_string();
        } else if field.name() != "log.target" && field.name() != "log.module_path" {
            self.extra.push(format!("{}={}", field.name(), s));
        }
    }
}

pub struct CaptureLayer;

impl<S> Layer<S> for CaptureLayer
where
    S: Subscriber,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if IN_LAYER.with(Cell::get) {
            return;
        }
        IN_LAYER.with(|c| c.set(true));

        let meta = event.metadata();
        let mut vis = MessageVisitor {
            message: String::new(),
            extra: Vec::new(),
        };
        event.record(&mut vis);

        let mut message = vis.message;
        if !vis.extra.is_empty() {
            if !message.is_empty() {
                message.push(' ');
            }
            message.push_str(&vis.extra.join(" "));
        }
        if message.is_empty() {
            message = meta.name().to_string();
        }
        message = crate::log_seal::sanitize(&message);

        let target = crate::log_seal::short_target(meta.target());
        let code = crate::log_seal::event_code(&target, &message);

        push(RuntimeLog {
            id: SEQ.fetch_add(1, Ordering::Relaxed),
            timestamp: crate::log_seal::stamp_local(),
            level: meta.level().as_str().to_uppercase(),
            target,
            message,
            code,
        });

        IN_LAYER.with(|c| c.set(false));
    }
}
