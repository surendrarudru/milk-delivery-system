from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
import asyncio
import base64
import calendar
import hashlib
import hmac
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

app = FastAPI(title="Milk Delivery Management System", version="3.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def validate_session(session: str):
    session = session.capitalize()
    if session not in ["Morning", "Evening"]:
        raise HTTPException(status_code=400, detail="Session must be Morning or Evening")
    return session


@app.get("/")
def home():
    return {"message": "Milk Delivery Management System API is running"}


@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers")
def get_customers():
    try:
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT customer_id AS "CustomerID", customer_code AS "CustomerCode",
                       customer_name AS "CustomerName", reference_name AS "ReferenceName",
                       mobile_number AS "MobileNumber", address AS "Address",
                       milk_rate AS "MilkRate", venna_pusa_rate AS "VennaPusaRate",
                       morning_delivery AS "MorningDelivery", evening_delivery AS "EveningDelivery",
                       whatsapp_available AS "WhatsAppAvailable",
                       default_milk_quantity AS "DefaultMilkQuantity", is_active AS "IsActive"
                FROM customers ORDER BY customer_id
            """))
            return [dict(r._mapping) for r in res.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers/{customer_id}")
def get_customer(customer_id: int):
    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT customer_id AS "CustomerID", customer_code AS "CustomerCode",
                       customer_name AS "CustomerName", reference_name AS "ReferenceName",
                       mobile_number AS "MobileNumber", address AS "Address",
                       milk_rate AS "MilkRate", venna_pusa_rate AS "VennaPusaRate",
                       morning_delivery AS "MorningDelivery", evening_delivery AS "EveningDelivery",
                       whatsapp_available AS "WhatsAppAvailable",
                       default_milk_quantity AS "DefaultMilkQuantity", is_active AS "IsActive"
                FROM customers WHERE customer_id = :cid
            """), {"cid": customer_id}).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Customer not found")
            return dict(row._mapping)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/customers")
