use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use serde_json::Value;

pub struct ClaudeService {
    project_root: PathBuf,
}

impl ClaudeService {
    pub fn new(project_root: PathBuf) -> Self {
        Self { project_root }
    }

    /// Execute Claude Code command và stream output
    /// Returns a channel receiver for streaming output
    pub async fn execute_command(
        &self,
        project_path: PathBuf,
        message: String,
    ) -> Result<tokio::sync::mpsc::Receiver<String>> {
        let (tx, rx) = tokio::sync::mpsc::channel(100);

        // Build Claude command
        // claude -p "message" --output-format stream-json --verbose
        let mut cmd = Command::new("claude");
        cmd.arg("-p");
        cmd.arg(&message);
        cmd.arg("--output-format");
        cmd.arg("stream-json");
        cmd.arg("--verbose");
        cmd.current_dir(&project_path);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());

        // Debug: Log the project directory being used
        eprintln!("[Claude] Executing in project directory: {:?}", project_path);

        let mut child = cmd.spawn()
            .context("Failed to spawn Claude command")?;

        eprintln!("[Claude] Process spawned successfully, PID: {:?}", child.id());

        let stdout = child.stdout.take()
            .context("Failed to get stdout")?;
        let stderr = child.stderr.take()
            .context("Failed to get stderr")?;

        let tx_stdout = tx.clone();
        let tx_stderr = tx.clone();
        let tx_status = tx.clone();

