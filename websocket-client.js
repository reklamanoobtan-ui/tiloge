/**
 * WebSocket Client for Tilo.life
 * Real-time communication and database synchronization
 */

class TiloWebSocket {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.isConnected = false;
        this.messageQueue = [];
        this.eventHandlers = {};
    }

    connect(url = 'ws://localhost:8765') {
        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // Send queued messages
                while (this.messageQueue.length > 0) {
                    const msg = this.messageQueue.shift();
                    this.send(msg);
                }

                // Trigger connected event
                this.trigger('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.trigger('error', error);
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.isConnected = false;
                this.trigger('disconnected');
                this.attemptReconnect();
            };

        } catch (e) {
            console.error('Failed to create WebSocket:', e);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
            console.error('Max reconnection attempts reached');
            this.trigger('max_reconnect_failed');
        }
    }

    send(data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            // Queue message for later
            this.messageQueue.push(data);
        }
    }

    handleMessage(data) {
        const type = data.type;

        switch (type) {
            case 'chat':
                this.trigger('chat', data);
                break;

            case 'online_count':
                this.trigger('online_count', data.count);
                break;

            case 'global_events':
                this.trigger('global_events', data.events);
                break;

            case 'pong':
                // Heartbeat response
                break;

            default:
                this.trigger(type, data);
        }
    }

    // Event system
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
    }

    trigger(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`Error in event handler for ${event}:`, e);
                }
            });
        }
    }

    // API methods
    sendChat(nickname, message) {
        this.send({
            type: 'chat',
            nickname: nickname,
            message: message
        });
    }

    updateScore(email, score, survivalTime) {
        this.send({
            type: 'score_update',
            email: email,
            score: score,
            survival_time: survivalTime
        });
    }

    getGlobalEvents() {
        this.send({
            type: 'get_events'
        });
    }

    // Heartbeat
    startHeartbeat() {
        setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'ping' });
            }
        }, 30000); // Every 30 seconds
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Export for use in main script
window.TiloWebSocket = TiloWebSocket;
