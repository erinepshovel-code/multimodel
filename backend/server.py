from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from sse_starlette.sse import EventSourceResponse
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage
import httpx
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 720  # 30 days

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== MODELS ====================

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class APIKeyUpdate(BaseModel):
    provider: Literal["gpt", "claude", "gemini", "grok", "deepseek", "perplexity"]
    api_key: Optional[str] = None
    use_universal: bool = False

class APIKeysResponse(BaseModel):
    gpt: Optional[str] = None
    claude: Optional[str] = None
    gemini: Optional[str] = None
    grok: Optional[str] = None
    deepseek: Optional[str] = None
    perplexity: Optional[str] = None

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    model: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str
    models: List[str]  # List of model identifiers: "gpt-5.2", "claude-sonnet-4-5", etc.
    conversation_id: Optional[str] = None

class MessageFeedback(BaseModel):
    message_id: str
    feedback: Literal["up", "down"]

class SynthesisRequest(BaseModel):
    selected_messages: List[str]  # Message IDs
    target_models: List[str]  # Models to send to
    synthesis_prompt: str

class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": user_id,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user_data.password)
    now = datetime.now(timezone.utc)
    
    user = {
        "id": user_id,
        "username": user_data.username,
        "password": hashed_pw,
        "created_at": now.isoformat(),
        "api_keys": {}
    }
    
    await db.users.insert_one(user)
    
    # Generate token
    token = create_access_token(user_id)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            username=user_data.username,
            created_at=now
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    # Find user
    user = await db.users.find_one({"username": user_data.username})
    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Generate token
    token = create_access_token(user["id"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            created_at=datetime.fromisoformat(user["created_at"])
        )
    )


# ==================== API KEY MANAGEMENT ====================

@api_router.put("/keys")
async def update_api_key(key_data: APIKeyUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    update_data = {}
    if key_data.use_universal:
        update_data[f"api_keys.{key_data.provider}"] = "UNIVERSAL"
    elif key_data.api_key:
        update_data[f"api_keys.{key_data.provider}"] = key_data.api_key
    else:
        # Remove key
        await db.users.update_one(
            {"id": user_id},
            {"$unset": {f"api_keys.{key_data.provider}": ""}}
        )
        return {"message": "API key removed"}
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_data}
    )
    
    return {"message": "API key updated"}

@api_router.get("/keys", response_model=APIKeysResponse)
async def get_api_keys(current_user: dict = Depends(get_current_user)):
    api_keys = current_user.get("api_keys", {})
    
    # Mask keys for security
    masked_keys = {}
    for provider, key in api_keys.items():
        if key == "UNIVERSAL":
            masked_keys[provider] = "UNIVERSAL"
        elif key:
            masked_keys[provider] = f"{key[:8]}...{key[-4:]}"
        else:
            masked_keys[provider] = None
    
    return APIKeysResponse(**masked_keys)


# ==================== CHAT HELPERS ====================

def get_api_key(current_user: dict, provider: str) -> str:
    """Get API key for provider, use universal key if set"""
    user_key = current_user.get("api_keys", {}).get(provider)
    
    if user_key == "UNIVERSAL":
        return os.environ.get("EMERGENT_LLM_KEY", "")
    
    return user_key or ""

async def stream_openai_compatible(base_url: str, api_key: str, model: str, messages: List[dict]):
    """Stream from OpenAI-compatible APIs (Grok, DeepSeek, Perplexity)"""
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True
                },
                timeout=60.0
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    yield json.dumps({"error": f"API error: {response.status_code} - {error_text.decode()}"})
                    return
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield json.dumps({"error": str(e)})

async def stream_emergent_model(api_key: str, model: str, provider: str, messages: List[dict]):
    """Stream from Emergent-supported models (GPT, Claude, Gemini)"""
    try:
        # Filter to only get the last user message
        user_messages = [msg for msg in messages if msg["role"] == "user"]
        if not user_messages:
            yield json.dumps({"error": "No user messages found"})
            return
        
        # Create system message from conversation context if any
        system_msg = ""
        if len(messages) > 2:
            # Include previous conversation as context in system message
            context_msgs = messages[:-1]  # All except last user message
            context = "\n".join([f"{m['role']}: {m['content']}" for m in context_msgs if m['role'] != 'system'])
            if context:
                system_msg = f"Previous conversation:\n{context}\n\nPlease continue the conversation naturally."
        
        chat = LlmChat(
            api_key=api_key,
            session_id=str(uuid.uuid4()),
            system_message=system_msg
        ).with_model(provider, model)
        
        # Send last user message
        user_msg = UserMessage(text=user_messages[-1]["content"])
        response = await chat.send_message(user_msg)
        
        # Stream the response word by word for better UX
        words = response.split()
        for word in words:
            yield word + " "
            await asyncio.sleep(0.05)  # Simulate streaming
            
    except Exception as e:
        logger.error(f"Error streaming from {provider}/{model}: {str(e)}")
        yield json.dumps({"error": str(e)})


# ==================== CHAT ROUTES ====================

