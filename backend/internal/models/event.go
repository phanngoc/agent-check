package models

import (
	"time"

	"github.com/google/uuid"
)

type EventType string

const (
	EventTypeClick      EventType = "click"
	EventTypeInput      EventType = "input"
	EventTypeScroll     EventType = "scroll"
	EventTypeMouseMove  EventType = "mousemove"
	EventTypeNavigation EventType = "navigation"
	EventTypeResize     EventType = "resize"
	EventTypeFocus      EventType = "focus"
	EventTypeBlur       EventType = "blur"
	EventTypeChange     EventType = "change"
	EventTypeSubmit     EventType = "submit"
	EventTypeKeyPress   EventType = "keypress"
	EventTypeError      EventType = "error"
)

type Event struct {
	EventID        int64                  `json:"event_id" db:"event_id"`
	SessionID      uuid.UUID              `json:"session_id" db:"session_id"`
	Timestamp      time.Time              `json:"timestamp" db:"timestamp"`
	EventType      EventType              `json:"event_type" db:"event_type"`
	TargetElement  *string                `json:"target_element,omitempty" db:"target_element"`
	TargetSelector *string                `json:"target_selector,omitempty" db:"target_selector"`
	TargetTag      *string                `json:"target_tag,omitempty" db:"target_tag"`
	TargetID       *string                `json:"target_id,omitempty" db:"target_id"`
	TargetClass    *string                `json:"target_class,omitempty" db:"target_class"`
	PageURL        string                 `json:"page_url" db:"page_url"`
	ViewportX      *float64               `json:"viewport_x,omitempty" db:"viewport_x"`
	ViewportY      *float64               `json:"viewport_y,omitempty" db:"viewport_y"`
	ScreenX        *float64               `json:"screen_x,omitempty" db:"screen_x"`
	ScreenY        *float64               `json:"screen_y,omitempty" db:"screen_y"`
	ScrollX        *float64               `json:"scroll_x,omitempty" db:"scroll_x"`
	ScrollY        *float64               `json:"scroll_y,omitempty" db:"scroll_y"`
	InputValue     *string                `json:"input_value,omitempty" db:"input_value"`
	InputMasked    bool                   `json:"input_masked" db:"input_masked"`
	KeyPressed     *string                `json:"key_pressed,omitempty" db:"key_pressed"`
	MouseButton    *int                   `json:"mouse_button,omitempty" db:"mouse_button"`
	ClickCount     *int                   `json:"click_count,omitempty" db:"click_count"`
	EventData      map[string]interface{} `json:"event_data,omitempty" db:"event_data"`
}

type TrackEventRequest struct {
	SessionID      string                 `json:"session_id" validate:"required"`
	Events         []EventData            `json:"events" validate:"required,min=1"`
}

type EventData struct {
	Timestamp      time.Time              `json:"timestamp" validate:"required"`
	EventType      EventType              `json:"event_type" validate:"required"`
	TargetElement  *string                `json:"target_element,omitempty"`
	TargetSelector *string                `json:"target_selector,omitempty"`
	TargetTag      *string                `json:"target_tag,omitempty"`
	TargetID       *string                `json:"target_id,omitempty"`
	TargetClass    *string                `json:"target_class,omitempty"`
	PageURL        string                 `json:"page_url" validate:"required"`
	ViewportX      *float64               `json:"viewport_x,omitempty"`
	ViewportY      *float64               `json:"viewport_y,omitempty"`
	ScreenX        *float64               `json:"screen_x,omitempty"`
	ScreenY        *float64               `json:"screen_y,omitempty"`
	ScrollX        *float64               `json:"scroll_x,omitempty"`
	ScrollY        *float64               `json:"scroll_y,omitempty"`
	InputValue     *string                `json:"input_value,omitempty"`
	InputMasked    bool                   `json:"input_masked"`
	KeyPressed     *string                `json:"key_pressed,omitempty"`
	MouseButton    *int                   `json:"mouse_button,omitempty"`
	ClickCount     *int                   `json:"click_count,omitempty"`
	EventData      map[string]interface{} `json:"event_data,omitempty"`
}
