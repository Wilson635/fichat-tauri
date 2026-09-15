use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message as WsMsg;

pub const WS_PORT: u16 = 9001;

// ─── Wire protocol ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerEvent {
    AuthOk {
        user_id: i64,
    },
    AuthError {
        message: String,
    },
    NewMessage {
        conversation_id: i64,
        message: serde_json::Value,
    },
    MessageStatus {
        message_id: i64,
        conversation_id: i64,
        user_id: i64,
        status: String,
    },
    Typing {
        conversation_id: i64,
        user_id: i64,
        display_name: String,
        is_typing: bool,
    },
    Presence {
        user_id: i64,
        status: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientEvent {
    Auth {
        token: String,
    },
    Typing {
        conversation_id: i64,
    },
    StopTyping {
        conversation_id: i64,
    },
}

// ─── Hub ─────────────────────────────────────────────────────────────────────

/// Maintains one broadcast channel per online user.
/// Other parts of the app (e.g. Tauri commands) hold an `Arc<WsHub>` and call
/// `send_to_user` / `broadcast_to_users` to push real-time events.
pub struct WsHub {
    user_senders: RwLock<HashMap<i64, broadcast::Sender<String>>>,
}

impl WsHub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            user_senders: RwLock::new(HashMap::new()),
        })
    }

    pub async fn send_to_user(&self, user_id: i64, event: &ServerEvent) {
        if let Ok(json) = serde_json::to_string(event) {
            let senders = self.user_senders.read().await;
            if let Some(tx) = senders.get(&user_id) {
                let _ = tx.send(json);
            }
        }
    }

    pub async fn broadcast_to_users(&self, user_ids: &[i64], event: &ServerEvent) {
        if let Ok(json) = serde_json::to_string(event) {
            let senders = self.user_senders.read().await;
            for uid in user_ids {
                if let Some(tx) = senders.get(uid) {
                    let _ = tx.send(json.clone());
                }
            }
        }
    }

    async fn register(&self, user_id: i64) -> broadcast::Receiver<String> {
        let mut senders = self.user_senders.write().await;
        if let Some(tx) = senders.get(&user_id) {
            return tx.subscribe();
        }
        let (tx, rx) = broadcast::channel::<String>(512);
        senders.insert(user_id, tx);
        rx
    }

    async fn unregister(&self, user_id: i64) {
        let mut senders = self.user_senders.write().await;
        senders.remove(&user_id);
    }
}

// ─── Server ───────────────────────────────────────────────────────────────────

pub async fn start_ws_server(
    hub: Arc<WsHub>,
    pool: sqlx::PgPool,
    jwt_secret: String,
) {
    let addr = format!("127.0.0.1:{}", WS_PORT);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            tracing::info!("WebSocket server listening on ws://{}", addr);
            l
        }
        Err(e) => {
            tracing::error!("Failed to bind WebSocket server on {}: {}", addr, e);
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                let hub = hub.clone();
                let pool = pool.clone();
                let secret = jwt_secret.clone();
                tokio::spawn(handle_connection(stream, peer, hub, pool, secret));
            }
            Err(e) => tracing::warn!("WS accept error: {}", e),
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    hub: Arc<WsHub>,
    pool: sqlx::PgPool,
    jwt_secret: String,
) {
    tracing::debug!("WS new connection from {}", peer);

    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            tracing::warn!("WS handshake failed from {}: {}", peer, e);
            return;
        }
    };

    let (mut writer, mut reader) = ws.split();

    // ── Phase 1: authentication ──────────────────────────────────────────────
    let user_id = loop {
        match reader.next().await {
            Some(Ok(WsMsg::Text(text))) => {
                match serde_json::from_str::<ClientEvent>(&text) {
                    Ok(ClientEvent::Auth { token }) => {
                        match decode_user_id(&token, &jwt_secret) {
                            Ok(uid) => {
                                let ok = serde_json::to_string(&ServerEvent::AuthOk { user_id: uid })
                                    .unwrap_or_default();
                                let _ = writer.send(WsMsg::Text(ok.into())).await;
                                break uid;
                            }
                            Err(_) => {
                                let err = serde_json::to_string(&ServerEvent::AuthError {
                                    message: "Token invalide ou expiré".into(),
                                })
                                .unwrap_or_default();
                                let _ = writer.send(WsMsg::Text(err.into())).await;
                                return;
                            }
                        }
                    }
                    _ => {} // ignore non-Auth messages
                }
            }
            _ => return,
        }
    };

    // ── Phase 2: register + main loop ────────────────────────────────────────
    let mut rx = hub.register(user_id).await;
    set_presence(&pool, user_id, "online").await;

    loop {
        tokio::select! {
            // Outgoing: hub broadcast → client
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(msg) => {
                        if writer.send(WsMsg::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
            // Incoming: client → hub
            client_msg = reader.next() => {
                match client_msg {
                    Some(Ok(WsMsg::Text(text))) => {
                        if let Ok(event) = serde_json::from_str::<ClientEvent>(&text) {
                            dispatch_client_event(event, user_id, &hub, &pool).await;
                        }
                    }
                    Some(Ok(WsMsg::Ping(data))) => {
                        let _ = writer.send(WsMsg::Pong(data)).await;
                    }
                    Some(Ok(WsMsg::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    hub.unregister(user_id).await;
    set_presence(&pool, user_id, "offline").await;
    tracing::debug!("WS connection closed for user_id={}", user_id);
}

async fn dispatch_client_event(
    event: ClientEvent,
    sender_id: i64,
    hub: &Arc<WsHub>,
    pool: &sqlx::PgPool,
) {
    match event {
        ClientEvent::Typing { conversation_id } | ClientEvent::StopTyping { conversation_id } => {
            let is_typing = matches!(event, ClientEvent::Typing { .. });
            let name = get_display_name(pool, sender_id).await;
            let participants = get_participants(pool, conversation_id).await;
            hub.broadcast_to_users(
                &participants,
                &ServerEvent::Typing {
                    conversation_id,
                    user_id: sender_id,
                    display_name: name,
                    is_typing,
                },
            )
            .await;
        }
        ClientEvent::Auth { .. } => {} // already handled in phase 1
    }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async fn set_presence(pool: &sqlx::PgPool, user_id: i64, status: &str) {
    let _ = sqlx::query(
        "INSERT INTO user_presence (user_id, status, last_heartbeat) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET status = $2, last_heartbeat = NOW()",
    )
    .bind(user_id)
    .bind(status)
    .execute(pool)
    .await;
}

async fn get_display_name(pool: &sqlx::PgPool, user_id: i64) -> String {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT display_name FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    row.map(|(n,)| n).unwrap_or_default()
}

async fn get_participants(pool: &sqlx::PgPool, conversation_id: i64) -> Vec<i64> {
    let rows: Vec<(i64,)> = sqlx::query_as(
        "SELECT user_id FROM conversation_participants WHERE conversation_id = $1",
    )
    .bind(conversation_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

// ─── JWT helper ──────────────────────────────────────────────────────────────

fn decode_user_id(token: &str, secret: &str) -> Result<i64, ()> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

    #[derive(serde::Deserialize)]
    struct Claims {
        user_id: i64,
    }

    let key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);
    decode::<Claims>(token, &key, &validation)
        .map(|d| d.claims.user_id)
        .map_err(|_| ())
}
