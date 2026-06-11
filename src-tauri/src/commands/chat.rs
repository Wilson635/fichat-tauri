use crate::{ws, SharedState};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;
use tauri::Manager;

// ─── JWT ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Claims {
    user_id: i64,
}

/// Decode the JWT and return the user_id as i32 (DB uses SERIAL = INTEGER).
fn extract_uid(token: &str, secret: &str) -> Result<i32, String> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let val = Validation::new(Algorithm::HS256);
    let uid = decode::<Claims>(token, &key, &val)
        .map(|d| d.claims.user_id)
        .map_err(|_| "Session expirée ou invalide".to_string())?;
    Ok(uid as i32)
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct ParticipantInfo {
    pub user_id: i32,
    pub display_name: String,
    pub avatar_path: Option<String>,
    pub presence_status: String,
    pub role: String, // "admin" | "member"
}

#[derive(Debug, Serialize)]
pub struct ConversationSummary {
    pub id: i32,
    pub conv_type: String,
    pub name: String,
    pub avatar_path: Option<String>,
    pub last_message: Option<String>,
    pub last_message_at: Option<DateTime<Utc>>,
    pub unread_count: i64,
    pub participants: Vec<ParticipantInfo>,
    pub created_by_name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MessageDto {
    pub id: i32,
    pub conversation_id: i32,
    pub sender_id: Option<i32>,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub content: Option<String>,
    pub message_type: String,
    pub reply_to_id: Option<i32>,
    pub reply_to_content: Option<String>,
    pub is_edited: bool,
    pub is_deleted: bool,
    pub created_at: DateTime<Utc>,
    pub status: String,
    pub attachments: Vec<AttachmentDto>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AttachmentDto {
    pub id: i32,
    pub file_name: String,
    pub file_path: String,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserForChat {
    pub id: i32,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub avatar_path: Option<String>,
    pub presence_status: String,
}

// ─── GET CONVERSATIONS ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_conversations(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<ConversationSummary>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    tracing::info!("cmd_get_conversations: uid={}", uid);

    let rows = sqlx::query(
        r#"
        SELECT
            c.id                                                          AS id,
            c.type                                                        AS conv_type,
            CASE
                WHEN c.type = 'group' THEN g.name
                ELSE (
                    SELECT u2.display_name
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                    LIMIT 1
                )
            END                                                           AS name,
            CASE
                WHEN c.type = 'group' THEN g.avatar_path
                ELSE (
                    SELECT u2.avatar_path
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                    LIMIT 1
                )
            END                                                           AS avatar_path,
            CASE
                WHEN c.type = 'group' THEN (
                    SELECT u3.display_name FROM users u3 WHERE u3.id = g.created_by
                )
                ELSE NULL
            END                                                           AS created_by_name,
            (
                SELECT LEFT(m.content, 100)
                FROM messages m
                WHERE m.conversation_id = c.id AND m.is_deleted = false
                ORDER BY m.created_at DESC LIMIT 1
            )                                                             AS last_message,
            (
                SELECT m.created_at
                FROM messages m
                WHERE m.conversation_id = c.id AND m.is_deleted = false
                ORDER BY m.created_at DESC LIMIT 1
            )                                                             AS last_message_at,
            (
                SELECT COUNT(*)
                FROM messages m2
                WHERE m2.conversation_id = c.id
                  AND m2.sender_id <> $1
                  AND m2.is_deleted = false
                  AND NOT EXISTS (
                      SELECT 1 FROM message_status ms
                      WHERE ms.message_id = m2.id AND ms.user_id = $1 AND ms.status = 'read'
                  )
            )                                                             AS unread_count
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
        LEFT JOIN groups g ON g.id = c.group_id
        ORDER BY last_message_at DESC NULLS LAST
        "#,
    )
    .bind(uid)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!("cmd_get_conversations DB error: {}", e);
        format!("Erreur DB : {e}")
    })?;

    tracing::info!("cmd_get_conversations: {} conversations trouvées", rows.len());

    let mut conversations = Vec::with_capacity(rows.len());

