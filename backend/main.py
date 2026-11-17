from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal
import asyncio
import base64
import calendar
import json
import os
import subprocess
import tempfile
import urllib.parse
import webbrowser

try:
    import pyautogui
    import pyperclip
except Exception:
    pyautogui = None
    pyperclip = None

from database import engine
from customer_models import CustomerCreate, CustomerUpdate, PaymentCreate
from delivery_models import DeliverySaveRequest



# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="Milk Delivery Management System",
    description="Milk Delivery and Accounting API",
    version="3.0.0"
)


# ==================================================
# CORS CONFIGURATION
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# MODELS
# ==================================================

class RouteReorderRequest(BaseModel):
    customer_ids: List[int]


class DeliveryCorrectionRequest(BaseModel):
    DeliveryStatus: str
    MilkQuantity: Decimal = Decimal("0")
    VeenaPusaDelivered: bool = False
    VeenaPusaQuantity: Decimal = Decimal("0")
    Notes: Optional[str] = None
    ChangedBy: str = "System"


class OpeningBalanceRequest(BaseModel):
    OpeningDate: date
    Amount: Decimal
    Notes: Optional[str] = None


# ==================================================
# COMMON VALIDATION
# ==================================================

def validate_session(session: str):
    session = session.capitalize()

    if session not in ["Morning", "Evening"]:
        raise HTTPException(
            status_code=400,
            detail="Session must be Morning or Evening"
        )

    return session


# ==================================================
# HOME API
# ==================================================

@app.get("/")
def home():
    return {
        "message": "Milk Delivery Management System API is running"
    }


# ==================================================
# HEALTH API
# ==================================================

@app.get("/health")
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# GET ALL CUSTOMERS
# ==================================================

@app.get("/customers")
def get_customers():
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        CustomerCode,
                        CustomerName,
                        ReferenceName,
                        MobileNumber,
                        Address,
                        MilkRate,
                        VennaPusaRate,
                        MorningDelivery,
                        EveningDelivery,
                        WhatsAppAvailable,
                        DefaultMilkQuantity,
                        IsActive
                    FROM Customers
                    ORDER BY CustomerID
                """)
            )

            return [
                dict(row._mapping)
                for row in result.fetchall()
            ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# GET CUSTOMER BY ID
# ==================================================

@app.get("/customers/{customer_id}")
def get_customer(customer_id: int):
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT *
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            )

            customer = result.fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            return dict(customer._mapping)

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# ADD CUSTOMER
# ==================================================

@app.post("/customers")
def add_customer(customer: CustomerCreate):
    try:
        data = customer.model_dump()

        with engine.begin() as connection:
            result = connection.execute(
                text("""
                    INSERT INTO Customers
                    (
                        CustomerCode,
                        CustomerName,
                        ReferenceName,
                        MobileNumber,
                        Address,
                        MilkRate,
                        VennaPusaRate,
                        MorningDelivery,
                        EveningDelivery,
                        WhatsAppAvailable,
                        DefaultMilkQuantity,
                        IsActive
                    )
                    OUTPUT INSERTED.CustomerID
                    VALUES
                    (
                        :CustomerCode,
                        :CustomerName,
                        :ReferenceName,
                        :MobileNumber,
                        :Address,
                        :MilkRate,
                        :VennaPusaRate,
                        :MorningDelivery,
                        :EveningDelivery,
                        :WhatsAppAvailable,
                        :DefaultMilkQuantity,
                        :IsActive
                    )
                """),
                data
            )

            customer_id = result.scalar_one()

            for session, enabled in [
                ("Morning", data["MorningDelivery"]),
                ("Evening", data["EveningDelivery"])
            ]:

                if enabled and data["IsActive"]:
                    next_order = connection.execute(
                        text("""
                            SELECT ISNULL(MAX(RouteOrder), 0) + 1
                            FROM CustomerRoutes
                            WHERE Session = :session
                        """),
                        {"session": session}
                    ).scalar_one()

                    connection.execute(
                        text("""
                            INSERT INTO CustomerRoutes
                            (
                                CustomerID,
                                Session,
                                RouteOrder,
                                IsActive
                            )
                            VALUES
                            (
                                :customer_id,
                                :session,
                                :route_order,
                                1
                            )
                        """),
                        {
                            "customer_id": customer_id,
                            "session": session,
                            "route_order": next_order
                        }
                    )

        return {
            "message": "Customer added successfully",
            "CustomerID": customer_id
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# UPDATE CUSTOMER
# ==================================================

@app.put("/customers/{customer_id}")
def update_customer(
    customer_id: int,
    customer: CustomerUpdate
):
    try:
        data = customer.model_dump(exclude_unset=True)

        if not data:
            raise HTTPException(
                status_code=400,
                detail="No fields provided for update"
            )

        allowed_fields = {
            "CustomerName",
            "ReferenceName",
            "MobileNumber",
            "Address",
            "MilkRate",
            "VennaPusaRate",
            "MorningDelivery",
            "EveningDelivery",
            "WhatsAppAvailable",
            "DefaultMilkQuantity",
            "IsActive"
        }

        if not set(data).issubset(allowed_fields):
            raise HTTPException(
                status_code=400,
                detail="Invalid update fields"
            )

        with engine.begin() as connection:
            existing = connection.execute(
                text("""
                    SELECT *
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not existing:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            set_clause = ", ".join(
                f"{field} = :{field}"
                for field in data
            )

            data["customer_id"] = customer_id

            connection.execute(
                text(f"""
                    UPDATE Customers
                    SET {set_clause}
                    WHERE CustomerID = :customer_id
                """),
                data
            )

            updated = connection.execute(
                text("""
                    SELECT
                        MorningDelivery,
                        EveningDelivery,
                        IsActive
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            for session, enabled in [
                ("Morning", updated.MorningDelivery),
                ("Evening", updated.EveningDelivery)
            ]:
                route = connection.execute(
                    text("""
                        SELECT RouteID
                        FROM CustomerRoutes
                        WHERE CustomerID = :customer_id
                          AND Session = :session
                    """),
                    {
                        "customer_id": customer_id,
                        "session": session
                    }
                ).fetchone()

                should_be_active = (
                    bool(enabled) and bool(updated.IsActive)
                )

                if route:
                    connection.execute(
                        text("""
                            UPDATE CustomerRoutes
                            SET IsActive = :is_active
                            WHERE CustomerID = :customer_id
                              AND Session = :session
                        """),
                        {
                            "is_active": should_be_active,
                            "customer_id": customer_id,
                            "session": session
                        }
                    )

                elif should_be_active:
                    next_order = connection.execute(
                        text("""
                            SELECT ISNULL(MAX(RouteOrder), 0) + 1
                            FROM CustomerRoutes
                            WHERE Session = :session
                        """),
                        {"session": session}
                    ).scalar_one()

                    connection.execute(
                        text("""
                            INSERT INTO CustomerRoutes
                            (
                                CustomerID,
                                Session,
                                RouteOrder,
                                IsActive
                            )
                            VALUES
                            (
                                :customer_id,
                                :session,
                                :route_order,
                                1
                            )
                        """),
                        {
                            "customer_id": customer_id,
                            "session": session,
                            "route_order": next_order
                        }
                    )

        return {
            "message": "Customer updated successfully",
            "CustomerID": customer_id
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# PERMANENT DELETE CUSTOMER
# ==================================================

@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int):
    try:
        with engine.begin() as connection:
            customer = connection.execute(
                text("""
                    SELECT CustomerID, IsActive
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            if customer.IsActive:
                raise HTTPException(
                    status_code=400,
                    detail="Active customers cannot be deleted"
                )

            history_tables = [
                "DeliveryDetails",
                "MonthlyBills",
                "Payments",
                "CustomerLedger"
            ]

            for table_name in history_tables:
                history = connection.execute(
                    text(f"""
                        SELECT TOP 1 1
                        FROM {table_name}
                        WHERE CustomerID = :customer_id
                    """),
                    {"customer_id": customer_id}
                ).fetchone()

                if history:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Customer has records in {table_name}. "
                            "Customer cannot be permanently deleted."
                        )
                    )

            connection.execute(
                text("""
                    DELETE FROM CustomerRoutes
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            )

            connection.execute(
                text("""
                    DELETE FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            )

        return {
            "message": "Customer permanently deleted",
            "CustomerID": customer_id
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# GET MORNING / EVENING ROUTES
# ==================================================

@app.get("/routes/{session}")
def get_routes(session: str):
    session = validate_session(session)

    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        C.CustomerID,
                        C.CustomerCode,
                        C.CustomerName,
                        C.ReferenceName,
                        C.MobileNumber,
                        C.DefaultMilkQuantity,
                        C.MilkRate,
                        C.VennaPusaRate,
                        CR.Session,
                        CR.RouteOrder
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON CR.CustomerID = C.CustomerID
                    WHERE CR.Session = :session
                      AND CR.IsActive = 1
                      AND C.IsActive = 1
                    ORDER BY CR.RouteOrder ASC
                """),
                {"session": session}
            )

            return [
                dict(row._mapping)
                for row in result.fetchall()
            ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# REORDER ROUTES
# ==================================================

@app.put("/routes/{session}/reorder")
def reorder_route(
    session: str,
    request: RouteReorderRequest
):
    session = validate_session(session)

    customer_ids = request.customer_ids

    if len(customer_ids) != len(set(customer_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate customer IDs are not allowed"
        )

    try:
        with engine.begin() as connection:
            result = connection.execute(
                text("""
                    SELECT CR.CustomerID
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON CR.CustomerID = C.CustomerID
                    WHERE CR.Session = :session
                      AND CR.IsActive = 1
                      AND C.IsActive = 1
                    ORDER BY CR.RouteOrder
                """),
                {"session": session}
            )

            existing_ids = [
                row[0]
                for row in result.fetchall()
            ]

            if set(customer_ids) != set(existing_ids):
                raise HTTPException(
                    status_code=400,
                    detail="Customer list does not match active route"
                )

            connection.execute(
                text("""
                    UPDATE CustomerRoutes
                    SET RouteOrder = -RouteID
                    WHERE Session = :session
                """),
                {"session": session}
            )

            for order, customer_id in enumerate(
                customer_ids,
                start=1
            ):
                connection.execute(
                    text("""
                        UPDATE CustomerRoutes
                        SET RouteOrder = :route_order
                        WHERE CustomerID = :customer_id
                          AND Session = :session
                    """),
                    {
                        "route_order": order,
                        "customer_id": customer_id,
                        "session": session
                    }
                )

            inactive = connection.execute(
                text("""
                    SELECT CR.CustomerID
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON CR.CustomerID = C.CustomerID
                    WHERE CR.Session = :session
                      AND (
                          CR.IsActive = 0
                          OR C.IsActive = 0
                      )
                    ORDER BY CR.RouteID
                """),
                {"session": session}
            ).fetchall()

            for order, row in enumerate(
                inactive,
                start=len(customer_ids) + 1
            ):
                connection.execute(
                    text("""
                        UPDATE CustomerRoutes
                        SET RouteOrder = :route_order
                        WHERE CustomerID = :customer_id
                          AND Session = :session
                    """),
                    {
                        "route_order": order,
                        "customer_id": row[0],
                        "session": session
                    }
                )

        return {
            "message": f"{session} route updated successfully",
            "total_customers": len(customer_ids)
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# GET DELIVERY BOYS
# ==================================================

@app.get("/delivery/boys")
def get_delivery_boys():
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        DeliveryBoyID,
                        DeliveryBoyName,
                        MobileNumber
                    FROM DeliveryBoys
                    WHERE IsActive = 1
                    ORDER BY DeliveryBoyName
                """)
            )

            return [
                dict(row._mapping)
                for row in result.fetchall()
            ]

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# GET DELIVERY CUSTOMERS
# ==================================================

