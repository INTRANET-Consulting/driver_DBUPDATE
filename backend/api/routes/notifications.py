from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from uuid import uuid4
from datetime import datetime


router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationRequest(BaseModel):
    driver_name: str = Field(..., description="Driver full name")
    date: str = Field(..., description="Date YYYY-MM-DD")
    reason: str = Field("", description="Reason or message for the request")


class Notification(NotificationRequest):
    id: str
    status: str = "pending"
    created_at: datetime


_NOTIFICATIONS: List[Notification] = []


@router.post("", response_model=Notification)
async def create_notification(payload: NotificationRequest):
    """Store an incoming notification (in-memory)."""
    notification = Notification(
        id=str(uuid4()),
        driver_name=payload.driver_name,
        date=payload.date,
        reason=payload.reason,
        status="pending",
        created_at=datetime.utcnow(),
    )
    _NOTIFICATIONS.append(notification)
    return notification


@router.get("", response_model=List[Notification])
async def list_notifications():
    """Return all stored notifications."""
    return list(_NOTIFICATIONS)


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification by id."""
    global _NOTIFICATIONS
    before = len(_NOTIFICATIONS)
    _NOTIFICATIONS = [n for n in _NOTIFICATIONS if n.id != notification_id]
    if len(_NOTIFICATIONS) == before:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"deleted": notification_id}
