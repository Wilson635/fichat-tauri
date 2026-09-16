//! Groupe de discussion FiEcho « Employé ».
//! Tous les comptes Active Directory y sont membres, sauf les comptes machine (`$`).

use sqlx::PgPool;

pub const AD_SYNC_KEY: &str = "employe";
pub const DISPLAY_NAME: &str = "Employé";

pub fn is_machine_account(username: &str) -> bool {
    username.contains('$')
}

pub async fn ensure_group(pool: &PgPool) -> Result<(i32, i32), String> {
    if let Some(id) = sqlx::query_scalar::<_, i32>(
        "SELECT id FROM groups WHERE ad_sync_key = $1 LIMIT 1",
    )
    .bind(AD_SYNC_KEY)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Groupe Employé : {e}"))?
    {
        let conv = ensure_conversation(pool, id).await?;
        ensure_app_admins(pool, id, conv).await?;
        return Ok((id, conv));
    }

    if let Some(id) = sqlx::query_scalar::<_, i32>(
        r#"
        SELECT id FROM groups
        WHERE is_active = TRUE
          AND lower(name) IN ('employé', 'employe', 'employee')
        ORDER BY id
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Groupe Employé : {e}"))?
    {
        sqlx::query("UPDATE groups SET ad_sync_key = $1, name = $2 WHERE id = $3")
            .bind(AD_SYNC_KEY)
            .bind(DISPLAY_NAME)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Groupe Employé : {e}"))?;
        let conv = ensure_conversation(pool, id).await?;
        ensure_app_admins(pool, id, conv).await?;
        return Ok((id, conv));
    }

    let group_id: i32 = sqlx::query_scalar(
        r#"
        INSERT INTO groups (name, description, ad_sync_key, is_active)
        VALUES ($1, $2, $3, TRUE)
        RETURNING id
        "#,
    )
    .bind(DISPLAY_NAME)
    .bind("Tous les comptes Active Directory, hors comptes machine ($).")
    .bind(AD_SYNC_KEY)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Création du groupe Employé : {e}"))?;

    let conv_id = ensure_conversation(pool, group_id).await?;
    ensure_app_admins(pool, group_id, conv_id).await?;
    tracing::info!("Groupe FiEcho « Employé » créé (id={group_id}, conv={conv_id})");
    Ok((group_id, conv_id))
}

async fn ensure_conversation(pool: &PgPool, group_id: i32) -> Result<i32, String> {
    if let Some(id) = sqlx::query_scalar::<_, i32>(
        "SELECT id FROM conversations WHERE group_id = $1 AND type = 'group' LIMIT 1",
    )
    .bind(group_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Conversation Employé : {e}"))?
    {
        return Ok(id);
    }
    sqlx::query_scalar(
        "INSERT INTO conversations (type, group_id) VALUES ('group', $1) RETURNING id",
    )
    .bind(group_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Conversation Employé : {e}"))
}

async fn insert_membership(
    pool: &PgPool,
    group_id: i32,
    conv_id: i32,
    user_id: i32,
    source: &str,
) -> Result<(), String> {
    let source = match source {
        "ad" | "admin" => source,
        _ => "manual",
    };
    sqlx::query(
        r#"
        INSERT INTO group_members (group_id, user_id, role, source)
        VALUES ($1, $2, 'member', $3)
        ON CONFLICT (group_id, user_id) DO UPDATE SET
            source = CASE
                WHEN group_members.source = 'admin' THEN 'admin'
                ELSE EXCLUDED.source
            END
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .bind(source)
    .execute(pool)
    .await
    .map_err(|e| format!("Groupe Employé : {e}"))?;
    sqlx::query(
        r#"
        INSERT INTO conversation_participants (conversation_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(conv_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Groupe Employé : {e}"))?;
    Ok(())
}

async fn ensure_app_admins(pool: &PgPool, group_id: i32, conv_id: i32) -> Result<(), String> {
    let ids: Vec<i32> = sqlx::query_scalar(
        "SELECT id FROM users WHERE is_active = TRUE AND role = 'system_admin'",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Admins FiEcho : {e}"))?;
    for uid in ids {
        insert_membership(pool, group_id, conv_id, uid, "admin").await?;
    }
    Ok(())
}

pub async fn membership_locked(pool: &PgPool, group_id: i32) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM groups WHERE id = $1 AND ad_sync_key IS NOT NULL)",
    )
    .bind(group_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// Tous les utilisateurs AD actifs, hors comptes machine (`$`).
pub async fn sync_all_ad_users(pool: &PgPool) -> Result<(), String> {
    let (group_id, conv_id) = ensure_group(pool).await?;
    let user_ids: Vec<i32> = sqlx::query_scalar(
        r#"
        SELECT id FROM users
        WHERE is_active = TRUE
          AND COALESCE(auth_source, 'ad') = 'ad'
          AND position('$' in username) = 0
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Membres Employé : {e}"))?;

    let mut added = 0i32;
    for uid in &user_ids {
        insert_membership(pool, group_id, conv_id, *uid, "ad").await?;
        added += 1;
    }

    let keep: Vec<i32> = user_ids;
    if keep.is_empty() {
        tracing::info!("Groupe Employé : aucun compte AD à rattacher (hors $)");
        ensure_app_admins(pool, group_id, conv_id).await?;
        return Ok(());
    }

    let removed: Vec<i32> = sqlx::query_scalar(
        r#"
        DELETE FROM group_members gm
        USING users u
        WHERE gm.group_id = $1
          AND gm.user_id = u.id
          AND COALESCE(gm.source, 'ad') = 'ad'
          AND (
            u.is_active = FALSE
            OR position('$' in u.username) > 0
            OR NOT (u.id = ANY($2))
          )
        RETURNING gm.user_id
        "#,
    )
    .bind(group_id)
    .bind(&keep)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Retrait Employé : {e}"))?;

    if !removed.is_empty() {
        sqlx::query(
            r#"
            DELETE FROM conversation_participants
            WHERE conversation_id = $1 AND user_id = ANY($2)
            "#,
        )
        .bind(conv_id)
        .bind(&removed)
        .execute(pool)
        .await
        .ok();
    }

    ensure_app_admins(pool, group_id, conv_id).await?;
    tracing::info!(
        "Groupe Employé : {} comptes AD rattachés · {} retirés",
        added,
        removed.len()
    );
    Ok(())
}

pub async fn add_user(pool: &PgPool, user_id: i32, source: &str) -> Result<(), String> {
    let (group_id, conv_id) = ensure_group(pool).await?;
    insert_membership(pool, group_id, conv_id, user_id, source).await?;
    sqlx::query(
        "UPDATE group_join_requests SET status = 'approved', reviewed_at = COALESCE(reviewed_at, NOW())
         WHERE group_id = $1 AND user_id = $2 AND status = 'pending'",
    )
    .bind(group_id)
    .bind(user_id)
    .execute(pool)
    .await
    .ok();
    Ok(())
}

pub async fn request_join(pool: &PgPool, user_id: i32) -> Result<String, String> {
    let (group_id, conv_id) = ensure_group(pool).await?;
    let already: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2)",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    if already {
        return Ok("member".into());
    }
    sqlx::query(
        r#"
        INSERT INTO group_join_requests (group_id, user_id, status)
        VALUES ($1, $2, 'pending')
        ON CONFLICT (group_id, user_id) DO UPDATE SET
            status = 'pending',
            created_at = NOW(),
            reviewed_at = NULL,
            reviewed_by = NULL
        WHERE group_join_requests.status <> 'pending'
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Demande d’adhésion : {e}"))?;
    Ok("pending".into())
}

pub async fn join_status(pool: &PgPool, user_id: i32, group_id: i32, conv_id: i32) -> String {
    let member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2)",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    if member {
        return "member".into();
    }
    let pending: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM group_join_requests WHERE group_id = $1 AND user_id = $2 AND status = 'pending')",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    if pending {
        "pending".into()
    } else {
        "none".into()
    }
}

pub async fn sync_user_from_ad(
    pool: &PgPool,
    user_id: i32,
    username: &str,
) -> Result<(), String> {
    if is_machine_account(username) {
        return Ok(());
    }
    add_user(pool, user_id, "ad").await
}
