import os
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

if os.getenv("DATABASE_URL") or os.getenv("RENDER"):
    pg_url = URL.create(
        drivername="postgresql+psycopg2",
        username="postgres.ypepebjequwuotrpaalk",
        password=os.getenv("DB_PASSWORD", "Whitu@20002026"),
        host="://supabase.com",
        port=5432,
        database="postgres",
        query={"sslmode": "require"},
    )
    engine = create_engine(pg_url, pool_pre_ping=True)
else:
    SQL_SERVER_URL = (
        "mssql+pyodbc://localhost\\SQLEXPRESS/MilkDeliveryDB"
        "?driver=ODBC+Driver+17+for+SQL+Server&trusted_connection=yes"
    )
    engine = create_engine(SQL_SERVER_URL)
