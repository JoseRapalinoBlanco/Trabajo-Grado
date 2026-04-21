from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime
from database import get_db
from models import TurbidityData
from schemas import HeatmapResponse, HeatmapPoint, DatesResponse
from typing import Optional, List

router = APIRouter()

@router.get("/available-dates", response_model=DatesResponse)
async def get_available_dates(db: AsyncSession = Depends(get_db)):
    """
    Returns a list of unique days (YYYY-MM-DD) that have turbidity data records.
    """
    stmt = (
        select(func.date(TurbidityData.measurement_date).label("day"))
        .where(TurbidityData.tt_pred.is_not(None))
        .group_by("day")
        .order_by("day")
    )
    result = await db.execute(stmt)
    days = result.scalars().all()
    # Format dates as YYYY-MM-DD strings
    return DatesResponse(dates=[d.strftime("%Y-%m-%d") for d in days])

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap_data(
    start_date: str = Query(..., description="Start date for filter (ISO Format)"),
    end_date: str = Query(..., description="End date for filter (ISO Format)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves points bounded by a date range, extracting standard lon/lat coordinates 
    from PostGIS geom column to hydrate OpenLayers map heatmaps.
    """
    import pandas as pd
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Use PostGIS functions to extract X (longitude) and Y (latitude)
        stmt = (
            select(
                func.ST_X(TurbidityData.geom).label("longitude"),
                func.ST_Y(TurbidityData.geom).label("latitude"),
                TurbidityData.tt_pred.label("turbidity_ntu"),
                TurbidityData.measurement_date.label("date")
            )
            .where(
                and_(
                    TurbidityData.measurement_date >= start_dt,
                    TurbidityData.measurement_date <= end_dt,
                    TurbidityData.tt_pred.is_not(None) # Only return parsed turbidity points
                )
            )
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()

        points = [
            HeatmapPoint(
                longitude=row.longitude,
                latitude=row.latitude,
                turbidity_ntu=row.turbidity_ntu,
                date=row.date
            )
            for row in rows
        ]

        return HeatmapResponse(
            data=points,
            count=len(points)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Performance-optimized heatmap endpoint ---
from fastapi.responses import JSONResponse
import time

# In-memory cache for heatmap data (satellite data is immutable)
_heatmap_cache: dict[str, dict] = {}
_CACHE_TTL = 3600  # 1 hour TTL

@router.get("/heatmap-fast")
async def get_heatmap_data_fast(
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    db: AsyncSession = Depends(get_db)
):
    """
    High-performance heatmap endpoint. Returns compact flat arrays 
    { lons: [...], lats: [...], vals: [...] } for minimal JSON overhead.
    Includes in-memory caching for repeated queries.
    """
    import pandas as pd
    
    cache_key = f"{start_date}_{end_date}"
    
    # Check cache
    if cache_key in _heatmap_cache:
        cached = _heatmap_cache[cache_key]
        if time.time() - cached["ts"] < _CACHE_TTL:
            return JSONResponse(content=cached["data"])
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Only select what we need: lon, lat, turbidity value
        stmt = (
            select(
                func.ST_X(TurbidityData.geom).label("longitude"),
                func.ST_Y(TurbidityData.geom).label("latitude"),
                TurbidityData.tt_pred.label("turbidity_ntu"),
            )
            .where(
                and_(
                    TurbidityData.measurement_date >= start_dt,
                    TurbidityData.measurement_date <= end_dt,
                    TurbidityData.tt_pred.is_not(None)
                )
            )
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()

        # Build compact flat arrays
        lons = [row.longitude for row in rows]
        lats = [row.latitude for row in rows]
        vals = [row.turbidity_ntu for row in rows]

        response_data = {"lons": lons, "lats": lats, "vals": vals, "count": len(lons)}
        
        # Cache the result
        _heatmap_cache[cache_key] = {"data": response_data, "ts": time.time()}
        
        return JSONResponse(content=response_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/timeseries/point")
async def get_timeseries_point(
    lat: float = Query(..., description="Latitude of the point"),
    lon: float = Query(..., description="Longitude of the point"),
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    algorithm: str = Query("SVR", description="Algorithm used"),
    db: AsyncSession = Depends(get_db)
):
    """
    Extracts time series data for a specific point within a 500m radius.
    Groups by day and averages multiple entries if present.
    """
    import pandas as pd
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # ST_DistanceSphere calculates distance in meters. 500 meters radius.
        target_point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
        
        stmt = (
            select(
                func.date(TurbidityData.measurement_date).label("date"),
                func.avg(TurbidityData.tt_pred).label("ntu")
            )
            .where(
                and_(
                    TurbidityData.measurement_date >= start_dt,
                    TurbidityData.measurement_date <= end_dt,
                    TurbidityData.tt_pred.is_not(None),
                    func.ST_DistanceSphere(TurbidityData.geom, target_point) <= 500
                )
            )
            .group_by("date")
            .order_by("date")
        )
        
        result = await db.execute(stmt)
        rows = result.fetchall()
        
        # Format dates as YYYY-MM-DD
        data = [{"date": row.date.strftime("%Y-%m-%d"), "ntu": round(row.ntu, 2)} for row in rows]
        
        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/range-stats")
async def get_analytics_range_stats(
    start_date: str = Query(..., description="Start date (ISO)"),
    end_date: str = Query(..., description="End date (ISO)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Computes scientific-grade statistics for all turbidity data points within a date range.
    Includes Mean, Max, Min, 90th Percentile (P90), and Coefficient of Variation (CV).
    """
    import pandas as pd
    import numpy as np
    
    try:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
            
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        # Extract ntu and date to compute both global stats and daily timeseries
        stmt = select(
            func.date(TurbidityData.measurement_date).label("date"),
            TurbidityData.tt_pred.label("ntu")
        ).where(
            and_(
                TurbidityData.measurement_date >= start_dt,
                TurbidityData.measurement_date <= end_dt,
                TurbidityData.tt_pred.is_not(None)
            )
        )
        result = await db.execute(stmt)
        rows = result.fetchall()

        if not rows:
            return {"empty": True}

        # Load into Pandas DataFrame for ultra-fast aggregation
        df = pd.DataFrame([{"date": r.date, "ntu": r.ntu} for r in rows])
        arr = df['ntu'].values

        mean_val = np.mean(arr)
        max_val = np.max(arr)
        min_val = np.min(arr)
        p90 = np.percentile(arr, 90)
        std_val = np.std(arr)
        cv = (std_val / mean_val * 100) if mean_val > 0 else 0

        # Discretize for UI distribution chart
        low = np.sum(arr <= 4)
        med = np.sum((arr > 4) & (arr <= 10))
        high = np.sum(arr > 10)
        total = len(arr)

        # Compute Daily Timeseries Trend
        df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
        
        # Extract temporal context context for Mín and Máx
        max_idx = df['ntu'].idxmax()
        min_idx = df['ntu'].idxmin()
        max_date = df.loc[max_idx, 'date']
        min_date = df.loc[min_idx, 'date']

        daily_means = df.groupby('date')['ntu'].mean().round(2).reset_index()
        timeseries = daily_means.to_dict(orient='records')

        # Generate Continuous Frequency Distribution for AreaChart (e.g. 20 intervals)
        counts, bin_edges = np.histogram(arr, bins=20)
        frequencies = []
        for i in range(len(counts)):
            frequencies.append({
                "ntu": round(float((bin_edges[i] + bin_edges[i+1]) / 2), 2),
                "count": int(counts[i])
            })

        return {
            "empty": False,
            "mean": float(mean_val),
            "max": float(max_val),
            "max_date": max_date,
            "min": float(min_val),
            "min_date": min_date,
            "p90": float(p90),
            "std": float(std_val),
            "cv": float(cv),
            "variance": float(np.var(arr)),
            "dist": {
                "low": float((low / total) * 100),
                "med": float((med / total) * 100),
                "high": float((high / total) * 100)
            },
            "frequencies": frequencies,
            "timeseries": timeseries,
            "total_points": total
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/comparative-delta")
async def get_analytics_comparative_delta(
    date_a: str = Query(..., description="Base date (ISO format, typically older)"),
    date_b: str = Query(..., description="Contrast date (ISO format, typically newer)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Computes a spatial delta (Date B - Date A) indicating changes in turbidity per pixel.
    Positive values mean turbidity increased, negative means it decreased.
    """
    import pandas as pd
    
    try:
        # Resolve Date A bounds
        dt_A = pd.to_datetime(date_a)
        if dt_A.tzinfo is None: dt_A = dt_A.tz_localize('UTC')
        start_A = dt_A.replace(hour=0, minute=0, second=0)
        end_A = dt_A.replace(hour=23, minute=59, second=59)

        # Resolve Date B bounds
        dt_B = pd.to_datetime(date_b)
        if dt_B.tzinfo is None: dt_B = dt_B.tz_localize('UTC')
        start_B = dt_B.replace(hour=0, minute=0, second=0)
        end_B = dt_B.replace(hour=23, minute=59, second=59)

        async def fetch_points(start_dt, end_dt):
            stmt = select(
                func.ST_X(TurbidityData.geom).label("lon"),
                func.ST_Y(TurbidityData.geom).label("lat"),
                TurbidityData.tt_pred.label("ntu")
            ).where(
                and_(
                    TurbidityData.measurement_date >= start_dt,
                    TurbidityData.measurement_date <= end_dt,
                    TurbidityData.tt_pred.is_not(None)
                )
            )
            res = await db.execute(stmt)
            return res.fetchall()

        # Fetch both asynchronously from DB could be done with asyncio.gather, but sequential is fine for now
        rows_A = await fetch_points(start_A, end_A)
        rows_B = await fetch_points(start_B, end_B)

        if not rows_A or not rows_B:
            return {"empty": True, "detail": "Missing data for one or both dates."}

        # Index Date A by (lat, lon) rounding to 4 decimals (approx 10 meters) to match spatial grids securely
        dict_A = {(round(row.lat, 4), round(row.lon, 4)): row.ntu for row in rows_A}

        lats = []
        lons = []
        deltas = []

        for row_b in rows_B:
            key = (round(row_b.lat, 4), round(row_b.lon, 4))
            if key in dict_A:
                val_A = dict_A[key]
                val_B = row_b.ntu
                lats.append(row_b.lat)
                lons.append(row_b.lon)
                deltas.append(val_B - val_A)

        return {
            "empty": len(deltas) == 0,
            "lats": lats,
            "lons": lons,
            "deltas": deltas,
            "count": len(deltas)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import StreamingResponse
import io

@router.get("/download")
async def download_turbidity_public(
    format: str = "csv",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    import pandas as pd
    """
    Public Export to CSV, JSON, TXT, or XLSX formats.
    """
    query = select(
        TurbidityData.measurement_date,
        func.ST_X(TurbidityData.geom).label('longitude'),
        func.ST_Y(TurbidityData.geom).label('latitude'),
        TurbidityData.rrs_665,
        TurbidityData.tt_pred
    ).order_by(TurbidityData.measurement_date.asc())
    
    if start_date:
        start_dt = pd.to_datetime(start_date)
        if start_dt.tzinfo is None:
            start_dt = start_dt.tz_localize('UTC')
        query = query.where(TurbidityData.measurement_date >= start_dt)
        
    if end_date:
        end_dt = pd.to_datetime(end_date)
        if end_dt.tzinfo is None:
            end_dt = end_dt.tz_localize('UTC')
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
        query = query.where(TurbidityData.measurement_date <= end_dt)
        
    result = await db.execute(query)
    rows = result.all()
    
    data_list = [
        {
            "Date": row.measurement_date.isoformat(),
            "Longitude": row.longitude,
            "Latitude": row.latitude,
            "Rrs_665": row.rrs_665,
            "TT_pred": row.tt_pred
        }
        for row in rows
    ]
    df = pd.DataFrame(data_list)
    
    if format.lower() == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        content = stream.getvalue().encode('utf-8')
        media_type = "text/csv"
        filename = "turbidity_data.csv"
    elif format.lower() == "json":
        stream = io.StringIO()
        df.to_json(stream, orient="records", date_format="iso")
        content = stream.getvalue().encode('utf-8')
        media_type = "application/json"
        filename = "turbidity_data.json"
    elif format.lower() == "txt":
        stream = io.StringIO()
        df.to_csv(stream, index=False, sep='\t')
        content = stream.getvalue().encode('utf-8')
        media_type = "text/plain"
        filename = "turbidity_data.txt"
    elif format.lower() == "xlsx":
        stream = io.BytesIO()
        df.to_excel(stream, index=False)
        content = stream.getvalue()
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "turbidity_data.xlsx"
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'csv', 'json', 'txt', or 'xlsx'")

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