    for row in rows {
        let conv_id: i32 = row.try_get::<i32, _>("id").map_err(|e| {
            tracing::error!("Erreur lecture id conversation: {}", e);
            format!("Erreur lecture id: {e}")
        })?;
        let conv_type: String = row.try_get("conv_type").unwrap_or_else(|_| "direct".into());
        let name: String = row.try_get("name").unwrap_or_else(|_| "(Sans nom)".into());
        let avatar_path: Option<String> = row.try_get("avatar_path").ok().flatten();
        let last_message: Option<String> = row.try_get("last_message").ok().flatten();
        let last_message_at: Option<DateTime<Utc>> = row.try_get("last_message_at").ok().flatten();
        let unread_count: i64 = row.try_get("unread_count").unwrap_or(0);

        // Load participants with their role
        let prows = sqlx::query(
            r#"
            SELECT
                u.id,
                u.display_name,
                u.avatar_path,
                COALESCE(up.status, 'offline') AS presence_status,
                COALESCE(gm.role, 'member')    AS role
            FROM conversation_participants cp
            JOIN users u ON u.id = cp.user_id
            LEFT JOIN user_presence up ON up.user_id = u.id
            LEFT JOIN groups g2 ON g2.id = (
                SELECT group_id FROM conversations WHERE id = $1
            )
            LEFT JOIN group_members gm ON gm.group_id = g2.id AND gm.user_id = u.id
            WHERE cp.conversation_id = $1
            "#,
        )
        .bind(conv_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let participants = prows
            .iter()
            .map(|pr| {
                let pid: i32 = pr.try_get::<i32, _>("id").unwrap_or_default();
                ParticipantInfo {
                    user_id: pid,
                    display_name: pr.try_get("display_name").unwrap_or_default(),
                    avatar_path: pr.try_get("avatar_path").ok().flatten(),
                    presence_status: pr.try_get("presence_status").unwrap_or_else(|_| "offline".into()),
                    role: pr.try_get("role").unwrap_or_else(|_| "member".into()),
                }
            })
            .collect();

        tracing::debug!(
            "Conversation id={} type={} name='{}' participants={}",
            conv_id, conv_type, name, prows.len()
        );

        conversations.push(ConversationSummary {
            id: conv_id,
            conv_type,
            name,
            avatar_path,
            last_message,
            last_message_at,
            unread_count,
            participants,
            created_by_name: row.try_get("created_by_name").ok().flatten(),
        });
    }

    Ok(conversations)
}

// ─── GET MESSAGES ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_messages(
    token: String,
    conversation_id: i32,
    limit: Option<i32>,
    before_id: Option<i32>,
    state: State<'_, SharedState>,
) -> Result<Vec<MessageDto>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    let page_size = limit.unwrap_or(50).clamp(1, 200);

    tracing::info!("cmd_get_messages: uid={} conv={} limit={} before={:?}", uid, conversation_id, page_size, before_id);

    // Verify participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
    .bind(conversation_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_member {
        tracing::warn!("cmd_get_messages: user {} not in conversation {}", uid, conversation_id);
        return Err("Accès refusé à cette conversation".to_string());
    }

    let rows = if let Some(bid) = before_id {
        sqlx::query(
            r#"
            SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
                   m.reply_to_id, m.is_edited, m.is_deleted, m.created_at,
                   u.display_name AS sender_name, u.avatar_path AS sender_avatar,
                   rm.content AS reply_to_content,
                   COALESCE(
                       (SELECT ms.status FROM message_status ms
                        WHERE ms.message_id = m.id
                        ORDER BY CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
                        LIMIT 1),
                       'sent'
                   ) AS status
            FROM messages m
            LEFT JOIN users u ON u.id = m.sender_id
            LEFT JOIN messages rm ON rm.id = m.reply_to_id
            WHERE m.conversation_id = $1 AND m.id < $2
            ORDER BY m.id DESC
            LIMIT $3
            "#,
        )
        .bind(conversation_id)
        .bind(bid)
        .bind(page_size)
        .fetch_all(&pool)
        .await
        .map_err(|e| { tracing::error!("cmd_get_messages DB error: {}", e); format!("Erreur DB : {e}") })?
    } else {
        sqlx::query(
            r#"
            SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
                   m.reply_to_id, m.is_edited, m.is_deleted, m.created_at,
                   u.display_name AS sender_name, u.avatar_path AS sender_avatar,
                   rm.content AS reply_to_content,
                   COALESCE(
                       (SELECT ms.status FROM message_status ms
                        WHERE ms.message_id = m.id
                        ORDER BY CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
                        LIMIT 1),
                       'sent'
                   ) AS status
            FROM messages m
            LEFT JOIN users u ON u.id = m.sender_id
            LEFT JOIN messages rm ON rm.id = m.reply_to_id
            WHERE m.conversation_id = $1
            ORDER BY m.id DESC
            LIMIT $2
            "#,
        )
        .bind(conversation_id)
        .bind(page_size)
        .fetch_all(&pool)
        .await
        .map_err(|e| { tracing::error!("cmd_get_messages DB error: {}", e); format!("Erreur DB : {e}") })?
    };

    tracing::info!("cmd_get_messages: {} messages trouvés pour conv={}", rows.len(), conversation_id);

    let mut messages = Vec::with_capacity(rows.len());
    for row in &rows {
        let msg_id: i32 = row.try_get::<i32, _>("id").unwrap_or_default();

        let att_rows = sqlx::query(
            "SELECT id, file_name, file_path, file_type, file_size, thumbnail
             FROM attachments WHERE message_id = $1",
        )
        .bind(msg_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let attachments = att_rows
            .iter()
            .map(|ar| AttachmentDto {
                id: ar.try_get::<i32, _>("id").unwrap_or_default(),
                file_name: ar.try_get("file_name").unwrap_or_default(),
                file_path: ar.try_get("file_path").unwrap_or_default(),
                file_type: ar.try_get("file_type").ok().flatten(),
                file_size: ar.try_get("file_size").ok().flatten(),
                thumbnail: ar.try_get("thumbnail").ok().flatten(),
            })
            .collect();

        messages.push(MessageDto {
            id: msg_id,
            conversation_id: row.try_get::<i32, _>("conversation_id").unwrap_or_default(),
            sender_id: row.try_get::<Option<i32>, _>("sender_id").ok().flatten(),
            sender_name: row.try_get("sender_name").ok().flatten(),
            sender_avatar: row.try_get("sender_avatar").ok().flatten(),
            content: row.try_get("content").ok().flatten(),
            message_type: row.try_get("message_type").unwrap_or_else(|_| "text".into()),
            reply_to_id: row.try_get::<Option<i32>, _>("reply_to_id").ok().flatten(),
            reply_to_content: row.try_get("reply_to_content").ok().flatten(),
            is_edited: row.try_get("is_edited").unwrap_or(false),
            is_deleted: row.try_get("is_deleted").unwrap_or(false),
            created_at: row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
            status: row.try_get("status").unwrap_or_else(|_| "sent".into()),
            attachments,
        });
    }

    messages.reverse();
    Ok(messages)
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_send_message(
    token: String,
    conversation_id: i32,
    content: String,
    message_type: Option<String>,
    reply_to_id: Option<i32>,
    state: State<'_, SharedState>,
) -> Result<MessageDto, String> {
    let (pool, jwt_secret, hub) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
            s.ws_hub.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;
    let msg_type = message_type.unwrap_or_else(|| "text".into());

    tracing::info!("cmd_send_message: uid={} conv={} type={}", uid, conversation_id, msg_type);

    // Verify participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
    .bind(conversation_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_member {
        tracing::warn!("cmd_send_message: user {} not in conversation {}", uid, conversation_id);
        return Err("Accès refusé à cette conversation".to_string());
    }

    // Insert message
    let row = sqlx::query(
        r#"
        INSERT INTO messages (conversation_id, sender_id, content, message_type, reply_to_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
        "#,
    )
    .bind(conversation_id)
    .bind(uid)
    .bind(&content)
    .bind(&msg_type)
    .bind(reply_to_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!("cmd_send_message INSERT error: {}", e);
        format!("Erreur insertion message : {e}")
    })?;

    let msg_id: i32 = row.try_get::<i32, _>("id").map_err(|e| {
        tracing::error!("cmd_send_message lecture id: {}", e);
        format!("Erreur lecture id message: {e}")
    })?;
    let created_at: DateTime<Utc> = row.try_get("created_at").unwrap_or_else(|_| Utc::now());

    tracing::info!("cmd_send_message: message id={} inséré dans conv={}", msg_id, conversation_id);

    // Insert sent status
    sqlx::query(
        "INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, 'sent')
         ON CONFLICT DO NOTHING",
    )
    .bind(msg_id)
    .bind(uid)
    .execute(&pool)
    .await
    .ok();

    // Sender info
    let (sender_name, sender_avatar): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT display_name, avatar_path FROM users WHERE id = $1",
    )
    .bind(uid)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None)
    .map(|(n, a)| (Some(n), a))
    .unwrap_or((None, None));

    let reply_to_content: Option<String> = if let Some(rid) = reply_to_id {
        sqlx::query_as::<_, (Option<String>,)>("SELECT content FROM messages WHERE id = $1")
            .bind(rid)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
            .and_then(|(c,)| c)
    } else {
        None
    };

    let dto = MessageDto {
        id: msg_id,
        conversation_id,
        sender_id: Some(uid),
        sender_name: sender_name.clone(),
        sender_avatar: sender_avatar.clone(),
        content: Some(content),
        message_type: msg_type,
        reply_to_id,
        reply_to_content,
        is_edited: false,
        is_deleted: false,
        created_at,
        status: "sent".into(),
        attachments: vec![],
    };

    // Broadcast via WS to all participants
    if let Some(hub) = hub {
        let participant_ids: Vec<(i32,)> = sqlx::query_as(
            "SELECT user_id FROM conversation_participants WHERE conversation_id = $1",
        )
        .bind(conversation_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let user_ids: Vec<i64> = participant_ids.into_iter().map(|(id,)| id as i64).collect();
        let event = ws::ServerEvent::NewMessage {
            conversation_id: conversation_id as i64,
            message: serde_json::to_value(&dto).unwrap_or_default(),
        };
        tracing::info!("cmd_send_message: broadcast vers {} participants", user_ids.len());
        hub.broadcast_to_users(&user_ids, &event).await;
    }

    Ok(dto)
}

// ─── MARK AS READ ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_mark_as_read(
    token: String,
    conversation_id: i32,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret, hub) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
            s.ws_hub.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_mark_as_read: uid={} conv={}", uid, conversation_id);

    sqlx::query(
        r#"
        INSERT INTO message_status (message_id, user_id, status, updated_at)
        SELECT m.id, $1, 'read', NOW()
        FROM messages m
        WHERE m.conversation_id = $2
          AND m.sender_id <> $1
          AND NOT EXISTS (
              SELECT 1 FROM message_status ms
              WHERE ms.message_id = m.id AND ms.user_id = $1 AND ms.status = 'read'
          )
        ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()
        "#,
    )
    .bind(uid)
    .bind(conversation_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_mark_as_read error: {}", e); format!("Erreur DB : {e}") })?;

    if let Some(hub) = hub {
        let sender_ids: Vec<(i32,)> = sqlx::query_as(
            "SELECT DISTINCT sender_id FROM messages WHERE conversation_id = $1 AND sender_id <> $2 AND sender_id IS NOT NULL",
        )
        .bind(conversation_id)
        .bind(uid)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        for (sid,) in sender_ids {
            hub.send_to_user(
                sid as i64,
                &ws::ServerEvent::MessageStatus {
                    message_id: 0,
                    conversation_id: conversation_id as i64,
                    user_id: uid as i64,
                    status: "read".into(),
                },
            )
            .await;
        }
    }

    Ok(())
}

// ─── LIST USERS ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_list_users(
    token: String,
    state: State<'_, SharedState>,
) -> Result<Vec<UserForChat>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_list_users: uid={}", uid);

    let users: Vec<UserForChat> = sqlx::query_as::<_, UserForChat>(
        r#"
        SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.department,
            u.avatar_path,
            COALESCE(up.status, 'offline') AS presence_status
        FROM users u
        LEFT JOIN user_presence up ON up.user_id = u.id
        WHERE u.is_active = true AND u.id <> $1
        ORDER BY u.display_name ASC
        "#,
    )
    .bind(uid)
    .fetch_all(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_list_users error: {}", e); format!("Erreur DB : {e}") })?;

    tracing::info!("cmd_list_users: {} utilisateurs trouvés", users.len());
    Ok(users)
}