@api_router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """Stream responses from multiple AI models"""
    
    async def event_generator():
        # Create or get conversation
        conversation_id = request.conversation_id or str(uuid.uuid4())
        
        # Save user message
        user_message_id = str(uuid.uuid4())
        user_msg = {
            "id": user_message_id,
            "conversation_id": conversation_id,
            "role": "user",
            "content": request.message,
            "model": "user",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user["id"]
        }
        await db.messages.insert_one(user_msg)
        
        # Get conversation history for context
        history = await db.messages.find(
            {"conversation_id": conversation_id, "user_id": current_user["id"]},
            {"_id": 0}
        ).sort("timestamp", 1).limit(10).to_list(10)
        
        messages_context = []
        for msg in history:
            messages_context.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        # Stream from each model
        for model_spec in request.models:
            try:
                # Parse model spec (e.g., "gpt-5.2", "claude-sonnet-4-5", "grok-3")
                model_lower = model_spec.lower()
                
                message_id = str(uuid.uuid4())
                
                # Send start event
                yield {
                    "event": "start",
                    "data": json.dumps({
                        "model": model_spec,
                        "message_id": message_id
                    })
                }
                
                full_response = ""
                
                # Route to appropriate streaming function
                if "gpt" in model_lower or model_lower.startswith("o"):
                    # GPT models
                    api_key = get_api_key(current_user, "gpt")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_emergent_model(api_key, model_spec, "openai", messages_context):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                elif "claude" in model_lower:
                    # Claude models
                    api_key = get_api_key(current_user, "claude")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_emergent_model(api_key, model_spec, "anthropic", messages_context):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                elif "gemini" in model_lower:
                    # Gemini models
                    api_key = get_api_key(current_user, "gemini")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_emergent_model(api_key, model_spec, "gemini", messages_context):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                elif "grok" in model_lower:
                    # Grok models
                    api_key = get_api_key(current_user, "grok")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_openai_compatible(
                        "https://api.x.ai/v1",
                        api_key,
                        model_spec,
                        messages_context
                    ):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                elif "deepseek" in model_lower:
                    # DeepSeek models
                    api_key = get_api_key(current_user, "deepseek")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_openai_compatible(
                        "https://api.deepseek.com",
                        api_key,
                        model_spec,
                        messages_context
                    ):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                elif "perplexity" in model_lower or "sonar" in model_lower:
                    # Perplexity models
                    api_key = get_api_key(current_user, "perplexity")
                    if not api_key:
                        yield {"event": "error", "data": json.dumps({"model": model_spec, "error": "No API key configured"})}
                        continue
                    
                    async for chunk in stream_openai_compatible(
                        "https://api.perplexity.ai",
                        api_key,
                        model_spec,
                        messages_context
                    ):
                        if chunk:
                            full_response += chunk
                            yield {
                                "event": "chunk",
                                "data": json.dumps({
                                    "model": model_spec,
                                    "message_id": message_id,
                                    "content": chunk
                                })
                            }
                
                # Save complete message
                assistant_msg = {
                    "id": message_id,
                    "conversation_id": conversation_id,
                    "role": "assistant",
                    "content": full_response,
                    "model": model_spec,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "user_id": current_user["id"],
                    "feedback": None
                }
                await db.messages.insert_one(assistant_msg)
                
                # Send complete event
                yield {
                    "event": "complete",
                    "data": json.dumps({
                        "model": model_spec,
                        "message_id": message_id
                    })
                }
                
            except Exception as e:
                logger.error(f"Error streaming from {model_spec}: {str(e)}")
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "model": model_spec,
                        "error": str(e)
                    })
                }
        
        # Update conversation
        await db.conversations.update_one(
            {"id": conversation_id},
            {
                "$set": {
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "title": request.message[:50]
                },
                "$setOnInsert": {
                    "id": conversation_id,
                    "user_id": current_user["id"],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            },
            upsert=True
        )
    
    return EventSourceResponse(event_generator())

@api_router.post("/chat/feedback")
async def submit_feedback(
    feedback: MessageFeedback,
    current_user: dict = Depends(get_current_user)
):
    """Submit thumbs up/down feedback for a message"""
    result = await db.messages.update_one(
        {"id": feedback.message_id, "user_id": current_user["id"]},
        {"$set": {"feedback": feedback.feedback}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return {"message": "Feedback submitted"}

@api_router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Get user's conversation history"""
    conversations = await db.conversations.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("updated_at", -1).limit(50).to_list(50)
    
    return [
        ConversationResponse(
            id=conv["id"],
            user_id=conv["user_id"],
            title=conv.get("title", "New Conversation"),
            created_at=datetime.fromisoformat(conv["created_at"]),
            updated_at=datetime.fromisoformat(conv["updated_at"])
        )
        for conv in conversations
    ]

@api_router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get messages from a conversation"""
    messages = await db.messages.find(
        {"conversation_id": conversation_id, "user_id": current_user["id"]},
        {"_id": 0}
    ).sort("timestamp", 1).to_list(1000)
    
    return messages

@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a conversation and its messages"""
    await db.conversations.delete_one({"id": conversation_id, "user_id": current_user["id"]})
    await db.messages.delete_many({"conversation_id": conversation_id, "user_id": current_user["id"]})
    
    return {"message": "Conversation deleted"}


# ==================== BASIC ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Multi-AI Chat API"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
