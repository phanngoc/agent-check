package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/redis/go-redis/v9"
)

const (
	EventStreamKey = "events:stream"
	ConsumerGroup  = "event-processors"
)

// EventQueue handles queuing and dequeuing of tracking events
type EventQueue struct {
	redis      *redis.Client
	streamKey  string
	maxRetries int
}

// QueuedEvent represents an event in the queue with its session
type QueuedEvent struct {
	SessionID string             `json:"session_id"`
	Events    []models.EventData `json:"events"`
	QueuedAt  time.Time          `json:"queued_at"`
}

// NewEventQueue creates a new event queue
func NewEventQueue(redisClient *RedisClient, maxRetries int) *EventQueue {
	return &EventQueue{
		redis:      redisClient.GetClient(),
		streamKey:  EventStreamKey,
		maxRetries: maxRetries,
	}
}

// Enqueue adds events to the Redis stream
func (eq *EventQueue) Enqueue(ctx context.Context, sessionID uuid.UUID, events []models.EventData) error {
	queuedEvent := QueuedEvent{
		SessionID: sessionID.String(),
		Events:    events,
		QueuedAt:  time.Now(),
	}

	// Serialize the event
	data, err := json.Marshal(queuedEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// Add to Redis stream
	args := &redis.XAddArgs{
		Stream: eq.streamKey,
		MaxLen: 100000, // Keep max 100k messages to prevent unbounded growth
		Approx: true,   // Use approximate trimming for better performance
		Values: map[string]interface{}{
			"data": string(data),
		},
	}

	if _, err := eq.redis.XAdd(ctx, args).Result(); err != nil {
		return fmt.Errorf("failed to add event to stream: %w", err)
	}

	return nil
}

// CreateConsumerGroup creates the consumer group for processing events
// This should be called once at startup
func (eq *EventQueue) CreateConsumerGroup(ctx context.Context) error {
	// Try to create the consumer group
	// If it already exists, ignore the error
	err := eq.redis.XGroupCreateMkStream(ctx, eq.streamKey, ConsumerGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}
	return nil
}

// ReadEvents reads a batch of events from the stream for processing
func (eq *EventQueue) ReadEvents(ctx context.Context, consumerName string, count int64) ([]StreamMessage, error) {
	// Read from the consumer group
	streams, err := eq.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    ConsumerGroup,
		Consumer: consumerName,
		Streams:  []string{eq.streamKey, ">"},
		Count:    count,
		Block:    1 * time.Second, // Block for 1 second if no messages
	}).Result()

	if err != nil {
		if err == redis.Nil {
			// No messages available
			return []StreamMessage{}, nil
		}
		return nil, fmt.Errorf("failed to read from stream: %w", err)
	}

	if len(streams) == 0 {
		return []StreamMessage{}, nil
	}

	// Convert to our StreamMessage type
	messages := make([]StreamMessage, 0, len(streams[0].Messages))
	for _, msg := range streams[0].Messages {
		dataStr, ok := msg.Values["data"].(string)
		if !ok {
			continue
		}

		var queuedEvent QueuedEvent
		if err := json.Unmarshal([]byte(dataStr), &queuedEvent); err != nil {
			continue
		}

		messages = append(messages, StreamMessage{
			ID:           msg.ID,
			QueuedEvent:  queuedEvent,
			DeliveryCount: 0, // Will be tracked by Redis
		})
	}

	return messages, nil
}

// Acknowledge marks messages as successfully processed
func (eq *EventQueue) Acknowledge(ctx context.Context, messageIDs ...string) error {
	if len(messageIDs) == 0 {
		return nil
	}

	if err := eq.redis.XAck(ctx, eq.streamKey, ConsumerGroup, messageIDs...).Err(); err != nil {
		return fmt.Errorf("failed to acknowledge messages: %w", err)
	}

	return nil
}

// GetQueueDepth returns the current number of messages in the stream
func (eq *EventQueue) GetQueueDepth(ctx context.Context) (int64, error) {
	length, err := eq.redis.XLen(ctx, eq.streamKey).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue depth: %w", err)
	}
	return length, nil
}

// GetPendingCount returns the number of pending (unacknowledged) messages
func (eq *EventQueue) GetPendingCount(ctx context.Context) (int64, error) {
	pending, err := eq.redis.XPending(ctx, eq.streamKey, ConsumerGroup).Result()
	if err != nil {
		if err == redis.Nil {
			return 0, nil
		}
		return 0, fmt.Errorf("failed to get pending count: %w", err)
	}
	return pending.Count, nil
}

// StreamMessage represents a message from the Redis stream
type StreamMessage struct {
	ID            string
	QueuedEvent   QueuedEvent
	DeliveryCount int
}