// ─── CREATE DIRECT CONVERSATION ───────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_create_direct_conversation(
    token: String,
    other_user_id: i32,
    state: State<'_, SharedState>,
) -> Result<i32, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_create_direct_conversation: uid={} other={}", uid, other_user_id);

    if other_user_id <= 0 {
        return Err(format!("other_user_id invalide : {}", other_user_id));
    }
    if other_user_id == uid {
        return Err("Impossible de créer une conversation avec soi-même".to_string());
    }

    // Check target user exists
    let exists: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_active = true)",
    )
    .bind(other_user_id)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !exists {
        return Err(format!("Utilisateur {} introuvable ou inactif", other_user_id));
    }

    // Return existing conversation if any
    let existing: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
        WHERE c.type = 'direct'
        LIMIT 1
        "#,
    )
    .bind(uid)
    .bind(other_user_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Some((id,)) = existing {
        tracing::info!("cmd_create_direct_conversation: conversation existante id={}", id);
        return Ok(id);
    }

    // Create new conversation
    let row = sqlx::query(
        "INSERT INTO conversations (type) VALUES ('direct') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_direct_conversation INSERT conv error: {}", e); format!("Erreur création conversation : {e}") })?;

    let conv_id: i32 = row.try_get::<i32, _>("id").map_err(|e| format!("Erreur lecture id: {e}"))?;

    // Add both participants
    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
    )
    .bind(conv_id)
    .bind(uid)
    .bind(other_user_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_direct_conversation INSERT participants error: {}", e); format!("Erreur ajout participants : {e}") })?;

    tracing::info!("cmd_create_direct_conversation: nouvelle conversation id={}", conv_id);
    Ok(conv_id)
}