@app.get("/delivery/customers/{session}")
def get_delivery_customers(session: str):
    session = validate_session(session)

    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        C.CustomerID,
                        C.CustomerCode,
                        C.CustomerName,
                        C.ReferenceName,
                        C.MobileNumber,
                        C.DefaultMilkQuantity,
                        C.MilkRate,
                        C.VennaPusaRate,
                        CR.RouteOrder
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON C.CustomerID = CR.CustomerID
                    WHERE CR.Session = :session
                      AND CR.IsActive = 1
                      AND C.IsActive = 1
                    ORDER BY CR.RouteOrder
                """),
                {"session": session}
            )

            return [
                dict(row._mapping)
                for row in result.fetchall()
            ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================================================
# GET EXISTING DELIVERY SESSION
# ==================================================

@app.get("/delivery/session/{delivery_date}/{session}")
def get_delivery_session(delivery_date: date, session: str):
    session = validate_session(session)

    try:
        with engine.connect() as connection:
            session_row = connection.execute(
                text("""
                    SELECT
                        DeliverySessionID,
                        DeliveryDate,
                        Session,
                        DeliveryBoyID,
                        SessionStatus
                    FROM DeliverySessions
                    WHERE DeliveryDate = :delivery_date
                      AND Session = :session
                """),
                {
                    "delivery_date": delivery_date,
                    "session": session
                }
            ).fetchone()

            if not session_row:
                return {
                    "DeliverySessionID": None,
                    "DeliveryDate": str(delivery_date),
                    "Session": session,
                    "DeliveryBoyID": None,
                    "SessionStatus": "NotStarted",
                    "Deliveries": []
                }

            result = connection.execute(
                text("""
                    SELECT
                        DeliveryDetailID,
                        CustomerID,
                        DeliveryStatus,
                        MilkQuantity,
                        MilkRate,
                        MilkAmount,
                        VeenaPusaDelivered,
                        VeenaPusaQuantity,
                        VeenaPusaRate,
                        VeenaPusaAmount,
                        TotalAmount,
                        Notes
                    FROM DeliveryDetails
                    WHERE DeliverySessionID = :session_id
                    ORDER BY CustomerID
                """),
                {"session_id": session_row.DeliverySessionID}
            )

            return {
                "DeliverySessionID": session_row.DeliverySessionID,
                "DeliveryDate": str(session_row.DeliveryDate),
                "Session": session_row.Session,
                "DeliveryBoyID": session_row.DeliveryBoyID,
                "SessionStatus": session_row.SessionStatus,
                "Deliveries": [
                    dict(row._mapping)
                    for row in result.fetchall()
                ]
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================================================
# SAVE ALL DELIVERIES
# ==================================================

@app.post("/delivery/save")
def save_deliveries(request: DeliverySaveRequest):
    session = validate_session(request.Session)

    if not request.Deliveries:
        raise HTTPException(
            status_code=400,
            detail="No delivery entries provided"
        )

    customer_ids = [
        item.CustomerID for item in request.Deliveries
    ]

    if len(customer_ids) != len(set(customer_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate customers in delivery request"
        )

    try:
        with engine.begin() as connection:

            # VERIFY DELIVERY BOY
            boy = connection.execute(
                text("""
                    SELECT DeliveryBoyID
                    FROM DeliveryBoys
                    WHERE DeliveryBoyID = :boy_id
                      AND IsActive = 1
                """),
                {"boy_id": request.DeliveryBoyID}
            ).fetchone()

            if not boy:
                raise HTTPException(
                    status_code=404,
                    detail="Active delivery boy not found"
                )

            # VERIFY ROUTE CUSTOMERS
            route_result = connection.execute(
                text("""
                    SELECT
                        C.CustomerID,
                        C.MilkRate,
                        C.VennaPusaRate
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON C.CustomerID = CR.CustomerID
                    WHERE CR.Session = :session
                      AND CR.IsActive = 1
                      AND C.IsActive = 1
                """),
                {"session": session}
            )

            route_customers = {
                row.CustomerID: row
                for row in route_result.fetchall()
            }

            if set(customer_ids) != set(route_customers):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Delivery list must contain every active "
                        "customer in this route exactly once"
                    )
                )

            # CREATE OR GET SESSION
            existing_session = connection.execute(
                text("""
                    SELECT
                        DeliverySessionID,
                        SessionStatus
                    FROM DeliverySessions
                    WHERE DeliveryDate = :delivery_date
                      AND Session = :session
                """),
                {
                    "delivery_date": request.DeliveryDate,
                    "session": session
                }
            ).fetchone()

            if existing_session:
                if existing_session.SessionStatus == "Completed":
                    raise HTTPException(
                        status_code=400,
                        detail="This delivery session is already completed"
                    )

                delivery_session_id = existing_session.DeliverySessionID

                connection.execute(
                    text("""
                        UPDATE DeliverySessions
                        SET DeliveryBoyID = :boy_id
                        WHERE DeliverySessionID = :session_id
                    """),
                    {
                        "boy_id": request.DeliveryBoyID,
                        "session_id": delivery_session_id
                    }
                )

            else:
                delivery_session_id = connection.execute(
                    text("""
                        INSERT INTO DeliverySessions
                        (
                            DeliveryDate,
                            Session,
                            DeliveryBoyID,
                            SessionStatus
                        )
                        OUTPUT INSERTED.DeliverySessionID
                        VALUES
                        (
                            :delivery_date,
                            :session,
                            :boy_id,
                            'Open'
                        )
                    """),
                    {
                        "delivery_date": request.DeliveryDate,
                        "session": session,
                        "boy_id": request.DeliveryBoyID
                    }
                ).scalar_one()

            saved_count = 0

            for item in request.Deliveries:
                if item.DeliveryStatus not in [
                    "Delivered",
                    "Undelivered"
                ]:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid delivery status"
                    )

                customer = route_customers[item.CustomerID]

                # UNDELIVERED RULE
                if item.DeliveryStatus == "Undelivered":
                    milk_quantity = Decimal("0")
                    veena_quantity = Decimal("0")
                    veena_delivered = False

                else:
                    milk_quantity = Decimal(str(item.MilkQuantity))

                    veena_quantity = (
                        Decimal(str(item.VennaPusaQuantity))
                        if item.VeenaPusaDelivered
                        else Decimal("0")
                    )

                    veena_delivered = bool(
                        item.VeenaPusaDelivered and veena_quantity > 0
                    )

                # GET EXISTING RECORD
                old_record = connection.execute(
                    text("""
                        SELECT *
                        FROM DeliveryDetails
                        WHERE DeliverySessionID = :session_id
                          AND CustomerID = :customer_id
                    """),
                    {
                        "session_id": delivery_session_id,
                        "customer_id": item.CustomerID
                    }
                ).fetchone()

                # PRESERVE HISTORIC RATE SNAPSHOT
                milk_rate = Decimal(
                    str(
                        old_record.MilkRate
                        if old_record
                        else customer.MilkRate
                    )
                )

                veena_rate = Decimal(
                    str(
                        old_record.VennaPusaRate
                        if old_record
                        else customer.VennaPusaRate
                    )
                )

                # CALCULATE AMOUNTS
                milk_amount = milk_quantity * milk_rate
                veena_amount = veena_quantity * veena_rate
                total_amount = milk_amount + veena_amount

                values = {
                    "session_id": delivery_session_id,
                    "customer_id": item.CustomerID,
                    "status": item.DeliveryStatus,
                    "milk_quantity": milk_quantity,
                    "milk_rate": milk_rate,
                    "milk_amount": milk_amount,
                    "veena_delivered": veena_delivered,
                    "veena_quantity": veena_quantity,
                    "veena_rate": veena_rate,
                    "veena_amount": veena_amount,
                    "total_amount": total_amount,
                    "notes": item.Notes
                }

                # UPDATE EXISTING DELIVERY
                if old_record:
                    connection.execute(
                        text("""
                            UPDATE DeliveryDetails
                            SET
                                DeliveryStatus = :status,
                                MilkQuantity = :milk_quantity,
                                MilkRate = :milk_rate,
                                MilkAmount = :milk_amount,
                                VeenaPusaDelivered = :veena_delivered,
                                VeenaPusaQuantity = :veena_quantity,
                                VeenaPusaRate = :veena_rate,
                                VeenaPusaAmount = :veena_amount,
                                TotalAmount = :total_amount,
                                Notes = :notes,
                                UpdatedAt = SYSDATETIME()
                            WHERE DeliveryDetailID = :detail_id
                        """),
                        {
                            **values,
                            "detail_id": old_record.DeliveryDetailID
                        }
                    )

                    connection.execute(
                        text("""
                            INSERT INTO DeliveryAuditLog
                            (
                                DeliveryDetailID,
                                ActionType,
                                OldValues,
                                NewValues,
                                ChangedBy
                            )
                            VALUES
                            (
                                :detail_id,
                                'UPDATE',
                                :old_values,
                                :new_values,
                                'System'
                            )
                        """),
                        {
                            "detail_id": old_record.DeliveryDetailID,
                            "old_values": json.dumps(
                                dict(old_record._mapping),
                                default=str
                            ),
                            "new_values": json.dumps(
                                values,
                                default=str
                            )
                        }
                    )

                # INSERT NEW DELIVERY
                else:
                    detail_id = connection.execute(
                        text("""
                            INSERT INTO DeliveryDetails
                            (
                                DeliverySessionID,
                                CustomerID,
                                DeliveryStatus,
                                MilkQuantity,
                                MilkRate,
                                MilkAmount,
                                VeenaPusaDelivered,
                                VeenaPusaQuantity,
                                VeenaPusaRate,
                                VeenaPusaAmount,
                                TotalAmount,
                                Notes
                            )
                            OUTPUT INSERTED.DeliveryDetailID
                            VALUES
                            (
                                :session_id,
                                :customer_id,
                                :status,
                                :milk_quantity,
                                :milk_rate,
                                :milk_amount,
                                :veena_delivered,
                                :veena_quantity,
                                :veena_rate,
                                :veena_amount,
                                :total_amount,
                                :notes
                            )
                        """),
                        values
                    ).scalar_one()

                    connection.execute(
                        text("""
                            INSERT INTO DeliveryAuditLog
                            (
                                DeliveryDetailID,
                                ActionType,
                                NewValues,
                                ChangedBy
                            )
                            VALUES
                            (
                                :detail_id,
                                'INSERT',
                                :new_values,
                                'System'
                            )
                        """),
                        {
                            "detail_id": detail_id,
                            "new_values": json.dumps(
                                values,
                                default=str
                            )
                        }
                    )

                saved_count += 1

        return {
            "message": "Delivery records saved successfully",
            "delivery_date": str(request.DeliveryDate),
            "session": session,
            "total_customers": saved_count
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================================================
# COMPLETE DELIVERY SESSION
# ==================================================

@app.put("/delivery/session/{delivery_date}/{session}/complete")
def complete_delivery_session(delivery_date: date, session: str):
    session = validate_session(session)

    try:
        with engine.begin() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        DS.DeliverySessionID,
                        COUNT(DD.DeliveryDetailID) AS SavedCount,
                        DS.SessionStatus
                    FROM DeliverySessions DS
                    LEFT JOIN DeliveryDetails DD
                        ON DS.DeliverySessionID = DD.DeliverySessionID
                    WHERE DS.DeliveryDate = :delivery_date
                      AND DS.Session = :session
                    GROUP BY
                        DS.DeliverySessionID,
                        DS.SessionStatus
                """),
                {
                    "delivery_date": delivery_date,
                    "session": session
                }
            ).fetchone()

            if not result:
                raise HTTPException(
                    status_code=404,
                    detail="Delivery session not found"
                )

            if result.SessionStatus == "Completed":
                return {
                    "message": "Delivery session is already completed"
                }

            expected_count = connection.execute(
                text("""
                    SELECT COUNT(*)
                    FROM CustomerRoutes CR
                    INNER JOIN Customers C
                        ON C.CustomerID = CR.CustomerID
                    WHERE CR.Session = :session
                      AND CR.IsActive = 1
                      AND C.IsActive = 1
                """),
                {"session": session}
            ).scalar_one()

            if result.SavedCount != expected_count:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "All route customers must be saved "
                        "before completing the session"
                    )
                )

            connection.execute(
                text("""
                    UPDATE DeliverySessions
                    SET SessionStatus = 'Completed'
                    WHERE DeliverySessionID = :session_id
                """),
                {"session_id": result.DeliverySessionID}
            )

        return {
            "message": "Delivery session completed successfully",
            "date": str(delivery_date),
            "session": session
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    # ==================================================
# MONTHLY BILLING CALENDAR API
# ==================================================

@app.get("/billing/calendar/{year}/{month}")
def get_monthly_billing_calendar(year: int, month: int):

    if year < 2000 or year > 2100:
        raise HTTPException(
            status_code=400,
            detail="Invalid year"
        )

    if month < 1 or month > 12:
        raise HTTPException(
            status_code=400,
            detail="Month must be between 1 and 12"
        )

    try:
        total_days = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)

        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)

        with engine.connect() as connection:
            result = connection.execute(
                text("""
                    SELECT
                        DS.DeliveryDate,
                        DS.Session,
                        DS.SessionStatus,
                        COUNT(DD.DeliveryDetailID) AS SavedCount
                    FROM DeliverySessions DS
                    LEFT JOIN DeliveryDetails DD
                        ON DD.DeliverySessionID =
                           DS.DeliverySessionID
                    WHERE DS.DeliveryDate >= :start_date
                      AND DS.DeliveryDate < :end_date
                    GROUP BY
                        DS.DeliveryDate,
                        DS.Session,
                        DS.SessionStatus
                    ORDER BY
                        DS.DeliveryDate,
                        DS.Session
                """),
                {
                    "start_date": start_date,
                    "end_date": end_date
                }
            )

            session_records = result.fetchall()

        status_lookup = {}

        for row in session_records:
            if row.SessionStatus == "Completed":
                status = "Complete"
            else:
                status = "Pending"

            status_lookup[
                (row.DeliveryDate, row.Session)
            ] = {
                "Status": status,
                "SavedCount": row.SavedCount
            }

        days = []

        for day in range(1, total_days + 1):
            current_date = date(year, month, day)

            morning = status_lookup.get(
                (current_date, "Morning"),
                {
                    "Status": "Missing",
                    "SavedCount": 0
                }
            )

            evening = status_lookup.get(
                (current_date, "Evening"),
                {
                    "Status": "Missing",
                    "SavedCount": 0
                }
            )

            days.append({
                "Date": current_date.isoformat(),
                "Morning": morning,
                "Evening": evening
            })

        return {
            "Year": year,
            "Month": month,
            "TotalDays": total_days,
            "Days": days
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# CUSTOMER-WISE DELIVERY CALENDAR
# ==================================================

@app.get("/customers/{customer_id}/delivery-calendar/{year}/{month}")
def get_customer_delivery_calendar(
    customer_id: int,
    year: int,
    month: int
):

    if year < 2000 or year > 2100:
        raise HTTPException(400, "Invalid year")

    if month < 1 or month > 12:
        raise HTTPException(400, "Invalid month")

    try:
        with engine.connect() as connection:

            customer = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        DefaultMilkQuantity,
                        MorningDelivery,
                        EveningDelivery,
                        IsActive
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(404, "Customer not found")

            total_days = calendar.monthrange(year, month)[1]
            start_date = date(year, month, 1)

            if month == 12:
                end_date = date(year + 1, 1, 1)
            else:
                end_date = date(year, month + 1, 1)

            result = connection.execute(
                text("""
                    SELECT
                        DS.DeliveryDate,
                        DS.Session,
                        DS.SessionStatus,
                        DD.DeliveryDetailID,
                        DD.DeliveryStatus,
                        DD.MilkQuantity,
                        DD.MilkAmount,
                        DD.VeenaPusaDelivered,
                        DD.VeenaPusaQuantity,
                        DD.VeenaPusaAmount,
                        DD.TotalAmount
                    FROM DeliverySessions DS
                    LEFT JOIN DeliveryDetails DD
                        ON DD.DeliverySessionID =
                           DS.DeliverySessionID
                       AND DD.CustomerID = :customer_id
                    WHERE DS.DeliveryDate >= :start_date
                      AND DS.DeliveryDate < :end_date
                    ORDER BY DS.DeliveryDate, DS.Session
                """),
                {
                    "customer_id": customer_id,
                    "start_date": start_date,
                    "end_date": end_date
                }
            ).fetchall()

            records = {}

            for row in result:
                day_key = row.DeliveryDate.isoformat()

                if day_key not in records:
                    records[day_key] = {}

                records[day_key][row.Session] = {
                    "DeliveryDetailID": row.DeliveryDetailID,
                    "SessionStatus": row.SessionStatus,
                    "DeliveryStatus": row.DeliveryStatus,
                    "MilkQuantity": row.MilkQuantity,
                    "MilkAmount": row.MilkAmount,
                    "VeenaPusaDelivered": row.VeenaPusaDelivered,
                    "VeenaPusaQuantity": row.VeenaPusaQuantity,
                    "VeenaPusaAmount": row.VeenaPusaAmount,
                    "TotalAmount": row.TotalAmount
                }

            scheduled_sessions = []

            if customer.MorningDelivery:
                scheduled_sessions.append("Morning")

            if customer.EveningDelivery:
                scheduled_sessions.append("Evening")

            default_quantity = Decimal(
                str(customer.DefaultMilkQuantity or 0)
            )

            days = []
            today = date.today()

            for day in range(1, total_days + 1):
                current_date = date(year, month, day)
                key = current_date.isoformat()

                day_records = records.get(key, {})

                morning = day_records.get("Morning")
                evening = day_records.get("Evening")

                if current_date > today:
                    color = "Grey"

                elif not scheduled_sessions:
                    color = "Grey"

                else:
                    scheduled_records = [
                        day_records.get(s)
                        for s in scheduled_sessions
                    ]

                    if any(
                        record is None or
                        record["DeliveryDetailID"] is None
                        for record in scheduled_records
                    ):
                        color = "Red"

                    elif any(
                        record["DeliveryStatus"] == "Undelivered"
                        for record in scheduled_records
                    ):
                        color = "Red"

                    elif any(
                        Decimal(
                            str(record["MilkQuantity"] or 0)
                        ) != default_quantity
                        for record in scheduled_records
                    ):
                        color = "Yellow"

                    else:
                        color = "Green"

                days.append({
                    "Date": key,
                    "Color": color,
                    "Morning": morning,
                    "Evening": evening
                })

            return {
                "CustomerID": customer_id,
                "Year": year,
                "Month": month,
                "DefaultMilkQuantity": default_quantity,
                "ScheduledSessions": scheduled_sessions,
                "TotalDays": total_days,
                "Days": days
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# CUSTOMER DELIVERY HISTORY FOR SELECTED DATE
# ==================================================

@app.get("/customers/{customer_id}/delivery-history/{delivery_date}")
def get_customer_delivery_history(
    customer_id: int,
    delivery_date: date
):

    try:
        with engine.connect() as connection:

            customer = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        CustomerName,
                        DefaultMilkQuantity,
                        MilkRate,
                        VennaPusaRate,
                        MorningDelivery,
                        EveningDelivery
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(404, "Customer not found")

            result = connection.execute(
                text("""
                    SELECT
                        DS.DeliverySessionID,
                        DS.Session,
                        DS.SessionStatus,
                        DS.DeliveryBoyID,
                        DD.DeliveryDetailID,
                        DD.DeliveryStatus,
                        DD.MilkQuantity,
                        DD.MilkRate,
                        DD.MilkAmount,
                        DD.VeenaPusaDelivered,
                        DD.VeenaPusaQuantity,
                        DD.VeenaPusaRate,
                        DD.VeenaPusaAmount,
                        DD.TotalAmount,
                        DD.Notes,
                        DD.UpdatedAt
                    FROM DeliverySessions DS
                    LEFT JOIN DeliveryDetails DD
                        ON DD.DeliverySessionID =
                           DS.DeliverySessionID
                       AND DD.CustomerID = :customer_id
                    WHERE DS.DeliveryDate = :delivery_date
                    ORDER BY
                        CASE
                            WHEN DS.Session = 'Morning' THEN 1
                            ELSE 2
                        END
                """),
                {
                    "customer_id": customer_id,
                    "delivery_date": delivery_date
                }
            ).fetchall()

            sessions = []

            for row in result:
                sessions.append({
                    "DeliverySessionID": row.DeliverySessionID,
                    "Session": row.Session,
                    "SessionStatus": row.SessionStatus,
                    "DeliveryBoyID": row.DeliveryBoyID,
                    "DeliveryDetailID": row.DeliveryDetailID,
                    "DeliveryStatus": row.DeliveryStatus,
                    "MilkQuantity": row.MilkQuantity,
                    "MilkRate": row.MilkRate,
                    "MilkAmount": row.MilkAmount,
                    "VeenaPusaDelivered": row.VeenaPusaDelivered,
                    "VeenaPusaQuantity": row.VeenaPusaQuantity,
                    "VeenaPusaRate": row.VeenaPusaRate,
                    "VeenaPusaAmount": row.VeenaPusaAmount,
                    "TotalAmount": row.TotalAmount,
                    "Notes": row.Notes,
                    "UpdatedAt": row.UpdatedAt
                })

            return {
                "CustomerID": customer_id,
                "CustomerName": customer.CustomerName,
                "DeliveryDate": delivery_date.isoformat(),
                "DefaultMilkQuantity": customer.DefaultMilkQuantity,
                "Sessions": sessions
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# CORRECT COMPLETED DELIVERY RECORD
# ==================================================

@app.put("/delivery/correction/{detail_id}")
def correct_delivery_record(
    detail_id: int,
    request: DeliveryCorrectionRequest
):

    if request.DeliveryStatus not in ["Delivered", "Undelivered"]:
        raise HTTPException(
            status_code=400,
            detail="DeliveryStatus must be Delivered or Undelivered"
        )

    if request.MilkQuantity < 0 or request.VeenaPusaQuantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Quantities cannot be negative"
        )

    try:
        with engine.begin() as connection:

            old = connection.execute(
                text("""
                    SELECT
                        DD.*,
                        DS.DeliveryDate,
                        DS.Session,
                        DS.SessionStatus
                    FROM DeliveryDetails DD
                    INNER JOIN DeliverySessions DS
                        ON DS.DeliverySessionID =
                           DD.DeliverySessionID
                    WHERE DD.DeliveryDetailID = :detail_id
                """),
                {"detail_id": detail_id}
            ).fetchone()

            if not old:
                raise HTTPException(
                    status_code=404,
                    detail="Delivery record not found"
                )

            if old.SessionStatus != "Completed":
                raise HTTPException(
                    status_code=400,
                    detail="Use normal Delivery Entry to edit an Open session"
                )

            # Finalized bills cannot be edited.
            finalized_bill = connection.execute(
                text("""
                    SELECT TOP 1 BillID
                    FROM MonthlyBills
                    WHERE CustomerID = :customer_id
                      AND BillYear = :bill_year
                      AND BillMonth = :bill_month
                      AND BillStatus = 'Finalized'
                """),
                {
                    "customer_id": old.CustomerID,
                    "bill_year": old.DeliveryDate.year,
                    "bill_month": old.DeliveryDate.month
                }
            ).fetchone()

            if finalized_bill:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "This month's bill is finalized. "
                        "Create a bill adjustment instead."
                    )
                )

            if request.DeliveryStatus == "Undelivered":
                milk_quantity = Decimal("0")
                veena_quantity = Decimal("0")
                veena_delivered = False

            else:
                milk_quantity = Decimal(str(request.MilkQuantity))

                veena_quantity = (
                    Decimal(str(request.VeenaPusaQuantity))
                    if request.VeenaPusaDelivered
                    else Decimal("0")
                )

                veena_delivered = bool(
                    request.VeenaPusaDelivered and
                    veena_quantity > 0
                )

            # Preserve original historical rates.
            milk_rate = Decimal(str(old.MilkRate or 0))
            veena_rate = Decimal(str(old.VeenaPusaRate or 0))

            milk_amount = milk_quantity * milk_rate
            veena_amount = veena_quantity * veena_rate
            total_amount = milk_amount + veena_amount

            new_values = {
                "DeliveryStatus": request.DeliveryStatus,
                "MilkQuantity": milk_quantity,
                "MilkRate": milk_rate,
                "MilkAmount": milk_amount,
                "VeenaPusaDelivered": veena_delivered,
                "VeenaPusaQuantity": veena_quantity,
                "VeenaPusaRate": veena_rate,
                "VeenaPusaAmount": veena_amount,
                "TotalAmount": total_amount,
                "Notes": request.Notes
            }

            connection.execute(
                text("""
                    UPDATE DeliveryDetails
                    SET
                        DeliveryStatus = :status,
                        MilkQuantity = :milk_quantity,
                        MilkRate = :milk_rate,
                        MilkAmount = :milk_amount,
                        VeenaPusaDelivered = :veena_delivered,
                        VeenaPusaQuantity = :veena_quantity,
                        VeenaPusaRate = :veena_rate,
                        VeenaPusaAmount = :veena_amount,
                        TotalAmount = :total_amount,
                        Notes = :notes,
                        UpdatedAt = SYSDATETIME()
                    WHERE DeliveryDetailID = :detail_id
                """),
                {
                    "status": request.DeliveryStatus,
                    "milk_quantity": milk_quantity,
                    "milk_rate": milk_rate,
                    "milk_amount": milk_amount,
                    "veena_delivered": veena_delivered,
                    "veena_quantity": veena_quantity,
                    "veena_rate": veena_rate,
                    "veena_amount": veena_amount,
                    "total_amount": total_amount,
                    "notes": request.Notes,
                    "detail_id": detail_id
                }
            )

            connection.execute(
                text("""
                    INSERT INTO DeliveryAuditLog
                    (
                        DeliveryDetailID,
                        ActionType,
                        OldValues,
                        NewValues,
                        ChangedBy,
                        ChangedAt
                    )
                    VALUES
                    (
                        :detail_id,
                        'UPDATE',
                        :old_values,
                        :new_values,
                        :changed_by,
                        SYSDATETIME()
                    )
                """),
                {
                    "detail_id": detail_id,
                    "old_values": json.dumps(
                        dict(old._mapping),
                        default=str
                    ),
                    "new_values": json.dumps(
                        new_values,
                        default=str
                    ),
                    "changed_by": request.ChangedBy
                }
            )

            return {
                "message": "Delivery record corrected successfully",
                "DeliveryDetailID": detail_id,
                "DeliveryDate": old.DeliveryDate.isoformat(),
                "Session": old.Session,
                "UpdatedValues": new_values
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==================================================
# GET DELIVERY CORRECTION AUDIT HISTORY
# ==================================================

@app.get("/delivery/correction/{detail_id}/audit")
def get_delivery_correction_audit(detail_id: int):

    try:
        with engine.connect() as connection:

            exists = connection.execute(
                text("""
                    SELECT DeliveryDetailID
                    FROM DeliveryDetails
                    WHERE DeliveryDetailID = :detail_id
                """),
                {"detail_id": detail_id}
            ).fetchone()

            if not exists:
                raise HTTPException(
                    status_code=404,
                    detail="Delivery record not found"
                )

            result = connection.execute(
                text("""
                    SELECT
                        AuditID,
                        DeliveryDetailID,
                        ActionType,
                        OldValues,
                        NewValues,
                        ChangedBy,
                        ChangedAt
                    FROM DeliveryAuditLog
                    WHERE DeliveryDetailID = :detail_id
                    ORDER BY ChangedAt DESC, AuditID DESC
                """),
                {"detail_id": detail_id}
            ).fetchall()

            return [
                dict(row._mapping)
                for row in result
            ]

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# ADD CUSTOMER OPENING BALANCE
# ==================================================

@app.post("/customers/{customer_id}/opening-balance")
def add_customer_opening_balance(
    customer_id: int,
    request: OpeningBalanceRequest
):
    if request.Amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Opening balance cannot be negative"
        )

    try:
        with engine.begin() as connection:

            # VERIFY CUSTOMER
            customer = connection.execute(
                text("""
                    SELECT CustomerID, CustomerName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # PREVENT DUPLICATE OPENING BALANCE
            existing = connection.execute(
                text("""
                    SELECT LedgerID
                    FROM CustomerLedger
                    WHERE CustomerID = :customer_id
                      AND TransactionType = 'OpeningBalance'
                      AND AccountType = 'OpeningBalance'
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="Opening balance already exists for this customer"
                )

            # ZERO BALANCE DOES NOT NEED A LEDGER ENTRY
            if request.Amount == 0:
                return {
                    "message": "Zero opening balance recorded",
                    "CustomerID": customer_id,
                    "CustomerName": customer.CustomerName,
                    "OpeningAmount": 0
                }

            # INSERT OPENING BALANCE
            ledger_id = connection.execute(
                text("""
                    INSERT INTO CustomerLedger
                    (
                        CustomerID,
                        TransactionDate,
                        TransactionType,
                        AccountType,
                        DebitAmount,
                        CreditAmount,
                        ReferenceID,
                        Description
                    )
                    OUTPUT INSERTED.LedgerID
                    VALUES
                    (
                        :customer_id,
                        :opening_date,
                        'OpeningBalance',
                        'OpeningBalance',
                        :amount,
                        0,
                        NULL,
                        :description
                    )
                """),
                {
                    "customer_id": customer_id,
                    "opening_date": request.OpeningDate,
                    "amount": request.Amount,
                    "description": (
                        request.Notes
                        or "October 31 Opening Outstanding Balance"
                    )
                }
            ).scalar_one()

        return {
            "message": "Opening balance saved successfully",
            "CustomerID": customer_id,
            "CustomerName": customer.CustomerName,
            "LedgerID": ledger_id,
            "OpeningDate": request.OpeningDate.isoformat(),
            "OpeningAmount": request.Amount
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# PAYMENT MODE VALIDATION
# ==================================================

def validate_payment_mode(mode: str):

    allowed_modes = ["Cash", "UPI", "Bank", "Other"]

    if mode not in allowed_modes:
        raise HTTPException(
            status_code=400,
            detail="Payment mode must be Cash, UPI, Bank or Other"
        )

    return mode
# ==================================================
# ADD CUSTOMER PAYMENT API
# ==================================================

@app.post("/payments")
def add_payment(payment: PaymentCreate):

    # VALIDATE PAYMENT MODE
    validate_payment_mode(payment.PaymentMode)

    # CONVERT AMOUNTS TO DECIMAL
    total_amount = Decimal(str(payment.TotalAmount))
    milk_amount = Decimal(str(payment.MilkAmount))
    veena_amount = Decimal(str(payment.VeenaPusaAmount))
    opening_amount = Decimal(str(payment.OpeningBalanceAmount))

    # VALIDATE AMOUNTS
    if total_amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Payment amount must be greater than zero"
        )

    if min(milk_amount, veena_amount, opening_amount) < 0:
        raise HTTPException(
            status_code=400,
            detail="Payment allocations cannot be negative"
        )

    allocated_total = (
        milk_amount +
        veena_amount +
        opening_amount
    )

    if allocated_total != total_amount:
        raise HTTPException(
            status_code=400,
            detail="Payment allocations must equal TotalAmount"
        )

    try:
        with engine.begin() as connection:

            # VERIFY CUSTOMER
            customer = connection.execute(
                text("""
                    SELECT CustomerID, CustomerName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": payment.CustomerID}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # CHECK CURRENT OPENING BALANCE
            opening_balance = connection.execute(
                text("""
                    SELECT
                        ISNULL(SUM(DebitAmount), 0) -
                        ISNULL(SUM(CreditAmount), 0)
                    FROM CustomerLedger
                    WHERE CustomerID = :customer_id
                      AND AccountType = 'OpeningBalance'
                """),
                {"customer_id": payment.CustomerID}
            ).scalar_one()

            if opening_amount > Decimal(str(opening_balance)):
                raise HTTPException(
                    status_code=400,
                    detail="Opening Balance allocation exceeds outstanding Opening Balance"
                )

            # NEXT PART WILL SAVE PAYMENT AND LEDGER
            # INSERT PAYMENT MASTER RECORD
            payment_id = connection.execute(
                text("""
                    INSERT INTO Payments
                    (
                        CustomerID,
                        PaymentDate,
                        PaymentMode,
                        TotalAmount,
                        Notes
                    )
                    OUTPUT INSERTED.PaymentID
                    VALUES
                    (
                        :customer_id,
                        :payment_date,
                        :payment_mode,
                        :total_amount,
                        :notes
                    )
                """),
                {
                    "customer_id": payment.CustomerID,
                    "payment_date": payment.PaymentDate,
                    "payment_mode": payment.PaymentMode,
                    "total_amount": total_amount,
                    "notes": payment.Notes
                }
            ).scalar_one()

            # PREPARE PAYMENT ALLOCATIONS
            allocations = [
                ("OpeningBalance", opening_amount),
                ("Milk", milk_amount),
                ("VeenaPusa", veena_amount)
            ]

            # SAVE ALLOCATIONS AND CUSTOMER LEDGER
            for account_type, amount in allocations:

                if amount <= 0:
                    continue

                # PAYMENT ALLOCATION
                connection.execute(
                    text("""
                        INSERT INTO PaymentAllocations
                        (
                            PaymentID,
                            AccountType,
                            AllocatedAmount
                        )
                        VALUES
                        (
                            :payment_id,
                            :account_type,
                            :amount
                        )
                    """),
                    {
                        "payment_id": payment_id,
                        "account_type": account_type,
                        "amount": amount
                    }
                )

                # CUSTOMER LEDGER CREDIT
                connection.execute(
                    text("""
                        INSERT INTO CustomerLedger
                        (
                            CustomerID,
                            TransactionDate,
                            TransactionType,
                            AccountType,
                            DebitAmount,
                            CreditAmount,
                            ReferenceID,
                            Description
                        )
                        VALUES
                        (
                            :customer_id,
                            :payment_date,
                            'Payment',
                            :account_type,
                            0,
                            :amount,
                            :payment_id,
                            :description
                        )
                    """),
                    {
                        "customer_id": payment.CustomerID,
                        "payment_date": payment.PaymentDate,
                        "account_type": account_type,
                        "amount": amount,
                        "payment_id": payment_id,
                        "description": f"{account_type} payment"
                    }
                )

        return {
            "message": "Payment saved successfully",
            "PaymentID": payment_id,
            "CustomerID": payment.CustomerID,
            "CustomerName": customer.CustomerName,
            "PaymentDate": payment.PaymentDate.isoformat(),
            "PaymentMode": payment.PaymentMode,
            "TotalAmount": total_amount,
            "OpeningBalanceAmount": opening_amount,
            "MilkAmount": milk_amount,
            "VeenaPusaAmount": veena_amount
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# GET CUSTOMER PAYMENT HISTORY
# ==================================================

@app.get("/customers/{customer_id}/payments")
def get_customer_payments(customer_id: int):

    try:
        with engine.connect() as connection:

            customer = connection.execute(
                text("""
                    SELECT CustomerID, CustomerName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # NEXT PART: FETCH PAYMENT HISTORY
            # FETCH PAYMENT HISTORY
            result = connection.execute(
                text("""
                    SELECT
                        P.PaymentID,
                        P.PaymentDate,
                        P.PaymentMode,
                        P.TotalAmount,
                        P.Notes,
                        P.CreatedAt,
                        PA.AccountType,
                        PA.AllocatedAmount
                    FROM Payments P
                    LEFT JOIN PaymentAllocations PA
                        ON PA.PaymentID = P.PaymentID
                    WHERE P.CustomerID = :customer_id
                    ORDER BY
                        P.PaymentDate DESC,
                        P.PaymentID DESC,
                        PA.AccountType
                """),
                {"customer_id": customer_id}
            ).fetchall()

            payments = {}

            for row in result:

                payment_id = row.PaymentID

                if payment_id not in payments:
                    payments[payment_id] = {
                        "PaymentID": payment_id,
                        "PaymentDate": row.PaymentDate,
                        "PaymentMode": row.PaymentMode,
                        "TotalAmount": row.TotalAmount,
                        "Notes": row.Notes,
                        "CreatedAt": row.CreatedAt,
                        "Allocations": []
                    }

                if row.AccountType is not None:
                    payments[payment_id]["Allocations"].append({
                        "AccountType": row.AccountType,
                        "AllocatedAmount": row.AllocatedAmount
                    })

            return {
                "CustomerID": customer.CustomerID,
                "CustomerName": customer.CustomerName,
                "TotalPayments": len(payments),
                "Payments": list(payments.values())
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# GET CUSTOMER LEDGER
# ==================================================

@app.get("/customers/{customer_id}/ledger")
def get_customer_ledger(customer_id: int):

    try:
        with engine.connect() as connection:

            # VERIFY CUSTOMER
            customer = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        CustomerName,
                        CustomerCode
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # NEXT PART: FETCH LEDGER TRANSACTIONS
            # FETCH LEDGER TRANSACTIONS
            result = connection.execute(
                text("""
                    SELECT
                        LedgerID,
                        TransactionDate,
                        TransactionType,
                        AccountType,
                        DebitAmount,
                        CreditAmount,
                        ReferenceID,
                        Description,
                        CreatedAt
                    FROM CustomerLedger
                    WHERE CustomerID = :customer_id
                    ORDER BY
                        TransactionDate ASC,
                        LedgerID ASC
                """),
                {"customer_id": customer_id}
            ).fetchall()

            # INITIALIZE ACCOUNT BALANCES
            balances = {
                "OpeningBalance": Decimal("0"),
                "Milk": Decimal("0"),
                "VeenaPusa": Decimal("0")
            }

            transactions = []

            # CALCULATE RUNNING BALANCES
            for row in result:

                account_type = row.AccountType

                debit = Decimal(str(row.DebitAmount or 0))
                credit = Decimal(str(row.CreditAmount or 0))

                if account_type not in balances:
                    balances[account_type] = Decimal("0")

                balances[account_type] += debit - credit

                transactions.append({
                    "LedgerID": row.LedgerID,
                    "TransactionDate": row.TransactionDate,
                    "TransactionType": row.TransactionType,
                    "AccountType": account_type,
                    "DebitAmount": debit,
                    "CreditAmount": credit,
                    "Balance": balances[account_type],
                    "ReferenceID": row.ReferenceID,
                    "Description": row.Description,
                    "CreatedAt": row.CreatedAt
                })

            # CALCULATE FINAL ACCOUNT BALANCES
            opening_balance = balances["OpeningBalance"]
            milk_balance = balances["Milk"]
            veena_balance = balances["VeenaPusa"]

            combined_balance = (
                opening_balance +
                milk_balance +
                veena_balance
            )

            return {
                "CustomerID": customer.CustomerID,
                "CustomerCode": customer.CustomerCode,
                "CustomerName": customer.CustomerName,
                "AccountBalances": {
                    "OpeningBalance": opening_balance,
                    "Milk": milk_balance,
                    "VeenaPusa": veena_balance
                },
                "CombinedBalance": combined_balance,
                "TransactionsCount": len(transactions),
                "Transactions": transactions
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# GET CUSTOMER CARD BALANCE
# ==================================================

@app.get("/customers/{customer_id}/card-balance")
def get_customer_card_balance(customer_id: int):

    try:
        with engine.connect() as connection:

            # VERIFY CUSTOMER
            customer = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        CustomerCode,
                        CustomerName,
                        ReferenceName,
                        MobileNumber,
                        IsActive,
                        MorningDelivery,
                        EveningDelivery
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # NEXT PART: CALCULATE ACCOUNT BALANCES
            # CALCULATE ACCOUNT BALANCES
            result = connection.execute(
                text("""
                    SELECT
                        AccountType,
                        ISNULL(SUM(DebitAmount), 0) AS TotalDebit,
                        ISNULL(SUM(CreditAmount), 0) AS TotalCredit
                    FROM CustomerLedger
                    WHERE CustomerID = :customer_id
                    GROUP BY AccountType
                """),
                {"customer_id": customer_id}
            ).fetchall()

            balances = {
                "OpeningBalance": Decimal("0"),
                "Milk": Decimal("0"),
                "VeenaPusa": Decimal("0")
            }

            for row in result:
                balances[row.AccountType] = (
                    Decimal(str(row.TotalDebit or 0)) -
                    Decimal(str(row.TotalCredit or 0))
                )

            opening_balance = balances["OpeningBalance"]
            milk_balance = balances["Milk"]
            veena_balance = balances["VeenaPusa"]

            # CALCULATE DUE AND ADVANCE SEPARATELY
            total_due = (
                max(opening_balance, Decimal("0")) +
                max(milk_balance, Decimal("0")) +
                max(veena_balance, Decimal("0"))
            )

            total_advance = (
                max(-opening_balance, Decimal("0")) +
                max(-milk_balance, Decimal("0")) +
                max(-veena_balance, Decimal("0"))
            )

            # PAYMENT STATUS
            if total_due > 0:
                payment_status = "DUE"
                status_amount = total_due

            elif total_advance > 0:
                payment_status = "ADVANCE"
                status_amount = total_advance

            else:
                payment_status = "NO DUE"
                status_amount = Decimal("0")

            # RETURN CUSTOMER CARD BALANCE
            return {
                "CustomerID": customer.CustomerID,
                "CustomerCode": customer.CustomerCode,
                "CustomerName": customer.CustomerName,
                "ReferenceName": customer.ReferenceName,
                "MobileNumber": customer.MobileNumber,
                "IsActive": customer.IsActive,
                "MorningDelivery": customer.MorningDelivery,
                "EveningDelivery": customer.EveningDelivery,
                "AccountBalances": {
                    "OpeningBalance": opening_balance,
                    "Milk": milk_balance,
                    "VeenaPusa": veena_balance
                },
                "TotalDue": total_due,
                "TotalAdvance": total_advance,
                "PaymentStatus": payment_status,
                "StatusAmount": status_amount
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# BILLING HELPER - CUSTOMER LEDGER BALANCES
# ==================================================

def get_customer_ledger_balances(connection, customer_id: int):

    result = connection.execute(
        text("""
            SELECT
                AccountType,
                SUM(DebitAmount) AS TotalDebit,
                SUM(CreditAmount) AS TotalCredit
            FROM CustomerLedger
            WHERE CustomerID = :customer_id
            GROUP BY AccountType
        """),
        {
            "customer_id": customer_id
        }
    ).fetchall()

    balances = {
        "OpeningBalance": Decimal("0"),
        "Milk": Decimal("0"),
        "VeenaPusa": Decimal("0")
    }

    for row in result:
        balances[row.AccountType] = (
            Decimal(str(row.TotalDebit or 0)) -
            Decimal(str(row.TotalCredit or 0))
        )

    return balances
# ==================================================
# PREVIEW MONTHLY BILL API
# ==================================================

@app.get("/billing/preview/{customer_id}/{year}/{month}")
def preview_monthly_bill(
    customer_id: int,
    year: int,
    month: int
):

    if year < 2000 or year > 2100:
        raise HTTPException(400, "Invalid year")

    if month < 1 or month > 12:
        raise HTTPException(400, "Invalid month")

    start_date = date(year, month, 1)

    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    try:
        with engine.connect() as connection:

            customer = connection.execute(
                text("""
                    SELECT CustomerID, CustomerName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(404, "Customer not found")

            # BILL CALCULATION WILL CONTINUE IN PART 3
                # ==========================================
                        # ==========================================
            # GET MONTHLY DELIVERY TOTALS
            # ==========================================

            delivery_totals = connection.execute(
                text("""
                    SELECT
                        COALESCE(SUM(dd.MilkQuantity), 0) AS MilkTotalQuantity,
                        COALESCE(SUM(dd.MilkAmount), 0) AS MilkTotal,
                        COALESCE(SUM(dd.VeenaPusaQuantity), 0) AS VeenaPusaTotalQuantity,
                        COALESCE(SUM(dd.VeenaPusaAmount), 0) AS VeenaPusaTotal
                    FROM DeliveryDetails dd
                    INNER JOIN DeliverySessions ds
                        ON dd.DeliverySessionID = ds.DeliverySessionID
                    WHERE dd.CustomerID = :customer_id
                      AND ds.DeliveryDate >= :start_date
                      AND ds.DeliveryDate < :end_date
                """),
                {
                    "customer_id": customer_id,
                    "start_date": start_date,
                    "end_date": end_date
                }
            ).fetchone()

            milk_quantity = Decimal(
                str(delivery_totals.MilkTotalQuantity)
            )
            milk_total = Decimal(
                str(delivery_totals.MilkTotal)
            )

            veena_pusa_quantity = Decimal(
                str(delivery_totals.VeenaPusaTotalQuantity)
            )
            veena_pusa_total = Decimal(
                str(delivery_totals.VeenaPusaTotal)
            )

            # ==========================================
            # GET PREVIOUS LEDGER BALANCES
            # ==========================================

            balances = get_customer_ledger_balances(
                connection,
                customer_id
            )

            previous_opening = balances["OpeningBalance"]
            previous_milk = balances["Milk"]
            previous_veena_pusa = balances["VeenaPusa"]

            # ==========================================
            # CALCULATE AMOUNTS DUE
            # ==========================================

            milk_amount_due = max(
                Decimal("0"),
                milk_total + previous_milk
            )

            veena_pusa_amount_due = max(
                Decimal("0"),
                veena_pusa_total + previous_veena_pusa
            )

            total_amount_due = (
                max(Decimal("0"), previous_opening)
                + milk_amount_due
                + veena_pusa_amount_due
            )

            return {
                "CustomerID": customer.CustomerID,
                "CustomerName": customer.CustomerName,
                "BillYear": year,
                "BillMonth": month,

                "MilkTotalQuantity": float(milk_quantity),
                "MilkTotal": float(milk_total),

                "VeenaPusaTotalQuantity": float(veena_pusa_quantity),
                "VeenaPusaTotal": float(veena_pusa_total),

                "PreviousOpeningBalance": float(previous_opening),
                "PreviousMilkBalance": float(previous_milk),
                "PreviousVeenaPusaBalance": float(previous_veena_pusa),

                "MilkAmountDue": float(milk_amount_due),
                "VeenaPusaAmountDue": float(veena_pusa_amount_due),
                "TotalAmountDue": float(total_amount_due)
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# GENERATE MONTHLY BILL API
# ==================================================

@app.post("/billing/generate/{customer_id}/{year}/{month}")
def generate_monthly_bill(
    customer_id: int,
    year: int,
    month: int
):

    if year < 2000 or year > 2100:
        raise HTTPException(400, "Invalid year")

    if month < 1 or month > 12:
        raise HTTPException(400, "Invalid month")

    try:
        with engine.begin() as connection:

            # CHECK CUSTOMER
            customer = connection.execute(
                text("""
                    SELECT CustomerID, CustomerName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    404,
                    "Customer not found"
                )

            # CHECK EXISTING BILL
            existing_bill = connection.execute(
                text("""
                    SELECT BillID, BillStatus
                    FROM MonthlyBills
                    WHERE CustomerID = :customer_id
                      AND BillYear = :year
                      AND BillMonth = :month
                """),
                {
                    "customer_id": customer_id,
                    "year": year,
                    "month": month
                }
            ).fetchone()

            if existing_bill:
                raise HTTPException(
                    400,
                    f"Bill already exists. BillID: {existing_bill.BillID}, Status: {existing_bill.BillStatus}"
                )

            # GET PREVIEW CALCULATION
            # BILL INSERT WILL CONTINUE IN PART 2
            # ==========================================
            # CALCULATE BILL TOTALS
            # ==========================================

            start_date = date(year, month, 1)

            if month == 12:
                end_date = date(year + 1, 1, 1)
            else:
                end_date = date(year, month + 1, 1)

            delivery_totals = connection.execute(
                text("""
                    SELECT
                        COALESCE(SUM(dd.MilkQuantity), 0) AS MilkTotalQuantity,
                        COALESCE(SUM(dd.MilkAmount), 0) AS MilkTotal,
                        COALESCE(SUM(dd.VeenaPusaQuantity), 0) AS VeenaPusaTotalQuantity,
                        COALESCE(SUM(dd.VeenaPusaAmount), 0) AS VeenaPusaTotal
                    FROM DeliveryDetails dd
                    INNER JOIN DeliverySessions ds
                        ON dd.DeliverySessionID = ds.DeliverySessionID
                    WHERE dd.CustomerID = :customer_id
                      AND ds.DeliveryDate >= :start_date
                      AND ds.DeliveryDate < :end_date
                """),
                {
                    "customer_id": customer_id,
                    "start_date": start_date,
                    "end_date": end_date
                }
            ).fetchone()

            milk_quantity = Decimal(str(delivery_totals.MilkTotalQuantity))
            milk_total = Decimal(str(delivery_totals.MilkTotal))

            veena_pusa_quantity = Decimal(
                str(delivery_totals.VeenaPusaTotalQuantity)
            )
            veena_pusa_total = Decimal(
                str(delivery_totals.VeenaPusaTotal)
            )

            # ==========================================
            # GET PREVIOUS BALANCES
            # ==========================================

            balances = get_customer_ledger_balances(
                connection,
                customer_id
            )

            previous_opening = balances["OpeningBalance"]
            previous_milk = balances["Milk"]
            previous_veena_pusa = balances["VeenaPusa"]

            milk_amount_due = max(
                Decimal("0"),
                milk_total + previous_milk
            )

            veena_pusa_amount_due = max(
                Decimal("0"),
                veena_pusa_total + previous_veena_pusa
            )

            total_amount_due = (
                max(Decimal("0"), previous_opening)
                + milk_amount_due
                + veena_pusa_amount_due
            )
            # ==========================================
            # INSERT MONTHLY BILL HEADER
            # ==========================================

            bill_id = connection.execute(
                text("""
                    INSERT INTO MonthlyBills
                    (
                        CustomerID,
                        BillYear,
                        BillMonth,
                        MilkTotal,
                        VeenaPusaTotal,
                        PreviousOpeningBalance,
                        PreviousMilkBalance,
                        PreviousVeenaPusaBalance,
                        MilkAmountDue,
                        VeenaPusaAmountDue,
                        TotalAmountDue,
                        BillStatus,
                        GeneratedAt
                    )
                    OUTPUT INSERTED.BillID
                    VALUES
                    (
                        :customer_id,
                        :year,
                        :month,
                        :milk_total,
                        :veena_pusa_total,
                        :previous_opening,
                        :previous_milk,
                        :previous_veena_pusa,
                        :milk_amount_due,
                        :veena_pusa_amount_due,
                        :total_amount_due,
                        'Generated',
                        SYSDATETIME()
                    )
                """),
                {
                    "customer_id": customer_id,
                    "year": year,
                    "month": month,
                    "milk_total": milk_total,
                    "veena_pusa_total": veena_pusa_total,
                    "previous_opening": previous_opening,
                    "previous_milk": previous_milk,
                    "previous_veena_pusa": previous_veena_pusa,
                    "milk_amount_due": milk_amount_due,
                    "veena_pusa_amount_due": veena_pusa_amount_due,
                    "total_amount_due": total_amount_due
                }
            ).scalar_one()
            # ==========================================
            # CALCULATE AVERAGE RATES
            # ==========================================

            milk_rate = (
                milk_total / milk_quantity
                if milk_quantity > 0
                else Decimal("0")
            )

            veena_pusa_rate = (
                veena_pusa_total / veena_pusa_quantity
                if veena_pusa_quantity > 0
                else Decimal("0")
            )

            # ==========================================
            # INSERT MILK BILL DETAIL
            # ==========================================

            connection.execute(
                text("""
                    INSERT INTO MonthlyBillDetails
                    (
                        BillID,
                        ItemType,
                        TotalQuantity,
                        Rate,
                        Amount
                    )
                    VALUES
                    (
                        :bill_id,
                        'Milk',
                        :quantity,
                        :rate,
                        :amount
                    )
                """),
                {
                    "bill_id": bill_id,
                    "quantity": milk_quantity,
                    "rate": milk_rate,
                    "amount": milk_total
                }
            )

            # ==========================================
            # INSERT VEENA PUSA BILL DETAIL
            # ==========================================

            connection.execute(
                text("""
                    INSERT INTO MonthlyBillDetails
                    (
                        BillID,
                        ItemType,
                        TotalQuantity,
                        Rate,
                        Amount
                    )
                    VALUES
                    (
                        :bill_id,
                        'VeenaPusa',
                        :quantity,
                        :rate,
                        :amount
                    )
                """),
                {
                    "bill_id": bill_id,
                    "quantity": veena_pusa_quantity,
                    "rate": veena_pusa_rate,
                    "amount": veena_pusa_total
                }
            )
            # ==========================================
            # GENERATE BILL SUCCESS RESPONSE
            # ==========================================

            return {
                "message": "Monthly bill generated successfully",
                "BillID": bill_id,
                "CustomerID": customer_id,
                "CustomerName": customer.CustomerName,
                "BillYear": year,
                "BillMonth": month,
                "BillStatus": "Generated",

                "MilkTotalQuantity": float(milk_quantity),
                "MilkTotal": float(milk_total),

                "VeenaPusaTotalQuantity": float(veena_pusa_quantity),
                "VeenaPusaTotal": float(veena_pusa_total),

                "PreviousOpeningBalance": float(previous_opening),
                "PreviousMilkBalance": float(previous_milk),
                "PreviousVeenaPusaBalance": float(previous_veena_pusa),

                "MilkAmountDue": float(milk_amount_due),
                "VeenaPusaAmountDue": float(veena_pusa_amount_due),
                "TotalAmountDue": float(total_amount_due)
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# ==================================================
# FINALIZE MONTHLY BILL API
# ==================================================

@app.put("/billing/finalize/{bill_id}")
def finalize_monthly_bill(bill_id: int):

    try:
        with engine.begin() as connection:

            # ==========================================
            # 1. CHECK BILL
            # ==========================================

            bill = connection.execute(
                text("""
                    SELECT
                        BillID,
                        CustomerID,
                        BillYear,
                        BillMonth,
                        BillStatus,
                        MilkTotal,
                        VeenaPusaTotal
                    FROM MonthlyBills
                    WHERE BillID = :bill_id
                """),
                {"bill_id": bill_id}
            ).fetchone()

            if not bill:
                raise HTTPException(
                    status_code=404,
                    detail="Monthly bill not found"
                )

            # ==========================================
            # 2. CHECK BILL STATUS
            # ==========================================

            if bill.BillStatus == "Finalized":
                raise HTTPException(
                    status_code=400,
                    detail="This bill is already finalized"
                )

            if bill.BillStatus != "Generated":
                raise HTTPException(
                    status_code=400,
                    detail="Only Generated bills can be finalized"
                )

            # ==========================================
            # 3. GET BILL MONTH DATE RANGE
            # ==========================================

            start_date = date(
                bill.BillYear,
                bill.BillMonth,
                1
            )

            if bill.BillMonth == 12:
                end_date = date(
                    bill.BillYear + 1,
                    1,
                    1
                )
            else:
                end_date = date(
                    bill.BillYear,
                    bill.BillMonth + 1,
                    1
                )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                # ==========================================
                        # ==========================================
            # 4. CHECK ALL SCHEDULED DELIVERY SESSIONS
            # ==========================================

            customer_schedule = connection.execute(
                text("""
                    SELECT
                        MorningDelivery,
                        EveningDelivery
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": bill.CustomerID}
            ).fetchone()

            if not customer_schedule:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            scheduled_sessions = []

            if customer_schedule.MorningDelivery:
                scheduled_sessions.append("Morning")

            if customer_schedule.EveningDelivery:
                scheduled_sessions.append("Evening")

            pending_sessions = []

            current_date = start_date

            while current_date < end_date:

                for session_name in scheduled_sessions:

                    session_record = connection.execute(
                        text("""
                            SELECT SessionStatus
                            FROM DeliverySessions
                            WHERE DeliveryDate = :delivery_date
                              AND Session = :session
                        """),
                        {
                            "delivery_date": current_date,
                            "session": session_name
                        }
                    ).fetchone()

                    if (
                        not session_record
                        or session_record.SessionStatus != "Completed"
                    ):
                        pending_sessions.append(
                            f"{current_date} - {session_name}"
                        )

                current_date += timedelta(days=1)

            if pending_sessions:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": (
                            "Cannot finalize bill. "
                            "Missing or incomplete delivery sessions exist."
                        ),
                        "PendingSessions": pending_sessions
                    }
                )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                # ==========================================
            # 5. INSERT MILK BILL DEBIT
            # ==========================================

            bill_date = end_date - timedelta(days=1)

            milk_total = Decimal(str(bill.MilkTotal or 0))
            veena_pusa_total = Decimal(
                str(bill.VeenaPusaTotal or 0)
            )

            if milk_total > 0:

                connection.execute(
                    text("""
                        INSERT INTO CustomerLedger
                        (
                            CustomerID,
                            TransactionDate,
                            TransactionType,
                            AccountType,
                            DebitAmount,
                            CreditAmount,
                            ReferenceID,
                            Description
                        )
                        VALUES
                        (
                            :customer_id,
                            :transaction_date,
                            'Bill',
                            'Milk',
                            :debit_amount,
                            0,
                            :reference_id,
                            :description
                        )
                    """),
                    {
                        "customer_id": bill.CustomerID,
                        "transaction_date": bill_date,
                        "debit_amount": milk_total,
                        "reference_id": bill.BillID,
                        "description": (
                            f"Milk bill for "
                            f"{bill.BillMonth}/{bill.BillYear}"
                        )
                    }
                )

            # ==========================================
            # 6. INSERT VEENA PUSA BILL DEBIT
            # ==========================================

            if veena_pusa_total > 0:

                connection.execute(
                    text("""
                        INSERT INTO CustomerLedger
                        (
                            CustomerID,
                            TransactionDate,
                            TransactionType,
                            AccountType,
                            DebitAmount,
                            CreditAmount,
                            ReferenceID,
                            Description
                        )
                        VALUES
                        (
                            :customer_id,
                            :transaction_date,
                            'Bill',
                            'VeenaPusa',
                            :debit_amount,
                            0,
                            :reference_id,
                            :description
                        )
                    """),
                    {
                        "customer_id": bill.CustomerID,
                        "transaction_date": bill_date,
                        "debit_amount": veena_pusa_total,
                        "reference_id": bill.BillID,
                        "description": (
                            f"Veena Pusa bill for "
                            f"{bill.BillMonth}/{bill.BillYear}"
                        )
                    }
                )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                # ==========================================
            # 7. UPDATE BILL STATUS
            # ==========================================

            connection.execute(
                text("""
                    UPDATE MonthlyBills
                    SET BillStatus = 'Finalized'
                    WHERE BillID = :bill_id
                      AND BillStatus = 'Generated'
                """),
                {"bill_id": bill.BillID}
            )

        # ==========================================
        # 8. SUCCESS RESPONSE
        # ==========================================

        return {
            "message": "Monthly bill finalized successfully",
            "BillID": bill.BillID,
            "CustomerID": bill.CustomerID,
            "BillYear": bill.BillYear,
            "BillMonth": bill.BillMonth,
            "BillStatus": "Finalized",
            "MilkTotal": float(milk_total),
            "VeenaPusaTotal": float(veena_pusa_total),
            "TotalBillAmount": float(
                milk_total + veena_pusa_total
            )
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )# ==================================================
# GET MONTHLY BILL DETAILS API
# ==================================================

@app.get("/billing/bill/{bill_id}")
def get_monthly_bill_details(bill_id: int):

    try:
        with engine.connect() as connection:

            # ==========================================
            # 1. GET BILL HEADER AND CUSTOMER DETAILS
            # ==========================================

            bill = connection.execute(
                text("""
                    SELECT
                        MB.BillID,
                        MB.CustomerID,
                        C.CustomerCode,
                        C.CustomerName,
                        C.ReferenceName,
                        C.MobileNumber,
                        MB.BillYear,
                        MB.BillMonth,
                        MB.MilkTotal,
                        MB.VeenaPusaTotal,
                        MB.PreviousOpeningBalance,
                        MB.PreviousMilkBalance,
                        MB.PreviousVeenaPusaBalance,
                        MB.MilkAmountDue,
                        MB.VeenaPusaAmountDue,
                        MB.TotalAmountDue,
                        MB.BillStatus,
                        MB.GeneratedAt
                    FROM MonthlyBills MB
                    INNER JOIN Customers C
                        ON C.CustomerID = MB.CustomerID
                    WHERE MB.BillID = :bill_id
                """),
                {"bill_id": bill_id}
            ).fetchone()

            if not bill:
                raise HTTPException(
                    status_code=404,
                    detail="Monthly bill not found"
                )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                        # ==========================================
            # 2. GET BILL ITEM DETAILS
            # ==========================================

            bill_details = connection.execute(
                text("""
                    SELECT
                        BillDetailID,
                        ItemType,
                        TotalQuantity,
                        Rate,
                        Amount
                    FROM MonthlyBillDetails
                    WHERE BillID = :bill_id
                    ORDER BY BillDetailID
                """),
                {"bill_id": bill_id}
            ).fetchall()

            items = []

            for row in bill_details:

                items.append({
                    "BillDetailID": row.BillDetailID,
                    "ItemType": row.ItemType,
                    "TotalQuantity": float(row.TotalQuantity),
                    "Rate": float(row.Rate),
                    "Amount": float(row.Amount)
                })

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                    # ==========================================
            # 3. RETURN COMPLETE BILL DETAILS
            # ==========================================

            return {
                "BillID": bill.BillID,
                "CustomerID": bill.CustomerID,
                "CustomerCode": bill.CustomerCode,
                "CustomerName": bill.CustomerName,
                "ReferenceName": bill.ReferenceName,
                "MobileNumber": bill.MobileNumber,

                "BillYear": bill.BillYear,
                "BillMonth": bill.BillMonth,

                "MilkTotal": float(bill.MilkTotal),
                "VeenaPusaTotal": float(bill.VeenaPusaTotal),

                "PreviousOpeningBalance": float(
                    bill.PreviousOpeningBalance
                ),
                "PreviousMilkBalance": float(
                    bill.PreviousMilkBalance
                ),
                "PreviousVeenaPusaBalance": float(
                    bill.PreviousVeenaPusaBalance
                ),

                "MilkAmountDue": float(bill.MilkAmountDue),
                "VeenaPusaAmountDue": float(
                    bill.VeenaPusaAmountDue
                ),
                "TotalAmountDue": float(bill.TotalAmountDue),

                "BillStatus": bill.BillStatus,
                "GeneratedAt": str(bill.GeneratedAt),

                "Items": items
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    # ==================================================
# CUSTOMER MONTHLY BILL HISTORY API
# ==================================================

@app.get("/customers/{customer_id}/bills")
def get_customer_bill_history(customer_id: int):

    try:
        with engine.connect() as connection:

            # ==========================================
            # 1. CHECK CUSTOMER
            # ==========================================

            customer = connection.execute(
                text("""
                    SELECT
                        CustomerID,
                        CustomerCode,
                        CustomerName,
                        ReferenceName
                    FROM Customers
                    WHERE CustomerID = :customer_id
                """),
                {"customer_id": customer_id}
            ).fetchone()

            if not customer:
                raise HTTPException(
                    status_code=404,
                    detail="Customer not found"
                )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                    # ==========================================
            # 2. GET CUSTOMER MONTHLY BILLS
            # ==========================================

            bills = connection.execute(
                text("""
                    SELECT
                        BillID,
                        BillYear,
                        BillMonth,
                        MilkTotal,
                        VeenaPusaTotal,
                        PreviousOpeningBalance,
                        PreviousMilkBalance,
                        PreviousVeenaPusaBalance,
                        MilkAmountDue,
                        VeenaPusaAmountDue,
                        TotalAmountDue,
                        BillStatus,
                        GeneratedAt
                    FROM MonthlyBills
                    WHERE CustomerID = :customer_id
                    ORDER BY
                        BillYear DESC,
                        BillMonth DESC
                """),
                {"customer_id": customer_id}
            ).fetchall()

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                    # ==========================================
            # 3. GET CUSTOMER LEDGER BALANCES
            # ==========================================

            balances = get_customer_ledger_balances(
                connection,
                customer_id
            )

            opening_balance = balances["OpeningBalance"]
            milk_balance = balances["Milk"]
            veena_balance = balances["VeenaPusa"]

            total_due = (
                max(opening_balance, Decimal("0")) +
                max(milk_balance, Decimal("0")) +
                max(veena_balance, Decimal("0"))
            )

            total_advance = (
                max(-opening_balance, Decimal("0")) +
                max(-milk_balance, Decimal("0")) +
                max(-veena_balance, Decimal("0"))
            )

            # ==========================================
            # NEXT PART CONTINUES HERE
            # ==========================================
                    # ==========================================
            # 4. RETURN BILL HISTORY RESPONSE
            # ==========================================

            return {
                "CustomerID": customer.CustomerID,
                "CustomerCode": customer.CustomerCode,
                "CustomerName": customer.CustomerName,
                "ReferenceName": customer.ReferenceName,

                "BillCount": len(bills),

                "CurrentBalances": {
                    "OpeningBalance": float(opening_balance),
                    "MilkBalance": float(milk_balance),
                    "VeenaPusaBalance": float(veena_balance),
                    "TotalDue": float(total_due),
                    "TotalAdvance": float(total_advance)
                },

                "Bills": [
                    {
                        "BillID": bill.BillID,
                        "BillYear": bill.BillYear,
                        "BillMonth": bill.BillMonth,
                        "MilkTotal": float(bill.MilkTotal or 0),
                        "VeenaPusaTotal": float(bill.VeenaPusaTotal or 0),
                        "PreviousOpeningBalance": float(
                            bill.PreviousOpeningBalance or 0
                        ),
                        "PreviousMilkBalance": float(
                            bill.PreviousMilkBalance or 0
                        ),
                        "PreviousVeenaPusaBalance": float(
                            bill.PreviousVeenaPusaBalance or 0
                        ),
                        "MilkAmountDue": float(bill.MilkAmountDue or 0),
                        "VeenaPusaAmountDue": float(
                            bill.VeenaPusaAmountDue or 0
                        ),
                        "TotalAmountDue": float(bill.TotalAmountDue or 0),
                        "BillStatus": bill.BillStatus,
                        "GeneratedAt": (
                            bill.GeneratedAt.isoformat()
                            if bill.GeneratedAt else None
                        )
                    }
                    for bill in bills
                ]
            }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

AUTO_QUEUE_RUNNING = {}

async def run_whatsapp_queue(session_type: str, customers: list):
    AUTO_QUEUE_RUNNING[session_type] = True
    shift_te = "ఉదయం" if session_type == "Morning" else "సాయంత్రం"
    for idx, c in enumerate(customers):
        if not AUTO_QUEUE_RUNNING.get(session_type):
            break
        raw = "".join(ch for ch in str(c.get("MobileNumber", "")) if ch.isdigit())
        if len(raw) < 10:
            continue
        phone = "91" + raw[-10:]
        name = c.get("CustomerName", "")
        text = f"నమస్తే {name} గారు, సుధీర్ మీ {shift_te} పాల డెలివరీ కోసం బయలుదేరారు. దయచేసి పాలు కలెక్ట్ చేసుకోండి. 🥛🚚"
        webbrowser.open(f"whatsapp://send?phone={phone}&text={urllib.parse.quote(text)}")
        await asyncio.sleep(5)
        pyautogui.press("enter")
        if idx < len(customers) - 1 and AUTO_QUEUE_RUNNING.get(session_type):
            await asyncio.sleep(120)
    AUTO_QUEUE_RUNNING[session_type] = False

@app.post("/routes/{session_type}/auto-alert")
async def start_auto_alert(session_type: str, payload: dict, background_tasks: BackgroundTasks):
    action = payload.get("action", "start")
    if action == "stop":
        AUTO_QUEUE_RUNNING[session_type] = False
        return {"status": "stopped"}
    if AUTO_QUEUE_RUNNING.get(session_type):
        return {"status": "already_running"}
    customers = payload.get("customers", [])
    background_tasks.add_task(run_whatsapp_queue, session_type, customers)
    return {"status": "started", "count": len(customers)}

async def run_undelivered_queue(session_type: str, delivery_date: str, items: list):
    shift_te = "ఉదయం" if session_type == "Morning" else "సాయంత్రం"
    undelivered = [x for x in items if x.get("DeliveryStatus") == "Undelivered"]
    for idx, item in enumerate(undelivered):
        raw = "".join(ch for ch in str(item.get("MobileNumber", "")) if ch.isdigit())
        if len(raw) < 10:
            continue
        phone = "91" + raw[-10:]
        name = item.get("CustomerName", "")
        text = (
            f"నమస్తే {name} గారు, ఈరోజు ({delivery_date}) {shift_te} పాల డెలివరీ జరగలేదు (Undelivered). "
            f"గమనించగలరు. 🥛❌"
        )

        webbrowser.open(f"whatsapp://send?phone={phone}&text={urllib.parse.quote(text)}")
        await asyncio.sleep(5)
        pyautogui.press("enter")
        if idx < len(undelivered) - 1:
            await asyncio.sleep(6)

@app.post("/delivery/session/notify-undelivered")
async def notify_undelivered_deliveries(payload: dict, background_tasks: BackgroundTasks):
    session_type = payload.get("SessionType", "Morning")
    delivery_date = payload.get("DeliveryDate", "")
    items = [x for x in payload.get("Deliveries", []) if x.get("DeliveryStatus") == "Undelivered"]
    background_tasks.add_task(run_undelivered_queue, session_type, delivery_date, items)
    return {"status": "queued", "undelivered_count": len(items)}

import base64
import os
import subprocess
import tempfile

MARKETING_QUEUE_RUNNING = False

def copy_image_to_windows_clipboard(data_url: str):
    if not data_url or "," not in data_url:
        return False
    try:
        b64_data = data_url.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_data)
        tmp_path = os.path.join(tempfile.gettempdir(), "milk_ad_poster.png")
        with open(tmp_path, "wb") as f:
            f.write(img_bytes)
        ps_cmd = (
            f"Add-Type -AssemblyName System.Windows.Forms; "
            f"Add-Type -AssemblyName System.Drawing; "
            f"$img = [System.Drawing.Image]::FromFile('{tmp_path}'); "
            f"[System.Windows.Forms.Clipboard]::SetImage($img); "
            f"$img.Dispose()"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
        return True
    except Exception:
        return False

async def run_marketing_queue(items: list, poster_data_url: str):
    global MARKETING_QUEUE_RUNNING
    MARKETING_QUEUE_RUNNING = True
    has_image = copy_image_to_windows_clipboard(poster_data_url) if poster_data_url else False

    for idx, item in enumerate(items):
        if not MARKETING_QUEUE_RUNNING:
            break
        raw = "".join(ch for ch in str(item.get("MobileNumber", "")) if ch.isdigit())
        if len(raw) < 10:
            continue
        phone = "91" + raw[-10:]
        text = item.get("MessageText", "")
        webbrowser.open(f"whatsapp://send?phone={phone}&text={urllib.parse.quote(text)}")
        await asyncio.sleep(5)
        if has_image:
            pyautogui.hotkey("ctrl", "v")
            await asyncio.sleep(2)
        pyautogui.press("enter")
        if idx < len(items) - 1 and MARKETING_QUEUE_RUNNING:
            await asyncio.sleep(10)

    MARKETING_QUEUE_RUNNING = False

@app.post("/marketing/auto-send")
async def start_marketing_auto_send(payload: dict, background_tasks: BackgroundTasks):
    global MARKETING_QUEUE_RUNNING
    action = payload.get("action", "start")
    if action == "stop":
        MARKETING_QUEUE_RUNNING = False
        return {"status": "stopped"}
    if MARKETING_QUEUE_RUNNING:
        return {"status": "already_running"}
    items = payload.get("items", [])
    poster = payload.get("posterImage", "")
    background_tasks.add_task(run_marketing_queue, items, poster)
    return {"status": "started", "count": len(items)}
