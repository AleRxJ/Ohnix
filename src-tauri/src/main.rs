// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// Beyond the update check below, no custom commands - Fase B wraps the
// existing web app unchanged (see
// docs/architecture/ohnix-multiplatform-strategy.md §6/§25). Hardware
// integration (thermal printer/cash drawer plugins, serial barcode
// scanners) is Fase C, added here as capability-scoped plugins when needed,
// not speculatively now.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_update(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ohnix Desktop");
}

// Runs once on startup, off the main thread, and never touches the loaded
// page: the update prompt below is a native OS dialog (tauri-plugin-dialog),
// not anything drawn by ohnix.co's own JS. This is the ONLY native-update
// mechanism in the app - it exists for changes to THIS binary (permissions,
// icon, future Fase C hardware plugins), never for the web app's own
// content, which already updates itself every time the window loads
// https://ohnix.co live (see src-tauri/README.md).
async fn check_for_update(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            eprintln!("[updater] plugin unavailable: {err}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(err) => {
            eprintln!("[updater] check failed: {err}");
            return;
        }
    };

    let version = update.version.clone();
    let dialog = app.dialog().clone();
    // MessageDialogBuilder's blocking_show() is a real (short) blocking
    // call - spawn_blocking keeps it off the async runtime's worker
    // threads instead of stalling whatever else is scheduled there.
    let should_install = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .message(format!(
                "Hay una nueva version de Ohnix Desktop disponible ({version}). ¿Instalarla ahora? La app se va a reiniciar."
            ))
            .title("Actualizacion disponible")
            .buttons(MessageDialogButtons::YesNo)
            .kind(MessageDialogKind::Info)
            .blocking_show()
    })
    .await
    .unwrap_or(false);

    if !should_install {
        return;
    }

    if let Err(err) = update.download_and_install(|_, _| {}, || {}).await {
        eprintln!("[updater] failed to install update: {err}");
        return;
    }

    app.restart();
}