// ─── CREATE GROUP CONVERSATION ────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_create_group_conversation(
    token: String,
    name: String,
    description: String,
    member_ids: Vec<i32>,
    state: State<'_, SharedState>,
) -> Result<i32, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_create_group_conversation: uid={} name='{}' members={:?}", uid, name, member_ids);

    if name.trim().is_empty() {
        return Err("Le nom du groupe est requis".to_string());
    }

    // Insert group
    let group_row = sqlx::query(
        "INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(name.trim())
    .bind(if description.is_empty() { None } else { Some(description.as_str()) })
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_group_conversation INSERT group error: {}", e); format!("Erreur création groupe : {e}") })?;

    let group_id: i32 = group_row.try_get::<i32, _>("id").map_err(|e| format!("Erreur lecture id groupe: {e}"))?;

    // Insert conversation
    let conv_row = sqlx::query(
        "INSERT INTO conversations (type, group_id) VALUES ('group', $1) RETURNING id",
    )
    .bind(group_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_group_conversation INSERT conv error: {}", e); format!("Erreur création conversation : {e}") })?;

    let conv_id: i32 = conv_row.try_get::<i32, _>("id").map_err(|e| format!("Erreur lecture id conversation: {e}"))?;

    // Add creator as admin in group_members AND conversation_participants
    sqlx::query(
        "INSERT INTO group_members (group_id, user_id, role, added_by) VALUES ($1, $2, 'admin', $2)
         ON CONFLICT DO NOTHING",
    )
    .bind(group_id)
    .bind(uid)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_group INSERT creator group_members error: {}", e); format!("Erreur ajout créateur groupe : {e}") })?;

    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING",
    )
    .bind(conv_id)
    .bind(uid)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_create_group INSERT creator participants error: {}", e); format!("Erreur ajout créateur participant : {e}") })?;

    // Add other members
    for &mid in &member_ids {
        if mid == uid {
            continue;
        }
        // Check user exists
        let member_exists: bool = sqlx::query_as::<_, (bool,)>(
            "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_active = true)",
        )
        .bind(mid)
        .fetch_one(&pool)
        .await
        .map(|(b,)| b)
        .unwrap_or(false);

        if !member_exists {
            tracing::warn!("cmd_create_group: user {} introuvable, ignoré", mid);
            continue;
        }

        sqlx::query(
            "INSERT INTO group_members (group_id, user_id, role, added_by) VALUES ($1, $2, 'member', $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(group_id)
        .bind(mid)
        .bind(uid)
        .execute(&pool)
        .await
        .map_err(|e| tracing::error!("cmd_create_group INSERT member {} group_members: {}", mid, e))
        .ok();

        sqlx::query(
            "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING",
        )
        .bind(conv_id)
        .bind(mid)
        .execute(&pool)
        .await
        .map_err(|e| tracing::error!("cmd_create_group INSERT member {} participants: {}", mid, e))
        .ok();
    }

    // System message
    sqlx::query(
        "INSERT INTO messages (conversation_id, sender_id, content, message_type)
         VALUES ($1, $2, 'Groupe créé', 'system')",
    )
    .bind(conv_id)
    .bind(uid)
    .execute(&pool)
    .await
    .ok();

    let total_members = member_ids.iter().filter(|&&m| m != uid).count() + 1;
    tracing::info!(
        "cmd_create_group_conversation: groupe id={} conv={} créé avec {} membres",
        group_id, conv_id, total_members
    );

    Ok(conv_id)
}

// ─── ADD GROUP MEMBER ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_add_group_member(
    token: String,
    conversation_id: i32,
    user_id: i32,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_add_group_member: requester={} conv={} target={}", uid, conversation_id, user_id);

    // Get group_id for this conversation
    let group_id: i32 = sqlx::query_as::<_, (i32,)>(
        "SELECT group_id FROM conversations WHERE id = $1 AND type = 'group'",
    )
    .bind(conversation_id)
    .fetch_one(&pool)
    .await
    .map(|(g,)| g)
    .map_err(|e| { tracing::error!("cmd_add_group_member: conv {} not a group: {}", conversation_id, e); format!("Conversation introuvable ou pas un groupe: {e}") })?;

    // Verify requester is admin
    let is_admin: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin')",
    )
    .bind(group_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_admin {
        tracing::warn!("cmd_add_group_member: user {} is not admin of group {}", uid, group_id);
        return Err("Seul un administrateur peut ajouter des membres".to_string());
    }

    // Add to group_members
    sqlx::query(
        "INSERT INTO group_members (group_id, user_id, role, added_by) VALUES ($1, $2, 'member', $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(group_id)
    .bind(user_id)
    .bind(uid)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_add_group_member INSERT group_members error: {}", e); format!("Erreur ajout membre groupe: {e}") })?;

    // Add to conversation_participants
    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING",
    )
    .bind(conversation_id)
    .bind(user_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_add_group_member INSERT participants error: {}", e); format!("Erreur ajout participant conversation: {e}") })?;

    // System message
    let member_name: String = sqlx::query_as::<_, (String,)>(
        "SELECT display_name FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .map(|(n,)| n)
    .unwrap_or_else(|| format!("User {}", user_id));

    sqlx::query(
        "INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'system')",
    )
    .bind(conversation_id)
    .bind(uid)
    .bind(format!("{} a été ajouté au groupe", member_name))
    .execute(&pool)
    .await
    .ok();

    tracing::info!("cmd_add_group_member: user {} ajouté au groupe {}", user_id, group_id);
    Ok(())
}

// ─── REMOVE GROUP MEMBER ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_remove_group_member(
    token: String,
    conversation_id: i32,
    user_id: i32,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_remove_group_member: requester={} conv={} target={}", uid, conversation_id, user_id);

    // Get group_id
    let group_id: i32 = sqlx::query_as::<_, (i32,)>(
        "SELECT group_id FROM conversations WHERE id = $1 AND type = 'group'",
    )
    .bind(conversation_id)
    .fetch_one(&pool)
    .await
    .map(|(g,)| g)
    .map_err(|e| format!("Conversation introuvable ou pas un groupe: {e}"))?;

    // Must be admin OR removing oneself
    let is_admin: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin')",
    )
    .bind(group_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_admin && uid != user_id {
        return Err("Seul un administrateur peut retirer des membres".to_string());
    }

    // Remove from group_members and conversation_participants
    sqlx::query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2")
        .bind(group_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|e| { tracing::error!("cmd_remove_group_member DELETE group_members: {}", e); format!("Erreur suppression membre: {e}") })?;

    sqlx::query("DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2")
        .bind(conversation_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|e| { tracing::error!("cmd_remove_group_member DELETE participants: {}", e); format!("Erreur suppression participant: {e}") })?;

    // System message
    let member_name: String = sqlx::query_as::<_, (String,)>(
        "SELECT display_name FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .map(|(n,)| n)
    .unwrap_or_else(|| format!("User {}", user_id));

    let msg = if uid == user_id {
        format!("{} a quitté le groupe", member_name)
    } else {
        format!("{} a été retiré du groupe", member_name)
    };

    sqlx::query(
        "INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'system')",
    )
    .bind(conversation_id)
    .bind(uid)
    .bind(msg)
    .execute(&pool)
    .await
    .ok();

    tracing::info!("cmd_remove_group_member: user {} retiré du groupe {}", user_id, group_id);
    Ok(())
}

// ─── UPDATE MEMBER ROLE ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_update_member_role(
    token: String,
    conversation_id: i32,
    user_id: i32,
    role: String,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    if role != "admin" && role != "member" {
        return Err(format!("Rôle invalide : {}. Valeurs acceptées : admin, member", role));
    }

    tracing::info!("cmd_update_member_role: requester={} conv={} target={} role={}", uid, conversation_id, user_id, role);

    // Get group_id
    let group_id: i32 = sqlx::query_as::<_, (i32,)>(
        "SELECT group_id FROM conversations WHERE id = $1 AND type = 'group'",
    )
    .bind(conversation_id)
    .fetch_one(&pool)
    .await
    .map(|(g,)| g)
    .map_err(|e| format!("Conversation introuvable ou pas un groupe: {e}"))?;

    // Must be admin
    let is_admin: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin')",
    )
    .bind(group_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_admin {
        return Err("Seul un administrateur peut modifier les rôles".to_string());
    }

    sqlx::query(
        "UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3",
    )
    .bind(&role)
    .bind(group_id)
    .bind(user_id)
    .execute(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_update_member_role UPDATE error: {}", e); format!("Erreur mise à jour rôle: {e}") })?;

    tracing::info!("cmd_update_member_role: user {} → rôle {} dans groupe {}", user_id, role, group_id);
    Ok(())
}

// ─── SEARCH MESSAGES (in conversation) ───────────────────────────────────────

#[tauri::command]
pub async fn cmd_search_messages(
    token: String,
    conversation_id: i32,
    query: String,
    state: State<'_, SharedState>,
) -> Result<Vec<MessageDto>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
    .bind(conversation_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_member {
        return Err("Accès refusé".to_string());
    }

    let pattern = format!("%{}%", query.to_lowercase());

    let rows = sqlx::query(
        r#"
        SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
               m.reply_to_id, m.is_edited, m.is_deleted, m.created_at,
               u.display_name AS sender_name, u.avatar_path AS sender_avatar,
               NULL::TEXT AS reply_to_content, 'sent' AS status
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1
          AND m.is_deleted = false
          AND LOWER(m.content) LIKE $2
        ORDER BY m.created_at DESC
        LIMIT 50
        "#,
    )
    .bind(conversation_id)
    .bind(&pattern)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur DB : {e}"))?;

    let messages = rows
        .iter()
        .map(|row| MessageDto {
            id: row.try_get::<i32, _>("id").unwrap_or_default(),
            conversation_id: row.try_get::<i32, _>("conversation_id").unwrap_or_default(),
            sender_id: row.try_get::<Option<i32>, _>("sender_id").ok().flatten(),
            sender_name: row.try_get("sender_name").ok().flatten(),
            sender_avatar: row.try_get("sender_avatar").ok().flatten(),
            content: row.try_get("content").ok().flatten(),
            message_type: row.try_get("message_type").unwrap_or_else(|_| "text".into()),
            reply_to_id: None,
            reply_to_content: None,
            is_edited: row.try_get("is_edited").unwrap_or(false),
            is_deleted: row.try_get("is_deleted").unwrap_or(false),
            created_at: row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
            status: "sent".into(),
            attachments: vec![],
        })
        .collect();

    Ok(messages)
}

// ─── SEARCH ALL MESSAGES ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_search_all_messages(
    token: String,
    query: String,
    state: State<'_, SharedState>,
) -> Result<Vec<serde_json::Value>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    let pattern = format!("%{}%", query.to_lowercase());

    let rows = sqlx::query(
        r#"
        SELECT
            m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
            m.reply_to_id, m.is_edited, m.is_deleted, m.created_at,
            u.display_name AS sender_name, u.avatar_path AS sender_avatar,
            c.type AS conv_type,
            CASE
                WHEN c.type = 'group' THEN g.name
                ELSE (
                    SELECT u2.display_name
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                    LIMIT 1
                )
            END AS conv_name,
            CASE WHEN c.type = 'group' THEN g.avatar_path ELSE NULL END AS conv_avatar_path
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN groups g ON g.id = c.group_id
        WHERE m.is_deleted = false
          AND LOWER(m.content) LIKE $2
        ORDER BY m.created_at DESC
        LIMIT 50
        "#,
    )
    .bind(uid)
    .bind(&pattern)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur DB : {e}"))?;

    let results: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let conv_id: i32 = row.try_get::<i32, _>("conversation_id").unwrap_or_default();
            let msg = serde_json::json!({
                "id": row.try_get::<i32, _>("id").unwrap_or_default(),
                "conversation_id": conv_id,
                "sender_id": row.try_get::<Option<i32>, _>("sender_id").ok().flatten(),
                "sender_name": row.try_get::<Option<String>, _>("sender_name").ok().flatten(),
                "sender_avatar": row.try_get::<Option<String>, _>("sender_avatar").ok().flatten(),
                "content": row.try_get::<Option<String>, _>("content").ok().flatten(),
                "message_type": row.try_get::<String, _>("message_type").unwrap_or_else(|_| "text".into()),
                "reply_to_id": serde_json::Value::Null,
                "reply_to_content": serde_json::Value::Null,
                "is_edited": row.try_get::<bool, _>("is_edited").unwrap_or(false),
                "is_deleted": row.try_get::<bool, _>("is_deleted").unwrap_or(false),
                "created_at": row.try_get::<DateTime<Utc>, _>("created_at").unwrap_or_else(|_| Utc::now()),
                "status": "sent",
                "attachments": []
            });
            let conv = serde_json::json!({
                "id": conv_id,
                "conv_type": row.try_get::<String, _>("conv_type").unwrap_or_else(|_| "direct".into()),
                "name": row.try_get::<String, _>("conv_name").unwrap_or_else(|_| "(Sans nom)".into()),
                "avatar_path": row.try_get::<Option<String>, _>("conv_avatar_path").ok().flatten(),
                "last_message": serde_json::Value::Null,
                "last_message_at": serde_json::Value::Null,
                "unread_count": 0,
                "participants": []
            });
            serde_json::json!({ "message": msg, "conversation": conv })
        })
        .collect();

    Ok(results)
}

