import pyodbc
import psycopg2

SQL_SERVER_CONN = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=MilkDeliveryDB;"
    "Trusted_Connection=yes;"
)

def get_supabase_conn():
    sb_host = "aws-0-ap-south-1" + ".pooler." + "supabase.com"
    return psycopg2.connect(
        host=sb_host,
        port=5432,
        dbname="postgres",
        user="postgres.ypepebjequwuotrpaalk",
        password="Whitu@20002026",
        sslmode="require"
    )

def migrate():
    print("Connecting to SQL Server & Supabase...")
    src = pyodbc.connect(SQL_SERVER_CONN)
    dst = get_supabase_conn()
    s_cur = src.cursor()
    d_cur = dst.cursor()

    # 1. Customers
    s_cur.execute("SELECT CustomerID, CustomerCode, CustomerName, ReferenceName, MobileNumber, Address, MilkRate, VennaPusaRate, MorningDelivery, EveningDelivery, WhatsAppAvailable, DefaultMilkQuantity, IsActive FROM Customers")
    cust_rows = s_cur.fetchall()
    for r in cust_rows:
        d_cur.execute("""
            INSERT INTO customers (customer_id, customer_code, customer_name, reference_name, mobile_number, address, milk_rate, venna_pusa_rate, morning_delivery, evening_delivery, whatsapp_available, default_milk_quantity, is_active)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (customer_id) DO UPDATE SET customer_name=EXCLUDED.customer_name, mobile_number=EXCLUDED.mobile_number, default_milk_quantity=EXCLUDED.default_milk_quantity, is_active=EXCLUDED.is_active
        """, tuple(r))

    # 2. Delivery Sessions
    s_cur.execute("SELECT DeliverySessionID, DeliveryDate, Session, SessionStatus FROM DeliverySessions")
    sess_rows = s_cur.fetchall()
    for r in sess_rows:
        d_cur.execute("""
            INSERT INTO delivery_sessions (session_id, delivery_date, session_type, session_status)
            VALUES (%s,%s,%s,%s) ON CONFLICT (session_id) DO NOTHING
        """, (r.DeliverySessionID, r.DeliveryDate, r.Session, r.SessionStatus))

    # 3. Delivery Details
    s_cur.execute("""
        SELECT dd.DeliveryDetailID, dd.DeliverySessionID, dd.CustomerID, ds.DeliveryDate, ds.Session,
               dd.DeliveryStatus, dd.MilkQuantity, dd.MilkRate, dd.VeenaPusaQuantity, dd.VeenaPusaRate, dd.Notes
        FROM DeliveryDetails dd INNER JOIN DeliverySessions ds ON dd.DeliverySessionID = ds.DeliverySessionID
    """)
    det_rows = s_cur.fetchall()
    for r in det_rows:
        d_cur.execute("""
            INSERT INTO delivery_details (detail_id, session_id, customer_id, delivery_date, session_type, delivery_status, milk_quantity, milk_rate, venna_pusa_quantity, venna_pusa_rate, remarks)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (detail_id) DO NOTHING
        """, tuple(r))

    # 4. Monthly Bills
    s_cur.execute("SELECT BillID, CustomerID, BillYear, BillMonth, MilkTotal, VeenaPusaTotal, PreviousOpeningBalance, PreviousMilkBalance, PreviousVeenaPusaBalance, TotalAmountDue, BillStatus FROM MonthlyBills")
    bill_rows = s_cur.fetchall()
    for r in bill_rows:
        d_cur.execute("""
            INSERT INTO monthly_bills (bill_id, customer_id, bill_year, bill_month, milk_total, venna_pusa_total, previous_opening_balance, previous_milk_balance, previous_venna_pusa_balance, total_amount_due, bill_status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (bill_id) DO NOTHING
        """, tuple(r))

    # 5. Payments
    s_cur.execute("SELECT PaymentID, CustomerID, PaymentDate, PaymentMode, TotalAmount, Notes FROM Payments")
    pay_rows = s_cur.fetchall()
    for r in pay_rows:
        d_cur.execute("""
            INSERT INTO customer_payments (payment_id, customer_id, payment_date, payment_mode, total_paid, notes)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (payment_id) DO NOTHING
        """, tuple(r))

    # 6. Customer Ledger
    s_cur.execute("SELECT LedgerID, CustomerID, TransactionDate, AccountType, TransactionType, DebitAmount, CreditAmount, ReferenceID, Description FROM CustomerLedger")
    led_rows = s_cur.fetchall()
    for r in led_rows:
        amt = r.DebitAmount if (r.DebitAmount or 0) > 0 else (r.CreditAmount or 0)
        etype = "DEBIT" if (r.DebitAmount or 0) > 0 else "CREDIT"
        d_cur.execute("""
            INSERT INTO ledger_entries (ledger_id, customer_id, entry_date, category, entry_type, amount, reference_id, description)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (ledger_id) DO NOTHING
        """, (r.LedgerID, r.CustomerID, r.TransactionDate, r.AccountType, etype, amt, r.ReferenceID, r.Description))

    for tbl, col in [("customers", "customer_id"), ("delivery_sessions", "session_id"), ("delivery_details", "detail_id"), ("monthly_bills", "bill_id"), ("customer_payments", "payment_id"), ("ledger_entries", "ledger_id")]:
        d_cur.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', '{col}'), COALESCE((SELECT MAX({col}) FROM {tbl}), 1))")

    dst.commit()
    print(f"✅ Synced: {len(cust_rows)} customers, {len(sess_rows)} sessions, {len(det_rows)} deliveries, {len(bill_rows)} bills, {len(pay_rows)} payments, {len(led_rows)} ledger entries!")
    src.close()
    dst.close()

if __name__ == "__main__":
    migrate()
