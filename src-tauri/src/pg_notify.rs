/// Background task : écoute PostgreSQL LISTEN/NOTIFY pour la messagerie
/// temps-réel entre plusieurs machines sur le même réseau.
///
/// Flux :
///   Machine A  ──insert message──► pg_notify('fichat_messages', json)
///   Machine B  ──PgListener───────► reçoit json ──► hub local ──► WebView B ──► toast
///
/// Le canal « fichat_messages » transporte :
///   { conversation_id, participant_ids: [i64], message: { ...MessageDto } }
///
/// Le canal « fichat_status » transporte :
///   { conversation_id, message_id, user_id, status, notify_user_ids: [i64] }

use std::sync::Arc;
use sqlx::PgPool;
use crate::ws::{WsHub, ServerEvent};

/// Démarre le listener en arrière-plan avec reconnexion automatique.
pub fn start(pool: PgPool, hub: Arc<WsHub>) {
    tokio::spawn(async move {
        loop {
            match listen_loop(&pool, &hub).await {
                Ok(_) => {
                    tracing::info!("PG listener terminé normalement");
                    break;
                }
                Err(e) => {
                    tracing::error!(
                        "PG LISTEN crash : {}. Reconnexion dans 5 s…",
                        e
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
}

async fn listen_loop(pool: &PgPool, hub: &Arc<WsHub>) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect_with(pool).await?;
    listener
        .listen_all(["fichat_messages", "fichat_status"])
        .await?;
    tracing::info!("PG LISTEN démarré sur fichat_messages + fichat_status ✓");

    loop {
        let notif = listener.recv().await?;

        match notif.channel() {
            // ── Nouveau message ───────────────────────────────────────────────
            "fichat_messages" => {
                let Ok(data) = serde_json::from_str::<serde_json::Value>(notif.payload())
                else {
                    tracing::warn!("fichat_messages payload invalide: {}", notif.payload());
                    continue;
                };

                let conv_id = data["conversation_id"].as_i64().unwrap_or(0);
                let participants: Vec<i64> = data["participant_ids"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect())
                    .unwrap_or_default();

                let event = ServerEvent::NewMessage {
                    conversation_id: conv_id,
                    message: data["message"].clone(),
                };

                hub.broadcast_to_users(&participants, &event).await;
                tracing::debug!(
                    "PG fichat_messages → conv={} participants={:?}",
                    conv_id,
                    participants
                );
            }

            // ── Statut de livraison / lecture ─────────────────────────────────
            "fichat_status" => {
                let Ok(data) = serde_json::from_str::<serde_json::Value>(notif.payload())
                else {
                    continue;
                };

                let conv_id  = data["conversation_id"].as_i64().unwrap_or(0);
                let msg_id   = data["message_id"].as_i64().unwrap_or(0);
                let user_id  = data["user_id"].as_i64().unwrap_or(0);
                let status   = data["status"].as_str().unwrap_or("sent").to_string();
                let targets: Vec<i64> = data["notify_user_ids"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect())
                    .unwrap_or_default();

                let event = ServerEvent::MessageStatus {
                    message_id: msg_id,
                    conversation_id: conv_id,
                    user_id,
                    status,
                };
                hub.broadcast_to_users(&targets, &event).await;
            }

            other => {
                tracing::debug!("Canal PG inconnu: {}", other);
            }
        }
    }
}
