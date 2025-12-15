from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from typing import List
from uuid import uuid4
from datetime import datetime
import json
import os
import requests


router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    driver_name: str = Field(..., description="Driver full name")
    date: str = Field(..., description="Date YYYY-MM-DD")
    reason: str = Field("", description="Reason or message for the request")
    actual_message: str | None = Field(None, alias="Actual_message", serialization_alias="Actual_message", description="Full message text")
    whatsapp_from: str | None = Field(None, alias="whatsapp_from", serialization_alias="whatsapp_from", description="Sender WhatsApp number")


class Notification(NotificationRequest):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    status: str = "pending"
    created_at: datetime
    actual_message: str | None = Field(None, alias="Actual_message", serialization_alias="Actual_message")
    whatsapp_from: str | None = Field(None, alias="whatsapp_from", serialization_alias="whatsapp_from")


_NOTIFICATIONS: List[Notification] = []
REPLY_ENDPOINT = os.getenv("REPLY_ENDPOINT", "http://localhost:4001/api/send-reply")
DEDUP_KEYS = set()


@router.post("", response_model=Notification)
async def create_notification(payload: NotificationRequest):
    """Store an incoming notification (in-memory)."""
    dedup_key = f"{payload.driver_name}|{payload.date}"
    if dedup_key in DEDUP_KEYS:
        existing = next((n for n in _NOTIFICATIONS if f"{n.driver_name}|{n.date}" == dedup_key), None)
        if existing:
            print("[notifications] duplicate ignored for", dedup_key)
            return existing
    print("[notifications] incoming payload:", json.dumps(payload.model_dump(by_alias=True), default=str))
    notification = Notification(
        id=str(uuid4()),
        driver_name=payload.driver_name,
        date=payload.date,
        reason=payload.reason,
        actual_message=payload.actual_message,
        whatsapp_from=payload.whatsapp_from,
        status="pending",
        created_at=datetime.utcnow(),
    )
    _NOTIFICATIONS.append(notification)
    DEDUP_KEYS.add(dedup_key)
    print("[notifications] stored notification:", json.dumps(notification.model_dump(by_alias=True), default=str))
    return notification


@router.get("", response_model=List[Notification])
async def list_notifications():
    """Return all stored notifications."""
    print(f"[notifications] list requested, count={len(_NOTIFICATIONS)}")
    return list(_NOTIFICATIONS)


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification by id."""
    global _NOTIFICATIONS
    before = len(_NOTIFICATIONS)
    target = next((n for n in _NOTIFICATIONS if n.id == notification_id), None)
    _NOTIFICATIONS = [n for n in _NOTIFICATIONS if n.id != notification_id]
    if target:
        key = f"{target.driver_name}|{target.date}"
        DEDUP_KEYS.discard(key)
    if len(_NOTIFICATIONS) == before:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"deleted": notification_id}


class ReplyPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    to: str
    reply: str


@router.post("/reply")
async def send_reply(payload: ReplyPayload):
    """Forward a reply to the configured endpoint, logging request/response."""
    print("[notifications] outgoing reply payload:", json.dumps(payload.model_dump(), default=str))
    try:
        resp = requests.post(
            REPLY_ENDPOINT,
            json=payload.model_dump(),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        print("[notifications] reply response:", resp.status_code, resp.text)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Reply endpoint error {resp.status_code}: {resp.text}")
    except requests.RequestException as exc:
        print("[notifications] reply request failed:", exc)
        raise HTTPException(status_code=502, detail="Failed to reach reply endpoint")
    return {"status": "ok"}