def add_customer(customer: CustomerCreate):
    try:
        data = customer.model_dump()
        with engine.begin() as conn:
            cid = conn.execute(text("""
                INSERT INTO customers (
                    customer_code, customer_name, reference_name, mobile_number, address,
                    milk_rate, venna_pusa_rate, morning_delivery, evening_delivery,
                    whatsapp_available, default_milk_quantity, is_active
                ) VALUES (
                    :CustomerCode, :CustomerName, :ReferenceName, :MobileNumber, :Address,
                    :MilkRate, :VennaPusaRate, :MorningDelivery, :EveningDelivery,
                    :WhatsAppAvailable, :DefaultMilkQuantity, :IsActive
                ) RETURNING customer_id
            """), data).scalar_one()

            for sess, enabled in [("Morning", data["MorningDelivery"]), ("Evening", data["EveningDelivery"])]:
                if enabled and data["IsActive"]:
                    nxt_id = conn.execute(text("SELECT COALESCE(MAX(route_id), 0) + 1 FROM customer_routes")).scalar_one()
                    nxt_ord = conn.execute(text("SELECT COALESCE(MAX(route_order), 0) + 1 FROM customer_routes WHERE session_type = :s"), {"s": sess}).scalar_one()
                    conn.execute(text("INSERT INTO customer_routes (route_id, customer_id, session_type, route_order, is_active) VALUES (:rid, :cid, :s, :ro, TRUE)"), {"rid": nxt_id, "cid": cid, "s": sess, "ro": nxt_ord})
        return {"message": "Customer added successfully", "CustomerID": cid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/customers/{customer_id}")
def update_customer(customer_id: int, customer: CustomerUpdate):
    try:
        data = customer.model_dump(exclude_unset=True)
        if not data:
            raise HTTPException(status_code=400, detail="No fields provided for update")
        col_map = {
            "CustomerName": "customer_name", "ReferenceName": "reference_name",
            "MobileNumber": "mobile_number", "Address": "address",
            "MilkRate": "milk_rate", "VennaPusaRate": "venna_pusa_rate",
            "MorningDelivery": "morning_delivery", "EveningDelivery": "evening_delivery",
            "WhatsAppAvailable": "whatsapp_available", "DefaultMilkQuantity": "default_milk_quantity",
            "IsActive": "is_active"
        }
        with engine.begin() as conn:
            if not conn.execute(text("SELECT 1 FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone():
                raise HTTPException(status_code=404, detail="Customer not found")
            set_sql = ", ".join(f"{col_map[k]} = :{k}" for k in data if k in col_map)
            data["cid"] = customer_id
            conn.execute(text(f"UPDATE customers SET {set_sql} WHERE customer_id = :cid"), data)
            upd = conn.execute(text("SELECT morning_delivery, evening_delivery, is_active FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            for sess, enabled in [("Morning", upd.morning_delivery), ("Evening", upd.evening_delivery)]:
                route = conn.execute(text("SELECT route_id FROM customer_routes WHERE customer_id = :cid AND session_type = :s"), {"cid": customer_id, "s": sess}).fetchone()
                active_flag = bool(enabled) and bool(upd.is_active)
                if route:
                    conn.execute(text("UPDATE customer_routes SET is_active = :a WHERE customer_id = :cid AND session_type = :s"), {"a": active_flag, "cid": customer_id, "s": sess})
                elif active_flag:
                    nxt_id = conn.execute(text("SELECT COALESCE(MAX(route_id), 0) + 1 FROM customer_routes")).scalar_one()
                    nxt_ord = conn.execute(text("SELECT COALESCE(MAX(route_order), 0) + 1 FROM customer_routes WHERE session_type = :s"), {"s": sess}).scalar_one()
                    conn.execute(text("INSERT INTO customer_routes (route_id, customer_id, session_type, route_order, is_active) VALUES (:rid, :cid, :s, :ro, TRUE)"), {"rid": nxt_id, "cid": customer_id, "s": sess, "ro": nxt_ord})
        return {"message": "Customer updated successfully", "CustomerID": customer_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int):
    try:
        with engine.begin() as conn:
            cust = conn.execute(text("SELECT is_active FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            if cust.is_active:
                raise HTTPException(status_code=400, detail="Active customers cannot be deleted")
            for tbl in ["delivery_details", "monthly_bills", "customer_payments", "ledger_entries"]:
                if conn.execute(text(f"SELECT 1 FROM {tbl} WHERE customer_id = :cid LIMIT 1"), {"cid": customer_id}).fetchone():
                    raise HTTPException(status_code=400, detail=f"Customer has records in {tbl}. Cannot permanently delete.")
            conn.execute(text("DELETE FROM customer_routes WHERE customer_id = :cid"), {"cid": customer_id})
            conn.execute(text("DELETE FROM customers WHERE customer_id = :cid"), {"cid": customer_id})
        return {"message": "Customer permanently deleted", "CustomerID": customer_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/routes/{session}")
def get_routes(session: str):
    session = validate_session(session)
    try:
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT c.customer_id AS "CustomerID", c.customer_code AS "CustomerCode",
                       c.customer_name AS "CustomerName", c.reference_name AS "ReferenceName",
                       c.mobile_number AS "MobileNumber", c.default_milk_quantity AS "DefaultMilkQuantity",
                       c.milk_rate AS "MilkRate", c.venna_pusa_rate AS "VennaPusaRate",
                       cr.session_type AS "Session", cr.route_order AS "RouteOrder"
                FROM customer_routes cr
                INNER JOIN customers c ON cr.customer_id = c.customer_id
                WHERE cr.session_type = :s AND cr.is_active = TRUE AND c.is_active = TRUE
                ORDER BY cr.route_order ASC
            """), {"s": session})
            return [dict(r._mapping) for r in res.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/routes/{session}/reorder")
def reorder_route(session: str, request: RouteReorderRequest):
    session = validate_session(session)
    try:
        with engine.begin() as conn:
            for order, cid in enumerate(request.customer_ids, start=1):
                conn.execute(text("UPDATE customer_routes SET route_order = :o WHERE customer_id = :c AND session_type = :s"), {"o": order, "c": cid, "s": session})
        return {"message": f"{session} route updated successfully", "total_customers": len(request.customer_ids)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/delivery/boys")
def get_delivery_boys():
    try:
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT delivery_boy_id AS "DeliveryBoyID", delivery_boy_name AS "DeliveryBoyName",
                       mobile_number AS "MobileNumber"
                FROM delivery_boys WHERE is_active = TRUE ORDER BY delivery_boy_name
            """))
            return [dict(r._mapping) for r in res.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/delivery/customers/{session}")
def get_delivery_customers(session: str):
    return get_routes(session)


@app.get("/delivery/session/{delivery_date}/{session}")
def get_delivery_session(delivery_date: date, session: str):
    session = validate_session(session)
    try:
        with engine.connect() as conn:
            s_row = conn.execute(text("SELECT session_id, delivery_date, session_type, session_status FROM delivery_sessions WHERE delivery_date = :d AND session_type = :s"), {"d": delivery_date, "s": session}).fetchone()
            if not s_row:
                return {"DeliverySessionID": None, "DeliveryDate": str(delivery_date), "Session": session, "DeliveryBoyID": 1, "SessionStatus": "NotStarted", "Deliveries": []}
            res = conn.execute(text("""
                SELECT detail_id AS "DeliveryDetailID", customer_id AS "CustomerID", delivery_status AS "DeliveryStatus",
                       milk_quantity AS "MilkQuantity", milk_rate AS "MilkRate",
                       (milk_quantity * milk_rate) AS "MilkAmount",
                       (venna_pusa_quantity > 0) AS "VeenaPusaDelivered",
                       venna_pusa_quantity AS "VeenaPusaQuantity", venna_pusa_rate AS "VeenaPusaRate",
                       (venna_pusa_quantity * venna_pusa_rate) AS "VeenaPusaAmount",
                       ((milk_quantity * milk_rate) + (venna_pusa_quantity * venna_pusa_rate)) AS "TotalAmount",
                       remarks AS "Notes"
                FROM delivery_details WHERE session_id = :sid ORDER BY customer_id
            """), {"sid": s_row.session_id})
            return {"DeliverySessionID": s_row.session_id, "DeliveryDate": str(s_row.delivery_date), "Session": s_row.session_type, "DeliveryBoyID": 1, "SessionStatus": s_row.session_status, "Deliveries": [dict(r._mapping) for r in res.fetchall()]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/delivery/save")
def save_deliveries(request: DeliverySaveRequest):
    session = validate_session(request.Session)
    try:
        with engine.begin() as conn:
            custs = {r.customer_id: r for r in conn.execute(text("SELECT customer_id, milk_rate, venna_pusa_rate FROM customers")).fetchall()}
            ex = conn.execute(text("SELECT session_id, session_status FROM delivery_sessions WHERE delivery_date = :d AND session_type = :s"), {"d": request.DeliveryDate, "s": session}).fetchone()
            if ex:
                if ex.session_status == "Completed":
                    raise HTTPException(status_code=400, detail="This delivery session is already completed")
                sid = ex.session_id
            else:
                sid = conn.execute(text("INSERT INTO delivery_sessions (delivery_date, session_type, session_status) VALUES (:d, :s, 'Open') RETURNING session_id"), {"d": request.DeliveryDate, "s": session}).scalar_one()

            for item in request.Deliveries:
                c = custs.get(item.CustomerID)
                m_rate = Decimal(str(c.milk_rate if c else 0))
                v_rate = Decimal(str(c.venna_pusa_rate if c else 0))
                m_qty = Decimal("0") if item.DeliveryStatus == "Undelivered" else Decimal(str(item.MilkQuantity))
                v_qty = Decimal("0") if (item.DeliveryStatus == "Undelivered" or not item.VeenaPusaDelivered) else Decimal(str(item.VennaPusaQuantity))
                old = conn.execute(text("SELECT detail_id FROM delivery_details WHERE session_id = :sid AND customer_id = :cid"), {"sid": sid, "cid": item.CustomerID}).fetchone()
                if old:
                    conn.execute(text("UPDATE delivery_details SET delivery_status=:st, milk_quantity=:mq, venna_pusa_quantity=:vq, remarks=:rm WHERE detail_id=:did"), {"st": item.DeliveryStatus, "mq": m_qty, "vq": v_qty, "rm": item.Notes, "did": old.detail_id})
                else:
                    conn.execute(text("INSERT INTO delivery_details (session_id, customer_id, delivery_date, session_type, delivery_status, milk_quantity, milk_rate, venna_pusa_quantity, venna_pusa_rate, remarks) VALUES (:sid, :cid, :dd, :s, :st, :mq, :mr, :vq, :vr, :rm)"), {"sid": sid, "cid": item.CustomerID, "dd": request.DeliveryDate, "s": session, "st": item.DeliveryStatus, "mq": m_qty, "mr": m_rate, "vq": v_qty, "vr": v_rate, "rm": item.Notes})
        return {"message": "Delivery records saved successfully", "delivery_date": str(request.DeliveryDate), "session": session}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/delivery/session/{delivery_date}/{session}/complete")
def complete_delivery_session(delivery_date: date, session: str):
    session = validate_session(session)
    try:
        with engine.begin() as conn:
            res = conn.execute(text("SELECT session_id FROM delivery_sessions WHERE delivery_date = :d AND session_type = :s"), {"d": delivery_date, "s": session}).fetchone()
            if not res:
                raise HTTPException(status_code=404, detail="Delivery session not found")
            conn.execute(text("UPDATE delivery_sessions SET session_status = 'Completed' WHERE session_id = :sid"), {"sid": res.session_id})
        return {"message": "Delivery session completed successfully", "date": str(delivery_date), "session": session}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/billing/calendar/{year}/{month}")
def get_monthly_billing_calendar(year: int, month: int):
    _, total_days = calendar.monthrange(year, month)
    sd = date(year, month, 1)
    ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT ds.delivery_date, ds.session_type, ds.session_status, COUNT(dd.detail_id) AS cnt FROM delivery_sessions ds LEFT JOIN delivery_details dd ON dd.session_id = ds.session_id WHERE ds.delivery_date >= :sd AND ds.delivery_date < :ed GROUP BY ds.delivery_date, ds.session_type, ds.session_status"), {"sd": sd, "ed": ed}).fetchall()
        lookup = {(r.delivery_date, r.session_type): {"Status": "Complete" if r.session_status == "Completed" else "Pending", "SavedCount": r.cnt} for r in rows}
        days = [{"Date": date(year, month, d).isoformat(), "Morning": lookup.get((date(year, month, d), "Morning"), {"Status": "Missing", "SavedCount": 0}), "Evening": lookup.get((date(year, month, d), "Evening"), {"Status": "Missing", "SavedCount": 0})} for d in range(1, total_days + 1)]
        return {"Year": year, "Month": month, "TotalDays": total_days, "Days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers/{customer_id}/delivery-calendar/{year}/{month}")
def get_customer_delivery_calendar(customer_id: int, year: int, month: int):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, default_milk_quantity, morning_delivery, evening_delivery FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(404, "Customer not found")
            _, total_days = calendar.monthrange(year, month)
            sd = date(year, month, 1)
            ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
            rows = conn.execute(text("SELECT ds.delivery_date, ds.session_type, ds.session_status, dd.detail_id, dd.delivery_status, dd.milk_quantity, (dd.milk_quantity * dd.milk_rate) AS ma, (dd.venna_pusa_quantity > 0) AS vd, dd.venna_pusa_quantity, (dd.venna_pusa_quantity * dd.venna_pusa_rate) AS va FROM delivery_sessions ds LEFT JOIN delivery_details dd ON dd.session_id = ds.session_id AND dd.customer_id = :cid WHERE ds.delivery_date >= :sd AND ds.delivery_date < :ed"), {"cid": customer_id, "sd": sd, "ed": ed}).fetchall()
            records = {}
            for r in rows:
                records.setdefault(r.delivery_date.isoformat(), {})[r.session_type] = {"DeliveryDetailID": r.detail_id, "SessionStatus": r.session_status, "DeliveryStatus": r.delivery_status, "MilkQuantity": r.milk_quantity, "MilkAmount": r.ma, "VeenaPusaDelivered": r.vd, "VeenaPusaQuantity": r.venna_pusa_quantity, "VeenaPusaAmount": r.va, "TotalAmount": (r.ma or 0) + (r.va or 0)}
            sched = (["Morning"] if cust.morning_delivery else []) + (["Evening"] if cust.evening_delivery else [])
            def_qty = Decimal(str(cust.default_milk_quantity or 0))
            today = date.today()
            days = []
            for d in range(1, total_days + 1):
                cur = date(year, month, d)
                key = cur.isoformat()
                dr = records.get(key, {})
                if cur > today or not sched:
                    color = "Grey"
                else:
                    sr = [dr.get(s) for s in sched]
                    if any(x is None or x.get("DeliveryDetailID") is None or x.get("DeliveryStatus") == "Undelivered" for x in sr):
                        color = "Red"
                    elif any(Decimal(str(x.get("MilkQuantity") or 0)) != def_qty for x in sr):
                        color = "Yellow"
                    else:
                        color = "Green"
                days.append({"Date": key, "Color": color, "Morning": dr.get("Morning"), "Evening": dr.get("Evening")})
            return {"CustomerID": customer_id, "Year": year, "Month": month, "DefaultMilkQuantity": def_qty, "ScheduledSessions": sched, "TotalDays": total_days, "Days": days}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers/{customer_id}/delivery-history/{delivery_date}")
def get_customer_delivery_history(customer_id: int, delivery_date: date):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_name, default_milk_quantity FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(404, "Customer not found")
            rows = conn.execute(text("""
                SELECT ds.session_id AS "DeliverySessionID", ds.session_type AS "Session", ds.session_status AS "SessionStatus",
                       dd.detail_id AS "DeliveryDetailID", dd.delivery_status AS "DeliveryStatus",
                       dd.milk_quantity AS "MilkQuantity", dd.milk_rate AS "MilkRate",
                       (dd.milk_quantity * dd.milk_rate) AS "MilkAmount",
                       (dd.venna_pusa_quantity > 0) AS "VeenaPusaDelivered",
                       dd.venna_pusa_quantity AS "VeenaPusaQuantity", dd.venna_pusa_rate AS "VeenaPusaRate",
                       (dd.venna_pusa_quantity * dd.venna_pusa_rate) AS "VeenaPusaAmount",
                       ((dd.milk_quantity * dd.milk_rate) + (dd.venna_pusa_quantity * dd.venna_pusa_rate)) AS "TotalAmount",
                       dd.remarks AS "Notes"
                FROM delivery_sessions ds LEFT JOIN delivery_details dd ON dd.session_id = ds.session_id AND dd.customer_id = :cid
                WHERE ds.delivery_date = :dd ORDER BY CASE WHEN ds.session_type = 'Morning' THEN 1 ELSE 2 END
            """), {"cid": customer_id, "dd": delivery_date}).fetchall()
            return {"CustomerID": customer_id, "CustomerName": cust.customer_name, "DeliveryDate": delivery_date.isoformat(), "DefaultMilkQuantity": cust.default_milk_quantity, "Sessions": [dict(r._mapping) for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/delivery/correction/{detail_id}")
def correct_delivery_record(detail_id: int, request: DeliveryCorrectionRequest):
    try:
        with engine.begin() as conn:
            old = conn.execute(text("SELECT detail_id FROM delivery_details WHERE detail_id = :did"), {"did": detail_id}).fetchone()
            if not old:
                raise HTTPException(status_code=404, detail="Delivery record not found")
            m_qty = Decimal("0") if request.DeliveryStatus == "Undelivered" else Decimal(str(request.MilkQuantity))
            v_qty = Decimal("0") if (request.DeliveryStatus == "Undelivered" or not request.VeenaPusaDelivered) else Decimal(str(request.VeenaPusaQuantity))
            conn.execute(text("UPDATE delivery_details SET delivery_status=:st, milk_quantity=:mq, venna_pusa_quantity=:vq, remarks=:rm WHERE detail_id=:did"), {"st": request.DeliveryStatus, "mq": m_qty, "vq": v_qty, "rm": request.Notes, "did": detail_id})
            return {"message": "Delivery record corrected successfully", "DeliveryDetailID": detail_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/customers/{customer_id}/opening-balance")
def add_customer_opening_balance(customer_id: int, request: OpeningBalanceRequest):
    if request.Amount < 0:
        raise HTTPException(status_code=400, detail="Opening balance cannot be negative")
    try:
        with engine.begin() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_name FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            if conn.execute(text("SELECT ledger_id FROM ledger_entries WHERE customer_id = :cid AND category = 'OpeningBalance' AND entry_type = 'DEBIT'"), {"cid": customer_id}).fetchone():
                raise HTTPException(status_code=400, detail="Opening balance already exists for this customer")
            if request.Amount == 0:
                return {"message": "Zero opening balance recorded", "CustomerID": customer_id, "OpeningAmount": 0}
            lid = conn.execute(text("INSERT INTO ledger_entries (customer_id, entry_date, category, entry_type, amount, reference_id, description) VALUES (:cid, :od, 'OpeningBalance', 'DEBIT', :amt, NULL, :desc) RETURNING ledger_id"), {"cid": customer_id, "od": request.OpeningDate, "amt": request.Amount, "desc": request.Notes or "Opening Outstanding Balance"}).scalar_one()
        return {"message": "Opening balance saved successfully", "CustomerID": customer_id, "LedgerID": lid, "OpeningAmount": request.Amount}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/payments")
def add_payment(payment: PaymentCreate):
    tot = Decimal(str(payment.TotalAmount))
    m_amt = Decimal(str(payment.MilkAmount))
    v_amt = Decimal(str(payment.VeenaPusaAmount))
    o_amt = Decimal(str(payment.OpeningBalanceAmount))
    if tot <= 0 or min(m_amt, v_amt, o_amt) < 0 or (m_amt + v_amt + o_amt) != tot:
        raise HTTPException(status_code=400, detail="Invalid payment amounts or allocations")
    try:
        with engine.begin() as conn:
            if not conn.execute(text("SELECT 1 FROM customers WHERE customer_id = :cid"), {"cid": payment.CustomerID}).fetchone():
                raise HTTPException(status_code=404, detail="Customer not found")
            pid = conn.execute(text("INSERT INTO customer_payments (customer_id, payment_date, payment_mode, total_paid, notes) VALUES (:cid, :pd, :pm, :tot, :notes) RETURNING payment_id"), {"cid": payment.CustomerID, "pd": payment.PaymentDate, "pm": payment.PaymentMode, "tot": tot, "notes": payment.Notes}).scalar_one()
            for acc, amt in [("OpeningBalance", o_amt), ("Milk", m_amt), ("VeenaPusa", v_amt)]:
                if amt > 0:
                    conn.execute(text("INSERT INTO ledger_entries (customer_id, entry_date, category, entry_type, amount, reference_id, description) VALUES (:cid, :pd, :acc, 'CREDIT', :amt, :pid, :desc)"), {"cid": payment.CustomerID, "pd": payment.PaymentDate, "acc": acc, "amt": amt, "pid": pid, "desc": f"{acc} payment ({payment.PaymentMode})"})
        return {"message": "Payment saved successfully", "PaymentID": pid, "CustomerID": payment.CustomerID, "TotalAmount": tot}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers/{customer_id}/payments")
def get_customer_payments(customer_id: int):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_name FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            rows = conn.execute(text("SELECT payment_id AS \"PaymentID\", payment_date AS \"PaymentDate\", payment_mode AS \"PaymentMode\", total_paid AS \"TotalAmount\", notes AS \"Notes\" FROM customer_payments WHERE customer_id = :cid ORDER BY payment_date DESC, payment_id DESC"), {"cid": customer_id}).fetchall()
            plist = [{**dict(r._mapping), "Allocations": []} for r in rows]
            return {"CustomerID": cust.customer_id, "CustomerName": cust.customer_name, "TotalPayments": len(plist), "Payments": plist}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_customer_ledger_balances(conn, customer_id: int):
    rows = conn.execute(text("SELECT category, entry_type, COALESCE(SUM(amount), 0) AS tot FROM ledger_entries WHERE customer_id = :cid GROUP BY category, entry_type"), {"cid": customer_id}).fetchall()
    bals = {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")}
    for r in rows:
        val = Decimal(str(r.tot or 0))
        bals[r.category] = bals.get(r.category, Decimal("0")) + (val if r.entry_type == "DEBIT" else -val)
    return bals


@app.get("/customers/{customer_id}/ledger")
def get_customer_ledger(customer_id: int):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_name, customer_code FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            rows = conn.execute(text("SELECT ledger_id, entry_date, category, entry_type, amount, reference_id, description FROM ledger_entries WHERE customer_id = :cid ORDER BY entry_date ASC, ledger_id ASC"), {"cid": customer_id}).fetchall()
            bals = {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")}
            txs = []
            for r in rows:
                amt = Decimal(str(r.amount or 0))
                d = amt if r.entry_type == "DEBIT" else Decimal("0")
                c = amt if r.entry_type == "CREDIT" else Decimal("0")
                bals[r.category] = bals.get(r.category, Decimal("0")) + d - c
                txs.append({"LedgerID": r.ledger_id, "TransactionDate": r.entry_date, "TransactionType": "Bill" if r.entry_type == "DEBIT" else "Payment", "AccountType": r.category, "DebitAmount": d, "CreditAmount": c, "Balance": bals[r.category], "ReferenceID": r.reference_id, "Description": r.description})
            return {"CustomerID": cust.customer_id, "CustomerCode": cust.customer_code, "CustomerName": cust.customer_name, "AccountBalances": bals, "CombinedBalance": sum(bals.values()), "TransactionsCount": len(txs), "Transactions": txs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/customers/{customer_id}/card-balance")
def get_customer_card_balance(customer_id: int):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_code, customer_name FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            bals = get_customer_ledger_balances(conn, customer_id)
            due = sum(max(v, Decimal("0")) for v in bals.values())
            adv = sum(max(-v, Decimal("0")) for v in bals.values())
            st = "DUE" if due > 0 else ("ADVANCE" if adv > 0 else "NO DUE")
            return {"CustomerID": cust.customer_id, "CustomerCode": cust.customer_code, "CustomerName": cust.customer_name, "AccountBalances": bals, "TotalDue": due, "TotalAdvance": adv, "PaymentStatus": st, "StatusAmount": due if due > 0 else adv}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/billing/preview/{customer_id}/{year}/{month}")
def preview_monthly_bill(customer_id: int, year: int, month: int):
    sd = date(year, month, 1)
    ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_name FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(404, "Customer not found")
            dt = conn.execute(text("SELECT COALESCE(SUM(milk_quantity), 0) AS mq, COALESCE(SUM(milk_quantity * milk_rate), 0) AS ma, COALESCE(SUM(venna_pusa_quantity), 0) AS vq, COALESCE(SUM(venna_pusa_quantity * venna_pusa_rate), 0) AS va FROM delivery_details WHERE customer_id = :cid AND delivery_date >= :sd AND delivery_date < :ed"), {"cid": customer_id, "sd": sd, "ed": ed}).fetchone()
            bals = get_customer_ledger_balances(conn, customer_id)
            m_due = max(Decimal("0"), Decimal(str(dt.ma)) + bals["Milk"])
            v_due = max(Decimal("0"), Decimal(str(dt.va)) + bals["VeenaPusa"])
            tot_due = max(Decimal("0"), bals["OpeningBalance"]) + m_due + v_due
            return {"CustomerID": cust.customer_id, "CustomerName": cust.customer_name, "BillYear": year, "BillMonth": month, "MilkTotalQuantity": float(dt.mq), "MilkTotal": float(dt.ma), "VeenaPusaTotalQuantity": float(dt.vq), "VeenaPusaTotal": float(dt.va), "PreviousOpeningBalance": float(bals["OpeningBalance"]), "PreviousMilkBalance": float(bals["Milk"]), "PreviousVeenaPusaBalance": float(bals["VeenaPusa"]), "MilkAmountDue": float(m_due), "VeenaPusaAmountDue": float(v_due), "TotalAmountDue": float(tot_due)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _sync_bill_to_ledger(conn, bill_id: int, customer_id: int, year: int, month: int, milk_total: Decimal, vp_total: Decimal):
    ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    b_date = ed - timedelta(days=1)
    for cat, amt, label in [
        ("Milk", milk_total, f"Milk bill for {month}/{year}"),
        ("VeenaPusa", vp_total, f"Veena Pusa bill for {month}/{year}")
    ]:
        existing_led = conn.execute(text("""
            SELECT ledger_id FROM ledger_entries
            WHERE customer_id = :cid AND reference_id = :bid AND category = :cat AND entry_type = 'DEBIT'
        """), {"cid": customer_id, "bid": bill_id, "cat": cat}).fetchone()
        if amt > 0:
            if existing_led:
                conn.execute(text("UPDATE ledger_entries SET amount = :amt, entry_date = :bd WHERE ledger_id = :lid"),
                             {"amt": amt, "bd": b_date, "lid": existing_led.ledger_id})
            else:
                conn.execute(text("""
                    INSERT INTO ledger_entries (customer_id, entry_date, category, entry_type, amount, reference_id, description)
                    VALUES (:cid, :bd, :cat, 'DEBIT', :amt, :bid, :desc)
                """), {"cid": customer_id, "bd": b_date, "cat": cat, "amt": amt, "bid": bill_id, "desc": label})
        elif existing_led:
            conn.execute(text("DELETE FROM ledger_entries WHERE ledger_id = :lid"), {"lid": existing_led.ledger_id})

def _upsert_customer_bill(conn, customer_id: int, year: int, month: int):
    sd = date(year, month, 1)
    ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    dt = conn.execute(text("""
        SELECT COALESCE(SUM(milk_quantity * milk_rate), 0) AS ma,
               COALESCE(SUM(venna_pusa_quantity * venna_pusa_rate), 0) AS va
        FROM delivery_details
        WHERE customer_id = :cid AND delivery_date >= :sd AND delivery_date < :ed
    """), {"cid": customer_id, "sd": sd, "ed": ed}).fetchone()
    ma, va = Decimal(str(dt.ma)), Decimal(str(dt.va))

    ex = conn.execute(text("""
        SELECT bill_id, bill_status, previous_opening_balance, previous_milk_balance, previous_venna_pusa_balance
        FROM monthly_bills WHERE customer_id = :cid AND bill_year = :y AND bill_month = :m
    """), {"cid": customer_id, "y": year, "m": month}).fetchone()

    if ex:
        if ex.bill_status == "Finalized":
            _sync_bill_to_ledger(conn, ex.bill_id, customer_id, year, month, ma, va)
            po = Decimal(str(ex.previous_opening_balance or 0))
            pm = Decimal(str(ex.previous_milk_balance or 0))
            pv = Decimal(str(ex.previous_venna_pusa_balance or 0))
        else:
            bals = get_customer_ledger_balances(conn, customer_id)
            po, pm, pv = bals["OpeningBalance"], bals["Milk"], bals["VeenaPusa"]
        tot_due = max(Decimal("0"), po) + max(Decimal("0"), ma + pm) + max(Decimal("0"), va + pv)
        conn.execute(text("""
            UPDATE monthly_bills
            SET milk_total = :ma, venna_pusa_total = :va,
                previous_opening_balance = :po, previous_milk_balance = :pm, previous_venna_pusa_balance = :pv,
                total_amount_due = :td
            WHERE bill_id = :bid
        """), {"ma": ma, "va": va, "po": po, "pm": pm, "pv": pv, "td": tot_due, "bid": ex.bill_id})
        return ex.bill_id, float(tot_due), "updated"
    else:
        bals = get_customer_ledger_balances(conn, customer_id)
        tot_due = max(Decimal("0"), bals["OpeningBalance"]) + max(Decimal("0"), ma + bals["Milk"]) + max(Decimal("0"), va + bals["VeenaPusa"])
        bid = conn.execute(text("""
            INSERT INTO monthly_bills (
                customer_id, bill_year, bill_month, milk_total, venna_pusa_total,
                previous_opening_balance, previous_milk_balance, previous_venna_pusa_balance,
                total_amount_due, bill_status
            ) VALUES (:cid, :y, :m, :ma, :va, :po, :pm, :pv, :td, 'Generated') RETURNING bill_id
        """), {"cid": customer_id, "y": year, "m": month, "ma": ma, "va": va, "po": bals["OpeningBalance"], "pm": bals["Milk"], "pv": bals["VeenaPusa"], "td": tot_due}).scalar_one()
        return bid, float(tot_due), "created"

@app.post("/billing/generate/{customer_id}/{year}/{month}")
def generate_monthly_bill(customer_id: int, year: int, month: int):
    try:
        with engine.begin() as conn:
            if not conn.execute(text("SELECT 1 FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone():
                raise HTTPException(404, "Customer not found")
            bid, tot_due, mode = _upsert_customer_bill(conn, customer_id, year, month)
            return {"message": f"Monthly bill {mode} up-to-date!", "BillID": bid, "TotalAmountDue": tot_due}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/billing/unfinalize/{bill_id}")
def unfinalize_monthly_bill(bill_id: int):
    try:
        with engine.begin() as conn:
            bill = conn.execute(text("SELECT bill_id, customer_id, bill_status FROM monthly_bills WHERE bill_id = :bid"), {"bid": bill_id}).fetchone()
            if not bill:
                raise HTTPException(404, "Bill not found")
            conn.execute(text("""
                DELETE FROM ledger_entries
                WHERE customer_id = :cid AND reference_id = :bid AND entry_type = 'DEBIT' AND category IN ('Milk', 'VeenaPusa')
            """), {"cid": bill.customer_id, "bid": bill.bill_id})
            conn.execute(text("UPDATE monthly_bills SET bill_status = 'Generated' WHERE bill_id = :bid"), {"bid": bill.bill_id})
        return {"message": "Bill unfinalized and removed from ledger!", "BillID": bill.bill_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/billing/unfinalize/{bill_id}")
def unfinalize_monthly_bill(bill_id: int):
    try:
        with engine.begin() as conn:
            bill = conn.execute(text("SELECT bill_id, customer_id FROM monthly_bills WHERE bill_id = :bid"), {"bid": bill_id}).fetchone()
            if not bill:
                raise HTTPException(404, "Bill not found")
            conn.execute(text("DELETE FROM ledger_entries WHERE customer_id = :cid AND reference_id = :bid AND entry_type = 'DEBIT' AND category IN ('Milk', 'VeenaPusa')"), {"cid": bill.customer_id, "bid": bill.bill_id})
            conn.execute(text("UPDATE monthly_bills SET bill_status = 'Generated' WHERE bill_id = :bid"), {"bid": bill.bill_id})
        return {"message": "Bill unfinalized!", "BillID": bill.bill_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/billing/reset-all/{year}/{month}")
def reset_all_monthly_bills(year: int, month: int):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                DELETE FROM ledger_entries
                WHERE entry_type = 'DEBIT' AND category IN ('Milk', 'VeenaPusa')
                  AND reference_id IN (SELECT bill_id FROM monthly_bills WHERE bill_year = :y AND bill_month = :m)
            """), {"y": year, "m": month})
            res = conn.execute(text("DELETE FROM monthly_bills WHERE bill_year = :y AND bill_month = :m"), {"y": year, "m": month})
        return {"message": f"Cleared {res.rowcount} bills!", "deleted": res.rowcount}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/billing/finalize/{bill_id}")
def finalize_monthly_bill(bill_id: int):
    try:
        with engine.begin() as conn:
            bill = conn.execute(text("SELECT bill_id, customer_id, bill_year, bill_month, bill_status, milk_total, venna_pusa_total FROM monthly_bills WHERE bill_id = :bid"), {"bid": bill_id}).fetchone()
            if not bill:
                raise HTTPException(404, "Bill not found")
            _sync_bill_to_ledger(conn, bill.bill_id, bill.customer_id, bill.bill_year, bill.bill_month, Decimal(str(bill.milk_total or 0)), Decimal(str(bill.venna_pusa_total or 0)))
            conn.execute(text("UPDATE monthly_bills SET bill_status = 'Finalized' WHERE bill_id = :bid"), {"bid": bill.bill_id})
        return {"message": "Monthly bill finalized & synced to Payments!", "BillID": bill.bill_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/customers/{customer_id}/bills")
def get_customer_bill_history(customer_id: int):
    try:
        with engine.connect() as conn:
            cust = conn.execute(text("SELECT customer_id, customer_code, customer_name FROM customers WHERE customer_id = :cid"), {"cid": customer_id}).fetchone()
            if not cust:
                raise HTTPException(404, "Customer not found")
            rows = conn.execute(text("""
                SELECT bill_id AS "BillID", customer_id AS "CustomerID", bill_year AS "BillYear", bill_month AS "BillMonth",
                       milk_total AS "MilkTotal", venna_pusa_total AS "VeenaPusaTotal",
                       previous_opening_balance AS "PreviousOpeningBalance", previous_milk_balance AS "PreviousMilkBalance",
                       previous_venna_pusa_balance AS "PreviousVeenaPusaBalance",
                       (milk_total + GREATEST(previous_milk_balance, 0)) AS "MilkAmountDue",
                       (venna_pusa_total + GREATEST(previous_venna_pusa_balance, 0)) AS "VeenaPusaAmountDue",
                       total_amount_due AS "TotalAmountDue", bill_status AS "BillStatus"
                FROM monthly_bills WHERE customer_id = :cid ORDER BY bill_year DESC, bill_month DESC
            """), {"cid": customer_id}).fetchall()
            bals = get_customer_ledger_balances(conn, customer_id)
            return {"CustomerID": cust.customer_id, "CustomerCode": cust.customer_code, "CustomerName": cust.customer_name, "BillCount": len(rows), "CurrentBalances": {k: float(v) for k, v in bals.items()}, "Bills": [dict(r._mapping) for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/routes/{session_type}/auto-alert")
async def start_auto_alert(session_type: str, payload: dict):
    return {"status": "desktop_only"}


@app.post("/delivery/session/notify-undelivered")
async def notify_undelivered_deliveries(payload: dict):
    return {"status": "desktop_only"}


@app.get("/customers-summary")
def get_customers_summary():
    try:
        with engine.connect() as conn:
            custs = conn.execute(text("""
                SELECT customer_id AS "CustomerID", customer_code AS "CustomerCode",
                       customer_name AS "CustomerName", reference_name AS "ReferenceName",
                       mobile_number AS "MobileNumber", address AS "Address",
                       milk_rate AS "MilkRate", venna_pusa_rate AS "VennaPusaRate",
                       morning_delivery AS "MorningDelivery", evening_delivery AS "EveningDelivery",
                       whatsapp_available AS "WhatsAppAvailable",
                       default_milk_quantity AS "DefaultMilkQuantity", is_active AS "IsActive"
                FROM customers ORDER BY customer_id
            """)).fetchall()

            led = conn.execute(text("""
                SELECT customer_id, category, entry_type, COALESCE(SUM(amount), 0) AS tot
                FROM ledger_entries GROUP BY customer_id, category, entry_type
            """)).fetchall()

        bal_map = {}
        for r in led:
            b = bal_map.setdefault(r.customer_id, {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")})
            val = Decimal(str(r.tot or 0))
            b[r.category] = b.get(r.category, Decimal("0")) + (val if r.entry_type == "DEBIT" else -val)

        out = []
        for c in custs:
            d = dict(c._mapping)
            bals = bal_map.get(c.CustomerID, {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")})
            due = sum(max(v, Decimal("0")) for v in bals.values())
            adv = sum(max(-v, Decimal("0")) for v in bals.values())
            d["AccountBalances"] = {k: float(v) for k, v in bals.items()}
            d["TotalDue"] = float(due)
            d["TotalAdvance"] = float(adv)
            d["PaymentStatus"] = "DUE" if due > 0 else ("ADVANCE" if adv > 0 else "NO DUE")
            d["StatusAmount"] = float(due if due > 0 else adv)
            out.append(d)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/billing/monthly-summary/{year}/{month}")
def get_monthly_billing_summary(year: int, month: int):
    try:
        with engine.connect() as conn:
            custs = conn.execute(text("""
                SELECT customer_id AS "CustomerID", customer_code AS "CustomerCode",
                       customer_name AS "CustomerName", mobile_number AS "MobileNumber",
                       milk_rate AS "MilkRate", venna_pusa_rate AS "VennaPusaRate"
                FROM customers WHERE is_active = TRUE ORDER BY customer_id
            """)).fetchall()

            bills = conn.execute(text("""
                SELECT bill_id AS "BillID", customer_id AS "CustomerID",
                       bill_year AS "BillYear", bill_month AS "BillMonth",
                       milk_total AS "MilkTotal", venna_pusa_total AS "VeenaPusaTotal",
                       previous_opening_balance AS "PreviousOpeningBalance",
                       previous_milk_balance AS "PreviousMilkBalance",
                       previous_venna_pusa_balance AS "PreviousVeenaPusaBalance",
                       total_amount_due AS "TotalAmountDue", bill_status AS "BillStatus"
                FROM monthly_bills WHERE bill_year = :y AND bill_month = :m
            """), {"y": year, "m": month}).fetchall()

        bill_map = {b.CustomerID: dict(b._mapping) for b in bills}
        _, last_day = calendar.monthrange(year, month)
        return {
            "Year": year,
            "Month": month,
            "MonthEnd": date(year, month, last_day).strftime("%d-%m-%Y"),
            "Rows": [{**dict(c._mapping), "Bill": bill_map.get(c.CustomerID)} for c in custs]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/billing/generate-all/{year}/{month}")
def generate_all_monthly_bills(year: int, month: int):
    try:
        with engine.begin() as conn:
            active_ids = [r.customer_id for r in conn.execute(text("SELECT customer_id FROM customers WHERE is_active = TRUE")).fetchall()]
            created, updated = 0, 0
            for cid in active_ids:
                _, _, mode = _upsert_customer_bill(conn, cid, year, month)
                if mode == "created":
                    created += 1
                else:
                    updated += 1
        return {"message": f"Up-to-date: {created} new, {updated} refreshed!", "created": created, "updated": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/billing/finalize-all/{year}/{month}")
def finalize_all_monthly_bills(year: int, month: int):
    try:
        with engine.begin() as conn:
            bills = conn.execute(text("""
                SELECT bill_id, customer_id, milk_total, venna_pusa_total
                FROM monthly_bills WHERE bill_year = :y AND bill_month = :m
            """), {"y": year, "m": month}).fetchall()
            for b in bills:
                _sync_bill_to_ledger(conn, b.bill_id, b.customer_id, year, month, Decimal(str(b.milk_total or 0)), Decimal(str(b.venna_pusa_total or 0)))
                conn.execute(text("UPDATE monthly_bills SET bill_status = 'Finalized' WHERE bill_id = :bid"), {"bid": b.bill_id})
        return {"message": f"Finalized & synced {len(bills)} bills to Payments!", "finalized": len(bills)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/reports/monthly-overview/{year}/{month}")
def get_reports_monthly_overview(year: int, month: int):
    sd = date(year, month, 1)
    ed = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    try:
        with engine.connect() as conn:
            custs = conn.execute(text("""
                SELECT customer_id, customer_code, customer_name, reference_name, is_active
                FROM customers ORDER BY customer_id
            """)).fetchall()

            rows = conn.execute(text("""
                SELECT customer_id,
                       COALESCE(SUM(milk_quantity), 0) AS mq,
                       COALESCE(SUM(milk_quantity * milk_rate), 0) AS ma,
                       COALESCE(SUM(venna_pusa_quantity), 0) AS vq,
                       COALESCE(SUM(venna_pusa_quantity * venna_pusa_rate), 0) AS va
                FROM delivery_details
                WHERE delivery_date >= :sd AND delivery_date < :ed
                GROUP BY customer_id
            """), {"sd": sd, "ed": ed}).fetchall()

        d_map = {r.customer_id: r for r in rows}
        out = []
        for c in custs:
            d = d_map.get(c.customer_id)
            mq = float(d.mq) if d else 0.0
            ma = float(d.ma) if d else 0.0
            vq = float(d.vq) if d else 0.0
            va = float(d.va) if d else 0.0
            out.append({
                "CustomerID": c.customer_id,
                "CustomerCode": c.customer_code,
                "CustomerName": c.customer_name,
                "ReferenceName": c.reference_name,
                "IsActive": c.is_active,
                "MilkTotalQuantity": mq,
                "MilkTotal": ma,
                "VeenaPusaTotalQuantity": vq,
                "VeenaPusaTotal": va,
                "MonthTotal": ma + va,
            })
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ==========================================
# REDESIGNED 3-ROLE SECURITY & AUDIT ENGINE
# ==========================================
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "MilkManager_Secure_2026_Key")
IST = timezone(timedelta(hours=5, minutes=30))


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(f"{ADMIN_SECRET}:{pin.strip()}".encode()).hexdigest()


def make_admin_token(user_id: int, username: str, full_name: str, role: str) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"id": user_id, "u": username, "n": full_name, "r": role}).encode()
    ).decode()
    sig = hmac.new(ADMIN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{payload}.{sig}"


def verify_admin_token(token: str):
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    expected = hmac.new(ADMIN_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
    except Exception:
        return None


def init_security_tables():
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS admin_users (
                    user_id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    full_name VARCHAR(100) NOT NULL,
                    role VARCHAR(30) NOT NULL DEFAULT 'User',
                    pin_hash VARCHAR(128) NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    log_id SERIAL PRIMARY KEY,
                    actor_name VARCHAR(100) NOT NULL,
                    actor_role VARCHAR(30) NOT NULL,
                    action_type VARCHAR(30) NOT NULL,
                    module_name VARCHAR(60) NOT NULL,
                    summary TEXT NOT NULL,
                    details TEXT,
                    created_at VARCHAR(40) NOT NULL
                )
            """))
            conn.execute(text("UPDATE admin_users SET full_name = 'Admin', role = 'Admin' WHERE username = 'admin'"))
            conn.execute(text("UPDATE admin_users SET full_name = 'User', role = 'User' WHERE username IN ('staff', 'user')"))
            conn.execute(text("""
                INSERT INTO admin_users (username, full_name, role, pin_hash, is_active)
                VALUES
                  ('admin', 'Admin', 'Admin', :p1, TRUE),
                  ('staff', 'User', 'User', :p2, TRUE)
                ON CONFLICT (username) DO NOTHING
            """), {"p1": _hash_pin("1234"), "p2": _hash_pin("1111")})
    except Exception as e:
        print("Security init warning:", e)


init_security_tables()


def describe_audit_action(method: str, path: str, body: dict):
    if path.startswith("/customers") and method == "POST":
        return "Customer Master", f"Added customer {body.get('CustomerName', '')} ({body.get('CustomerCode', '')})"
    if path.startswith("/customers/") and method == "PUT":
        return "Customer Master", f"Updated customer ID #{path.split('/')[-1]} ({body.get('CustomerName', 'Details')})"
    if path.startswith("/customers/") and method == "DELETE":
        return "Customer Master", f"Deleted customer ID #{path.split('/')[-1]}"
    if path == "/delivery/save":
        return "Daily Delivery", f"Saved {body.get('Session')} deliveries for {body.get('DeliveryDate')} ({len(body.get('Deliveries', []))} entries)"
    if "/complete" in path:
        parts = path.split("/")
        return "Daily Delivery", f"Completed & locked {parts[-2]} session for {parts[-3]}"
    if path.startswith("/delivery/correction/"):
        return "Delivery Correction", f"Corrected delivery record #{path.split('/')[-1]} -> {body.get('DeliveryStatus')} ({body.get('MilkQuantity', 0)}L)"
    if path == "/payments":
        return "Payments", f"Recorded ₹{body.get('TotalAmount', 0)} ({body.get('PaymentMode', 'Cash')}) for Customer ID #{body.get('CustomerID')}"
    if path.startswith("/billing/generate-all/"):
        parts = path.split("/")
        return "Monthly Bills", f"Generated all bills for {parts[-1]}/{parts[-2]}"
    if path.startswith("/billing/generate/"):
        parts = path.split("/")
        return "Monthly Bills", f"Generated bill for Customer ID #{parts[-3]} ({parts[-1]}/{parts[-2]})"
    if path.startswith("/billing/finalize-all/"):
        parts = path.split("/")
        return "Monthly Bills", f"Finalized all bills for {parts[-1]}/{parts[-2]}"
    if path.startswith("/billing/finalize/"):
        return "Monthly Bills", f"Finalized Bill ID #{path.split('/')[-1]}"
    if path.startswith("/routes/") and path.endswith("/reorder"):
        return "Route Order", f"Reordered {path.split('/')[-2]} delivery route"
    if path.startswith("/admin/users"):
        return "Admin Security", f"Updated access PIN for {body.get('username', '')}"
    return "System Update", f"{method} {path}"


@app.middleware("http")
async def admin_security_and_audit_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()

    if method == "OPTIONS" or path in ["/", "/health", "/auth/admin-login", "/partner/dashboard", "/docs", "/openapi.json"]:
        return await call_next(request)

    token = request.headers.get("X-Admin-Token", "")
    user = verify_admin_token(token)

    if method in ["POST", "PUT", "DELETE"] or path.startswith("/admin/"):
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Admin or User PIN login required to modify records."})

    if method in ["POST", "PUT", "DELETE"] and user and user.get("r") == "User":
        allowed_user_writes = (
            path == "/delivery/save"
            or path.endswith("/complete")
            or path == "/payments"
            or path == "/customers"
        )
        if not allowed_user_writes:
            return JSONResponse(status_code=403, content={"detail": "Restricted: Only Admin can edit rates, bills, or settings."})

    raw_body = b""
    body_dict = {}
    if method in ["POST", "PUT", "DELETE"]:
        raw_body = await request.body()
        if raw_body:
            try:
                body_dict = json.loads(raw_body.decode("utf-8"))
            except Exception:
                body_dict = {}

        async def receive():
            return {"type": "http.request", "body": raw_body, "more_body": False}
        request._receive = receive

    response = await call_next(request)

    if method in ["POST", "PUT", "DELETE"] and 200 <= response.status_code < 300 and user:
        try:
            module_name, summary = describe_audit_action(method, path, body_dict if isinstance(body_dict, dict) else {})
            safe_details = json.dumps(body_dict, ensure_ascii=False)[:900] if body_dict else ""
            ist_now = datetime.now(IST).strftime("%d-%m-%Y %I:%M:%S %p IST")
            with engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO audit_logs (actor_name, actor_role, action_type, module_name, summary, details, created_at)
                    VALUES (:an, :ar, :at, :mn, :sm, :dt, :ca)
                """), {
                    "an": user.get("n", "Admin"),
                    "ar": user.get("r", "Admin"),
                    "at": method,
                    "mn": module_name,
                    "sm": summary,
                    "dt": safe_details,
                    "ca": ist_now
                })
        except Exception as e:
            print("Audit log write warning:", e)

    return response
class AdminLoginRequest(BaseModel):
    username: str
    pin: str


class AdminUserCreate(BaseModel):
    username: str
    full_name: str
    role: str = "User"
    pin: str


@app.post("/auth/admin-login")
def admin_login(req: AdminLoginRequest):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT user_id, username, full_name, role, pin_hash, is_active
            FROM admin_users WHERE LOWER(username) = LOWER(:u)
        """), {"u": req.username.strip()}).fetchone()
    if not row or not row.is_active or row.pin_hash != _hash_pin(req.pin):
        raise HTTPException(status_code=401, detail="Invalid Username or PIN")
    token = make_admin_token(row.user_id, row.username, row.full_name, row.role)
    return {"token": token, "username": row.username, "full_name": row.full_name, "role": row.role}


@app.get("/admin/audit-logs")
def get_audit_logs(limit: int = 200):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT log_id AS "LogID", actor_name AS "ActorName", actor_role AS "ActorRole",
                   action_type AS "ActionType", module_name AS "ModuleName",
                   summary AS "Summary", details AS "Details", created_at AS "CreatedAt"
            FROM audit_logs ORDER BY log_id DESC LIMIT :lim
        """), {"lim": limit}).fetchall()
    return [dict(r._mapping) for r in rows]


@app.get("/admin/users")
def list_admin_users():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT user_id AS "UserID", username AS "Username", full_name AS "FullName",
                   role AS "Role", is_active AS "IsActive"
            FROM admin_users ORDER BY user_id
        """)).fetchall()
    return [dict(r._mapping) for r in rows]


@app.post("/admin/users")
def create_or_update_admin_user(req: AdminUserCreate):
    if len(req.pin.strip()) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO admin_users (username, full_name, role, pin_hash, is_active)
            VALUES (:u, :fn, :r, :ph, TRUE)
            ON CONFLICT (username) DO UPDATE
            SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, pin_hash = EXCLUDED.pin_hash, is_active = TRUE
        """), {"u": req.username.strip().lower(), "fn": req.full_name.strip(), "r": req.role, "ph": _hash_pin(req.pin)})
    return {"message": f"Access PIN saved for {req.full_name}"}

@app.get("/partner/dashboard")
def get_partner_dashboard(today_str: Optional[str] = None):
    target_date = datetime.now(IST).date()
    date_prefix = target_date.strftime("%d-%m-%Y")
    try:
        with engine.connect() as conn:
            custs = conn.execute(text("SELECT customer_id, customer_code, customer_name, reference_name FROM customers ORDER BY customer_id")).fetchall()
            best_name = lambda cn, rn: (rn or "").strip() or (cn or "")

            deliv_rows = conn.execute(text("""
                SELECT COALESCE(ds.session_type, dd.session_type) AS st,
                       COALESCE(SUM(CASE WHEN LOWER(dd.delivery_status) = 'delivered' THEN dd.milk_quantity ELSE 0 END), 0) AS litres,
                       COUNT(*) FILTER (WHERE LOWER(dd.delivery_status) = 'delivered') AS cnt
                FROM delivery_details dd
                LEFT JOIN delivery_sessions ds ON dd.session_id = ds.session_id
                WHERE COALESCE(ds.delivery_date, dd.delivery_date) = :td
                GROUP BY COALESCE(ds.session_type, dd.session_type)
            """), {"td": target_date}).fetchall()

            m_litres = sum(float(r.litres or 0) for r in deliv_rows if str(r.st).lower() == "morning")
            e_litres = sum(float(r.litres or 0) for r in deliv_rows if str(r.st).lower() == "evening")
            m_cnt = sum(int(r.cnt or 0) for r in deliv_rows if str(r.st).lower() == "morning")
            e_cnt = sum(int(r.cnt or 0) for r in deliv_rows if str(r.st).lower() == "evening")

            led = conn.execute(text("SELECT customer_id, category, entry_type, COALESCE(SUM(amount), 0) AS tot FROM ledger_entries GROUP BY customer_id, category, entry_type")).fetchall()
            bal_map = {}
            for r in led:
                b = bal_map.setdefault(r.customer_id, {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")})
                val = Decimal(str(r.tot or 0))
                b[r.category] = b.get(r.category, Decimal("0")) + (val if r.entry_type == "DEBIT" else -val)

            due_customers, total_due = [], Decimal("0")
            for c in custs:
                bals = bal_map.get(c.customer_id, {"OpeningBalance": Decimal("0"), "Milk": Decimal("0"), "VeenaPusa": Decimal("0")})
                due = sum(max(v, Decimal("0")) for v in bals.values())
                if due > 0:
                    total_due += due
                    due_customers.append({
                        "CustomerID": c.customer_id, "CustomerCode": c.customer_code,
                        "CustomerName": c.customer_name, "ReferenceName": c.reference_name or "",
                        "DisplayName": best_name(c.customer_name, c.reference_name),
                        "OpeningDue": float(max(bals["OpeningBalance"], Decimal("0"))),
                        "MilkDue": float(max(bals["Milk"], Decimal("0"))),
                        "VeenaPusaDue": float(max(bals["VeenaPusa"], Decimal("0"))),
                        "TotalDue": float(due)
                    })
            due_customers.sort(key=lambda x: x["TotalDue"], reverse=True)

            pay_rows = conn.execute(text("""
                SELECT p.payment_id, p.customer_id, c.customer_code, c.customer_name, c.reference_name,
                       p.payment_mode, p.total_paid, p.notes
                FROM customer_payments p INNER JOIN customers c ON p.customer_id = c.customer_id
                WHERE p.payment_date = :td ORDER BY p.payment_id DESC
            """), {"td": target_date}).fetchall()

            pay_audits = conn.execute(text("SELECT actor_role, details, created_at FROM audit_logs WHERE module_name = 'Payments' ORDER BY log_id DESC LIMIT 200")).fetchall()

        actor_lookup = {}
        for a in pay_audits:
            try:
                d = json.loads(a.details or "{}")
                k = (int(d.get("CustomerID")), round(float(d.get("TotalAmount", 0)), 2))
                if k not in actor_lookup:
                    actor_lookup[k] = {"UpdatedBy": a.actor_role, "UpdatedAt": a.created_at}
            except Exception:
                pass

        today_payments = []
        for r in pay_rows:
            paid = round(float(r.total_paid or 0), 2)
            info = actor_lookup.get((r.customer_id, paid), {"UpdatedBy": "User", "UpdatedAt": ""})
            today_payments.append({
                "PaymentID": r.payment_id, "CustomerCode": r.customer_code,
                "CustomerName": r.customer_name, "ReferenceName": r.reference_name or "",
                "DisplayName": best_name(r.customer_name, r.reference_name),
                "PaymentMode": r.payment_mode, "TotalPaid": paid,
                "UpdatedBy": info["UpdatedBy"], "UpdatedAt": info["UpdatedAt"]
            })

        return {
            "DateFormatted": date_prefix, "MorningMilkLiters": m_litres, "MorningDeliveredCount": m_cnt,
            "EveningMilkLiters": e_litres, "EveningDeliveredCount": e_cnt,
            "DueCustomerCount": len(due_customers), "TotalDueAmount": float(total_due),
            "DueCustomers": due_customers, "TodayPaymentCount": len(today_payments),
            "TodayCollectedAmount": sum(p["TotalPaid"] for p in today_payments), "TodayPayments": today_payments
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import Response
import io, re
from gtts import gTTS

def _english_word_to_telugu(word: str) -> str:
    w = word.lower()
    if not re.fullmatch(r"[a-z]+", w):
        return word

    common_names = {
        "manjula": "మంజుల", "vidya": "విద్య", "anitha": "అనిత", "koti": "కోటి",
        "rajani": "రజని", "imran": "ఇమ్రాన్", "khan": "ఖాన్", "ayesha": "ఆయేషా",
        "siva": "శివ", "parvathi": "పార్వతి", "madhu": "మధు", "sudheer": "సుధీర్",
        "admin": "అడ్మిన్", "cash": "క్యాష్", "upi": "యూపీఐ", "syed": "సయ్యద్",
        "zareena": "జరీనా", "ravi": "రవి", "kumar": "కుమార్", "lakshmi": "లక్ష్మి",
        "devi": "దేవి", "reddy": "రెడ్డి", "rao": "రావు", "naidu": "నాయుడు",
        "babu": "బాబు", "ramu": "రాము", "srinu": "శ్రీను", "venkat": "వెంకట్"
    }
    if w in common_names:
        return common_names[w]

    # Rule-based English-to-Telugu phonetic syllabifier for any remaining names
    consonants = [
        ("ksh", "క్ష"), ("sh", "ష"), ("ch", "చ"), ("th", "త"), ("dh", "ద"),
        ("bh", "భ"), ("ph", "ఫ"), ("gh", "ఘ"), ("kh", "ఖ"), ("jh", "ఝ"),
        ("ng", "ంగ"), ("nj", "ంజ"), ("k", "క"), ("g", "గ"), ("c", "క"),
        ("j", "జ"), ("t", "ట"), ("d", "డ"), ("n", "న"), ("p", "ప"),
        ("b", "బ"), ("m", "మ"), ("y", "య"), ("r", "ర"), ("l", "ల"),
        ("v", "వ"), ("w", "వ"), ("s", "స"), ("h", "హ"), ("z", "జ"), ("f", "ఫ")
    ]
    matras = [
        ("ee", "ీ"), ("ea", "ీ"), ("oo", "ూ"), ("ai", "ై"), ("au", "ౌ"),
        ("ou", "ౌ"), ("aa", "ా"), ("a", ""), ("i", "ి"), ("e", "ె"),
        ("u", "ు"), ("o", "ొ")
    ]
    indep_vowels = [
        ("ee", "ఈ"), ("oo", "ఊ"), ("ai", "ఐ"), ("au", "ఔ"), ("aa", "ఆ"),
        ("a", "అ"), ("i", "ఇ"), ("e", "ఎ"), ("u", "ఉ"), ("o", "ఒ")
    ]

    out = []
    i = 0
    while i < len(w):
        matched_c = None
        for eng, tel in consonants:
            if w.startswith(eng, i):
                matched_c = (eng, tel)
                break
        if matched_c:
            i += len(matched_c[0])
            matched_v = None
            for veng, vtel in matras:
                if w.startswith(veng, i):
                    matched_v = (veng, vtel)
                    break
            if matched_v:
                out.append(matched_c[1] + matched_v[1])
                i += len(matched_v[0])
            else:
                out.append(matched_c[1] + ("్" if i < len(w) else ""))
        else:
            matched_iv = None
            for veng, vtel in indep_vowels:
                if w.startswith(veng, i):
                    matched_iv = (veng, vtel)
                    break
            if matched_iv:
                out.append(matched_iv[1])
                i += len(matched_iv[0])
            else:
                out.append(w[i])
                i += 1
    return "".join(out)

def _prepare_pure_telugu_tts(text: str) -> str:
    # Convert English words/names into Telugu script so gTTS pronounces every word in pure Telugu
    return re.sub(r"[A-Za-z]+", lambda m: _english_word_to_telugu(m.group(0)), text)

@app.get("/tts/telugu")
def tts_telugu(q: str):
    clean_q = (q or "").strip()[:240]
    if not clean_q:
        raise HTTPException(status_code=400, detail="Text is required")
    telugu_text = _prepare_pure_telugu_tts(clean_q)
    try:
        buf = io.BytesIO()
        tts = gTTS(text=telugu_text, lang="te", slow=False)
        tts.write_to_fp(buf)
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Telugu TTS error: {e}")