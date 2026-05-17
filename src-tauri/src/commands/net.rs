use serde_json::{json, Value};

fn timeout(options: &Value) -> std::time::Duration {
    let ms = options
        .get("timeoutMs")
        .and_then(Value::as_u64)
        .unwrap_or(8000)
        .clamp(2500, 30000);
    std::time::Duration::from_millis(ms)
}

#[tauri::command]
pub async fn net_fetch_json(url: String, options: Value) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(timeout(&options))
        .user_agent("AcademiQ Research/1.23.0")
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(url).send().await {
        Ok(response) => match response.json::<Value>().await {
            Ok(data) => Ok(json!({ "ok": true, "data": data })),
            Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
        },
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
pub async fn net_fetch_text(url: String, options: Value) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(timeout(&options))
        .user_agent("AcademiQ Research/1.23.0")
        .build()
        .map_err(|e| e.to_string())?;
    match client.get(&url).send().await {
        Ok(response) => {
            let final_url = response.url().to_string();
            match response.text().await {
                Ok(text) => Ok(json!({ "ok": true, "text": text, "finalUrl": final_url })),
                Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
            }
        }
        Err(err) => Ok(json!({ "ok": false, "error": err.to_string() })),
    }
}
