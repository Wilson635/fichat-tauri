use crate::{ws, SharedState};
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;

// ─── JWT helper ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Claims {
    user_id: i64,
}

fn extract_user_id(token: &str, secret: &str) -> Result<i64, String> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);
    decode::<Claims>(token, &key, &validation)
        .map(|d| d.claims.user_id)
        .map_err(|_| "Session expirée ou invalide".to_string())
}

// ─── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConversationSummary {
    pub id: i64,
    pub conv_type: String,
    pub name: String,
    pub avatar_path: Option<String>,
    pub last_message: Option<String>,
    pub last_message_at: Option<DateTime<Utc>>,
    pub unread_count: i64,
    pub participants: Vec<ParticipantInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ParticipantInfo {
    pub user_id: i64,
    pub display_name: String,
    pub avatar_path: Option<String>,
    pub presence_status: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MessageDto {
    pub id: i64,
    pub conversation_id: i64,
    pub sender_id: Option<i64>,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub content: Option<String>,
    pub message_type: String,
    pub reply_to_id: Option<i64>,
    pub reply_to_content: Option<String>,
    pub is_edited: bool,
    pub is_deleted: bool,
    pub created_at: DateTime<Utc>,
    pub status: String, // "sent" | "delivered" | "read"
    pub attachments: Vec<AttachmentDto>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AttachmentDto {
    pub id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
    pub thumbnail: Option<String>,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Return all conversations the authenticated user participates in,
/// sorted by last message time (most recent first).
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

    let user_id = extract_user_id(&token, &jwt_secret)?;

    // All conversations this user is in, with last message and unread count
    let rows = sqlx::query(
        r#"
        SELECT
            c.id,
            c.type                                                AS conv_type,
            -- For group conversations use the group name;
            -- for direct conversations use the other participant's display_name
            CASE
                WHEN c.type = 'group' THEN g.name
                ELSE (
                    SELECT u2.display_name
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                    LIMIT 1
                )
            END                                                   AS name,
            CASE
                WHEN c.type = 'group' THEN g.avatar_path
                ELSE (
                    SELECT u2.avatar_path
                    FROM conversation_participants cp2
                    JOIN users u2 ON u2.id = cp2.user_id
                    WHERE cp2.conversation_id = c.id AND cp2.user_id <> $1
                    LIMIT 1
                )
            END                                                   AS avatar_path,
            -- last message content (truncated for display)
            (
                SELECT LEFT(content, 100)
                FROM messages
                WHERE conversation_id = c.id AND is_deleted = false
                ORDER BY created_at DESC
                LIMIT 1
            )                                                     AS last_message,
            (
                SELECT created_at
                FROM messages
                WHERE conversation_id = c.id AND is_deleted = false
                ORDER BY created_at DESC
                LIMIT 1
            )                                                     AS last_message_at,
            -- unread count: messages sent by others that have no 'read' status for this user
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
            )                                                     AS unread_count
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
        LEFT JOIN groups g ON g.id = c.group_id
        ORDER BY last_message_at DESC NULLS LAST
        "#,
    )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;

    let mut conversations = Vec::with_capacity(rows.len());

    for row in rows {
        let conv_id: i64 = row.try_get("id").unwrap_or_default();
        let conv_type: String = row.try_get("conv_type").unwrap_or_default();
        let name: String = row.try_get("name").unwrap_or_else(|_| "(Sans nom)".into());
        let avatar_path: Option<String> = row.try_get("avatar_path").ok().flatten();
        let last_message: Option<String> = row.try_get("last_message").ok().flatten();
        let last_message_at: Option<DateTime<Utc>> = row.try_get("last_message_at").ok().flatten();
        let unread_count: i64 = row.try_get("unread_count").unwrap_or(0);

        // Load participants for this conversation
        let prows = sqlx::query(
            r#"
            SELECT u.id, u.display_name, u.avatar_path,
                   COALESCE(up.status, 'offline') AS presence_status
            FROM conversation_participants cp
            JOIN users u ON u.id = cp.user_id
            LEFT JOIN user_presence up ON up.user_id = u.id
            WHERE cp.conversation_id = $1
            "#,
        )
            .bind(conv_id)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

        let participants = prows
            .iter()
            .map(|pr| ParticipantInfo {
                user_id: pr.try_get("id").unwrap_or_default(),
                display_name: pr.try_get("display_name").unwrap_or_default(),
                avatar_path: pr.try_get("avatar_path").ok().flatten(),
                presence_status: pr.try_get("presence_status").unwrap_or_else(|_| "offline".into()),
            })
            .collect();

        conversations.push(ConversationSummary {
            id: conv_id,
            conv_type,
            name,
            avatar_path,
            last_message,
            last_message_at,
            unread_count,
            participants,
        });
    }

    Ok(conversations)
}

/// Return paginated messages for a conversation (50 by default, going back in time).
#[tauri::command]
pub async fn cmd_get_messages(
    token: String,
    conversation_id: i64,
    limit: Option<i64>,
    before_id: Option<i64>,
    state: State<'_, SharedState>,
) -> Result<Vec<MessageDto>, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let user_id = extract_user_id(&token, &jwt_secret)?;
    let page_size = limit.unwrap_or(50).clamp(1, 200);

    // Verify user is a participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
        .bind(conversation_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .map(|(b,)| b)
        .unwrap_or(false);

    if !is_member {
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
                        WHERE ms.message_id = m.id ORDER BY
                            CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
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
            .map_err(|e| format!("Erreur DB : {e}"))?
    } else {
        sqlx::query(
            r#"
            SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
                   m.reply_to_id, m.is_edited, m.is_deleted, m.created_at,
                   u.display_name AS sender_name, u.avatar_path AS sender_avatar,
                   rm.content AS reply_to_content,
                   COALESCE(
                       (SELECT ms.status FROM message_status ms
                        WHERE ms.message_id = m.id ORDER BY
                            CASE ms.status WHEN 'read' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END
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
            .map_err(|e| format!("Erreur DB : {e}"))?
    };

    let mut messages: Vec<MessageDto> = Vec::with_capacity(rows.len());

    for row in &rows {
        let msg_id: i64 = row.try_get("id").unwrap_or_default();

        // Load attachments for this message
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
                id: ar.try_get("id").unwrap_or_default(),
                file_name: ar.try_get("file_name").unwrap_or_default(),
                file_path: ar.try_get("file_path").unwrap_or_default(),
                file_type: ar.try_get("file_type").ok().flatten(),
                file_size: ar.try_get("file_size").ok().flatten(),
                thumbnail: ar.try_get("thumbnail").ok().flatten(),
            })
            .collect();

        messages.push(MessageDto {
            id: msg_id,
            conversation_id: row.try_get("conversation_id").unwrap_or_default(),
            sender_id: row.try_get("sender_id").ok().flatten(),
            sender_name: row.try_get("sender_name").ok().flatten(),
            sender_avatar: row.try_get("sender_avatar").ok().flatten(),
            content: row.try_get("content").ok().flatten(),
            message_type: row.try_get("message_type").unwrap_or_else(|_| "text".into()),
            reply_to_id: row.try_get("reply_to_id").ok().flatten(),
            reply_to_content: row.try_get("reply_to_content").ok().flatten(),
            is_edited: row.try_get("is_edited").unwrap_or(false),
            is_deleted: row.try_get("is_deleted").unwrap_or(false),
            created_at: row.try_get("created_at").unwrap_or_else(|_| Utc::now()),
            status: row.try_get("status").unwrap_or_else(|_| "sent".into()),
            attachments,
        });
    }

    // Return in ascending order (oldest first)
    messages.reverse();
    Ok(messages)
}

/// Send a text message to a conversation.
/// Broadcasts the new message to all participants via WS hub.
#[tauri::command]
pub async fn cmd_send_message(
    token: String,
    conversation_id: i64,
    content: String,
    message_type: Option<String>,
    reply_to_id: Option<i64>,
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

    let user_id = extract_user_id(&token, &jwt_secret)?;
    let msg_type = message_type.unwrap_or_else(|| "text".into());

    // Verify participant
    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
        .bind(conversation_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .map(|(b,)| b)
        .unwrap_or(false);

    if !is_member {
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
        .bind(user_id)
        .bind(&content)
        .bind(&msg_type)
        .bind(reply_to_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;

    let msg_id: i64 = row.try_get("id").unwrap_or_default();
    let created_at: DateTime<Utc> = row.try_get("created_at").unwrap_or_else(|_| Utc::now());

    // Insert sent status for sender
    sqlx::query(
        "INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, 'sent')
         ON CONFLICT DO NOTHING",
    )
        .bind(msg_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .ok();

    // Sender info
    let (sender_name, sender_avatar) = {
        let r: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT display_name, avatar_path FROM users WHERE id = $1",
        )
            .bind(user_id)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        r.map(|(n, a)| (Some(n), a)).unwrap_or((None, None))
    };

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
        sender_id: Some(user_id),
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

    // Broadcast to all participants via WS hub
    if let Some(hub) = hub {
        let participants: Vec<(i64,)> = sqlx::query_as(
            "SELECT user_id FROM conversation_participants WHERE conversation_id = $1",
        )
            .bind(conversation_id)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

        let user_ids: Vec<i64> = participants.into_iter().map(|(id,)| id).collect();
        let event = ws::ServerEvent::NewMessage {
            conversation_id,
            message: serde_json::to_value(&dto).unwrap_or_default(),
        };
        hub.broadcast_to_users(&user_ids, &event).await;
    }

    Ok(dto)
}

/// Mark all messages in a conversation as read for the authenticated user.
#[tauri::command]
pub async fn cmd_mark_as_read(
    token: String,
    conversation_id: i64,
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

    let user_id = extract_user_id(&token, &jwt_secret)?;

    // Upsert read status for all unread messages from others
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
        .bind(user_id)
        .bind(conversation_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;

    // Notify message senders via WS that their messages were read
    if let Some(hub) = hub {
        let sender_ids: Vec<(i64,)> = sqlx::query_as(
            "SELECT DISTINCT sender_id FROM messages WHERE conversation_id = $1 AND sender_id <> $2 AND sender_id IS NOT NULL",
        )
            .bind(conversation_id)
            .bind(user_id)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

        for (sid,) in sender_ids {
            hub.send_to_user(
                sid,
                &ws::ServerEvent::MessageStatus {
                    message_id: 0, // 0 means "all in conversation"
                    conversation_id,
                    user_id,
                    status: "read".into(),
                },
            )
                .await;
        }
    }

    Ok(())
}

/// Register an uploaded attachment (after the file has been saved to disk via tauri-plugin-fs).
#[tauri::command]
pub async fn cmd_upload_attachment(
    token: String,
    message_id: i64,
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

    let _user_id = extract_user_id(&token, &jwt_secret)?;

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

    let id: i64 = row.try_get("id").unwrap_or_default();

    Ok(AttachmentDto {
        id,
        file_name,
        file_path,
        file_type,
        file_size,
        thumbnail,
    })
}

/// Full-text search in a conversation's messages.
#[tauri::command]
pub async fn cmd_search_messages(
    token: String,
    conversation_id: i64,
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

    let user_id = extract_user_id(&token, &jwt_secret)?;

    let is_member: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2)",
    )
        .bind(conversation_id)
        .bind(user_id)
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
            id: row.try_get("id").unwrap_or_default(),
            conversation_id: row.try_get("conversation_id").unwrap_or_default(),
            sender_id: row.try_get("sender_id").ok().flatten(),
            sender_name: row.try_get("sender_name").ok().flatten(),
            sender_avatar: row.try_get("sender_avatar").ok().flatten(),
            content: row.try_get("content").ok().flatten(),
            message_type: row.try_get("message_type").unwrap_or_else(|_| "text".into()),
            reply_to_id: row.try_get("reply_to_id").ok().flatten(),
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

/// Return the WebSocket server port so the frontend can connect.
#[tauri::command]
pub async fn cmd_get_ws_port() -> u16 {
    ws::WS_PORT
}

// ─── List users ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserForChat {
    pub id: i32,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub department: Option<String>,
    pub avatar_path: Option<String>,
    pub presence_status: String,
}

/// Return all active users (except current user), for use in new-group / new-DM pickers.
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

    let user_id = extract_user_id(&token, &jwt_secret)?;

    /*let rows = sqlx::query(
        r#"
        SELECT u.id AS "id!: i32", u.username, u.display_name, u.email, u.department, u.avatar_path,
               COALESCE(up.status, 'offline') AS presence_status
        FROM users u
        LEFT JOIN user_presence up ON up.user_id = u.id
        WHERE u.is_active = true AND u.id <> $1
        ORDER BY u.display_name ASC
        "#,
    )
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;*/

    /*let users = rows
        .into_iter()
        .map(|row| UserForChat {
            id:              row.try_get::<i64, _>("id").unwrap_or_default(),
            username:        row.try_get("username").unwrap_or_default(),
            display_name:    row.try_get("display_name").unwrap_or_default(),
            email:           row.try_get("email").ok().flatten(),
            department:      row.try_get("department").ok().flatten(),
            avatar_path:     row.try_get("avatar_path").ok().flatten(),
            presence_status: row.try_get("presence_status").unwrap_or_else(|_| "offline".into()),
        })
        .collect();

    Ok(users)*/

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
        .bind(user_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;

    Ok(users)
}

// ─── Create group conversation ────────────────────────────────────────────────

/// Create a new group conversation.
/// `member_ids` should NOT include the creator — they are added automatically.
#[tauri::command]
pub async fn cmd_create_group_conversation(
    token: String,
    name: String,
    description: String,
    member_ids: Vec<i32>,
    state: State<'_, SharedState>,
) -> Result<i64, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let user_id = extract_user_id(&token, &jwt_secret)?;

    if name.trim().is_empty() {
        return Err("Le nom du groupe est requis".to_string());
    }

    // Insert the group
    let group_row = sqlx::query(
        "INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
        .bind(name.trim())
        .bind(if description.is_empty() { None } else { Some(description.as_str()) })
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erreur création groupe : {e}"))?;

    //let group_id: i64 = group_row.try_get("id").unwrap_or_default();
    let group_id: i32 = group_row.try_get("id")
        .map_err(|e| format!("Erreur lecture id groupe : {e}"))?;

    // Insert the conversation
    let conv_row = sqlx::query(
        "INSERT INTO conversations (type, group_id) VALUES ('group', $1) RETURNING id",
    )
        .bind(group_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erreur création conversation : {e}"))?;

    //let conv_id: i64 = conv_row.try_get("id").unwrap_or_default();
    let conv_id: i32 = conv_row.try_get("id")
        .map_err(|e| format!("Erreur lecture id conversation : {e}"))?;

    // Add creator as first participant
    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)",
    )
        .bind(conv_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur ajout créateur : {e}"))?;

    // Add remaining members (ignore duplicates)
    for &mid in &member_ids {
        if mid as i64 == user_id { continue; }
        sqlx::query(
            "INSERT INTO conversation_participants (conversation_id, user_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
            .bind(conv_id)
            .bind(mid)
            .execute(&pool)
            .await
            .ok();
    }

    // Post a "system" message to mark group creation
    sqlx::query(
        "INSERT INTO messages (conversation_id, sender_id, content, message_type)
         VALUES ($1, $2, 'Groupe créé', 'system')",
    )
        .bind(conv_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .ok();

    Ok(conv_id as i64)
}

/// Create (or return existing) direct conversation between two users.
#[tauri::command]
pub async fn cmd_create_direct_conversation(
    token: String,
    other_user_id: i32,  // ✅ i32 au lieu de i64
    state: State<'_, SharedState>,
) -> Result<i64, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let user_id = extract_user_id(&token, &jwt_secret)?;

    // 🔍 Log pour diagnostiquer
    tracing::info!("cmd_create_direct_conversation: user_id={}, other_user_id={}", user_id, other_user_id);

    if other_user_id <= 0 {
        return Err(format!("other_user_id invalide : {}", other_user_id));
    }

    // Vérifier que l'autre utilisateur existe
    let target_exists: bool = sqlx::query_as::<_, (bool,)>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_active = true)",
    )
        .bind(other_user_id)
        .fetch_one(&pool)
        .await
        .map(|(b,)| b)
        .unwrap_or(false);

    if !target_exists {
        return Err(format!("Utilisateur {} introuvable ou inactif", other_user_id));
    }

    // Conversation existante ?
    let existing: Option<(i32,)> = sqlx::query_as(
        r#"
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
        WHERE c.type = 'direct'
        LIMIT 1
        "#,
    )
        .bind(user_id as i32)
        .bind(other_user_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    if let Some((id,)) = existing {
        tracing::info!("Conversation directe existante trouvée : {}", id);
        return Ok(id as i64);
    }

    // Créer la conversation
    let row = sqlx::query(
        "INSERT INTO conversations (type) VALUES ('direct') RETURNING id",
    )
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erreur création conversation : {e}"))?;

    let conv_id: i32 = row.try_get("id")
        .map_err(|e| format!("Erreur lecture id conversation : {e}"))?;

    tracing::info!("Nouvelle conversation créée : conv_id={}", conv_id);

    // Ajouter les deux participants
    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
    )
        .bind(conv_id)
        .bind(user_id)           // i64 du JWT — postgres accepte le cast implicite
        .bind(other_user_id)     // i32 ✓
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur ajout participants : {e}"))?;

    Ok(conv_id as i64)
}
/*
#[tauri::command]
pub async fn cmd_create_direct_conversation(
    token: String,
    other_user_id: i64,
    state: State<'_, SharedState>,
) -> Result<i64, String> {
    let (pool, jwt_secret) = {
        let s = state.lock().await;
        (
            s.db_pool.clone().ok_or("Base de données non connectée")?,
            s.jwt_secret.clone(),
        )
    };

    let user_id = extract_user_id(&token, &jwt_secret)?;

    // Check if a direct conversation already exists between these two users
    let existing: Option<(i32,)> = sqlx::query_as( // ✅ i32
        r#"
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
        JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
        WHERE c.type = 'direct'
        LIMIT 1
        "#,
    )
        .bind(user_id)
        .bind(other_user_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    if let Some((id,)) = existing {
        return Ok(id as i64); // ✅ cast pour le retour
    }

    // Create new direct conversation
    let row = sqlx::query(
        "INSERT INTO conversations (type) VALUES ('direct') RETURNING id",
    )
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erreur création conversation : {e}"))?;

    //let conv_id: i64 = row.try_get("id").unwrap_or_default();
    let conv_id: i32 = row.try_get("id")  // ✅ i32
        .map_err(|e| format!("Erreur lecture id conversation : {e}"))?;

    sqlx::query(
        "INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)",
    )
        .bind(conv_id)
        .bind(user_id)
        .bind(other_user_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erreur DB : {e}"))?;

    Ok(conv_id as i64) // ✅ cast pour le retour
}
*/