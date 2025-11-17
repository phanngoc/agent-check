package models

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	SessionID       uuid.UUID              `json:"session_id" db:"session_id"`
	UserID          *string                `json:"user_id,omitempty" db:"user_id"`
	Fingerprint     *string                `json:"fingerprint,omitempty" db:"fingerprint"`
	StartedAt       time.Time              `json:"started_at" db:"started_at"`
	EndedAt         *time.Time             `json:"ended_at,omitempty" db:"ended_at"`
	LastActivityAt  time.Time              `json:"last_activity_at" db:"last_activity_at"`
	PageURL         string                 `json:"page_url" db:"page_url"`
	Referrer        *string                `json:"referrer,omitempty" db:"referrer"`
	UserAgent       *string                `json:"user_agent,omitempty" db:"user_agent"`
	ScreenWidth     *int                   `json:"screen_width,omitempty" db:"screen_width"`
	ScreenHeight    *int                   `json:"screen_height,omitempty" db:"screen_height"`
	ViewportWidth   *int                   `json:"viewport_width,omitempty" db:"viewport_width"`
	ViewportHeight  *int                   `json:"viewport_height,omitempty" db:"viewport_height"`
	DeviceType      *string                `json:"device_type,omitempty" db:"device_type"`
	Browser         *string                `json:"browser,omitempty" db:"browser"`
	OS              *string                `json:"os,omitempty" db:"os"`
	Country         *string                `json:"country,omitempty" db:"country"`
	City            *string                `json:"city,omitempty" db:"city"`
	Metadata        map[string]interface{} `json:"metadata,omitempty" db:"metadata"`
	CreatedAt       time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at" db:"updated_at"`
}

type SessionSummary struct {
	Session
	DurationSeconds  float64 `json:"duration_seconds" db:"duration_seconds"`
	PagesVisited     int     `json:"pages_visited" db:"pages_visited"`
	ClickCount       int     `json:"click_count" db:"click_count"`
	InputCount       int     `json:"input_count" db:"input_count"`
	ScrollCount      int     `json:"scroll_count" db:"scroll_count"`
	MouseMoveCount   int     `json:"mousemove_count" db:"mousemove_count"`
	NavigationCount  int     `json:"navigation_count" db:"navigation_count"`
	ScreenshotCount  int     `json:"screenshot_count" db:"screenshot_count"`
	LastEventTime    *time.Time `json:"last_event_time,omitempty" db:"last_event_time"`
}

type CreateSessionRequest struct {
	UserID         *string                `json:"user_id,omitempty"`
	Fingerprint    *string                `json:"fingerprint,omitempty"`
	PageURL        string                 `json:"page_url" validate:"required"`
	Referrer       *string                `json:"referrer,omitempty"`
	UserAgent      *string                `json:"user_agent,omitempty"`
	ScreenWidth    *int                   `json:"screen_width,omitempty"`
	ScreenHeight   *int                   `json:"screen_height,omitempty"`
	ViewportWidth  *int                   `json:"viewport_width,omitempty"`
	ViewportHeight *int                   `json:"viewport_height,omitempty"`
	DeviceType     *string                `json:"device_type,omitempty"`
	Browser        *string                `json:"browser,omitempty"`
	OS             *string                `json:"os,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}
