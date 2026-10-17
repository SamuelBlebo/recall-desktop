use std::fs;
use std::path::PathBuf;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Folder that holds recall.db (tauri-plugin-sql resolves `sqlite:recall.db` here).
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

/// Returns (and creates) the backups folder next to the database.
#[tauri::command]
fn backups_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// Deletes the oldest backups so only `keep` remain.
#[tauri::command]
fn prune_backups(app: tauri::AppHandle, keep: usize) -> Result<usize, String> {
    let dir = data_dir(&app)?.join("backups");
    if !dir.exists() {
        return Ok(0);
    }
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "db").unwrap_or(false))
        .collect();
    files.sort(); // names start with a timestamp, so this is oldest-first
    let mut removed = 0;
    while files.len() > keep {
        let p = files.remove(0);
        if fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Opens the backups folder in the file explorer.
#[tauri::command]
fn open_backups(app: tauri::AppHandle) -> Result<(), String> {
    let dir = backups_dir(app.clone())?;
    app.opener()
        .open_path(dir, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Writes a text file into the user's Downloads folder and returns its full path.
#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle, name: String, contents: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || "-_. ".contains(c) { c } else { '_' })
        .collect();
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_initial_tables",
        sql: include_str!("../migrations.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:recall.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            backups_dir,
            prune_backups,
            open_backups,
            save_to_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recall");
}
