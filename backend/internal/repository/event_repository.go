package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/ngocp/user-tracker/internal/models"
)

type EventRepository struct {
	db *Database
}

func NewEventRepository(db *Database) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) CreateBatch(ctx context.Context, sessionID uuid.UUID, events []models.EventData) error {
	if len(events) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	query := `
		INSERT INTO events (
			session_id, timestamp, event_type, target_element, target_selector,
			target_tag, target_id, target_class, page_url, viewport_x, viewport_y,
			screen_x, screen_y, scroll_x, scroll_y, input_value, input_masked,
			key_pressed, mouse_button, click_count, event_data
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
	`

	for _, event := range events {
		batch.Queue(query,
			sessionID, event.Timestamp, event.EventType,
			event.TargetElement, event.TargetSelector, event.TargetTag,
			event.TargetID, event.TargetClass, event.PageURL,
			event.ViewportX, event.ViewportY, event.ScreenX, event.ScreenY,
			event.ScrollX, event.ScrollY, event.InputValue, event.InputMasked,
			event.KeyPressed, event.MouseButton, event.ClickCount, event.EventData,
		)
	}

	br := r.db.Pool.SendBatch(ctx, batch)
	defer br.Close()

	for i := 0; i < len(events); i++ {
		_, err := br.Exec()
		if err != nil {
			return fmt.Errorf("failed to insert event %d: %w", i, err)
		}
	}

	return nil
}

func (r *EventRepository) GetBySessionID(ctx context.Context, sessionID uuid.UUID, limit int) ([]*models.Event, error) {
	query := `
		SELECT event_id, session_id, timestamp, event_type, target_element,
			target_selector, target_tag, target_id, target_class, page_url,
			viewport_x, viewport_y, screen_x, screen_y, scroll_x, scroll_y,
			input_value, input_masked, key_pressed, mouse_button, click_count, event_data
		FROM events
		WHERE session_id = $1
		ORDER BY timestamp ASC
		LIMIT $2
	`

	rows, err := r.db.Pool.Query(ctx, query, sessionID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get events: %w", err)
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		err := rows.Scan(
			&event.EventID, &event.SessionID, &event.Timestamp, &event.EventType,
			&event.TargetElement, &event.TargetSelector, &event.TargetTag,
			&event.TargetID, &event.TargetClass, &event.PageURL,
			&event.ViewportX, &event.ViewportY, &event.ScreenX, &event.ScreenY,
			&event.ScrollX, &event.ScrollY, &event.InputValue, &event.InputMasked,
			&event.KeyPressed, &event.MouseButton, &event.ClickCount, &event.EventData,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}
		events = append(events, event)
	}

	return events, nil
}

func (r *EventRepository) GetBySessionIDPaginated(ctx context.Context, sessionID uuid.UUID, limit, offset int) ([]*models.Event, error) {
	query := `
		SELECT event_id, session_id, timestamp, event_type, target_element,
			target_selector, target_tag, target_id, target_class, page_url,
			viewport_x, viewport_y, screen_x, screen_y, scroll_x, scroll_y,
			input_value, input_masked, key_pressed, mouse_button, click_count, event_data
		FROM events
		WHERE session_id = $1
		ORDER BY timestamp ASC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Pool.Query(ctx, query, sessionID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get events: %w", err)
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		event := &models.Event{}
		err := rows.Scan(
			&event.EventID, &event.SessionID, &event.Timestamp, &event.EventType,
			&event.TargetElement, &event.TargetSelector, &event.TargetTag,
			&event.TargetID, &event.TargetClass, &event.PageURL,
			&event.ViewportX, &event.ViewportY, &event.ScreenX, &event.ScreenY,
			&event.ScrollX, &event.ScrollY, &event.InputValue, &event.InputMasked,
			&event.KeyPressed, &event.MouseButton, &event.ClickCount, &event.EventData,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}
		events = append(events, event)
	}

	return events, nil
}

func (r *EventRepository) CountBySessionID(ctx context.Context, sessionID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.Pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM events WHERE session_id = $1",
		sessionID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count events: %w", err)
	}
	return count, nil
}
