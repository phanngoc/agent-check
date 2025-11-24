use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
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

        let mut child = cmd.spawn()
            .context("Failed to spawn Claude command")?;

        let stdout = child.stdout.take()
            .context("Failed to get stdout")?;
        let stderr = child.stderr.take()
            .context("Failed to get stderr")?;

        let tx_stdout = tx.clone();
        let tx_stderr = tx.clone();

        // Spawn task to read stdout and parse stream-json
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                // Skip empty lines
                if line.trim().is_empty() {
                    continue;
                }

                // Debug: log raw line
                eprintln!("[Claude stdout] Raw line: {}", line);

                // Try to parse as JSON (stream-json format)
                match serde_json::from_str::<Value>(&line) {
                    Ok(json) => {
                        // Debug: log parsed JSON
                        eprintln!("[Claude stdout] Parsed JSON: {}", serde_json::to_string(&json).unwrap_or_default());
                        
                        // Extract content from JSON
                        // Stream-json format may have: content, delta, text, type, event, etc.
                        let content_opt = json.get("content")
                            .or_else(|| json.get("delta"))
                            .or_else(|| json.get("text"))
                            .or_else(|| {
                                // Check if it's a delta object with text field
                                json.get("delta").and_then(|d| d.get("text"))
                            })
                            .or_else(|| {
                                // Check if it's an event with content
                                json.get("event").and_then(|e| e.get("content"))
                            });
                        
                        if let Some(content_val) = content_opt {
                            let content_str = match content_val {
                                Value::String(s) => s.clone(),
                                Value::Object(_) | Value::Array(_) => {
                                    // If content is object/array, convert to string
                                    serde_json::to_string(content_val).unwrap_or_default()
                                }
                                _ => content_val.to_string(),
                            };
                            
                            // Debug: log extracted content
                            eprintln!("[Claude stdout] Extracted content: {}", content_str);
                            
                            // Only send non-empty content
                            if !content_str.trim().is_empty() {
                                let _ = tx_stdout.send(content_str).await;
                            }
                        } else {
                            // Debug: log when no content field found
                            eprintln!("[Claude stdout] No content field found in JSON");
                            
                            // Try to send the whole JSON as string if it looks like a message
                            if json.get("type").is_some() || json.get("event").is_some() {
                                // Might be a control message, skip it
                                eprintln!("[Claude stdout] Skipping control message");
                            } else {
                                // Send as plain text representation
                                let json_str = serde_json::to_string(&json).unwrap_or_default();
                                if !json_str.trim().is_empty() {
                                    eprintln!("[Claude stdout] Sending JSON as text: {}", json_str);
                                    let _ = tx_stdout.send(json_str).await;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        // Debug: log parse error
                        eprintln!("[Claude stdout] Failed to parse JSON: {} | Line: {}", e, line);
                        
                        // If not JSON, treat as plain text (fallback)
                        // Filter out "[DONE]" and other control signals
                        if line.trim() != "[DONE]" && !line.trim().starts_with("[") {
                            eprintln!("[Claude stdout] Sending as plain text: {}", line);
                            let _ = tx_stdout.send(line).await;
                        } else {
                            eprintln!("[Claude stdout] Filtered out control signal: {}", line);
                        }
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

        // Spawn task to wait for process
        // Note: We don't send "[DONE]" here anymore - it's filtered in the parsing above
        tokio::spawn(async move {
            let _ = child.wait().await;
            // Channel will close automatically when all senders are dropped
        });

        Ok(rx)
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