// ─── UPLOAD ATTACHMENT ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_upload_attachment(
    token: String,
    message_id: i32,
    file_name: String,
    file_path: String,
    file_type: Option<String>,
    file_size: Option<i64>,
    thumbnail: Option<String>,
    state: State<'_, SharedState>,
) -> Result<AttachmentDto, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let _uid = extract_uid(&token, &jwt_secret)?;

    let row = sqlx::query(
        r#"
        INSERT INTO attachments (message_id, file_name, file_path, file_type, file_size, thumbnail)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        "#,
    )
    .bind(message_id)
    .bind(&file_name)
    .bind(&file_path)
    .bind(&file_type)
    .bind(file_size)
    .bind(&thumbnail)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Erreur DB : {e}"))?;

    let id: i32 = row.try_get::<i32, _>("id").unwrap_or_default();

    Ok(AttachmentDto { id, file_name, file_path, file_type, file_size, thumbnail })
}

// ─── ATTACHMENT WITH MESSAGE INFO ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AttachmentWithInfo {
    pub id: i32,
    pub message_id: i32,
    pub file_name: String,
    pub file_path: String,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
    pub thumbnail: Option<String>,
    pub sender_name: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─── SEND MESSAGE WITH FILE ────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_send_message_with_file(
    token: String,
    conversation_id: i32,
    content: String,
    file_name: String,
    base64_data: String,
    thumbnail: Option<String>,
    file_type: String,
    file_size: i64,
    reply_to_id: Option<i32>,
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> Result<MessageDto, String> {
    let (pool, jwt_secret, hub) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
            s.ws_hub.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    tracing::info!("cmd_send_message_with_file: uid={} conv={} file={}", uid, conversation_id, file_name);

    // Verify participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
    .bind(conversation_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_member {
        return Err("Accès refusé à cette conversation".to_string());
    }

    // ── Save file to disk ──────────────────────────────────────────────────────
    let attachments_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire données inaccessible: {e}"))?
        .join("attachments");

    std::fs::create_dir_all(&attachments_dir)
        .map_err(|e| format!("Erreur création répertoire: {e}"))?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Erreur décodage base64: {e}"))?;

    // Sanitize filename
    let safe_name: String = file_name
        .chars()
        .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let unique_name = format!("{}_{}", uuid::Uuid::new_v4().as_simple(), safe_name);
    let file_path = attachments_dir.join(&unique_name);
    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Erreur sauvegarde fichier: {e}"))?;
    let file_path_str = file_path.to_string_lossy().to_string();

    tracing::info!("cmd_send_message_with_file: fichier sauvegardé → {}", file_path_str);

    // ── Insert message ─────────────────────────────────────────────────────────
    let msg_type = if file_type.starts_with("image/") { "image" } else { "file" };
    let row = sqlx::query(
        "INSERT INTO messages (conversation_id, sender_id, content, message_type, reply_to_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at",
    )
    .bind(conversation_id)
    .bind(uid)
    .bind(if content.is_empty() { None } else { Some(content.as_str()) })
    .bind(msg_type)
    .bind(reply_to_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_send_message_with_file INSERT message: {}", e); format!("Erreur insertion message: {e}") })?;

    let msg_id: i32 = row.try_get::<i32, _>("id").map_err(|e| format!("Erreur lecture id: {e}"))?;
    let created_at: DateTime<Utc> = row.try_get("created_at").unwrap_or_else(|_| Utc::now());

    // ── Insert attachment ──────────────────────────────────────────────────────
    let att_row = sqlx::query(
        "INSERT INTO attachments (message_id, file_name, file_path, file_type, file_size, thumbnail) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(msg_id)
    .bind(&file_name)
    .bind(&file_path_str)
    .bind(&file_type)
    .bind(file_size)
    .bind(&thumbnail)
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!("cmd_send_message_with_file INSERT attachment: {}", e); format!("Erreur insertion pièce jointe: {e}") })?;

    let att_id: i32 = att_row.try_get::<i32, _>("id").unwrap_or_default();

    // ── Message status ─────────────────────────────────────────────────────────
    sqlx::query(
        "INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, 'sent') ON CONFLICT DO NOTHING",
    )
    .bind(msg_id)
    .bind(uid)
    .execute(&pool)
    .await
    .ok();

    // ── Sender info ────────────────────────────────────────────────────────────
    let (sender_name, sender_avatar): (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT display_name, avatar_path FROM users WHERE id = $1",
    )
    .bind(uid)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None)
    .map(|(n, a)| (Some(n), a))
    .unwrap_or((None, None));

    let att_dto = AttachmentDto {
        id: att_id,
        file_name: file_name.clone(),
        file_path: file_path_str,
        file_type: Some(file_type.clone()),
        file_size: Some(file_size),
        thumbnail,
    };

    let dto = MessageDto {
        id: msg_id,
        conversation_id,
        sender_id: Some(uid),
        sender_name: sender_name.clone(),
        sender_avatar: sender_avatar.clone(),
        content: if content.is_empty() { None } else { Some(content) },
        message_type: msg_type.to_string(),
        reply_to_id,
        reply_to_content: None,
        is_edited: false,
        is_deleted: false,
        created_at,
        status: "sent".into(),
        attachments: vec![att_dto],
    };

    // ── WS broadcast ───────────────────────────────────────────────────────────
    if let Some(hub) = hub {
        let participant_ids: Vec<(i32,)> = sqlx::query_as(
            "SELECT user_id FROM conversation_participants WHERE conversation_id = $1",
        )
        .bind(conversation_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        let user_ids: Vec<i64> = participant_ids.into_iter().map(|(id,)| id as i64).collect();
        let event = ws::ServerEvent::NewMessage {
            conversation_id: conversation_id as i64,
            message: serde_json::to_value(&dto).unwrap_or_default(),
        };
        hub.broadcast_to_users(&user_ids, &event).await;
    }

    tracing::info!("cmd_send_message_with_file: message id={} avec pièce jointe id={}", msg_id, att_id);
    Ok(dto)
}

// ─── GET FILE AS BASE64 ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_file_as_base64(
    token: String,
    file_path: String,
    state: State<'_, SharedState>,
) -> Result<String, String> {
    let (_pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    extract_uid(&token, &jwt_secret)?;

    tracing::debug!("cmd_get_file_as_base64: {}", file_path);

    let bytes = std::fs::read(&file_path)
        .map_err(|e| format!("Fichier introuvable: {e}"))?;

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// ─── GET CONVERSATION MEDIA ────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_conversation_media(
    token: String,
    conversation_id: i32,
    state: State<'_, SharedState>,
) -> Result<Vec<AttachmentWithInfo>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };
    let uid = extract_uid(&token, &jwt_secret)?;

    // Verify participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
    .bind(conversation_id)
    .bind(uid)
    .fetch_one(&pool)
    .await
    .map(|(b,)| b)
    .unwrap_or(false);

    if !is_member {
        return Err("Accès refusé".to_string());
    }

    let rows = sqlx::query(
        r#"
        SELECT
            a.id, a.message_id, a.file_name, a.file_path,
            a.file_type, a.file_size, a.thumbnail,
            u.display_name AS sender_name,
            m.created_at
        FROM attachments a
        JOIN messages m ON m.id = a.message_id
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1
          AND m.is_deleted = false
        ORDER BY m.created_at DESC
        LIMIT 200
        "#,
    )
    .bind(conversation_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erreur DB: {e}"))?;

    let items = rows
        .iter()
        .map(|row| AttachmentWithInfo {
            id: row.try_get::<i32, _>("id").unwrap_or_default(),
            message_id: row.try_get::<i32, _>("message_id").unwrap_or_default(),
            file_name: row.try_get("file_name").unwrap_or_default(),
            file_path: row.try_get("file_path").unwrap_or_default(),
            file_type: row.try_get("file_type").ok().flatten(),
            file_size: row.try_get("file_size").ok().flatten(),
            thumbnail: row.try_get("thumbnail").ok().flatten(),
            sender_name: row.try_get("sender_name").ok().flatten(),
            created_at: row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
        })
        .collect();

    Ok(items)
}


#[tauri::command]
pub async fn cmd_edit_message(
    state: State<'_, SharedState>,
    token: String,
    conversation_id: i32,
    message_id: i32,
    new_content: String,
) -> Result<(), String> {
    let s = state.lock().await;
    let pool = s.db_pool.as_ref().ok_or("Database pool non disponible")?;

    // Extraction de l'ID utilisateur à partir du JWT pour sécuriser l'édition
    let uid = extract_uid(&token, &s.jwt_secret)?;

    // Utilisation de la macro dynamique sqlx::query sans '!'
    let rows_affected = sqlx::query(
        r#"
        UPDATE messages
        SET content = $1, is_edited = true, updated_at = NOW()
        WHERE id = $2 AND conversation_id = $3 AND sender_id = $4
        "#,
    )
        .bind(new_content)      // $1
        .bind(message_id)       // $2
        .bind(conversation_id)  // $3
        .bind(uid)              // $4
        .execute(pool)
        .await
        .map_err(|e| format!("Erreur DB lors de la modification : {e}"))?
        .rows_affected();

    if rows_affected == 0 {
        return Err("Message introuvable ou vous n'êtes pas l'auteur".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn cmd_delete_message(
    state: State<'_, SharedState>,
    token: String,
    conversation_id: i32,
    message_id: i32,
) -> Result<(), String> {
    let s = state.lock().await;
    let pool = s.db_pool.as_ref().ok_or("Database pool non disponible")?;
    let uid = extract_uid(&token, &s.jwt_secret)?;

    // Soft delete (recommandé pour conserver l'historique et la cohérence de l'UI)
    let rows_affected = sqlx::query(
        r#"
    UPDATE messages
    SET is_deleted = true, updated_at = NOW()
    WHERE id = $1 AND conversation_id = $2 AND sender_id = $3
    "#,
    )
        .bind(message_id)
        .bind(conversation_id)
        .bind(uid)
        .execute(pool)
        .await
        .map_err(|e| format!("Erreur DB lors de la suppression : {e}"))?
        .rows_affected();

    if rows_affected == 0 {
        return Err("Message introuvable ou vous n'êtes pas l'auteur".to_string());
    }

    Ok(())
}
// ─── GET WS PORT ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_get_ws_port() -> u16 {
    ws::WS_PORT
}
