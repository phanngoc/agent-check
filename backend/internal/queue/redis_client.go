package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisClient wraps the Redis client with configuration
type RedisClient struct {
	Client *redis.Client
	URL    string
}

// RedisConfig holds configuration for Redis connection
type RedisConfig struct {
	URL         string
	MaxRetries  int
	PoolSize    int
	MinIdleConn int
}

// NewRedisClient creates a new Redis client with the given configuration
func NewRedisClient(config RedisConfig) (*RedisClient, error) {
	opts, err := redis.ParseURL(config.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	// Apply configuration
	opts.MaxRetries = config.MaxRetries
	opts.PoolSize = config.PoolSize
	opts.MinIdleConns = config.MinIdleConn
	opts.DialTimeout = 5 * time.Second
	opts.ReadTimeout = 3 * time.Second
	opts.WriteTimeout = 3 * time.Second

	client := redis.NewClient(opts)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisClient{
		Client: client,
		URL:    config.URL,
	}, nil
}

// Close closes the Redis connection
func (rc *RedisClient) Close() error {
	return rc.Client.Close()
}

// HealthCheck performs a health check on the Redis connection
func (rc *RedisClient) HealthCheck(ctx context.Context) error {
	return rc.Client.Ping(ctx).Err()
}

// GetClient returns the underlying Redis client
func (rc *RedisClient) GetClient() *redis.Client {
	return rc.Client
}
