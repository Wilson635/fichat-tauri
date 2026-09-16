pub fn is_preset_avatar_path(path: &str) -> bool {
    const PREFIXES: &[&str] = &[
        "/avatars/homme-jeune-",
        "/avatars/homme-age-",
        "/avatars/homme-barbu-",
        "/avatars/femme-jeune-",
        "/avatars/femme-agee-",
        "/avatars/femme-tresses-",
    ];
    let Some(stem) = path.strip_suffix(".png") else {
        return false;
    };
    for prefix in PREFIXES {
        if let Some(num) = stem.strip_prefix(prefix) {
            if num.len() == 2 && num.chars().all(|c| c.is_ascii_digit()) {
                if let Ok(n) = num.parse::<u32>() {
                    return (1..=10).contains(&n);
                }
            }
        }
    }
    false
}

pub fn validate_avatar_value(value: &str) -> Result<(), String> {
    let url = value.trim();
    if url.is_empty() {
        return Err("Image manquante.".into());
    }
    if is_preset_avatar_path(url) {
        return Ok(());
    }
    if url.len() > 350_000 {
        return Err("Photo trop lourde. Choisissez une image plus légère.".into());
    }
    let ok = url.starts_with("data:image/jpeg;base64,")
        || url.starts_with("data:image/jpg;base64,")
        || url.starts_with("data:image/png;base64,")
        || url.starts_with("data:image/webp;base64,");
    if !ok {
        return Err("Format d’image non pris en charge (JPEG, PNG ou WebP).".into());
    }
    Ok(())
}
