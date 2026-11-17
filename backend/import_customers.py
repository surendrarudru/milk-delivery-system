import pandas as pd
from sqlalchemy import text
from database import engine

EXCEL_FILE = "customers.xlsx"

# Excel file read
df = pd.read_excel(
    EXCEL_FILE,
    dtype={"Mobile": "string"}
)

# Required columns
required_columns = [
    "S.no",
    "Reference",
    "Customer Name",
    "Mobile",
    "Shift",
    "WhatsApp",
    "Default Qty (L)(also may changes later)"
]

for col in required_columns:
    if col not in df.columns:
        raise ValueError(f"Missing Excel column: {col}")

if len(df) != 59:
    raise ValueError(
        f"Expected 59 customers, but found {len(df)}"
    )


def clean_value(value):
    if pd.isna(value):
        return None

    value = str(value).strip()

    if value == "":
        return None

    return value


def clean_mobile(value):
    value = clean_value(value)

    if value is None:
        return None

    if value.endswith(".0"):
        value = value[:-2]

    return value


def clean_whatsapp(value):
    value = clean_value(value)

    if value is None:
        return None

    value = value.upper()

    if value in ["Y", "YES", "TRUE", "1"]:
        return 1

    if value in ["N", "NO", "FALSE", "0"]:
        return 0

    raise ValueError(f"Unexpected WhatsApp value: {value}")


def parse_shift(value):
    value = clean_value(value)

    if value is None:
        raise ValueError("Customer has no Shift value")

    value = value.lower().replace(" ", "")

    morning = "morning" in value
    evening = "evening" in value

    if not morning and not evening:
        raise ValueError(f"Invalid Shift value: {value}")

    return morning, evening


# Prepare all records before database insertion
customers = []
routes = []

for _, row in df.iterrows():

    serial = int(row["S.no"])

    reference = clean_value(row["Reference"])
    customer_name = clean_value(row["Customer Name"])

    # Use Reference temporarily if Customer Name is missing
    if customer_name is None:
        customer_name = reference

    if customer_name is None:
        raise ValueError(
            f"Customer name and reference both missing at S.no {serial}"
        )

    mobile = clean_mobile(row["Mobile"])
    whatsapp = clean_whatsapp(row["WhatsApp"])

    quantity = row[
        "Default Qty (L)(also may changes later)"
    ]

    if pd.isna(quantity):
        quantity = None
    else:
        quantity = float(quantity)

        if quantity < 0:
            raise ValueError(
                f"Invalid quantity at S.no {serial}"
            )

    morning, evening = parse_shift(row["Shift"])

    customer_code = f"CUST{serial:03d}"

    customers.append({
        "CustomerCode": customer_code,
        "CustomerName": customer_name,
        "ReferenceName": reference,
        "MobileNumber": mobile,
        "MilkRate": 100,
        "VennaPusaRate": 1000,
        "MorningDelivery": morning,
        "EveningDelivery": evening,
        "WhatsAppAvailable": whatsapp,
        "DefaultMilkQuantity": quantity
    })

    if morning:
        routes.append({
            "CustomerCode": customer_code,
            "Session": "Morning",
            "RouteOrder": serial
        })

    if evening:
        routes.append({
            "CustomerCode": customer_code,
            "Session": "Evening",
            "RouteOrder": serial
        })


# Verify prepared data
morning_count = sum(
    1 for r in routes if r["Session"] == "Morning"
)

evening_count = sum(
    1 for r in routes if r["Session"] == "Evening"
)

print("Excel validation successful.")
print("Customers:", len(customers))
print("Morning routes:", morning_count)
print("Evening routes:", evening_count)

# Insert into SQL Server in one transaction
with engine.begin() as connection:

    customer_count = connection.execute(
        text("SELECT COUNT(*) FROM Customers")
    ).scalar_one()

    route_count = connection.execute(
        text("SELECT COUNT(*) FROM CustomerRoutes")
    ).scalar_one()

    if customer_count != 0 or route_count != 0:
        raise Exception(
            "Database is not empty. Import cancelled."
        )

    for customer in customers:

        connection.execute(
            text("""
                INSERT INTO Customers
                (
                    CustomerCode,
                    CustomerName,
                    ReferenceName,
                    MobileNumber,
                    MilkRate,
                    VennaPusaRate,
                    MorningDelivery,
                    EveningDelivery,
                    WhatsAppAvailable,
                    DefaultMilkQuantity
                )
                VALUES
                (
                    :CustomerCode,
                    :CustomerName,
                    :ReferenceName,
                    :MobileNumber,
                    :MilkRate,
                    :VennaPusaRate,
                    :MorningDelivery,
                    :EveningDelivery,
                    :WhatsAppAvailable,
                    :DefaultMilkQuantity
                )
            """),
            customer
        )

    for route in routes:

        connection.execute(
            text("""
                INSERT INTO CustomerRoutes
                (
                    CustomerID,
                    Session,
                    RouteOrder
                )
                SELECT
                    CustomerID,
                    :Session,
                    :RouteOrder
                FROM Customers
                WHERE CustomerCode = :CustomerCode
            """),
            route
        )

print("\nIMPORT COMPLETED SUCCESSFULLY!")
print("Total Customers:", len(customers))
print("Morning Routes:", morning_count)
print("Evening Routes:", evening_count)