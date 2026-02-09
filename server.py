"""
Tilo.life WebSocket Server
Real-time game synchronization and database optimization
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Set, Dict
import websockets
from websockets.server import WebSocketServerProtocol
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database connection pool
db_pool = None

# Connected clients
connected_clients: Set[WebSocketServerProtocol] = set()
user_sessions: Dict[str, WebSocketServerProtocol] = {}

# Database configuration
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'
)


async def init_db_pool():
    """Initialize database connection pool"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database pool initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def close_db_pool():
    """Close database connection pool"""
    global db_pool
    if db_pool:
        await db_pool.close()
        logger.info("Database pool closed")


async def broadcast(message: dict, exclude: WebSocketServerProtocol = None):
    """Broadcast message to all connected clients"""
    if not connected_clients:
        return
    
    message_json = json.dumps(message)
    tasks = []
    
    for client in connected_clients:
        if client != exclude and not client.closed:
            tasks.append(client.send(message_json))
    
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def handle_chat_message(data: dict, websocket: WebSocketServerProtocol):
    """Handle chat message with database storage"""
    try:
        nickname = data.get('nickname', 'Anonymous')
        message = data.get('message', '')
        
        if not message or len(message) > 50:
            return
        
        # Store in database
        async with db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO chat_messages (nickname, message, created_at)
                VALUES ($1, $2, NOW())
                """,
                nickname, message
            )
        
        # Broadcast to all clients
        await broadcast({
            'type': 'chat',
            'nickname': nickname,
            'message': message,
            'timestamp': datetime.now().isoformat()
        }, exclude=websocket)
        
        logger.info(f"Chat message from {nickname}: {message}")
        
    except Exception as e:
        logger.error(f"Error handling chat message: {e}")


async def handle_score_update(data: dict, websocket: WebSocketServerProtocol):
    """Handle score update with optimized batch processing"""
    try:
        email = data.get('email')
        score = data.get('score', 0)
        survival_time = data.get('survival_time', 0)
        
        if not email:
            return
        
        # Batch update - only update if score is higher
        async with db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE users 
                SET score = GREATEST(score, $1),
                    survival_time = GREATEST(survival_time, $2),
                    best_score = GREATEST(best_score, $1),
                    last_active = NOW()
                WHERE email = $3
                """,
                score, survival_time, email
            )
        
        logger.info(f"Score updated for {email}: {score}")
        
    except Exception as e:
        logger.error(f"Error updating score: {e}")


async def handle_global_events(websocket: WebSocketServerProtocol):
    """Send active global events to client"""
    try:
        async with db_pool.acquire() as conn:
            events = await conn.fetch(
                """
                SELECT event_type, event_value, expires_at
                FROM global_events
                WHERE expires_at > NOW()
                """
            )
        
        if events:
            event_data = []
            for event in events:
                event_data.append({
                    'type': event['event_type'],
                    'value': event['event_value'],
                    'expires_at': event['expires_at'].isoformat()
                })
            
            await websocket.send(json.dumps({
                'type': 'global_events',
                'events': event_data
            }))
        
    except Exception as e:
        logger.error(f"Error fetching global events: {e}")


async def handle_online_count():
    """Broadcast online user count"""
    count = len(connected_clients)
    await broadcast({
        'type': 'online_count',
        'count': count
    })


async def cleanup_old_messages():
    """Periodic cleanup of old chat messages"""
    try:
        async with db_pool.acquire() as conn:
            deleted = await conn.execute(
                """
                DELETE FROM chat_messages
                WHERE created_at < NOW() - INTERVAL '10 seconds'
                """
            )
        logger.info(f"Cleaned up old messages: {deleted}")
    except Exception as e:
        logger.error(f"Error cleaning up messages: {e}")


async def periodic_cleanup():
    """Run periodic cleanup tasks"""
    while True:
        await asyncio.sleep(5)  # Run every 5 seconds
        await cleanup_old_messages()


async def handle_client(websocket: WebSocketServerProtocol, path: str):
    """Handle individual client connection"""
    connected_clients.add(websocket)
    client_id = id(websocket)
    logger.info(f"Client connected: {client_id}")
    
    try:
        # Send current online count
        await handle_online_count()
        
        # Send active global events
        await handle_global_events(websocket)
        
        # Handle incoming messages
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get('type')
                
                if msg_type == 'chat':
                    await handle_chat_message(data, websocket)
                
                elif msg_type == 'score_update':
                    await handle_score_update(data, websocket)
                
                elif msg_type == 'ping':
                    await websocket.send(json.dumps({'type': 'pong'}))
                
                elif msg_type == 'get_events':
                    await handle_global_events(websocket)
                
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from client {client_id}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client disconnected: {client_id}")
    
    finally:
        connected_clients.discard(websocket)
        await handle_online_count()


async def main():
    """Main server entry point"""
    # Initialize database pool
    await init_db_pool()
    
    # Start periodic cleanup task
    asyncio.create_task(periodic_cleanup())
    
    # Start WebSocket server
    server = await websockets.serve(
        handle_client,
        "0.0.0.0",
        8765,
        ping_interval=20,
        ping_timeout=10
    )
    
    logger.info("WebSocket server started on ws://0.0.0.0:8765")
    
    try:
        await asyncio.Future()  # Run forever
    finally:
        server.close()
        await server.wait_closed()
        await close_db_pool()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
