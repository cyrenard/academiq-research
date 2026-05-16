use serde_json::{json, Value};

#[tauri::command]
fn not_implemented(name: String) -> Result<Value, String> {
    Ok(json!({
        "ok": false,
        "notImplemented": true,
        "name": name
    }))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![not_implemented])
        .run(tauri::generate_context!())
        .expect("error while running AcademiQ Research Tauri shell");
}
