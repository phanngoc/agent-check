package queue

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ngocp/user-tracker/internal/models"
	"github.com/ngocp/user-tracker/internal/repository"
)

// ProcessorConfig holds configuration for the event processor
type ProcessorConfig struct {
	WorkerCount       int
	BatchSize         int64
	ProcessInterval   time.Duration
	ShutdownTimeout   time.Duration
	MaxRetries        int
	RetryDelay        time.Duration
}

// EventProcessor processes events from the queue in the background
type EventProcessor struct {
	queue      *EventQueue
	eventRepo  *repository.EventRepository
	config     ProcessorConfig
	workers    []*Worker
	stopChan   chan struct{}
	wg         sync.WaitGroup
}

// Worker represents a single processing worker
type Worker struct {
	id         int
	processor  *EventProcessor
	stopChan   chan struct{}
}

// NewEventProcessor creates a new event processor
func NewEventProcessor(
	queue *EventQueue,
	eventRepo *repository.EventRepository,
	config ProcessorConfig,
) *EventProcessor {
	workers := make([]*Worker, config.WorkerCount)
	for i := 0; i < config.WorkerCount; i++ {
		workers[i] = &Worker{
			id:        i,
			stopChan:  make(chan struct{}),
		}
	}

	processor := &EventProcessor{
		queue:     queue,
		eventRepo: eventRepo,
		config:    config,
		workers:   workers,
		stopChan:  make(chan struct{}),
	}

	// Set processor reference in workers
	for _, w := range workers {
		w.processor = processor
	}

	return processor
}

// Start begins processing events with all workers
func (ep *EventProcessor) Start(ctx context.Context) error {
	// Create consumer group if it doesn't exist
	if err := ep.queue.CreateConsumerGroup(ctx); err != nil {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	log.Printf("[EventProcessor] Starting %d workers", ep.config.WorkerCount)

	// Start all workers
	for _, worker := range ep.workers {
		ep.wg.Add(1)
		go worker.Run(ctx)
	}

	// Monitor queue depth
	go ep.monitorQueue(ctx)

	return nil
}

// Stop gracefully stops all workers
func (ep *EventProcessor) Stop(ctx context.Context) error {
	log.Println("[EventProcessor] Stopping workers...")
	close(ep.stopChan)

	// Create timeout context for shutdown
	shutdownCtx, cancel := context.WithTimeout(ctx, ep.config.ShutdownTimeout)
	defer cancel()

	// Wait for workers to finish or timeout
	done := make(chan struct{})
	go func() {
		ep.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Println("[EventProcessor] All workers stopped gracefully")
		return nil
	case <-shutdownCtx.Done():
		log.Println("[EventProcessor] Shutdown timeout reached, forcing stop")
		return fmt.Errorf("shutdown timeout exceeded")
	}
}

// Run starts the worker's processing loop
func (w *Worker) Run(ctx context.Context) {
	defer w.processor.wg.Done()

	consumerName := fmt.Sprintf("worker-%d", w.id)
	log.Printf("[Worker-%d] Started", w.id)

	ticker := time.NewTicker(w.processor.config.ProcessInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.processor.stopChan:
			log.Printf("[Worker-%d] Stopped", w.id)
			return
		case <-ticker.C:
			w.processMessages(ctx, consumerName)
		}
	}
}

// processMessages reads and processes a batch of messages
func (w *Worker) processMessages(ctx context.Context, consumerName string) {
	// Read messages from queue
	messages, err := w.processor.queue.ReadEvents(ctx, consumerName, w.processor.config.BatchSize)
	if err != nil {
		log.Printf("[Worker-%d] Error reading messages: %v", w.id, err)
		return
	}

	if len(messages) == 0 {
		return
	}

	log.Printf("[Worker-%d] Processing %d messages", w.id, len(messages))

	// Group messages by session for batch processing
	sessionBatches := make(map[string][]StreamMessage)
	for _, msg := range messages {
		sessionBatches[msg.QueuedEvent.SessionID] = append(sessionBatches[msg.QueuedEvent.SessionID], msg)
	}

	// Process each session's events
	var processedIDs []string
	for sessionIDStr, batch := range sessionBatches {
		sessionID, err := uuid.Parse(sessionIDStr)
		if err != nil {
			log.Printf("[Worker-%d] Invalid session ID: %s, error: %v", w.id, sessionIDStr, err)
			continue
		}

		// Collect all events for this session
		var allEvents []models.EventData
		var messageIDs []string
		for _, msg := range batch {
			allEvents = append(allEvents, msg.QueuedEvent.Events...)
			messageIDs = append(messageIDs, msg.ID)
		}

		// Batch insert to database
		if err := w.processor.eventRepo.CreateBatch(ctx, sessionID, allEvents); err != nil {
			log.Printf("[Worker-%d] Error inserting events for session %s: %v", w.id, sessionIDStr, err)
			// TODO: Implement retry logic or dead letter queue
			continue
		}

		// Mark as successfully processed
		processedIDs = append(processedIDs, messageIDs...)
	}

	// Acknowledge all successfully processed messages
	if len(processedIDs) > 0 {
		if err := w.processor.queue.Acknowledge(ctx, processedIDs...); err != nil {
			log.Printf("[Worker-%d] Error acknowledging messages: %v", w.id, err)
		} else {
			log.Printf("[Worker-%d] Successfully processed %d messages", w.id, len(processedIDs))
		}
	}
}

// monitorQueue periodically logs queue metrics
func (ep *EventProcessor) monitorQueue(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ep.stopChan:
			return
		case <-ticker.C:
			depth, err := ep.queue.GetQueueDepth(ctx)
			if err != nil {
				log.Printf("[Monitor] Error getting queue depth: %v", err)
				continue
			}

			pending, err := ep.queue.GetPendingCount(ctx)
			if err != nil {
				log.Printf("[Monitor] Error getting pending count: %v", err)
				continue
			}

			log.Printf("[Monitor] Queue depth: %d, Pending: %d", depth, pending)

			// Alert if queue is growing too large
			if depth > 10000 {
				log.Printf("[Monitor] WARNING: Queue depth exceeded 10,000 messages!")
			}
		}
	}
}
