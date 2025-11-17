package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
)

type SessionRepository struct {
	db *Database
}

func NewSessionRepository(db *Database) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(ctx context.Context, req *models.CreateSessionRequest) (*models.Session, error) {
	query := `
		INSERT INTO sessions (
			user_id, fingerprint, page_url, referrer, user_agent,
			screen_width, screen_height, viewport_width, viewport_height,
			device_type, browser, os, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING session_id, started_at, last_activity_at, created_at, updated_at
	`

	session := &models.Session{
		UserID:         req.UserID,
		Fingerprint:    req.Fingerprint,
		PageURL:        req.PageURL,
		Referrer:       req.Referrer,
		UserAgent:      req.UserAgent,
		ScreenWidth:    req.ScreenWidth,
		ScreenHeight:   req.ScreenHeight,
		ViewportWidth:  req.ViewportWidth,
		ViewportHeight: req.ViewportHeight,
		DeviceType:     req.DeviceType,
		Browser:        req.Browser,
		OS:             req.OS,
		Metadata:       req.Metadata,
	}

	err := r.db.Pool.QueryRow(ctx, query,
		req.UserID, req.Fingerprint, req.PageURL, req.Referrer, req.UserAgent,
		req.ScreenWidth, req.ScreenHeight, req.ViewportWidth, req.ViewportHeight,
		req.DeviceType, req.Browser, req.OS, req.Metadata,
	).Scan(
		&session.SessionID,
		&session.StartedAt,
		&session.LastActivityAt,
		&session.CreatedAt,
		&session.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	return session, nil
}

func (r *SessionRepository) GetByID(ctx context.Context, sessionID uuid.UUID) (*models.Session, error) {
	query := `
		SELECT session_id, user_id, fingerprint, started_at, ended_at, last_activity_at,
			page_url, referrer, user_agent, screen_width, screen_height,
			viewport_width, viewport_height, device_type, browser, os, country, city,
			metadata, created_at, updated_at
		FROM sessions
		WHERE session_id = $1
	`

	session := &models.Session{}
	err := r.db.Pool.QueryRow(ctx, query, sessionID).Scan(
		&session.SessionID, &session.UserID, &session.Fingerprint,
		&session.StartedAt, &session.EndedAt, &session.LastActivityAt,
		&session.PageURL, &session.Referrer, &session.UserAgent,
		&session.ScreenWidth, &session.ScreenHeight,
		&session.ViewportWidth, &session.ViewportHeight,
		&session.DeviceType, &session.Browser, &session.OS,
		&session.Country, &session.City, &session.Metadata,
		&session.CreatedAt, &session.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return session, nil
}

func (r *SessionRepository) List(ctx context.Context, limit, offset int) ([]*models.SessionSummary, error) {
	query := `
		SELECT
			s.session_id, s.user_id, s.fingerprint, s.started_at, s.ended_at,
			s.last_activity_at, s.page_url, s.referrer, s.user_agent,
			s.screen_width, s.screen_height, s.viewport_width, s.viewport_height,
			s.device_type, s.browser, s.os, s.country, s.city,
			s.metadata, s.created_at, s.updated_at,
			EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_activity_at) - s.started_at)) as duration_seconds,
			COUNT(DISTINCT e.page_url) as pages_visited,
			COUNT(*) FILTER (WHERE e.event_type = 'click') as click_count,
			COUNT(*) FILTER (WHERE e.event_type = 'input') as input_count,
			COUNT(*) FILTER (WHERE e.event_type = 'scroll') as scroll_count,
			COUNT(*) FILTER (WHERE e.event_type = 'mousemove') as mousemove_count,
			COUNT(*) FILTER (WHERE e.event_type = 'navigation') as navigation_count,
			COUNT(DISTINCT sc.screenshot_id) as screenshot_count,
			MAX(e.timestamp) as last_event_time
		FROM sessions s
		LEFT JOIN events e ON s.session_id = e.session_id
		LEFT JOIN screenshots sc ON s.session_id = sc.session_id
		GROUP BY s.session_id
		ORDER BY s.started_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.Pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []*models.SessionSummary
	for rows.Next() {
		session := &models.SessionSummary{}
		err := rows.Scan(
			&session.SessionID, &session.UserID, &session.Fingerprint,
			&session.StartedAt, &session.EndedAt, &session.LastActivityAt,
			&session.PageURL, &session.Referrer, &session.UserAgent,
			&session.ScreenWidth, &session.ScreenHeight,
			&session.ViewportWidth, &session.ViewportHeight,
			&session.DeviceType, &session.Browser, &session.OS,
			&session.Country, &session.City, &session.Metadata,
			&session.CreatedAt, &session.UpdatedAt,
			&session.DurationSeconds, &session.PagesVisited,
			&session.ClickCount, &session.InputCount, &session.ScrollCount,
			&session.MouseMoveCount, &session.NavigationCount,
			&session.ScreenshotCount, &session.LastEventTime,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}
		sessions = append(sessions, session)
	}

	return sessions, nil
}

func (r *SessionRepository) UpdateEndTime(ctx context.Context, sessionID uuid.UUID) error {
	query := `
		UPDATE sessions
		SET ended_at = NOW(), updated_at = NOW()
		WHERE session_id = $1 AND ended_at IS NULL
	`

	_, err := r.db.Pool.Exec(ctx, query, sessionID)
	if err != nil {
		return fmt.Errorf("failed to update session end time: %w", err)
	}

	return nil
}

func (r *SessionRepository) Count(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM sessions").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count sessions: %w", err)
	}
	return count, nil
}
