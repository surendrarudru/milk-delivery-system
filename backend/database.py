import os
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

if os.getenv("RENDER") or os.getenv("DATABASE_URL"):
    pg_url = URL.create(
        drivername="postgresql+psycopg2",
        username="postgres.ypepebjequwuotrpaalk",
        password="Whitu@20002026",
        host="aws-0-ap-south-1" + ".pooler." + "supabase.com",
        port=5432,
        database="postgres",
        query={"sslmode": "require"},
    )
    engine = create_engine(pg_url, pool_size=3, max_overflow=1, pool_pre_ping=True, pool_recycle=300)
else:
    SQL_SERVER_URL = (
        "mssql+pyodbc://localhost\\SQLEXPRESS/MilkDeliveryDB"
        "?driver=ODBC+Driver+17+for+SQL+Server&trusted_connection=yes"
    )
    engine = create_engine(SQL_SERVER_URL)
