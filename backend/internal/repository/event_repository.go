package repository

import (
	"context"
	"fmt"
	"math"

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

// roundFloat64ToInt rounds a float64 pointer to int pointer
func roundFloat64ToInt(f *float64) *int {
	if f == nil {
		return nil
	}
	rounded := int(math.Round(*f))
	return &rounded
}

// intToFloat64 converts an int pointer to float64 pointer
func intToFloat64(i *int) *float64 {
	if i == nil {
		return nil
	}
	f := float64(*i)
	return &f
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
		// Round float64 values to int for database (columns are INTEGER)
		viewportX := roundFloat64ToInt(event.ViewportX)
		viewportY := roundFloat64ToInt(event.ViewportY)
		screenX := roundFloat64ToInt(event.ScreenX)
		screenY := roundFloat64ToInt(event.ScreenY)
		scrollX := roundFloat64ToInt(event.ScrollX)
		scrollY := roundFloat64ToInt(event.ScrollY)

		batch.Queue(query,
			sessionID, event.Timestamp, event.EventType,
			event.TargetElement, event.TargetSelector, event.TargetTag,
			event.TargetID, event.TargetClass, event.PageURL,
			viewportX, viewportY, screenX, screenY,
			scrollX, scrollY, event.InputValue, event.InputMasked,
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
		// Scan into temporary int pointers for database INTEGER columns
		var viewportX, viewportY, screenX, screenY, scrollX, scrollY *int
		err := rows.Scan(
			&event.EventID, &event.SessionID, &event.Timestamp, &event.EventType,
			&event.TargetElement, &event.TargetSelector, &event.TargetTag,
			&event.TargetID, &event.TargetClass, &event.PageURL,
			&viewportX, &viewportY, &screenX, &screenY,
			&scrollX, &scrollY, &event.InputValue, &event.InputMasked,
			&event.KeyPressed, &event.MouseButton, &event.ClickCount, &event.EventData,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}
		// Convert int pointers to float64 pointers
		event.ViewportX = intToFloat64(viewportX)
		event.ViewportY = intToFloat64(viewportY)
		event.ScreenX = intToFloat64(screenX)
		event.ScreenY = intToFloat64(screenY)
		event.ScrollX = intToFloat64(scrollX)
		event.ScrollY = intToFloat64(scrollY)
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
		// Scan into temporary int pointers for database INTEGER columns
		var viewportX, viewportY, screenX, screenY, scrollX, scrollY *int
		err := rows.Scan(
			&event.EventID, &event.SessionID, &event.Timestamp, &event.EventType,
			&event.TargetElement, &event.TargetSelector, &event.TargetTag,
			&event.TargetID, &event.TargetClass, &event.PageURL,
			&viewportX, &viewportY, &screenX, &screenY,
			&scrollX, &scrollY, &event.InputValue, &event.InputMasked,
			&event.KeyPressed, &event.MouseButton, &event.ClickCount, &event.EventData,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}
		// Convert int pointers to float64 pointers
		event.ViewportX = intToFloat64(viewportX)
		event.ViewportY = intToFloat64(viewportY)
		event.ScreenX = intToFloat64(screenX)
		event.ScreenY = intToFloat64(screenY)
		event.ScrollX = intToFloat64(scrollX)
		event.ScrollY = intToFloat64(scrollY)
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