        // Spawn task to read stdout - try both line-by-line and byte reading
        tokio::spawn(async move {
            // Read bytes and parse JSON objects
            let mut reader = BufReader::new(stdout);
            let mut buffer = String::new();
            let mut json_buffer = String::new();

            loop {
                // Try to read a chunk of bytes
                let mut chunk = vec![0u8; 1024];
                match reader.read(&mut chunk).await {
                    Ok(0) => {
                        // EOF - process any remaining buffer
                        if !json_buffer.is_empty() {
                            if let Ok(json) = serde_json::from_str::<Value>(&json_buffer) {
                                Self::extract_and_send_content(&json, &tx_stdout).await;
                            }
                        }
                        break;
                    }
                    Ok(n) => {
                        chunk.truncate(n);
                        if let Ok(text) = String::from_utf8(chunk) {
                            buffer.push_str(&text);
                            
                            // Try to parse complete JSON objects from buffer
                            for line in buffer.lines() {
                                if line.trim().is_empty() {
                                    continue;
                                }
                                
                                eprintln!("[Claude stdout] Raw line: {}", line);
                                
                                // Try parsing as JSON
                                match serde_json::from_str::<Value>(line) {
                                    Ok(json) => {
                                        Self::extract_and_send_content(&json, &tx_stdout).await;
                                    }
                                    Err(_) => {
                                        // Not JSON - might be plain text or partial JSON
                                        // Try to accumulate JSON if it looks like partial
                                        if line.trim().starts_with('{') || line.trim().starts_with('[') {
                                            json_buffer.push_str(line);
                                            json_buffer.push('\n');
                                            // Try to parse accumulated buffer
                                            if let Ok(json) = serde_json::from_str::<Value>(&json_buffer) {
                                                Self::extract_and_send_content(&json, &tx_stdout).await;
                                                json_buffer.clear();
                                            }
                                        } else if line.trim() != "[DONE]" && !line.trim().starts_with("[") {
                                            // Plain text - send it
                                            eprintln!("[Claude stdout] Sending as plain text: {}", line);
                                            let _ = tx_stdout.send(line.to_string()).await;
                                        }
                                    }
                                }
                            }
                            
                            // Keep incomplete line in buffer
                            if let Some(last_newline) = buffer.rfind('\n') {
                                buffer = buffer[last_newline + 1..].to_string();
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Claude stdout] Error reading: {}", e);
                        break;
                    }
                }
            }
            
            eprintln!("[Claude stdout] Stream ended");
        });

        // Spawn task to read stderr
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                // Debug: log stderr
                eprintln!("[Claude stderr] {}", line);
                
                // Check if stderr contains useful content (not just errors)
                // Sometimes Claude CLI outputs to stderr
                if line.trim().is_empty() {
                    continue;
                }
                
                // Try to parse as JSON from stderr too
                match serde_json::from_str::<Value>(&line) {
                    Ok(json) => {
                        eprintln!("[Claude stderr] Parsed JSON: {}", serde_json::to_string(&json).unwrap_or_default());
                        
                        // Extract content from stderr JSON too
                        let content_opt = json.get("content")
                            .or_else(|| json.get("delta"))
                            .or_else(|| json.get("text"));
                        
                        if let Some(content_val) = content_opt {
                            let content_str = match content_val {
                                Value::String(s) => s.clone(),
                                _ => content_val.to_string(),
                            };
                            
                            if !content_str.trim().is_empty() {
                                eprintln!("[Claude stderr] Sending content from stderr: {}", content_str);
                                let _ = tx_stderr.send(content_str).await;
                            }
                        } else {
                            // Send as error message
                            let _ = tx_stderr.send(format!("[ERROR] {}", line)).await;
                        }
                    }
                    Err(_) => {
                        // Not JSON, send as error message
                        let _ = tx_stderr.send(format!("[ERROR] {}", line)).await;
                    }
                }
            }
            eprintln!("[Claude stderr] Stream ended");
        });

        // Spawn task to wait for process and check exit status
        tokio::spawn(async move {
            match child.wait().await {
                Ok(status) => {
                    if status.success() {
                        eprintln!("[Claude] Process exited successfully");
                    } else {
                        eprintln!("[Claude] Process exited with error: {:?}", status.code());
                        let _ = tx_status.send(format!("[ERROR] Claude process exited with code: {:?}", status.code())).await;
                    }
                }
                Err(e) => {
                    eprintln!("[Claude] Error waiting for process: {}", e);
                    let _ = tx_status.send(format!("[ERROR] Failed to wait for Claude process: {}", e)).await;
                }
            }
            // Channel will close automatically when all senders are dropped
        });

        Ok(rx)
    }

    /// Helper function to extract text content from nested JSON structures
    /// Handles various Claude API response formats:
    /// - content: [{type: "text", text: "..."}]
    /// - content: {text: "..."}
    /// - content: "plain string"
    fn extract_text_from_content(value: &Value) -> String {
        match value {
            Value::String(s) => s.clone(),
            Value::Array(arr) => {
                // Extract text from array of content blocks
                arr.iter()
                    .filter_map(|item| {
                        // Handle {type: "text", text: "..."} structure
                        if let Some(obj) = item.as_object() {
                            if let Some(item_type) = obj.get("type").and_then(|t| t.as_str()) {
                                if item_type == "text" {
                                    return obj.get("text").and_then(|t| t.as_str()).map(String::from);
                                }
                            }
                            // If no type field, try to get text directly
                            return obj.get("text").and_then(|t| t.as_str()).map(String::from);
                        }
                        None
                    })
                    .collect::<Vec<_>>()
                    .join("")
            }
            Value::Object(obj) => {
                // Handle nested structures: try content field first (recursive), then text
                obj.get("content")
                    .map(|v| Self::extract_text_from_content(v))
                    .or_else(|| obj.get("text").and_then(|v| v.as_str()).map(String::from))
                    .unwrap_or_default()
            }
            _ => String::new()
        }
    }

    /// Extract content from JSON and send to channel
    async fn extract_and_send_content(json: &Value, tx: &tokio::sync::mpsc::Sender<String>) {
        eprintln!("[Claude] Parsed JSON: {}", serde_json::to_string(json).unwrap_or_default());
        
        // Try multiple field names
        let content_opt = json.get("content")
            .or_else(|| json.get("message").and_then(|m| m.get("content")))
            .or_else(|| json.get("delta"))
            .or_else(|| json.get("text"))
            .or_else(|| {
                json.get("delta").and_then(|d| d.get("text"))
            })
            .or_else(|| {
                json.get("event").and_then(|e| e.get("content"))
            })
            .or_else(|| {
                // Check for nested content in various structures
                json.get("choices").and_then(|c| {
                    c.as_array()
                        .and_then(|arr| arr.first())
                        .and_then(|choice| choice.get("delta"))
                        .and_then(|d| d.get("content"))
                })
            });
        
        if let Some(content_val) = content_opt {
            // Use the helper function to extract text from nested structures
            let content_str = Self::extract_text_from_content(content_val);

            if !content_str.trim().is_empty() {
                eprintln!("[Claude] Extracted content: {}", content_str.chars().take(100).collect::<String>());
                let _ = tx.send(content_str).await;
            }
        } else {
            eprintln!("[Claude] No content field found, checking if it's a control message");
            // Check if it's a control message we should skip
            if let Some(msg_type) = json.get("type").and_then(|t| t.as_str()) {
                if msg_type == "message_stop" || msg_type == "done" || msg_type == "error" {
                    eprintln!("[Claude] Skipping control message: {}", msg_type);
                    return;
                }
            }
            
            // If no content but has other useful fields, try to send the whole thing
            if json.get("text").is_some() || json.get("message").is_some() {
                let json_str = serde_json::to_string(json).unwrap_or_default();
                if !json_str.trim().is_empty() {
                    eprintln!("[Claude] Sending whole JSON as text");
                    let _ = tx.send(json_str).await;
                }
            }
        }
    }

    /// Parse Claude response và extract code blocks
    pub fn parse_code_blocks(content: &str) -> Vec<(String, String)> {
        // Simple regex to find code blocks
        // Format: ```language\ncode\n```
        let mut blocks = Vec::new();
        let mut in_block = false;
        let mut current_lang = String::new();
        let mut current_code = String::new();

        for line in content.lines() {
            if line.starts_with("```") {
                if in_block {
                    // End of block
                    blocks.push((current_lang.clone(), current_code.clone()));
                    current_code.clear();
                    current_lang.clear();
                    in_block = false;
                } else {
                    // Start of block
                    let lang = line.trim_start_matches("```").trim();
                    current_lang = lang.to_string();
                    in_block = true;
                }
            } else if in_block {
                if !current_code.is_empty() {
                    current_code.push('\n');
                }
                current_code.push_str(line);
            }
        }

        // Handle unclosed block
        if in_block && !current_code.is_empty() {
            blocks.push((current_lang.clone(), current_code.clone()));
        }

        blocks
    }
}

