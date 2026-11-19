

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