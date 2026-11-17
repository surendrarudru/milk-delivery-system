from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date


class DeliveryEntry(BaseModel):
    CustomerID: int

    DeliveryStatus: str = "Delivered"

    MilkQuantity: float = Field(default=0, ge=0)

    VeenaPusaDelivered: bool = False

    VeenaPusaQuantity: float = Field(default=0, ge=0)

    Notes: Optional[str] = None


class DeliverySaveRequest(BaseModel):
    DeliveryDate: date

    Session: str

    DeliveryBoyID: int

    Deliveries: List[DeliveryEntry]