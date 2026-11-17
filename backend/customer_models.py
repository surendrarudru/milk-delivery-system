from pydantic import BaseModel
from typing import Optional


class CustomerCreate(BaseModel):
    CustomerCode: str
    CustomerName: str
    ReferenceName: Optional[str] = None
    MobileNumber: Optional[str] = None
    Address: Optional[str] = None

    MilkRate: float = 100
    VennaPusaRate: float = 1000

    MorningDelivery: bool = False
    EveningDelivery: bool = False

    WhatsAppAvailable: Optional[bool] = None
    DefaultMilkQuantity: Optional[float] = None

    IsActive: bool = True


class CustomerUpdate(BaseModel):
    CustomerName: Optional[str] = None
    ReferenceName: Optional[str] = None
    MobileNumber: Optional[str] = None
    Address: Optional[str] = None

    MilkRate: Optional[float] = None
    VennaPusaRate: Optional[float] = None

    MorningDelivery: Optional[bool] = None
    EveningDelivery: Optional[bool] = None

    WhatsAppAvailable: Optional[bool] = None
    DefaultMilkQuantity: Optional[float] = None

    IsActive: Optional[bool] = None
from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal


class PaymentCreate(BaseModel):
    CustomerID: int
    PaymentDate: date
    PaymentMode: str
    TotalAmount: Decimal
    MilkAmount: Decimal = Decimal("0")
    VeenaPusaAmount: Decimal = Decimal("0")
    OpeningBalanceAmount: Decimal = Decimal("0")
    Notes: Optional[str] = None